// PINION home — wireframe orb that only LOOKS AT the mouse (no auto-rotation)
(() => {
  const cv = document.getElementById('orb');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, DPR = Math.min(devicePixelRatio || 1, 3);
  function resize() {
    const r = cv.parentElement.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = W * DPR; cv.height = H * DPR;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize();
  addEventListener('resize', resize);

  // 점 구름 (피보나치 구)
  const N = 380, PTS = [];
  const GA = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = GA * i;
    PTS.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  // 각 점의 최근접 3개와 변 연결
  const EDGES = [];
  for (let i = 0; i < N; i++) {
    const d = PTS.map((p, j) => [j, (p[0]-PTS[i][0])**2 + (p[1]-PTS[i][1])**2 + (p[2]-PTS[i][2])**2])
      .filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 4);
    for (const [j] of d) if (i < j) EDGES.push([i, j]); // 최근접 4개
  }
  // 배경 별
  const STARS = Array.from({ length: 70 }, (_, i) => {
    const s = Math.sin(i * 127.1) * 43758.5453;
    const t = Math.sin(i * 311.7) * 12345.6789;
    return [s - Math.floor(s), t - Math.floor(t)];
  });

  // 마우스만 쳐다봄: 목표 각도 = 포인터 위치. 자동 회전 없음.
  let rx = -0.28, ry = 0.5, trx = -0.28, try_ = 0.5;
  addEventListener('pointermove', (e) => {
    const nx = e.clientX / innerWidth - 0.5;
    const ny = e.clientY / innerHeight - 0.5;
    try_ = -nx * 1.6;
    trx = -0.28 - ny * 1.2;
  }, { passive: true });

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    // 도트 우주 파도 (구 배경 전용 — 촘촘 격자, 짧은 주기 두 파동)
    const GAP = 13, t = now || 0;
    const cols = Math.ceil(W / GAP) + 1, rows = Math.ceil(H / GAP) + 1;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = i * GAP + (j % 2) * GAP / 2, y = j * GAP;
        const d = Math.hypot(x - W * 0.5, y - H * 0.5);
        const w = Math.sin(d * 0.055 - t * 0.0032) * 0.5 + 0.5;       // 방사 파동(빠른 주기)
        const w2 = Math.sin((x * 0.6 + y) * 0.028 + t * 0.0021) * 0.5 + 0.5; // 대각 파동
        const a = 0.04 + w * w2 * 0.38;
        const sz = 1 + w * w2 * 1.6;
        ctx.fillStyle = `rgba(51,240,106,${a.toFixed(3)})`;
        ctx.fillRect(x, y, sz, sz);
      }
    }
    // 별
    ctx.fillStyle = 'rgba(90,140,95,.5)';
    for (const [sx, sy] of STARS) ctx.fillRect(sx * W, sy * H, 1, 1);

    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) * 0.36;
    const cosX = Math.cos(rx), sinX = Math.sin(rx), cosY = Math.cos(ry), sinY = Math.sin(ry);
    const proj = PTS.map(([x, y, z]) => {
      const y1 = y * cosX - z * sinX, z1 = y * sinX + z * cosX;
      const x2 = x * cosY + z1 * sinY, z2 = -x * sinY + z1 * cosY;
      const f = 2.6 / (2.6 - z2);
      return [cx + x2 * R * f, cy + y1 * R * f, z2];
    });
    ctx.strokeStyle = 'rgba(51,240,106,.26)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const [a, b] of EDGES) {
      ctx.moveTo(proj[a][0], proj[a][1]);
      ctx.lineTo(proj[b][0], proj[b][1]);
    }
    ctx.stroke();
    for (const [x, y, z] of proj) {
      const a = 0.25 + (z + 1) / 2 * 0.75;
      ctx.fillStyle = `rgba(120,255,150,${a.toFixed(2)})`;
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }

  // ---- TOP 셀 캐러셀: 3개(넓음)/2개(좁음)/1개(모바일) 동시 표시, 한 칸씩 이동 ----
  try {
    const car = document.querySelector('.hud-cells');
    const track = car && car.querySelector('.car-track');
    if (car && track) {
      const n = track.children.length;
      let idx = 0, timer = null;
      const visible = () => Math.max(1, Math.round(car.clientWidth / track.children[0].getBoundingClientRect().width));
      const maxIdx = () => Math.max(0, n - visible());
      const show = (i) => {
        const mx = maxIdx();
        idx = i > mx ? 0 : (i < 0 ? mx : i);
        track.style.transform = `translateX(-${idx * (100 / visible())}%)`;
      };
      const next = () => show(idx + 1), prev = () => show(idx - 1);
      const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
      const start = () => {
        if (timer || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        timer = setInterval(next, 5000);
      };
      car.addEventListener('pointerenter', stop);
      car.addEventListener('pointerleave', start);
      let tx = null;
      car.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; stop(); }, { passive: true });
      car.addEventListener('touchend', (e) => {
        if (tx === null) return;
        const dx = e.changedTouches[0].clientX - tx;
        if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
        tx = null; start();
      }, { passive: true });
      addEventListener('resize', () => show(idx));
      show(0); start();
    }
  } catch (err) { console.error('carousel disabled:', err); }

  // ---- 카테고리 클라이언트 필터링 (새로고침 없이 목록만 교체) — 실패해도 구는 계속 ----
  try {
  const dataEl = document.getElementById('posts-data');
  const POSTS = dataEl ? JSON.parse(dataEl.textContent) : [];
  const logEl = document.querySelector('.hud-log');
  const headEl = document.querySelector('.hud-loghead');
  const ALL_LABEL = headEl ? (headEl.textContent.includes('ALL POSTS') ? 'ALL POSTS' : '전체 글') : '';

  function esc(s2) { return String(s2).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function renderLog(cat) {
    if (!logEl || !POSTS.length) return;
    const rows = cat ? POSTS.filter((p) => p.cat === cat) : POSTS;
    if (headEl) headEl.textContent = 'LOG LIST // ' + (cat ? cat : ALL_LABEL);
    logEl.innerHTML = rows.length
      ? rows.map((p) =>
          `<a class="logrow" href="${esc(p.url)}"><span class="logtitle">${esc(p.title)}</span>` +
          `<span class="logmeta">${esc(p.date)} · <i class="lm-cat">${esc(p.cat)}</i> · ${p.views || 0} views · ${esc(p.desc || '')}</span></a>`).join('')
      : `<div class="logempty">NO_ENTRIES // ${esc(cat)}</div>`;
    document.querySelectorAll('.hud-cats a').forEach((a) => {
      const hrefCat = new URL(a.href, location.origin).searchParams.get('cat') || '';
      a.classList.toggle('on', hrefCat === cat);
    });
  }

  document.querySelectorAll('.hud-cats a').forEach((a) => {
    a.addEventListener('click', (e) => {
      const cat = new URL(a.href, location.origin).searchParams.get('cat') || '';
      e.preventDefault();
      history.pushState({ cat }, '', a.href);
      renderLog(cat);
    });
  });
  addEventListener('popstate', (e) => renderLog((e.state && e.state.cat) || new URLSearchParams(location.search).get('cat') || ''));
  } catch (err) { console.error('category filter disabled:', err); }

  function frame(now) {
    rx += (trx - rx) * 0.07;
    ry += (try_ - ry) * 0.07;
    draw(now || 0);
    requestAnimationFrame(frame);
  }
  if (reduce) {
    draw(4000);
    addEventListener('pointermove', () => { draw(4000); }, { passive: true });
  } else frame();
})();
