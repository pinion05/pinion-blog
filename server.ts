import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync, readdirSync, statSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { html, raw } from 'hono/html';
import { marked } from 'marked';
import pg from 'pg';

// ---------- 설정 ----------
const SITE_URL = 'https://pinion.kr';
const COPY_RAW = (() => { try { return JSON.parse(readFileSync(new URL('./content/site-copy.json', import.meta.url), 'utf8')); } catch { return {}; } })();
const SITE_VERSION = '0.2.0';
let SITE_NAME: string = COPY_RAW.siteName || 'PINION';
let SITE_DESC: string = COPY_RAW.siteDesc || '죽은 인터넷 이론에 저항하기';
let SITE_DESC_EN: string = COPY_RAW.siteDescEn || 'Resisting the dead internet theory.';
const PORT = 8090;
const UMAMI_ID = '9f85d767-429a-40bb-b5d9-b372bbd3bdeb';
const INDEXNOW_KEY = (() => { try { return readFileSync(new URL('./.indexnow-key', import.meta.url), 'utf8').trim(); } catch { return process.env.INDEXNOW_KEY || ''; } })();
const GIPHY_KEY = (() => { try { return readFileSync(new URL('./.giphy-key', import.meta.url), 'utf8').trim(); } catch { return ''; } })();
const ADSENSE_CLIENT = (() => { try { return readFileSync(new URL('./.adsense-client', import.meta.url), 'utf8').trim(); } catch { return ''; } })();
const OPENROUTER_KEY = (() => {
  try {
    const m = readFileSync('/home/pinion/.hermes/.env', 'utf8').match(/^OPENROUTER_API_KEY=(.+)$/m);
    return m ? m[1].trim() : '';
  } catch { return ''; }
})();
function backgroundSave(job: () => Promise<void>) {
  job().catch((e) => console.error('background save failed:', e));
}
async function translateToEn(text: string): Promise<string> {
  if (!OPENROUTER_KEY || !text.trim()) return '';
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-5.5',
        messages: [
          { role: 'system', content: 'Translate Korean to natural English. Keep markdown formatting exactly (## headings, - lists, [links](url), ![alt](url), code fences). Output only the translation, nothing else.' },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!r.ok) return '';
    const j: any = await r.json();
    let out: string = j.choices?.[0]?.message?.content?.trim() || '';
    const thinkEnd = out.lastIndexOf('</think>');
    if (thinkEnd !== -1) out = out.slice(thinkEnd + 8).trim();
    return out;
  } catch { return ''; }
}

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
};
const posts: Post[] = [];
function reloadPosts() {
  posts.length = 0;
  const dir = new URL('./content/posts', import.meta.url);
  if (!existsSync(dir)) { try { mkdirSync(dir); } catch {} return; }
  posts.push(...readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => { const p = JSON.parse(readFileSync(new URL(`./content/posts/${f}`, import.meta.url), 'utf8')); p.title.ko = String(p.title.ko || '').replace(/^#{1,6}\s*/, '').trim(); p.title.en = String(p.title.en || '').replace(/^#{1,6}\s*/, '').trim(); return p; })
    .sort((a, b) => b.date.localeCompare(a.date)));
}
reloadPosts();
const getPost = (slug: string) => posts.find(p => p.slug === slug);
const stripMd = (md: string) => String(md || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#*_>`~\[\]()!-]/g, ' ').replace(/\s+/g, ' ');

const postPath = (lang: Lang, slug: string) => (lang === 'en' ? `/en/post/${slug}` : `/post/${slug}`);
const homePath = (lang: Lang) => (lang === 'en' ? '/en' : '/');
const lastmod = (p: Post): string => {
  try {
    return new Date(statSync(new URL(`./content/posts/${p.slug}.json`, import.meta.url)).mtime).toISOString();
  } catch { return `${p.date}T00:00:00+09:00`; }
};
function firstImage(p: Post): string | null {
  const m = /<img[^>]+src="([^"]+)"|!\[[^\]]*\]\(([^)\s]+)\)/i.exec(p.body.ko + p.body.en);
  if (!m) return null;
  const src = m[1] || m[2];
  return src.startsWith('http') ? src : SITE_URL + src;
}
// 단일 틸데(~)는 범위 표기(300~800 등)로 쓰이므로 취소선 파싱에서 제외 — ~~취소선~~만 인정
marked.use({
  tokenizer: {
    del(src: string) {
      const m = /^~~(?=\S)([\s\S]*?\S)~~/.exec(src);
      if (m) return { type: 'del', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) } as any;
      return undefined;
    }
  }
});
// 최소 sanitizer: script 태그·인라인 이벤트(on*)·javascript: URL만 제거 — style/table/iframe 등 임베드 표현력은 유지
const sanitizeHtml = (html: string) => {
  const KEEP: string[] = [];
  let out = html.replace(/<script\s+src="\/public\/[^"]*"><\/script>/gi, (m0) => { KEEP.push(m0); return '\u0000KEEP' + (KEEP.length - 1) + '\u0000'; });
  out = out
    .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/(<[^>]+)\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '$1')
  .replace(/(<[^>]+)?(href|src)\s*=\s*(["'])\s*javascript:[^"']*\3/gi, '$1 $2="#"');
  return out.replace(/\u0000KEEP(\d+)\u0000/g, (_, i) => KEEP[Number(i)]);
}
const md2html = (md: string) => sanitizeHtml(marked.parse(md, { async: false }) as string)
  .replace(/<h1>/g, '<h2>').replace(/<\/h1>/g, '</h2>');

// ---------- 댓글 DB ----------
const db = new DatabaseSync(new URL('./comments.db', import.meta.url).pathname);
db.exec(`CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  ip TEXT NOT NULL,
  body TEXT NOT NULL,
  image TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_comments_slug ON comments(slug)');
try { db.exec('ALTER TABLE comments ADD COLUMN body_en TEXT'); } catch { /* 이미 존재 */ }
const addComment = db.prepare('INSERT INTO comments (slug, name, ip, body, image) VALUES (?, ?, ?, ?, ?)');
const listComments = db.prepare('SELECT id, name, ip, body, image, created_at FROM comments WHERE slug = ? ORDER BY id DESC');
const listAllComments = db.prepare('SELECT id, slug, name, body, image, created_at FROM comments ORDER BY id DESC');
const deleteComment = db.prepare('DELETE FROM comments WHERE id = ?');
const listGuestbook = db.prepare(`SELECT id, name, body, body_en, image, created_at FROM comments WHERE slug = '__guestbook' ORDER BY id DESC LIMIT 100`);
const addGuestbook = db.prepare('INSERT INTO comments (slug, name, ip, body, image) VALUES (?, ?, ?, ?, ?)');
const setGuestbookEn = db.prepare('UPDATE comments SET body_en = ? WHERE id = ?');
backgroundSave(async () => {
  try {
    const rows = db.prepare(`SELECT id, body FROM comments WHERE slug='__guestbook' AND body_en IS NULL AND body != ''`).all() as any[];
    for (const r2 of rows) { const en = await translateToEn(r2.body); if (en) setGuestbookEn.run(en, r2.id); }
  } catch { /* noop */ }
});

db.exec(`CREATE TABLE IF NOT EXISTS device_seen (
  did TEXT NOT NULL,
  path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_device_seen_did ON device_seen(did)');
db.exec('CREATE INDEX IF NOT EXISTS idx_device_seen_created ON device_seen(created_at)');
db.exec(`CREATE TABLE IF NOT EXISTS presence (
  did TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  ts INTEGER NOT NULL
)`);
const upPresence = db.prepare(`INSERT INTO presence (did, path, ts) VALUES (?, ?, ?) ON CONFLICT(did) DO UPDATE SET path = excluded.path, ts = excluded.ts`);
const prunePresence = db.prepare('DELETE FROM presence WHERE ts < ?');
const cntPresence = db.prepare('SELECT COUNT(DISTINCT did) AS n FROM presence WHERE ts > ?');
const cntPresencePath = db.prepare('SELECT COUNT(DISTINCT did) AS n FROM presence WHERE ts > ? AND path = ?');
const chatAdd = db.prepare('INSERT INTO comments (slug, name, ip, body, image) VALUES (?, ?, ?, ?, ?)');
const chatInit = db.prepare(`SELECT id, name, body, image, created_at FROM comments WHERE slug = '__chat' ORDER BY id DESC LIMIT 30`);
const chatAfter = db.prepare(`SELECT id, name, body, image, created_at FROM comments WHERE slug = '__chat' AND id > ? ORDER BY id ASC LIMIT 50`);
const chatDup = db.prepare(`SELECT id, COUNT(*) AS n FROM comments WHERE slug = '__chat' AND name = ? AND body = ? AND image IS ? AND ip = ? AND created_at > datetime('now', '-8 seconds')`);
const addSeen = db.prepare('INSERT INTO device_seen (did, path) VALUES (?, ?)');
const countDevices = db.prepare(`SELECT
  (SELECT COUNT(DISTINCT did) FROM device_seen) AS all_time,
  (SELECT COUNT(DISTINCT did) FROM device_seen WHERE created_at >= datetime('now', 'localtime', 'start of day')) AS today,
  (SELECT COUNT(DISTINCT did) FROM device_seen WHERE created_at >= datetime('now', 'localtime', '-7 days')) AS week`);

// ---------- 유틸 ----------
function visitorIp(h: Headers): string {
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return h.get('x-real-ip') || h.get('remote-addr') || '';
}
const seen = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (seen.get(ip) || []).filter(t => now - t < 10 * 60_000);
  const limited = arr.length >= 3;
  if (!limited) { arr.push(now); seen.set(ip, arr); }
  return limited;
}
const chatSeen = new Map<string, number[]>();
function chatRateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (chatSeen.get(ip) || []).filter(t => now - t < 60_000);
  const limited = arr.length >= 10;
  if (!limited) { arr.push(now); chatSeen.set(ip, arr); }
  return limited;
}
const giphySeen = new Map<string, number[]>();
function giphyRateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (giphySeen.get(ip) || []).filter(t => now - t < 60_000);
  const limited = arr.length >= 10;
  if (!limited) { arr.push(now); giphySeen.set(ip, arr); }
  return limited;
}
const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const maskIp = (ip: string) => {
  if (ip.includes('.')) return ip.split('.').slice(0, 2).join('.') + '.x.x';
  return ip.split(':').slice(0, 2).join(':') + '::x';
};
const sameOrigin = (c: { req: { raw: Request } }) => {
  const h = c.req.raw.headers;
  const host = h.get('host');
  const origin = h.get('origin');
  const referer = h.get('referer');
  try {
    if (origin) return new URL(origin).host === host;
    if (referer) return new URL(referer).host === host;
  } catch { /* fallthrough */ }
  return !origin && !referer;
};

function securityHeaders(c: any, jsonldHtml?: string) {
  const scriptSrc = (ADSENSE_CLIENT
    ? "script-src 'self' https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com"
    : "script-src 'self'")
    + (jsonldHtml ? ` 'sha256-${createHash('sha256').update(jsonldHtml).digest('base64')}'` : '');
  const parts = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",  // 글 본문 HTML 임베드(<style>, style="") 허용
    "img-src 'self' data: https://media.giphy.com https://*.giphy.com",
    "connect-src 'self'",
    "font-src 'self'",
    "frame-src https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  c.header('Content-Security-Policy', parts.join('; '));
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
  c.header('Vary', 'Accept-Language');
}

// ---------- 헤드 ----------
function head(lang: Lang, o: { title: string; desc: string; path: string; type?: string; jsonldHtml?: string; thumb?: string | null; alternates?: Record<Lang, string> }) {
  const canonical = `${SITE_URL}${o.path}`;
  const ogImage = o.thumb || `${SITE_URL}/public/og.png`;
  const adsense = ADSENSE_CLIENT ? html`<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>
<link rel="preconnect" href="https://pagead2.googlesyndication.com" crossorigin />
<link rel="preconnect" href="https://googleads.g.doubleclick.net" crossorigin />
<link rel="preconnect" href="https://tpc.googlesyndication.com" crossorigin />` : '';
  const hreflang = o.alternates
    ? raw((['ko', 'en'] as Lang[]).map(l => `<link rel="alternate" hreflang="${l}" href="${SITE_URL}${o.alternates![l]}" />`).join('\n')
      + `\n<link rel="alternate" hreflang="x-default" href="${SITE_URL}${o.alternates.ko}" />`)
    : '';
  return html`<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${o.title}</title>
<meta name="description" content="${o.desc}" />
<link rel="preload" href="/public/fonts/DungGeunMo.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/public/home-classic.css?v=37" as="style" />
<link rel="canonical" href="${canonical}" />
<meta name="naver-site-verification" content="b772d55249f687c4f016c2b33cbcde1f1006d12a" />
<meta name="google-site-verification" content="Eoit82zDj0gOaGtXaJUpWtksxNxgAglIlg0ijwA_-1g" />
<link rel="icon" href="/public/favicon.ico?v=3" sizes="48x48" />
<link rel="icon" type="image/png" sizes="32x32" href="/public/favicon-32.png?v=3" />
<link rel="apple-touch-icon" href="/public/apple-touch-icon.png" />
${hreflang}
<meta name="robots" content="max-image-preview:large" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:type" content="${o.type ?? 'website'}" />
<meta property="og:title" content="${o.title}" />
<meta property="og:description" content="${o.desc}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${ogImage}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${o.desc}" />
<meta property="og:locale" content="${lang === 'ko' ? 'ko_KR' : 'en_US'}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${o.title}" />
<meta name="twitter:description" content="${o.desc}" />
<meta name="twitter:image" content="${ogImage}" />
<link rel="alternate" type="application/rss+xml" title="${SITE_NAME}" href="${SITE_URL}/rss.xml" />
<link rel="sitemap" type="application/xml" title="sitemap" href="/sitemap.xml" />

<link rel="stylesheet" href="/public/style.css" />${adsense}${html([o.jsonldHtml ?? ''] as any)}`;
}

const umami = html`<script defer src="/script.js" data-website-id="${UMAMI_ID}"></script>`;
const deviceId = html`<script defer src="/public/device-id.js?v=6"></script>`;

// 어드민 전용 레이아웃
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
      <a href="/admin/stats">대시보드</a>
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

// 헤더: 로고 + 언어 전환(링크)
function layout(lang: Lang, headHtml: any, content: any, switchTo?: string) {
  const other = ALT[lang];
  const flag = (cc: string) => html`<img class="flag" src="/public/flags/${cc}.png" alt="${cc.toUpperCase()}" width="24" height="16" />`;
  const sw = switchTo
    ? html`<div class="tabs lang-tabs" role="navigation">
        <span class="lang-tab on">${flag(lang === 'ko' ? 'kr' : 'us')}</span>
        <a class="lang-tab" href="${switchTo}" title="${other.toUpperCase()}">${flag(other === 'ko' ? 'kr' : 'us')}</a>
      </div>`
    : '';
  return html`<!DOCTYPE html>
<html lang="${lang}">
<head>
${headHtml}
${umami}${deviceId}
<script defer src="/public/gifs.js"></script>
</head>
<body data-lang="${lang}">
<header>
  <nav class="site-nav">
    <a class="brand" href="${homePath(lang)}">~/</a>
    ${sw}
  </nav>
</header>
<main>
${content}
</main>
<footer>
  <div class="profile-links"><a href="https://github.com/pinion05" rel="noopener">GITHUB</a><span> · </span><a href="https://www.linkedin.com/in/%EB%AA%85%EC%B2%A0-%EB%B0%95-6a886928a/" rel="noopener">LINKEDIN</a><span> · </span></div>
  <span>// ${SITE_NAME} — verified posts only. no slop.</span>
</footer>
</body>
</html>`;
}

// ---------- 앱 ----------
const app = new Hono();

app.get('/api/search', (c) => {
  const q = String(c.req.query('q') || '').trim().toLowerCase();
  const f = String(c.req.query('fields') || 'title,body');
  if (!q) return c.json({ slugs: posts.map((p: any) => p.slug) });
  const inTitle = f.includes('title'), inBody = f.includes('body');
  const slugs = posts.filter((p: any) => {
    if (inTitle && ((p.title.ko || '').toLowerCase().includes(q) || (p.title.en || '').toLowerCase().includes(q))) return true;
    if (inBody && (stripMd(p.body?.ko).toLowerCase().includes(q) || stripMd(p.body?.en).toLowerCase().includes(q))) return true;
    return false;
  }).map((p: any) => p.slug);
  return c.json({ slugs });
});

// 홈 (ko/en 공통 팩토리)
// 인기글: Umami DB 직접 조회 (최근 30일 /post/* 조회수)
let pgPool: pg.Pool | null = null;
function getPool(): pg.Pool {
  if (!pgPool) {
    const compose = readFileSync('/home/pinion/wordpress/docker-compose.yml', 'utf8');
    const env = (k: string) => compose.match(new RegExp(`${k}:\\s*"?([^"\\n]+)"?`))?.[1]?.trim() || 'umami';
    pgPool = new pg.Pool({
      host: '127.0.0.1', port: 5433,
      user: env('POSTGRES_USER'), password: env('POSTGRES_PASSWORD'), database: env('POSTGRES_DB'),
      max: 1, connectionTimeoutMillis: 3000,
    });
  }
  return pgPool;
}
let popularCache: { at: number; rows: { slug: string; views: number }[] } = { at: 0, rows: [] };
async function topPosts() {
  if (Date.now() - popularCache.at < 60_000) return popularCache.rows;
  try {
    const r = await getPool().query(
      `SELECT replace(url_path, '/en/post/', '/post/') AS p, count(*)::int AS views
       FROM website_event
       WHERE url_path LIKE '%/post/%' AND created_at >= now() - interval '30 days'
       GROUP BY 1 ORDER BY views DESC LIMIT 10`);
    const agg = new Map<string, number>();
    for (const row of r.rows) {
      const m = String(row.p).match(/^\/post\/([a-z0-9-]+)/);
      if (m) agg.set(m[1], (agg.get(m[1]) || 0) + Number(row.views || 0));
    }
    popularCache = { at: Date.now(), rows: [...agg.entries()].map(([slug, views]) => ({ slug, views })).sort((a, b) => b.views - a.views) };
  } catch { /* 실패 시 마지막 캐시 유지 */ }
  return popularCache.rows;
}

const tagsOf = (p: any) => (p.tags && p.tags.length ? p.tags : ['MISC']).map((x: string) => String(x).toUpperCase());
const postsData = JSON.stringify(posts.map(p => ({ slug: p.slug, date: p.date, tags: tagsOf(p), title: p.title.ko, titleEn: p.title.en, desc: p.description.ko, descEn: p.description.en })));
const isMobile = (c: any) => /Mobi|Android|iPhone|iPad|Windows Phone/i.test(c.req.header('user-agent') || '');

let counterCache = { at: 0, total: 0, today: 0 };
async function homeCounter() {
  if (Date.now() - counterCache.at < 60_000) return counterCache;
  try {
    const r = await getPool().query(
      `SELECT count(*) FILTER (WHERE event_type=1)::int AS total,
              count(*) FILTER (WHERE event_type=1 AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')::int AS today
       FROM website_event WHERE website_id=$1`, [UMAMI_ID]);
    counterCache = { at: Date.now(), total: Number(r.rows[0]?.total || 0), today: Number(r.rows[0]?.today || 0) };
  } catch { /* 실패 시 캐시 유지 */ }
  return counterCache;
}

// ---------- 사이트 카피(텍스트) 편집 — content/site-copy.json 오버라이드 ----------
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
    footer1: '© 2026 PINION — {DESC}',
    footerMeta: 'LAST UPDATED: {DATE} ◇ BEST VIEWED AT 1280×1024 ◇ NETSCAPE NAVIGATOR 4.0 / INTERNET EXPLORER 5.0',
    footerMetaShort: 'BEST VIEWED AT 1280×1024 ◇ NETSCAPE NAVIGATOR 4.0',
    footer3: '',
    gbTitle: '방명록 — GUESTBOOK', gbIntro: '흔적을 남겨주세요! 아무 이야기나 환영합니다.',
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
    statsCounterTitle: '사이트 통계 — WEB COUNTER', statsKeyTitle: '주요 지표 (30일)', statsTrendTitle: '30일 추이',
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
    footer1: '© 2026 PINION — {DESC}',
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
    statsCounterTitle: 'SITE STATS — WEB COUNTER', statsKeyTitle: 'KEY NUMBERS (30d)', statsTrendTitle: '30-DAY TREND',
    statsChanTitle: 'TRAFFIC SOURCES (30d)', statsHeatTitle: 'VISIT HEATMAP (KST)', statsReportTitle: 'POST REPORT (30d)',
    statsGeoTitle: 'WHERE FROM', statsDevTitle: 'DEVICES · OS · BROWSERS', statsLogTitle: 'LIVE LOG (LAST 15)',
    statsCohortTitle: 'COHORT RETENTION', statsAssocTitle: 'READ TOGETHER', statsDepthTitle: 'SESSION DEPTH',
  },
};
let COPY: Record<Lang, Record<string, string>> = { ko: {}, en: {} };
try {
  const f = JSON.parse(readFileSync(COPY_FILE, 'utf8'));
  COPY = { ko: { ...(f.ko || {}) }, en: { ...(f.en || {}) } };
} catch { /* 파일 없음 — 기본값만 */ }
const co = (lang: Lang, key: string): string => COPY[lang][key] ?? COPY_DEFAULTS[lang][key] ?? '';
const fill = (s: string, map: Record<string, string>): string =>
  s.replace(/\{(\w+)\}/g, (_, k2) => map[k2] ?? '');
