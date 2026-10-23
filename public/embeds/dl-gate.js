// embeds/dl-gate.js — 퍼셉트론 논리게이트 계산기 (5장)
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
    '<table class="dlg-table"><thead><tr><th>x1</th><th>x2</th><th>가중치 합</th><th>출력</th></tr></thead><tbody></tbody></table>' +
    '<div class="dlg-verdict"></div>';
  var w1 = root.querySelector('.g-w1'), w2 = root.querySelector('.g-w2'), b = root.querySelector('.g-b');
  function gate(x1, x2) { return (x1*w1.value + x2*w2.value + Number(b.value)) > 0.0000001 ? 1 : 0; }
  function render() {
    root.querySelector('.g-v1').textContent = w1.value;
    root.querySelector('.g-v2').textContent = w2.value;
    root.querySelector('.g-vb').textContent = b.value;
    var tb = root.querySelector('tbody'); tb.innerHTML = '';
    var outs = [];
    [[0,0],[1,0],[0,1],[1,1]].forEach(function (pair) {
      var s = pair[0]*w1.value + pair[1]*w2.value + Number(b.value);
      var o = gate(pair[0], pair[1]); outs.push(o);
      tb.innerHTML += '<tr><td>' + pair[0] + '</td><td>' + pair[1] + '</td><td>' + (Math.round(s*100)/100) + '</td><td><b>' + o + '</b></td></tr>';
    });
    var v = root.querySelector('.dlg-verdict');
    if (outs.join('') === '0001') v.textContent = '→ 지금 설정은 AND 게이트로 동작 중!';
    else if (outs.join('') === '0111') v.textContent = '→ 지금 설정은 OR 게이트로 동작 중!';
    else v.textContent = '→ AND/OR 어느 쪽도 아닌 동작이에요. 슬라이더를 움직여 AND(0001)를 만들어 보세요.';
    v.style.color = (outs.join('') === '0001' || outs.join('') === '0111') ? '#0a7a34' : '#a06a00';
  }
  root.querySelector('.g-and').addEventListener('click', function () { w1.value = 1; w2.value = 1; b.value = -1.5; render(); });
  root.querySelector('.g-or').addEventListener('click', function () { w1.value = 2; w2.value = 2; b.value = -1; render(); });
  [w1, w2, b].forEach(function (el) { el.addEventListener('input', render); });
  render();
})();
