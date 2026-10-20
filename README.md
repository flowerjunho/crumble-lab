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
- `/info/cookies`: 크럼블 정보 - 쿠키 도감(`/info/cookies/<slug>`에서 쿠키 상세)
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

## 스테이지 데이터

- `public/data/stages.json`: 권장 전투력·회피·저항(계산기 수치). alkapa.gg 원본과 같다.
- `public/data/eog-stages.json`: 1-1 ~ 364-30 종합 데이터. [EOG.GG](https://eog.gg/games/cookierun-crumble/)가 게임 클라이언트에서 읽어 공개한 값을 정리했다. 권장 전투력, 필요 명중·집중(소수 첫째 자리), 적 명중, 보스·마리 수, 보스 체력·공격·방어, 보스 소환까지 처치 수, 제한 시간, 오프라인 보상 구간이 들어 있다. 열 설명은 파일의 `_meta.columns`에 있다.
- `public/data/stage-bosses.json`: 앱이 쓰는 스테이지별 보스·마리 수. 원본 stages.json의 보스 정보가 인게임과 다른 곳이 많아서(10,920개 중 885개) 보스만 이 파일로 바꿔 보여 준다.

두 EOG 파일은 아래 명령으로 다시 만든다. 받아 온 JS는 실행하지 않고 데이터만 읽는다.

```bash
node scripts/import-eog-stages.mjs
```

## 쿠키 도감 데이터

- `public/data/cookie-db.json`: 쿠키 77종의 능력치·전투 수치·시너지·스킬 피해 모델·스킬 효과. 수치는 EOG.GG가 게임 클라이언트에서 읽은 값이고, 이름(국내 공식 한·영·일)·이미지·추천 슈가룬은 `cookies.json`을 그대로 쓴다. EOG가 쓴 설명문·평가는 넣지 않는다.
- 시너지 국내 표기(범위·지속·다발·탄속·연타·관통·연쇄)와 쿠키별 주는·받는 시너지는 국내 시너지 도감(설탕노움의 비밀창고)과 테스트로 대조한다.
- 효과·능력치 용어는 국내 인게임 스킬 설명과 대조한 표기를 쓴다(띄우기 저항, 밀어내기 저항, 띄우기/밀치기 면역, 받는 회복량 감소, 명중률, 회피율, 보스피해, 길드 토벌전 등). `크기 증가`·`소환`은 인게임 표기를 찾지 못한 일반 표현이다.
- `src/data/cookie-skill-names-ko.json`: 쿠키별 국내 스킬 이름(스킬 설명 문구는 저장하지 않는다). `node scripts/import-skill-names-ko.mjs`로 다시 만든다.
- 다시 만들기: `node scripts/import-skill-names-ko.mjs && node scripts/import-eog-cookies.mjs`

## 보스 보정

그래도 인게임과 다른 보스가 있으면 [src/data/boss-overrides.json](src/data/boss-overrides.json)에 항목을 추가한다.

```json
{ "stage": "326-10", "boss": "레드베리 암살자", "memo": "인게임 확인" }
{ "stages": ["6-10", "14-10"], "boss": "레드베리 암살자", "count": 10 }
```

- `boss`는 보스 목록의 한국어 이름과 정확히 같아야 한다. 영어·일본어 이름은 자동으로 붙는다.
- 이름이나 스테이지를 잘못 적으면 `npm test`가 실패하고, 배포 워크플로도 테스트 단계에서 멈춘다.

## 배포

`main` 브랜치에 push하면 GitHub Actions([.github/workflows/deploy.yml](.github/workflows/deploy.yml))가 테스트와 빌드를 거쳐 GitHub Pages에 자동으로 배포합니다.

- 주소: https://flowerjunho.github.io/crumble-lab/
- 빌드할 때 `BASE_PATH=/crumble-lab/`을 넘겨서 JSON·이미지 주소에 하위 경로를 붙입니다(`src/lib/asset.ts`).
- 새로고침이나 직접 접속(`/crumble-lab/stage` 등)을 위해 `index.html`을 `404.html`로 복사해 둡니다.

배포와 같은 조건으로 로컬에서 확인하려면 다음과 같이 실행합니다.

```bash
BASE_PATH=/crumble-lab/ npm run build && BASE_PATH=/crumble-lab/ npx vite preview
```
