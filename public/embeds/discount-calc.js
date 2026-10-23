// embeds/discount-calc.js — 할인가 계산기 미니앱
(function () {
  var root = document.getElementById('calc-app');
  if (!root) return;
  var lang = document.documentElement.lang === 'en' ? 'en' : 'ko';
  var t = lang === 'en' ? { price: 'Price', off: 'Discount %', out: 'Final', save: 'You save' }
                        : { price: '원가', off: '할인율 %', out: '최종가', save: '절약' };
  root.innerHTML =
    '<div class="calc-row"><label>' + t.price + ' <input type="number" class="c-price" value="10000" min="0" step="100"></label>' +
    '<label>' + t.off + ' <input type="number" class="c-off" value="20" min="0" max="100"></label></div>' +
    '<div class="calc-out"></div>';
  var p = root.querySelector('.c-price'), o = root.querySelector('.c-off'), out = root.querySelector('.calc-out');
  function fmt(n) { return n.toLocaleString('ko-KR'); }
  function calc() {
    var price = Number(p.value) || 0, off = Math.min(100, Math.max(0, Number(o.value) || 0));
    var final = Math.round((price * (100 - off)) / 100 / 10) * 10; // 10원 단위 절사
    out.innerHTML = '<b>' + fmt(final) + '원</b> <span class="calc-save">(' + t.save + ' ' + fmt(price - final) + '원)</span>';
  }
  p.addEventListener('input', calc);
  o.addEventListener('input', calc);
  calc();
})();
