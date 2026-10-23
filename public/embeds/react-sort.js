// embeds/react-sort.js — 카드 분류 게임: 이 문장은 생각? 행동? 관찰?
(function () {
  var root = document.getElementById('react-sort');
  if (!root) return;
  var CARDS = [
    { t: '"국밥집을 검색해서 별점 1위를 찾아보자"', a: 'think' },
    { t: 'Search("근처 국밥집 별점")', a: 'act' },
    { t: '검색 결과: 별점 1위 = "할매국밥" (리뷰 412개)', a: 'obs' },
    { t: '"리뷰 412개면 믿을 만해. 여기로 정하자"', a: 'think' },
    { t: 'Call("할매국밥", "2명, 오후 1시")', a: 'act' },
    { t: '예약 완료 확인: 13:00, 2명', a: 'obs' }
  ];
  var NAMES = { think: '생각', act: '행동', obs: '관찰' };
  var order = CARDS.map(function (_, i) { return i; }).sort(function () { return Math.random() - 0.5; });
  root.innerHTML = '<div class="rs2-score">0 / ' + CARDS.length + ' 정답</div>' +
    '<div class="rs2-card" style="display:none;"></div>' +
    '<div class="rs2-btns">' + ['think','act','obs'].map(function (k) {
      return '<button type="button" class="rs2-pick" data-a="' + k + '">' + NAMES[k] + '</button>';
    }).join('') + '</div>' +
    '<div class="rs2-feed"></div>';
  var card = root.querySelector('.rs2-card'), feed = root.querySelector('.rs2-feed'), score = root.querySelector('.rs2-score');
  var pos = 0, correct = 0;
  function show() {
    if (pos >= order.length) {
      card.style.display = 'none';
      root.querySelector('.rs2-btns').style.display = 'none';
      feed.textContent = '끝! ' + correct + '문제 맞혔어요.';
      return;
    }
    var c = CARDS[order[pos]];
    card.style.display = 'block';
    card.textContent = c.t;
    feed.textContent = '';
  }
  root.querySelectorAll('.rs2-pick').forEach(function (b) {
    b.addEventListener('click', function () {
      if (pos >= order.length) return;
      var c = CARDS[order[pos]];
      var ok = b.getAttribute('data-a') === c.a;
      if (ok) correct++;
      feed.textContent = (ok ? '정답! ' : '아쉽네요, 정답은 "') + NAMES[c.a] + (ok ? '' : '"') + ' — ' + c.t.slice(0, 0);
      score.textContent = correct + ' / ' + CARDS.length + ' 정답';
      pos++;
      setTimeout(show, 650);
    });
  });
  show();
})();
