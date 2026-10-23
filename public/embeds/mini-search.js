// embeds/mini-search.js — 글 안에서 쓰는 fetch 미니앱 (블로그 검색 API 위젯)
(function () {
  var root = document.getElementById('mini-search-app');
  if (!root) return;
  var lang = document.documentElement.lang === 'en' ? 'en' : 'ko';
  var t = lang === 'en'
    ? { ph: 'type a keyword...', btn: 'search', empty: 'no results', err: 'search failed', pre: 'results: ' }
    : { ph: '키워드 입력...', btn: '검색', empty: '결과 없음', err: '검색 실패', pre: '결과: ' };
  root.innerHTML =
    '<div class="ms-row">' +
    '<input type="text" class="ms-q" placeholder="' + t.ph + '">' +
    '<button type="button" class="ms-go">' + t.btn + '</button></div>' +
    '<div class="ms-out"><span class="ms-hint">title · body 동시 검색</span></div>';
  var q = root.querySelector('.ms-q');
  var out = root.querySelector('.ms-out');
  function run() {
    var kw = q.value.trim();
    if (!kw) return;
    out.innerHTML = '<span class="ms-hint">...</span>';
    fetch('/api/search?q=' + encodeURIComponent(kw) + '&fields=title,body')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var slugs = j.slugs || [];
        if (!slugs.length) { out.innerHTML = '<span class="ms-hint">' + t.empty + '</span>'; return; }
        out.innerHTML = '<div class="ms-hint">' + t.pre + slugs.length + '</div>' +
          slugs.map(function (s) {
            return '<div class="ms-hit"><a href="/' + (lang === 'en' ? 'en/post/' : 'post/') + s + '">' + s + '</a></div>';
          }).join('');
      })
      .catch(function () { out.innerHTML = '<span class="ms-hint">' + t.err + '</span>'; });
  }
  root.querySelector('.ms-go').addEventListener('click', run);
  q.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
})();
