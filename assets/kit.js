/* Kit — 生理 3D 共用小工具（建構在 Mini3D 之上）
 * 舞台/資訊面板、曲面（橢球、管、掃掠）、分子球棒模型、沿路徑流動的粒子、2D 曲線圖、按鈕群組
 */
(function (G) {
  'use strict';
  const M = G.Mini3D, V = M.V;
  const K = {};
  K.V = V;
  K.sm = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
  K.clamp = M.clamp;
  K.lerp = (a, b, t) => a + (b - a) * t;
  K.$ = id => document.getElementById(id);
  /* HSL → #hex（引擎只吃 hex 顏色） */
  K.hsl = function (h, s, l) {
    s /= 100; l /= 100; h = ((h % 360) + 360) % 360;
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, '0');
    return '#' + f(0) + f(8) + f(4);
  };

  K.fit = function (cv) {
    const w = cv.clientWidth, h = cv.clientHeight, d = Math.min(2, G.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
    const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); return [c, w, h];
  };
  K.onScreen = function (el) { const s = { v: true }; if (G.IntersectionObserver) new IntersectionObserver(es => { s.v = es[es.length - 1].isIntersecting; }).observe(el); return s; };
  K.loop = function (fn, el) {
    const vis = el ? K.onScreen(el) : { v: true }; let last = performance.now();
    (function f(now) { const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; if (vis.v && !document.hidden) fn(dt, now / 1000); requestAnimationFrame(f); })(last);
  };

  /* ---------- 舞台 ---------- */
  K.stage = function (id, opt) {
    const st = typeof id === 'string' ? document.getElementById(id) : id;
    const S = new M.Scene(st.querySelector('canvas'), opt || {});
    M.controls(S, st);
    S._ticks = [];
    S.onFrame = (dt, t) => { for (let i = 0; i < S._ticks.length; i++) S._ticks[i](dt, t); };
    S.tick = f => { S._ticks.push(f); return f; };
    S.st = st;
    return S;
  };

  /* INFO[id] = [標題, [條列], 補充(可省略)] 或 {t, en, p, li, n} */
  K.info = function (S, el, INFO, opt) {
    opt = opt || {};
    if (typeof el === 'string') el = document.getElementById(el);
    let sel = null;
    function show(id) {
      const d = INFO[id]; if (!d) return;
      sel = id;
      const t = Array.isArray(d) ? { t: d[0], li: d[1], n: d[2] } : d;
      el.innerHTML = '<div class="tt">' + t.t + (t.en ? '<small>' + t.en + '</small>' : '') + '</div>' +
        (t.p ? '<p class="small">' + t.p + '</p>' : '') +
        (t.li ? '<ul>' + t.li.map(x => '<li>' + x + '</li>').join('') + '</ul>' : '') +
        (t.n ? '<div class="note extra"><b>補充</b>' + t.n + '</div>' : '');
      if (S && opt.hl !== false) S.each(o => { if (o.id) o.hl = o.id === id; });
      if (opt.on) opt.on(id);
      if (opt.picker) UI.$$('button', pk).forEach(b => b.classList.toggle('on', b.dataset.k === id));
    }
    let pk = null;
    if (opt.picker) {
      pk = typeof opt.picker === 'string' ? document.getElementById(opt.picker) : opt.picker;
      Object.keys(INFO).forEach(k => {
        const d = INFO[k], t = Array.isArray(d) ? d[0] : d.t;
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'; b.dataset.k = k;
        b.textContent = t.replace(/<[^>]+>/g, '').split(/[ （(：]/)[0];
        b.onclick = () => show(k); pk.appendChild(b);
      });
    }
    if (S) S.onPick = o => { if (o && INFO[o.id]) show(o.id); };
    return { show, get sel() { return sel; } };
  };

  /* ---------- 幾何 ---------- */
  K.basis = function (n) {
    n = V.norm(n); const a = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = V.norm(V.cross(n, a)), v = V.cross(n, u); return [u, v, n];
  };
  K.circle = function (c, R, n, N, ph) {
    const [u, v] = K.basis(n || [0, 1, 0]), out = [];
    for (let i = 0; i < N; i++) { const t = (ph || 0) + (i / N) * 6.2832; out.push(V.add(c, V.add(V.mul(u, Math.cos(t) * R), V.mul(v, Math.sin(t) * R)))); }
    return out;
  };
  K.rot = function (p, o) { if (!o) return p; if (o.rz) p = V.rotZ(p, o.rz); if (o.rx) p = V.rotX(p, o.rx); if (o.ry) p = V.rotY(p, o.ry); return p; };
  /* 點雲殼面（像 ch13 的心臟） */
  K.blob = function (S, c, r, col, n, size, x, o) {
    return M.shell(n, c, r, o).map(s => S.dot(s.p, size || 2, col, Object.assign({ p0: s.p.slice(), uu: s.u }, x)));
  };
  /* 參數曲面 f(u,v) → 點；col 可為函式 (u,v)→顏色 */
  K.surf = function (S, f, nu, nv, col, x) {
    const P = [];
    for (let i = 0; i <= nu; i++) { const row = []; for (let j = 0; j <= nv; j++) row.push(f(i / nu, j / nv)); P.push(row); }
    const F = [];
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const c = typeof col === 'function' ? col((i + 0.5) / nu, (j + 0.5) / nv) : col;
      F.push(S.face([P[i][j], P[i + 1][j], P[i + 1][j + 1], P[i][j + 1]], c, Object.assign({ fu: (i + 0.5) / nu, fv: (j + 0.5) / nv }, x)));
    }
    F.grid = P; return F;
  };
  K.ellipsoid = function (S, c, r, col, nu, nv, x, o) {
    o = o || {};
    const v0 = o.v0 || 0, v1 = o.v1 == null ? 1 : o.v1, u0 = o.u0 || 0, u1 = o.u1 == null ? 1 : o.u1;
    return K.surf(S, (u, v) => {
      const th = (u0 + (u1 - u0) * u) * 6.2832, ph = (v0 + (v1 - v0) * v) * Math.PI;
      let p = [Math.cos(th) * Math.sin(ph) * r[0], Math.cos(ph) * r[1], Math.sin(th) * Math.sin(ph) * r[2]];
      if (o.noise) p = V.mul(p, o.noise(th, ph));
      return V.add(c, K.rot(p, o));
    }, nu || 18, nv || 10, col, x);
  };
  /* 沿路徑掃掠成管狀曲面；rad 可為函式 t→半徑 */
  K.sweep = function (S, pts, rad, col, segs, sides, x, opt) {
    opt = opt || {};
    const P = pts instanceof M.Path ? pts : new M.Path(pts, opt.smooth || 8);
    segs = segs || 40; sides = sides || 10;
    const C = []; for (let i = 0; i <= segs; i++) C.push(P.at(i / segs));
    const T = C.map((_, i) => V.norm(V.sub(C[Math.min(segs, i + 1)], C[Math.max(0, i - 1)])));
    let u = K.basis(T[0])[0];
    const rings = [], a0 = opt.a0 || 0, a1 = opt.a1 == null ? 1 : opt.a1;
    for (let i = 0; i <= segs; i++) {
      u = V.norm(V.sub(u, V.mul(T[i], V.dot(u, T[i]))));
      const v = V.cross(T[i], u), r = typeof rad === 'function' ? rad(i / segs) : rad, ring = [];
      for (let j = 0; j <= sides; j++) { const t = (a0 + (a1 - a0) * (j / sides)) * 6.2832; ring.push(V.add(C[i], V.add(V.mul(u, Math.cos(t) * r), V.mul(v, Math.sin(t) * r)))); }
      rings.push(ring);
    }
    const F = [];
    for (let i = 0; i < segs; i++) for (let j = 0; j < sides; j++) {
      const c = typeof col === 'function' ? col((i + 0.5) / segs, (j + 0.5) / sides) : col;
      F.push(S.face([rings[i][j], rings[i + 1][j], rings[i + 1][j + 1], rings[i][j + 1]], c, Object.assign({ fu: (i + 0.5) / segs }, x)));
    }
    F.path = P; F.rings = rings; return F;
  };
  /* 讓曲面可整體移動/縮放：m.set(中心, 縮放(數字或[sx,sy,sz]), 透明度) */
  K.mover = function (F, c0) {
    c0 = c0 || [0, 0, 0];
    const pts = []; (F.grid || F.rings).forEach(r => r.forEach(p => pts.push([p, V.sub(p, c0)])));
    return {
      F,
      set(c, s, al) {
        const sx = Array.isArray(s) ? s[0] : (s == null ? 1 : s), sy = Array.isArray(s) ? s[1] : sx, sz = Array.isArray(s) ? s[2] : sx;
        for (let i = 0; i < pts.length; i++) { const p = pts[i][0], b = pts[i][1]; p[0] = c[0] + b[0] * sx; p[1] = c[1] + b[1] * sy; p[2] = c[2] + b[2] * sz; }
        if (al != null) F.forEach(f => { f.al = al; });
      },
      hide(h) { F.forEach(f => { f.hidden = h; }); }
    };
  };
  K.hideAll = (arr, h) => arr.forEach(o => { o.hidden = h; });
  /* 平面四邊形格（膜、片） */
  K.sheet = function (S, o, du, dv, nu, nv, col, x, h) {
    return K.surf(S, (u, v) => { let p = V.add(o, V.add(V.mul(du, u), V.mul(dv, v))); if (h) p = V.add(p, h(u, v)); return p; }, nu, nv, col, x);
  };
  /* 方盒 */
  K.box = function (S, c, s, col, x) {
    const [a, b, d] = [s[0] / 2, s[1] / 2, s[2] / 2];
    const P = (i, j, k) => [c[0] + i * a, c[1] + j * b, c[2] + k * d];
    const F = [[P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)], [P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1)], [P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1)], [P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)], [P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)], [P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1)]];
    return F.map(f => S.face(f, col, Object.assign({}, x)));
  };
  /* 螺旋線上的點 */
  K.helixPts = function (a, b, R, turns, n, ph) {
    const ax = V.sub(b, a), L = V.len(ax), [u, v, w] = K.basis(ax), out = [];
    for (let i = 0; i <= n; i++) { const t = i / n, th = (ph || 0) + t * turns * 6.2832; out.push(V.add(a, V.add(V.mul(w, t * L), V.add(V.mul(u, Math.cos(th) * R), V.mul(v, Math.sin(th) * R))))); }
    return out;
  };

  K.lab = (S, p, t, id, c, dx, dy, x) => S.label(p, t, Object.assign({ id, c, dx, dy }, x));

  /* ---------- 分子 ---------- */
  K.CPK = { H: '#f1f5f9', C: '#9ca3af', O: '#ef4444', N: '#60a5fa', P: '#f59e0b', S: '#facc15', Na: '#a78bfa', Cl: '#4ade80', Fe: '#fb923c', K: '#c084fc', Ca: '#e2e8f0', R: '#e879f9' };
  K.RAD = { H: 2.0, C: 3.2, O: 3.1, N: 3.1, P: 3.7, S: 3.7, Na: 4.4, Cl: 4.6, Fe: 4.2, K: 4.8, Ca: 4.4, R: 4.2 };
  /* atoms: [[元素, x, y, z, 顏色?], ...]；bonds: [[i, j, 鍵數]]，省略時依距離自動連 */
  K.mol = function (S, atoms, bonds, x, o) {
    o = o || {};
    const sc = o.scale || 1, c0 = o.at || [0, 0, 0];
    const A = atoms.map(a => S.sphere(V.add(c0, K.rot(V.mul([a[1], a[2], a[3]], sc), o)), (K.RAD[a[0]] || 3) * (o.rs || 1) * (sc > 1 ? 1 : 1), a[4] || K.CPK[a[0]] || '#ccc', Object.assign({ el: a[0] }, x)));
    if (!bonds) {
      bonds = [];
      const lim = (o.bond || 1.75) * sc;
      for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
        const d = V.dist(A[i].p, A[j].p), hh = A[i].el === 'H' || A[j].el === 'H';
        if (d < (hh ? lim * 0.72 : lim) && !(A[i].el === 'H' && A[j].el === 'H')) bonds.push([i, j, 1]);
      }
    }
    const B = [];
    bonds.forEach(b => {
      const p = A[b[0]].p, q = A[b[1]].p, br = (o.br || 0.9) * Math.max(1, sc * 0.35);
      if ((b[2] || 1) === 1) B.push(S.tube(p, q, br, o.bc || '#cbd5e1', Object.assign({ zb: 1 }, x)));
      else {
        const dir = V.norm(V.sub(q, p)), off = V.mul(V.norm(V.cross(dir, Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), br * 1.6);
        B.push(S.tube(V.add(p, off), V.add(q, off), br * 0.75, o.bc || '#cbd5e1', Object.assign({ zb: 1 }, x)));
        B.push(S.tube(V.sub(p, off), V.sub(q, off), br * 0.75, o.bc || '#cbd5e1', Object.assign({ zb: 1 }, x)));
      }
    });
    return { A, B, all: A.concat(B) };
  };
  /* 正六邊形 / 五邊形環座標 */
  K.ring = function (c, R, n, ph, plane) {
    const out = [];
    for (let i = 0; i < n; i++) { const t = (ph || 0) + (i / n) * 6.2832; const p = [Math.cos(t) * R, Math.sin(t) * R, 0]; out.push(V.add(c, plane === 'xz' ? [p[0], 0, p[1]] : p)); }
    return out;
  };

  /* ---------- 沿路徑流動的粒子 ---------- */
  K.flow = function (S, pts, n, size, col, speed, x) {
    const P = pts instanceof M.Path ? pts : new M.Path(pts, 8);
    const arr = [];
    for (let i = 0; i < n; i++) { const u = i / n; arr.push({ u, o: S.sphere(P.at(u), size, col, Object.assign({ nopick: true }, x)) }); }
    const f = {
      P, arr, speed: speed || 0.1, on: true,
      show(v) { f.on = v; arr.forEach(a => { a.o.hidden = !v; }); }
    };
    S.tick(dt => { if (!f.on) return; arr.forEach(a => { a.u = (a.u + dt * f.speed) % 1; if (a.u < 0) a.u += 1; a.o.p = P.at(a.u); }); });
    return f;
  };

  /* ---------- 2D 曲線圖 ---------- */
  /* cfg: {x:[a,b], y:[a,b], xt:[..], yt:[..], xl, yl, fx, fy, series:[{f|pts, c, w, dash, label, fill}], bands:[{x0,x1,c,t}], vl:[{x,c,t}], hl:[{y,c,t}], dots:[{x,y,c,t,r}], legend:true} */
  K.plot = function (cv, cfg) {
    const [c, w, h] = K.fit(cv);
    const L = cfg.padL || 48, R = cfg.padR || 14, T = cfg.padT || 16, B = cfg.padB || 36;
    const X = v => L + ((v - cfg.x[0]) / (cfg.x[1] - cfg.x[0])) * (w - L - R);
    const Y = v => h - B - ((v - cfg.y[0]) / (cfg.y[1] - cfg.y[0])) * (h - T - B);
    c.clearRect(0, 0, w, h);
    c.font = '11px ' + M.FONT; c.textBaseline = 'middle';
    (cfg.bands || []).forEach(b => { c.fillStyle = b.c; c.fillRect(X(b.x0), T, X(b.x1) - X(b.x0), h - T - B); if (b.t) { c.fillStyle = '#cbd5e1'; c.textAlign = 'center'; c.fillText(b.t, (X(b.x0) + X(b.x1)) / 2, T + 9); } });
    c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1;
    (cfg.yt || []).forEach(v => { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(w - R, Y(v)); c.stroke(); });
    (cfg.xt || []).forEach(v => { c.beginPath(); c.moveTo(X(v), T); c.lineTo(X(v), h - B); c.stroke(); });
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(L, T); c.lineTo(L, h - B); c.lineTo(w - R, h - B); c.stroke();
    c.fillStyle = '#94a3b8'; c.textAlign = 'right';
    (cfg.yt || []).forEach(v => c.fillText(cfg.fy ? cfg.fy(v) : v, L - 6, Y(v)));
    c.textAlign = 'center';
    (cfg.xt || []).forEach(v => c.fillText(cfg.fx ? cfg.fx(v) : v, X(v), h - B + 13));
    if (cfg.xl) { c.fillStyle = '#cbd5e1'; c.fillText(cfg.xl, (L + w - R) / 2, h - 9); }
    if (cfg.yl) { c.save(); c.translate(12, (T + h - B) / 2); c.rotate(-Math.PI / 2); c.fillStyle = '#cbd5e1'; c.fillText(cfg.yl, 0, 0); c.restore(); }
    (cfg.hl || []).forEach(o => { c.strokeStyle = o.c || '#64748b'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(L, Y(o.y)); c.lineTo(w - R, Y(o.y)); c.stroke(); c.setLineDash([]); if (o.t) { c.fillStyle = o.c || '#94a3b8'; c.textAlign = 'left'; c.fillText(o.t, L + 4, Y(o.y) - 8); } });
    (cfg.vl || []).forEach(o => { c.strokeStyle = o.c || '#64748b'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(X(o.x), T); c.lineTo(X(o.x), h - B); c.stroke(); c.setLineDash([]); if (o.t) { c.fillStyle = o.c || '#94a3b8'; c.textAlign = 'center'; c.fillText(o.t, X(o.x), T + 8 + (o.dy || 0)); } });
    const N = cfg.n || 160;
    (cfg.series || []).forEach(s => {
      const pts = s.pts || Array.from({ length: N + 1 }, (_, i) => { const xv = cfg.x[0] + ((cfg.x[1] - cfg.x[0]) * i) / N; return [xv, s.f(xv)]; });
      c.beginPath();
      pts.forEach((p, i) => { const px = X(p[0]), py = Y(Math.max(cfg.y[0] - (cfg.y[1] - cfg.y[0]) * 0.05, Math.min(cfg.y[1] * 1.05, p[1]))); if (i) c.lineTo(px, py); else c.moveTo(px, py); });
      if (s.fill) { c.save(); c.lineTo(X(pts[pts.length - 1][0]), Y(cfg.y[0])); c.lineTo(X(pts[0][0]), Y(cfg.y[0])); c.closePath(); c.fillStyle = s.fill; c.fill(); c.restore(); c.beginPath(); pts.forEach((p, i) => { const px = X(p[0]), py = Y(p[1]); if (i) c.lineTo(px, py); else c.moveTo(px, py); }); }
      c.strokeStyle = s.c || '#5ad1ff'; c.lineWidth = s.w || 2.4; c.setLineDash(s.dash || []); c.lineJoin = 'round'; c.stroke(); c.setLineDash([]);
    });
    (cfg.dots || []).forEach(d => { c.fillStyle = d.c || '#fff'; c.beginPath(); c.arc(X(d.x), Y(d.y), d.r || 4.5, 0, 6.2832); c.fill(); if (d.t) { c.textAlign = d.al || 'left'; c.fillStyle = d.c || '#fff'; c.fillText(d.t, X(d.x) + (d.al === 'right' ? -8 : 8), Y(d.y) - 10); } });
    if (cfg.legend !== false) {
      const ss = (cfg.series || []).filter(s => s.label); let lx = cfg.legX != null ? cfg.legX : w - R - 8, ly = T + 10;
      c.textAlign = 'right';
      ss.forEach(s => { c.fillStyle = s.c || '#5ad1ff'; c.fillRect(lx - 14, ly - 1.5, 12, 3); c.fillStyle = '#e2e8f0'; c.fillText(s.label, lx - 20, ly); ly += 16; });
    }
    return { X, Y, c, w, h, L, R, T, B };
  };

  /* ---------- 控制項 ---------- */
  K.seg = function (sel, cb, init) {
    const box = typeof sel === 'string' ? document.querySelector(sel) : sel;
    const bs = Array.from(box.querySelectorAll('[data-v]'));
    function set(v) { bs.forEach(b => b.classList.toggle('on', b.dataset.v === String(v))); cb(v); }
    bs.forEach(b => b.addEventListener('click', () => set(b.dataset.v)));
    if (init != null) set(init);
    return set;
  };
  K.range = function (id, cb, fmt) {
    const i = document.getElementById(id), o = document.getElementById(id + '-v');
    const f = () => { const v = +i.value; if (o) o.textContent = fmt ? fmt(v) : v; cb(v); };
    i.addEventListener('input', f); f();
    return { get v() { return +i.value; }, set(v) { i.value = v; f(); } };
  };
  /* .chain 方塊依序亮起 */
  K.chain = function (el, i) { if (typeof el === 'string') el = document.getElementById(el); UI.$$('.nd', el).forEach((n, k) => n.classList.toggle('on', i === 'all' || k === i || (Array.isArray(i) && i.includes(k)))); };

  G.K = K;
})(window);