const badgeBr = (lang: Lang, k: string) => html([co(lang, k).split('|').join('<br>')] as any);

const T = (lang: Lang) => ({
  board: co(lang, 'board'), top: co(lang, 'top'), log: co(lang, 'log'),
  home: co(lang, 'home'), posts: co(lang, 'posts'), guest: co(lang, 'guest'), stats: co(lang, 'stats'),
  welcome: co(lang, 'welcome'),
  marquee: (t2: string, d: string) => fill(co(lang, 'marquee'), { TITLE: t2, DATE: d }),
  nth: (n: number) => fill(co(lang, 'nth'), { N: String(n).padStart(4, '0') }),
  newpost: co(lang, 'newpost'), opened: co(lang, 'opened'),
  footer1: fill(co(lang, 'footer1'), { DESC: lang === 'ko' ? SITE_DESC : SITE_DESC_EN }),
  footer3: co(lang, 'footer3'),
  no: co(lang, 'no'), date: co(lang, 'date'), title: co(lang, 'title'), cat: co(lang, 'cat'), views: co(lang, 'views'),
});

function classicHomeBody(c: any, lang: Lang, mobile: boolean, top: { slug: string; views: number }[]) {
  const liveSite = cntPresence.get(Date.now() - 90_000).n;
  const desc = lang === 'ko' ? SITE_DESC : SITE_DESC_EN;
  const t = T(lang);
  const initTags = String(c.req.query('tags') || c.req.query('cat') || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
  const tagCount = new Map<string, number>();
  for (const p of posts) for (const k of tagsOf(p)) tagCount.set(k, (tagCount.get(k) || 0) + 1);
  const shown = posts;
  const other = lang === 'ko' ? 'en' : 'ko';
  const latest = posts[0];
  const viewsBySlug = new Map(top.map((r) => [r.slug, r.views]));
  const topRows = top.slice(0, 3).map((r) => ({ p: getPost(r.slug), views: r.views }));
  const medals = ['medal1', 'medal2', 'medal2'];
  const ranks = ['rank1', 'rank2', 'rank2'];

  const digits = String(counterCache.total).padStart(6, '0').split('').map((d2) => html`<span class="digit">${d2}</span>`);
  const topt = top.length ? top[0] : null;
  const toptP = topt ? getPost(topt.slug) : null;

  return html`<link rel="stylesheet" href="/public/home-classic.css?v=29" />
<div class="crt-roll"></div>
<div class="page" id="top">

  <div class="banner">
    <div class="lang-flags">
      ${lang === 'ko'
        ? html`<span class="cur"><img class="flag" src="/public/flags/kr.png" alt="한국어"></span><a href="${homePath(other)}" title="English"><img class="flag" src="/public/flags/us.png" alt="English"></a>`
        : html`<a href="${homePath(other)}" title="한국어"><img class="flag" src="/public/flags/kr.png" alt="한국어"></a><span class="cur"><img class="flag" src="/public/flags/us.png" alt="English"></span>`}
    </div>
    <h1 class="site-title"><span class="star">★</span> ${co(lang, 'siteTitle')} <span class="star">★</span></h1>
    <div class="tagline">— ${co(lang, 'tagline')} —</div>
    <div class="banner-meta">${fill(co(lang, 'bannerMeta'), { DATE: latest?.date ?? '' })}</div>
  </div>

  <div class="rainbow"></div>
  ${liveStrip(lang)}
  <table class="layout"><tr>

    <td class="side">
      ${chatBox(lang)}
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/search_file_2-4.png" alt=""> ${co(lang, 'menuTitle')}</div>
        <div class="box-body">
          <ul class="list">
            <li><img class="ico" src="/public/icons/homepage-0.png" alt=""> <a href="${homePath(lang)}">${t.home}</a></li>
            <li><img class="ico" src="/public/icons/message_envelope_open-0.png" alt=""> <a href="${lang === 'ko' ? '/guestbook' : '/en/guestbook'}">${t.guest}</a></li>
            <li><img class="ico" src="/public/icons/chart1-4.png" alt=""> <a href="${lang === 'ko' ? '/stats' : '/en/stats'}">${t.stats}</a></li>
            <li><img class="ico" src="/public/icons/html-2.png" alt=""> <a href="https://github.com/pinion05" target="_blank" rel="noopener">GITHUB</a></li>
          </ul>
        </div>
      </div>

      <div class="box box-tags" id="tags-box">
        <div class="box-title"><img class="ico" src="/public/icons/key_win-2.png" alt=""> ${co(lang, 'categoryTitle')}</div>
        <div class="box-body">
          <div class="tagrows">
            <label class="tagrow"><input type="checkbox" class="tagchk" value="" checked> <span>ALL</span><span class="cnt">${posts.length}</span></label>
            ${[...tagCount.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => html`<label class="tagrow"><input type="checkbox" class="tagchk" value="${k}"${initTags.includes(k) ? ' checked' : ''}> <span>${k}</span><span class="cnt">${n}</span></label>`)}
          </div>
        </div>
      </div>

      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/half_heart.png" alt=""> ${co(lang, 'profileTitle')}</div>
        <div class="box-body center">
          <div class="profile-icon"><img class="ico-big" src="/public/icons/half_heart.png" alt="half heart"></div>
          <b>${co(lang, 'profileName')}</b>
          <div class="dim">${co(lang, 'profileDesc')}</div>
          <hr class="dotted">
          <ul class="list left">
            <li><img class="ico" src="/public/icons/html-2.png" alt=""> <a href="https://github.com/pinion05" target="_blank" rel="noopener">GITHUB</a></li>
            <li><img class="ico" src="/public/icons/html-2.png" alt=""> <a href="https://www.linkedin.com/in/%EB%AA%85%EC%B2%A0-%EB%B0%95-6a886928a/" target="_blank" rel="noopener">LINKEDIN</a></li>
          </ul>
        </div>
      </div>

      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/chart1-4.png" alt=""> ${co(lang, 'counterTitle')}</div>
        <div class="box-body" style="text-align:center;">
          <div class="counter">${digits}</div>
          <div class="counter-label">${co(lang, 'totalViews')} — ${t.nth(counterCache.total || 1)}</div>
          <div class="counter small today">${String(counterCache.today).padStart(4, '0').split('').map((d2) => html`<span class="digit">${d2}</span>`)}</div>
          <div class="counter-label">${co(lang, 'today')}</div>
        </div>
      </div>

    </td>

    <td class="main">

      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/msg_information-0.png" alt=""> WELCOME</div>
        <div class="box-body">${t.welcome} <img class="ico" src="/public/icons/msg_warning-0.png" alt=""></div>
      </div>

      <div class="box" id="board">
        <div class="box-title board-titlebar"><img class="ico" src="/public/icons/notepad-2.png" alt=""> <span id="board-title" data-base="${t.board}">${t.board}${initTags.length ? html` — ${initTags.join(' + ')}` : ''}</span>
          <span class="bsearch">
            <input type="text" id="board-search" placeholder="${lang === 'ko' ? '검색' : 'Search'}" autocomplete="off" />
            <label class="srow"><input type="checkbox" id="s-title" checked> ${lang === 'ko' ? '제목' : 'Title'}</label>
            <label class="srow"><input type="checkbox" id="s-body"> ${lang === 'ko' ? '내용' : 'Body'}</label>
          </span>
          <span class="sort-ctl"><button type="button" id="sort-date" class="sortbtn on">${lang === 'ko' ? '날짜순' : 'Date'}</button><button type="button" id="sort-views" class="sortbtn">${lang === 'ko' ? '조회수순' : 'Views'}</button></span>
          <span id="search-info" class="search-info"></span>
        </div>
        <div class="box-body pad6">
          <table class="posts">
            <tr><th class="c-date">${t.date}</th><th>${t.title}</th><th class="c-cat">${t.cat}</th><th class="c-views">${t.views}</th></tr>
            <tbody id="board-body">${shown.map((p, i) => mobile ? html`<tr class="m-row"><td colspan="5">
              <div class="m-meta"><span class="date">${p.date}</span>${tagsOf(p).map((tg) => html`<span class="catl">${tg}</span>`)}<span class="views"><img class="ico" src="/public/icons/file_eye.png" alt=""> ${viewsBySlug.get(p.slug) || 0}</span></div>
              <div class="m-titleline"><a href="${postPath(lang, p.slug)}">${p.title[lang]}</a>${i === 0 && !initTags.length ? html`<span class="new">${co(lang, 'newBadge')}</span>` : ''}</div>
              <div class="desc">${p.description[lang]}</div>
            </td></tr>` : html`<tr>
              <td class="date">${p.date}</td>
              <td>
                <a href="${postPath(lang, p.slug)}">${p.title[lang]}</a>${i === 0 && !initTags.length ? html`<span class="new">${co(lang, 'newBadge')}</span>` : ''}
                <div class="desc">${p.description[lang]}</div>
              </td>
              <td class="c-cat">${tagsOf(p).map((tg) => html`<span class="catl">${tg}</span>`)}</td>
              <td class="views"><img class="ico" src="/public/icons/file_eye.png" alt=""> ${viewsBySlug.get(p.slug) || 0}</td>
            </tr>`)}</tbody>
          </table>
        </div>
      </div>

      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/chart1-4.png" alt=""> ${t.top}</div>
        <div class="box-body">
          <ul class="list pop">
            ${topRows.length ? topRows.map((r, i) => r.p ? html`<li><span class="${medals[i]}"><img class="ico" src="/public/icons/certificate-0.png" alt=""></span> <b class="${ranks[i]}">${i + 1}${lang === 'ko' ? '위' : 'st.'}.</b> <a href="${postPath(lang, r.p.slug)}">${r.p.title[lang].slice(0, 24)}${r.p.title[lang].length > 24 ? '...' : ''}</a> <span class="dim">(${r.views} views)</span></li>` : '') : html`<li class="dim">—</li>`}
          </ul>
        </div>
      </div>

      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/notepad_file_gear-2.png" alt=""> ${t.log}</div>
        <div class="box-body">
          <ul class="log">
            ${posts.map((p, i) => html`<li><span class="d">${p.date}</span> — ${i === 0 ? t.newpost : t.opened} (${tagsOf(p)[0]}): ${p.title[lang]}</li>`)}
          </ul>
        </div>
      </div>



    </td>
  </tr></table>

  <div class="rainbow"></div>

  <div class="footer">
    <div>${t.footer1}</div>
    <div class="mono mt4">${fill(co(lang, 'footerMeta'), { DATE: latest?.date ?? '' })}</div>
    <div class="mt4">${t.footer3} <a href="#top">${co(lang, 'topLink')}</a></div>
    <div class="mono ver-badge">v${SITE_VERSION} · since 2026</div>
  </div>

</div>`;
}

function chatBox(lang: Lang) {
  return html`
      <div class="box box-chat" id="chat">
        <div class="box-title"><img class="ico" src="/public/icons/message_envelope_open-0.png" alt=""> ${co(lang, 'chatTitle')}</div>
        <div class="box-body">
          <div id="chat-log" class="chat-log" aria-live="polite"></div>
          <form id="chat-form" class="chat-form">
            <div class="c-row chat-row">
              <input type="text" id="chat-name" maxlength="30" placeholder="${co(lang, 'chatNamePh')}" autocomplete="off" />
              <button type="button" id="c-gif-btn" class="gif-btn">${co(lang, 'gifBtnLabel')}</button>
            </div>
            <div class="c-row chat-row">
              <input type="text" id="chat-msg" maxlength="300" placeholder="${co(lang, 'chatMsgPh')}" autocomplete="off" />
              <button type="submit">${co(lang, 'chatSend')}</button>
            </div>
            <span id="c-gif-picked" class="gif-picked" hidden>${co(lang, 'gifPicked')}</span>
            <div id="c-gif-panel" class="gif-panel" hidden>
              <input type="text" id="c-gif-q" placeholder="${co(lang, 'gifSearchPh')}" autocomplete="off" />
              <div id="c-gif-grid" class="gif-grid"></div>
            </div>
            <input type="hidden" name="giphy_id" id="c-giphy-id" />
          </form>
        </div>
      </div>`;
}

function liveStrip(lang: Lang) {
  return html`<div class="live-strip"><span class="live-dot"></span> <b id="live-site">${cntPresence.get(Date.now() - 90_000).n}</b><span class="live-suf">${co(lang, 'liveNow')}</span><span id="live-here" class="live-here"></span></div>`;
}

function classicSide(lang: Lang) {
  const t = T(lang);
  const dv = counterCache;
  const digits = String(dv.total).padStart(6, '0').split('').map((d2) => html`<span class="digit">${d2}</span>`);
  const tagCount2 = new Map<string, number>();
  for (const p of posts) for (const k of tagsOf(p)) tagCount2.set(k, (tagCount2.get(k) || 0) + 1);
  const cats = [...tagCount2.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return html`
      ${chatBox(lang)}
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/search_file_2-4.png" alt=""> ${co(lang, 'menuTitle')}</div>
        <div class="box-body">
          <ul class="list">
            <li><img class="ico" src="/public/icons/homepage-0.png" alt=""> <a href="${homePath(lang)}">${t.home}</a></li>
            <li><img class="ico" src="/public/icons/message_envelope_open-0.png" alt=""> <a href="${lang === 'ko' ? '/guestbook' : '/en/guestbook'}">${t.guest}</a></li>
            <li><img class="ico" src="/public/icons/chart1-4.png" alt=""> <a href="${lang === 'ko' ? '/stats' : '/en/stats'}">${t.stats}</a></li>
          </ul>
        </div>
      </div>
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/key_win-2.png" alt=""> ${co(lang, 'categoryTitle')}</div>
        <div class="box-body">
          <ul class="list">
            <li><img class="ico" src="/public/icons/key_win-2.png" alt=""> <a href="${homePath(lang)}">ALL(${posts.length})</a></li>
            ${cats.map(([k, n]) => html`<li><img class="ico" src="/public/icons/key_win-2.png" alt=""> <a href="${homePath(lang)}?tags=${encodeURIComponent(k)}">${k}(${n})</a></li>`)}
          </ul>
        </div>
      </div>
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/chart1-4.png" alt=""> ${co(lang, 'counterTitle')}</div>
        <div class="box-body" style="text-align:center;">
          <div class="counter">${digits}</div>
          <div class="counter-label">${co(lang, 'totalViews')}</div>
          <div class="counter small today">${String(dv.today).padStart(4, '0').split('').map((d2) => html`<span class="digit">${d2}</span>`)}</div>
          <div class="counter-label">${co(lang, 'today')}</div>
        </div>
      </div>`;
}

function classicShell(lang: Lang, mainContent: any, headExtra: any) {
  const desc = lang === 'ko' ? SITE_DESC : SITE_DESC_EN;
  const other = lang === 'ko' ? 'en' : 'ko';
  return html`<link rel="stylesheet" href="/public/home-classic.css?v=29" />
<div class="page" id="top">
  <div class="banner slim">
    <div class="lang-flags">
      ${lang === 'ko'
        ? html`<span class="cur"><img class="flag" src="/public/flags/kr.png" alt="한국어"></span><a href="${homePath(other)}" title="English"><img class="flag" src="/public/flags/us.png" alt="English"></a>`
        : html`<a href="${homePath(other)}" title="한국어"><img class="flag" src="/public/flags/kr.png" alt="한국어"></a><span class="cur"><img class="flag" src="/public/flags/us.png" alt="English"></span>`}
    </div>
    <h1 class="site-title"><span class="star">★</span> ${co(lang, 'siteTitle')} <span class="star">★</span></h1>
    <div class="tagline">— ${co(lang, 'tagline')} —</div>
  </div>
  <div class="rainbow"></div>
  ${liveStrip(lang)}
  <table class="layout"><tr>
    <td class="side">${classicSide(lang)}</td>
    <td class="main">${mainContent}</td>
  </tr></table>
  <div class="rainbow"></div>
  <div class="footer">
    <div>${fill(co(lang, 'footer1'), { DESC: desc })}</div>
    <div class="mono mt4">${co(lang, 'footerMetaShort')}</div>
    <div class="mono ver-badge">v${SITE_VERSION} · since 2026</div>
  </div>
</div>
<script defer src="/public/chat.js?v=7"></script>`;
}

async function renderGuestbook(c: any, lang: Lang) {
  await homeCounter();
  const entries = listGuestbook.all() as any[];
  const ko = lang === 'ko';
  const t = T(lang);
  const inner = html`
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/message_envelope_open-0.png" alt=""> ${co(lang, 'gbTitle')}</div>
        <div class="box-body">
          ${html`<img class="ico" src="/public/icons/msg_information-0.png" alt=""> ${co(lang, 'gbIntro')}`}
        </div>
      </div>
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/write_wordpad-0.png" alt=""> ${co(lang, 'gbSignTitle')}</div>
        <div class="box-body">
          <form method="POST" action="/api/guestbook" class="c-form gb-form">
            <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true" />
            <div class="c-row">
              <input type="text" name="author" maxlength="60" placeholder="${co(lang, 'gbNamePh')}" />
              <button type="submit">${co(lang, 'gbSign')}</button>
            </div>
            <div class="gif-bar">
              <button type="button" id="gif-btn" class="gif-btn">${co(lang, 'gifBtnLabel')}</button>
              <span id="gif-picked" class="gif-picked" hidden>${co(lang, 'gifPicked')}</span>
            </div>
            <div id="gif-panel" class="gif-panel" hidden>
              <input type="text" id="gif-q" placeholder="${co(lang, 'gifSearchPh')}" autocomplete="off" />
              <div id="gif-grid" class="gif-grid"></div>
            </div>
            <input type="hidden" name="giphy_id" id="giphy-id" />
            <textarea name="body" required maxlength="500" rows="3" placeholder="${co(lang, 'gbMsgPh')}"></textarea>
          </form>
        </div>
      </div>
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/notepad-2.png" alt=""> ${fill(co(lang, 'gbCount'), { N: String(entries.length) })}</div>
        <div class="box-body">
          ${entries.length ? entries.map((e) => html`
          <div class="gb-entry">
            <div class="c-head"><span class="c-name">${e.name === '익명' && lang === 'en' ? 'Anonymous' : e.name}</span><time class="c-date">${e.created_at}</time></div>
            <p class="c-body">${(lang === 'en' && e.body_en) ? e.body_en : e.body}</p>
            ${e.image ? html`<img class="c-img" src="${e.image}" alt="GIF" loading="lazy" />` : ''}
          </div>`) : html`<p class="hint">${co(lang, 'gbEmpty')}</p>`}
        </div>
      </div>`;
  const canonical = SITE_URL + (lang === 'ko' ? '/guestbook' : '/en/guestbook');
  const title = ko ? `방명록 — ${SITE_NAME}` : `Guestbook — ${SITE_NAME}`;
  const desc2 = ko ? 'PINION 방명록 — 방문 흔적을 남겨주세요.' : 'PINION guestbook — leave a trace.';
  const body = html`<!DOCTYPE html>
<html lang="${lang}">
<head>
${html([head(lang, { title, desc: desc2, canonical, type: 'website', alternates: { ko: '/guestbook', en: '/en/guestbook' } })] as any)}
</head>
<body class="home-classic${isMobile(c) ? ' m' : ''}">
${classicShell(lang, inner, '')}
${umami}${deviceId}
<script defer src="/public/gifs.js?v=1"></script>
</body>
</html>`;
  return c.html(body as any);
}

async function renderHome(c: any, lang: Lang) {
  await homeCounter();
  const top = await topPosts();
  const viewsBySlug = Object.fromEntries(top.map((r) => [r.slug, r.views]));
  const mobile = isMobile(c);
  const desc = lang === 'ko' ? SITE_DESC : SITE_DESC_EN;
  const canonical = SITE_URL + (lang === 'ko' ? '/' : '/en');
  const body = html`<!DOCTYPE html>
<html lang="${lang}">
<head>
${html([head(lang, {
    title: lang === 'ko' ? `${SITE_NAME} — ${SITE_DESC}` : `${SITE_NAME} — ${SITE_DESC_EN}`,
    desc,
    canonical,
    type: 'website',
  })] as any)}
</head>
<body class="home-classic${mobile ? ' m' : ''}">
${classicHomeBody(c, lang, mobile, top)}
<script type="application/json" id="posts-data">${raw(postsData)}</script>
<script type="application/json" id="views-data">${raw(JSON.stringify(viewsBySlug))}</script>
<script src="/public/home-classic.js?v=4" defer></script>
<script src="/public/chat.js?v=3" defer></script>
${umami}${deviceId}
</body>
</html>`;
  return c.html(body as any);
}

// 루트: 언어 협상 — 루트 진입 1회만 302 (깊은 링크는 협상 없음), 캐시 변이 헤더
app.get('/', (c) => {
  const al = c.req.raw.headers.get('accept-language') || '';
  c.header('Vary', 'Accept-Language');
  if (al && !/(^|[;,\-])\s*ko\b/i.test(al)) return c.redirect('/en', 302);
  return renderHome(c, 'ko');
});
app.get('/en', (c) => renderHome(c, 'en'));

// 글 페이지 (ko / en)
async function renderPost(c: any, lang: Lang, slug: string) {
  await homeCounter();
  const p = getPost(slug);
  if (!p) return c.notFound();
  if (lang === 'en' && !p.body.en.trim()) return c.redirect(postPath('ko', slug), 302);
  const url = `${SITE_URL}${postPath(lang, slug)}`;
  const thumb = p.og || firstImage(p);
  const iso = lastmod(p);
  const jsonld = [{ '@context': 'https://schema.org', '@type': 'BlogPosting',
    headline: p.title[lang], description: p.description[lang],
    datePublished: p.date, dateModified: iso,
    inLanguage: lang, url, mainEntityOfPage: url,
    image: thumb || `${SITE_URL}/public/og.png`,
    author: { '@type': 'Person', name: AUTHOR_NAME, url: SITE_URL },
    publisher: { '@type': 'Person', name: AUTHOR_NAME, url: SITE_URL },
    publisher: { '@type': 'Person', name: AUTHOR_NAME },
  }, { '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${SITE_URL}${homePath(lang)}` },
      { '@type': 'ListItem', position: 2, name: p.title[lang], item: url },
    ] }];
  const jsonldHtml = `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>`;
  securityHeaders(c, jsonldHtml);
  const comments = (listComments.all(slug) as any[]);
  const commentList = comments.map(cm => html`
  <div class="comment">
    <div class="c-head"><span class="c-name">${cm.name}</span>
    <time class="c-date" datetime="${cm.created_at}">${cm.created_at}</time></div>
    <p class="c-body">${cm.body}</p>
    ${cm.image ? html`<img class="c-img" src="${cm.image}" alt="GIF" loading="lazy" />` : ''}
  </div>`);
  const idx = posts.findIndex((x) => x.slug === slug);
  const newer = posts[idx - 1], older = posts[idx + 1];
  const otherLang = lang === 'ko' ? 'en' : 'ko';
  const switchLabel = co(lang, 'switchLabel');
  const switchToUrl = postPath(ALT[lang], slug);
  const headOpts = {
     title: `${p.title[lang]} — ${SITE_NAME}`,
    desc: p.description[lang], path: postPath(lang, slug), type: 'article',
    jsonldHtml, thumb,
    alternates: { ko: postPath('ko', slug), en: postPath('en', slug) },};
  const pageHtml = html`
  <div class="box">
    <div class="box-title"><img class="ico" src="/public/icons/message_envelope_open-0.png" alt=""> ${co(lang, 'comments')} (${comments.length})</div>
    <div class="box-body">
      ${commentList}
      <form method="POST" action="/api/comments" class="c-form">
      <input type="hidden" name="slug" value="${p.slug}" />
      <input type="hidden" name="back" value="${postPath(lang, slug)}" />
      <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true" />
      <input type="hidden" name="giphy_id" id="giphy-id" />
      <div class="gif-bar">
        <button type="button" id="gif-btn" class="gif-btn">${co(lang, 'gifBtnLabel')}</button>
        <span id="gif-picked" class="gif-picked" hidden>${co(lang, 'gifPicked')}</span>
      </div>
      <div id="gif-panel" class="gif-panel" hidden>
        <input type="text" id="gif-q" placeholder="${co(lang, 'gifSearchPh')}" autocomplete="off" />
        <div id="gif-grid" class="gif-grid"></div>
      </div>
      <textarea name="body" required maxlength="2000" placeholder="${co(lang, 'commentPh')}" rows="3"></textarea>
      <div class="c-row">
        <input type="text" name="author" maxlength="60" placeholder="${co(lang, 'commentNamePh')}" />
        <button type="submit">${co(lang, 'commentSubmit')}</button>
      </div>
    </form>
    </div>
  </div>`;
  const ko = lang === 'ko';
  const inner = html`
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/notepad-2.png" alt=""> ${p.date} · ${tagsOf(p).join(' · ')} ${idx === 0 ? html`<span class="new">${co(lang, 'newBadge')}</span>` : ''}</div>
        <div class="box-body post-body">
          <h1 class="post-h1">${p.title[lang]}</h1>
          ${html([md2html(p.body[lang])] as any)}
        </div>
      </div>
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/search_file_2-4.png" alt=""> ${co(lang, 'navTitle')}</div>
        <div class="box-body">
          <ul class="list post-nav">
            <li><img class="ico" src="/public/icons/html-2.png" alt=""> <a href="${switchToUrl}">${switchLabel}</a></li>
            ${newer ? html`<li><img class="ico" src="/public/icons/notepad-2.png" alt=""> <a href="${postPath(lang, newer.slug)}">▲ ${newer.title[lang]}</a></li>` : ''}
            ${older ? html`<li><img class="ico" src="/public/icons/notepad-2.png" alt=""> <a href="${postPath(lang, older.slug)}">▼ ${older.title[lang]}</a></li>` : ''}
            <li><img class="ico" src="/public/icons/homepage-0.png" alt=""> <a href="${homePath(lang)}#board">≡ ${co(lang, 'backList')}</a></li>
          </ul>
        </div>
      </div>
      ${pageHtml}`;
  const body = html`<!DOCTYPE html>
<html lang="${lang}">
<head>
${html([head(lang, headOpts)] as any)}
</head>
<body class="home-classic${isMobile(c) ? ' m' : ''}">
${classicShell(lang, inner, '')}
${umami}${deviceId}
<script defer src="/public/gifs.js?v=1"></script>
</body>
</html>`;
  return c.html(body as any);
}

// 공개 통계 페이지 (어드민 대시보드 데이터의 90s 리믹스)
async function renderStats(c: any, lang: Lang) {
  await homeCounter();
  let st: any = null;
  try { st = await gatherStats(); } catch { /* DB 실패 시 카운터만 */ }
  const t = T(lang);
  const ko = lang === 'ko';
  const boxes: any[] = [];
  if (st) {
    const D = deriveStats(st, lang);
    const k = D.k;
    const kv: [string, any][] = [
      [ko ? '실시간 세션 (5분)' : 'Live sessions (5m)', k.rt_sess ?? 0],
      [ko ? '오늘 조회수' : 'Views today', `${k.v_today ?? 0} (${ko ? '방문자' : 'visitors'} ${k.s_today ?? 0})`],
      [ko ? '어제 조회수' : 'Views yesterday', k.v_yday ?? 0],
      [ko ? '7일 조회수' : 'Views 7 days', `${k.v_week ?? 0} (${ko ? '방문자' : 'visitors'} ${k.s_week ?? 0})`],
      [ko ? '30일 조회수' : 'Views 30 days', `${k.v_month ?? 0} (${ko ? '방문자' : 'visitors'} ${k.s_month ?? 0})`],
      [ko ? '고유 기기' : 'Unique devices', `${st.dv.all_time} (${ko ? '오늘' : 'today'} ${st.dv.today})`],
    ];
    boxes.push(html`
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/msg_information-0.png" alt=""> ${co(lang, 'statsKeyTitle')}</div>
        <div class="box-body"><table class="stat">${kv.map(([l2, v]) => html`<tr><td>${l2}</td><td class="num">${v}</td></tr>`)}</table></div>
      </div>
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/chart1-4.png" alt=""> ${co(lang, 'statsTrendTitle')}</div>
        <div class="box-body">${html([svgSeries(st.days)] as any)}</div>
      </div>
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/chart1-4.png" alt=""> ${co(lang, 'statsChanTitle')}</div>
        <div class="box-body">${html([svgDonut(D.chParts)] as any)}
          <div class="legend">${html([D.legend] as any)}</div>
          <p class="hint">${ko ? `신규 ${D.retNew} · 재방문 ${D.retRe} (재방문률 ${D.retNew + D.retRe ? ((D.retRe / (D.retNew + D.retRe)) * 100).toFixed(0) : 0}%)` : `new ${D.retNew} · returning ${D.retRe} (${D.retNew + D.retRe ? ((D.retRe / (D.retNew + D.retRe)) * 100).toFixed(0) : 0}%)`}</p>
        </div>
      </div>
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/notepad_file_gear-2.png" alt=""> ${co(lang, 'statsHeatTitle')}</div>
        <div class="box-body">${html([svgHeat(st.heatMap, ko)] as any)}</div>
      </div>
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/write_wordpad-0.png" alt=""> ${co(lang, 'statsReportTitle')}</div>
        <div class="box-body">
          <table class="stat"><tr><th>${t.title}</th><th class="num">${t.views}</th><th class="num">${ko ? '방문자' : 'VISITORS'}</th><th class="num">${ko ? '댓글' : 'COMMENTS'}</th></tr>
          ${D.postRows.map((r: any) => html`<tr><td><a href="${postPath(lang, r.slug)}">${r.title}</a></td><td class="num">${r.views}</td><td class="num">${r.sess}</td><td class="num">${r.comments}</td></tr>`)}</table>
        </div>
      </div>
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/users-2.png" alt=""> ${co(lang, 'statsGeoTitle')}</div>
        <div class="box-body">${html([svgBars(st.geo.map((r: any) => [flagOf(r.country), Number(r.c)]))] as any)}${html([svgBars(st.cities.slice(0, 5).map((r: any) => [r.city === '(알수없음)' && !ko ? '(unknown)' : r.city, Number(r.c)]))] as any)}</div>
      </div>
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/computer-4.png" alt=""> ${co(lang, 'statsDevTitle')}</div>
        <div class="box-body">${html([svgBars(st.devs.map((r: any) => [r.device, Number(r.c)]))] as any)}${html([svgBars(st.oss.slice(0, 5).map((r: any) => [r.os, Number(r.c)]))] as any)}${html([svgBars(st.brs.slice(0, 5).map((r: any) => [r.browser, Number(r.c)]))] as any)}</div>
      </div>
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/file_eye.png" alt=""> ${co(lang, 'statsLogTitle')}</div>
        <div class="box-body">
          <table class="stat"><tr><th>${t.date}</th><th>PATH</th><th>${ko ? '유입' : 'REF'}</th><th>${ko ? '위치·기기' : 'LOC·DEVICE'}</th></tr>
          ${st.recent.map((r: any) => html`<tr><td>${r.t}</td><td>${r.url_path}</td><td>${r.ref || (ko ? '직접' : 'direct')}</td><td>${flagOf(r.country)} ${r.device}</td></tr>`)}</table>
        </div>
      </div>`);
    const cohort = cohortMatrix();
    const assocRaw = await assocRules(0.3, 5, lang).catch(() => []);
    const titleOf = (slug: string) => { const p = getPost(slug); return p ? p.title[lang] : slug; };
    const assoc = assocRaw.map((r: any) => ({ ...r, a: titleOf(r.a), b: titleOf(r.b) }));
    const depth = await sessionDepth().catch(() => null);
    if (depth && cohort && cohort.rows.length > 1) boxes.push(html`
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/users-2.png" alt=""> ${co(lang, 'statsCohortTitle')}</div>
        <div class="box-body">
          <table class="stat"><tr><th>${ko ? '첫 방문' : 'First visit'}</th><th class="num">${ko ? '기기' : 'Dev'}</th>${Array.from({ length: cohort.maxOff }, (_, i) => html`<th class="num">+${i}w</th>`)}</tr>
          ${cohort.rows.map((r: any) => html`<tr><td>${r.label}</td><td class="num">${r.size}</td>${r.cells.map((c: any) => html`<td class="num ${c.off === 0 ? 'dim' : ''}">${c.off === 0 ? c.n : c.pct + '%'}</td>`)}</tr>`)}
          </table>
          <p class="hint">${ko ? '첫 방문 주차별 재방문 기기 비율 — 데이터가 쌓이면 진짜 리텐션 곡선이 됩니다.' : 'Return rate per first-visit week cohort.'}</p>
        </div>
      </div>`);
    if (assoc.length) boxes.push(html`
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/file_program_group-0.png" alt=""> ${co(lang, 'statsAssocTitle')}</div>
        <div class="box-body">
          <table class="stat">${assoc.map((r: any) => html`<tr><td>${r.a}</td><td>→</td><td>${r.b}</td><td class="num">${ko ? r.n + '회' : 'x' + r.n} · ${Math.round(r.conf * 100)}%</td></tr>`)}</table>
          <p class="hint">${ko ? '같은 세션에서 함께 열람된 글 쌍 (신뢰도 30% 이상).' : 'Posts co-read in the same session (confidence ≥ 30%).'}</p>
        </div>
      </div>`);
    if (depth) boxes.push(html`
      <div class="box">
        <div class="box-title"><img class="ico" src="/public/icons/notepad-2.png" alt=""> ${co(lang, 'statsDepthTitle')}</div>
        <div class="box-body">
          <table class="stat"><tr><th>${ko ? '열람 깊이' : 'Depth'}</th><th class="num">${ko ? '세션' : 'Sessions'}</th><th class="num">%</th></tr>
          <tr><td>${ko ? '1페이지 (바운스)' : '1 page (bounce)'}</td><td class="num">${depth.one}</td><td class="num">${depth.bouncePct}%</td></tr>
          <tr><td>${ko ? '2~3페이지' : '2-3 pages'}</td><td class="num">${depth.few}</td><td class="num">${depth.n ? Math.round((depth.few / depth.n) * 100) : 0}%</td></tr>
          <tr><td>${ko ? '4페이지 이상' : '4+ pages'}</td><td class="num">${depth.many}</td><td class="num">${depth.n ? Math.round((depth.many / depth.n) * 100) : 0}%</td></tr>
          </table>
          <p class="hint">${ko ? `유효 세션 ${depth.n}개 · 평균 열람 ${depth.avgDepth}페이지 (테스트 세션 제외).` : `${depth.n} sessions · avg ${depth.avgDepth} pages (test sessions excluded).`}</p>
        </div>
      </div>`);
  }
  const inner = html`${boxes}${st ? '' : html`<div class="box"><div class="box-body"><p class="hint">${ko ? '통계 DB에 일시적으로 연결할 수 없어요.' : 'Stats DB temporarily unavailable.'}</p></div></div>`}`;
  const canonical = SITE_URL + (ko ? '/stats' : '/en/stats');
  const title = ko ? `통계 — ${SITE_NAME}` : `Stats — ${SITE_NAME}`;
  const body = html`<!DOCTYPE html>
<html lang="${lang}">
<head>
${html([head(lang, { title, desc: ko ? 'PINION 방문 통계 — 실시간 카운터와 30일 리포트.' : 'PINION visitor stats — live counter and 30-day report.', canonical, type: 'website', alternates: { ko: '/stats', en: '/en/stats' } })] as any)}
</head>
<body class="home-classic${isMobile(c) ? ' m' : ''}">
${classicShell(lang, inner, '')}
${umami}${deviceId}
</body>
</html>`;
  return c.html(body as any);
}
app.get('/stats', (c) => renderStats(c, 'ko'));
app.get('/en/stats', (c) => renderStats(c, 'en'));

app.get('/guestbook', (c) => renderGuestbook(c, 'ko'));
app.get('/en/guestbook', (c) => renderGuestbook(c, 'en'));
app.get('/post/:slug', async (c) => renderPost(c, 'ko', c.req.param('slug')));
app.get('/en/post/:slug', async (c) => renderPost(c, 'en', c.req.param('slug')));

// 댓글 등록
app.post('/api/comments', async (c) => {
  if (!sameOrigin(c)) return c.text('forbidden', 403);
  if ((Number(c.req.header('content-length')) || 0) > 1024 * 1024) return c.text('too large', 413);
  const form = await c.req.parseBody();
  const slug = String(form.slug || '');
  const backRaw = String(form.back || '');
  const backPath = backRaw.startsWith('/') && !backRaw.startsWith('//') ? backRaw : postPath('ko', slug);
  const body = String(form.body || '').trim().slice(0, 2000);
  const author = String(form.author || '').trim().slice(0, 60);
  const hp = String(form.website || '');
  const ip = visitorIp(c.req.raw.headers);
  if (!getPost(slug)) return c.redirect('/404', 303);
  if (hp) return c.redirect(`${backPath}#comments`, 303);   // 허니팟: 조용히 무시

  let imagePath: string | null = null;
  {
    const giphyId = String(form.giphy_id || '').trim();
    if (giphyId && /^[a-zA-Z0-9]{1,64}$/.test(giphyId)) {
      imagePath = `https://media.giphy.com/media/${giphyId}/giphy.gif`;
      const g = extractGiphy(body);
      if (g) body = g.clean;
    } else {
      const g = extractGiphy(body);
      if (g) { imagePath = g.url; body = g.clean; }
    }
  }
  if ((!body && !imagePath) || rateLimited(ip)) return c.redirect(`${backPath}#comments`, 303);
  addComment.run(slug, author || maskIp(ip), ip, body, imagePath);
  return c.redirect(`${backPath}#comments`, 303);
});

const giphyRe = /https?:\/\/(?:www\.)?giphy\.com\/gifs\/(?:[a-z0-9\-]+-)?([a-zA-Z0-9]+)(?:\?\S*)?|https?:\/\/media\.giphy\.com\/media\/([a-zA-Z0-9]+)\/giphy\.(?:gif|webp)(?:\?\S*)?/i;
function extractGiphy(text: string): { clean: string; url: string } | null {
  const m = giphyRe.exec(text);
  if (!m) return null;
  const id = m[1] || m[2];
  return { clean: text.replace(m[0], '').replace(/\s{2,}/g, ' ').trim(), url: `https://media.giphy.com/media/${id}/giphy.gif` };
}

// ---------- SEO 엔드포인트 ----------
app.get('/sitemap.xml', (c) => {
  securityHeaders(c);
  const alt = (ko: string, en: string) =>
    `<xhtml:link rel="alternate" hreflang="ko" href="${SITE_URL}${ko}" /><xhtml:link rel="alternate" hreflang="en" href="${SITE_URL}${en}" /><xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}${ko}" />`;
  const entries = posts.map(p => {
    const lm = lastmod(p);
    const k = postPath('ko', p.slug), e = postPath('en', p.slug);
    return `  <url><loc>${SITE_URL}${k}</loc><lastmod>${lm}</lastmod>${alt(k, e)}</url>\n  <url><loc>${SITE_URL}${e}</loc><lastmod>${lm}</lastmod>${alt(k, e)}</url>`;
  }).join('\n');
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n  <url><loc>${SITE_URL}/</loc>${alt('/', '/en')}</url>\n  <url><loc>${SITE_URL}/en</loc>${alt('/', '/en')}</url>\n${entries}\n</urlset>`, 200, { 'Content-Type': 'application/xml; charset=utf-8' });
});
app.get('/robots.txt', (c) => {
  securityHeaders(c);
  const bots = ['Yeti', 'OAI-SearchBot', 'PerplexityBot', 'ClaudeBot', 'Claude-User', 'Perplexity-User', 'Applebot'];
  return c.text(`User-agent: *\nAllow: /\nDisallow: /api/\n\n` + bots.map(b => `User-agent: ${b}\nAllow: /`).join('\n\n') + `\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});
app.post('/api/seen', async (c) => {
  if (!sameOrigin(c) || /HeadlessChrome/i.test(c.req.header('user-agent') || '')) return c.body('', 204);
  try {
    const b = await c.req.json();
    const did = String(b.did || '').slice(0, 64);
    const path = String(b.path || '/').slice(0, 300);
    if (/^[0-9a-f-]{8,64}$/i.test(did)) addSeen.run(did, path);
  } catch {}
  return c.body('', 204);
});

// 실시간 접속자 (90초 윈도)
app.post('/api/presence', async (c) => {
  let b: any = {};
  try { b = await c.req.json(); } catch {}
  const did = String(b.did || '').slice(0, 64);
  const path = String(b.path || '/').slice(0, 300);
  if (!sameOrigin(c)) return c.json({ site: 0, here: 0 });
  const isBot = /HeadlessChrome/i.test(c.req.header('user-agent') || '');
  if (/^[0-9a-f-]{8,64}$/i.test(did) && !isBot) {
    const now = Date.now();
    upPresence.run(did, path, now);
    prunePresence.run(now - 300_000);
  }
  const cut = Date.now() - 90_000;
  return c.json({ site: cntPresence.get(cut).n, here: cntPresencePath.get(cut, path).n });
});

// 익명 라이브 채팅
const chatTs = (r: any) => ({ id: r.id, name: r.name, body: r.body, image: r.image, ts: Date.parse(r.created_at.replace(' ', 'T') + 'Z') });
app.get('/api/chat', (c) => {
  const after = Number(c.req.query('after') || 0);
  const msgs = after > 0 ? chatAfter.all(after) : chatInit.all().reverse();
  return c.json({ msgs: msgs.map(chatTs) });
});
app.post('/api/chat', async (c) => {
  if (!sameOrigin(c)) return c.json({ ok: false, err: 'origin' }, 403);
  const ip = c.req.header('x-forwarded-for') || '0.0.0.0';
  if (chatRateLimited(ip)) return c.json({ ok: false, err: 'rate' }, 429);
  let b: any = {};
  try { b = await c.req.json(); } catch {}
  let body = stripTags(String(b.body || '')).slice(0, 300).trim();
  const name = stripTags(String(b.name || '')).slice(0, 30).trim() || (langOf(c) === 'en' ? 'anon' : '익명');
  let imagePath: string | null = null;
  const giphyId = String(b.giphy_id || '').trim();
  if (giphyId && /^[a-zA-Z0-9]{1,64}$/.test(giphyId)) {
    imagePath = `https://media.giphy.com/media/${giphyId}/giphy.gif`;
    const g = extractGiphy(body);
    if (g) body = g.clean;
  } else {
    const g = extractGiphy(body);
    if (g) { imagePath = g.url; body = g.clean; }
  }
  if (!body && !imagePath) return c.json({ ok: false }, 400);
  const payload = body || (imagePath ? '🖼️' : '');
  const dup: any = chatDup.get(name, payload, imagePath || '', ip);
  if (dup && Number(dup.n) > 0) return c.json({ ok: true, id: Number(dup.id), dup: true });
  const r = chatAdd.run('__chat', name, ip, payload, imagePath);
  return c.json({ ok: true, id: Number(r.lastInsertRowid) });
});

app.post('/api/guestbook', async (c) => {
  if (!sameOrigin(c)) return c.redirect('/guestbook', 302);
  const form = await c.req.parseBody();
  if (form.website) return c.redirect('/guestbook', 302);
  const ip = c.req.header('x-forwarded-for') || '0.0.0.0';
  if (rateLimited(ip)) return c.redirect('/guestbook?err=rate', 302);
  const body = stripTags(String(form.body || '')).slice(0, 500).trim();
  const name = stripTags(String(form.author || '')).slice(0, 60).trim() || (langOf(c) === 'en' ? 'Anonymous' : '익명');
  let imagePath: string | null = null;
  const giphyId = String(form.giphy_id || '').trim();
  if (giphyId && /^[a-zA-Z0-9]{1,64}$/.test(giphyId)) {
    imagePath = `https://media.giphy.com/media/${giphyId}/giphy.gif`;
    const g = extractGiphy(body);
    if (g) body = g.clean;
  } else {
    const g = extractGiphy(body);
    if (g) { imagePath = g.url; body = g.clean; }
  }
  if (!body && !imagePath) return c.redirect('/guestbook', 302);
  const r = addGuestbook.run('__guestbook', name, ip, body, imagePath);
  const rowId = Number(r.lastInsertRowid);
  backgroundSave(async () => {
    const en = await translateToEn(body);
    if (en) setGuestbookEn.run(en, rowId);
  });
  return c.redirect(langOf(c) === 'en' ? '/en/guestbook' : '/guestbook', 302);
});

function langOf(c: any): Lang {
  const p = String(c.req.path || c.req.path);
  return p.startsWith('/en') ? 'en' : 'ko';
}

app.get('/rss.xml', (c) => {
  securityHeaders(c);
  const items = posts.map(p => `
  <item>
    <title>${esc(p.title.ko)}</title>
    <link>${SITE_URL}${postPath('ko', p.slug)}</link>
    <guid isPermaLink="true">${SITE_URL}${postPath('ko', p.slug)}</guid>
    <pubDate>${new Date(p.date).toUTCString()}</pubDate>
    <description><![CDATA[${md2html(p.body.ko)}]]></description>
  </item>`).join('');
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>\n<atom:link rel=\"self\" type=\"application/rss+xml\" href=\"${SITE_URL}/rss.xml\" />\n<title>${esc(SITE_NAME)}</title>\n<link>${SITE_URL}</link>\n<description>${esc(SITE_DESC)}</description>\n<language>ko</language>\n<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${items}\n</channel></rss>`, 200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
});

// Giphy 검색 프록시 (키 미설정 시 503)
const giphyHandler = async (c) => {
  if (!GIPHY_KEY) return c.json({ error: 'giphy key not configured' }, 503);
  if (!sameOrigin(c)) return c.json({ error: 'forbidden' }, 403);
  if (giphyRateLimited(visitorIp(c.req.raw.headers))) return c.json({ error: 'rate' }, 429);
  const q = (c.req.query('q') || '').trim().slice(0, 50);
  if (!q) return c.json({ data: [] });
  const limit = 12;
  const u = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=${limit}&rating=pg-13&lang=ko`;
  const r = await fetch(u);
  if (!r.ok) return c.json({ error: 'upstream', status: r.status }, 502);
  const j: any = await r.json();
  const gifs = (j.data || []).map((g: any) => ({
    id: g.id,
    preview: g.images?.fixed_height_small?.url || g.images?.preview_gif?.url,
    url: g.images?.original?.url || `https://media.giphy.com/media/${g.id}/giphy.gif`,
  }));
  return c.json({ data: gifs });
};
app.get('/api/giphy', giphyHandler);

