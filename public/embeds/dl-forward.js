// embeds/dl-forward.js — MLP 순방향 패스 계산기 (6장 손계산 연습)
(function () {
  var root = document.getElementById('dl-forward');
  if (!root) return;
  function sig(x) { return 1 / (1 + Math.exp(-x)); }
  root.innerHTML =
    '<div class="fw-grid">' +
    '<label>x1 <input type="number" class="fw-x1" value="1" step="0.1"></label>' +
    '<label>x2 <input type="number" class="fw-x2" value="0" step="0.1"></label>' +
    '<label>W11 <input type="number" class="fw-w11" value="0.5" step="0.1"></label>' +
    '<label>W12 <input type="number" class="fw-w12" value="-0.4" step="0.1"></label>' +
    '<label>W21 <input type="number" class="fw-w21" value="0.3" step="0.1"></label>' +
    '<label>W22 <input type="number" class="fw-w22" value="0.8" step="0.1"></label>' +
    '<label>b1 <input type="number" class="fw-b1" value="0.1" step="0.1"></label>' +
    '<label>b2 <input type="number" class="fw-b2" value="-0.2" step="0.1"></label>' +
    '<label>V1 <input type="number" class="fw-v1" value="0.7" step="0.1"></label>' +
    '<label>V2 <input type="number" class="fw-v2" value="-0.6" step="0.1"></label>' +
    '<label>b3 <input type="number" class="fw-b3" value="0.3" step="0.1"></label>' +
    '</div><button type="button" class="fw-run">순방향 패스 실행</button>' +
    '<div class="fw-steps"></div>';
  var q = function (c) { return root.querySelector(c); };
  q('.fw-run').addEventListener('click', function () {
    var v = function (c) { return Number(q(c).value) || 0; };
    var x1 = v('.fw-x1'), x2 = v('.fw-x2');
    var z1 = x1 * v('.fw-w11') + x2 * v('.fw-w21') + v('.fw-b1');
    var z2 = x1 * v('.fw-w12') + x2 * v('.fw-w22') + v('.fw-b2');
    var h1 = sig(z1), h2 = sig(z2);
    var z3 = h1 * v('.fw-v1') + h2 * v('.fw-v2') + v('.fw-b3');
    var y = sig(z3);
    q('.fw-steps').innerHTML =
      '<div class="fw-step">은닉층 입력: z1 = ' + z1.toFixed(3) + ', z2 = ' + z2.toFixed(3) + '</div>' +
      '<div class="fw-step">은닉층 출력(시그모이드): h1 = ' + h1.toFixed(4) + ', h2 = ' + h2.toFixed(4) + '</div>' +
      '<div class="fw-step">출력층 입력: z3 = ' + z3.toFixed(3) + '</div>' +
      '<div class="fw-step fw-final">최종 출력 y = <b>' + y.toFixed(4) + '</b></div>';
  });
})();
