// DOM
const gameArea   = document.getElementById("gameArea");
const paddle     = document.getElementById("paddle");
const scoreEl    = document.getElementById("score");
const missedEl   = document.getElementById("missed");
const levelEl    = document.getElementById("level");
const highScoreEl= document.getElementById("highScore");
const maxMissEl  = document.getElementById("maxMiss");
const startBtn   = document.getElementById("startBtn");

const modal      = document.getElementById("gameOverModal");
const finalScore = document.getElementById("finalScore");
const modalHighScore = document.getElementById("modalHighScore");
const newHighScoreBanner = document.getElementById("newHighScoreBanner");
const restartBtn = document.getElementById("restartBtn");
const closeBtn   = document.getElementById("closeBtn");

// Config
const MAX_MISSED = 3;
const BALL_SIZE  = 20;
const PADDLE_H   = 16;
const INITIAL_PADDLE_WIDTH = 100;
const MIN_PADDLE_WIDTH = BALL_SIZE;

const BASE_SPEED = 5;
const BASE_SPAWN = 1200;
const TICK_MS    = 20;

// State
let score = 0;
let missed = 0;
let level = 1;
let fallSpeed = BASE_SPEED;
let spawnRate = BASE_SPAWN;

let gameTick = null;
let spawnTick = null;
let levelTick = null;

// High Score
let highScore = localStorage.getItem("catchBallHighScore") || 0;
highScoreEl.textContent = highScore;

// Init
maxMissEl.textContent = MAX_MISSED;

// --- Sounds (Web Audio API) ---
function playBeep(freq, duration, type="sine", delay=0) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration/1000);
  osc.stop(ctx.currentTime + delay + duration/1000);
}
function playCatchSound() { playBeep(800, 120, "square"); }
function playMissSound() { playBeep(200, 200, "sawtooth"); }
function playGameOverSound() { playBeep(100, 600, "triangle"); }
function playLevelUpSound() {
  playBeep(500, 100, "sine", 0);
  playBeep(700, 100, "sine", 0.12);
  playBeep(900, 100, "sine", 0.24);
}
function playNewHighScoreSound() {
  playBeep(600, 200, "square", 0);
  playBeep(800, 200, "square", 0.15);
  playBeep(1000, 300, "sine", 0.3);
}

// Paddle movement
function movePaddle(clientX) {
  const rect = gameArea.getBoundingClientRect();
  let x = clientX - rect.left - paddle.offsetWidth / 2;
  x = Math.max(0, Math.min(x, gameArea.clientWidth - paddle.offsetWidth));
  paddle.style.left = x + "px";
}
document.addEventListener("mousemove", (e) => movePaddle(e.clientX));
gameArea.addEventListener("touchmove", (e) => {
  if (e.touches[0]) movePaddle(e.touches[0].clientX);
}, { passive: true });

// Start / Restart
startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", () => { hideModal(); startGame(); });
closeBtn.addEventListener("click", () => { hideModal(); resetUIOnly(); });

function startGame() {
  resetGameState();
  startBtn.textContent = "Game Running…";
  startBtn.disabled = true;
  document.body.style.cursor = "none";

  spawnTick = setInterval(spawnBall, spawnRate);
  gameTick  = setInterval(step, TICK_MS);
  levelTick = setInterval(levelUp, 20000);
}

function resetGameState() {
  score = 0;
  missed = 0;
  level = 1;
  fallSpeed = BASE_SPEED;
  spawnRate = BASE_SPAWN;

  scoreEl.textContent = score;
  missedEl.textContent = missed;
  levelEl.textContent = level;

  paddle.style.width = INITIAL_PADDLE_WIDTH + "px";
  [...gameArea.querySelectorAll(".ball")].forEach(b => b.remove());
}

function resetUIOnly() {
  startBtn.textContent = "Start Game";
  startBtn.disabled = false;
  document.body.style.cursor = "default";
}

function endGame() {
  clearInterval(spawnTick);
  clearInterval(gameTick);
  clearInterval(levelTick);

  let isNewHigh = false;

  if (score > highScore) {
    highScore = score;
    localStorage.setItem("catchBallHighScore", highScore);
    highScoreEl.textContent = highScore;
    isNewHigh = true;
  }

  finalScore.textContent = score;
  modalHighScore.textContent = highScore;

  if (isNewHigh) {
    newHighScoreBanner.style.display = "block";
    launchConfetti();
    playNewHighScoreSound();
  } else {
    newHighScoreBanner.style.display = "none";
  }

  showModal();
  playGameOverSound();
  document.body.style.cursor = "default";
}

function showModal() { modal.classList.add("open"); }
function hideModal() { modal.classList.remove("open"); }

// Spawn balls
function spawnBall() {
  const ball = document.createElement("div");
  ball.className = "ball";
  const x = Math.random() * (gameArea.clientWidth - BALL_SIZE);
  ball.style.left = x + "px";
  ball.style.top  = "0px";
  gameArea.appendChild(ball);
}

// Ball movement
function step() {
  const boardBottomY = gameArea.clientHeight - PADDLE_H - BALL_SIZE;

  [...gameArea.querySelectorAll(".ball")].forEach(ball => {
    const y = parseInt(ball.style.top, 10) || 0;
    const ny = y + fallSpeed;
    ball.style.top = ny + "px";

    if (ny >= boardBottomY) {
      const ballRect = ball.getBoundingClientRect();
      const paddleRect = paddle.getBoundingClientRect();

      const overlaps =
        ballRect.left < paddleRect.right &&
        ballRect.right > paddleRect.left;

      if (overlaps) {
        score++;
        scoreEl.textContent = score;
        playCatchSound();
      } else {
        missed++;
        missedEl.textContent = missed;
        playMissSound();
        if (missed >= MAX_MISSED) {
          ball.remove();
          endGame();
          return;
        }
      }
      ball.remove();
    }
  });
}

// Difficulty progression
function levelUp() {
  level++;
  levelEl.textContent = level;

  fallSpeed += 1;
  spawnRate = Math.max(400, spawnRate - 150);
  clearInterval(spawnTick);
  spawnTick = setInterval(spawnBall, spawnRate);

  // Shrink paddle
  let currentWidth = parseInt(paddle.style.width);
  let newWidth = Math.max(MIN_PADDLE_WIDTH, currentWidth - 10);
  paddle.style.width = newWidth + "px";

  playLevelUpSound();
}

// Confetti
function launchConfetti() {
  const colors = ["#667eea", "#764ba2", "#33c060"];
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement("div");
    confetti.classList.add("confetti");
    confetti.style.left = Math.random() * window.innerWidth + "px";
    confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.animationDuration = (Math.random() * 2 + 2) + "s";
    confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 4000);
  }
}
