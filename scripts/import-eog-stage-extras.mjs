#!/usr/bin/env node
/**
 * 스테이지 정보 화면이 eog-stages.json 말고 더 쓰는 게임 데이터(public/data/stage-extras.json)를 만든다.
 *
 * 지금 담는 것
 *   - 속성 상성: 속성마다 유리한 상대와 불리한 상대, 유리할 때 더해지는 피해(%)
 *
 * 스테이지별 보스·권장 전투력·자동 사냥 보상은 이미 scripts/import-eog-stages.mjs가 eog-stages.json에 넣으므로
 * 여기서 다시 뽑지 않는다. EOG 번들의 적 목록(이름·방어력·속성)은 메인 스테이지 보스가 모두 무속성이고
 * 방어력도 스테이지 표와 다른 기준(허수아비 계산용)이라 가져오지 않는다.
 * EOG가 직접 쓴 설명문(verbatim·caption 등)은 가져오지 않는다. 받아 온 JS는 실행하지 않는다.
 *
 * 사용법
 *   node scripts/import-eog-stage-extras.mjs            # EOG 페이지에서 최신 번들을 받아 만든다
 *   node scripts/import-eog-stage-extras.mjs <crc.js>   # 이미 받아 둔 크럼블 번들로 만든다
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { basename, dirname, join } from 'node:path'
import { readNamedLiteral } from './js-literal.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EOG_PAGE = 'https://eog.gg/games/cookierun-crumble/'

const fail = (message) => {
  throw new Error(message)
}

async function loadMainBundle(path) {
  if (path) return { url: path, text: await readFile(path, 'utf8') }
  const page = await (await fetch(EOG_PAGE)).text()
  const url = new URL(page.match(/\/assets\/cookierunCrumble-[\w-]+\.js/)?.[0] ?? fail('크럼블 번들을 찾지 못했습니다.'), EOG_PAGE).href
  return { url, text: await (await fetch(url)).text() }
}

/** 변수 이름은 빌드마다 바뀌므로 내용의 시작 모양으로 이름을 찾은 다음 리터럴을 읽는다. */
function findLiteral(text, pattern, what) {
  const m = new RegExp(`[,;{\\s]([A-Za-z_$][\\w$]*)=(?=${pattern})`).exec(text) ?? fail(`${what}를 찾지 못했습니다.`)
  return readNamedLiteral(text, m[1], pattern)
}

const { url, text } = await loadMainBundle(process.argv[2])

// 속성 상성 표: {verbatim:"…",rows:[{el:"Fire",strong:"Grass",weak:"Water"},…],advantage:15,…}
const advantageSource = findLiteral(text, '\\{verbatim:"[^"]*",rows:\\[\\{el:"Fire",strong:', '속성 상성 표')

const ELEMENT = { Fire: 'fire', Water: 'water', Grass: 'grass', Light: 'light', Dark: 'dark' }
const element = (name) => ELEMENT[name] ?? fail(`알 수 없는 속성 이름: ${name}`)

if (!Array.isArray(advantageSource.rows) || advantageSource.rows.length !== 5) fail('속성 상성 표가 5줄이 아닙니다.')
const advantageRows = advantageSource.rows.map((row) => ({
  element: element(row.el),
  strongAgainst: element(row.strong),
  weakAgainst: element(row.weak),
}))
const bonus = advantageSource.advantage
if (typeof bonus !== 'number' || bonus <= 0 || bonus > 100) fail(`속성 유리 피해 값이 이상합니다: ${bonus}`)
// 다섯 속성이 한 번씩만 나와야 한다.
if (new Set(advantageRows.map((r) => r.element)).size !== 5) fail('속성 상성 표에 같은 속성이 두 번 나옵니다.')

const fetchedAt = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const out = {
  _meta: {
    source: EOG_PAGE,
    // 받아 둔 번들로 만들 때는 내 컴퓨터 경로 대신 파일 이름만 남긴다.
    sourceFiles: [url.startsWith('http') ? url : basename(url)],
    fetchedAt,
    note: 'EOG.GG가 게임 클라이언트에서 읽어 공개한 값. 개발사 공식 데이터가 아니다.',
    elementAdvantage: 'rows[i]: element가 strongAgainst를 공격하면 피해가 bonusPercent% 늘어난다. weakAgainst는 element를 상대로 유리한 속성이다.',
  },
  elementAdvantage: { bonusPercent: bonus, rows: advantageRows },
}
await writeFile(join(ROOT, 'public/data/stage-extras.json'), `${JSON.stringify(out, null, 1)}\n`)
console.log(`저장: stage-extras.json (속성 상성 ${advantageRows.length}줄, 유리 피해 +${bonus}%)`)
