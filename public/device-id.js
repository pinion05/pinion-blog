// device-id.js — 익명 기기 ID 발급 → /api/seen 비콘 (어드민 고유 기기 집계용)
(function () {
  try {
    // 테스트 옵트아웃: ?nobot=1 (또는 #nobot) — 에이전트 실측 시 동접자/통계 오염 방지
    if (/[?&]nobot=1/.test(location.search) || /#nobot/.test(location.hash)) return;
    // 자동화 브라우저(headless/E2E)는 통계 오염원이므로 추적 제외
    if (navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent)) return;
    var k = 'pinion_did';
    var did = '';
    var m = document.cookie.match(/(?:^|; )pinion_did=([^;]+)/);
    if (m) did = decodeURIComponent(m[1]);
    if (!did) did = localStorage.getItem(k) || '';
    if (!did || !/^[0-9a-f-]{8,64}$/i.test(did)) {
      did = crypto.randomUUID();
      localStorage.setItem(k, did);
    }
    document.cookie = 'pinion_did=' + encodeURIComponent(did) + '; path=/; domain=.pinion.kr; max-age=31536000; samesite=lax';
    document.cookie = 'pinion_did=' + encodeURIComponent(did) + '; path=/; max-age=31536000; samesite=lax';
    var payload = JSON.stringify({ did: did, path: location.pathname });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/seen', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/seen', { method: 'POST', body: payload, keepalive: true });
    }
  } catch (e) {}

  // 실시간 접속자 하트비트 (20초)
  async function beat() {
    try {
      var r = await fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ did: did, path: location.pathname })
      });
      var j = await r.json();
      var en = document.documentElement.lang === 'en';
      var s = document.getElementById('live-site');
      if (s && j.site != null) s.textContent = String(j.site);
      var h = document.getElementById('live-here');
      if (h) {
        if (location.pathname === '/' || j.here == null) { h.textContent = ''; }
        else { h.textContent = j.here + (en ? ' viewing the same page' : '\uba85\uc774 \ub098\uc640 \uac19\uc740 \ud398\uc774\uc9c0\ub97c \ubcf4\ub294\uc911'); }
      }
    } catch (e) {}
  }
  beat();
  setInterval(beat, 20000);
})();
