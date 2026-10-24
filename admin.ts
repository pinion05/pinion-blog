// admin.ts — PINION 독립 어드민 시스템 (블로그 프로세스와 완전 분리)
// 보안: basicAuth 없음 — 테일넷 인터페이스에만 바인딩(기본 100.106.12.22), 공용 인터넷에서 도달 불가.
// 데이터: content/posts/*.json + comments.db + content/site-copy.json 직접 접근.
// 블로그 서버(server.ts)는 fs.watch로 변경을 감지해 자동 리로드.
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync, readdirSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { html } from 'hono/html';

const ADMIN_HOST = process.env.ADMIN_HOST || '100.106.12.22';
const ADMIN_PORT = 3004;
const LAN_SHARE = process.env.UMAMI_SHARE || '';
const SITE_VERSION = '0.2.0';
const COPY_RAW = (() => { try { return JSON.parse(readFileSync(new URL('./content/site-copy.json', import.meta.url), 'utf8')); } catch { return {}; } })();
let SITE_NAME: string = COPY_RAW.siteName || 'PINION';
let SITE_DESC: string = COPY_RAW.siteDesc || '죽은 인터넷 이론에 저항하기';
let SITE_DESC_EN: string = COPY_RAW.siteDescEn || 'Resisting the dead internet theory.';

// ---------- 콘텐츠 로딩 (server.ts와 동일 로직) ----------
type Lang = 'ko' | 'en';
const ALT: Record<Lang, Lang> = { ko: 'en', en: 'ko' };

// UI 문자열

// ---------- 콘텐츠 ----------
type Post = {
  slug: string; date: string;
  title: Record<Lang, string>;
  description: Record<Lang, string>;
  body: Record<Lang, string>;
  tags?: string[];
  provenance?: Record<Lang, string>; // AI 생성 경로 표기 — 기계 판독 가능한 신뢰 신호
};
const posts: Post[] = [];

