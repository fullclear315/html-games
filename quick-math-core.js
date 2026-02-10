'use strict';
// Quick Math — Core (chunk 1)
// Takes over from shell. Reads G.firstTap and continues game.
(function() {
const G = window.G;
const canvas = G.canvas, ctx = G.ctx, FONT = G.FONT;
const fillText = G.fillText, roundRect = G.roundRect;

// ── Constants ──
const TOTAL_ROUNDS = 20, BASE_PTS = 500, TIME_LIMIT = 4000, MAX_LIVES = 3;
const DIFF_MULT = [1, 1.5, 2, 3];
const DIFF_NAMES = ['Easy', 'Medium', 'Hard', 'Expert'];
const BG = G.BG, BG2 = G.BG2, ACC = G.ACC, ACC2 = G.ACC2;
const GOLD = G.GOLD, GREEN = G.GREEN, RED = G.RED, ORANGE = G.ORANGE;
const WHITE = G.WHITE, DIM = G.DIM, BTN_BG = G.BTN_BG, BTN_BORDER = G.BTN_BORDER;
const BTN_CORRECT = '#166534', BTN_WRONG = '#991b1b';
const DIFF_COLORS_MAP = [GREEN, ACC, ORANGE, RED];

const TIER_THRESHOLDS = [
  [1000, 2500], [1200, 2800], [1500, 3200], [1800, 3500]
];

// ── PRNG (from shell) ──
const { mulberry32, hashSeed, randInt, shuffle, newSeed, seedToCode, codeToSeed } = G;
let rng = Math.random;
function seedForRound(r, d) { rng = mulberry32(hashSeed(gameSeed, r, d)); }

// ── Audio ──
let audioCtx = null;
function initAudio() { if (audioCtx) return; try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
function playTone(freq, dur, vol, type) {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, audioCtx.currentTime);
    g.gain.setValueAtTime(vol || 0.12, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (dur || 0.15));
    o.connect(g); g.connect(audioCtx.destination);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    o.start(); o.stop(audioCtx.currentTime + (dur || 0.15));
  } catch (e) {}
}
function playCorrect(stk) { const b = 520 + Math.min(stk, 10) * 30; playTone(b, 0.12, 0.12); setTimeout(() => playTone(b * 1.25, 0.1, 0.10), 60); }
function playWrong() { playTone(200, 0.2, 0.12, 'sawtooth'); setTimeout(() => playTone(160, 0.25, 0.10, 'sawtooth'), 80); }
function playStreak(n) { for (let i = 0; i < Math.min(n, 5); i++) setTimeout(() => playTone(600 + i * 80, 0.06, 0.08), i * 40); }
function playGameOver() { [392, 330, 294, 262].forEach((f, i) => setTimeout(() => playTone(f, 0.35, 0.12, 'triangle'), i * 150)); }
function playWin() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.3, 0.10), i * 120)); }
function playLifeLost() { playTone(250, 0.15, 0.12, 'sawtooth'); setTimeout(() => playTone(200, 0.2, 0.10, 'sawtooth'), 100); setTimeout(() => playTone(150, 0.3, 0.10, 'sawtooth'), 220); }
function playBigScore(pts) {
  if (pts >= 800) { playTone(523, 0.08, 0.06); setTimeout(() => playTone(659, 0.08, 0.06), 30); setTimeout(() => playTone(784, 0.12, 0.08), 60); }
  if (pts >= 1200) setTimeout(() => playTone(1047, 0.15, 0.07), 90);
}
function vib(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

// ── State ──
let state = 'playing';
let round = 0, score = 0, streak = 0, maxStreak = 0, lives = MAX_LIVES;
let results = [];
let equation = G.equation; // from shell
let gameSeed = G.gameSeed;
let urlSeed = G.urlSeed;
let roundStartTime = 0, feedbackTimer = 0, feedbackResult = null;
let shakeX = 0, shakeY = 0;
let floatingTexts = [], milestoneText = '', milestoneAlpha = 0;
let timeBarPct = 1, animFrame = 0, btnRects = [];
let diffLevel = 0, maxDiffLevel = 0, gameStartTime = 0;
let particles = [], rings = [];
let flashAlpha = 0, flashColor = WHITE;
let displayScore = 0, scorePop = 0;

// ── Equation generation (full version with all difficulties) ──
function genEquation() {
  let a, b, answer, op;
  const dl = diffLevel;
  if (dl === 0) {
    if (rng() < 0.6) { answer = randInt(5, 15); a = randInt(2, answer - 2); b = answer - a; op = '+'; }
    else { a = randInt(8, 18); b = randInt(2, a - 2); answer = a - b; op = '-'; }
  } else if (dl === 1) {
    const r = rng();
    if (r < 0.3) { answer = randInt(15, 40); a = randInt(4, answer - 4); b = answer - a; op = '+'; }
    else if (r < 0.6) { a = randInt(18, 45); b = randInt(4, a - 4); answer = a - b; op = '-'; }
    else { a = randInt(3, 9); b = randInt(Math.max(3, Math.ceil(15 / a)), 9); answer = a * b; op = '*'; }
  } else if (dl === 2) {
    const r = rng();
    if (r < 0.2) { answer = randInt(35, 80); a = randInt(10, answer - 10); b = answer - a; op = '+'; }
    else if (r < 0.4) { a = randInt(40, 90); b = randInt(10, a - 10); answer = a - b; op = '-'; }
    else if (r < 0.75) { a = randInt(7, 12); b = randInt(6, 12); answer = a * b; op = '*'; }
    else { b = randInt(4, 9); answer = randInt(4, 12); a = b * answer; op = '/'; }
  } else {
    const r = rng();
    if (r < 0.15) { answer = randInt(60, 150); a = randInt(15, answer - 15); b = answer - a; op = '+'; }
    else if (r < 0.3) { a = randInt(70, 150); b = randInt(15, a - 15); answer = a - b; op = '-'; }
    else if (r < 0.65) { a = randInt(9, 19); b = randInt(7, 15); answer = a * b; op = '*'; }
    else { b = randInt(5, 15); answer = randInt(5, 15); a = b * answer; op = '/'; }
  }
  const opDisplay = { '+': '+', '-': '−', '*': '×', '/': '÷' }[op];
  const pos = dl === 0 ? 2 : (rng() < 0.35 ? randInt(0, 2) : 2);
  let hidden, dp;
  const res = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : answer;
  if (pos === 0) { hidden = a; dp = ['?', opDisplay, b, '=', res]; }
  else if (pos === 1) { hidden = b; dp = [a, opDisplay, '?', '=', res]; }
  else { hidden = res; dp = [a, opDisplay, b, '=', '?']; }
  const display = dp.join(' ');
  let options = [hidden]; const nearby = new Set([hidden]); let att = 0;
  const baseSpread = dl === 0 ? 4 : dl === 1 ? 3 : 2;
  while (options.length < 4 && att < 100) {
    const spread = Math.max(baseSpread, Math.ceil(Math.abs(hidden) * 0.25));
    let wrong = hidden + randInt(-spread, spread);
    if (wrong < 0) wrong = Math.abs(wrong) + randInt(0, 2);
    if (wrong === hidden || nearby.has(wrong)) { att++; continue; }
    nearby.add(wrong); options.push(wrong); att++;
  }
  while (options.length < 4) { const w = hidden + options.length * 2 + 1; options.push(nearby.has(w) ? hidden + options.length * 3 + 7 : w); }
  shuffle(options);
  return { display, answer: hidden, options, correctIdx: options.indexOf(hidden) };
}

// ── Visual feedback ──
function spawnParticles(x, y, count, color, spread, speed) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const vel = (0.5 + Math.random()) * speed;
    particles.push({ x, y, vx: Math.cos(angle) * vel, vy: Math.sin(angle) * vel - 1, alpha: 1, size: 2 + Math.random() * 3, color, gravity: 0.08 + Math.random() * 0.04 });
  }
}
function spawnRing(x, y, color, maxR, width) {
  rings.push({ x, y, r: 0, maxR, alpha: 0.8, color, width: width || 2, speed: maxR / 20 });
}
function spawnScoreFeedback(pts, tier, dl) {
  const W = G.W, H = G.H, u = G.u;
  const cx = W / 2, cy = H * 0.38;
  const intensity = pts / 1500;
  const c = { fast: GOLD, ok: GREEN, slow: ORANGE }[tier] || GREEN;
  spawnParticles(cx, cy, Math.round(4 + intensity * 20), c, 1, 1.5 + intensity * 4);
  if (dl >= 2 && tier === 'fast') spawnParticles(cx, cy, 8, WHITE, 1, (1.5 + intensity * 4) * 0.7);
  spawnRing(cx, cy, c, u * (0.08 + intensity * 0.2), 2 + intensity * 3);
  if (intensity > 0.5) spawnRing(cx, cy, c, u * (0.12 + intensity * 0.15), 1.5);
  if (intensity > 0.8) spawnRing(cx, cy, WHITE, u * 0.2, 1);
  flashColor = c; flashAlpha = Math.min(0.12 + intensity * 0.15, 0.3);
  scorePop = 0.15 + intensity * 0.25;
}

