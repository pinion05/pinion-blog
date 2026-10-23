// 댓글 GIF 검색 패널 (Giphy — 서버 프록시 경유, 키 노출 없음)
(function () {
  var btn = document.getElementById('gif-btn');
  var panel = document.getElementById('gif-panel');
  var q = document.getElementById('gif-q');
  var grid = document.getElementById('gif-grid');
  var hidden = document.getElementById('giphy-id');
  var picked = document.getElementById('gif-picked');
  if (!btn || !panel || !q || !grid || !hidden) return;

  var timer = null;

  btn.addEventListener('click', function () {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      q.focus();
      if (!grid.childElementCount) search('meme');
    }
  });

  q.addEventListener('input', function () {
    clearTimeout(timer);
    var v = q.value.trim();
    timer = setTimeout(function () { if (v) search(v); }, 400);
  });

  function search(term) {
    grid.textContent = '';
    var loading = document.createElement('div');
    loading.className = 'gif-status';
    loading.textContent = '...';
    grid.appendChild(loading);
    fetch('/api/giphy?q=' + encodeURIComponent(term))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        grid.textContent = '';
        if (j.error) {
          var e = document.createElement('div');
          e.className = 'gif-status';
          e.textContent = 'GIF 검색 비활성';
          grid.appendChild(e);
          return;
        }
        (j.data || []).forEach(function (g) {
          var img = document.createElement('img');
          img.src = g.preview;
          img.alt = '';
          img.loading = 'lazy';
          img.className = 'gif-item';
          img.addEventListener('click', function () {
            hidden.value = g.id;
            picked.hidden = false;
            picked.textContent = 'GIF 선택됨 ✓ (' + g.id + ')';
            panel.hidden = true;
          });
          grid.appendChild(img);
        });
        if (!grid.childElementCount) {
          var n = document.createElement('div');
          n.className = 'gif-status';
          n.textContent = '결과 없음';
          grid.appendChild(n);
        }
      })
      .catch(function () {
        grid.textContent = '';
        var e = document.createElement('div');
        e.className = 'gif-status';
        e.textContent = '검색 실패';
        grid.appendChild(e);
      });
  }
})();
