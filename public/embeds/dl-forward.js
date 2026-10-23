// embeds/dl-forward.js v2 — MLP 순방향: 네트워크 다이어그램 시각화
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
    '</div><button type="button" class="fw-run">▶ 순방향 패스 실행</button>' +
    '<svg class="fw-svg" viewBox="0 0 440 200" style="width:100%;max-width:460px;background:#fff;border:2px inset #9aa7bd;display:block;margin-top:8px;"></svg>' +
    '<div class="fw-steps"></div>';
  var q = function (c) { return root.querySelector(c); };
  var svg = q('.fw-svg');
  var nodes = { x1: [50, 60], x2: [50, 140], h1: [220, 60], h2: [220, 140], y: [390, 100] };
  var edges = [
    ['x1', 'h1', '.fw-w11'], ['x2', 'h1', '.fw-w21'],
    ['x1', 'h2', '.fw-w12'], ['x2', 'h2', '.fw-w22'],
    ['h1', 'y', '.fw-v1'], ['h2', 'y', '.fw-v2']
  ];
  function render(z, h, y, x) {
    var val = { x1: x[0], x2: x[1], h1: h[0], h2: h[1], y: y };
    var s = '';
    edges.forEach(function (e) {
      var w = Number(q(e[2]).value) || 0;
      var col = w >= 0 ? '#000080' : '#c62828';
      s += '<line x1="' + nodes[e[0]][0] + '" y1="' + nodes[e[0]][1] + '" x2="' + nodes[e[1]][0] + '" y2="' + nodes[e[1]][1] + '" stroke="' + col + '" stroke-width="' + (0.8 + Math.min(Math.abs(w), 2) * 2.2) + '" opacity="0.75"/>';
      var lx = (nodes[e[0]][0] + nodes[e[1]][0]) / 2, ly = (nodes[e[0]][1] + nodes[e[1]][1]) / 2 - 6;
      s += '<text x="' + lx + '" y="' + ly + '" font-size="10" fill="' + col + '" text-anchor="middle">' + (w > 0 ? '+' : '') + w.toFixed(1) + '</text>';
    });
    Object.keys(nodes).forEach(function (k) {
      var p = nodes[k], v = val[k], op = 0.15 + Math.min(Math.abs(v), 1) * 0.85;
      s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="20" fill="rgba(0,0,128,' + op.toFixed(2) + ')" stroke="#000080" stroke-width="2"/>';
      s += '<text x="' + p[0] + '" y="' + (p[1] + 4) + '" font-size="11" font-weight="bold" fill="#fff" text-anchor="middle">' + v.toFixed(2) + '</text>';
    });
    s += '<text x="50" y="185" font-size="11" fill="#333" text-anchor="middle">입력층</text>';
    s += '<text x="220" y="185" font-size="11" fill="#333" text-anchor="middle">은닉층 (시그모이드)</text>';
    s += '<text x="390" y="185" font-size="11" fill="#333" text-anchor="middle">출력층</text>';
    svg.innerHTML = s;
  }
  q('.fw-run').addEventListener('click', function () {
    var v = function (c) { return Number(q(c).value) || 0; };
    var x1 = v('.fw-x1'), x2 = v('.fw-x2');
    var z1 = x1 * v('.fw-w11') + x2 * v('.fw-w21') + v('.fw-b1');
    var z2 = x1 * v('.fw-w12') + x2 * v('.fw-w22') + v('.fw-b2');
    var h1 = sig(z1), h2 = sig(z2);
    var z3 = h1 * v('.fw-v1') + h2 * v('.fw-v2') + v('.fw-b3');
    var y = sig(z3);
    render(z3, [h1, h2], y, [x1, x2]);
    q('.fw-steps').innerHTML =
      '<div class="fw-step">은닉층 입력: z1 = ' + z1.toFixed(3) + ', z2 = ' + z2.toFixed(3) + ' → 시그모이드 통과</div>' +
      '<div class="fw-step fw-final">최종 출력 y = <b>' + y.toFixed(4) + '</b> — 원의 색이 진할수록 그 뉴런이 크게 활성화된 거예요</div>';
  });
  render(0, [sig(0.5*1+0.3*0+0.1), sig(-0.4*1+0.8*0-0.2)], 0, [1, 0]);
})();
