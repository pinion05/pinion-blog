// embeds/so-ai-trend.js — Stack Overflow 서베이 4개년 AI 트렌드 바차트 (로컬 아카이브 실측값)
(function () {
  var root = document.getElementById('so-ai-trend');
  if (!root) return;
  var CSS = '<style>' +
    '.so-tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px}' +
    '.so-tabs button{font-family:inherit;font-size:12px;padding:4px 10px;background:#c0c0c0;border:2px solid;border-color:#fff #404040 #404040 #fff;cursor:pointer}' +
    '.so-tabs button.on{background:#000080;color:#fff;font-weight:bold}' +
    '.so-row{display:flex;align-items:center;gap:8px;margin:5px 0;font-size:13px}' +
    '.so-lab{width:190px;text-align:right;flex-shrink:0}' +
    '.so-track{flex:1;background:#e8eaf0;border:1px solid #9aa7bd;height:18px;position:relative}' +
    '.so-bar{height:100%;transition:width .6s}' +
    '.so-val{position:absolute;right:-52px;top:1px;font-size:12px;font-weight:bold;color:#000080}' +
    '@media(max-width:480px){.so-lab{width:110px;font-size:12px}.so-val{right:-44px}}' +
    '</style>';
  var DATA = {
    use: { title: 'AI 도구 사용률 (전체 응답자, "사용 중" 응답)', max: 100, unit: '%', rows: [
      ['2023 사용 중', 43.8, '#000080'],
      ['2024 사용 중', 61.8, '#000080'],
      ['2025 주1회 이상 사용', 78.5, '#000080'],
      ['2026 코딩 에이전트/어시스턴트', 65.9, '#0a7a34'],
      ['2026 범용 AI 챗 도구', 62.5, '#0a7a34'],
      ['2026 AI 에이전트·자동화', 26.2, '#0a7a34']
    ]},
    sent: { title: 'AI에 대한 태도 (긍정 vs 부정 합산)', max: 100, unit: '%', rows: [
      ['2023 긍정(호인)', 76.3, '#000080'], ['2023 부정', 3.2, '#c62828'],
      ['2024 긍정', 71.9, '#000080'], ['2024 부정', 6.4, '#c62828'],
      ['2025 긍정', 59.7, '#000080'], ['2025 부정', 20.4, '#c62828'],
      ['2026 긍정', 62.0, '#000080'], ['2026 부정', 21.5, '#c62828']
    ]},
    agent: { title: '2026 코드 에이전트 도구 (사용 경험 / 더 쓰고 싶음)', max: 80, unit: '%', rows: [
      ['Claude Code 사용', 65.5, '#000080'], ['Claude Code 희망', 41.4, '#7986cb'],
      ['GitHub Copilot 사용', 58.7, '#000080'], ['GitHub Copilot 희망', 19.6, '#7986cb'],
      ['OpenAI Codex 사용', 29.5, '#000080'], ['Cursor 사용', 25.5, '#000080']
    ]}
  };
  root.innerHTML = CSS +
    '<div class="so-tabs">' +
    Object.keys(DATA).map(function (k, i) {
      return '<button type="button" data-k="' + k + '"' + (i === 0 ? ' class="on"' : '') + '>' + DATA[k].title.split(' (')[0] + '</button>';
    }).join('') + '</div>' +
    '<div class="so-title" style="font-size:13px;font-weight:bold;margin:6px 0;"></div>' +
    '<div class="so-body"></div>';
  var tabs = root.querySelectorAll('.so-tabs button');
  function show(k) {
    var d = DATA[k];
    root.querySelector('.so-title').textContent = d.title + ' — 단위 ' + d.unit + ', 출처: SO 서베이 원시데이터';
    root.querySelector('.so-body').innerHTML = d.rows.map(function (r) {
      return '<div class="so-row"><span class="so-lab">' + r[0] + '</span>' +
        '<div class="so-track"><div class="so-bar" style="width:' + (r[1] / d.max * 100) + '%;background:' + r[2] + '"></div>' +
        '<span class="so-val">' + r[1] + d.unit + '</span></div></div>';
    }).join('');
  }
  tabs.forEach(function (b) {
    b.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      show(b.getAttribute('data-k'));
    });
  });
  show('use');
})();
