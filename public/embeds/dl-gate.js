// embeds/dl-gate.js v2 — 퍼셉트론 게이트: 결정경면 캔버스 시각화
(function () {
  var root = document.getElementById('dl-gate');
  if (!root) return;
  root.innerHTML =
    '<div class="dlg-ctl">' +
    '<label>w1 <input type="range" class="g-w1" min="-3" max="3" step="0.1" value="1"> <b class="g-v1">1.0</b></label>' +
    '<label>w2 <input type="range" class="g-w2" min="-3" max="3" step="0.1" value="1"> <b class="g-v2">1.0</b></label>' +
    '<label>b <input type="range" class="g-b" min="-3" max="3" step="0.1" value="-1.5"> <b class="g-vb">-1.5</b></label>' +
    '<button type="button" class="g-and">AND 프리셋</button>' +
    '<button type="button" class="g-or">OR 프리셋</button></div>' +
    '<canvas class="g-cv" width="600" height="300" style="width:100%;max-width:480px;border:2px inset #9aa7bd;background:#fff;display:block;"></canvas>' +
    '<div class="dlg-table-wrap"></div><div class="dlg-verdict"></div>';
  var w1 = root.querySelector('.g-w1'), w2 = root.querySelector('.g-w2'), b = root.querySelector('.g-b');
  var cv = root.querySelector('.g-cv'), ctx = cv.getContext('2d');
  var pts = [[0,0],[1,0],[0,1],[1,1]];
  var gx = function (x) { return 30 + (x + 0.5) / 2 * 540; };
  var gy = function (y) { return 270 - (y + 0.5) / 2 * 240; };
  function gate(x1, x2) { return (x1 * w1.value + x2 * w2.value + Number(b.value)) > 0.0000001 ? 1 : 0; }
  function draw() {
    ctx.clearRect(0, 0, 600, 300);
    // 배경 분할: 경계선 기준 출력 1 영역 음영
    var w1v = Number(w1.value), w2v = Number(w2.value), bv = Number(b.value);
    ctx.fillStyle = 'rgba(0,0,128,.07)';
    if (Math.abs(w2v) > 0.01) {
      var yA = (-bv - w1v * -0.5) / w2v, yB = (-bv - w1v * 1.5) / w2v;
      ctx.beginPath(); ctx.moveTo(gx(-0.5), gy(yA)); ctx.lineTo(gx(1.5), gy(yB)); ctx.lineTo(gx(1.5), gy(1.5)); ctx.lineTo(gx(-0.5), gy(1.5)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c62828'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx(-0.5), gy(yA)); ctx.lineTo(gx(1.5), gy(yB)); ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = '#c62828'; ctx.font = 'bold 12px sans-serif';
      ctx.fillText(w2v > 0 ? '출력 1 영역 ↑' : '출력 1 영역 ↓', 20, 30);
    }
    // 격자
    ctx.strokeStyle = '#e4e8f0';
    pts.forEach(function (p) { ctx.beginPath(); ctx.moveTo(gx(p[0]), gy(-0.4)); ctx.lineTo(gx(p[0]), gy(1.4)); ctx.stroke(); ctx.beginPath(); ctx.moveTo(gx(-0.4), gy(p[1])); ctx.lineTo(gx(1.4), gy(p[1])); ctx.stroke(); });
    // 점: 출력 1 = 남색 채움, 0 = 흰색
    pts.forEach(function (p) {
      var o = gate(p[0], p[1]);
      ctx.beginPath(); ctx.arc(gx(p[0]), gy(p[1]), 13, 0, Math.PI * 2);
      ctx.fillStyle = o ? '#000080' : '#fff'; ctx.fill();
      ctx.strokeStyle = '#000080'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = o ? '#fff' : '#000080'; ctx.font = 'bold 12px sans-serif';
      ctx.fillText('(' + p[0] + ',' + p[1] + ')', gx(p[0]) - 16, gy(p[1]) + 30);
    });
    // 표 + 판정
    var tb = root.querySelector('.dlg-table-wrap'), outs = [];
    var rows = pts.map(function (p) { var s = p[0]*w1v + p[1]*w2v + bv, o = gate(p[0], p[1]); outs.push(o); return '<tr><td>' + p[0] + '</td><td>' + p[1] + '</td><td>' + (Math.round(s*100)/100) + '</td><td><b>' + o + '</b></td></tr>'; }).join('');
    tb.innerHTML = '<table class="dlg-table"><thead><tr><th>x1</th><th>x2</th><th>가중치 합</th><th>출력</th></tr></thead><tbody>' + rows + '</tbody></table>';
    var v = root.querySelector('.dlg-verdict'), pat = outs.join('');
    if (pat === '0001') { v.textContent = '→ AND 게이트 동작 중! (1,1)만 경계선 위쪽'; v.style.color = '#0a7a34'; }
    else if (pat === '0111') { v.textContent = '→ OR 게이트 동작 중!'; v.style.color = '#0a7a34'; }
    else { v.textContent = '→ AND(0001) 또는 OR(0111) 모양으로 만들어 보세요. 빨간 선이 경계면이에요.'; v.style.color = '#a06a00'; }
  }
  root.querySelector('.g-and').addEventListener('click', function () { w1.value = 1; w2.value = 1; b.value = -1.5; draw(); });
  root.querySelector('.g-or').addEventListener('click', function () { w1.value = 2; w2.value = 2; b.value = -1; draw(); });
  [w1, w2, b].forEach(function (el) { el.addEventListener('input', draw); });
  draw();
})();