// ── Game flow ──
function startRound() {
  seedForRound(round, diffLevel);
  equation = genEquation();
  rng = Math.random;
  roundStartTime = performance.now();
  if (!gameStartTime) gameStartTime = roundStartTime;
  feedbackResult = null; timeBarPct = 1; state = 'playing';
}

function startGame() {
  round = 0; score = 0; streak = 0; maxStreak = 0; lives = MAX_LIVES;
  results = []; floatingTexts = []; particles = []; rings = [];
  flashAlpha = 0; displayScore = 0; scorePop = 0;
  milestoneText = ''; milestoneAlpha = 0;
  diffLevel = 0; maxDiffLevel = 0; gameStartTime = 0;
  gameSeed = urlSeed !== null ? urlSeed : newSeed();
  startRound();
}

function getTier(ms, dl) {
  const t = TIER_THRESHOLDS[dl !== undefined ? dl : diffLevel];
  return ms < t[0] ? 'fast' : ms < t[1] ? 'ok' : 'slow';
}

function updateDifficulty() {
  const last = results[results.length - 1];
  const prev = diffLevel;
  if (!last.correct) { diffLevel = Math.max(0, diffLevel - 1); }
  else {
    const recent = results.slice(-3);
    if (recent.length >= 3 && recent.every(r => r.correct)) {
      const avgTime = recent.reduce((s, r) => s + r.time, 0) / 3;
      const tt = TIER_THRESHOLDS[diffLevel];
      if (avgTime < tt[0]) diffLevel = Math.min(3, diffLevel + 2);
      else if (avgTime < tt[1]) diffLevel = Math.min(3, diffLevel + 1);
      else diffLevel = Math.max(0, diffLevel - 1);
    }
  }
  if (diffLevel !== prev) {
    if (diffLevel > prev) { if (diffLevel > maxDiffLevel) maxDiffLevel = diffLevel; showMilestone('📈 ' + DIFF_NAMES[diffLevel] + '!'); }
    else showMilestone('📉 ' + DIFF_NAMES[diffLevel]);
  }
}

