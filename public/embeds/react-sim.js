// embeds/react-sim.js — ReAct 루프 시뮬레이터 (라면 시나리오)
(function () {
  var root = document.getElementById('react-sim');
  if (!root) return;
  var steps = [
    { k: 'think', icon: '생각', text: '라면을 끓이려면 냄비, 물, 라면, 가스레인지가 필요해. 냄비이 있는지부터 확인해야겠어.' },
    { k: 'act', icon: '행동', text: 'Search("냉장고 안에 라면 있나?") — 냉장고를 열어 확인한다.' },
    { k: 'obs', icon: '관찰', text: '관찰 결과: 진라면 1개 있음. 물은 정수기에서 받을 수 있음.' },
    { k: 'think', icon: '생각', text: '라면은 있어. 이제 물 받아서 냄비에 끓이면 돼. 5분 타이머도 필요하겠다.' },
    { k: 'act', icon: '행동', text: 'Boil("물 500ml, 라면") — 물을 끓이고 면과 스프를 넣는다.' },
    { k: 'obs', icon: '관찰', text: '관찰 결과: 5분 후 라면 완성. 냄비가 뜨거우니 조심.' },
    { k: 'done', icon: '답변', text: '라면 다 끓였어요! 5분 타이머 소리가 울리면 먹으면 돼요.' }
  ];
  var COLORS = { think: '#eef1f8', act: '#e7f0ff', obs: '#fff6dd', done: '#e8f8ee' };
  var ICONC = { think: '#000080', act: '#0b5cad', obs: '#a06a00', done: '#0a7a34' };
  root.innerHTML = '<div class="rs-log"><div class="rs-hint">아래 버튼을 눌러 한 단계씩 진행해 보세요</div></div>' +
    '<div class="rs-bar"><button type="button" class="rs-next">다음 단계 ▶</button>' +
    '<button type="button" class="rs-reset">처음부터</button>' +
    '<span class="rs-count">0 / ' + steps.length + '</span></div>';
  var log = root.querySelector('.rs-log'), next = root.querySelector('.rs-next'), reset = root.querySelector('.rs-reset'), count = root.querySelector('.rs-count');
  var i = 0;
  function add() {
    if (i >= steps.length) return;
    var s = steps[i];
    var b = document.createElement('div');
    b.className = 'rs-bubble rs-' + s.k;
    b.style.background = COLORS[s.k];
    b.innerHTML = '<b style="color:' + ICONC[s.k] + '">[' + s.icon + ']</b> ' + s.text;
    log.appendChild(b);
    log.scrollTop = log.scrollHeight;
    i++;
    count.textContent = i + ' / ' + steps.length;
    if (i >= steps.length) { next.disabled = true; next.textContent = '완료!'; }
  }
  function init() {
    i = 0;
    log.innerHTML = '<div class="rs-hint">질문: "냉장고에 라면 없어? 끓여줘"</div>';
    next.disabled = false; next.textContent = '다음 단계 ▶';
    count.textContent = '0 / ' + steps.length;
  }
  next.addEventListener('click', add);
  reset.addEventListener('click', init);
  init();
})();
