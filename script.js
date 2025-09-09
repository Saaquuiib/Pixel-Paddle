// ---------- DOM ----------
const gameArea   = document.getElementById("gameArea");
const paddle     = document.getElementById("paddle");
const scoreEl    = document.getElementById("score");
const missedEl   = document.getElementById("missed");
const levelEl    = document.getElementById("level");
const comboEl    = document.getElementById("combo");
const maxMissEl  = document.getElementById("maxMiss");

const startBtn   = document.getElementById("startBtn");
const pauseBtn   = document.getElementById("pauseBtn");
const settingsBtn= document.getElementById("settingsBtn");
const pauseOverlay = document.getElementById("pauseOverlay");

const modal      = document.getElementById("gameOverModal");
const finalScore = document.getElementById("finalScore");
const modalHighScore = document.getElementById("modalHighScore");
const newHighScoreBanner = document.getElementById("newHighScoreBanner");
const restartBtn = document.getElementById("restartBtn");
const closeBtn   = document.getElementById("closeBtn");

const settingsModal = document.getElementById("settingsModal");
const settingsSaveBtn   = document.getElementById("settingsSaveBtn");
const settingsCancelBtn = document.getElementById("settingsCancelBtn");
const volumeSlider = document.getElementById("volume");
const muteToggle   = document.getElementById("muteToggle");
const diffRadios   = [...document.querySelectorAll('input[name="difficulty"]')];

// ---------- Mobile viewport fix ----------
function setVh() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
setVh();
window.addEventListener('resize', setVh);
window.addEventListener('orientationchange', setVh);

function ensureTop() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  window.scrollTo(0, 0);
}

// ---------- Config ----------
let MAX_MISSED = 3;
const BALL_SIZE  = 20;
const PADDLE_H   = 16;
const INITIAL_PADDLE_WIDTH = 100;
const MIN_PADDLE_WIDTH = 40;

// difficulty-tuned at runtime
let BASE_SPEED = 5;
let BASE_SPAWN = 1200;
let SPEED_INC  = 1.0;
let SPAWN_DEC  = 150;
const TICK_MS  = 20;

// ---------- State ----------
let score = 0, missed = 0, level = 1;
let fallSpeed = BASE_SPEED, spawnRate = BASE_SPAWN;
let gameTick = null, spawnTick = null, levelTick = null, paused = false;

// combos
let streak = 0, multiplier = 1;

// High score
let highScore = Number(localStorage.getItem("pixelPaddleHighScore")) || 0;
maxMissEl.textContent = MAX_MISSED;

// ---------- Audio ----------
let audioCtx, masterGain;
let musicTimer = null;
let noiseBuf = null; // reused for hats/snare/clap

const settings = {
  volume: Number(localStorage.getItem("pp_volume") ?? 70),
  muted:  localStorage.getItem("pp_muted") === "1",
  difficulty: localStorage.getItem("pp_diff") || "normal"
};

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = settings.muted ? 0 : (settings.volume/100);
    masterGain.connect(audioCtx.destination);
  }
}
function setVolumeFromSettings(){
  if (masterGain) masterGain.gain.value = settings.muted ? 0 : (settings.volume/100);
}
function rnd(n){ return (Math.random()*2-1)*n; }

/* basic beep (immediate) */
function beep(freq, durMs, type="square", vol=0.25, detune=0){
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type; osc.frequency.value = freq; osc.detune.value = detune;
  gain.gain.value = vol; osc.connect(gain); gain.connect(masterGain);
  const t = audioCtx.currentTime;
  osc.start(t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + durMs/1000);
  osc.stop(t + durMs/1000);
}

/* schedule beep at time (seconds from now) — used by music */
function beepAt(freq, durMs, whenSec, type="square", vol=0.12, detune=0){
  if (!audioCtx) return;
  const t = audioCtx.currentTime + whenSec;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type; osc.frequency.value = freq; osc.detune.value = detune;
  gain.gain.value = vol; osc.connect(gain); gain.connect(masterGain);
  osc.start(t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + durMs/1000);
  osc.stop(t + durMs/1000);
}

