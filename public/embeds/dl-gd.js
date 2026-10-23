// embeds/dl-gd.js — 경사하강법 시뮬레이터 (4장, PPT 데이터)
(function () {
  var root = document.getElementById('dl-gd');
  if (!root) return;
  var X = [0.0, 1.0, 2.0], Y = [3.0, 3.5, 5.5], n = X.length;
  root.innerHTML =
    '<div class="gd-ctl"><label>학습률 η <input type="range" class="gd-lr" min="1" max="1500" value="10"> <b class="gd-lrv">0.01</b></label>' +
    '<button type="button" class="gd-run">1000 epoch 실행</button>' +
    '<button type="button" class="gd-reset">리셋</button></div>' +
    '<div class="gd-status">W = 0.000, b = 0.000, 손실 = -</div>' +
    '<div class="gd-hint">PPT 코드와 같은 데이터(X=[0,1,2], y=[3,3.5,5.5]), 같은 수식. 학습률을 1.5까지 올리면 발산하는 것도 확인할 수 있어요.</div>';
  var W = 0, B = 0;
  var lr = root.querySelector('.gd-lr'), lrv = root.querySelector('.gd-lrv'), st = root.querySelector('.gd-status');
  lr.addEventListener('input', function () { lrv.textContent = (lr.value / 1000).toFixed(3); });
  function loss() {
    var L = 0;
    for (var i = 0; i < n; i++) { var e = (W * X[i] + B) - Y[i]; L += e * e; }
    return L / n;
  }
  function show() {
    st.textContent = 'W = ' + W.toFixed(3) + ', b = ' + B.toFixed(3) + ', 손실(MSE) = ' + loss().toExponential(2);
    st.style.color = !isFinite(W) ? '#c62828' : '#000080';
    if (!isFinite(W)) st.textContent = '발산했습니다! 학습률이 너무 커서 W가 무한대로 갔어요. 리셋하고 학습률을 줄여보세요.';
  }
  root.querySelector('.gd-run').addEventListener('click', function () {
    var rate = lr.value / 1000;
    for (var e = 0; e < 1000; e++) {
      var dW = 0, dB = 0;
      for (var i = 0; i < n; i++) { var err = (W * X[i] + B) - Y[i]; dW += X[i] * err; dB += err; }
      W -= rate * (2 / n) * dW;
      B -= rate * (2 / n) * dB;
      if (!isFinite(W)) break;
    }
    show();
  });
  root.querySelector('.gd-reset').addEventListener('click', function () { W = 0; B = 0; show(); });
  show();
})();
