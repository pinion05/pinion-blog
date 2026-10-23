// embeds/dl-mse.js — MSE 계산기 (6장 PPT 예제)
(function () {
  var root = document.getElementById('dl-mse');
  if (!root) return;
  root.innerHTML =
    '<div class="mse-row"><label>y(예측) <input type="text" class="mse-y" value="0.0, 0.0, 0.8, 0.1, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0"></label></div>' +
    '<div class="mse-row"><label>target(정답) <input type="text" class="mse-t" value="0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0"></label></div>' +
    '<div class="mse-btns"><button type="button" class="mse-run">MSE 계산</button>' +
    '<button type="button" class="mse-p1">PPT 예제 ①(가까움)</button>' +
    '<button type="button" class="mse-p2">PPT 예제 ②(멂)</button></div>' +
    '<div class="mse-out"></div>';
  var yEl = root.querySelector('.mse-y'), tEl = root.querySelector('.mse-t'), out = root.querySelector('.mse-out');
  function parse(s) { return s.split(',').map(function (x) { return parseFloat(x.trim()); }).filter(function (x) { return !isNaN(x); }); }
  function run() {
    var y = parse(yEl.value), t = parse(tEl.value);
    if (!y.length || y.length !== t.length) { out.textContent = '두 배열의 길이가 같아야 해요.'; out.style.color = '#c62828'; return; }
    var sum = 0;
    for (var i = 0; i < y.length; i++) { var d = y[i] - t[i]; sum += 0.5 * d * d; }
    var verdict = sum < 0.1 ? '예측이 정답에 가까워요.' : '예측이 정답과 많이 달라요. 손실이 커요!';
    out.style.color = sum < 0.1 ? '#0a7a34' : '#c62828';
    out.textContent = 'MSE = ' + sum + ' — ' + verdict;
  }
  root.querySelector('.mse-run').addEventListener('click', run);
  root.querySelector('.mse-p1').addEventListener('click', function () { yEl.value = '0.0, 0.0, 0.8, 0.1, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0'; run(); });
  root.querySelector('.mse-p2').addEventListener('click', function () { yEl.value = '0.9, 0.0, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0'; run(); });
  run();
})();
