// embeds/dl-quiz.js — 딥러닝 중간고사 총정리 퀴즈 10문제 (개념 중심, 계산 문제 없음)
(function () {
  var root = document.getElementById('dl-quiz');
  if (!root) return;
  var QUIZ = [
    { q: '"머신러닝"이라는 용어를 만든 사람과 연도는?', c: ['로젠블라트, 1957년', '아서 사무엘, 1959년', '제프리 힌튼, 2006년'], a: 1, ex: 'IBM에서 체커 프로그램 연구 중 만들었어요. 로젠블라트는 1957년 퍼셉트론.' },
    { q: '출력 y가 "강아지/고양이"처럼 이산적인 값이면 이 문제는?', c: ['회귀', '분류', '군집화'], a: 1, ex: '연속 값 예측은 회귀, 카테고리 중 하나로 나누면 분류예요.' },
    { q: '선형 회귀 f(x) = Wx + b에서 b를 부르는 이름은?', c: ['가중치(weight)', '바이어스(bias)', '그래디언트'], a: 1, ex: '기울기 W가 가중치, 절편 b가 바이어스예요.' },
    { q: '학습률(learning rate)이 너무 크면 생기는 현상은?', c: ['학습이 너무 느려진다', '발산한다', '손실이 0이 된다'], a: 1, ex: '최소값을 지나쳐 손실이 커지며 발산해요. 이럴 땐 학습률을 줄이면 돼요.' },
    { q: '학습 데이터에서도 성능이 나쁜 경우를 부르는 이름은?', c: ['과잉 적합(overfitting)', '과소 적합(underfitting)', '일반화'], a: 1, ex: '과소 적합은 모델 자체가 부적합한 경우가 많아 더 나은 모델을 찾아야 해요. 과잉 적합은 학습 데이터만 잘 맞는 경우.' },
    { q: '퍼셉트론에서 입력 총합을 출력으로 바꾸는 함수의 이름은?', c: ['손실 함수', '활성화 함수', '최적화 함수'], a: 1, ex: '초기에는 계단 함수를 사용했어요. 임계값 넘으면 1, 아니면 0.' },
    { q: '선형 함수를 활성화 함수로 쓰면 다층 신경망이 쓸모없는 이유는?', c: ['학습이 너무 빨라서', '아무리 쌓아도 선형 하나와 같아서', '메모리를 너무 써서'], a: 1, ex: '그래서 MLP의 활성화 함수는 전부 비선형(시그모이드, ReLU, tanh)이에요.' },
    { q: 'tanh 함수의 출력 범위는?', c: ['0에서 1', '-1에서 1', '0에서 무한대'], a: 1, ex: '시그모이드(0~1)와 비슷하지만 출력 범위가 -1~1인 차이가 있어요.' },
    { q: '역전파에서 은닉층 유닛의 오차는 어떻게 구해요?', c: ['정답에서 출력을 뺀다', '출력층 오차를 역방향으로 전파해 계산한다', '무작위로 설정한다'], a: 1, ex: '미분의 체인룰로 출력층 오차를 은닉층으로 전파해요. 이때의 오차값이 델타(δ).' },
    { q: 'RMSprop에 모멘텀을 합친, 현재 가장 인기 있는 최적화 알고리즘은?', c: ['Adagrad', 'Adam', '풀 배치 경사하강법'], a: 1, ex: 'Adam = Adaptive Moment Estimation. Adagrad는 학습률 감쇠 방식이에요.' }
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
