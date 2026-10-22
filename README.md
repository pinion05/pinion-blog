# PINION — anti-slop.log

90년대풍 개인 기술 블로그. 죽은 인터넷 이론에 저항합니다.

- **스택**: Hono SSR (TypeScript, node:sqlite) — 프레임워크 빌드 없이 단일 `server.ts`
- **기능**: KO/EN 이중화, 익명 댓글 + Giphy GIF, 방명록, OpenRouter 자동 영어 번역(백그라운드), 공개 통계 페이지(서버사이드 SVG 차트), Umami 방문자 분석, IndexNow ping, 어드민(CMS형 텍스트 편집기 · 글 관리 · 대시보드)
- **디자인**: CRT 스캔라인 + DungGeunMo 비트맵 폰트 + Win98 픽셀 아이콘(전부 셀프호스팅, 외부 리소스 0)
- **모바일**: UA 서버사이드 적응형

## 실행

```bash
npm install   # hono 의존성
node server.ts
# http://localhost:8090
```

## 환경변수

| 변수 | 설명 |
|---|---|
| `ADMIN_HOST` | 어드민 바인드 주소 (기본 127.0.0.1 — 테일넷/LAN 권장) |
| `UMAMI_SHARE` | 어드민 nav Umami 대시보드 링크 |
| `AUTHOR_NAME` | JSON-LD 저자명 (기본 사이트 이름) |
| `INDEXNOW_KEY` | IndexNow 키 (`.indexnow-key` 파일 대체 가능) |
| `OPENROUTER_API_KEY` | 댓글·방명록 자동 번역용 (`.hermes/.env` 로더 내장) |

시크릿·방문자 DB(`comments.db`)·GeoIP DB는 저장소에 포함되지 않습니다.
