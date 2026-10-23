// home-classic.js v5 — TAG 다중체크 + 정렬(날짜/조회수) + 검색(제목/내용 체크박스, 광범위 OR)
(function () {
  var dataEl = document.getElementById('posts-data');
  var viewsEl = document.getElementById('views-data');
  var body = document.getElementById('board-body');
  if (!dataEl || !body) return;
  var posts = JSON.parse(dataEl.textContent);
  var views = viewsEl ? JSON.parse(viewsEl.textContent) : {};
  var lang = document.documentElement.lang === 'en' ? 'en' : 'ko';
  var mobile = document.body.classList.contains('m');
  var eye = '<img class="ico" src="/public/icons/file_eye.png" alt=""> ';
  var esc = function (s) { return String(s).replace(/[&<>\"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); };

  var state = { tags: [], sort: 'date', hits: null }; // hits: null=검색 미사용, 배열=검색 결과 slug

  function base0() {
    var bt = document.getElementById('board-title');
    return (bt && bt.getAttribute('data-base')) || (lang === 'en' ? 'BOARD' : '게시판');
  }
  function sortBy(list) {
    list = list.slice();
    if (state.sort === 'views') list.sort(function (a, b) { return (views[b.slug] || 0) - (views[a.slug] || 0); });
    else list.sort(function (a, b) { return b.date.localeCompare(a.date); });
    return list;
  }
  function visible() {
    var list = posts;
    if (state.tags.length) list = list.filter(function (p) { return state.tags.some(function (t) { return p.tags.indexOf(t) >= 0; }); });
    if (state.hits) {
      var set = {};
      state.hits.forEach(function (s) { set[s] = 1; });
      list = list.filter(function (p) { return set[p.slug]; });
    }
    return sortBy(list);
  }

  function render() {
    var list = visible();
    var total = posts.length;
    if (!list.length) {
      body.innerHTML = lang === 'en'
        ? '<tr><td colspan="4" style="text-align:center;padding:14px 0;color:#555;">No results.</td></tr>'
        : '<tr><td colspan="4" style="text-align:center;padding:14px 0;color:#555;">검색 결과가 없습니다.</td></tr>';
    } else {
      body.innerHTML = list.map(function (p, i) {
        var title = lang === 'en' ? (p.titleEn || p.title) : p.title;
        var desc = lang === 'en' ? (p.descEn || p.desc) : p.desc;
        var v = views[p.slug] || 0;
        var chips = p.tags.map(function (t) { return '<span class="catl">' + esc(t) + '</span>'; }).join('');
        var titleHtml = '<a href="/' + (lang === 'en' ? 'en/post/' : 'post/') + p.slug + '">' + esc(title) + '</a>'
          + (i === 0 && !state.tags.length && !state.hits ? '<span class="new">NEW!</span>' : '');
        if (mobile) {
          return '<tr class="m-row"><td colspan="4">'
            + '<div class="m-meta"><span class="date">' + p.date + '</span>' + chips + '</div>'
            + '<div class="m-titleline">' + titleHtml + '</div>'
            + '<div class="desc">' + esc(desc) + '</div>'
            + '</td></tr>';
        }
        return '<tr>'
          + '<td class="date">' + p.date + '</td>'
          + '<td>' + titleHtml + '<div class="desc">' + esc(desc) + '</div></td>'
          + '<td class="c-cat">' + chips + '</td>'
          + '<td class="views">' + eye + v + '</td>'
          + '</tr>';
      }).join('');
    }
    var info = document.getElementById('search-info');
    if (info) info.textContent = state.hits ? ((lang === 'en' ? 'results: ' : '결과: ') + list.length) : '';
    var bt = document.getElementById('board-title');
    if (bt) bt.textContent = base0() + (state.tags.length ? ' — ' + state.tags.join(' + ') : '');
  }

  function selectedTags() {
    return Array.prototype.slice.call(document.querySelectorAll('.tagchk:checked'))
      .map(function (b) { return b.value; }).filter(Boolean);
  }
  function apply(push) {
    state.tags = selectedTags();
    render();
    var url = location.pathname
      + (state.tags.length ? '?tags=' + encodeURIComponent(state.tags.join(',')) : '')
      + location.hash;
    if (push) history.pushState({ tags: state.tags }, '', url);
    else history.replaceState({ tags: state.tags }, '', url);
  }

  var boxes = Array.prototype.slice.call(document.querySelectorAll('.tagchk'));
  var allBox = boxes.filter(function (x) { return x.value === ''; })[0];
  // ALL = 마스터 토글: 누르면 전체 on/off — 전체 on 후 싫은 태그만 빼는 용법
  boxes.forEach(function (b) {
    b.addEventListener('change', function () {
      if (b === allBox) {
        boxes.forEach(function (x) { if (x.value !== '') x.checked = allBox.checked; });
      } else if (allBox) {
        allBox.checked = boxes.every(function (x) { return x.value === '' || x.checked; });
      }
      apply(true);
    });
  });
  window.addEventListener('popstate', function () {
    var q = (new URLSearchParams(location.search).get('tags') || new URLSearchParams(location.search).get('cat') || '').toUpperCase();
    state.tags = q ? q.split(',').filter(Boolean) : [];
    boxes.forEach(function (x) { x.checked = state.tags.length ? (state.tags.indexOf(x.value) >= 0) : x.value === ''; });
    render();
  });

  // 정렬 토글
  var sd = document.getElementById('sort-date');
  var sv = document.getElementById('sort-views');
  function setSort(mode) {
    state.sort = mode;
    if (sd) sd.classList.toggle('on', mode === 'date');
    if (sv) sv.classList.toggle('on', mode === 'views');
    render();
  }
  if (sd) sd.addEventListener('click', function () { setSort('date'); });
  if (sv) sv.addEventListener('click', function () { setSort('views'); });

  // 검색 (제목/내용 체크박스, 300ms 디바운스)
  var qEl = document.getElementById('board-search');
  var tEl = document.getElementById('s-title');
  var bEl = document.getElementById('s-body');
  var tmr;
  function runSearch() {
    var q = (qEl ? qEl.value : '').trim();
    if (!q) { state.hits = null; render(); return; }
    var fields = [];
    if (tEl && tEl.checked) fields.push('title');
    if (bEl && bEl.checked) fields.push('body');
    if (!fields.length) { state.hits = []; render(); return; }
    fetch('/api/search?q=' + encodeURIComponent(q) + '&fields=' + fields.join(','))
      .then(function (r) { return r.json(); })
      .then(function (j) { state.hits = j.slugs || []; render(); })
      .catch(function () {});
  }
  if (qEl) {
    qEl.addEventListener('input', function () { clearTimeout(tmr); tmr = setTimeout(runSearch, 300); });
    qEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
  }
  [tEl, bEl].forEach(function (c) { if (c) c.addEventListener('change', runSearch); });

  // 초기: URL ?tags=(레거시 ?cat=) 프리체크
  var q0 = (new URLSearchParams(location.search).get('tags') || new URLSearchParams(location.search).get('cat') || '').toUpperCase();
  if (q0) {
    state.tags = q0.split(',').filter(Boolean);
    boxes.forEach(function (x) { x.checked = state.tags.indexOf(x.value) >= 0; });
    apply(false);
  }
})();
