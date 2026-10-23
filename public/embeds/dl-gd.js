// embeds/dl-gd.js v2 — 경사하강법 시각화 (캔버스: 산점도 + 직선 애니메이션)
(function () {
  var root = document.getElementById('dl-gd');
  if (!root) return;
  var X = [0.0, 1.0, 2.0], Y = [3.0, 3.5, 5.5], n = X.length;
  root.innerHTML =
    '<div class="gd-ctl"><label>학습률 η <input type="range" class="gd-lr" min="1" max="1500" value="10"> <b class="gd-lrv">0.010</b></label>' +
    '<button type="button" class="gd-run">▶ 1000 epoch 애니메이션</button>' +
    '<button type="button" class="gd-reset">리셋</button>' +
    '<span class="gd-status"></span></div>' +
    '<canvas class="gd-cv" width="680" height="340" style="width:100%;max-width:560px;border:2px inset #9aa7bd;background:#fff;display:block;"></canvas>' +
    '<div class="gd-hint">파란 점 = 데이터, 빨간 선 = 모델(f(x)=Wx+b). 학습률이 크면 선이 튕겨 나가며 발산해요.</div>';
  var W = 0, B = 0;
  var cv = root.querySelector('.gd-cv'), ctx = cv.getContext('2d');
  var lr = root.querySelector('.gd-lr'), lrv = root.querySelector('.gd-lrv'), st = root.querySelector('.gd-status');
  var mx = function (x) { return 50 + (x / 2.5) * 600; };
  var my = function (y) { return 310 - (y / 6.5) * 280; };
  function draw() {
    ctx.clearRect(0, 0, 680, 340);
    ctx.strokeStyle = '#e4e8f0';
    for (var gy = 0; gy <= 6; gy++) { ctx.beginPath(); ctx.moveTo(mx(0), my(gy)); ctx.lineTo(mx(2.5), my(gy)); ctx.stroke(); }
    ctx.strokeStyle = '#9aa7bd'; ctx.beginPath(); ctx.moveTo(mx(0), my(0)); ctx.lineTo(mx(2.5), my(0)); ctx.moveTo(mx(0), my(0)); ctx.lineTo(mx(0), my(6)); ctx.stroke();
    ctx.fillStyle = '#000080';
    for (var i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(mx(X[i]), my(Y[i]), 7, 0, Math.PI * 2); ctx.fill(); }
    if (isFinite(W)) {
      ctx.strokeStyle = '#c62828'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(mx(-0.1), my(W * -0.1 + B)); ctx.lineTo(mx(2.4), my(W * 2.4 + B)); ctx.stroke(); ctx.lineWidth = 1;
    }
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px monospace';
    var L = 0, ok = isFinite(W);
    if (ok) for (var j = 0; j < n; j++) { var e = (W * X[j] + B) - Y[j]; L += e * e; }
    ctx.fillText(ok ? ('W=' + W.toFixed(3) + '  b=' + B.toFixed(3) + '  loss=' + (L / n).toFixed(3)) : 'DIVERGED! 발산 — 학습률을 줄이세요', 20, 30);
  }
  function animate() {
    var rate = lr.value / 1000;
    var frame = 0;
    var iv = setInterval(function () {
      for (var k = 0; k < 17; k++) {
        var dW = 0, dB = 0;
        for (var i = 0; i < n; i++) { var err = (W * X[i] + B) - Y[i]; dW += X[i] * err; dB += err; }
        W -= rate * (2 / n) * dW;
        B -= rate * (2 / n) * dB;
        if (!isFinite(W)) break;
      }
      draw();
      if (++frame >= 60 || !isFinite(W)) { clearInterval(iv); show(); }
    }, 16);
  }
  function show() {
    var ok = isFinite(W);
    st.textContent = ok ? ('W=' + W.toFixed(3) + ', b=' + B.toFixed(3) + ' 로 수렴 — 빨간 선이 점들을 가장 잘 설명해요') : '발산! 학습률이 너무 커요. 리셋 후 학습률을 낮춰보세요.';
    st.style.color = ok ? '#000080' : '#c62828';
  }
  lr.addEventListener('input', function () { lrv.textContent = (lr.value / 1000).toFixed(3); });
  root.querySelector('.gd-run').addEventListener('click', animate);
  root.querySelector('.gd-reset').addEventListener('click', function () { W = 0; B = 0; draw(); show(); });
  draw(); show();
})();
