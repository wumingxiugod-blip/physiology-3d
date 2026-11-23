/* 共用介面元件：導覽列、快閃卡、測驗、3D 傾斜卡片、3D 旋轉環、立體長條圖、背景粒子 */
(function (G) {
  'use strict';
  const UI = {};
  UI.$ = (s, r) => (r || document).querySelector(s);
  UI.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  UI.h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* 私密模式等情況忽略 */ } }
  };
  UI.store = store;

  /* 頂部導覽：自動抓 [data-nav] 區塊 */
  UI.nav = function () {
    const nav = document.getElementById('topnav'); if (!nav) return;
    const secs = UI.$$('[data-nav]');
    secs.forEach(s => { const a = UI.h('a', '', s.dataset.nav); a.href = '#' + s.id; nav.appendChild(a); });
    if (!G.IntersectionObserver) return;
    const io = new IntersectionObserver(es => {
      es.forEach(e => {
        if (!e.isIntersecting) return;
        UI.$$('a', nav).forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id));
        const on = UI.$('a.on', nav);
        if (on) nav.scrollTo({ left: on.offsetLeft - nav.clientWidth / 2 + on.clientWidth / 2, behavior: 'smooth' });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    secs.forEach(s => io.observe(s));
  };

  /* 3D 翻轉快閃卡 */
  UI.flashcards = function (el, cards, key) {
    key = 'fc:' + (key || location.pathname);
    const bar = UI.h('div', 'fc-bar', '<span class="fc-count"></span><button class="btn sm" data-a="shuf">🔀 洗牌</button><button class="btn sm" data-a="flip">全部翻面</button><button class="btn sm" data-a="hide">隱藏已熟</button><button class="btn sm" data-a="reset">重置</button>');
    const grid = UI.h('div', 'fc-grid');
    el.append(bar, grid);
    let order = cards.map((_, i) => i), hideKnown = false;
    const known = new Set(store.get(key, []));
    function upd() { UI.$('.fc-count', bar).textContent = '已熟 ' + known.size + ' / ' + cards.length + ' 張'; store.set(key, Array.from(known)); }
    function draw() {
      grid.innerHTML = '';
      order.forEach(i => {
        if (hideKnown && known.has(i)) return;
        const c = cards[i];
        const d = UI.h('div', 'fc' + (known.has(i) ? ' known' : ''),
          '<div class="fc-in"><div class="fc-f"><span class="fc-tag">' + (c.tag || ('#' + (i + 1))) + '</span><div class="fc-q">' + c.f + '</div><span class="fc-hint">點擊翻面</span></div>' +
          '<div class="fc-b"><div class="fc-a">' + c.b + '</div><button class="fc-ok" type="button">' + (known.has(i) ? '✓ 已熟（取消）' : '標記為已熟') + '</button></div></div>');
        d.addEventListener('click', e => {
          const ok = e.target.closest('.fc-ok');
          if (ok) {
            e.stopPropagation();
            if (known.has(i)) known.delete(i); else known.add(i);
            d.classList.toggle('known', known.has(i));
            ok.textContent = known.has(i) ? '✓ 已熟（取消）' : '標記為已熟';
            upd(); return;
          }
          d.classList.toggle('flip');
        });
        grid.appendChild(d);
      });
      upd();
    }
    bar.addEventListener('click', e => {
      const a = e.target.dataset && e.target.dataset.a; if (!a) return;
      if (a === 'shuf') { order.sort(() => Math.random() - 0.5); draw(); }
      else if (a === 'flip') { const all = UI.$$('.fc', grid); const any = all.some(x => !x.classList.contains('flip')); all.forEach(x => x.classList.toggle('flip', any)); }
      else if (a === 'hide') { hideKnown = !hideKnown; e.target.classList.toggle('on', hideKnown); draw(); }
      else if (a === 'reset') { known.clear(); order = cards.map((_, i) => i); draw(); }
    });
    draw();
  };

  /* 選擇題自我測驗 */
  UI.quiz = function (el, qs) {
    const head = UI.h('div', 'qz-head', '<div class="qz-score"></div><div class="qz-prog"><i></i></div><button class="btn sm" type="button">🔀 重新作答</button>');
    const list = UI.h('div', 'qz-list');
    el.append(head, list);
    let score = 0, done = 0;
    function upd() {
      const s = UI.$('.qz-score', head);
      s.innerHTML = done === qs.length ? '🎉 完成！得分 <b>' + score + '</b> / ' + qs.length + '（' + Math.round((score / qs.length) * 100) + '%）' : '得分 <b>' + score + '</b> / ' + qs.length + '　已答 ' + done;
      UI.$('.qz-prog i', head).style.width = (done / qs.length) * 100 + '%';
    }
    function build(shuffle) {
      list.innerHTML = ''; score = 0; done = 0; upd();
      const idx = qs.map((_, i) => i); if (shuffle) idx.sort(() => Math.random() - 0.5);
      idx.forEach((qi, n) => {
        const q = qs[qi];
        const card = UI.h('div', 'qz-card', '<div class="qz-n">Q' + (n + 1) + (q.tag ? ' · ' + q.tag : '') + '</div><div class="qz-q">' + q.q + '</div><div class="qz-opts"></div><div class="qz-exp"></div>');
        const opts = UI.$('.qz-opts', card);
        q.o.forEach((t, oi) => {
          const b = UI.h('button', 'qz-o', '<span>' + 'ABCDE'[oi] + '</span><div>' + t + '</div>'); b.type = 'button';
          b.addEventListener('click', () => {
            if (card.dataset.done) return;
            card.dataset.done = '1'; done++;
            const ok = oi === q.a; if (ok) score++;
            b.classList.add(ok ? 'ok' : 'bad'); opts.children[q.a].classList.add('ok');
            const ex = UI.$('.qz-exp', card); ex.innerHTML = (ok ? '✅ 正確！ ' : '❌ 正解是 ' + 'ABCDE'[q.a] + '。 ') + (q.e || ''); ex.classList.add('show');
            upd();
          });
          opts.appendChild(b);
        });
        list.appendChild(card);
      });
    }
    UI.$('button', head).addEventListener('click', () => build(true));
    build(false);
  };

  /* 滑鼠傾斜的偽 3D 卡片 */
  UI.tilt = function (root) {
    if (G.matchMedia && G.matchMedia('(hover: none)').matches) return;
    UI.$$('.tilt', root).forEach(el => {
      if (el._tilt) return; el._tilt = 1;
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = 'perspective(900px) rotateY(' + (x * 9).toFixed(2) + 'deg) rotateX(' + (-y * 9).toFixed(2) + 'deg) translateZ(6px)';
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  };

  /* CSS 3D 旋轉環（旋轉木馬） */
  UI.ring = function (el, items, opt) {
    opt = opt || {};
    el.classList.add('ring-stage');
    const ring = UI.h('div', 'ring'); el.appendChild(ring);
    const n = items.length, step = 360 / n;
    let rot = 0, target = 0, W = 0, R = 0, dragging = false, moved = false, lastX = 0, auto = opt.auto || 0, idle = 0, cur = -1;
    const nodes = items.map((it, i) => {
      const c = UI.h('div', 'ring-item', opt.render(it, i));
      c.addEventListener('click', () => { if (moved) return; go(i); if (opt.onSelect) opt.onSelect(it, i); });
      ring.appendChild(c); return c;
    });
    function layout() {
      W = Math.min(opt.w || 220, el.clientWidth * 0.62);
      R = Math.round(W / 2 / Math.tan(Math.PI / n) + (opt.gap || 30));
      nodes.forEach((c, i) => { c.style.width = W + 'px'; c.style.marginLeft = -W / 2 + 'px'; c.style.transform = 'rotateY(' + i * step + 'deg) translateZ(' + R + 'px)'; });
      nodes.forEach(c => { c.style.marginTop = -c.offsetHeight / 2 + 'px'; });
    }
    function front() { return ((Math.round(-rot / step) % n) + n) % n; }
    function apply() {
      ring.style.transform = 'translateZ(' + -R + 'px) rotateY(' + rot + 'deg)';
      nodes.forEach((c, i) => {
        const ang = ((i * step + rot) % 360 + 540) % 360 - 180;
        const k = Math.cos((ang * Math.PI) / 180);
        c.style.opacity = (0.18 + 0.82 * Math.max(0, k)).toFixed(3);
        c.style.pointerEvents = k > 0.2 ? 'auto' : 'none';
      });
      const f = front();
      if (f !== cur) { cur = f; nodes.forEach((c, i) => c.classList.toggle('front', i === f)); if (opt.onFront) opt.onFront(items[f], f); }
    }
    function go(i) { const base = -i * step; const k = Math.round((rot - base) / 360); target = base + k * 360; idle = 5; }
    function tick() {
      if (!dragging) {
        if (auto && idle <= 0) { target -= auto; }
        rot += (target - rot) * 0.12;
      }
      if (idle > 0) idle -= 1 / 60;
      apply(); requestAnimationFrame(tick);
    }
    el.addEventListener('pointerdown', e => { dragging = true; moved = false; lastX = e.clientX; idle = 5; });
    G.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX; lastX = e.clientX;
      if (Math.abs(dx) > 1) moved = true;
      rot += dx * 0.35; target = rot;
    });
    G.addEventListener('pointerup', () => {
      if (!dragging) return; dragging = false;
      target = Math.round(rot / step) * step;
      setTimeout(() => { moved = false; }, 30);
    });
    const prev = UI.h('button', 'ring-nav prev', '‹'), next = UI.h('button', 'ring-nav next', '›');
    prev.type = next.type = 'button';
    prev.addEventListener('click', e => { e.stopPropagation(); target += step; idle = 5; });
    next.addEventListener('click', e => { e.stopPropagation(); target -= step; idle = 5; });
    prev.addEventListener('pointerdown', e => e.stopPropagation());
    next.addEventListener('pointerdown', e => e.stopPropagation());
    el.append(prev, next);
    layout(); apply(); requestAnimationFrame(tick);
    if (G.ResizeObserver) new ResizeObserver(layout).observe(el);
    return { go, front };
  };

  /* 立體（等角）長條圖 */
  UI.bars = function (el, data, opt) {
    opt = opt || {};
    el.classList.add('bars3d');
    const max = opt.max || Math.max.apply(null, data.map(d => d.v));
    data.forEach(d => {
      const b = UI.h('div', 'b3',
        '<div class="b3-val">' + (d.text != null ? d.text : d.v) + '</div>' +
        '<div class="b3-bar" style="--c:' + (d.c || 'var(--acc)') + '" data-h="' + ((d.v / max) * 100).toFixed(1) + '"><i class="b3-top"></i><i class="b3-side"></i></div>' +
        '<div class="b3-lab">' + d.label + '</div>');
      el.appendChild(b);
    });
    const grow = () => UI.$$('.b3-bar', el).forEach(b => { b.style.height = b.dataset.h + '%'; });
    if (G.IntersectionObserver) {
      const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { grow(); io.disconnect(); } }, { threshold: 0.3 });
      io.observe(el);
    } else grow();
  };

  /* 逐步播放器：steps = [{t, d}]，onStep(i) */
  UI.stepper = function (el, steps, onStep, opt) {
    opt = opt || {};
    el.classList.add('stepper');
    const list = UI.h('ol', 'st-list');
    steps.forEach((s, i) => {
      const li = UI.h('li', '', '<b>' + s.t + '</b>' + (s.d ? '<span>' + s.d + '</span>' : ''));
      li.addEventListener('click', () => set(i));
      list.appendChild(li);
    });
    const ctl = UI.h('div', 'st-ctl', '<button class="btn sm" data-a="prev" type="button">◀ 上一步</button><button class="btn sm on" data-a="play" type="button">⏸ 暫停</button><button class="btn sm" data-a="next" type="button">下一步 ▶</button>');
    el.append(ctl, list);
    let cur = 0, playing = opt.autoplay !== false, timer = 0;
    const dur = opt.dur || 3200;
    function set(i, fromTimer) {
      cur = (i + steps.length) % steps.length;
      UI.$$('li', list).forEach((li, k) => { li.classList.toggle('on', k === cur); li.classList.toggle('past', k < cur); });
      const li = list.children[cur];
      const sc = [el, el.parentElement].find(x => x && x.scrollHeight > x.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(x).overflowY));
      if (sc && li) {
        const top = li.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 60;
        sc.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
      onStep(cur);
      if (!fromTimer) { playing = false; syncBtn(); }
      timer = 0;
    }
    function syncBtn() { const b = UI.$('[data-a=play]', ctl); b.textContent = playing ? '⏸ 暫停' : '▶ 自動播放'; b.classList.toggle('on', playing); }
    ctl.addEventListener('click', e => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'prev') set(cur - 1); else if (a === 'next') set(cur + 1);
      else { playing = !playing; syncBtn(); }
    });
    let last = performance.now();
    (function loop(now) {
      const dt = Math.max(0, now - last); last = now;
      if (playing && !document.hidden) { timer += dt; if (timer > (steps[cur].dur || dur)) set(cur + 1, true); }
      requestAnimationFrame(loop);
    })(last);
    set(0, true); syncBtn();
    return { set, get: () => cur };
  };

  /* 背景：緩慢漂浮的景深粒子 */
  UI.bgfx = function () {
    const cv = document.getElementById('bgfx'); if (!cv) return;
    const ctx = cv.getContext('2d');
    const acc = getComputedStyle(document.body).getPropertyValue('--acc').trim() || '#5ad1ff';
    const c = G.Mini3D ? G.Mini3D.col(acc) : [90, 209, 255];
    let w, h; const N = 70, P = [];
    function rs() { w = cv.width = innerWidth; h = cv.height = innerHeight; }
    rs(); addEventListener('resize', rs);
    for (let i = 0; i < N; i++) P.push({ x: Math.random(), y: Math.random(), z: Math.random() * 0.9 + 0.1 });
    let sy = 0;
    (function loop() {
      ctx.clearRect(0, 0, w, h);
      const scroll = G.scrollY || 0;
      for (const p of P) {
        p.y -= 0.00008 / p.z; if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
        const yy = ((p.y * h - scroll * 0.08 * (1 - p.z)) % h + h) % h;
        const r = (1 - p.z) * 2.2 + 0.4;
        ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (0.08 + (1 - p.z) * 0.32).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x * w, yy, r, 0, 6.2832); ctx.fill();
      }
      sy = scroll;
      requestAnimationFrame(loop);
    })();
  };

  UI.boot = function () {
    UI.nav(); UI.tilt(); UI.bgfx();
    const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
  };

  G.UI = UI;
})(window);