function handleAnswer(idx) {
  if (state !== 'playing') return;
  const W = G.W, H = G.H, u = G.u;
  const elapsed = performance.now() - roundStartTime;
  const correct = idx === equation.correctIdx;
  let pts = 0;
  const floatY = H * 0.46;
  if (correct) {
    const t = Math.min(elapsed, TIME_LIMIT);
    const tt = TIER_THRESHOLDS[diffLevel];
    let pct;
    if (t <= tt[0]) pct = 1.0 - 0.3 * (t / tt[0]);
    else if (t <= tt[1]) pct = 0.7 - 0.4 * ((t - tt[0]) / (tt[1] - tt[0]));
    else pct = 0.3 - 0.2 * ((t - tt[1]) / (TIME_LIMIT - tt[1]));
    pts = Math.max(Math.round(BASE_PTS * Math.max(pct, 0.1) * DIFF_MULT[diffLevel]), 50);
    score += pts; streak++;
    if (streak > maxStreak) maxStreak = streak;
    playCorrect(streak); vib(12);
    if (streak === 5) { showMilestone('🔥 5 Streak!'); playStreak(5); vib([15, 30, 15]); }
    else if (streak === 10) { showMilestone('⚡ 10 Streak!'); playStreak(10); vib([15, 20, 15, 20, 25]); }
    else if (streak === 15) { showMilestone('💎 15 Streak!'); playStreak(15); vib([15, 15, 15, 15, 15, 15, 25]); }
    else if (streak === 20) { showMilestone('👑 PERFECT!'); playStreak(20); vib([20, 20, 20, 20, 30]); }
    const tier = getTier(elapsed);
    const labels = { fast: 'BLAZING!', ok: 'GOOD', slow: 'Slow...' };
    const colors = { fast: GOLD, ok: GREEN, slow: ORANGE };
    floatingTexts.push({ text: '+' + pts, color: colors[tier], x: W / 2, y: floatY, alpha: 1, vy: -2.5, size: 0.07, scale: 1.4 });
    floatingTexts.push({ text: labels[tier], color: colors[tier], x: W / 2, y: floatY - u * 0.08, alpha: 1, vy: -3, size: 0.05 });
    if (diffLevel >= 2) floatingTexts.push({ text: DIFF_MULT[diffLevel] + '×', color: colors[tier], x: W / 2 + u * 0.14, y: floatY, alpha: 1, vy: -2.5, size: 0.04, scale: 1.3 });
    spawnScoreFeedback(pts, tier, diffLevel);
    playBigScore(pts);
    results.push({ correct: true, time: elapsed, pts, diff: diffLevel, tier });
  } else {
    streak = 0; lives--;
    playLifeLost(); vib([30, 50, 40]); shakeX = 10;
    floatingTexts.push({ text: '✕', color: RED, x: W / 2, y: floatY, alpha: 1, vy: -2, size: 0.09 });
    if (lives > 0) floatingTexts.push({ text: lives + ' left', color: RED, x: W / 2, y: floatY - u * 0.09, alpha: 1, vy: -2.5, size: 0.04 });
    else floatingTexts.push({ text: 'GAME OVER', color: RED, x: W / 2, y: floatY - u * 0.09, alpha: 1, vy: -2.5, size: 0.055 });
    results.push({ correct: false, time: elapsed, pts: 0, diff: diffLevel, tier: 'miss' });
  }
  feedbackResult = { correct, chosenIdx: idx, time: elapsed, pts };
  updateDifficulty();
  if (milestoneAlpha <= 0 && round === Math.floor(TOTAL_ROUNDS / 2) - 1 && lives > 0) showMilestone('Halfway!');
  state = 'feedback'; feedbackTimer = performance.now();
}

