// embeds/dl-mse.js v2 — MSE: 클래스별 오차 바 시각화
(function () {
  var root = document.getElementById('dl-mse');
  if (!root) return;
  root.innerHTML =
    '<div class="mse-row"><label>y(예측) <input type="text" class="mse-y" value="0.0, 0.0, 0.8, 0.1, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0"></label></div>' +
    '<div class="mse-row"><label>target(정답) <input type="text" class="mse-t" value="0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0"></label></div>' +
    '<div class="mse-btns"><button type="button" class="mse-run">▶ 시각화</button>' +
    '<button type="button" class="mse-p1">예측이 정답에 가까울 때</button>' +
    '<button type="button" class="mse-p2">예측이 멀 때</button></div>' +
    '<div class="mse-bars" style="display:flex;align-items:flex-end;gap:4px;height:110px;background:#fff;border:2px inset #9aa7bd;max-width:560px;padding:8px;"></div>' +
    '<div class="mse-out" style="margin-top:6px;"></div>';
  var yEl = root.querySelector('.mse-y'), tEl = root.querySelector('.mse-t'), out = root.querySelector('.mse-out'), bars = root.querySelector('.mse-bars');
  function parse(s) { return s.split(',').map(function (x) { return parseFloat(x.trim()); }).filter(function (x) { return !isNaN(x); }); }
  function run() {
    var y = parse(yEl.value), t = parse(tEl.value);
    if (!y.length || y.length !== t.length) { out.textContent = '두 배열의 길이가 같아야 해요.'; out.style.color = '#c62828'; return; }
    var sum = 0, html = '';
    for (var i = 0; i < y.length; i++) {
      var d = y[i] - t[i]; sum += 0.5 * d * d;
      var hgt = Math.round(Math.abs(d) * 90) + 3;
      html += '<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;"><div style="height:' + hgt + 'px;background:' + (Math.abs(d) > 0.3 ? '#c62828' : '#9aa7bd') + ';"></div></div>';
    }
    bars.innerHTML = html;
    var verdict = sum < 0.1 ? '빨간 막대가 거의 없어요 = 예측이 정답에 가까움' : '빨간 막대가 크다 = 정답과 많이 다름 (손실 큼)';
    out.style.color = sum < 0.1 ? '#0a7a34' : '#c62828';
    out.innerHTML = 'MSE = <b>' + sum + '</b> — ' + verdict;
  }
  root.querySelector('.mse-run').addEventListener('click', run);
  root.querySelector('.mse-p1').addEventListener('click', function () { yEl.value = '0.0, 0.0, 0.8, 0.1, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0'; run(); });
  root.querySelector('.mse-p2').addEventListener('click', function () { yEl.value = '0.9, 0.0, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0'; run(); });
  run();
})();
