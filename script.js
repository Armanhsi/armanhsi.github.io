/* ==========================================================================
   Arman Hosseini — Spatial OS interactions
   Pure JS, no dependencies. Everything degrades gracefully: with reduced
   motion the world renders one still frame and windows stop tilting.
   ========================================================================== */
(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const isWide = () => innerWidth > 960;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const rootStyle = getComputedStyle(document.documentElement);
  const GRID_RGB = rootStyle.getPropertyValue('--grid').trim() || '127, 231, 255';
  const ACCENT = rootStyle.getPropertyValue('--accent').trim() || '#7FE7FF';

  /* ------------------------------------------------------------------
     Pointer state (shared by world, scene tilt and gaze cursor)
     ------------------------------------------------------------------ */
  const pointer = { x: innerWidth / 2, y: innerHeight / 2, nx: 0, ny: 0, active: false };
  addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.nx = (e.clientX / innerWidth) * 2 - 1;
    pointer.ny = (e.clientY / innerHeight) * 2 - 1;
    pointer.active = true;

    // specular highlight on the glass panel under the pointer
    const glass = e.target.closest && e.target.closest('.glass');
    if (glass) {
      const r = glass.getBoundingClientRect();
      glass.style.setProperty('--mx', `${e.clientX - r.left}px`);
      glass.style.setProperty('--my', `${e.clientY - r.top}px`);
    }
  }, { passive: true });

  /* ------------------------------------------------------------------
     1. Wireframe world — a street receding to the horizon, buildings,
        a roundabout and drifting particles. Simple perspective projection.
     ------------------------------------------------------------------ */
  const canvas = document.getElementById('world');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  const NEAR = 1.2, FAR = 80;
  const cam = { x: 0, y: 1.7, yaw: 0, pitch: 0 };
  let travel = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  const buildings = Array.from({ length: 26 }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    return { x: side * rand(9, 26), w: rand(2.5, 6), d: rand(3, 8), h: rand(3, 17), z0: rand(0, FAR) };
  });
  const particles = Array.from({ length: 80 }, () => ({ x: rand(-34, 34), y: rand(0.5, 14), z0: rand(0, FAR) }));

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const wrap = (z0, speed = 1) => ((((z0 - travel * speed) % FAR) + FAR) % FAR) + NEAR;
  const fade = (z) => Math.pow(Math.max(0, 1 - z / FAR), 1.4);

  function project(x, y, z) {
    const dx = x - cam.x;
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const xr = dx * cy - z * sy;
    const zr = dx * sy + z * cy;
    if (zr < NEAR * 0.9) return null;
    const f = Math.min(W, H * 1.4) * 0.75;
    const horizon = H * (0.46 + cam.pitch * 0.04);
    return [W / 2 + (xr * f) / zr, horizon - ((y - cam.y) * f) / zr];
  }

  function seg(x1, y1, z1, x2, y2, z2, alpha) {
    if (alpha < 0.01) return;
    const a = project(x1, y1, z1), b = project(x2, y2, z2);
    if (!a || !b) return;
    ctx.strokeStyle = `rgba(${GRID_RGB}, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }

  function drawWorld() {
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;

    // horizon haze
    const hy = H * (0.46 + cam.pitch * 0.04);
    const haze = ctx.createLinearGradient(0, hy - 80, 0, hy + 60);
    haze.addColorStop(0, `rgba(${GRID_RGB}, 0)`);
    haze.addColorStop(0.6, `rgba(${GRID_RGB}, 0.06)`);
    haze.addColorStop(1, `rgba(${GRID_RGB}, 0)`);
    ctx.fillStyle = haze;
    ctx.fillRect(0, hy - 80, W, 140);

    // floor grid: longitudinal lines (drawn in chunks so they fade with depth)
    for (let x = -36; x <= 36; x += 4) {
      const road = Math.abs(x) === 4;
      const base = road ? 0.55 : 0.16;
      for (let z = NEAR; z < FAR; z += 8) seg(x, 0, z, x, 0, Math.min(z + 8, FAR), base * fade(z + 4));
    }
    // floor grid: cross lines moving toward the viewer
    for (let k = 0; k < FAR / 4; k++) {
      const z = wrap(k * 4);
      seg(-36, 0, z, 36, 0, z, 0.16 * fade(z));
    }
    // centre-line dashes
    for (let k = 0; k < FAR / 6; k++) {
      const z = wrap(k * 6);
      seg(0, 0, z, 0, 0, z + 2.4, 0.7 * fade(z));
    }

    // roundabout ahead
    const rz = wrap(40) + 8;
    for (const [r, a] of [[7.5, 0.6], [3.2, 0.45]]) {
      const n = 48;
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * Math.PI * 2;
        const p = [Math.cos(t) * r, 0, rz + Math.sin(t) * r];
        if (prev) seg(prev[0], 0, prev[2], p[0], 0, p[2], a * fade(p[2]));
        prev = p;
      }
    }

    // wireframe buildings
    for (const b of buildings) {
      const z = wrap(b.z0);
      const al = 0.32 * fade(z);
      if (al < 0.01) continue;
      const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z1 = z + b.d, h = b.h;
      // bottom, top, verticals
      seg(x0, 0, z, x1, 0, z, al); seg(x0, h, z, x1, h, z, al);
      seg(x0, 0, z1, x1, 0, z1, al * 0.6); seg(x0, h, z1, x1, h, z1, al * 0.6);
      seg(x0, 0, z, x0, 0, z1, al); seg(x1, 0, z, x1, 0, z1, al);
      seg(x0, h, z, x0, h, z1, al); seg(x1, h, z, x1, h, z1, al);
      seg(x0, 0, z, x0, h, z, al); seg(x1, 0, z, x1, h, z, al);
      seg(x0, 0, z1, x0, h, z1, al * 0.6); seg(x1, 0, z1, x1, h, z1, al * 0.6);
    }

    // particles
    for (const p of particles) {
      const z = wrap(p.z0, 0.6);
      const s = project(p.x, p.y, z);
      if (!s) continue;
      ctx.fillStyle = `rgba(${GRID_RGB}, ${0.55 * fade(z)})`;
      const size = clamp(3 - z / 30, 0.8, 2.6);
      ctx.fillRect(s[0], s[1], size, size);
    }
  }

  /* ------------------------------------------------------------------
     2. Hero scene tilt (head-pose parallax) and gaze cursor
     ------------------------------------------------------------------ */
  const scene = document.getElementById('scene');
  const tilt = { x: 0, y: 0 };

  const gazeEl = document.querySelector('.gaze');
  const gaze = { x: pointer.x, y: pointer.y, w: 30, h: 30 };
  let lockTarget = null;
  const LOCKABLE = 'a.btn, a.chip, .dock a, .brand';
  if (finePointer && gazeEl) {
    document.addEventListener('pointerover', (e) => {
      lockTarget = e.target.closest ? e.target.closest(LOCKABLE) : null;
      gazeEl.classList.toggle('is-locked', !!lockTarget);
      gazeEl.style.borderRadius = lockTarget ? getComputedStyle(lockTarget).borderRadius : '50%';
    });
    document.addEventListener('pointerleave', () => gazeEl.classList.remove('is-on'));
    document.addEventListener('pointerenter', () => gazeEl.classList.add('is-on'));
  }

  function updateGaze() {
    if (!finePointer || !gazeEl || !pointer.active) return;
    gazeEl.classList.add('is-on');
    let tx = pointer.x, ty = pointer.y, tw = 30, th = 30;
    if (lockTarget && lockTarget.isConnected) {
      const r = lockTarget.getBoundingClientRect();
      tx = r.left + r.width / 2; ty = r.top + r.height / 2;
      tw = r.width + 10; th = r.height + 10;
    }
    const k = lockTarget ? 0.3 : 0.2;
    gaze.x = lerp(gaze.x, tx, k); gaze.y = lerp(gaze.y, ty, k);
    gaze.w = lerp(gaze.w, tw, 0.25); gaze.h = lerp(gaze.h, th, 0.25);
    gazeEl.style.width = `${gaze.w}px`;
    gazeEl.style.height = `${gaze.h}px`;
    gazeEl.style.transform = `translate3d(${gaze.x - gaze.w / 2}px, ${gaze.y - gaze.h / 2}px, 0)`;
  }

  /* ------------------------------------------------------------------
     3. Card tilt on hover
     ------------------------------------------------------------------ */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll('.card').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        if (!isWide()) return;
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        const max = card.classList.contains('card--featured') ? 3 : 6;
        card.style.setProperty('--ry', `${x * max}deg`);
        card.style.setProperty('--rx', `${-y * max}deg`);
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--ry', '0deg');
        card.style.setProperty('--rx', '0deg');
      });
    });
  }

  /* ------------------------------------------------------------------
     4. RIDER demo stream — synthetic gaze / EDA / HR and a risk index.
        Purely illustrative; a hazard "event" repeats every ~9 s.
     ------------------------------------------------------------------ */
  const sigCanvases = [...document.querySelectorAll('canvas[data-signal]')];
  const N = 140;
  const buf = { gaze: new Array(N).fill(0), eda: new Array(N).fill(0.3), hr: new Array(N).fill(0) };
  const riskEl = document.getElementById('risk');
  const riskNum = document.getElementById('risk-num');
  const riskBar = document.getElementById('risk-bar');
  const riskState = document.getElementById('risk-state');
  const vGaze = document.getElementById('v-gaze');
  const vEda = document.getElementById('v-eda');
  const vHr = document.getElementById('v-hr');
  let simT = 0, sampleAcc = 0, gazeTarget = 0, gazeVal = 0, nextSaccade = 0, beat = 0, risk = 0.15, signalsVisible = true;

  const signalWin = document.querySelector('.window--signal');
  if (signalWin && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { signalsVisible = e.isIntersecting; }).observe(signalWin);
  }

  function sizeSignalCanvases() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    sigCanvases.forEach((c) => {
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round(c.clientHeight * dpr);
      c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  }

  function hazardLevel(t) {
    // 0 → 1 → 0 bump between 5 s and 8.5 s of a 9 s cycle
    const p = t % 9;
    if (p < 5) return 0;
    if (p < 6.6) return (p - 5) / 1.6;
    return Math.max(0, 1 - (p - 6.6) / 1.9);
  }

  function stepSignals(dt) {
    sampleAcc += dt;
    const STEP = 1 / 30;
    while (sampleAcc >= STEP) {
      sampleAcc -= STEP;
      simT += STEP;
      const hz = hazardLevel(simT);
      // gaze: fixations with saccades, more frequent under hazard
      if (simT > nextSaccade) {
        gazeTarget = rand(-0.9, 0.9);
        nextSaccade = simT + rand(0.25, 0.7) * (1 - hz * 0.6);
      }
      gazeVal = lerp(gazeVal, gazeTarget, 0.55) + rand(-0.03, 0.03);
      // EDA: slow tonic drift + phasic response to the hazard
      const eda = 0.35 + 0.08 * Math.sin(simT * 0.4) + hz * 0.5 + rand(-0.01, 0.01);
      // HR: pulse waveform, faster with hazard
      const bpm = 74 + hz * 16;
      beat += (bpm / 60) * STEP * Math.PI * 2;
      const pulse = Math.pow(Math.max(0, Math.sin(beat)), 12) - 0.15 * Math.max(0, Math.sin(beat + 0.9));
      buf.gaze.push(gazeVal); buf.gaze.shift();
      buf.eda.push(eda); buf.eda.shift();
      buf.hr.push(pulse); buf.hr.shift();
      risk = lerp(risk, 0.14 + hz * 0.74 + rand(-0.02, 0.02), 0.08);
      if (vGaze) vGaze.textContent = `${(gazeVal * 18).toFixed(1)}°`;
      if (vEda) vEda.textContent = `${(eda * 6).toFixed(1)}µS`;
      if (vHr) vHr.textContent = `${Math.round(bpm)}`;
    }
  }

  function drawSignals() {
    sigCanvases.forEach((c) => {
      const g = c.getContext('2d');
      const w = c.clientWidth, h = c.clientHeight;
      const data = buf[c.dataset.signal];
      g.clearRect(0, 0, w, h);
      g.lineWidth = 1.4;
      g.strokeStyle = ACCENT;
      g.beginPath();
      data.forEach((v, i) => {
        const x = (i / (N - 1)) * w;
        let y;
        if (c.dataset.signal === 'gaze') y = h / 2 - v * (h / 2 - 3);
        else if (c.dataset.signal === 'eda') y = h - 3 - v * (h - 6);
        else y = h * 0.7 - v * (h * 0.6);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      g.stroke();
    });
    if (riskNum) {
      riskNum.textContent = risk.toFixed(2);
      riskBar.style.width = `${Math.round(risk * 100)}%`;
      const state = risk > 0.68 ? 'ALERT' : risk > 0.42 ? 'ELEVATED' : 'NOMINAL';
      if (riskState.textContent !== state) riskState.textContent = state;
      riskEl.classList.toggle('is-hot', risk > 0.68);
    }
  }

  /* ------------------------------------------------------------------
     5. Main loop
     ------------------------------------------------------------------ */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    travel += dt * 3.2;
    cam.yaw = lerp(cam.yaw, pointer.nx * 0.07, 0.04);
    cam.x = lerp(cam.x, pointer.nx * 1.4, 0.04);
    cam.pitch = lerp(cam.pitch, pointer.ny, 0.04);
    drawWorld();

    if (scene && isWide()) {
      tilt.y = lerp(tilt.y, pointer.nx * 5, 0.07);
      tilt.x = lerp(tilt.x, -pointer.ny * 3.5, 0.07);
      scene.style.setProperty('--tilt-y', tilt.y.toFixed(3));
      scene.style.setProperty('--tilt-x', tilt.x.toFixed(3));
    }
    updateGaze();
    if (signalsVisible) { stepSignals(dt); drawSignals(); }

    if (!document.hidden) requestAnimationFrame(frame);
  }

  function start() {
    resize();
    sizeSignalCanvases();
    if (reduceMotion) {
      drawWorld();
      for (let i = 0; i < 200; i++) stepSignals(1 / 30);
      drawSignals();
      return;
    }
    last = performance.now();
    requestAnimationFrame(frame);
  }

  addEventListener('resize', () => {
    resize();
    sizeSignalCanvases();
    if (reduceMotion) { drawWorld(); drawSignals(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !reduceMotion) { last = performance.now(); requestAnimationFrame(frame); }
  });

  /* ------------------------------------------------------------------
     6. Scroll: status bar state, world dimming, dock scroll-spy
     ------------------------------------------------------------------ */
  let scrollQueued = false;
  function onScroll() {
    scrollQueued = false;
    const p = clamp(scrollY / (innerHeight * 0.9), 0, 1);
    document.body.classList.toggle('is-scrolled', scrollY > innerHeight * 0.5);
    document.documentElement.style.setProperty('--world-opacity', (1 - p * 0.6).toFixed(3));
  }
  addEventListener('scroll', () => {
    if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  const dockLinks = [...document.querySelectorAll('.dock a')];
  const sections = dockLinks.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        dockLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${e.target.id}`));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => spy.observe(s));
    // the last section can't reach the trigger line, so light it up at the page bottom
    addEventListener('scroll', () => {
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) {
        dockLinks.forEach((a, i) => a.classList.toggle('is-active', i === dockLinks.length - 1));
      }
    }, { passive: true });
  }

  /* ------------------------------------------------------------------
     7. Publication filters
     ------------------------------------------------------------------ */
  const filterBtns = [...document.querySelectorAll('.seg [data-filter]')];
  const pubGroups = [...document.querySelectorAll('.pub-group')];
  filterBtns.forEach((btn) => btn.addEventListener('click', () => {
    const f = btn.dataset.filter;
    filterBtns.forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on);
    });
    pubGroups.forEach((g) => { g.hidden = f !== 'all' && g.dataset.group !== f; });
  }));

  /* ------------------------------------------------------------------
     8. Copy email
     ------------------------------------------------------------------ */
  // execCommand works synchronously inside the click; the async Clipboard API is the backup
  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
  document.querySelectorAll('[data-copy]').forEach((btn) => btn.addEventListener('click', async () => {
    const text = btn.dataset.copy;
    let ok = legacyCopy(text);
    if (!ok && navigator.clipboard) {
      try {
        await Promise.race([
          navigator.clipboard.writeText(text),
          new Promise((_, reject) => setTimeout(reject, 1500)),
        ]);
        ok = true;
      } catch { ok = false; }
    }
    btn.textContent = ok ? 'Copied' : 'Press Ctrl+C';
    if (!ok) getSelection().selectAllChildren(btn.previousElementSibling);
    btn.classList.add('is-done');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('is-done'); }, 2000);
  }));

  /* ------------------------------------------------------------------
     9. Charlottesville clock + footer year
     ------------------------------------------------------------------ */
  const clockEl = document.getElementById('clock');
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
  const tick = () => { if (clockEl) clockEl.textContent = `CVL ${fmt.format(new Date())}`; };
  tick();
  setInterval(tick, 15000);
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  start();
})();
