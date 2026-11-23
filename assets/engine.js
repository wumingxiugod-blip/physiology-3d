/* Mini3D — 零依賴 Canvas 3D 引擎
 * 透視投影 + 深度排序（畫家演算法）+ 拖曳旋轉 / 縮放 / 點選
 * 物件型別：d 點、s 球、t 管、disc 圓盤（紅血球）、l 標籤
 */
(function (G) {
  'use strict';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
    len: a => Math.hypot(a[0], a[1], a[2]),
    dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
    norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    rotX: (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; },
    rotY: (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; },
    rotZ: (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; }
  };

  const cc = new Map();
  function col(c) {
    if (Array.isArray(c)) return c;
    let v = cc.get(c);
    if (!v) {
      let h = String(c).replace('#', '');
      if (h.length === 3) h = h.replace(/./g, '$&$&');
      const n = parseInt(h, 16);
      v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      cc.set(c, v);
    }
    return v;
  }
  const r8 = v => Math.round(clamp(v, 0, 255));
  function shade(c, k, a) { return 'rgba(' + r8(c[0] * k) + ',' + r8(c[1] * k) + ',' + r8(c[2] * k) + ',' + (a == null ? 1 : a) + ')'; }
  function tint(c, t, k, a) {
    return 'rgba(' + r8((c[0] + (255 - c[0]) * t) * k) + ',' + r8((c[1] + (255 - c[1]) * t) * k) + ',' + r8((c[2] + (255 - c[2]) * t) * k) + ',' + (a == null ? 1 : a) + ')';
  }
  function mix(a, b, t) { a = col(a); b = col(b); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s += 0x6D2B79F5; let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fib(n) {
    const out = [], ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - ((i + 0.5) / n) * 2, r = Math.sqrt(1 - y * y), th = ga * i;
      out.push([Math.cos(th) * r, y, Math.sin(th) * r]);
    }
    return out;
  }
  /* 橢球殼面上的點：回傳 [{p, u}]，u 為單位球方向 */
  function shell(n, c, r, opt) {
    opt = opt || {};
    return fib(n).map(u => {
      let p = [u[0] * r[0], u[1] * r[1], u[2] * r[2]];
      if (opt.noise) p = V.mul(p, opt.noise(u));
      if (opt.rz) p = V.rotZ(p, opt.rz);
      if (opt.rx) p = V.rotX(p, opt.rx);
      if (opt.ry) p = V.rotY(p, opt.ry);
      return { p: V.add(c, p), u };
    });
  }
  function insideE(p, c, r) {
    const x = (p[0] - c[0]) / r[0], y = (p[1] - c[1]) / r[1], z = (p[2] - c[2]) / r[2];
    return x * x + y * y + z * z < 1;
  }

  function spline(pts, n) {
    n = n || 10;
    if (pts.length < 2) return pts.map(p => p.slice());
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i ? i - 1 : 0], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let j = 0; j < n; j++) {
        const t = j / n, t2 = t * t, t3 = t2 * t, q = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          q[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
        }
        out.push(q);
      }
    }
    out.push(pts[pts.length - 1].slice());
    return out;
  }
  class Path {
    constructor(pts, smooth) {
      this.pts = smooth === false ? pts.map(p => p.slice()) : spline(pts, smooth || 10);
      this.cum = [0];
      for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + V.dist(this.pts[i], this.pts[i - 1]));
      this.L = this.cum[this.cum.length - 1] || 1;
    }
    at(t) {
      t = clamp(t, 0, 1);
      const d = t * this.L, c = this.cum;
      let lo = 0, hi = c.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] < d) lo = m; else hi = m; }
      const seg = c[hi] - c[lo] || 1;
      return V.lerp(this.pts[lo], this.pts[hi], (d - c[lo]) / seg);
    }
  }

  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }

  const FONT = '"Segoe UI","Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif';

  class Scene {
    constructor(canvas, o) {
      o = o || {};
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.objs = []; this._list = []; this._labels = [];
      this.radius = o.radius || 100;
      this.dist = o.dist || this.radius * 3.4;
      this.fov = o.fov || (0.46 * this.dist) / this.radius;
      this.minDist = o.minDist || this.radius * 1.2;
      this.maxDist = o.maxDist || this.dist * 2.4;
      this.yaw = o.yaw != null ? o.yaw : 0.5;
      this.pitch = o.pitch != null ? o.pitch : 0.2;
      this.target = o.target || [0, 0, 0];
      this.autoRotate = o.autoRotate != null ? o.autoRotate : 0.15;
      this.showLabels = o.labels !== false;
      this.home = { yaw: this.yaw, pitch: this.pitch, dist: this.dist, target: this.target.slice() };
      this.time = 0; this.speed = 1; this.paused = false;
      this.onFrame = null; this.onPick = null; this.onHover = null; this.onDraw = null;
      this.hover = null; this._idle = 0; this._active = false;
      this._evt(); this._resize();
      if (G.ResizeObserver) new ResizeObserver(() => this._resize()).observe(canvas);
      this.visible = true;
      if (G.IntersectionObserver) new IntersectionObserver(es => { this.visible = es[es.length - 1].isIntersecting; }).observe(canvas);
      let last = performance.now();
      const loop = now => {
        const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
        if (this.visible && !document.hidden) this.step(dt);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    step(dt) {
      const d = this.paused ? 0 : dt * this.speed;
      this.time += d;
      if (this._idle > 0) this._idle -= dt;
      else if (this.autoRotate && !this._drag) this.yaw += this.autoRotate * dt;
      if (this.onFrame) this.onFrame(d, this.time);
      this.render();
    }
    resetView() { Object.assign(this, { yaw: this.home.yaw, pitch: this.home.pitch, dist: this.home.dist }); this.target = this.home.target.slice(); }
    zoom(f) { this.dist = clamp(this.dist * f, this.minDist, this.maxDist); this._idle = 4; }
    _resize() {
      const r = this.cv.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const dpr = Math.min(2, G.devicePixelRatio || 1);
      this.w = r.width; this.h = r.height;
      this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    _evt() {
      const cv = this.cv, pts = new Map();
      let sx = 0, sy = 0, lx = 0, ly = 0, moved = false;
      cv.style.touchAction = 'none';
      const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      cv.addEventListener('pointerdown', e => {
        this._active = true;
        try { cv.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        pts.set(e.pointerId, [e.clientX, e.clientY]);
        if (pts.size === 1) { sx = lx = e.clientX; sy = ly = e.clientY; moved = false; this._drag = true; }
      });
      cv.addEventListener('pointermove', e => {
        if (pts.has(e.pointerId)) {
          if (pts.size === 2) {
            const prev = pts.get(e.pointerId);
            const other = [...pts.entries()].find(([k]) => k !== e.pointerId)[1];
            const d0 = Math.hypot(prev[0] - other[0], prev[1] - other[1]);
            const d1 = Math.hypot(e.clientX - other[0], e.clientY - other[1]);
            if (d1 > 0 && d0 > 0) this.zoom(d0 / d1);
            pts.set(e.pointerId, [e.clientX, e.clientY]); moved = true; return;
          }
          const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
          if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 5) moved = true;
          this.yaw -= dx * 0.008;
          this.pitch = clamp(this.pitch + dy * 0.008, -1.45, 1.45);
          this._idle = 4;
          pts.set(e.pointerId, [e.clientX, e.clientY]);
        } else if (e.pointerType === 'mouse') {
          const [x, y] = local(e); const h = this.pick(x, y);
          if (h !== this.hover) { this.hover = h; cv.style.cursor = h ? 'pointer' : 'grab'; if (this.onHover) this.onHover(h); }
        }
      });
      const up = e => {
        if (!pts.has(e.pointerId)) return;
        pts.delete(e.pointerId);
        if (pts.size === 0) {
          this._drag = false;
          if (!moved) { const [x, y] = local(e); const h = this.pick(x, y); if (this.onPick) this.onPick(h); }
        }
      };
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', e => { pts.delete(e.pointerId); if (!pts.size) this._drag = false; });
      cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') this._active = false; });
      cv.addEventListener('wheel', e => {
        if (!this._active) return; // 先點一下畫面才用滾輪縮放，避免捲動頁面時誤觸
        e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.0012));
      }, { passive: false });
    }
    _prep() {
      this._cy = Math.cos(this.yaw); this._sy = Math.sin(this.yaw);
      this._cp = Math.cos(this.pitch); this._sp = Math.sin(this.pitch);
      this._f = Math.min(this.w, this.h) * this.fov;
    }
    proj(p, out) {
      out = out || {};
      const x = p[0] - this.target[0], y = p[1] - this.target[1], z = p[2] - this.target[2];
      const x1 = x * this._cy + z * this._sy, z1 = -x * this._sy + z * this._cy;
      const y2 = y * this._cp + z1 * this._sp, z2 = -y * this._sp + z1 * this._cp;
      const zc = z2 + this.dist, s = this._f / Math.max(zc, 1);
      out.x = this.w / 2 + x1 * s; out.y = this.h / 2 - y2 * s; out.z = zc; out.s = s;
      return out;
    }
    add(o) { this.objs.push(o); return o; }
    dot(p, r, c, x) { return this.add(Object.assign({ t: 'd', p, r, c }, x)); }
    sphere(p, r, c, x) { return this.add(Object.assign({ t: 's', p, r, c }, x)); }
    tube(a, b, r, c, x) { return this.add(Object.assign({ t: 't', a, b, r, c }, x)); }
    disc(p, r, c, x) { return this.add(Object.assign({ t: 'disc', p, r, c, ang: 0, tilt: 0 }, x)); }
    label(p, text, x) { return this.add(Object.assign({ t: 'l', p, text }, x)); }
    face(pts, c, x) { return this.add(Object.assign({ t: 'f', pts, c }, x)); }
    path(pts, r, c, x, n) {
      const P = new Path(pts, n), tubes = [];
      const r0 = Array.isArray(r) ? r[0] : r, r1 = Array.isArray(r) ? r[1] : r;
      const m = P.pts.length - 1;
      for (let i = 0; i < m; i++) {
        const t = m > 1 ? i / (m - 1) : 0;
        tubes.push(this.tube(P.pts[i], P.pts[i + 1], r0 + (r1 - r0) * t, c, Object.assign({ u: (P.cum[i] + P.cum[i + 1]) / 2 / P.L }, x)));
      }
      P.tubes = tubes;
      return P;
    }
    each(f) { this.objs.forEach(f); }
    where(f) { return this.objs.filter(f); }
    remove(o) { const i = this.objs.indexOf(o); if (i >= 0) this.objs.splice(i, 1); }
    clear() { this.objs.length = 0; }

    _glow(x, y, r, c, a) {
      const ctx = this.ctx; c = col(c);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, shade(c, 1, 0.6 * a)); g.addColorStop(1, shade(c, 1, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
      ctx.restore();
    }
    _label(o) {
      const ctx = this.ctx, p = o._p, fs = o.size || 12;
      const x = p.x + (o.dx || 0), y = p.y + (o.dy || 0);
      ctx.font = '600 ' + fs + 'px ' + FONT;
      const tw = ctx.measureText(o.text).width, c = col(o.c || '#e2e8f0'), al = o.dim ? 0.25 : 1;
      if (o.dx || o.dy) {
        ctx.strokeStyle = shade(c, 1, 0.55 * al); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x, y); ctx.stroke();
      }
      const pw = tw + 14, ph = fs + 9, bx = x - pw / 2, by = y - ph / 2;
      o._bb = [bx, by, pw, ph];
      ctx.fillStyle = 'rgba(6,10,22,' + 0.78 * al + ')'; rrect(ctx, bx, by, pw, ph, ph / 2); ctx.fill();
      ctx.strokeStyle = shade(c, 1, (o.hl ? 1 : 0.5) * al); ctx.lineWidth = o.hl ? 1.6 : 1; ctx.stroke();
      ctx.fillStyle = shade(c, 1.12, al); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(o.text, x, y + 0.5);
    }
    render() {
      const ctx = this.ctx;
      if (!this.w || !this.h) { this._resize(); if (!this.w) return; }
      this._prep();
      ctx.clearRect(0, 0, this.w, this.h);
      const L = this._list, LB = this._labels; L.length = 0; LB.length = 0;
      for (let i = 0; i < this.objs.length; i++) {
        const o = this.objs[i];
        if (o.hidden) continue;
        if (o.t === 't') {
          o._a = this.proj(o.a, o._a); o._b = this.proj(o.b, o._b);
          if (o._a.z < 4 || o._b.z < 4) continue;
          o._z = (o._a.z + o._b.z) * 0.5 + (o.zb || 0);
        } else if (o.t === 'f') {
          const q = o._q || (o._q = []), P = o.pts; let zs = 0, bad = false;
          for (let j = 0; j < P.length; j++) { q[j] = this.proj(P[j], q[j]); if (q[j].z < 4) bad = true; zs += q[j].z; }
          if (bad) continue;
          o._z = zs / P.length + (o.zb || 0);
        } else {
          o._p = this.proj(o.p, o._p);
          if (o._p.z < 4) continue;
          o._z = o._p.z + (o.zb || 0);
        }
        if (o.t === 'l') { if (this.showLabels || o.force) LB.push(o); } else L.push(o);
      }
      L.sort((a, b) => b._z - a._z);
      const R = this.radius, D = this.dist;
      for (let i = 0; i < L.length; i++) {
        const o = L[i];
        let k = 0.36 + 0.64 * clamp((D + R - o._z) / (2 * R), 0, 1.12);
        if (o.hl) k *= 1.35;
        const a = (o.al == null ? 1 : o.al) * (o.dim ? 0.1 : 1);
        if (a <= 0.004) continue;
        const c = col(o.c);
        if (o.t === 'd') {
          const p = o._p, rr = Math.max(0.55, o.r * p.s);
          if (o.glow > 0) this._glow(p.x, p.y, rr * (2.2 + o.glow * 2.5), o.gc || c, Math.min(1, o.glow));
          ctx.fillStyle = shade(c, k, a);
          if (rr < 1.1) ctx.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2);
          else { ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 6.2832); ctx.fill(); }
        } else if (o.t === 's') {
          const p = o._p, rr = Math.max(0.8, o.r * p.s);
          if (o.glow > 0) this._glow(p.x, p.y, rr * (1.8 + o.glow * 1.6), o.gc || c, Math.min(1, o.glow));
          const g = ctx.createRadialGradient(p.x - rr * 0.35, p.y - rr * 0.4, rr * 0.06, p.x, p.y, rr);
          g.addColorStop(0, tint(c, 0.6, k, a)); g.addColorStop(0.45, shade(c, k, a)); g.addColorStop(1, shade(c, k * 0.32, a));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 6.2832); ctx.fill();
          if (o.hl) { ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5; ctx.stroke(); }
        } else if (o.t === 't') {
          const A = o._a, B = o._b, lw = Math.max(0.8, o.r * (A.s + B.s));
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
          if (o.glow > 0) {
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = shade(col(o.gc || o.c), 1, 0.4 * Math.min(1, o.glow) * a);
            ctx.lineWidth = lw * (1.8 + o.glow * 1.5); ctx.stroke(); ctx.restore();
          }
          if (o.flat) { ctx.strokeStyle = shade(c, k, a); ctx.lineWidth = lw; ctx.stroke(); }
          else {
            ctx.strokeStyle = shade(c, k * 0.5, a); ctx.lineWidth = lw; ctx.stroke();
            ctx.strokeStyle = shade(c, k, a); ctx.lineWidth = lw * 0.66; ctx.stroke();
            ctx.strokeStyle = tint(c, 0.55, k, a * 0.55); ctx.lineWidth = lw * 0.22; ctx.stroke();
          }
        } else if (o.t === 'f') {
          const q = o._q, P = o.pts;
          const nx = V.cross(V.sub(P[1], P[0]), V.sub(P[2], P[0])), nl = V.len(nx) || 1;
          const lam = 0.42 + 0.58 * Math.abs((nx[0] * 0.36 + nx[1] * 0.8 + nx[2] * 0.48) / nl);
          ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y);
          for (let j = 1; j < q.length; j++) ctx.lineTo(q[j].x, q[j].y);
          ctx.closePath();
          if (o.glow > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = shade(col(o.gc || o.c), 1, 0.35 * Math.min(1, o.glow) * a); ctx.fill(); ctx.restore(); }
          ctx.fillStyle = shade(c, k * lam, a); ctx.fill();
          if (o.st) { ctx.strokeStyle = shade(col(o.st), 1, a * (o.sa || 0.55)); ctx.lineWidth = o.lw || 0.7; ctx.stroke(); }
          else if (a > 0.97) { ctx.strokeStyle = shade(c, k * lam, a); ctx.lineWidth = 0.6; ctx.stroke(); }
        } else if (o.t === 'disc') {
          const p = o._p, rr = Math.max(1, o.r * p.s), sq = 0.22 + 0.78 * Math.abs(Math.cos(o.tilt || 0));
          if (o.glow > 0) this._glow(p.x, p.y, rr * 2.4, o.gc || c, Math.min(1, o.glow));
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(o.ang || 0); ctx.scale(1, sq);
          const g = ctx.createRadialGradient(0, 0, rr * 0.05, 0, 0, rr);
          g.addColorStop(0, shade(c, k * 0.5, a)); g.addColorStop(0.5, shade(c, k * 0.9, a));
          g.addColorStop(0.82, tint(c, 0.28, k, a)); g.addColorStop(1, shade(c, k * 0.55, a));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rr, 0, 6.2832); ctx.fill();
          ctx.restore();
        }
      }
      for (let i = 0; i < LB.length; i++) this._label(LB[i]);
      if (this.onDraw) this.onDraw(ctx, this);
    }
    pick(mx, my) {
      for (let i = this._labels.length - 1; i >= 0; i--) {
        const o = this._labels[i], b = o._bb;
        if (o.id && b && !o.dim && mx >= b[0] && mx <= b[0] + b[2] && my >= b[1] && my <= b[1] + b[3]) return o;
      }
      let best = null, bz = Infinity;
      for (let i = 0; i < this._list.length; i++) {
        const o = this._list[i];
        if (!o.id || o.nopick || o.dim || (o.al != null && o.al < 0.05)) continue;
        let hit = false;
        if (o.t === 't') { const A = o._a, B = o._b; hit = segDist(mx, my, A.x, A.y, B.x, B.y) < Math.max(5, o.r * (A.s + B.s) * 0.5 + 2); }
        else if (o.t === 'f') { const q = o._q; for (let a = 0, b = q.length - 1; a < q.length; b = a++) { if (((q[a].y > my) !== (q[b].y > my)) && (mx < (q[b].x - q[a].x) * (my - q[a].y) / (q[b].y - q[a].y) + q[a].x)) hit = !hit; } }
        else { const p = o._p; hit = Math.hypot(mx - p.x, my - p.y) < Math.max(5, o.r * p.s + 1.5); }
        if (hit && o._z < bz) { bz = o._z; best = o; }
      }
      return best;
    }
  }

  /* 疊加在 3D 舞台右上角的視角控制鈕 */
  function controls(scene, stage, opt) {
    opt = opt || {};
    const box = document.createElement('div');
    box.className = 'vctl';
    const btns = [
      ['＋', '放大', () => scene.zoom(0.85)],
      ['－', '縮小', () => scene.zoom(1.18)],
      ['⟲', '重設視角', () => scene.resetView()],
      ['🏷', '顯示/隱藏標籤', b => { scene.showLabels = !scene.showLabels; b.classList.toggle('off', !scene.showLabels); }],
      ['⏯', '自動旋轉', b => { if (scene.autoRotate) { scene._ar = scene.autoRotate; scene.autoRotate = 0; b.classList.add('off'); } else { scene.autoRotate = scene._ar || 0.15; b.classList.remove('off'); } }],
      ['⛶', '全螢幕', () => {
        const fs = document.fullscreenElement;
        if (fs) document.exitFullscreen(); else if (stage.requestFullscreen) stage.requestFullscreen();
      }]
    ];
    btns.forEach(([t, title, fn]) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.title = title; b.setAttribute('aria-label', title);
      b.addEventListener('click', e => { e.stopPropagation(); fn(b); });
      box.appendChild(b);
    });
    stage.appendChild(box);
    return box;
  }

  G.Mini3D = { Scene, Path, V, col, mix, shade, tint, rng, fib, shell, insideE, spline, clamp, controls, rrect, FONT };
})(window);