/* noise buffer for hats/snare/clap */
function ensureNoiseBuffer(){
  if (noiseBuf || !audioCtx) return;
  noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i=0;i<data.length;i++) data[i] = Math.random()*2-1;
}
function noiseHit(when, duration, type, freq, q, gainLevel){
  ensureNoiseBuffer();
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = audioCtx.createBiquadFilter();
  filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(gainLevel, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  src.connect(filter); filter.connect(g); g.connect(masterGain);
  src.start(when); src.stop(when + duration);
}

/* Drum kit */
function scheduleKick(when){
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const g   = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(120, when);
  osc.frequency.exponentialRampToValueAtTime(45, when + 0.13);
  g.gain.setValueAtTime(0.25, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
  osc.connect(g); g.connect(masterGain);
  osc.start(when); osc.stop(when + 0.15);
}
function scheduleSnare(when){
  noiseHit(when, 0.10, "highpass", 1800, 0.7, 0.18);
  noiseHit(when, 0.10, "bandpass", 3300, 1.2, 0.12);
}
function scheduleHat(when, open=false){
  if (open) noiseHit(when, 0.18, "highpass", 7000, 0.8, 0.08);
  else      noiseHit(when, 0.04, "highpass", 8000, 0.9, 0.06);
}
function scheduleClap(when){
  noiseHit(when,      0.07, "bandpass", 2000, 1.8, 0.12);
  noiseHit(when+0.03, 0.07, "bandpass", 2000, 1.8, 0.08);
}

const sfx = {
  // sound-only catch; particles are spawned with local coords in the catch branch
  catch: ()=> { beep(860+rnd(30), 110, "square", .18); beep(1720+rnd(40), 90, "triangle", .10); },
  miss:  ()=> { beep(200+rnd(10), 220, "sawtooth", .22); },
  over:  ()=> { beep(120, 500, "triangle", .25); },
  level: ()=> { beep(500, 90, "square", .2); setTimeout(()=>beep(700, 90, "square", .2),120); setTimeout(()=>beep(900,120,"square", .22),240); },
  newHS: ()=> { beep(600,180,"square", .22); setTimeout(()=>beep(800,180,"square", .22),140); setTimeout(()=>beep(1000,260,"sine", .22),280); },
  expand:()=> { beep(520,120,"square", .2); setTimeout(()=>beep(780,120,"square", .2),100); },
  slow:  ()=> { beep(300,300,"sine", .18); },
  coin:  ()=> { beep(1000,90,"triangle", .22); },
  life:  ()=> { beep(640,160,"square", .22); },
  bomb:  ()=> { beep(160,180,"sawtooth", .26); },
  pause: ()=> { beep(750,90,"sine", .18); setTimeout(()=>beep(420,120,"sine", .18),90); },
  resume:()=> { beep(420,90,"sine", .18); setTimeout(()=>beep(820,130,"sine", .20),95); }
};

/* ---- GROOVY MUSIC LOOP ----
   132 BPM w/ swing. Four-on-the-floor kick, backbeat snare+clap, 16th hats, open-hat offbeats, simple bassline.
*/
function startMusic(){
  stopMusic();
  if (!audioCtx) return;

  const BPM = 132;
  const beat = 60 / BPM;     // quarter note (s)
  const step = beat / 4;     // 16th note (s)
  const swing = step * 0.12; // small delay on odd steps for groove
  let stepIdx = 0;

  musicTimer = setInterval(() => {
    const withinStep = (stepIdx % 2 === 1) ? swing : 0; // swing on off-16ths
    const t = audioCtx.currentTime + 0.035 + withinStep; // tiny scheduling lead
    const pos = stepIdx % 16;

    // KICK: 4-on-the-floor + ghost on 14
    if ([0,4,8,12].includes(pos)) scheduleKick(t);
    if (pos === 14) scheduleKick(t); // ghost

    // SNARE: backbeat (2 & 4) with a clap layer on 12
    if (pos === 4 || pos === 12) scheduleSnare(t);
    if (pos === 12) scheduleClap(t + 0.01);

    // HATS: closed every 16th, open on 7 & 15
    const open = (pos === 7 || pos === 15);
    scheduleHat(t, open);

    // BASS: 8-step pattern on even steps (eighth notes)
    const bassNotes = [65, 49, 58, 49, 65, 78, 98, 58]; // C2, G1, Bb1...
    if (pos % 2 === 0) {
      const n = bassNotes[(pos/2) % bassNotes.length];
      beepAt(n, step*800, 0, "square", .08, rnd(5)); // short pluck
    }

    stepIdx++;
  }, step * 1000);
}
function stopMusic(){ if (musicTimer){ clearInterval(musicTimer); musicTimer = null; } }

// ---------- Controls ----------
function movePaddle(clientX) {
  const rect = gameArea.getBoundingClientRect();
  let x = clientX - rect.left - paddle.offsetWidth / 2;
  x = Math.max(0, Math.min(x, gameArea.clientWidth - paddle.offsetWidth));
  paddle.style.left = x + "px";
}
document.addEventListener("mousemove", (e) => !paused && movePaddle(e.clientX));
gameArea.addEventListener("touchmove", (e) => {
  if (e.touches[0]) { !paused && movePaddle(e.touches[0].clientX); e.preventDefault(); }
}, { passive: false });

startBtn.addEventListener("click", () => { initAudio(); applySettingsToUI(); startGame(); });
pauseBtn.addEventListener("click", togglePause);
settingsBtn.addEventListener("click", openSettings);

// Esc to pause/resume
document.addEventListener("keydown", (e)=>{
  if (e.key === "Escape") togglePause();
});

restartBtn.addEventListener("click", () => { hideModal(); startGame(); });
closeBtn.addEventListener("click", () => { hideModal(); resetUIOnly(); });

// ---------- Settings ----------
function openSettings(){
  volumeSlider.value = settings.volume;
  muteToggle.checked = settings.muted;
  diffRadios.forEach(r => r.checked = (r.value === settings.difficulty));
  settingsModal.classList.add("open");
}
settingsCancelBtn.addEventListener("click", ()=>settingsModal.classList.remove("open"));
settingsSaveBtn.addEventListener("click", ()=>{
  settings.volume = Number(volumeSlider.value);
  settings.muted  = muteToggle.checked;
  const chosen = diffRadios.find(r=>r.checked);
  if (chosen) settings.difficulty = chosen.value;
  localStorage.setItem("pp_volume", String(settings.volume));
  localStorage.setItem("pp_muted", settings.muted ? "1":"0");
  localStorage.setItem("pp_diff", settings.difficulty);
  setVolumeFromSettings();
  settingsModal.classList.remove("open");
});

function applySettingsToUI(){
  if (settings.difficulty === "easy"){
    BASE_SPEED = 4; BASE_SPAWN = 1400; SPEED_INC = 0.8; SPAWN_DEC = 120;
  } else if (settings.difficulty === "hard"){
    BASE_SPEED = 6; BASE_SPAWN = 1000; SPEED_INC = 1.2; SPAWN_DEC = 180;
  } else {
    BASE_SPEED = 5; BASE_SPAWN = 1200; SPEED_INC = 1.0; SPAWN_DEC = 150;
  }
  setVolumeFromSettings();
}

// ---------- Lifecycle ----------
function startGame() {
  ensureTop();
  applySettingsToUI();
  resetGameState();

  startBtn.textContent = "Game Running…";
  startBtn.disabled = true;
  pauseBtn.disabled = false;

  document.body.style.cursor = "none";
  document.body.classList.add("noscroll");   // lock scroll on mobile
  document.body.classList.add("playing");

  paused = false;
  pauseOverlay.classList.remove("show");

  spawnTick = setInterval(spawnEntity, spawnRate);
  gameTick  = setInterval(step, TICK_MS);
  levelTick = setInterval(levelUp, 20000);

  startMusic();
}

function resetGameState() {
  score = 0; missed = 0; level = 1; streak = 0; multiplier = 1;
  fallSpeed = BASE_SPEED; spawnRate = BASE_SPAWN;
  scoreEl.textContent = score; missedEl.textContent = missed;
  levelEl.textContent = level; comboEl.textContent = "x1";
  paddle.style.width = INITIAL_PADDLE_WIDTH + "px";
  [...gameArea.querySelectorAll(".ball, .powerup, .hazard, .particle")].forEach(n => n.remove());
}

function resetUIOnly() {
  startBtn.textContent = "Start Game";
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  pauseBtn.textContent = "Pause";

  document.body.style.cursor = "default";
  document.body.classList.remove("noscroll");
  document.body.classList.remove("playing");
  stopMusic();
}

function endGame() {
  clearInterval(spawnTick); clearInterval(gameTick); clearInterval(levelTick);

  if (score > highScore) {
    highScore = score;
    localStorage.setItem("pixelPaddleHighScore", String(highScore));
    newHighScoreBanner.style.display = "block";
    launchConfetti(); sfx.newHS();
  } else {
    newHighScoreBanner.style.display = "none";
  }

  finalScore.textContent = score;
  modalHighScore.textContent = highScore;
  sfx.over(); showModal();

  document.body.style.cursor = "default";
  document.body.classList.remove("noscroll");
  document.body.classList.remove("playing");
  stopMusic();

  ensureTop(); // keep header visible after game ends
}

function showModal(){ modal.classList.add("open"); }
function hideModal(){ modal.classList.remove("open"); }

function togglePause(){
  if (startBtn.disabled === false) return; // game not running
  paused = !paused;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
  pauseOverlay.classList.toggle("show", paused);

  if (paused){
    clearInterval(spawnTick); clearInterval(gameTick); clearInterval(levelTick);
    sfx.pause();
    stopMusic();
  } else {
    spawnTick = setInterval(spawnEntity, spawnRate);
    gameTick  = setInterval(step, TICK_MS);
    levelTick = setInterval(levelUp, 20000);
    sfx.resume();
    startMusic();
  }
}

// ---------- Spawning ----------
function spawnEntity() {
  const r = Math.random();
  if (r < 0.07) { spawnPowerUp(); return; }      // 7% power-up
  if (r < 0.12) { spawnHazard();  return; }      // 5% hazard
  spawnBall();
}
function spawnBall() {
  const ball = document.createElement("div");
  ball.className = "ball";
  const x = Math.random() * (gameArea.clientWidth - BALL_SIZE);
  ball.style.left = x + "px";
  ball.style.top  = "0px";
  gameArea.appendChild(ball);
}
function spawnPowerUp() {
  const types = ["expand","slow","coin","life"];
  const type = types[Math.floor(Math.random() * types.length)];
  const pu = document.createElement("div");
  pu.className = "powerup " + type;
  const x = Math.random() * (gameArea.clientWidth - 20);
  pu.style.left = x + "px";
  pu.style.top  = "0px";
  gameArea.appendChild(pu);
}
function spawnHazard() {
  const hz = document.createElement("div");
  hz.className = "hazard bomb";
  const x = Math.random() * (gameArea.clientWidth - 22);
  hz.style.left = x + "px";
  hz.style.top  = "0px";
  gameArea.appendChild(hz);
}

// ---------- Game loop ----------
function step() {
  if (paused) return;

  const catchLineY = gameArea.clientHeight - PADDLE_H - BALL_SIZE;

  // Balls
  [...gameArea.querySelectorAll(".ball")].forEach(ball => {
    const y = parseInt(ball.style.top, 10) || 0;
    const ny = y + fallSpeed;
    ball.style.top = ny + "px";

    if (ny >= catchLineY) {
      const ballRect = ball.getBoundingClientRect();
      const padRect  = paddle.getBoundingClientRect();
      const areaRect = gameArea.getBoundingClientRect();
      const overlaps = ballRect.left < padRect.right && ballRect.right > padRect.left;

      if (overlaps) {
        // Local (relative-to-board) collision point
        const relX = (ballRect.left - areaRect.left) + ballRect.width / 2;
        const relY = (ballRect.top  - areaRect.top)  + ballRect.height / 2;

        // Combo & score
        streak++;
        multiplier = Math.min(5, 1 + Math.floor(streak / 5));
        comboEl.textContent = `x${multiplier}`;
        score += 1 * multiplier; scoreEl.textContent = score;

        // SFX + particles (inside the board)
        sfx.catch();
        spawnParticles(relX, relY, "#e74c3c");
      } else {
        streak = 0; multiplier = 1; comboEl.textContent = "x1";
        missed++; missedEl.textContent = missed; sfx.miss();
        gameArea.classList.add("shake"); setTimeout(()=>gameArea.classList.remove("shake"), 320);
        paddle.classList.add("flash"); setTimeout(()=>paddle.classList.remove("flash"), 180);
        if (missed >= MAX_MISSED) { ball.remove(); endGame(); return; }
      }
      ball.remove();
    }
  });

  // Power-ups
  [...gameArea.querySelectorAll(".powerup")].forEach(pu => {
    const y = parseInt(pu.style.top, 10) || 0;
    const ny = y + fallSpeed;
    pu.style.top = ny + "px";

    if (ny >= catchLineY) {
      const puRect = pu.getBoundingClientRect();
      const padRect= paddle.getBoundingClientRect();
      const overlaps = puRect.left < padRect.right && puRect.right > padRect.left;
      if (overlaps) applyPowerUp(pu.classList[1]);
      pu.remove();
    }
  });

  // Hazards
  [...gameArea.querySelectorAll(".hazard")].forEach(hz => {
    const y = parseInt(hz.style.top, 10) || 0;
    const ny = y + fallSpeed + 1;
    hz.style.top = ny + "px";

    if (ny >= catchLineY) {
      const hzRect = hz.getBoundingClientRect();
      const padRect= paddle.getBoundingClientRect();
      const overlaps = hzRect.left < padRect.right && hzRect.right > padRect.left;
      if (overlaps) {
        sfx.bomb();
        streak = 0; multiplier = 1; comboEl.textContent = "x1";
        missed++; missedEl.textContent = missed;
        gameArea.classList.add("shake"); setTimeout(()=>gameArea.classList.remove("shake"), 320);
        paddle.classList.add("flash"); setTimeout(()=>paddle.classList.remove("flash"), 180);
        if (missed >= MAX_MISSED) { hz.remove(); endGame(); return; }
      }
      hz.remove();
    }
  });
}

// ---------- Power-up effects ----------
function applyPowerUp(type) {
  if (type === "expand") {
    sfx.expand();
    const current = parseInt(paddle.style.width);
    paddle.style.width = Math.min(current * 1.5, INITIAL_PADDLE_WIDTH * 2) + "px";
    setTimeout(() => {
      paddle.style.width = Math.max(MIN_PADDLE_WIDTH, parseInt(paddle.style.width) / 1.5) + "px";
    }, 10000);
  }
  else if (type === "slow") {
    sfx.slow();
    fallSpeed = Math.max(2, fallSpeed / 2);
    setTimeout(() => { fallSpeed = Math.max(2, fallSpeed * 2); }, 5000);
  }
  else if (type === "coin") {
    sfx.coin();
    score += 10 * multiplier; scoreEl.textContent = score;
  }
  else if (type === "life") {
    sfx.life();
    if (missed > 0) { missed--; missedEl.textContent = missed; }
  }
}

// ---------- Level progression ----------
function levelUp() {
  level++; levelEl.textContent = level;

  fallSpeed += SPEED_INC;
  spawnRate = Math.max(400, spawnRate - SPAWN_DEC);
  clearInterval(spawnTick);
  spawnTick = setInterval(spawnEntity, spawnRate);

  const current = parseInt(paddle.style.width);
  paddle.style.width = Math.max(MIN_PADDLE_WIDTH, current - 4) + "px";
  sfx.level();
}

// ---------- Confetti ----------
function launchConfetti() {
  const colors = ["#667eea", "#764ba2", "#33c060"];
  for (let i = 0; i < 70; i++) {
    const c = document.createElement("div");
    c.classList.add("confetti");
    c.style.left = Math.random() * window.innerWidth + "px";
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDuration = (Math.random() * 2 + 2) + "s";
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4000);
  }
}

// ---------- Particles (inside board; reliable every catch) ----------
function spawnParticles(x, y, color){
  const margin = 4;
  const maxX = gameArea.clientWidth  - margin;
  const maxY = gameArea.clientHeight - margin;
  const cx = Math.max(margin, Math.min(maxX, x));
  const cy = Math.max(margin, Math.min(maxY, y));

  for (let i=0;i<10;i++){
    const p = document.createElement("div");
    p.className = "particle";
    p.style.left = (cx - 3) + "px";
    p.style.top  = (cy - 3) + "px";
    p.style.background = color;
    p.style.transform = "translate(0,0)";
    p.style.opacity = "1";
    p.style.transition = "transform .4s ease-out, opacity .4s ease-out";
    p.style.willChange = "transform, opacity";
    gameArea.appendChild(p);

    const dx = (Math.random()*2-1) * 60;
    const dy = -20 + (Math.random()*2-1) * 40;

    requestAnimationFrame(()=>{
      p.style.transform = `translate(${dx}px, ${dy}px)`;
      p.style.opacity = "0";
    });
    setTimeout(()=>p.remove(), 450);
  }
}