function handleTimeout() {
  const W = G.W, H = G.H;
  streak = 0; lives--;
  playLifeLost(); vib([30, 50, 40]); shakeX = 8;
  const floatY = H * 0.46;
  floatingTexts.push({ text: '✕ TIME', color: RED, x: W / 2, y: floatY, alpha: 1, vy: -2, size: 0.08 });
  if (lives > 0) floatingTexts.push({ text: lives + ' left', color: RED, x: W / 2, y: floatY - u * 0.09, alpha: 1, vy: -2.5, size: 0.04 });
  else floatingTexts.push({ text: 'GAME OVER', color: RED, x: W / 2, y: floatY - u * 0.09, alpha: 1, vy: -2.5, size: 0.055 });
  feedbackResult = { correct: false, chosenIdx: -1, time: TIME_LIMIT, pts: 0 };
  results.push({ correct: false, time: TIME_LIMIT, pts: 0, diff: diffLevel, tier: 'miss' });
  updateDifficulty();
  state = 'feedback'; feedbackTimer = performance.now();
}

function endGame() {
  displayScore = score;
  const elapsed = gameStartTime ? (performance.now() - gameStartTime) / 1000 : 0;
  if (lives <= 0) playGameOver(); else playWin();
  vib([30, 40, 30, 40, 60]); state = 'gameover';
  window.dispatchEvent(new CustomEvent('gameComplete', { detail: { score, maxScore: null, duration: Math.round(elapsed), won: lives > 0 } }));
}

function showMilestone(text) { milestoneText = text; milestoneAlpha = 1; }

// ── Grading ──
function getGrade(s) {
  if (s >= 22000) return '🧠 Big Brain'; if (s >= 18000) return '⚡ Lightning';
  if (s >= 15000) return '🔥 On Fire'; if (s >= 12500) return '💪 Beast Mode';
  if (s >= 10500) return '🎯 Sharp'; if (s >= 8500) return '✅ Solid';
  if (s >= 7000) return '👍 Not Bad'; if (s >= 5500) return '😅 Warming Up';
  if (s >= 4000) return '🐌 Sleepy'; if (s >= 3000) return '🫠 Melting';
  if (s >= 2000) return '💀 Rough'; if (s >= 1200) return '🪦 RIP';
  if (s >= 600) return '🥔 Potato'; return '🫥 AFK';
}
function gradeColor(g) {
  if (g.includes('Brain') || g.includes('Lightning')) return GOLD;
  if (g.includes('Fire') || g.includes('Beast')) return GREEN;
  if (g.includes('Sharp') || g.includes('Solid')) return ACC;
  if (g.includes('Not Bad') || g.includes('Warming')) return ORANGE;
  return RED;
}