// AdSense ads.txt (client 설정 시만 내용 노출)
app.get('/ads.txt', (c) => {
  securityHeaders(c);
  return c.text(ADSENSE_CLIENT ? `google.com, ${ADSENSE_CLIENT}, DIRECT, f08c47fec0942fa0\n` : '');
});

// IndexNow 키 검증 파일
app.get(`/${INDEXNOW_KEY}.txt`, (c) => c.text(INDEXNOW_KEY));

// 404
app.notFound((c) => {
  securityHeaders(c);
  const body = layout('ko', head('ko', { title: `404 — ${SITE_NAME}`, desc: '페이지를 찾을 수 없어요.', path: '/404' }),
    html`<h1>404</h1><p>그런 페이지 없어요. <a href="/">홈으로</a></p>`);
  return c.html(body as any, 404);
});

serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' });
console.log(`blog listening on http://127.0.0.1:${PORT}`);

// ---------- 어드민 (테일넷 전용 3004) ----------
const ADMIN_PORT = 3004;
const ADMIN_HOST = process.env.ADMIN_HOST || '127.0.0.1';
const LAN_SHARE = process.env.UMAMI_SHARE || '';
const AUTHOR_NAME = process.env.AUTHOR_NAME || SITE_NAME;
const admin = new Hono();

