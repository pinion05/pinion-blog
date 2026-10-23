# PINION — 90s 블로그 엔진

Win98/CRT 감성의 셀프호스트 기술 블로그 **엔진**입니다. 이 저장소는 프로그램(시스템)만 담고 있고, 실제 글·설정·업로드 이미지는 런타임 데이터로 분리됩니다.

- **스택**: Hono SSR (TypeScript, node:sqlite) — 프레임워크·빌드 없이 단일 `server.ts`
- **기능**: KO/EN 이중화, 익명 댓글 + Giphy GIF, 방명록, 실시간 접속자·라이브 채팅, 태그 다중선택 필터, 정렬·검색, OpenRouter 자동 영어 번역, 공개 통계 페이지(서버사이드 SVG + 데이터 사이언스 컴포넌트), 어드민 CMS
- **디자인**: CRT 스캔라인 + DungGeunMo 비트맵 폰트 + Win98 픽셀 아이콘 (전부 셀프호스팅, 외부 리소스 0)
- **모바일**: UA 서버사이드 적응형

## 시작하기

```bash
npm install            # hono 의존성
mkdir -p content/posts
cp examples/post.sample.json content/posts/        # 샘플 글
cp examples/site-copy.sample.json content/site-copy.json  # (선택) 사이트 문구 오버라이드
node server.ts
# http://localhost:8090
```

글은 `content/posts/*.json` (JSON 파일 1개 = 글 1개)로 관리합니다. 스키마는 `examples/post.sample.json` 참고 — 제목/본문 KO·EN, 태그 배열, 마크다운 + HTML 임베드(div/details/table/iframe) 지원.

## 데이터 분리 구조

| 경로 | 성격 | git |
|---|---|---|
| `server.ts`, `public/`(아이콘·폰트·JS/CSS) | 엔진 | 추적 |
| `content/posts/*.json` | **실제 글 데이터** | 제외 |
| `content/site-copy.json` | 사이트 문구 오버라이드 | 제외 |
| `public/media/*` | 업로드 이미지 | 제외 |
| `comments.db` | 댓글·채팅·방문자 DB | 제외 |

## 환경변수

| 변수 | 설명 |
|---|---|
| `ADMIN_HOST` | 어드민 바인드 주소 (기본 127.0.0.1 — 테일넷/LAN 권장) |
| `UMAMI_SHARE` | 어드민 nav Umami 대시보드 링크 |
| `AUTHOR_NAME` | JSON-LD 저자명 (기본 사이트 이름) |
| `INDEXNOW_KEY` | IndexNow 키 (`.indexnow-key` 파일 대체 가능) |
| `OPENROUTER_API_KEY` | 댓글·방명록 자동 번역용 (`.hermes/.env` 로더 내장) |

시크릿·방문자 DB(`comments.db`)·GeoIP DB·실제 글 데이터는 저장소에 포함되지 않습니다.
