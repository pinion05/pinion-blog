// 사용: node ping-indexnow.ts <url...>  — 발행/수정 후 실행
import { readFileSync } from 'node:fs';
const KEY = process.env.INDEXNOW_KEY || (() => { try { return readFileSync(new URL('./.indexnow-key', import.meta.url), 'utf8').trim(); } catch { return ''; } })();
const urls = process.argv.slice(2);
if (!urls.length) { console.error('usage: node ping-indexnow.ts <url...>'); process.exit(1); }
for (const ep of ['https://searchadvisor.naver.com/indexnow', 'https://api.indexnow.org/indexnow']) {
  fetch(`${ep}?url=${encodeURIComponent(urls[0])}&key=${KEY}&urlList=${urls.map(encodeURIComponent).join(',')}`)
    .then(r => console.log(ep, r.status));
}