// ── Dot rendering ──
function drawDiamond(x, y, r) {
  ctx.beginPath(); ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r * 1.3); ctx.lineTo(x - r, y); ctx.closePath();
}
function drawCross(x, y, r) {
  const t = r * 0.35;
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
  ctx.fillRect(-t, -r, t * 2, r * 2); ctx.fillRect(-r, -t, r * 2, t * 2);
  ctx.restore();
}
function drawResultDot(x, y, r, tier) {
  if (tier === 'fast') {
    ctx.fillStyle = GOLD; drawDiamond(x, y, r * 1.15); ctx.fill();
    ctx.fillStyle = 'rgba(255,217,61,0.3)'; drawDiamond(x, y, r * 1.6); ctx.fill();
  } else if (tier === 'ok') { ctx.fillStyle = GREEN; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  else if (tier === 'slow') { ctx.fillStyle = ORANGE; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  else if (tier === 'miss') { ctx.fillStyle = RED; drawCross(x, y, r * 1.2); }
  else { ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
}

// ── Drawing ──
function drawPlaying() {
  const W = G.W, H = G.H, u = G.u;
  const cx = W / 2, safePad = u * 0.035;
  const now = performance.now(), elapsed = now - roundStartTime;
  timeBarPct = Math.max(0, 1 - elapsed / TIME_LIMIT);

  const dockH = u * 0.09, dockY = H - dockH;
  ctx.fillStyle = '#0d0818'; ctx.fillRect(0, dockY, W, dockH);
  ctx.fillStyle = '#2a1a40'; ctx.fillRect(safePad, dockY, W - safePad * 2, 1);

  const scoreFS = u * 0.048, sp = 1 + scorePop, scoreY = dockY + dockH / 2;
  const scoreStr = Math.round(displayScore).toString();
  const scoreTextW = scoreStr.length * scoreFS * 0.6;
  ctx.save(); ctx.translate(safePad + u * 0.02, scoreY);
  if (sp > 1.01) ctx.scale(sp, sp);
  fillText(scoreStr, 0, 0, scoreFS, ACC, 'left', '800');
  ctx.restore();
  fillText('pts', safePad + u * 0.02 + scoreTextW + u * 0.01, scoreY, u * 0.032, DIM, 'left', '600');
  if (streak > 1) fillText('🔥' + streak, W - safePad - u * 0.02, scoreY, u * 0.04, GOLD, 'right', '700');

  let y = safePad + u * 0.02;
  fillText(`${round + 1}/${TOTAL_ROUNDS}`, cx, y, u * 0.038, DIM);

  const hs = u * 0.02;
  for (let i = 0; i < MAX_LIVES; i++) {
    const hx = W - safePad - (MAX_LIVES - i) * (hs * 3.2);
    if (i < lives) {
      ctx.fillStyle = RED; ctx.beginPath();
      ctx.arc(hx - hs * 0.52, y - hs * 0.25, hs * 0.6, Math.PI, 0);
      ctx.arc(hx + hs * 0.52, y - hs * 0.25, hs * 0.6, Math.PI, 0);
      ctx.lineTo(hx, y + hs * 0.95); ctx.closePath(); ctx.fill();
    } else {
      ctx.strokeStyle = '#4a3060'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.arc(hx - hs * 0.52, y - hs * 0.25, hs * 0.6, Math.PI, 0);
      ctx.arc(hx + hs * 0.52, y - hs * 0.25, hs * 0.6, Math.PI, 0);
      ctx.lineTo(hx, y + hs * 0.95); ctx.closePath(); ctx.stroke();
    }
  }
  y += u * 0.04;

  const barW = Math.min(W * 0.85, 400), barH = Math.max(H * 0.01, 4), bx = cx - barW / 2;
  ctx.fillStyle = '#1a1025'; roundRect(bx, y, barW, barH, barH / 2); ctx.fill();
  if (timeBarPct > 0) {
    const tt = TIER_THRESHOLDS[diffLevel];
    const bc = elapsed < tt[0] ? GOLD : elapsed < tt[1] ? GREEN : elapsed < (tt[1] + TIME_LIMIT) / 2 ? ORANGE : RED;
    roundRect(bx, y, barW * timeBarPct, barH, barH / 2); ctx.fillStyle = bc; ctx.fill();
  }
  y += barH + H * 0.015;

  const totalDots = TOTAL_ROUNDS, maxDotsW = Math.min(W * 0.82, 380);
  const dotGap = maxDotsW / totalDots, dotStartX = cx - (totalDots * dotGap) / 2;
  const dotR = Math.max(Math.min(dotGap * 0.3, 4), 2);
  for (let i = 0; i < totalDots; i++) {
    const dx = dotStartX + i * dotGap + dotGap / 2;
    if (i < results.length) drawResultDot(dx, y, dotR, results[i].tier);
    else if (i === results.length) { ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(dx, y, dotR, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.fillStyle = '#3a2855'; ctx.beginPath(); ctx.arc(dx, y, dotR, 0, Math.PI * 2); ctx.fill(); }
  }
  y += u * 0.04;

  const eqFS = u * 0.095, eqY = y + (H * 0.20) / 2;
  fillText(equation.display, cx, eqY, eqFS, WHITE, 'center', '700');
  const diff = DIFF_NAMES[diffLevel], diffCol = DIFF_COLORS_MAP[diffLevel];
  const multTxt = DIFF_MULT[diffLevel] > 1 ? '  ' + DIFF_MULT[diffLevel] + '×' : '';
  fillText(diff + multTxt, cx, eqY - eqFS * 0.8, u * 0.032, diffCol, 'center', '600');

  const btnAreaTop = H * 0.56, btnAreaBottom = dockY - u * 0.03;
  const btnTotalW = Math.min(W * 0.85, 400), btnGapV = u * 0.025;
  const bw = (btnTotalW - btnGapV) / 2;
  const bh = Math.min((btnAreaBottom - btnAreaTop - btnGapV) / 2, u * 0.16);
  const bStartX = cx - btnTotalW / 2, bStartY = btnAreaTop;

  btnRects.length = 0;
  for (let i = 0; i < 4; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const rx = bStartX + col * (bw + btnGapV), ry = bStartY + row * (bh + btnGapV);
    let bg = BTN_BG, border = BTN_BORDER;
    if (state === 'feedback' && feedbackResult) {
      if (i === equation.correctIdx) { bg = BTN_CORRECT; border = GREEN; }
      else if (i === feedbackResult.chosenIdx && !feedbackResult.correct) { bg = BTN_WRONG; border = RED; }
      else ctx.globalAlpha = 0.4;
    }
    roundRect(rx, ry, bw, bh, u * 0.02); ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = border; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
    fillText(equation.options[i].toString(), rx + bw / 2, ry + bh / 2, u * 0.065, WHITE, 'center', '700');
    btnRects.push({ x: rx, y: ry, w: bw, h: bh, idx: i });
  }
}

function drawGameOver() {
  const W = G.W, H = G.H, u = G.u;
  const cx = W / 2, grade = getGrade(score), gc = gradeColor(grade);
  const correct = results.filter(r => r.correct).length;
  const cR = results.filter(r => r.correct);
  const avgTime = cR.length ? Math.round(cR.reduce((s, r) => s + r.time, 0) / cR.length) : 0;
  const topY = Math.max(24, H * 0.05), bottomBtnY = H - u * 0.1 - u * 0.13;
  let y = topY + u * 0.02;
  const gap = Math.min((bottomBtnY - topY) * 0.04, u * 0.038);

  if (lives <= 0) { fillText('ELIMINATED', cx, y + u * 0.02, u * 0.045, RED, 'center', '700'); y += u * 0.06 + gap * 0.5; }

  const gradeFS = grade.length > 10 ? u * 0.06 : grade.length > 6 ? u * 0.075 : u * 0.09;
  fillText(grade, cx, y + gradeFS / 2, gradeFS, gc, 'center', '800'); y += gradeFS + gap;
  fillText(score.toString(), cx, y + u * 0.06, u * 0.14, WHITE, 'center', '800');
  y += u * 0.14 + gap * 0.3;
  fillText('points', cx, y, u * 0.035, DIM); y += u * 0.035 + gap * 0.3;
  fillText('#' + seedToCode(gameSeed), cx, y, u * 0.03, DIM); y += u * 0.03 + gap;

  const stats = [
    { label: 'SOLVED', value: correct.toString(), color: correct >= results.length - 1 ? GREEN : correct >= results.length * 0.7 ? ACC : ORANGE },
    { label: 'AVG TIME', value: avgTime > 0 ? avgTime + 'ms' : '—', color: avgTime < 1000 ? GREEN : avgTime < 2000 ? ACC : ORANGE },
    { label: 'STREAK', value: maxStreak.toString(), color: maxStreak >= 10 ? GOLD : maxStreak >= 5 ? GREEN : ACC },
    { label: 'PEAK DIFF', value: DIFF_NAMES[maxDiffLevel], color: DIFF_COLORS_MAP[maxDiffLevel] },
  ];
  const gridW = Math.min(W * 0.85, 380), colW = gridW / 2, gx = cx - gridW / 2;
  for (let i = 0; i < stats.length; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const sx = gx + col * colW + colW / 2, sy = y + row * (u * 0.09 + gap);
    fillText(stats[i].value, sx, sy, u * 0.055, stats[i].color, 'center', '700');
    fillText(stats[i].label, sx, sy + u * 0.048, u * 0.032, DIM, 'center', '600');
  }
  y += 2 * (u * 0.09 + gap) + gap * 0.5;

  const cnt = results.length, maxDotsW = Math.min(W * 0.82, 380);
  const dg = cnt > 0 ? maxDotsW / cnt : maxDotsW, dsx = cx - (cnt * dg) / 2;
  const dr = Math.max(Math.min(dg * 0.3, 5), 2.5);
  for (let i = 0; i < cnt; i++) drawResultDot(dsx + i * dg + dg / 2, y, dr, results[i].tier);

  const btnW = Math.min(W * 0.38, 180), btnH = u * 0.12, bg2 = u * 0.03;
  const totalBtnW = btnW * 2 + bg2, lx = cx - totalBtnW / 2, by = bottomBtnY;
  roundRect(lx, by, btnW, btnH, btnH / 2); ctx.fillStyle = ACC2; ctx.fill();
  fillText('Play Again', lx + btnW / 2, by + btnH / 2, u * 0.038, WHITE, 'center', '700');
  roundRect(lx + btnW + bg2, by, btnW, btnH, btnH / 2); ctx.fillStyle = BTN_BG; ctx.fill();
  ctx.strokeStyle = BTN_BORDER; ctx.lineWidth = 2; ctx.stroke();
  fillText('Share', lx + btnW + bg2 + btnW / 2, by + btnH / 2, u * 0.038, ACC, 'center', '700');
  btnRects = [
    { x: lx, y: by, w: btnW, h: btnH, action: 'again' },
    { x: lx + btnW + bg2, y: by, w: btnW, h: btnH, action: 'share' }
  ];
}

function shareResults() {
  const grade = getGrade(score);
  const correct = results.filter(r => r.correct).length;
  const cR = results.filter(r => r.correct);
  const avgTime = cR.length ? Math.round(cR.reduce((s, r) => s + r.time, 0) / cR.length) : 0;
  const code = seedToCode(gameSeed);
  const dots = results.map(r => r.tier === 'fast' ? '💎' : r.tier === 'ok' ? '🟢' : r.tier === 'slow' ? '🟠' : '❌').join('');
  const text = `🧮 Quick Math #${code}\n\n${grade} — ${score} pts\n\n⏱ Avg: ${avgTime}ms\n✓ ${correct} solved\n🔥 Streak: ${maxStreak}\n📈 Peak: ${DIFF_NAMES[maxDiffLevel]}\n\n${dots}\n\nBeat me → https://fullclear315.github.io/html-games/quick-math.html?s=${code}`;
  if (navigator.share) { navigator.share({ text }).catch(() => {}); return; }
  try {
    const ta = document.createElement('textarea'); ta.value = text;
    ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0.01;width:1px;height:1px';
    document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy'); document.body.removeChild(ta);
    if (ok) { showMilestone('Copied!'); return; }
  } catch (e) {}
  try { navigator.clipboard.writeText(text).then(() => showMilestone('Copied!')).catch(() => {}); } catch (e) {}
}

// ── Effects rendering ──
function drawFloatingTexts() {
  const u = G.u;
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y += ft.vy; ft.alpha -= 0.016;
    if (ft.scale) ft.scale += (1 - ft.scale) * 0.12;
    if (ft.alpha <= 0) { floatingTexts.splice(i, 1); continue; }
    ctx.globalAlpha = ft.alpha;
    const s = ft.scale || 1, fs = u * (ft.size || 0.045);
    if (s !== 1) { ctx.save(); ctx.translate(ft.x, ft.y); ctx.scale(s, s); fillText(ft.text, 0, 0, fs, ft.color, 'center', '800'); ctx.restore(); }
    else fillText(ft.text, ft.x, ft.y, fs, ft.color, 'center', '700');
    ctx.globalAlpha = 1;
  }
}
function drawMilestone() {
  if (milestoneAlpha <= 0) return;
  const W = G.W, H = G.H, u = G.u;
  const cx = W / 2, my = H * 0.50;
  const mw = Math.min(W * 0.75, 320), mh = u * 0.09;
  ctx.globalAlpha = milestoneAlpha * 0.9;
  roundRect(cx - mw / 2, my - mh / 2, mw, mh, mh / 2);
  ctx.fillStyle = '#0d0818'; ctx.fill();
  ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke();
  ctx.globalAlpha = milestoneAlpha;
  fillText(milestoneText, cx, my, u * 0.042, GOLD, 'center', '700');
  ctx.globalAlpha = 1;
  milestoneAlpha -= 0.014; if (milestoneAlpha < 0) milestoneAlpha = 0;
}
function drawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += p.gravity;
    p.alpha -= 0.02; p.size *= 0.97;
    if (p.alpha <= 0 || p.size < 0.3) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = p.alpha; ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawRings() {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.r += r.speed; r.alpha -= 0.04;
    if (r.alpha <= 0 || r.r > r.maxR) { rings.splice(i, 1); continue; }
    ctx.globalAlpha = r.alpha; ctx.strokeStyle = r.color; ctx.lineWidth = r.width;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function drawFlash() {
  if (flashAlpha <= 0) return;
  const W = G.W, H = G.H;
  ctx.globalAlpha = flashAlpha; ctx.fillStyle = flashColor; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  flashAlpha *= 0.85; if (flashAlpha < 0.005) flashAlpha = 0;
}

// ── Main loop ──
function loop() {
  const W = G.W, H = G.H, VX = G.VX, VY = G.VY;
  animFrame++; G.resize();
  if (Math.abs(shakeX) > 0.5) shakeX *= -0.85; else shakeX = 0;
  shakeY = shakeX * 0.5;

  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.translate(VX + shakeX, VY + shakeY);
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = G.bgGrad; ctx.fillRect(0, 0, W, H * 0.3);

  if (state === 'playing') {
    if (performance.now() - roundStartTime >= TIME_LIMIT) handleTimeout();
    drawPlaying();
  } else if (state === 'feedback') {
    drawPlaying();
    if (performance.now() - feedbackTimer > 600) {
      round++;
      if (lives <= 0 || round >= TOTAL_ROUNDS) endGame();
      else startRound();
    }
  } else if (state === 'gameover') drawGameOver();

  drawFloatingTexts(); drawMilestone();
  drawParticles(); drawRings(); drawFlash();
  if (displayScore < score) {
    displayScore += Math.max(1, Math.ceil((score - displayScore) * 0.15));
    if (displayScore > score) displayScore = score;
  }
  if (scorePop > 0.005) scorePop *= 0.88; else scorePop = 0;
  ctx.restore(); requestAnimationFrame(loop);
}

// ── Input (replaces shell handler) ──
let lastInputTime = 0;
function handleInput(e) {
  const now = performance.now();
  if (now - lastInputTime < 50) return;
  lastInputTime = now; e.preventDefault(); initAudio();
  const t = e.touches ? e.touches[0] : e;
  const rect = canvas.getBoundingClientRect();
  const x = t.clientX - rect.left - G.VX, y = t.clientY - rect.top - G.VY;
  if (state === 'playing') {
    for (const btn of btnRects)
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) { handleAnswer(btn.idx); return; }
  }
  if (state === 'gameover') {
    for (const btn of btnRects)
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        if (btn.action === 'again') startGame(); else if (btn.action === 'share') shareResults(); return;
      }
  }
}

// ── Takeover from shell ──
(function init() {
  // Replace shell input handlers
  if (G.shellHandleInput) {
    canvas.removeEventListener('touchstart', G.shellHandleInput);
    canvas.removeEventListener('mousedown', G.shellHandleInput);
  }
  canvas.addEventListener('touchstart', handleInput, { passive: false });
  canvas.addEventListener('mousedown', handleInput);

  // Process first tap from shell
  initAudio();
  roundStartTime = G.firstTap.time;
  gameStartTime = roundStartTime;
  state = 'playing';
  handleAnswer(G.firstTap.idx);

  // Start main loop
  requestAnimationFrame(loop);
})();
})(); // end core IIFE