// 가독성 게이트 — 다닥다닥 문단 반려. 서술 문단(구조화 블록 제외)이 280자 초과면 저장 거부.
const RG_PARA = new RegExp('\n\s*\n');
const RG_BLOCK = /^(```|#{1,6}\s|>|\||-\s|\d+\.\s|<\w)/;
const RG_BOLD = /\*\*/g;
const RG_LINK = /\[([^\]]*)\]\([^)]*\)/g;
const RG_WS = /\s/g;
function readabilityGate(body: string): string[] {
  const bad: string[] = [];
  for (const raw of body.split(RG_PARA)) {
    const t = raw.trim();
    if (!t) continue;
    if (RG_BLOCK.test(t)) continue; // 코드/제목/인용/표/리스트/HTML 제외
    const text = t.replace(RG_BOLD, '').replace(RG_LINK, '$1');
    const chars = text.replace(RG_WS, '').length;
    if (chars > 280) bad.push(`${chars}자 문단 (기준 280자): ${t.slice(0, 70)}…`);
  }
  return bad;
}

// 방문자 텍스트·게시글 공용 정규화 — Em dash(U+2014)는 픽셀 폰트에 글리프가 없어 하이픈으로 대치
const noEmDash = (s2: string) => typeof s2 === 'string' ? s2.replace(/\u2014/g, '-') : s2;
function reloadPosts() {
  posts.length = 0;
  const dir = new URL('./content/posts', import.meta.url);
  if (!existsSync(dir)) { try { mkdirSync(dir); } catch {} return; }
  posts.push(...readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => { const p = JSON.parse(readFileSync(new URL(`./content/posts/${f}`, import.meta.url), 'utf8'));
      p.title.ko = noEmDash(String(p.title.ko || '').replace(/^#{1,6}\s*/, '').trim());
      p.title.en = noEmDash(String(p.title.en || '').replace(/^#{1,6}\s*/, '').trim());
      p.description.ko = noEmDash(String(p.description.ko || '')); p.description.en = noEmDash(String(p.description.en || ''));
      p.body.ko = noEmDash(String(p.body.ko || '')); p.body.en = noEmDash(String(p.body.en || ''));
      if (p.provenance) { p.provenance.ko = noEmDash(String(p.provenance.ko || '')); p.provenance.en = noEmDash(String(p.provenance.en || '')); }
      return p; })
    .sort((a, b) => b.date.localeCompare(a.date)));
}
reloadPosts();
const getPost = (slug: string) => posts.find(p => p.slug === slug);

// ---------- EN 자동번역 (freellmapi) + 저장 헬퍼 ----------
const FREEAPI_KEY = (() => {
  try { return readFileSync('/home/pinion/freellmapi/UNIFIED_API_KEY.txt', 'utf8').trim(); } catch { return ''; }
})();
function backgroundSave(job: () => Promise<void>) {
  job().catch((e) => console.error('background save failed:', e));
}
async function translateToEn(text: string): Promise<string> {
  if (!FREEAPI_KEY || !text.trim()) return '';
  try {
    // freellmapi 로컬 라우터 — 모델 'auto' + 라우팅 전략 'balanced' (128K 컨텍스트 풀)
    // HTML 블록(style/mermaid/script/div/iframe/table)은 번역하지 않고 플레이스홀더로 치환 후 원문 복원 —
    // 모델이 태그·src를 임의로 바꾸는 것을 방지
    const blocks: string[] = [];
    const MARK = '%%BLOGHTMLBLOCK';
    let md = text.replace(/<(style|pre|script|iframe|table)\b[^>]*>[\s\S]*?<\/\1>|<div\b[^>]*>[\s\S]*?<\/div>/gi, (m0) => {
      blocks.push(m0);
      return `\n\n${MARK}${blocks.length}%%\n\n`;
    });
    let out: string = '';
    for (const model of ['gemini-3.5-flash', 'auto']) { // 1차 검증 모델 고정, 429(레이트리밋)·무결성 실패 시 라우터 auto 차선
      const r = await fetch('http://127.0.0.1:3001/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${FREEAPI_KEY}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(300_000),
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'Translate Korean to natural English. Keep markdown formatting exactly (## headings, - lists, [links](url), ![alt](url), code fences). Lines like %%BLOGHTMLBLOCK1%% are placeholders — keep them unchanged, never translate or remove them. Output only the translation, nothing else.' },
            { role: 'user', content: md },
          ],
        }),
      });
      if (!r.ok) continue;
      const j: any = await r.json();
      let cand: string = j.choices?.[0]?.message?.content?.trim() || '';
      const thinkEnd = cand.lastIndexOf('</think>');
      if (thinkEnd !== -1) cand = cand.slice(thinkEnd + 8).trim();
      cand = cand.replace(new RegExp(`${MARK}(\\d+)%%`, 'g'), (_, i) => blocks[Number(i) - 1] ?? '');
      if (cand.includes(MARK)) continue; // placeholder 유실 — 다음 모델로 재시도
      out = cand;
      break;
    }
    if (!out) return '';
    // div 블록 안의 한글 텍스트 노드만 2차 번역 (HTML 구조·태그는 그대로 유지)
    const hangul = (s: string) => /[\uAC00-\uD7A3]/.test(s);
    for (const b0 of blocks) {
      if (!/^<div/i.test(b0) || !hangul(b0)) continue;
      const b = b0.replace(/\s+/g, ' ');      // 텍스트 노드 내 개행 정규화 (렌더 동일)
      out = out.split(b0).join(b);
      const segs = (b.match(/>[^<]*[\uAC00-\uD7A3][^<]*</g) || []).map(s => s.slice(1, -1).replace(/\s+/g, ' ').trim());
      if (!segs.length) continue;
      try {
        const numbered = segs.map((s, i) => `[[${i + 1}]] ${s}`).join('\n');
        const r2 = await fetch('http://127.0.0.1:3001/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${FREEAPI_KEY}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(120_000),
          body: JSON.stringify({
            model: 'gemini-3.5-flash',
            messages: [
              { role: 'system', content: 'Each line starts with an [[N]] marker. Translate the text after each marker from Korean to natural English. Output every marker with its translation on its own line, same order, same numbering. Output nothing else.' },
              { role: 'user', content: numbered },
            ],
          }),
        });
        if (!r2.ok) continue;
        const j2: any = await r2.json();
        let t2: string = j2.choices?.[0]?.message?.content?.trim() || '';
        const te2 = t2.lastIndexOf('</think>');
        if (te2 !== -1) t2 = t2.slice(te2 + 8).trim();
        const byNum = new Map<number, string>();
        for (const m2 of t2.matchAll(/\[\[(\d+)\]\]\s*([\s\S]*?)(?=\n\[\[\d+\]\]|$)/g)) {
          const n = Number(m2[1]);
          if (n >= 1 && n <= segs.length && m2[2].trim()) byNum.set(n, m2[2].trim());
        }
        if (!byNum.size) continue;
        let nb = b;
        for (let si = 0; si < segs.length; si++) {
          const tr = byNum.get(si + 1);
          if (tr) nb = nb.split(segs[si]).join(tr);
        }
        out = out.split(b).join(nb);
      } catch { /* 2차 번역 실패 시 원문 유지 */ }
    }
    return out;
  } catch { return ''; }
}

// ---------- DB (comments.db 직접 접근) ----------
const db = new DatabaseSync(new URL('./comments.db', import.meta.url).pathname);
const listAllComments = db.prepare('SELECT id, slug, name, body, image, created_at FROM comments ORDER BY id DESC');
const deleteComment = db.prepare('DELETE FROM comments WHERE id = ?');
const countDevices = db.prepare(`SELECT
  (SELECT COUNT(DISTINCT did) FROM device_seen) AS all_time,
  (SELECT COUNT(DISTINCT did) FROM device_seen WHERE created_at >= datetime('now', 'localtime', 'start of day')) AS today,
  (SELECT COUNT(DISTINCT did) FROM device_seen WHERE created_at >= datetime('now', 'localtime', '-7 days')) AS week`);

// ---------- 사이트 카피 (site-copy.json) ----------
const COPY_FILE = './content/site-copy.json';
const COPY_DEFAULTS: Record<Lang, Record<string, string>> = {
  ko: {
    siteTitle: 'PINION',
    tagline: SITE_DESC,
    bannerMeta: 'LAST UPDATED: {DATE} ◇ SINCE 2026 ◇ PERSONAL HOMEPAGE',
    ucTitle: 'UNDER CONSTRUCTION',
    ucSmall: '일부 메뉴는 공사 중입니다. 조심히 걸으세요.',
    marquee: 'PINION 홈페이지에 오신 것을 환영합니다! ☆ 즐거운 하루 되세요 ☆ 최신 글: {TITLE} ({DATE}) ☆ 이 홈페이지는 100% 수제 HTML 입니다 ☆',
    menuTitle: 'MENU', home: '홈', posts: '글 목록', guest: '방명록', github: 'GITHUB', stats: '통계',
    categoryTitle: 'TAGS',
    profileTitle: 'PROFILE', profileName: 'PINION', profileDesc: SITE_DESC,
    counterTitle: 'COUNTER', totalViews: 'TOTAL VIEWS', today: 'TODAY',
    nth: '당신은 {N}번째 방문자입니다!',
    badgesTitle: 'BADGES',
    badge1: 'PINION|EST. 2026', badge2: 'HTML 3.2|VALID', badge3: 'NO AI SLOP|100% HANDMADE', badge4: 'BEST VIEWED|1280 × 1024',
    welcomeTitle: 'WELCOME',
    welcome: '안녕하세요, PINION입니다. LLM이 토큰을 어떻게 쓰고 버리는지 파헤치고, AI 슬롭에는 진짜 화를 냅니다. 즐거운 하루 되세요!',
    board: '게시판', no: '번호', date: '날짜', title: '제목', cat: '태그', views: '조회수',
    top: '인기글 TOP', rankSuffix: '위', log: '업데이트 로그', newpost: '신규 글 등록', opened: '블로그 개설',
    footer1: '© 2026 PINION - {DESC}',
    footerMeta: 'LAST UPDATED: {DATE} ◇ BEST VIEWED AT 1280×1024 ◇ NETSCAPE NAVIGATOR 4.0 / INTERNET EXPLORER 5.0',
    footerMetaShort: 'BEST VIEWED AT 1280×1024 ◇ NETSCAPE NAVIGATOR 4.0',
    footer3: '',
    gbTitle: '방명록 - GUESTBOOK', gbIntro: '흔적을 남겨주세요! 아무 이야기나 환영합니다.',
    gbSignTitle: '글 남기기', gbNamePh: '이름 (선택)', gbSign: '남기기', gbMsgPh: '방문 소감을 남겨주세요 (최대 500자)',
    gbCount: '{N}개의 방명록', gbEmpty: '아직 방명록이 비어있어요. 첫 번째가 되어주세요!',
    navTitle: '이동', switchLabel: 'EN 버전 보기 →', backList: '목록으로',
    comments: 'comments', commentPh: '댓글 입력...', commentNamePh: '이름 (미입력 시 IP 표시)', commentSubmit: 'post',
    gifPicked: 'GIF 선택됨 ✓', gifSearchPh: 'GIF 검색 (예: 밈, 축하, 안녕)',
    newBadge: 'NEW!', gifBtnLabel: 'GIF', topLink: '▲ TOP',
    chatTitle: 'LIVE CHAT', chatNamePh: 'nickname (optional)', chatMsgPh: 'type a message...', chatSend: 'send',
    readingNow: ' viewing the same page', liveNow: ' online',
    chatTitle: '라이브 채팅', chatNamePh: '닉네임 (선택)', chatMsgPh: '메시지 입력...', chatSend: '전송',
    readingNow: '명이 나와 같은 페이지를 보는중', liveNow: '명이 블로그에 접속중',
    statsCounterTitle: '사이트 통계 - WEB COUNTER', statsKeyTitle: '주요 지표 (30일)', statsTrendTitle: '30일 추이',
    statsChanTitle: '유입 채널 (30일)', statsHeatTitle: '방문 시간대 히트맵 (KST)', statsReportTitle: '글 성적표 (30일)',
    statsGeoTitle: '어디서 오셨나요', statsDevTitle: '기기 · OS · 브라우저', statsLogTitle: '실시간 로그 (최근 15)',
    statsCohortTitle: '코호트 리텐션', statsAssocTitle: '같이 읽는 글', statsDepthTitle: '세션 심도 분포',
  },
  en: {
    siteTitle: 'PINION',
    tagline: SITE_DESC_EN,
    bannerMeta: 'LAST UPDATED: {DATE} ◇ SINCE 2026 ◇ PERSONAL HOMEPAGE',
    ucTitle: 'UNDER CONSTRUCTION',
    ucSmall: 'Some sections are under construction. Watch your step.',
    marquee: 'Welcome to PINION! ☆ Have a nice day ☆ Latest post: {TITLE} ({DATE}) ☆ 100% handmade HTML ☆',
    menuTitle: 'MENU', home: 'Home', posts: 'Posts', guest: 'Guestbook', github: 'GITHUB', stats: 'STATS',
    categoryTitle: 'TAGS',
    profileTitle: 'PROFILE', profileName: 'PINION', profileDesc: SITE_DESC_EN,
    counterTitle: 'COUNTER', totalViews: 'TOTAL VIEWS', today: 'TODAY',
    nth: 'You are visitor #{N}!',
    badgesTitle: 'BADGES',
    badge1: 'PINION|EST. 2026', badge2: 'HTML 3.2|VALID', badge3: 'NO AI SLOP|100% HANDMADE', badge4: 'BEST VIEWED|1280 × 1024',
    welcomeTitle: 'WELCOME',
    welcome: 'Hi, this is PINION. We dissect how LLMs use and drop tokens, and get genuinely angry at AI slop. Have a nice day!',
    board: 'BOARD', no: 'NO', date: 'DATE', title: 'TITLE', cat: 'TAGS', views: 'VIEWS',
    top: 'TOP POSTS', rankSuffix: 'st.', log: 'UPDATE LOG', newpost: 'New post', opened: 'Blog opened',
    footer1: '© 2026 PINION - {DESC}',
    footerMeta: 'LAST UPDATED: {DATE} ◇ BEST VIEWED AT 1280×1024 ◇ NETSCAPE NAVIGATOR 4.0 / INTERNET EXPLORER 5.0',
    footerMetaShort: 'BEST VIEWED AT 1280×1024 ◇ NETSCAPE NAVIGATOR 4.0',
    footer3: '',
    gbTitle: 'GUESTBOOK', gbIntro: 'Leave a trace! Any message is welcome.',
    gbSignTitle: 'SIGN', gbNamePh: 'Name (optional)', gbSign: 'Sign', gbMsgPh: 'Leave a message (max 500 chars)',
    gbCount: '{N} ENTRIES', gbEmpty: 'The guestbook is empty. Be the first!',
    navTitle: 'NAV', switchLabel: '← 한국어 버전', backList: 'Back to list',
    comments: 'comments', commentPh: 'Write a comment...', commentNamePh: 'Name (IP shown if empty)', commentSubmit: 'post',
    gifPicked: 'GIF picked ✓', gifSearchPh: 'Search GIFs (meme, congrats, hi...)',
    newBadge: 'NEW!', gifBtnLabel: 'GIF', topLink: '▲ TOP',
    chatTitle: 'LIVE CHAT', chatNamePh: 'nickname (optional)', chatMsgPh: 'type a message...', chatSend: 'send',
    readingNow: ' viewing the same page', liveNow: ' online',
    statsCounterTitle: 'SITE STATS - WEB COUNTER', statsKeyTitle: 'KEY NUMBERS (30d)', statsTrendTitle: '30-DAY TREND',
    statsChanTitle: 'TRAFFIC SOURCES (30d)', statsHeatTitle: 'VISIT HEATMAP (KST)', statsReportTitle: 'POST REPORT (30d)',
    statsGeoTitle: 'WHERE FROM', statsDevTitle: 'DEVICES · OS · BROWSERS', statsLogTitle: 'LIVE LOG (LAST 15)',
    statsCohortTitle: 'COHORT RETENTION', statsAssocTitle: 'READ TOGETHER', statsDepthTitle: 'SESSION DEPTH',
  },
};
let COPY: Record<Lang, Record<string, string>> = { ko: {}, en: {} };
function loadSiteCopy() {
  try {
    const f = JSON.parse(readFileSync(COPY_FILE, 'utf8'));
    COPY = { ko: { ...(f.ko || {}) }, en: { ...(f.en || {}) } };
    if (f.siteName) SITE_NAME = f.siteName;
  } catch { /* 파일 없음 — 기본값만 */ }
}
loadSiteCopy();
const co = (lang: Lang, key: string): string => noEmDash(COPY[lang][key] ?? COPY_DEFAULTS[lang][key] ?? '');

// ---------- 레이아웃 ----------
function adminLayout(title: string, content: any, extraHead = '') {
  return html`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="robots" content="noindex, nofollow" />
<link rel="stylesheet" href="/public/style.css" />
<link rel="stylesheet" href="/public/admin.css?v=4" />${extraHead}
<link rel="icon" href="/public/favicon.ico?v=3" sizes="48x48" />
<script src="/public/admin-gif.js?v=1" defer></script>
</head>
<body class="admin">
<header>
  <nav class="site-nav">
    <a class="brand" href="/admin">${SITE_NAME} · admin</a>
    <div class="tabs">
      <a href="/admin">글 관리</a>
      <a href="/admin/new">+ 새 글</a>
      <a href="/admin/comments">댓글</a>
      <a href="/admin/copy">텍스트</a>
      <a href="https://pinion.kr/stats" target="_blank" rel="noopener">대시보드</a>
      ${LAN_SHARE ? html`<a href="${LAN_SHARE}" target="_blank" rel="noopener">Umami</a>` : ''}
      <a href="https://search.google.com/search-console?utm_source=about-page&resource_id=sc-domain:pinion.kr" target="_blank" rel="noopener">GSC</a>
      <a href="https://searchadvisor.naver.com/console/site/summary?site=https%3A%2F%2Fpinion.kr" target="_blank" rel="noopener">서치어드바이저</a>
      <a href="https://pinion.kr" target="_blank" rel="noopener">pinion.kr</a>
    </div>
  </nav>
</header>
<main>
${content}
</main>
</body>
</html>`;
}

// ---------- 라우트 ----------
const admin = new Hono();
admin.use('/public/*', serveStatic({ root: './public', rewriteRequestPath: (p) => p.replace(/^\/public/, '') }));
admin.use('*', async (c, next) => { c.header('X-Frame-Options', 'DENY'); c.header('X-Robots-Tag', 'noindex'); await next(); });
admin.get('/admin', (c) => {
  const dv = countDevices.get();
  const rows = posts.map(p => html`
  <div class="post-item">
    <div class="meta">${p.slug} · ${p.date}</div>
    <h2><a href="/admin/edit/${p.slug}">${p.title.ko}</a></h2>
    <form method="POST" action="/admin/delete/${p.slug}" onsubmit="">
      <button type="submit" class="del">삭제</button>
    </form>
  </div>`);
  const body = html`<div class="card"><p class="hint">저장 누르면 즉시 반영돼요(연결 끊겨도 서버가 저장 완료). 본문은 마크다운으로 쓰면 됩니다.</p>
  <div class="meta">고유 기기(익명 ID): 전체 <b>${dv.all_time}</b> · 오늘 <b>${dv.today}</b> · 7일 <b>${dv.week}</b></div>
  ${rows}</div>`;
  return c.html(adminLayout(`admin — ${SITE_NAME}`, body));
});

function editForm(p: Post | null) {
  const t = p || { slug: '', date: new Date().toISOString().slice(0, 10), title: { ko: '', en: '' }, description: { ko: '', en: '' }, body: { ko: '', en: '' } };
  return html`<form method="POST" class="c-form">
    <label>slug (영문, URL)</label>
    <input type="text" name="slug" value="${t.slug}" ${p ? 'readonly' : 'required'} />
    <label>날짜</label>
    <input type="text" name="date" value="${t.date}" required />
    <label>카테고리</label>
    <input type="text" name="tags" value="${(t.tags || []).join(', ')}" placeholder="쉼표로 구분: LLM, Memory" />
    <label>제목 (KO)</label>
    <input type="text" name="title_ko" value="${t.title.ko}" required />
    <label>설명 (KO)</label>
    <textarea name="desc_ko" rows="2">${t.description.ko}</textarea>
    <label>본문 마크다운 (KO)</label>
    <textarea name="body_ko" rows="12">${t.body.ko}</textarea>
    <p class="hint">EN 제목·설명·본문은 저장 시 자동 번역됩니다.</p>
    <button type="submit">저장</button>
  </form>`;
}

admin.get('/admin/new', (c) => {
  return c.html(adminLayout(`새 글 — ${SITE_NAME}`, html`<div class="card"><h1>새 글</h1>${editForm(null)}</div>`));
});
admin.post('/admin/new', async (c) => {
  const f = await c.req.parseBody();
  const slug = String(f.slug || '').trim();
  if (!slug || !/^[a-z0-9-]+$/.test(slug) || getPost(slug)) return c.text('invalid slug', 400);
  const gate1 = readabilityGate(String(f.body_ko || ''));
  if (gate1.length) return c.html(adminLayout('가독성 검사 반려', html`<div class="card"><h1>반려: 다닥다닥한 문단</h1><p>280자를 초과한 서술 문단이 ${gate1.length}개 있어요. 문단을 쪼개거나 리스트로 구조화한 뒤 다시 저장해주세요.</p><ul>${gate1.map((g: string) => html`<li>${g}</li>`)}</ul><p><a href="/admin/new">← 돌아가기</a></p></div>`), 422);
  const post = { slug, tags: String(f.tags || '').split(',').map((x: string) => x.trim()).filter(Boolean), date: String(f.date || ''), title: { ko: String(f.title_ko || ''), en: '' },
    description: { ko: String(f.desc_ko || ''), en: '' },
    body: { ko: String(f.body_ko || ''), en: '' } };
  backgroundSave(async () => {
    post.title.en = (await translateToEn(post.title.ko)) || post.title.ko;
    post.description.en = (await translateToEn(post.description.ko)) || post.description.ko;
    post.body.en = (await translateToEn(post.body.ko)) || post.body.ko;
    writeFileSync(new URL(`./content/posts/${slug}.json`, import.meta.url), JSON.stringify(post, null, 2));
    reloadPosts();
    console.log(`saved (bg): ${slug}`);
  });
  return c.redirect('/admin', 303);
});
admin.get('/admin/edit/:slug', (c) => {
  const p = getPost(c.req.param('slug'));
  if (!p) return c.notFound();
  return c.html(adminLayout(`수정: ${p.title.ko} — ${SITE_NAME}`, html`<div class="card"><h1>수정</h1>${editForm(p)}</div>`));
});
admin.post('/admin/edit/:slug', async (c) => {
  const slug = c.req.param('slug');
  const p = getPost(slug);
  if (!p) return c.notFound();
  const f = await c.req.parseBody();
  const gate2 = readabilityGate(String(f.body_ko || ''));
  if (gate2.length) return c.html(adminLayout('가독성 검사 반려', html`<div class="card"><h1>반려: 다닥다닥한 문단</h1><p>280자를 초과한 서술 문단이 ${gate2.length}개 있어요. 문단을 쪼개거나 리스트로 구조화한 뒤 다시 저장해주세요.</p><ul>${gate2.map((g: string) => html`<li>${g}</li>`)}</ul><p><a href="/admin/edit/${slug}">← 돌아가기</a></p></div>`), 422);
  const oldKo = p.body.ko;
  const oldTitleKo = p.title.ko;
  const oldDescKo = p.description.ko;
  p.date = String(f.date || p.date);
  p.tags = String(f.tags ?? '').split(',').map((x: string) => x.trim()).filter(Boolean).length
    ? String(f.tags ?? '').split(',').map((x: string) => x.trim()).filter(Boolean)
    : (Array.isArray(p.tags) ? p.tags : ['MISC']);
  p.title.ko = String(f.title_ko || p.title.ko);
  p.description.ko = String(f.desc_ko || p.description.ko);
  p.body.ko = String(f.body_ko || p.body.ko);
  if (p.body.ko !== oldKo || p.title.ko !== oldTitleKo || p.description.ko !== oldDescKo) {
    backgroundSave(async () => {
      // 변경된 필드만 번역 (비용 절감)
      if (p.title.ko !== oldTitleKo || !p.title.en.trim()) {
        p.title.en = (await translateToEn(p.title.ko)) || p.title.en;
      }
      if (p.description.ko !== oldDescKo || !p.description.en.trim()) {
        p.description.en = (await translateToEn(p.description.ko)) || p.description.en;
      }
      if (p.body.ko !== oldKo || !p.body.en.trim()) {
        p.body.en = (await translateToEn(p.body.ko)) || p.body.ko;
      }
      writeFileSync(new URL(`./content/posts/${slug}.json`, import.meta.url), JSON.stringify(p, null, 2));
      reloadPosts();
      console.log(`saved (bg): ${slug}`);
    });
  } else {
    writeFileSync(new URL(`./content/posts/${slug}.json`, import.meta.url), JSON.stringify(p, null, 2));
    reloadPosts();
  }
  return c.redirect('/admin', 303);
});
admin.post('/admin/delete/:slug', async (c) => {
  const slug = c.req.param('slug');
  if (getPost(slug)) {
    try { unlinkSync(new URL(`./content/posts/${slug}.json`, import.meta.url)); } catch {}
    reloadPosts();
  }
  return c.redirect('/admin', 303);
});
admin.get('/admin/comments', (c) => {
  const rows = listAllComments.all().map((cm: any) => html`
  <div class="post-item">
    <div class="meta">#${cm.id} · ${cm.slug} · ${cm.name || '(익명)'} · ${cm.ip} · ${cm.created_at}</div>
    <div class="cbody">${cm.image ? html`<img src="${cm.image}" alt="" />` : ''}${cm.body || ''}</div>
    <form method="POST" action="/admin/comments/delete/${cm.id}">
      <button type="submit" class="del">삭제</button>
    </form>
  </div>`);
  const body = html`<div class="card"><h1>댓글 관리</h1>${rows.length ? rows : html`<p class="hint">댓글이 없습니다.</p>`}</div>`;
  return c.html(adminLayout(`댓글 — ${SITE_NAME}`, body));
});

admin.post('/admin/comments/delete/:id', (c) => {
  deleteComment.run(Number(c.req.param('id')));
  return c.redirect('/admin/comments');
});

// ---------- 사이트 텍스트 편집 ----------
const SITE_DEFAULT_FIELDS: [string, string, boolean?][] = [
  ['siteName', '사이트 이름 (브랜드 — 탭 제목·RSS·OG 전체 적용)'],
  ['siteDesc', '사이트 설명 KO (SEO 설명·푸터 {DESC})', true],
  ['siteDescEn', '사이트 설명 EN', true],
];

const COPY_SECTIONS: { name: string; fields: [string, string, boolean?][] }[] = [
  { name: '통계 페이지', fields: [
    ['statsCounterTitle', '카운터 박스 제목'], ['statsKeyTitle', '주요 지표 박스 제목'], ['statsTrendTitle', '추이 박스 제목'],
    ['statsChanTitle', '채널 박스 제목'], ['statsHeatTitle', '히트맵 박스 제목'], ['statsReportTitle', '성적표 박스 제목'],
    ['statsGeoTitle', '지역 박스 제목'], ['statsDevTitle', '기기 박스 제목'], ['statsLogTitle', '로그 박스 제목'],
    ['statsCohortTitle', '코호트 박스 제목'], ['statsAssocTitle', '연관글 박스 제목'], ['statsDepthTitle', '심도 박스 제목'],
  ]},
  { name: '공용 요소', fields: [
    ['newBadge', 'NEW! 뱃지 문구'], ['gifBtnLabel', 'GIF 버튼 라벨'], ['topLink', 'TOP 링크 문구'],
    ['liveNow', '접속중 표기 (앞 숫자)'], ['readingNow', '읽는중 표기 (앞 숫자)'],
  ]},
  { name: '라이브 채팅', fields: [
    ['chatTitle', '채팅 박스 제목'], ['chatNamePh', '닉네임 플레이스홀더'], ['chatMsgPh', '메시지 플레이스홀더'], ['chatSend', '전송 버튼'],
  ]},
  { name: '배너', fields: [
    ['siteTitle', '사이트 타이틀'], ['tagline', '태그라인'],
    ['bannerMeta', '배너 메타 ({DATE} 치환)', true],
    ['ucTitle', '공사중 배지 문구'], ['ucSmall', '공사중 설명', true],
  ]},
  { name: '전광판', fields: [['marquee', '전광판 문구 ({TITLE}, {DATE} 치환)', true]] },
  { name: '사이드바', fields: [
    ['menuTitle', 'MENU 박스 제목'], ['home', '홈 링크'], ['posts', '글 목록 링크'], ['guest', '방명록 링크'], ['stats', '통계 링크'], ['github', 'GITHUB 라벨'],
    ['categoryTitle', 'TAGS 박스 제목'],
    ['profileTitle', 'PROFILE 박스 제목'], ['profileName', '프로필 이름'], ['profileDesc', '프로필 설명'],
    ['counterTitle', 'COUNTER 박스 제목'], ['totalViews', 'TOTAL VIEWS 라벨'], ['today', 'TODAY 라벨'], ['nth', '방문자 문구 ({N} 치환)', true],
  ]},
  { name: '메인 박스', fields: [
    ['welcomeTitle', 'WELCOME 박스 제목'], ['welcome', '인사말', true],
    ['board', '게시판 제목'], ['no', '번호 헤더'], ['date', '날짜 헤더'], ['title', '제목 헤더'], ['cat', '태그 헤더'], ['views', '조회수 헤더'],
    ['top', '인기글 박스 제목'], ['rankSuffix', '순위 접미사'], ['log', '업데이트 로그 제목'], ['newpost', '신규 글 라벨'], ['opened', '개설 라벨'],
  ]},
  { name: '푸터', fields: [
    ['footer1', '카피라인 ({DESC} 치환)', true], ['footerMeta', '홈 메타 ({DATE} 치환)', true], ['footerMetaShort', '쉘 메타', true], ['footer3', '하단 문구 (빈칸=숨김)', true],
  ]},
  { name: '방명록', fields: [
    ['gbTitle', '제목'], ['gbIntro', '안내문', true], ['gbSignTitle', '작성 박스 제목'], ['gbNamePh', '이름 플레이스홀더'], ['gbSign', '버튼'], ['gbMsgPh', '메시지 플레이스홀더'], ['gbCount', '개수 표기 ({N} 치환)'], ['gbEmpty', '빈 상태 문구'],
  ]},
  { name: '글 페이지', fields: [
    ['navTitle', '이동 박스 제목'], ['switchLabel', '언어 전환 링크'], ['backList', '목록 링크'],
    ['comments', '댓글 박스 제목'], ['commentPh', '댓글 플레이스홀더'], ['commentNamePh', '이름 플레이스홀더'], ['commentSubmit', '버튼'],
    ['gifPicked', 'GIF 선택 문구'], ['gifSearchPh', 'GIF 검색 플레이스홀더'],
  ]},
];

admin.get('/admin/copy', (c) => {
  const saved = c.req.query('saved') === '1';
  const siteRows = SITE_DEFAULT_FIELDS.map(([key, label, ta]) => {
    const v = key === 'siteName' ? SITE_NAME : key === 'siteDesc' ? SITE_DESC : SITE_DESC_EN;
    const cell = ta
      ? html`<textarea name="${key}" rows="2">${v}</textarea>`
      : html`<input type="text" name="${key}" value="${v}" />`;
    return html`<tr>
      <td class="copy-label">${label}<br><code>${key}</code></td>
      <td colspan="2">${cell}</td>
    </tr>`;
  });
  const rows = [html`<div class="card"><h1>사이트 기본 (브랜드·SEO)</h1>
    <table class="copy-table"><tr><th style="width:22%"></th><th colspan="2">값 (전체 사이트 적용)</th></tr>${siteRows}</table></div>`, ...COPY_SECTIONS.map((sec) => html`<div class="card"><h1>${sec.name}</h1>
    <table class="copy-table"><tr><th style="width:22%"></th><th>한국어</th><th>English</th></tr>
    ${sec.fields.map(([key, label, ta]) => html`<tr>
      <td class="copy-label">${label}<br><code>${key}</code></td>
      <td>${ta ? html`<textarea name="ko.${key}" rows="2">${co('ko', key)}</textarea>` : html`<input type="text" name="ko.${key}" value="${co('ko', key)}" />`}</td>
      <td>${ta ? html`<textarea name="en.${key}" rows="2">${co('en', key)}</textarea>` : html`<input type="text" name="en.${key}" value="${co('en', key)}" />`}</td>
    </tr>`)}
    </table></div>`)];
  return c.html(adminLayout('텍스트 편집 — ' + SITE_NAME, html`
    ${saved ? html`<div class="card" style="border-left:4px solid #2e7d32"><b>저장되었습니다.</b> 기본값과 같은 값은 파일에 저장하지 않습니다(빈 칸 = 기본값 복귀).</div>` : ''}
    <div class="card"><h1>사이트 텍스트 편집</h1><p class="hint">포스트 내용을 제외한 모든 UI 문구. 치환 키: {N} · {TITLE} · {DATE} · {DESC} — 빈 칸으로 저장하면 기본값으로 돌아갑니다. 사이트 기본 값은 탭 제목·SEO·RSS·OG 전체에 즉시 적용됩니다.</p></div>
    <form method="POST" action="/admin/copy/save">${rows}<div class="card"><button type="submit">모두 저장</button></div></form>`));
});

admin.post('/admin/copy/save', async (c) => {
  const f = await c.req.parseBody();
  const next: Record<Lang, Record<string, string>> = { ko: {}, en: {} } as any;
  for (const k3 of ['siteName', 'siteDesc', 'siteDescEn'] as const) {
    const v3 = String(f[k3] ?? '').replace(/\r\n/g, '\n').trim();
    const def3 = k3 === 'siteName' ? 'PINION' : k3 === 'siteDesc' ? '죽은 인터넷 이론에 저항하기' : 'Resisting the dead internet theory.';
    if (v3 && v3 !== def3) (next as any)[k3] = v3;
    if (k3 === 'siteName') SITE_NAME = v3 || def3;
    if (k3 === 'siteDesc') SITE_DESC = v3 || def3;
    if (k3 === 'siteDescEn') SITE_DESC_EN = v3 || def3;
  }
  for (const [full, val] of Object.entries(f)) {
    const m = /^(ko|en)\.([A-Za-z0-9]+)$/.exec(full);
    if (!m) continue;
    const lang2 = m[1] as Lang;
    const key = m[2];
    if (!COPY_DEFAULTS[lang2][key]) continue;
    const v = String(val).replace(/\r\n/g, '\n').trim();
    if (v && v !== COPY_DEFAULTS[lang2][key]) next[lang2][key] = v;
  }
  COPY = { ko: { ...COPY_DEFAULTS.ko, ...next.ko }, en: { ...COPY_DEFAULTS.en, ...next.en } };
  backgroundSave(async () => {
    try {
      writeFileSync(new URL('./content/site-copy.json', import.meta.url), JSON.stringify(next, null, 2));
      console.log('saved (bg): site-copy.json');
    } catch (e: any) { console.error('site-copy write fail:', e?.message); }
  });
  return c.redirect('/admin/copy?saved=1', 303);
});

admin.get('/', (c) => c.redirect('/admin', 302));
serve({ fetch: admin.fetch, port: ADMIN_PORT, hostname: ADMIN_HOST });
console.log(`[admin] standalone, no auth (tailnet-only): http://${ADMIN_HOST}:${ADMIN_PORT}/admin`);
