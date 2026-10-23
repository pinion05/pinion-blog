// embeds/react-quiz.js — ReAct 퀴즈 3문제
(function () {
  var root = document.getElementById('react-quiz');
  if (!root) return;
  var QUIZ = [
    { q: 'ReAct에서 에이전트가 "도구를 실제로 호출"하는 단계는?', c: ['생각(Thought)', '행동(Action)', '관찰(Observation)'], a: 1, ex: '행동 단계에서 검색·계산기 같은 도구를 실제로 실행해요.' },
    { q: '관찰(Observation) 단계에서 들어오는 것은?', c: ['에이전트의 자기 설명', '도구 실행 결과 바깥에서 온 정보', '사용자의 새 질문'], a: 1, ex: '행동의 결과로 바깥 세계(검색 결과, 코드 실행 값)가 돌아오는 게 관찰이에요.' },
    { q: 'ReAct 논문이 말하는 취소선 없는 핵심 아이디어는?', c: ['더 큰 모델을 쓰자', '추론과 행동을 번갈아 하자', '학습 데이터를 늘리자'], a: 1, ex: 'Reasoning + Acting을 한 루프에 묶는 게 ReAct의 전부이자 핵심이에요.' }
  ];
  root.innerHTML = QUIZ.map(function (qz, i) {
    return '<div class="rq-item"><div class="rq-q">Q' + (i + 1) + '. ' + qz.q + '</div>' +
      '<div class="rq-opts">' + qz.c.map(function (c, ci) {
        return '<button type="button" class="rq-opt" data-q="' + i + '" data-c="' + ci + '">' + c + '</button>';
      }).join('') + '</div><div class="rq-ex" style="display:none;"></div></div>';
  }).join('');
  root.querySelectorAll('.rq-opt').forEach(function (b) {
    b.addEventListener('click', function () {
      var qi = Number(b.getAttribute('data-q')), ci = Number(b.getAttribute('data-c'));
      var item = root.querySelectorAll('.rq-item')[qi];
      var ex = item.querySelector('.rq-ex');
      var ok = ci === QUIZ[qi].a;
      item.querySelectorAll('.rq-opt').forEach(function (x) { x.disabled = true; });
      b.style.background = ok ? '#e8f8ee' : '#fdeeee';
      b.style.borderColor = ok ? '#0a7a34' : '#c62828';
      var right = item.querySelectorAll('.rq-opt')[QUIZ[qi].a];
      right.style.background = '#e8f8ee';
      right.style.borderColor = '#0a7a34';
      ex.style.display = 'block';
      ex.textContent = (ok ? '정답! ' : '아쉬워요. ') + QUIZ[qi].ex;
    });
  });
})();
