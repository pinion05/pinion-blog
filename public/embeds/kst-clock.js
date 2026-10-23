// embeds/kst-clock.js — KST 실시간 시계 위젯
(function () {
  var el = document.getElementById('kst-clock');
  if (!el) return;
  function tick() {
    el.textContent = new Date().toLocaleTimeString('ko-KR', { hour12: false, hourCycle: 'h23', timeZone: 'Asia/Seoul' }) + ' KST';
  }
  tick();
  setInterval(tick, 1000);
})();
