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
- `/info/pets`: 크럼블 정보 - 펫 도감(`/info/pets/<slug>`에서 펫 상세)
- `/info/<서브탭>`: 크럼블 정보의 나머지 서브탭. 목록과 묶음은 `src/features/info/infoTabs.ts` 한 곳에서 정하고, 각 화면은 처음 열 때 불러온다.
  - 도감: `stages`(스테이지 정보), `dimension`(차원의 이면 보상·시즌)
  - 성장·계산: `growth`(레벨·별 성장), `runes`(슈가룬 재조합), `gear`(장비·오븐·플레이트 강화), `resolve`(돌파력), `mercenary`(용병단), `stellar`(스텔라 링크), `packages`(패키지 가치)
  - 계산기·시뮬레이터: `damage`(피해 계산기), `compare`(능력치 비교), `builds`(빌드 메이커), `battle`(전투 시뮬레이터), `dungeon`(던전 시뮬레이터), `gacha`(뽑기 시뮬레이터)
  - 분석: `overview`(개요), `tiers`(우리 기준 티어), `teams`(추천 편성), `updates`(업데이트 일정)
- 스테이지 계산은 `?ch=114&st=22`처럼 챕터·스테이지를 받아 미리 골라 둔다(스테이지 정보 화면의 계산기 링크).
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
- `public/data/pet-db.json`: 펫 57종의 별 등급별 효과·대상 조건(속성·직업·시너지)·효과 묶음·적용 모드. 수치는 EOG.GG 공개 클라이언트 값이고, EOG가 수치를 싣지 않은 명중·회피·집중·저항 계열은 국내 배틀 패시브 문구에서 읽는다. 테스트가 모든 수치를 국내 문구와 대조한다.
- `src/data/pet-text-ko.json`, `public/images/pets/`: 펫 국내 이름·소개 문구·별 등급별 패시브 문구와 이미지(cookieruncrumble.net 한국어 펫 페이지, 인게임 표기). 사이트가 쓴 분석·추천 문구는 저장하지 않는다.
- 펫 다시 만들기: `node scripts/import-pet-text-ko.mjs && node scripts/import-eog-pets.mjs`
- 크럼블 정보의 나머지 데이터는 `scripts/import-eog-*.mjs`(growth, dimension, stage-extras, gacha, runes, gear, systems, resolve, calc, sim, updates)로 만든다. 모두 EOG 번들의 데이터 리터럴을 내용 모양으로 찾아 읽고(실행하지 않음), EOG가 쓴 설명문·평가·티어는 가져오지 않는다. 번들에 없는 값(뽑기 레벨 누적 횟수, 플레이트 강화 확률·비용, 돌파력 비용 등)은 국내 확률 공개표와 cc.team-hobby.com 값을 쓰고 각 스크립트에 출처를 적었다.

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
