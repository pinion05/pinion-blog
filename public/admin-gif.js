// 어드민 본문 입력창 우클릭 → GIF 삽입 (GIPHY 검색 → 커서 위치 삽입)
(() => {
  const tas = [...document.querySelectorAll('textarea[name="body_ko"]')];
  if (!tas.length) return;

  // 우클릭 컨텍스트 메뉴
  const menu = document.createElement('div');
  menu.textContent = '🎬 GIF 넣기 (GIPHY)';
  menu.style.cssText = 'position:fixed;z-index:999;display:none;background:#0d130d;color:#d0e0d0;border:1px solid #1d8f42;padding:.5em 1em;font:inherit;font-size:.85rem;cursor:pointer;white-space:nowrap;';
  document.body.appendChild(menu);
  let target = null;

  tas.forEach((ta) => {
    ta.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      target = ta;
      menu.style.left = Math.min(e.clientX, innerWidth - 190) + 'px';
      menu.style.top = Math.min(e.clientY, innerHeight - 50) + 'px';
      menu.style.display = 'block';
    });
  });
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) menu.style.display = 'none';
  });
  menu.addEventListener('click', openPanel);

  // 검색 패널
  let panel = null;
  function openPanel() {
    menu.style.display = 'none';
    if (panel) { input(panel).focus(); return; }
    panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;inset:0;z-index:998;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;';
    const box = document.createElement('div');
    box.style.cssText = 'width:min(640px,92vw);max-height:82vh;overflow:auto;background:#0d130d;border:1px solid #33ff66;padding:1rem;';
    box.innerHTML =
      '<div style="display:flex;gap:1ch;margin-bottom:.8rem">' +
      '<input placeholder="GIPHY 검색어 입력 후 Enter" style="flex:1;font:inherit;font-size:.95rem;background:#0a0e0a;color:#d0e0d0;border:1px solid #22331f;padding:.5em 1ch" />' +
      '<button class="gp-close" style="font:inherit;background:none;color:#ff6b6b;border:1px solid #6b2222;cursor:pointer;padding:0 .8em">✕</button></div>' +
      '<div class="gp-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5ch;min-height:90px;color:#5f7a5f;font-size:.85rem">검색어 입력 후 Enter</div>';
    panel.appendChild(box);
    document.body.appendChild(panel);
    const input = box.querySelector('input');
    const grid = box.querySelector('.gp-grid');
    input.focus();
    const close = () => { panel.remove(); panel = null; };
    box.querySelector('.gp-close').onclick = close;
    panel.addEventListener('click', (e) => { if (e.target === panel) close(); });
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const q = input.value.trim();
      if (!q) return;
      grid.textContent = '검색 중...';
      try {
        const r = await (await fetch('/api/giphy?q=' + encodeURIComponent(q))).json();
        grid.innerHTML = '';
        (r.data || []).forEach((g) => {
          const im = document.createElement('img');
          im.src = g.preview;
          im.loading = 'lazy';
          im.style.cssText = 'width:100%;cursor:pointer;border:2px solid transparent;display:block';
          im.onclick = () => { insert(g.url); close(); };
          grid.appendChild(im);
        });
        if (!grid.children.length) grid.textContent = '결과 없음';
      } catch { grid.textContent = '검색 실패 (키/네트워크)'; }
    });
  }
  function input(p) { return p.querySelector('input'); }

  // 커서 위치에 마크다운 삽입
  function insert(url) {
    const ta = target;
    if (!ta) return;
    const md = '\n![GIF](' + url + ')\n';
    const s0 = ta.selectionStart ?? ta.value.length;
    const s1 = ta.selectionEnd ?? s0;
    ta.value = ta.value.slice(0, s0) + md + ta.value.slice(s1);
    ta.selectionStart = ta.selectionEnd = s0 + md.length;
    ta.focus();
  }
})();
