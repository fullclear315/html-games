(function() {
  'use strict';

  // ===== READ FROM SHELL =====
  const _G = window.G;
  const S = _G.S;
  const $ = _G.$;
  const cage = _G.cage;
  const tileContainer = _G.tileContainer;
  const stack = _G.stack;
  const birdWrap = _G.birdWrap;
  const birdSvg = _G.birdSvg;
  const tileElMap = _G.tileElMap;

  // Constants from shell
  const ICONS = _G.ICONS;
  const ICON_COLORS = _G.ICON_COLORS;
  const HGAP = _G.HGAP;
  const VGAP = _G.VGAP;
  const PLANK_H = _G.PLANK_H;
  const PRESS_H = _G.PRESS_H;
  const DEATH_GAP = _G.DEATH_GAP;
  const ROUND_CFG = _G.ROUND_CFG;
  const TOTAL_ROUNDS = _G.TOTAL_ROUNDS;
  const MODIFIERS = _G.MODIFIERS;
  const BIRD_SVGS = _G.BIRD_SVGS;
  const BIRD_VB = _G.BIRD_VB;
  const WALL_W = _G.WALL_W;

  // Shell-provided functions
  const measure = _G.measure;
  const initSpikes = _G.initSpikes;
  const startSpikeGlint = _G.startSpikeGlint;
  const spawnIceBreak = _G.spawnIceBreak;
  const initGrid = _G.initGrid;
  const renderTiles = _G.renderTiles;
  const getTileEl = _G.getTileEl;
  const repositionTile = _G.repositionTile;
  const tileTop = _G.tileTop;
  const tileLeft = _G.tileLeft;
  const containerHeight = _G.containerHeight;
  const sendGameEvent = _G.sendGameEvent;

  // ===== UTILITIES =====
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ===== STACK POSITIONING =====
  function positionStack() {
    const stackH = S.spikeH + PLANK_H + containerHeight() + PRESS_H;
    stack.style.transform = `translateY(${stackH - S.visiblePx + S.stackBounceOffset}px)`;
  }

  function getSpikeBarTopY() {
    return S.cageH - S.visiblePx;
  }

  function getCeilBottom() {
    return S.spikeH + S.ceilOffset * S.cageH / 700;
  }

  function getFreeSpace() {
    return getSpikeBarTopY() - getCeilBottom();
  }

  function getBirdH() {
    return S.cageH * 0.1728 * S.birdScale;
  }

  // ===== BIRD =====
  function updateBird(dt) {
    const free = getFreeSpace();
    const bh = getBirdH();
    const baseBh = S.cageH * 0.1728;
    const ratio = Math.max(0, Math.min(1, 1 - (free - bh * DEATH_GAP) / (baseBh * 3)));

    const margin = free - bh;
    if (S.phase === 'playing' && margin < S.closestCall) S.closestCall = margin;

    let mood = 'calm';
    if (ratio > 0.5) mood = 'worried';
    if (ratio > 0.7) mood = 'frantic';
    if (S.birdMood !== mood && !S.cascading) {
      S.birdMood = mood;
      const hasFlutter = birdWrap.classList.contains('distress-flutter');
      birdWrap.className = mood;
      if (hasFlutter) birdWrap.classList.add('distress-flutter');
    }

    if (mood !== 'frantic' && dt > 0) {
      S._tearTimer -= dt / 1000;
      if (S._tearTimer <= 0) {
        S._tearTimer = 5 + Math.random() * 3;
        const tear = birdSvg.querySelector('.bird-tear');
        if (tear) {
          tear.classList.remove('active');
          void tear.getBBox();
          tear.classList.add('active');
          setTimeout(() => tear.classList.remove('active'), 1700);
        }
      }
      S._flutterTimer -= dt / 1000;
      if (S._flutterTimer <= 0) {
        S._flutterTimer = 6 + Math.random() * 4;
        birdWrap.classList.add('distress-flutter');
        setTimeout(() => birdWrap.classList.remove('distress-flutter'), 650);
      }
    }

    if (S._lastEyeMood !== mood && S.eyeBaseCx !== undefined) {
      S._lastEyeMood = mood;
      const pupil = $('birdPupil');
      const maxD = Math.max(2, (S.eyeWhiteR || 8) - (S.eyePupilR || 5) + 1);
      let dCx = 0, dCy = 0;
      if (mood === 'worried') { dCx = maxD * 0.15; dCy = maxD * 0.55; }
      else if (mood === 'frantic') { dCx = maxD * 0.2; dCy = maxD * 0.9; }
      pupil.setAttribute('cx', S.eyeBaseCx + dCx);
      pupil.setAttribute('cy', S.eyeBaseCy + dCy);
      const pupil2 = $('birdPupil2');
      if (pupil2 && S.eye2BaseCx !== undefined) {
        pupil2.setAttribute('cx', S.eye2BaseCx + dCx);
        pupil2.setAttribute('cy', S.eye2BaseCy + dCy);
      }
    }

    let size = bh;
    let birdW = size * (S.birdAspect || 1);
    const maxBirdW = S.cageW - 32;
    if (birdW > maxBirdW) {
      birdW = maxBirdW;
      size = birdW / (S.birdAspect || 1);
    }
    if (S._lastBirdW !== birdW) {
      birdSvg.style.height = size + 'px';
      birdSvg.style.width = birdW + 'px';
      S._lastBirdW = birdW;
    }

    const overhang = birdW * (1 - (S.bodyFrac || 1));
    const minX = 4 - overhang * 0.5;
    const maxX = Math.max(minX + 20, S.cageW - birdW - 16 + overhang * 0.5);
    const spikeTop = getSpikeBarTopY();
    const ceilBot = getCeilBottom();
    const freeH = Math.max(10, spikeTop - ceilBot - size);

    if (S.birdX === 0) { S.birdX = maxX * 0.3; S.birdDir = -1; }
    if (S.birdY === 0) { S.birdY = ceilBot + freeH * 0.3; S.birdTargetY = S.birdY; }

    const hSpeed = mood === 'frantic' ? 120 : mood === 'worried' ? 80 : 50;
    S.birdX += S.birdDir * hSpeed * (dt / 1000);

    if (S.birdX >= maxX) {
      S.birdX = maxX;
      S.birdDir = -1;
      S.birdTargetY = ceilBot + 4 + Math.random() * Math.max(5, freeH * 0.5);
    } else if (S.birdX <= minX) {
      S.birdX = minX;
      S.birdDir = 1;
      S.birdTargetY = ceilBot + 4 + Math.random() * Math.max(5, freeH * 0.5);
    }

    const panicking = mood === 'frantic';
    if (panicking) {
      S.birdTargetY = ceilBot + free / 2 - bh * 0.5;
    }

    const vSpeed = panicking ? hSpeed * 0.8 : hSpeed * 0.3;
    const vDiff = S.birdTargetY - S.birdY;
    S.birdY += Math.sign(vDiff) * Math.min(Math.abs(vDiff), vSpeed * (dt / 1000));

    const maxY = panicking ? ceilBot + free / 2 - bh * 0.5 + bh * 0.05 : ceilBot + freeH;
    const minY = panicking ? ceilBot + free / 2 - bh * 0.5 - bh * 0.05 : ceilBot + 2;
    if (S.birdY > maxY) S.birdY += (maxY - S.birdY) * 0.15;
    if (S.birdY < minY) S.birdY += (minY - S.birdY) * 0.15;

    const flip = S.birdDir > 0 ? ' scaleX(-1)' : '';
    birdWrap.style.transform = `translate(${S.birdX}px, ${S.birdY}px)${flip}`;
  }

  function birdHop() {
    birdWrap.className = 'hop';
    birdWrap.addEventListener('animationend', () => {
      birdWrap.className = 'exhale';
      birdWrap.addEventListener('animationend', () => {
        birdWrap.className = S.birdMood || 'calm';
      }, { once: true });
    }, { once: true });
  }

  // ===== DANGER OVERLAY =====
  const _dangerEl = $('dangerOverlay');
  let _lastDangerOp = -1, _lastDangerPulse = false;

  function updateDanger() {
    const free = getFreeSpace();
    const bh = getBirdH();
    const baseBh = S.cageH * 0.1728;
    const ratio = Math.max(0, Math.min(1, 1 - (free - bh * DEATH_GAP) / (baseBh * 3)));

    if (ratio > 0.45) {
      const op = Math.min(1, (ratio - 0.45) * 3.6);
      const rounded = Math.round(op * 50) / 50;
      if (rounded !== _lastDangerOp) { _dangerEl.style.opacity = rounded; _lastDangerOp = rounded; }
      const pulse = ratio > 0.7;
      if (pulse !== _lastDangerPulse) { _dangerEl.classList.toggle('pulse', pulse); _lastDangerPulse = pulse; }
    } else if (_lastDangerOp !== 0) {
      _dangerEl.style.opacity = 0;
      _dangerEl.classList.remove('pulse');
      _lastDangerOp = 0;
      _lastDangerPulse = false;
    }
  }

  // ===== MATCH DETECTION & SELECTION =====
  function findCellPos(id) {
    for (let r = 0; r < S.totalRows; r++) {
      for (let c = 0; c < S.cols; c++) {
        const cell = S.grid[r][c];
        if (cell && cell.id === id) return { row: r, col: c, cell };
      }
    }
    return null;
  }

  function tapTile(row, col) {
    if (S.phase !== 'playing') return;
    if (S.rising && !S.cascading && getFreeSpace() < getBirdH() * (DEATH_GAP + 0.02)) return;
    const cell = S.grid[row]?.[col];
    if (!cell) return;

    if (!S.rising) {
      S.rising = true;
      if (!S.ctaDismissed) {
        S.ctaDismissed = true;
        setTimeout(() => $('cta').classList.add('hidden'), 0);
      }
    }

    const el = getTileEl(cell.id);
    if (!el) return;

    if (cell.frozen) {
      cell.frozen = false;
      el.classList.remove('frozen');
      el.classList.add('thawing');
      spawnIceBreak(el);
      SFX.iceBreak();
      setTimeout(() => el.classList.remove('thawing'), 350);
      return;
    }

    const si = S.selected.findIndex(s => s === cell.id);
    if (si >= 0) {
      S.selected.splice(si, 1);
      el.classList.remove('selected');
      el.style.zIndex = S.totalRows - row;
      return;
    }

    if (S.selected.length > 0) {
      const firstPos = findCellPos(S.selected[0]);
      if (firstPos && firstPos.cell.icon !== cell.icon) {
        for (const selId of S.selected) {
          const se = getTileEl(selId);
          if (se) { se.classList.remove('selected'); se.classList.add('mismatch'); se.style.zIndex = S.totalRows - (+se.dataset.row); }
        }
        el.classList.add('mismatch');
        setTimeout(() => {
          tileContainer.querySelectorAll('.mismatch').forEach(e => e.classList.remove('mismatch'));
        }, 400);
        SFX.mismatch();
        S.selected = [];
        return;
      }
    }

    S.selected.push(cell.id);
    el.classList.add('selected');
    el.style.zIndex = 100 + S.totalRows - row;
    SFX.select(S.selected.length);

    if (S.selected.length === 3 && !S.cascading && !S._matchPending) {
      doMatch();
    }
  }

  function doMatch() {
    S._matchPending = true;
    const selIds = [...S.selected];
    S.selected = [];

    const resolved = [];
    for (const id of selIds) {
      const pos = findCellPos(id);
      if (!pos) continue;
      const el = getTileEl(id);
      if (!el) continue;
      resolved.push({ ...pos, el, rect: el.getBoundingClientRect() });
    }

    for (const r of resolved) {
      r.el.classList.add('clearing');
      spawnParticles(r.rect, r.cell.icon);
    }

    SFX.matchClear();
    navigator.vibrate?.(80);

    if (!S.ctaDismissed) {
      S.ctaDismissed = true;
      $('cta').classList.add('hidden');
    }

    for (const r of resolved) {
      S.grid[r.row][r.col] = null;
    }

    setTimeout(() => {
      if (S.phase !== 'playing') return;
      tileContainer.querySelectorAll('.clearing').forEach(el => { tileElMap.delete(+el.dataset.id); el.remove(); });
      S.cascading = true;
      runCascade().then(() => {
        S.cascading = false;
        S._matchPending = false;
        if (S.phase !== 'playing') return;
        if (S.selected.length === 3) {
          doMatch();
          return;
        }
        if (S.grid.every(row => row.every(c => c === null))) {
          roundComplete();
        }
      });
    }, 380);
  }

  // ===== PARTICLES =====
  function spawnParticles(rect, icon) {
    const gameRect = $('game').getBoundingClientRect();
    const cx = rect.left - gameRect.left + rect.width / 2;
    const riseOffset = S.rising ? -(ROUND_CFG[S.round].speed * S.speedMul * S.speedScale * 0.25) : 0;
    const cy = rect.top - gameRect.top + rect.height / 2 + riseOffset;
    const iconIdx = ICONS.indexOf(icon);
    const color = ICON_COLORS[iconIdx >= 0 ? iconIdx : 0];

    const baseR = rect.width * 0.18;
    const sizes = [
      11 + Math.random() * 3, 10 + Math.random() * 3, 10 + Math.random() * 3,
      6 + Math.random() * 3, 6 + Math.random() * 3,
      3 + Math.random() * 2, 3 + Math.random() * 1.5, 2.5 + Math.random() * 1.5,
    ];
    for (let i = 0; i < sizes.length; i++) {
      const angle = (Math.PI * 2 * i) / sizes.length + (Math.random() - 0.5) * 0.7;
      const r = baseR * (0.55 + Math.random() * 0.9);
      const size = sizes[i];
      const half = size / 2;
      const dur = 0.3 + Math.random() * 0.2;
      const delay = Math.random() * 0.04;
      const p = document.createElement('div');
      p.className = 'match-particle';
      p.style.cssText = `left:${cx - half}px;top:${cy - half}px;width:${size}px;height:${size}px;background:${color};border-radius:50%;--px:${Math.cos(angle)*r}px;--py:${Math.sin(angle)*r}px;animation-duration:${dur}s;animation-delay:${delay}s`;
      $('game').appendChild(p);
      p.addEventListener('animationend', () => p.remove(), { once: true });
    }
  }

  function screenFlash() {
    const f = $('screenFlash');
    f.classList.remove('active');
    void f.offsetHeight;
    f.classList.add('active');
    f.addEventListener('animationend', () => f.classList.remove('active'), { once: true });
  }

  // ===== GRAVITY =====
  function applyGravity() {
    let moved = false;
    for (let c = 0; c < S.cols; c++) {
      let writeRow = 0;
      for (let r = 0; r < S.totalRows; r++) {
        if (S.grid[r][c] !== null) {
          if (r !== writeRow) {
            S.grid[writeRow][c] = S.grid[r][c];
            S.grid[r][c] = null;
            moved = true;
          }
          writeRow++;
        }
      }
    }
    return moved;
  }

  async function animateGravity(spikeDropPx, oldRows) {
    for (let r = 0; r < S.totalRows; r++) {
      for (let c = 0; c < S.cols; c++) {
        const cell = S.grid[r][c];
        if (cell) repositionTile(cell, r, c);
      }
    }

    let maxDuration = 0;
    const flips = [];
    for (let r = 0; r < S.totalRows; r++) {
      for (let c = 0; c < S.cols; c++) {
        const cell = S.grid[r][c];
        if (!cell) continue;
        const prevRow = oldRows.get(cell.id);
        if (prevRow === undefined || prevRow === r) continue;
        const el = tileElMap.get(cell.id);
        if (!el) continue;

        const rowDelta = prevRow - r;
        const dy = -(rowDelta) * (S.cellSize + VGAP);
        const absDelta = Math.abs(rowDelta);
        const dur = Math.min(250 + (absDelta - 1) * 100, 500);
        maxDuration = Math.max(maxDuration, dur);

        el.style.transition = 'none';
        el.style.transform = `translateY(${dy}px)`;
        el.style.willChange = 'transform';
        flips.push({ el, dur });
      }
    }
    void tileContainer.offsetHeight;
    for (const f of flips) {
      f.el.style.transition = `transform ${f.dur}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
      f.el.style.transform = 'translateY(0)';
    }

    const spikeBarEl = $('spikeBar');
    if (spikeDropPx > 0) {
      const spikeBarDur = Math.max(300, Math.min(spikeDropPx / 0.4, 800));
      maxDuration = Math.max(maxDuration, spikeBarDur);
      spikeBarEl.style.transition = 'none';
      spikeBarEl.style.transform = 'translateY(0)';
      void spikeBarEl.offsetHeight;
      spikeBarEl.style.transition = `transform ${spikeBarDur}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
      spikeBarEl.style.transform = `translateY(${spikeDropPx}px)`;
    }

    SFX.tileFall();
    if (maxDuration > 0) await sleep(maxDuration + 30);

    for (const f of flips) {
      f.el.style.willChange = 'auto';
      f.el.style.transition = '';
      f.el.style.transform = '';
    }
  }

  function collapseEmptyRows() {
    let removed = 0;
    for (let r = S.totalRows - 1; r >= 0; r--) {
      if (S.grid[r].every(c => c === null)) {
        S.grid.splice(r, 1);
        S.totalRows--;
        removed++;
      }
    }
    return removed;
  }

  async function runCascade() {
    const spikeBarEl = $('spikeBar');
    let currentSpikeBarOffset = 0;

    while (true) {
      if (S.phase !== 'playing') break;
      const oldRows = new Map();
      for (let r = 0; r < S.totalRows; r++) {
        for (let c = 0; c < S.cols; c++) {
          const cell = S.grid[r][c];
          if (cell) oldRows.set(cell.id, r);
        }
      }
      const moved = applyGravity();

      if (moved) {
        let emptyTopRows = 0;
        for (let r = S.totalRows - 1; r >= 0; r--) {
          if (S.grid[r].every(c => c === null)) emptyTopRows++;
          else break;
        }
        const spikeDropPx = emptyTopRows * (S.cellSize + VGAP);

        await animateGravity(spikeDropPx, oldRows);
        currentSpikeBarOffset = spikeDropPx;
      }

      const removed = collapseEmptyRows();
      if (removed > 0) {
        const removedPx = removed * (S.cellSize + VGAP);

        if (S.totalRows === 0) {
          S.rising = false;
          S.stackBounceOffset = 0;
        }

        S.visiblePx -= removedPx;

        const dropPx = removedPx - currentSpikeBarOffset;
        let dropDur = 0;

        spikeBarEl.style.transition = 'none';
        if (dropPx > 1) {
          spikeBarEl.style.transform = `translateY(${-dropPx}px)`;
          void spikeBarEl.offsetHeight;
          dropDur = Math.max(300, Math.min(dropPx / 0.4, 800));
          spikeBarEl.style.transition = `transform ${dropDur}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
          spikeBarEl.style.transform = 'translateY(0)';
        } else {
          spikeBarEl.style.transform = '';
        }
        currentSpikeBarOffset = 0;

        tileContainer.style.height = containerHeight() + 'px';
        for (let r = 0; r < S.totalRows; r++) {
          for (let c = 0; c < S.cols; c++) {
            if (S.grid[r][c]) repositionTile(S.grid[r][c], r, c);
          }
        }

        SFX.rowCollapse();
        if (dropDur > 0) await sleep(dropDur + 30);
        continue;
      }

      if (!moved && removed === 0) break;
    }

    spikeBarEl.style.transition = '';
    spikeBarEl.style.transform = '';
    void cage.offsetHeight;
  }

  // ===== GAME LOOP =====
  function gameLoop(ts) {
    if (!S.lastTs) S.lastTs = ts;
    const dt = Math.min(ts - S.lastTs, 50);
    S.lastTs = ts;

    if (S.phase === 'playing') {
      if (S.rising) {
        const cfg = ROUND_CFG[S.round];
        let speed = cfg.speed * S.speedMul * S.speedScale;

        const free = getFreeSpace();
        const bh = getBirdH();
        if (free < bh * 1.1) speed *= 0.7;
        else if (free < bh * 1.8) speed *= 0.85;
        else if (free > bh * 3.5) speed *= 1.25;

        S.visiblePx += speed * (dt / 1000);
      }

      if (S.stackBounceOffset !== 0) {
        S.stackBounceOffset *= 0.88;
        if (Math.abs(S.stackBounceOffset) < 0.5) S.stackBounceOffset = 0;
      }
      positionStack();

      updateBird(dt);
      updateDanger();

      if (getFreeSpace() < getBirdH() * DEATH_GAP && S.rising && !S.cascading) {
        loseGame();
      }
    }

    requestAnimationFrame(gameLoop);
  }

  // ===== ROUND MANAGEMENT =====
  async function startRound() {
    sendGameEvent('round_start', { round: S.round + 1 });
    S.phase = 'playing';
    S.rising = S.round > 0;
    S.cascading = false;
    S._matchPending = false;
    S.selected = [];
    S.birdMood = 'calm';
    S.lastTs = 0;
    S.birdMoveTimer = 0;
    S.birdX = 0;
    S.birdY = 0;
    S.birdDir = -1;
    S.birdTargetY = 0;
    S.stackBounceOffset = 0;
    S._tearTimer = 5 + Math.random() * 3;
    S._flutterTimer = 6 + Math.random() * 4;
    birdSvg.style.transform = '';

    const birdIdx = Math.min(S.round, BIRD_SVGS.length - 1);
    birdSvg.innerHTML = BIRD_SVGS[birdIdx];
    const tearG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    tearG.setAttribute('class', 'bird-tear');
    tearG.innerHTML = '<path d="M34,48 C33.5,50.5 31.5,52.5 31.5,54 C31.5,55.5 32.6,56.5 34,56.5 C35.4,56.5 36.5,55.5 36.5,54 C36.5,52.5 34.5,50.5 34,48 Z" fill="#7DD3FC"/><ellipse cx="33.2" cy="53.8" rx="1" ry="1.3" fill="#fff" opacity="0.6"/>';
    birdSvg.appendChild(tearG);
    const _tearPupil = birdSvg.querySelector('#birdPupil');
    if (_tearPupil) {
      const dx = (+_tearPupil.getAttribute('cx')) - 34;
      const dy = (+_tearPupil.getAttribute('cy')) - 41;
      if (dx !== 0 || dy !== 0) tearG.setAttribute('transform', `translate(${dx},${dy})`);
    }
    const vbData = BIRD_VB[birdIdx];
    birdSvg.setAttribute('viewBox', vbData.vb);
    S.birdAspect = vbData.aspect;
    S.bodyFrac = vbData.bodyFrac || 1.0;

    const _pupil = $('birdPupil');
    if (_pupil) {
      S.eyeBaseCx = +_pupil.getAttribute('cx');
      S.eyeBaseCy = +_pupil.getAttribute('cy');
      S.eyePupilR = +_pupil.getAttribute('r');
      const _eyeW = _pupil.previousElementSibling;
      if (_eyeW && _eyeW.tagName === 'circle') {
        S.eyeWhiteR = +_eyeW.getAttribute('r');
      }
    }
    const _pupil2 = $('birdPupil2');
    if (_pupil2) {
      S.eye2BaseCx = +_pupil2.getAttribute('cx');
      S.eye2BaseCy = +_pupil2.getAttribute('cy');
    } else {
      S.eye2BaseCx = undefined;
      S.eye2BaseCy = undefined;
    }

    $('roundBadge').textContent = `ROUND ${S.round + 1}/${TOTAL_ROUNDS}`;
    birdWrap.className = 'calm';

    $('cageWallL').style.background = '';
    $('cageWallR').style.background = '';
    cage.style.filter = '';
    $('topPlank').style.opacity = '1';
    $('cageBottom').style.opacity = '1';

    const hasSpeedMod = S.modifiers.some(m => m.name === 'Faster Rise');
    $('spikePlank').style.boxShadow = hasSpeedMod
      ? 'inset 0 1px 0 rgba(255,210,120,0.25),inset 0 -1px 0 rgba(0,0,0,0.35),0 0 12px rgba(249,115,22,0.6)'
      : '';

    const spikeBarUp = $('spikeBarUp');
    if (spikeBarUp) { spikeBarUp.style.transition = ''; spikeBarUp.style.transform = ''; }

    SFX._clearIdx = 0;
    SFX._combo = 0;

    measure();
    initSpikes();
    initGrid();
    renderTiles();

    const scaledCeilOff = Math.round(S.ceilOffset * S.cageH / 700);
    $('ceilingSpikes').style.top = scaledCeilOff + 'px';
    $('topPress').style.height = scaledCeilOff > 0 ? scaledCeilOff + 'px' : '0';

    S.visiblePx = S.cellSize * 1.5 + VGAP + S.spikeH + PLANK_H;
    positionStack();

    startSpikeGlint();

    if (S.round === 0 && !S.ctaDismissed) {
      $('cta').classList.remove('hidden');
    } else {
      $('cta').classList.add('hidden');
    }

    updateBird(0);
    updateDanger();
  }

  // ===== ROUND COMPLETE =====
  async function roundComplete() {
    const debugUsed = !!S._debugWin;
    S._debugWin = false;
    sendGameEvent('round_end', { round: S.round + 1, result: 'win', ...(debugUsed && { debug: true }) });
    S.phase = 'roundEnd';
    S.rising = false;

    await roundCelebration();

    if (S.round >= TOTAL_ROUNDS - 1) {
      await sleep(200);
      winGame();
    } else {
      await sleep(200);
      showWheel();
    }
  }

  async function roundCelebration() {
    const game = $('game');

    _dangerEl.style.opacity = 0;
    _dangerEl.classList.remove('pulse');
    _lastDangerOp = 0; _lastDangerPulse = false;
    cage.style.filter = '';

    const _p = $('birdPupil');
    if (_p && S.eyeBaseCx !== undefined) {
      _p.setAttribute('cx', S.eyeBaseCx);
      _p.setAttribute('cy', S.eyeBaseCy);
    }
    const _p2 = $('birdPupil2');
    if (_p2 && S.eye2BaseCx !== undefined) {
      _p2.setAttribute('cx', S.eye2BaseCx);
      _p2.setAttribute('cy', S.eye2BaseCy);
    }

    const leftSide = document.createElement('div');
    leftSide.className = 'cage-side-fall left';
    leftSide.style.background = getComputedStyle($('cageWallL')).background || '#8C4A14';
    const rightSide = document.createElement('div');
    rightSide.className = 'cage-side-fall right';
    rightSide.style.background = getComputedStyle($('cageWallR')).background || '#5C2A08';
    game.appendChild(leftSide);
    game.appendChild(rightSide);

    $('cageWallL').style.background = 'transparent';
    $('cageWallR').style.background = 'transparent';

    await sleep(100);

    leftSide.classList.add('fallen');
    rightSide.classList.add('fallen');

    birdWrap.className = 'hop';

    await sleep(300);

    const birdCenterX = S.birdX + getBirdH() / 2;
    const cageCenter = S.cageW / 2;
    const flyDir = birdCenterX > cageCenter ? -1 : 1;
    const targetX = flyDir > 0 ? S.cageW + 120 : -getBirdH() - 120;

    const flip = flyDir > 0 ? ' scaleX(-1)' : '';

    birdWrap.style.transition = 'none';
    birdWrap.style.transform = `translate(${S.birdX}px, ${S.birdY}px)${flip}`;
    birdWrap.offsetHeight;
    await sleep(150);

    const birdRect = birdWrap.getBoundingClientRect();
    const gameRect = game.getBoundingClientRect();
    const heartCx = birdRect.left - gameRect.left + birdRect.width / 2 + flyDir * 40;
    const heartCy = birdRect.top - gameRect.top + birdRect.height * 0.3;
    for (let i = 0; i < 6; i++) {
      const h = document.createElement('div');
      h.className = 'heart-particle';
      h.textContent = '\u2764\uFE0F';
      const angle = (Math.PI * 2 * i) / 6 + (Math.random() - 0.5) * 0.5;
      h.style.left = heartCx + 'px';
      h.style.top = heartCy + 'px';
      h.style.setProperty('--hx', (Math.cos(angle) * 50 + flyDir * 30) + 'px');
      h.style.setProperty('--hy', (Math.sin(angle) * 40 - 40) + 'px');
      h.style.animationDelay = (i * 0.08) + 's';
      game.appendChild(h);
      h.addEventListener('animationend', () => h.remove(), { once: true });
    }

    const midY = Math.max(20, S.birdY - 60);
    birdWrap.style.transition = 'transform 0.9s cubic-bezier(0.4, 0, 1, 1)';
    birdWrap.style.transform = `translate(${targetX}px, ${midY - 40}px)${flip}`;

    await sleep(950);

    leftSide.remove();
    rightSide.remove();
    birdWrap.style.transition = '';
  }

  // ===== WHEEL OF FORTUNE =====
  async function showWheel() {
    S.phase = 'wheel';
    S._wheelDone = false;
    const segs = S.remainingMods;
    const segAngle = 360 / segs.length;

    const wheel = $('wheel');
    const stops = segs.map((seg, i) =>
      `${seg.color} ${i * segAngle}deg ${(i + 1) * segAngle}deg`
    ).join(', ');
    wheel.style.background = `conic-gradient(${stops})`;
    wheel.innerHTML = '';
    const wheelSize = Math.min(300, parseInt(getComputedStyle($('wheelWrap')).width) || 300);
    const radius = wheelSize / 2 * 0.6;
    segs.forEach((seg, i) => {
      const icon = document.createElement('div');
      icon.className = 'wheel-icon';
      icon.textContent = seg.icon;
      const angle = i * segAngle + segAngle / 2;
      const rad = angle * Math.PI / 180;
      const x = Math.sin(rad) * radius;
      const y = -Math.cos(rad) * radius;
      icon.style.transform = `translate(${x - 24}px, ${y - 24}px) rotate(${angle}deg)`;
      wheel.appendChild(icon);
    });

    wheel.style.transition = 'none';
    wheel.style.transform = 'rotate(0deg)';
    const wBtns = $('wheelBtns');
    const wName = $('wheelResultName');
    const wDesc = $('wheelResultDesc');
    wBtns.style.transition = 'none';
    wName.style.transition = 'none';
    wDesc.style.transition = 'none';
    wBtns.classList.remove('show');
    wName.classList.remove('show');
    wDesc.classList.remove('show');
    void wheel.offsetHeight;
    wBtns.style.transition = '';
    wName.style.transition = '';
    wDesc.style.transition = '';

    $('wheelOverlay').classList.add('active');
    await sleep(600);

    const resultIdx = Math.floor(Math.random() * segs.length);
    const result = segs[resultIdx];
    S._wheelResult = result;

    const targetCenter = resultIdx * segAngle + segAngle / 2;
    const fullSpins = (4 + Math.floor(Math.random() * 3)) * 360;
    const jitter = (Math.random() - 0.5) * segAngle * 0.4;
    const totalRotation = fullSpins + (360 - targetCenter) + jitter;

    wheel.style.transition = 'transform 3.5s cubic-bezier(0.15, 0.85, 0.25, 1)';
    wheel.style.transform = `rotate(${totalRotation}deg)`;
    const stopTicks = SFX.startWheelTicks(3500);
    await sleep(3700);
    stopTicks();

    SFX.wheelLand();
    $('wheelResultName').textContent = `${result.icon} ${result.name}`;
    $('wheelResultName').style.color = result.color;
    $('wheelResultName').classList.add('show');

    result.apply(S);
    S.modifiers.push(result);
    S.remainingMods = S.remainingMods.filter(m => m !== result);
    renderModBadges();

    await sleep(400);
    $('wheelBtns').classList.add('show');
    S._wheelDone = true;
  }

  function renderModBadges() {
    const container = $('modBadges');
    container.innerHTML = '';
    S.modifiers.forEach(mod => {
      const badge = document.createElement('div');
      badge.className = 'mod-badge';
      badge.textContent = mod.icon;
      badge.title = mod.name;
      container.appendChild(badge);
    });
  }

  // ===== WIN / LOSE =====
  function winGame() {
    S.phase = 'win';
    birdWrap.className = 'calm';

    spawnCageBreak();
    setTimeout(() => spawnConfetti(60, true), 300);

    const emojiEl = $('winEmoji');
    emojiEl.innerHTML = '';
    for (let i = 0; i < TOTAL_ROUNDS; i++) {
      const vb = BIRD_VB[i];
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', vb.vb);
      svg.setAttribute('width', '72');
      svg.setAttribute('height', Math.round(72 / vb.aspect));
      svg.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))';
      svg.style.animation = `pop 0.4s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.1}s both`;
      svg.innerHTML = BIRD_SVGS[i];
      emojiEl.appendChild(svg);
    }

    if (S.modifiers.length > 0) {
      $('winSub').innerHTML = S.modifiers.map(m => `<span class="modifier-pill">${m.icon} ${m.name}</span>`).join('');
    } else {
      $('winSub').textContent = `You cleared all ${TOTAL_ROUNDS} rounds!`;
    }

    S._winTimer = setTimeout(() => $('winOverlay').classList.add('active'), 700);
    SFX.win();
  }

  function spawnCageBreak() {
    const game = $('game');
    const colors = ['#8B6914', '#5C4033', '#6B3A1F', '#8B5E3C'];
    for (let i = 0; i < 16; i++) {
      const frag = document.createElement('div');
      const w = 6 + Math.random() * 12;
      const h = 20 + Math.random() * 40;
      const side = i < 8 ? 0 : game.offsetWidth - w;
      const y = (i % 8) * (game.offsetHeight / 8);
      const dx = (i < 8 ? -1 : 1) * (40 + Math.random() * 80);
      const dy = -20 + Math.random() * 40;
      const rot = (Math.random() - 0.5) * 360;
      frag.style.cssText = `position:absolute;left:${side}px;top:${y}px;width:${w}px;height:${h}px;background:${colors[i%4]};z-index:101;border-radius:2px;pointer-events:none`;
      frag.style.transition = 'all 0.5s cubic-bezier(0.22, 0.61, 0.36, 1)';
      game.appendChild(frag);
      requestAnimationFrame(() => {
        frag.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
        frag.style.opacity = '0';
      });
      setTimeout(() => frag.remove(), 600);
    }
    $('cageWallL').style.background = 'transparent';
    $('cageWallR').style.background = 'transparent';
    $('topPlank').style.opacity = '0';
    $('cageBottom').style.opacity = '0';
  }

  function loseGame() {
    sendGameEvent('round_end', { round: S.round + 1, result: 'lose' });
    S.phase = 'lose';
    S.rising = false;

    navigator.vibrate?.([100, 50, 100, 50, 200]);
    SFX.lose();

    $('loseSub').textContent = `Round ${S.round + 1} of ${TOTAL_ROUNDS}`;
    S._loseTimer = setTimeout(() => $('loseOverlay').classList.add('active'), 1000);
  }

  function spawnConfetti(count, useFruit) {
    const game = $('game');
    const colors = ['#EF4444','#FACC15','#22C55E','#3B82F6','#A855F7','#EC4899'];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'confetti';
      if (useFruit && Math.random() > 0.5) {
        p.textContent = ICONS[Math.floor(Math.random() * 7)];
        p.style.fontSize = '14px';
        p.style.background = 'none';
      } else {
        const size = 4 + Math.random() * 6;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      }
      p.style.left = Math.random() * 100 + '%';
      p.style.top = '-10px';
      p.style.setProperty('--fall', (300 + Math.random() * 300) + 'px');
      p.style.setProperty('--spin', (360 + Math.random() * 720) + 'deg');
      p.style.setProperty('--dur', (1.5 + Math.random() * 1.5) + 's');
      p.style.setProperty('--delay', (Math.random() * 0.6) + 's');
      game.appendChild(p);
      p.addEventListener('animationend', () => p.remove(), { once: true });
    }
  }

  // ===== AUDIO =====
  const SFX = {
    ctx: null,
    _b: {},
    _unlocked: false,
    _clearIdx: 0,
    _lastClearT: 0,
    _combo: 0,

    init() {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._gen();
    },

    unlock() {
      if (!this.ctx) this.init();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (!this._unlocked) {
        const buf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.ctx.destination);
        src.start(0);
        this._unlocked = true;
      }
    },

    _pcm(dur, fn) {
      const sr = this.ctx.sampleRate;
      const n = Math.ceil(sr * dur);
      const buf = this.ctx.createBuffer(1, n, sr);
      const d = buf.getChannelData(0);
      fn(d, sr, n);
      return buf;
    },

    _addSine(d, sr, freq, start, dur, vol, decayT) {
      const s = Math.floor(start * sr), len = Math.ceil(dur * sr);
      for (let i = 0; i < len && s + i < d.length; i++) {
        const t = i / sr;
        d[s + i] += Math.sin(2 * Math.PI * freq * t) * vol * Math.exp(-t / decayT);
      }
    },

    _addTri(d, sr, freq, start, dur, vol, decayT) {
      const s = Math.floor(start * sr), len = Math.ceil(dur * sr);
      for (let i = 0; i < len && s + i < d.length; i++) {
        const t = i / sr;
        const phase = (freq * t) % 1;
        d[s + i] += (4 * Math.abs(phase - 0.5) - 1) * vol * Math.exp(-t / decayT);
      }
    },

    _addBell(d, sr, freq, start, dur, vol) {
      const P = [1.0, 2.76, 5.4, 8.93], G = [1.0, 0.4, 0.15, 0.06];
      P.forEach((ratio, i) => {
        const f = freq * ratio * (1 + (Math.random() - 0.5) * 0.005);
        this._addSine(d, sr, f, start, dur * (1 - i * 0.15), vol * G[i], dur * 0.35 * (1 - i * 0.1));
      });
    },

    _addNoise(d, sr, start, dur, vol, decayT) {
      const s = Math.floor(start * sr), len = Math.ceil(dur * sr);
      for (let i = 0; i < len && s + i < d.length; i++) {
        const t = i / sr;
        d[s + i] += (Math.random() * 2 - 1) * vol * Math.exp(-t / (decayT || dur * 0.3));
      }
    },

    _addChime(d, sr, freq, start, dur, vol) {
      const s = Math.floor(start * sr), len = Math.ceil(dur * sr);
      const attackLen = Math.ceil(0.008 * sr);
      for (let i = 0; i < len && s + i < d.length; i++) {
        const t = i / sr;
        const env = i < attackLen ? (i / attackLen) : Math.exp(-(t - 0.008) / (dur * 0.35));
        d[s + i] += Math.sin(2 * Math.PI * freq * t) * vol * env;
      }
    },

    _addSweep(d, sr, startFreq, endFreq, start, dur, vol, type) {
      const s = Math.floor(start * sr), len = Math.ceil(dur * sr);
      let phase = 0;
      for (let i = 0; i < len && s + i < d.length; i++) {
        const t = i / sr, p = t / dur;
        const freq = startFreq * Math.pow(endFreq / startFreq, p);
        phase += freq / sr;
        const wave = type === 'tri' ? (4 * Math.abs(phase % 1 - 0.5) - 1) : Math.sin(2 * Math.PI * phase);
        d[s + i] += wave * vol * Math.exp(-t / (dur * 0.4));
      }
    },

    _gen() {
      const B = this._b, me = this;

      B.bell = me._pcm(0.45, (d, sr) => { me._addBell(d, sr, 523.3, 0, 0.4, 0.14); });

      [0, 1, 2].forEach(step => {
        const freq = 698.5 * Math.pow(2, step * 40 / 1200);
        B['sel' + step] = me._pcm(0.1, (d, sr) => {
          me._addTri(d, sr, freq, 0, 0.07, 0.065, 0.025);
          me._addNoise(d, sr, 0, 0.012, 0.018, 0.004);
        });
      });

      B.mis = me._pcm(0.25, (d, sr) => {
        me._addChime(d, sr, 466.2, 0, 0.12, 0.08);
        me._addChime(d, sr, 440.0, 0.05, 0.12, 0.08);
        me._addNoise(d, sr, 0, 0.06, 0.03, 0.02);
      });

      B.fall = me._pcm(0.07, (d, sr) => { me._addNoise(d, sr, 0, 0.05, 0.04, 0.015); });

      B.ice = me._pcm(0.2, (d, sr) => {
        me._addNoise(d, sr, 0, 0.08, 0.06, 0.02);
        me._addChime(d, sr, 1200, 0.01, 0.12, 0.08);
        me._addChime(d, sr, 2400, 0.03, 0.08, 0.04);
      });

      B.tick = me._pcm(0.02, (d, sr) => { me._addNoise(d, sr, 0, 0.015, 0.06, 0.003); });

      B.col = me._pcm(0.4, (d, sr) => {
        me._addNoise(d, sr, 0, 0.03, 0.03, 0.008);
        me._addSweep(d, sr, 1100, 350, 0, 0.12, 0.05, 'tri');
        me._addChime(d, sr, 523.3, 0.06, 0.22, 0.06);
        me._addChime(d, sr, 698.5, 0.12, 0.22, 0.07);
      });

      B.land = me._pcm(0.9, (d, sr) => {
        me._addChime(d, sr, 2093, 0, 0.06, 0.07);
        me._addNoise(d, sr, 0, 0.025, 0.04, 0.008);
        me._addBell(d, sr, 523.3, 0.02, 0.7, 0.10);
        me._addBell(d, sr, 659.3, 0.05, 0.65, 0.12);
        me._addBell(d, sr, 784.0, 0.09, 0.6, 0.13);
        me._addBell(d, sr, 1046.5, 0.13, 0.55, 0.11);
        me._addNoise(d, sr, 0.04, 0.18, 0.04, 0.06);
        me._addNoise(d, sr, 0.12, 0.14, 0.035, 0.05);
      });

      B.win = me._pcm(2.0, (d, sr) => {
        [392, 523.3, 659.3, 784, 1046.5].forEach((f, i) => {
          me._addBell(d, sr, f, i * 0.07, 0.5 + i * 0.08, 0.09 + i * 0.015);
        });
        me._addBell(d, sr, 261.6, 0.40, 1.6, 0.10);
        me._addBell(d, sr, 523.3, 0.42, 1.5, 0.14);
        me._addBell(d, sr, 659.3, 0.44, 1.45, 0.13);
        me._addBell(d, sr, 784.0, 0.46, 1.4, 0.14);
        me._addBell(d, sr, 1046.5, 0.48, 1.3, 0.12);
        me._addBell(d, sr, 1318.5, 0.50, 1.2, 0.08);
        me._addNoise(d, sr, 0.35, 0.2, 0.05, 0.06);
        me._addNoise(d, sr, 0.55, 0.18, 0.05, 0.06);
        me._addNoise(d, sr, 0.75, 0.15, 0.04, 0.05);
        me._addSine(d, sr, 65, 0.38, 1.47, 0.12, 0.5);
      });

      B.lose = me._pcm(1.2, (d, sr) => {
        me._addSweep(d, sr, 500, 200, 0, 0.3, 0.06, 'tri');
        me._addBell(d, sr, 659.3, 0.05, 0.5, 0.09);
        me._addBell(d, sr, 523.3, 0.25, 0.5, 0.08);
        me._addBell(d, sr, 440.0, 0.45, 0.65, 0.08);
        me._addChime(d, sr, 220.0, 0.70, 0.8, 0.06);
        me._addNoise(d, sr, 0.5, 0.25, 0.025, 0.08);
      });
    },

    _play(buf, vol, rate) {
      if (!this.ctx || !buf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      if (rate !== 1) src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(g);
      g.connect(this.ctx.destination);
      src.start();
    },

    select(nth) { this._play(this._b['sel' + Math.min(nth - 1, 2)], 0.45, 1); },
    mismatch() { this._play(this._b.mis, 0.45, 1); },
    tileFall() { this._play(this._b.fall, 0.45, 1); },
    iceBreak() { this._play(this._b.ice, 0.45, 1); },
    rowCollapse() { this._play(this._b.col, 0.45, 1); },
    wheelLand() { this._play(this._b.land, 0.45, 1); },
    win() { this._play(this._b.win, 0.45, 1); },
    lose() { this._play(this._b.lose, 0.45, 1); },

    matchClear() {
      const rates = [1, 587.3/523.3, 659.3/523.3, 784/523.3, 880/523.3, 1046.5/523.3];
      const rate = rates[this._clearIdx % rates.length];
      this._clearIdx++;
      const now = performance.now();
      this._combo = (now - this._lastClearT < 1800) ? Math.min(this._combo + 1, 5) : 0;
      this._lastClearT = now;
      this._play(this._b.bell, 0.45, rate);
      if (this._combo >= 1) this._play(this._b.bell, 0.15 + this._combo * 0.03, rate * 2);
    },

    wheelTick(vol) { this._play(this._b.tick, vol, 1); },

    startWheelTicks(durationMs) {
      durationMs = durationMs || 3500;
      const startT = performance.now();
      let lastTickT = 0, raf = 0, stopped = false;
      const me = this;
      const frame = () => {
        if (stopped) return;
        const elapsed = performance.now() - startT;
        if (elapsed >= durationMs - 250) return;
        const p = Math.min(elapsed / durationMs, 1);
        const interval = 50 + 350 * (p * p);
        if (elapsed - lastTickT >= interval) {
          me.wheelTick(0.055 * (1 - p * 0.4));
          lastTickT = elapsed;
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      return () => { stopped = true; cancelAnimationFrame(raf); };
    },
  };

  // ===== ROUND SPLASH =====
  async function showRoundSplash(roundNum) {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:100;pointer-events:none';
    el.innerHTML = `<div style="font-family:'Fredoka',system-ui,sans-serif;font-size:48px;font-weight:600;color:#fff;letter-spacing:0.04em;text-shadow:0 2px 4px rgba(20,8,0,0.95),0 0 20px rgba(255,200,80,0.35);transform:scale(0);animation:pop 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards">ROUND ${roundNum}</div>`;
    $('game').appendChild(el);
    await sleep(800);
    el.style.transition = 'opacity 0.3s';
    el.style.opacity = '0';
    await sleep(300);
    el.remove();
  }

  // ===== DEBUG =====
  function debugApplyMod(idx) {
    if (S.phase !== 'playing') return;
    const mod = MODIFIERS[idx];
    if (!mod) return;
    mod.apply(S);
    S.modifiers.push(mod);
    renderModBadges();
    if (mod.name === 'Tiny Tiles' || mod.name === 'More Fruits' || mod.name === 'Ice Tiles') {
      measure();
      initGrid();
      renderTiles();
      S.visiblePx = S.cellSize * 1.5 + VGAP + S.spikeH + PLANK_H;
      positionStack();
    }
    if (mod.name === 'Lower Ceiling') {
      const scaledOff = Math.round(S.ceilOffset * S.cageH / 700);
      $('ceilingSpikes').style.top = scaledOff + 'px';
      $('topPress').style.height = scaledOff + 'px';
    }
  }

  function debugWinRound() {
    if (S.phase !== 'playing') return;
    S._debugWin = true;
    S.grid = S.grid.map(r => r.map(() => null));
    tileContainer.innerHTML = '';
    tileElMap.clear();
    S.totalRows = 0;
    tileContainer.style.height = '0px';
    roundComplete();
  }

  // ===== WHEEL BUTTON CALLBACKS =====
  async function wheelContinue() {
    if (!S._wheelDone) return;
    S._wheelDone = false;
    const trans = $('roundTransition');
    trans.classList.remove('fade-out');
    trans.classList.add('fade-in');
    await sleep(400);
    $('wheelOverlay').classList.remove('active');
    $('wheelBtns').classList.remove('show');
    $('wheelResultName').classList.remove('show');
    $('wheelResultDesc').classList.remove('show');
    S.round++;
    startRound();
    await sleep(100);
    trans.classList.remove('fade-in');
    trans.classList.add('fade-out');
    await sleep(400);
    trans.classList.remove('fade-out');
    await showRoundSplash(S.round + 1);
  }

  function wheelRestart() {
    if (!S._wheelDone) return;
    S._wheelDone = false;
    $('wheelOverlay').classList.remove('active');
    $('wheelBtns').classList.remove('show');
    $('wheelResultName').classList.remove('show');
    $('wheelResultDesc').classList.remove('show');
    const result = S._wheelResult;
    if (result) {
      S.modifiers.pop();
    }
    restart();
  }

  function restart() {
    if (S._loseTimer) { clearTimeout(S._loseTimer); S._loseTimer = null; }
    if (S._winTimer) { clearTimeout(S._winTimer); S._winTimer = null; }
    S._pressedTile = null;

    $('winOverlay').classList.remove('active');
    $('loseOverlay').classList.remove('active');
    $('wheelOverlay').classList.remove('active');
    $('wheelBtns').classList.remove('show');
    $('wheelResultName').classList.remove('show');
    $('wheelResultDesc').classList.remove('show');

    const dOv = $('dangerOverlay');
    dOv.style.opacity = 0;
    dOv.classList.remove('pulse');

    S.round = 0;
    S.modifiers = [];
    S.remainingMods = [...MODIFIERS];
    S.closestCall = Infinity;
    S.birdScale = 1;
    S.ceilOffset = 0;
    S.extraTypes = 0;
    S.speedMul = 1;
    S.tileScale = 1;
    S.tinyTiles = false;
    S.frozenTiles = false;
    S.ctaDismissed = false;
    S.nextTileId = 0;
    S.lastTs = 0;

    $('ceilingSpikes').style.top = '0';
    $('topPress').style.height = '0';

    $('modBadges').innerHTML = '';

    measure();
    startRound();
  }

  // ===== SET UP EVENT LISTENERS =====

  // Initialize SFX
  SFX.init();
  document.addEventListener('touchstart', () => SFX.unlock());
  document.addEventListener('click', () => SFX.unlock());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && SFX.ctx) SFX.ctx.suspend();
    else if (SFX.ctx) SFX.ctx.resume();
  });

  // Tile selection on pointer release
  cage.addEventListener('pointerup', () => {
    if (S._pressedTile) {
      const { row, col } = S._pressedTile;
      S._pressedTile = null;
      tapTile(row, col);
    }
  });
  document.addEventListener('pointerup', () => { S._pressedTile = null; });
  cage.addEventListener('pointercancel', () => {
    if (S._pressedTile) {
      const { row, col } = S._pressedTile;
      S._pressedTile = null;
      tapTile(row, col);
    }
  });

  // Prevent double-tap zoom
  let _lastTap = 0;
  $('game').addEventListener('touchend', e => {
    const now = Date.now();
    if (now - _lastTap < 300) e.preventDefault();
    _lastTap = now;
  }, { passive: false });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) S.lastTs = 0;
  });

  window.addEventListener('resize', () => {
    measure();
    if (S.phase === 'playing') {
      initSpikes();
      positionStack();
    }
  });

  // ===== EXPOSE GLOBALS FOR OVERLAY onclick HANDLERS =====
  window.G = Object.assign(window.G || {}, {
    wheelContinue: wheelContinue,
    wheelRestart: wheelRestart,
    restart: restart,
  });

  // Expose debug functions globally
  window.debugApplyMod = debugApplyMod;
  window.debugWinRound = debugWinRound;

  // ===== INITIALIZE =====

  // Set up initial round state
  S.remainingMods = [...MODIFIERS];
  S.round = 0;
  S.modifiers = [];
  S.closestCall = Infinity;
  S.birdScale = 1;
  S.ceilOffset = 0;
  S.extraTypes = 0;
  S.speedMul = 1;
  S.tileScale = 1;
  S.tinyTiles = false;
  S.frozenTiles = false;
  S.ctaDismissed = false;
  S.nextTileId = 0;

  measure();
  startRound();

  // Process first tap from shell (if user tapped before core loaded)
  if (_G.firstTapRow !== null && _G.firstTapCol !== null) {
    tapTile(_G.firstTapRow, _G.firstTapCol);
    _G.firstTapRow = null;
    _G.firstTapCol = null;
  }

  // Start game loop
  requestAnimationFrame(gameLoop);

  // Signal parent that game has started
  window.parent.postMessage({ type: 'STRYM_STARTED' }, '*');

})();
