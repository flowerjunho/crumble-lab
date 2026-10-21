#!/usr/bin/env node
/**
 * 업데이트 일정·차원의 이면 시즌 기간·쿠폰 코드(src/data/updates.json)를 만든다.
 *
 * EOG.GG 번들에서 날짜·시각·시즌 번호·쿠폰 코드·만료일·보상 수량처럼 사실에 해당하는 값만 읽는다.
 * EOG가 쓴 요약·설명문(summary·note·warning·…Note)은 가져오지 않고, 화면 문구는 우리가 직접 쓴다
 * (src/features/info/analysis/updatesData.ts). 받아 온 JS는 실행하지 않는다.
 *
 * 시각: EOG 일정은 UTC로 적혀 있다(화면에 'UTC'를 붙여 보여 준다). 국내 데이터 위키(cc.team-hobby.com ?p=schedule)의
 * 13:30(KST) 시작 시각과 04:30(UTC)이 같은 순간이라 UTC로 읽는 것이 맞다. 저장할 때는 ISO 문자열(Z)로 바꾼다.
 * 쿠폰 만료일은 원본에 'KST'가 붙어 있으므로 +09:00으로 저장한다.
 *
 * 사용법
 *   node scripts/import-eog-updates.mjs            # EOG 페이지에서 최신 번들을 받아 만든다
 *   node scripts/import-eog-updates.mjs <crc.js>   # 이미 받아 둔 크럼블 번들로 만든다
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
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

const { url, text } = await loadMainBundle(process.argv[2])

// 변수 이름은 빌드마다 바뀔 수 있어서, 이름 대신 내용의 시작 모양으로 찾는다.
const findLiteral = (pattern, label) => {
  const m = new RegExp(`[,;{\\s]([A-Za-z_$][\\w$]*)=(?=${pattern})`).exec(text)
  if (!m) fail(`${label} 데이터를 찾지 못했습니다.`)
  return readNamedLiteral(text, m[1], pattern)
}

const calendar = findLiteral('\\[\\{key:"[\\w-]+",date:"\\d{4}-\\d\\d-\\d\\d",time:"\\d\\d:\\d\\d",name:', '업데이트 일정')
const rift = findLiteral('\\[\\[1,"\\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d","\\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d",\\d+\\]', '차원의 이면 시즌')
const coupons = findLiteral('\\[\\{code:"[A-Z0-9]+",status:"', '쿠폰 코드')

/** "2026-10-08" + "04:30"(UTC) → "2026-10-08T04:30:00Z" */
const utc = (date, time) => {
  if (!/^\d{4}-\d\d-\d\d$/.test(date) || !/^\d\d:\d\d$/.test(time)) fail(`날짜 형식이 예상과 다릅니다: ${date} ${time}`)
  return `${date}T${time}:00Z`
}
/** "2026-10-22 03:00"(UTC) → ISO */
const utcPair = (value) => {
  const [date, time] = String(value).split(' ')
  return utc(date ?? '', time ?? '')
}

// 일정 종류는 키 모양으로 정한다. 모르는 키가 생기면 화면 문구를 새로 써야 하므로 멈춘다.
const KIND = [
  [/^v(\d)(\d+)$/, 'update', (m) => ({ version: `${m[1]}.${m[2]}` })],
  [/^rift-s(\d+)$/, 'rift', (m) => ({ season: Number(m[1]) })],
  [/^rumble-s(\d+)$/, 'rumble', (m) => ({ season: Number(m[1]) })],
  [/^arena-s(\d+)$/, 'arena', (m) => ({ season: Number(m[1]) })],
  [/^guild-next$/, 'guild', () => ({})],
]

const schedule = calendar.map((entry) => {
  const hit = KIND.map(([re, kind, extra]) => {
    const m = re.exec(entry.key)
    return m ? { kind, ...extra(m) } : null
  }).find(Boolean)
  if (!hit) fail(`모르는 일정 종류입니다: ${entry.key} (${entry.name})`)
  return {
    key: entry.key,
    ...hit,
    start: utc(entry.date, entry.time),
    end: entry.until ? utcPair(entry.until) : null,
  }
})

const riftSeasons = rift.map((row) => {
  if (!Array.isArray(row) || row.length !== 4) fail(`차원의 이면 시즌 행 모양이 예상과 다릅니다: ${JSON.stringify(row)}`)
  const [season, start, end, pool] = row
  return { season, start: utcPair(start), end: utcPair(end), pool }
})
riftSeasons.forEach((s, i) => s.season === i + 1 || fail(`차원의 이면 시즌 번호가 순서대로가 아닙니다: ${s.season}`))

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** "August 25, 2026, 23:59 KST" → "2026-08-25T23:59:00+09:00", "August 3, 2026" → "2026-08-03" */
function koreanDate(value, withTime) {
  const m = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})(?:, (\d\d):(\d\d) KST)?$/.exec(value) ?? fail(`쿠폰 날짜 형식이 예상과 다릅니다: ${value}`)
  const month = MONTHS.indexOf(m[1]) + 1 || fail(`모르는 달 이름입니다: ${m[1]}`)
  const date = `${m[3]}-${String(month).padStart(2, '0')}-${m[2].padStart(2, '0')}`
  if (!withTime) return date
  if (!m[4]) fail(`쿠폰 만료 시각이 없습니다: ${value}`)
  return `${date}T${m[4]}:${m[5]}:00+09:00`
}

// 보상 아이템: 국내 인게임 표기는 화면 쪽(updatesData.ts)에 두고, 여기서는 키로만 바꾼다.
// 'one-hour Auto Hunt Coin rewards'는 '코인 1시간 자동 사냥 보상' 아이템이다(상점 패키지 구성품 표기와 같은 모양).
const REWARD = {
  Crystals: 'crystal',
  'Flame of Bravery': 'flameOfBravery',
  'Stellar Points': 'stellarPoint',
  'Lucky Dough': 'luckyDough',
  'Rune Crystals': 'runeCrystal',
  'one-hour Auto Hunt Coin rewards': 'autoHuntCoin1h',
}

const couponList = coupons.map((c) => ({
  code: /^[A-Z0-9]+$/.test(c.code) ? c.code : fail(`쿠폰 코드 형식이 예상과 다릅니다: ${c.code}`),
  added: koreanDate(c.added, false),
  expires: koreanDate(c.expires, true),
  rewards: c.rewards.map((r) => ({
    item: REWARD[r.name] ?? fail(`모르는 쿠폰 보상입니다: ${r.name}`),
    qty: Number(String(r.qty).replace(/,/g, '')) || fail(`보상 수량을 읽지 못했습니다: ${r.qty}`),
  })),
}))

const out = {
  _meta: {
    source: EOG_PAGE,
    sourceFile: url.startsWith('http') ? url : 'local bundle',
    fetchedAt: new Date().toISOString().slice(0, 10),
    note: '날짜·시각·시즌 번호·쿠폰 코드·보상 수량만 EOG.GG 공개 데이터에서 읽었다. 시각은 ISO(UTC 또는 +09:00). EOG 요약·설명문은 포함하지 않는다.',
  },
  schedule,
  riftSeasons,
  coupons: couponList,
}

await writeFile(join(ROOT, 'src/data/updates.json'), JSON.stringify(out) + '\n')
console.log(`일정 ${schedule.length}건, 차원의 이면 시즌 ${riftSeasons.length}개, 쿠폰 ${couponList.length}개를 저장했습니다.`)