app.use(async (c, next) => {
  const url = new URL(c.req.url);
  if (c.req.method === 'GET' && url.pathname.length > 1 && url.pathname.endsWith('/')) {
    return c.redirect(`${SITE_URL}${url.pathname.replace(/\/+$/, '')}${url.search}`, 301);
  }
  await next();
});
app.use('/public/*', serveStatic({ root: './public', rewriteRequestPath: (p) => p.replace(/^\/public/, '') }));
app.use('/media/*', serveStatic({ root: './public/media', rewriteRequestPath: (p) => p.replace(/^\/media/, '') }));

admin.use('/public/*', serveStatic({ root: './public', rewriteRequestPath: (p) => p.replace(/^\/public/, '') }));

admin.use('*', async (c, next) => {
  securityHeaders(c);
  await next();
});

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

// ---------- 통계 대시보드 ----------
const flagOf = (cc: string) => (cc && /^[a-zA-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 127397 + ch.charCodeAt(0))) + ' ' + cc.toUpperCase() : cc || '—');
const chClassOf = (dom: string | null): 'search' | 'social' | 'direct' | 'referral' => {
  const d = String(dom || '');
  if (/google|naver|bing|yahoo|duckduckgo|ecosia|baidu|daum|zum/.test(d)) return 'search';
  if (/t\.co|twitter|x\.com|facebook|linkedin|instagram|discord|reddit|youtube|threads|tiktok|kakao|naver\.com\/(cafe|blog)|giphy/.test(d)) return 'social';
  if (!d || d === 'null') return 'direct';
  return 'referral';
};
function svgSeries(rows: { d: string; views: number; visitors: number }[]): string {
  const W = 720, H = 190, pad = 26;
  if (!rows.length) return '<p class="hint">데이터 없음</p>';
  const maxV = Math.max(...rows.map((r) => Math.max(r.views, r.visitors)), 1);
  const bw = (W - pad * 2) / rows.length;
  const line = (key: 'views' | 'visitors') => {
    const pts = rows.map((r, i) => `${(pad + i * bw + bw / 2).toFixed(1)},${(H - pad - (r[key] / maxV) * (H - pad * 2)).toFixed(1)}`);
    return `<polyline points="${pts.join(' ')}" class="sb-line ${key}" fill="none" />${rows.map((r, i) => `<circle cx="${pts[i].split(',')[0]}" cy="${pts[i].split(',')[1]}" r="2.5" class="sb-dot ${key}" />`).join('')}`;
  };
  const labs = rows.filter((_, i) => i % 6 === 0).map((r) => `<text x="${(pad + rows.indexOf(r) * bw).toFixed(1)}" y="${H - 7}" class="sb-lab">${r.d.slice(5)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">${line('views')}${line('visitors')}${labs}<text x="${pad}" y="14" class="sb-lab">● views · ● visitors (max ${maxV})</text></svg>`;
}
function svgDonut(parts: { name: string; c: number; color: string }[]): string {
  const total = parts.reduce((a, b) => a + b.c, 0) || 1;
  let off = 25;
  const segs = parts.filter((p) => p.c > 0).map((p) => {
    const frac = (p.c / total) * 100;
    const seg = `<circle r="15.915" cx="34" cy="34" fill="none" stroke="${p.color}" stroke-width="11" stroke-dasharray="${frac.toFixed(2)} ${(100 - frac).toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" />`;
    off -= frac;
    return seg;
  }).join('');
  return `<svg viewBox="0 0 68 68" class="chart dn">${segs}<text x="34" y="32" text-anchor="middle" class="dn-lab">${total}</text><text x="34" y="42" text-anchor="middle" class="dn-val">views</text></svg>`;
}
// ── 데이터 사이언스 헬퍼: 예측·코호트·연관규칙·세션 심도 ──
function holtForecast(views: number[], horizon = 7) {
  if (views.length < 4) return null;
  const alpha = 0.5, beta = 0.3;
  let level = views[0], trend = views[1] - views[0];
  const errs: number[] = [];
  for (let i = 1; i < views.length; i++) {
    const f = level + trend;
    errs.push(views[i] - f);
    const prev = level;
    level = alpha * views[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prev) + (1 - beta) * trend;
  }
  const sd = Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / Math.max(errs.length - 1, 1)) || 1;
  const fc: { v: number; lo: number; hi: number }[] = [];
  for (let h = 1; h <= horizon; h++) {
    const v = Math.max(0, level + trend * h);
    fc.push({ v: Math.round(v), lo: Math.max(0, Math.round(v - 1.96 * sd * Math.sqrt(h))), hi: Math.round(v + 1.96 * sd * Math.sqrt(h)) });
  }
  return { fc };
}

