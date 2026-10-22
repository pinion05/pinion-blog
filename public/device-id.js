// device-id.js — 익명 기기 ID 발급 → /api/seen 비콘 (어드민 고유 기기 집계용)
(function () {
  try {
    var k = 'pinion_did';
    var did = localStorage.getItem(k);
    if (!did || !/^[0-9a-f-]{8,64}$/i.test(did)) {
      did = crypto.randomUUID();
      localStorage.setItem(k, did);
    }
    var payload = JSON.stringify({ did: did, path: location.pathname });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/seen', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/seen', { method: 'POST', body: payload, keepalive: true });
    }
  } catch (e) {}
})();
