// chat.js — 사이드바 익명 라이브 채팅 (3초 폴링, GIF 지원, 전 페이지)
(function () {
  var log = document.getElementById('chat-log');
  var last = 0;
  var en = document.documentElement.lang === 'en';

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function render(m) {
    var row = el('div', 'chat-msg');
    var head = el('div', 'chat-head');
    head.appendChild(el('b', 'chat-name', m.name));
    var t = new Date(m.ts); // 항상 한국시간(KST) 24시간제 표기 — 방문자 시간대 무관
    head.appendChild(el('span', 'chat-time', isNaN(t) ? '' : t.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })));
    row.appendChild(head);
    if (m.body) row.appendChild(el('div', 'chat-body', m.body));
    if (m.image) {
      var img = document.createElement('img');
      img.src = m.image;
      img.className = 'c-img chat-img';
      img.loading = 'lazy';
      img.alt = 'GIF';
      row.appendChild(img);
    }
    return row;
  }

  function poll() {
    if (!log) return;
    fetch('/api/chat?after=' + last)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var msgs = j.msgs || [];
        msgs.forEach(function (m) {
          if (m.id > last) last = m.id;
          log.appendChild(render(m));
        });
        while (log.children.length > 60) log.removeChild(log.firstChild);
        if (msgs.length) log.scrollTop = log.scrollHeight;
      })
      .catch(function () {});
  }

  function sysErr(msg) {
    if (!log) return;
    var e = el('div', 'chat-syserr');
    e.textContent = msg;
    log.appendChild(e);
    log.scrollTop = log.scrollHeight;
    setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 6000);
  }

  if (log) {
    poll();
    setInterval(poll, 3000);
  }

  var nameIn = document.getElementById('chat-name');
  if (nameIn) nameIn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); nameIn.blur(); } // 이름 확정 Enter가 채팅을 실수로 보내지 않게
  });

  var form = document.getElementById('chat-form');
  var sending = false;
  if (form) form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (sending) return;
    var msgEl = document.getElementById('chat-msg');
    var nameEl = document.getElementById('chat-name');
    var gidEl = document.getElementById('c-giphy-id');
    var body = msgEl.value.trim();
    var name = nameEl.value.trim();
    var gid = gidEl.value;
    if (!body && !gid) return;
    if (body.length > 300) body = body.slice(0, 300);
    sending = true;
    gidEl.value = ''; // 즉시 클리어 — 연속 제출로 같은 GIF 재발사 방지
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, body: body, giphy_id: gid })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) {
          sysErr(en ? (j.err === 'rate' ? '\u26a0 Too many messages. Try again in a minute.' : '\u26a0 Failed to send. Please try again.') : (j.err === 'rate' ? '\u26a0 \uba54\uc2dc\uc9c0\uac00 \ub108\ubb34 \ub9ce\uc544\uc694. 1\ubd84 \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574\uc8fc\uc138\uc694.' : '\u26a0 \uc804\uc1a1\uc5d0 \uc2e4\ud328\ud588\uc5b4\uc694. \ub2e4\uc2dc \uc2dc\ub3c4\ud574\uc8fc\uc138\uc694.'));
          return;
        }
        msgEl.value = '';
        var pk = document.getElementById('c-gif-picked');
        var pn = document.getElementById('c-gif-panel');
        if (pk) pk.hidden = true;
        if (pn) pn.hidden = true;
        poll();
      })
      .catch(function () {
        gidEl.value = gid; // 실패 시 GIF 선택 복원
        sysErr(en ? '\u26a0 Network error. Please try again.' : '\u26a0 \ub124\ud2b8\uc6cc\ud06c\uc5d0\uc11c \uc624\ub958\uc785\ub2c8\ub2e4. \ub2e4\uc2dc \uc2dc\ub3c4\ud574\uc8fc\uc138\uc694.');
      })
      .finally(function () { sending = false; });
  });

  // 채팅 전용 GIF 검색 패널 (댓글 폼과 ID 충돌 없음)
  var cb = document.getElementById('c-gif-btn');
  var cp = document.getElementById('c-gif-panel');
  var cq = document.getElementById('c-gif-q');
  var cg = document.getElementById('c-gif-grid');
  var cid = document.getElementById('c-giphy-id');
  var cpk = document.getElementById('c-gif-picked');
  if (cb && cp && cg && cq) {
    cb.addEventListener('click', function () {
      cp.hidden = !cp.hidden;
      if (!cp.hidden && !cg.children.length) search('meme');
    });
    var tmr;
    cq.addEventListener('input', function () {
      clearTimeout(tmr);
      tmr = setTimeout(function () { search(cq.value.trim() || 'meme'); }, 400);
    });
  }
  function search(q) {
    fetch('/api/giphy?q=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        cg.innerHTML = '';
        (j.data || []).slice(0, 12).forEach(function (g) {
          var u = g.images && g.images.fixed_width ? g.images.fixed_width.url : g.url;
          if (!u) return;
          var img = document.createElement('img');
          img.src = u;
          img.loading = 'lazy';
          img.alt = 'GIF';
          img.addEventListener('click', function () {
            cid.value = g.id || '';
            cpk.hidden = false;
            cp.hidden = true;
          });
          cg.appendChild(img);
        });
      })
      .catch(function () {});
  }
})();
