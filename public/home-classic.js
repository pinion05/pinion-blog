// home-classic.js — 카테고리 무새로고침 필터 (컴포넌트 교체 방식)
(function () {
  var dataEl = document.getElementById('posts-data');
  var viewsEl = document.getElementById('views-data');
  var body = document.getElementById('board-body');
  if (!dataEl || !body) return;
  var posts = JSON.parse(dataEl.textContent);
  var views = viewsEl ? JSON.parse(viewsEl.textContent) : {};
  var lang = document.documentElement.lang === 'en' ? 'en' : 'ko';
  var eye = '<img class="ico" src="/public/icons/file_eye.png" alt=""> ';
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); };

  function render(cat) {
    var list = cat ? posts.filter(function (p) { return p.cat === cat; }) : posts;
    var total = posts.length;
    body.innerHTML = list.map(function (p, i) {
      var title = lang === 'en' ? (p.titleEn || p.title) : p.title;
      var desc = lang === 'en' ? (p.descEn || p.desc) : p.desc;
      var v = views[p.slug] || 0;
      return '<tr>'
        + '<td class="num">' + (total - i) + '</td>'
        + '<td class="date">' + p.date + '</td>'
        + '<td><a href="/' + (lang === 'en' ? 'en/post/' : 'post/') + p.slug + '">' + esc(title) + '</a>'
        + (i === 0 && !cat ? '<span class="new">NEW!</span>' : '')
        + '<div class="desc">' + esc(desc) + '</div></td>'
        + '<td><span class="catl">' + p.cat + '</span></td>'
        + '<td class="views">' + eye + v + '</td>'
        + '</tr>';
    }).join('');
    var bt = document.getElementById('board-title');
    if (bt) bt.textContent = (lang === 'en' ? 'BOARD — RECENT POSTS' : '게시판 — 최근 글') + (cat ? ' — ' + cat : '');
  }

  document.querySelectorAll('a[data-cat]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var cat = a.getAttribute('data-cat') || '';
      render(cat);
      document.querySelectorAll('a[data-cat]').forEach(function (x) { x.classList.toggle('sel', x === a); });
      history.pushState({ cat: cat }, '', cat ? (location.pathname + '?cat=' + cat) : location.pathname);
    });
  });
  window.addEventListener('popstate', function () {
    var cat = new URLSearchParams(location.search).get('cat') || '';
    render(cat);
    document.querySelectorAll('a[data-cat]').forEach(function (x) { x.classList.toggle('sel', (x.getAttribute('data-cat') || '') === cat); });
  });
})();
