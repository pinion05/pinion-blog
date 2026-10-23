(function () {
  function setLang(l) {
    document.querySelectorAll('.lang-body').forEach(function (b) {
      b.hidden = b.className.indexOf('lang-' + l) === -1;
    });
    document.querySelectorAll('.lang-tab').forEach(function (t) {
      t.classList.toggle('on', t.dataset.lang === l);
    });
    document.documentElement.lang = l === 'en' ? 'en' : 'ko';
    var h1 = document.querySelector('h1 .lang-body.lang-' + l);
    if (h1) {
      var site = document.body.dataset.siteName || '';
      document.title = h1.textContent + ' — ' + site;
    }
    try { localStorage.setItem('blog-lang', l); } catch (e) {}
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.lang-tab');
    if (t) setLang(t.dataset.lang);
  });
  var saved = null;
  try { saved = localStorage.getItem('blog-lang'); } catch (e) {}
  if (saved) setLang(saved);
})();