function cohortMatrix() {
  const rows = db.prepare('SELECT did, created_at FROM device_seen').all() as any[];
  const tss = rows.map((r) => new Date(r.created_at.replace(' ', 'T') + 'Z').getTime()).filter((t) => !isNaN(t));
  if (!tss.length) return null;
  const base = Math.min(...tss);
  const WEEK = 7 * 86400000;
  const first: Record<string, number> = {};
  const weeks: Record<string, Set<number>> = {};
  for (const r of rows) {
    const t = new Date(r.created_at.replace(' ', 'T') + 'Z').getTime();
    if (isNaN(t)) continue;
    const w = Math.floor((t - base) / WEEK);
    if (!first[r.did] || w < first[r.did]) first[r.did] = w;
    (weeks[r.did] = weeks[r.did] || new Set()).add(w);
  }
  const cohorts: Record<number, { size: number; ret: Map<number, number> }> = {};
  for (const did of Object.keys(first)) {
    const c = first[did];
    cohorts[c] = cohorts[c] || { size: 0, ret: new Map() };
    cohorts[c].size++;
    for (const w of weeks[did]) {
      const off = w - c;
      if (off >= 0) cohorts[c].ret.set(off, (cohorts[c].ret.get(off) || 0) + 1);
    }
  }
  const maxC = Math.max(...Object.keys(cohorts).map(Number));
  const out: { label: string; size: number; cells: { off: number; n: number; pct: number }[] }[] = [];
  for (let c = 0; c <= maxC; c++) {
    if (!cohorts[c]) continue;
    const startDate = new Date(base + c * WEEK);
    const label = `${String(startDate.getMonth() + 1).padStart(2, '0')}/${String(startDate.getDate()).padStart(2, '0')}주`;
    const cells: { off: number; n: number; pct: number }[] = [];
    for (let off = 0; off <= maxC - c; off++) {
      const n = cohorts[c].ret.get(off) || 0;
      cells.push({ off, n, pct: Math.round((n / cohorts[c].size) * 100) });
    }
    out.push({ label, size: cohorts[c].size, cells });
  }
  return { rows: out, maxOff: Math.max(...out.map((r) => r.cells.length)) };
}

