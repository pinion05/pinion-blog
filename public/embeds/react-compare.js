// embeds/react-compare.js — 일반 챗봇 vs ReAct 에이전트 비교 탭
(function () {
  var root = document.getElementById('react-compare');
  if (!root) return;
  root.innerHTML =
    '<div class="rc-tabs"><button type="button" class="rc-tab on" data-t="bot">일반 챗봇</button>' +
    '<button type="button" class="rc-tab" data-t="agent">ReAct 에이전트</button></div>' +
    '<div class="rc-body"></div>';
  var body = root.querySelector('.rc-body');
  var DATA = {
    bot: { title: 'Q: "오늘 서울 날씨 어때?"', a: '챗봇: "제 학습 데이터 기준으로는 맑을 가능성이 높아요!" — 사실은 아무것도 모름. 지식이 멈춘 날 이후의 날씨는 그냥 지어내거나 애매하게 말할 수밖에 없어요. 이게 바로 환각(할루시네이션).', tone: '#fff1f1', edge: '#c62828' },
    agent: { title: 'Q: "오늘 서울 날씨 어때?"', a: '에이전트: [생각] 실시간 정보가 필요해. 날씨 도구를 쓰자 → [행동] weather("서울") 호출 → [관찰] {맑음, 14°C, 미세먼지 좋음} → 답변: "서울 지금 맑고 14도예요!" — 진짜 데이터를 확인하고 나서 말함.', tone: '#eef7ee', edge: '#0a7a34' }
  };
  function show(k) {
    var d = DATA[k];
    body.innerHTML = '<div class="rc-card" style="background:' + d.tone + ';border-color:' + d.edge + ';">' +
      '<div class="rc-q">' + d.title + '</div><div class="rc-a">' + d.a + '</div></div>';
    root.querySelectorAll('.rc-tab').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-t') === k); });
  }
  root.querySelectorAll('.rc-tab').forEach(function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-t')); }); });
  show('bot');
})();
