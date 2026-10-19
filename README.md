# Crumble Lab

쿠키런: 크럼블 스테이지 계산기(일반 스테이지·차원의 이면), 쿠키별 추천 슈가룬 목록, 전투 원리를 정리한 크럼블 가이드입니다.
alkapa.gg 실험소 화면의 계산식과 데이터를 그대로 옮겼고, 광고·사용자 입력값 수집 기능은 넣지 않았습니다.

## 실행

```bash
npm install
npm run dev
```

- `npm test`: 원본 화면에서 읽은 기대값으로 계산 결과를 검증합니다.
- `npm run build`: 타입 검사 후 `dist/`로 정적 빌드합니다.

## 주소

- `/stage`: 스테이지 계산 - 일반 스테이지 (도전 범위 표 / 챕터 30개 스테이지 그래프·표 보기 전환)
- `/stage/dimension`: 스테이지 계산 - 차원의 이면
- `/recommend`: 추천 슈가룬
- `/guide`: 크럼블 가이드

예전 주소 `/stage-check`, `/option-consult`, `?mode=dimension`으로 들어오면 새 주소로 자동으로 넘어갑니다. 상단 "스테이지 계산" 탭은 마지막으로 본 화면(일반/차원의 이면)으로 열립니다.

## 구조

- `public/data/stages.json`, `dimension.json`: 게임 1.5.002 스테이지 데이터(원본과 동일)
- `public/data/cookies.json`, `public/images/cookies/`: 원본 번들에 포함돼 있던 추천 슈가룬 데이터와 쿠키 이미지
- `src/lib/formulas.ts`: 피해 배율·명중·집중 계산식
- `src/lib/normalStage.ts`: 일반 스테이지 결과 계산
- `src/api/queries.ts`: TanStack Query 데이터 요청 정의
- `src/features/guide/guideContent.ts`: 크럼블 가이드 본문(한국어·영어·일본어). 게임 규칙과 공식만 참고하고 설명 문장은 새로 썼습니다.
- `src/messages.json`: 영어·일본어 번역 사전

## 배포

`main` 브랜치에 push하면 GitHub Actions([.github/workflows/deploy.yml](.github/workflows/deploy.yml))가 테스트와 빌드를 거쳐 GitHub Pages에 자동으로 배포합니다.

- 주소: https://flowerjunho.github.io/crumble-lab/
- 빌드할 때 `BASE_PATH=/crumble-lab/`을 넘겨서 JSON·이미지 주소에 하위 경로를 붙입니다(`src/lib/asset.ts`).
- 새로고침이나 직접 접속(`/crumble-lab/stage` 등)을 위해 `index.html`을 `404.html`로 복사해 둡니다.

배포와 같은 조건으로 로컬에서 확인하려면 다음과 같이 실행합니다.

```bash
BASE_PATH=/crumble-lab/ npm run build && BASE_PATH=/crumble-lab/ npx vite preview
```