async function assocRules(minConf = 0.3, limit = 5, lang: Lang = 'ko') {
  const pool = getPool();
  const rows = (await pool.query(`SELECT session_id, regexp_replace(url_path, '#.*', '') AS url_path FROM website_event
    WHERE website_id=$1 AND url_path LIKE '/post/%'`, [UMAMI_ID])).rows as any[];
  const bySess: Record<string, Set<string>> = {};
  const evCount: Record<string, number> = {};
  for (const r of rows) {
    evCount[r.session_id] = (evCount[r.session_id] || 0) + r.c;
    (bySess[r.session_id] = bySess[r.session_id] || new Set()).add(r.url_path.split('?')[0]);
  }
  const slugTitle = (p: string) => { const g = getPost(p.replace('/post/', '').replace(/^en\//, '').split('#')[0]); return g ? (g.title[lang] || g.title.ko).slice(0, lang === 'en' ? 40 : 18) : p; };
  const pairCount: Record<string, number> = {};
  const singleCount: Record<string, number> = {};
  let multiSess = 0;
  for (const sid of Object.keys(bySess)) {
    if (evCount[sid] >= 30) continue;
    const ps = [...bySess[sid]];
    if (ps.length < 2) continue;
    multiSess++;
    ps.sort();
    for (const p of ps) singleCount[p] = (singleCount[p] || 0) + 1;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const key = ps[i] + '|' + ps[j];
      pairCount[key] = (pairCount[key] || 0) + 1;
    }
  }
  return Object.entries(pairCount)
    .map(([key, n]) => {
      const [a, b] = key.split('|');
      const conf = n / Math.min(singleCount[a] || 1, singleCount[b] || 1);
      return { a: slugTitle(a), b: slugTitle(b), n, conf };
    })
    .filter((r) => r.conf >= minConf)
    .sort((x, y) => y.n - x.n)
    .slice(0, limit);
}

async function sessionDepth() {
  const pool = getPool();
  const rows = (await pool.query(`SELECT session_id, COUNT(DISTINCT regexp_replace(url_path, '#.*', '')) dp, COUNT(*) ev
    FROM website_event WHERE website_id=$1 GROUP BY session_id`, [UMAMI_ID])).rows as any[];
  const valid = rows.filter((r) => r.ev < 30);
  const b = { one: 0, few: 0, many: 0 };
  for (const r of valid) {
    if (r.dp <= 1) b.one++;
    else if (r.dp <= 3) b.few++;
    else b.many++;
  }
  const n = valid.length || 1;
  return { one: b.one, few: b.few, many: b.many, n,
    bouncePct: Math.round((b.one / n) * 100),
    avgDepth: (valid.reduce((a, r) => a + Number(r.dp), 0) / n).toFixed(1) };
}

function svgHeat(grid: Map<string, number>, ko = true): string {
  const max = Math.max(...[...grid.values()], 1);
  let cells = '';
  for (let dow = 1; dow <= 7; dow++) for (let h = 0; h < 24; h++) {
    const c = grid.get(`${dow}:${h}`) || 0;
    const a = c === 0 ? 0.07 : (0.14 + 0.86 * Math.sqrt(c / max)).toFixed(2);
    const dayEn = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][dow - 1];
    const tip = ko ? dow + '요일 ' + h + '시' : dayEn + ' ' + String(h).padStart(2, '0') + ':00';
    cells += `<rect x="${h * 26 + 30}" y="${(dow - 1) * 20 + 2}" width="24" height="17" rx="2" class="hm-cell" opacity="${a}"><title>${tip}: ${c}</title></rect>`;
  }
  const hours = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => `<text x="${h * 26 + 42}" y="146" class="hm-lab" text-anchor="middle">${String(h).padStart(2, '0')}</text>`).join('');
  const days = (ko ? ['월', '화', '수', '목', '금', '토', '일'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']).map((d, i) => `<text x="24" y="${i * 20 + 15}" class="hm-lab" text-anchor="end">${d}</text>`).join('');
  return `<svg viewBox="0 0 658 150" class="chart">${cells}${hours}${days}</svg>`;
}
function svgBars(rows: [string, number][], unit = ''): string {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  const rh = 22, W = 380;
  const H = rows.length * rh + 4;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">${rows.map((r, i) => {
    const w = Math.max((r[1] / max) * (W - 140), 1.5);
    return `<text x="88" y="${i * rh + 14}" class="hb-lab" text-anchor="end">${esc(String(r[0])).slice(0, 14)}</text><rect x="94" y="${i * rh + 3}" width="${w.toFixed(1)}" height="15" class="hb-bar" /><text x="${(94 + w + 4).toFixed(1)}" y="${i * rh + 14}" class="hb-val">${r[1]}${unit}</text>`;
  }).join('')}</svg>`;
}
let statsCache: { at: number; data: any } = { at: 0, data: null };
async function gatherStats() {
  if (statsCache.data && Date.now() - statsCache.at < 30_000) return statsCache.data;
  const wid = UMAMI_ID;
  const P = (label: string, sql: string) => getPool().query(sql, [wid]).catch((e: any) => { throw new Error(`[${label}] ${e.message}`); });
  const [kpi, series, chans, heat, perpost, ret, geo, cities, devs, oss, brs, recent] = await Promise.all([
    P('kpi', `SELECT
        count(DISTINCT session_id) FILTER (WHERE created_at >= now() - interval '5 minutes')::int AS rt_sess,
        count(*) FILTER (WHERE event_type=1 AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')::int AS v_today,
        count(DISTINCT session_id) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')::int AS s_today,
        count(*) FILTER (WHERE event_type=1 AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul' - interval '1 day' AND created_at < date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')::int AS v_yday,
        count(DISTINCT session_id) FILTER (WHERE created_at >= now() - interval '7 days')::int AS s_week,
        count(*) FILTER (WHERE event_type=1 AND created_at >= now() - interval '7 days')::int AS v_week,
        count(DISTINCT session_id) FILTER (WHERE created_at >= now() - interval '30 days')::int AS s_month,
        count(*) FILTER (WHERE event_type=1 AND created_at >= now() - interval '30 days')::int AS v_month,
        count(*) FILTER (WHERE event_type=2)::int AS ev_total
       FROM website_event WHERE website_id=$1`),
    P('series', `SELECT to_char(created_at AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS d,
        count(*) FILTER (WHERE event_type=1)::int AS views,
        count(DISTINCT session_id)::int AS visitors
       FROM website_event WHERE website_id=$1 AND created_at >= now() - interval '30 days'
       GROUP BY 1 ORDER BY 1`),
    P('chans', `SELECT CASE
        WHEN referrer_domain IS NULL OR referrer_domain='' THEN 'direct'
        WHEN referrer_domain ~* '(google|naver|bing|yahoo|duckduckgo|ecosia|baidu|daum|zum)' THEN 'search'
        WHEN referrer_domain ~* '(t\\.co|twitter|x\\.com|facebook|linkedin|instagram|discord|reddit|youtube|threads|tiktok|kakao|giphy)' THEN 'social'
        ELSE 'referral' END AS ch, count(*)::int AS c
       FROM website_event WHERE website_id=$1 AND event_type=1 AND created_at >= now() - interval '30 days' GROUP BY 1`),
    P('heat', `SELECT EXTRACT(ISODOW FROM created_at AT TIME ZONE 'Asia/Seoul')::int AS dow,
        EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Seoul')::int AS h, count(*)::int AS c
       FROM website_event WHERE website_id=$1 AND event_type=1 AND created_at >= now() - interval '30 days' GROUP BY 1,2`),
    P('perpost', `SELECT replace(url_path,'/en/post/','/post/') AS p,
        count(*) FILTER (WHERE event_type=1)::int AS views,
        count(DISTINCT session_id)::int AS sess
       FROM website_event WHERE website_id=$1 AND url_path LIKE '%/post/%' AND created_at >= now() - interval '30 days'
       GROUP BY 1 ORDER BY views DESC LIMIT 12`),
    P('ret', `SELECT (v > 1) AS ret, count(*)::int AS c FROM (
        SELECT session_id, count(DISTINCT visit_id) AS v FROM website_event
        WHERE website_id=$1 AND created_at >= now() - interval '30 days' GROUP BY session_id) t GROUP BY 1`),
    P('geo', `SELECT country, count(DISTINCT session_id)::int AS c FROM session
       WHERE website_id=$1 AND created_at >= now() - interval '30 days' GROUP BY 1 ORDER BY c DESC LIMIT 8`),
    P('cities', `SELECT COALESCE(NULLIF(city,''),'(알수없음)') AS city, count(DISTINCT session_id)::int AS c FROM session
       WHERE website_id=$1 AND created_at >= now() - interval '30 days' GROUP BY 1 ORDER BY c DESC LIMIT 6`),
    P('devs', `SELECT COALESCE(NULLIF(device,''),'?') AS device, count(DISTINCT session_id)::int AS c FROM session
       WHERE website_id=$1 AND created_at >= now() - interval '30 days' GROUP BY 1 ORDER BY c DESC LIMIT 5`),
    P('oss', `SELECT COALESCE(NULLIF(os,''),'?') AS os, count(DISTINCT session_id)::int AS c FROM session
       WHERE website_id=$1 AND created_at >= now() - interval '30 days' GROUP BY 1 ORDER BY c DESC LIMIT 5`),
    P('brs', `SELECT COALESCE(NULLIF(browser,''),'?') AS browser, count(DISTINCT session_id)::int AS c FROM session
       WHERE website_id=$1 AND created_at >= now() - interval '30 days' GROUP BY 1 ORDER BY c DESC LIMIT 5`),
    P('recent', `SELECT to_char(e.created_at AT TIME ZONE 'Asia/Seoul','MM-DD HH24:MI') AS t, e.url_path,
        COALESCE(e.referrer_domain,'') AS ref, COALESCE(s.country,'') AS country, COALESCE(s.device,'?') AS device
       FROM website_event e JOIN session s USING (session_id)
       WHERE e.website_id=$1 AND e.event_type=1 ORDER BY e.created_at DESC LIMIT 15`),
  ]);
  const seriesMap = new Map<string, any>(series.rows.map((r: any) => [r.d, r]));
  const days: any[] = [];
  const start = new Date(Date.now() - 29 * 86400_000);
  for (let i = 0; i < 30; i++) {
    const dt = new Date(start.getTime() + i * 86400_000);
    const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const r = seriesMap.get(k);
    days.push({ d: k, views: r ? Number(r.views) : 0, visitors: r ? Number(r.visitors) : 0 });
  }
  const heatMap = new Map<string, number>(heat.rows.map((r: any) => [`${r.dow}:${r.h}`, Number(r.c)]));
  const dv = countDevices.get();
  const cm = new Map<string, number>();
  try { for (const r of listAllComments.all() as any[]) cm.set(r.slug, (cm.get(r.slug) || 0) + 1); } catch {}
  statsCache = { at: Date.now(), data: { kpi: kpi.rows[0], days, chans: chans.rows, heatMap, perpost: perpost.rows, ret: ret.rows, geo: geo.rows, cities: cities.rows, devs: devs.rows, oss: oss.rows, brs: brs.rows, recent: recent.rows, dv, cm } };
  return statsCache.data;
}
function deriveStats(st: any, lang: Lang) {
  const k = st.kpi;
  const chTotal = st.chans.reduce((a: number, b: any) => a + Number(b.c), 0) || 1;
  const chColors: Record<string, string> = { search: '#4d9fff', social: '#c678dd', direct: '#8fa88f', referral: '#ffd24d' };
  const chParts = ['search', 'social', 'referral', 'direct'].map((n) => {
    const row = st.chans.find((r: any) => r.ch === n);
    return { name: n, c: row ? Number(row.c) : 0, color: chColors[n] };
  });
  const retNew = st.ret.find((r: any) => r.ret === false)?.c || 0;
  const retRe = st.ret.find((r: any) => r.ret === true)?.c || 0;
  const slugViews = new Map<string, { views: number; sess: number }>();
  for (const r of st.perpost) {
    const m = String(r.p).match(/^\/post\/([a-z0-9-]+)/);
    if (!m) continue;
    const cur = slugViews.get(m[1]) || { views: 0, sess: 0 };
    cur.views += Number(r.views); cur.sess += Number(r.sess);
    slugViews.set(m[1], cur);
  }
  const postRows = [...slugViews.entries()].map(([slug, v]) => {
    const p = getPost(slug);
    const comments = st.cm.get(slug) || 0;
    return { slug, title: p ? p.title[lang] : slug, views: v.views, sess: v.sess, reread: v.sess ? (v.views / v.sess).toFixed(1) : '—', comments, engage: v.views ? ((comments / v.views) * 100).toFixed(1) : '0.0' };
  }).sort((a, b) => b.views - a.views);
  const legend = chParts.filter((p) => p.c > 0).map((p) => `<span><i class="sw-${p.name}"></i>${p.name} ${p.c} (${((p.c / chTotal) * 100).toFixed(0)}%)</span>`).join('');
  return { k, chTotal, chParts, retNew, retRe, postRows, legend };
}

admin.get('/admin/stats', async (c) => {
  let st: any;
  try { st = await gatherStats(); } catch (e: any) {
    return c.html(adminLayout(`대시보드 — ${SITE_NAME}`, html`<div class="card"><h1>통계 대시보드</h1><p class="hint">umami-db 조회 실패: ${String(e?.message || e)}</p></div>`));
  }
  const D = deriveStats(st, 'ko');
  const k = D.k;
  const chTotal = D.chTotal;
  const chParts = D.chParts;
  const retNew = D.retNew;
  const retRe = D.retRe;
  const postRows = D.postRows;
  const legend = D.legend;
  const body = html`<div class="card">
  <h1>통계 대시보드 <span class="hint">(60초 자동갱신 · 캐시 30초)</span></h1>
  <div class="kpi-grid">
    <div class="kpi rt"><div class="k-num">${k.rt_sess ?? 0}</div><div class="k-lab">실시간 접속 세션 (5분)</div></div>
    <div class="kpi"><div class="k-num">${k.v_today ?? 0}</div><div class="k-lab">오늘 조회수 (방문자 ${k.s_today ?? 0})</div></div>
    <div class="kpi"><div class="k-num">${k.v_yday ?? 0}</div><div class="k-lab">어제 조회수</div></div>
    <div class="kpi"><div class="k-num">${k.v_week ?? 0}</div><div class="k-lab">7일 조회수 (방문자 ${k.s_week ?? 0})</div></div>
    <div class="kpi"><div class="k-num">${k.v_month ?? 0}</div><div class="k-lab">30일 조회수 (방문자 ${k.s_month ?? 0})</div></div>
    <div class="kpi"><div class="k-num">${st.dv.all_time}</div><div class="k-lab">고유 기기 (오늘 ${st.dv.today} · 7일 ${st.dv.week})</div></div>
  </div>
  <h2>30일 추이</h2>
  ${html([svgSeries(st.days)] as any)}
  <div class="two-col">
    <div>
      <h2>유입 채널 (30일)</h2>
      ${html([svgDonut(chParts)] as any)}
      <div class="legend">${html([legend] as any)}</div>
      <p class="dash-note">신규 세션 ${retNew} · 재방문 세션 ${retRe} (재방문률 ${retNew + retRe ? ((retRe / (retNew + retRe)) * 100).toFixed(0) : 0}%)</p>
    </div>
    <div>
      <h2>요일×시간 히트맵 (30일, KST)</h2>
      ${html([svgHeat(st.heatMap, true)] as any)}
    </div>
  </div>
  <h2>글 성적표 (30일)</h2>
  <table class="stat"><tr><th>글</th><th class="num">조회</th><th class="num">방문자</th><th class="num">조회/방문</th><th class="num">댓글</th><th class="num">참여율</th></tr>
  ${postRows.map((r) => html`<tr><td>${r.title}</td><td class="num">${r.views}</td><td class="num">${r.sess}</td><td class="num">${r.reread}</td><td class="num">${r.comments}</td><td class="num">${r.engage}%</td></tr>`)}
  </table>
  <p class="dash-note">조회/방문 = 한 번 방문해서 몇 페이지나 읽었나 (재독 지표) · 참여율 = 댓글 수 ÷ 조회수</p>
  <div class="two-col">
    <div>
      <h2>국가 (방문자)</h2>
      ${html([svgBars(st.geo.map((r: any) => [flagOf(r.country), Number(r.c)]))] as any)}
      <h2>도시</h2>
      ${html([svgBars(st.cities.map((r: any) => [r.city, Number(r.c)]))] as any)}
    </div>
    <div>
      <h2>기기 / OS / 브라우저</h2>
      ${html([svgBars(st.devs.map((r: any) => [r.device, Number(r.c)]))] as any)}
      ${html([svgBars(st.oss.map((r: any) => [r.os, Number(r.c)]))] as any)}
      ${html([svgBars(st.brs.map((r: any) => [r.browser, Number(r.c)]))] as any)}
    </div>
  </div>
  <h2>실시간 스트림 (최근 15)</h2>
  <table class="stat"><tr><th>시각</th><th>경로</th><th>유입</th><th>위치</th><th>기기</th></tr>
  ${st.recent.map((r: any) => html`<tr><td>${r.t}</td><td>${r.url_path}</td><td>${r.ref || '직접'}</td><td>${flagOf(r.country)}</td><td>${r.device}</td></tr>`)}
  </table>
</div>`;
  return c.html(adminLayout(`대시보드 — ${SITE_NAME}`, body, html`<meta http-equiv="refresh" content="60" />
<link rel="stylesheet" href="/public/admin-stats.css" />`));
});

// ---------- 사이트 텍스트(카피) 편집 ----------
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

admin.get('/api/giphy', giphyHandler);
serve({ fetch: admin.fetch, port: ADMIN_PORT, hostname: ADMIN_HOST });
console.log(`admin listening on http://${ADMIN_HOST}:${ADMIN_PORT}/admin`);
