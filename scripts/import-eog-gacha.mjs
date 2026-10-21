#!/usr/bin/env node
/**
 * 뽑기 시뮬레이터 데이터(src/data/gacha.json)를 만든다.
 *
 * 뽑기 레벨별 등급 확률표·뽑기 종류(쿠키/펫)·1회 비용·뽑기권·픽업 대상 등급·커뮤니티 천장 수치는
 * EOG.GG 번들에 들어 있는 데이터 리터럴에서 숫자와 구조만 읽는다.
 * EOG가 직접 쓴 설명문(note·blurb·liveNote·천장에 대한 의견 글)은 가져오지 않는다. 받아 온 JS는 실행하지 않는다.
 * 뽑기 이름·재화 이름은 국내 인게임 표기(cc.team-hobby.com ?p=rates, ?p=items)를 쓰고,
 * EOG 번들에 없는 '뽑기 레벨별 필요 누적 횟수'도 같은 곳(?p=rates)의 공개 표를 옮긴다.
 *
 * 사용법
 *   node scripts/import-eog-gacha.mjs            # EOG 페이지에서 최신 번들을 받아 만든다
 *   node scripts/import-eog-gacha.mjs <crc.js>   # 이미 받아 둔 크럼블 번들로 만든다
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

const cookieTables = findLiteral('\\[\\{id:"premium",name:"[^"]+",note:', '쿠키 뽑기 확률표')
const petTables = findLiteral('\\[\\{id:"pet-premium",name:"[^"]+",note:', '펫 뽑기 확률표')
const banners = findLiteral('\\[\\{id:"premium",kind:"cookie",', '뽑기 종류')
// 뽑기에서 나오지 않는 쿠키·펫 목록은 등급 순서 배열(["TSSR","SSR",...]) 바로 앞에 있다.
const excludedMatch =
  /[,;{\s][A-Za-z_$][\w$]*=(\[(?:"[^"]+",?)*\]),[A-Za-z_$][\w$]*=\["TSSR","SSR","SR","R","U","C"\]/.exec(text) ?? fail('뽑기 제외 목록을 찾지 못했습니다.')
const excludedNames = JSON.parse(excludedMatch[1])

const cookieDb = JSON.parse(await readFile(join(ROOT, 'public/data/cookie-db.json'), 'utf8')).cookies
const petDb = JSON.parse(await readFile(join(ROOT, 'public/data/pet-db.json'), 'utf8')).pets

// 국내 인게임 표기(cc.team-hobby.com ?p=rates 뽑기 이름, ?p=items 재화 이름). 일본어는 확인하지 못한 직역이다.
const NAME = {
  premium: { ko: '고급 쿠키 뽑기', en: 'Premium Cookie Gacha', ja: 'プレミアムクッキーガチャ' },
  pickup: { ko: '쿠키 픽업 뽑기', en: 'Pick-up Cookie Gacha', ja: 'ピックアップクッキーガチャ' },
  special: { ko: '쿠키 차원 뽑기', en: 'Special Gacha', ja: 'スペシャルガチャ' },
  'pet-premium': { ko: '고급 펫 뽑기', en: 'Premium Pet Gacha', ja: 'プレミアムペットガチャ' },
  'pet-pickup': { ko: '펫 픽업 뽑기', en: 'Pick-up Pet Gacha', ja: 'ピックアップペットガチャ' },
}
const ITEM = {
  'Premium Cookie Cutter': { ko: '고급 쿠키커터', en: 'Premium Cookie Cutter', ja: 'プレミアムクッキーカッター' },
  'Pick-up Cookie Cutter': { ko: '픽업 쿠키커터', en: 'Pick-up Cookie Cutter', ja: 'ピックアップクッキーカッター' },
  'Premium Pet Ticket': { ko: '고급 펫 뽑기권', en: 'Premium Pet Ticket', ja: 'プレミアムペットチケット' },
  'Pick-up Pet Ticket': { ko: '픽업 펫 뽑기권', en: 'Pick-up Pet Ticket', ja: 'ピックアップペットチケット' },
  Crystals: { ko: '크리스탈', en: 'Crystals', ja: 'クリスタル' },
  'Flame of Bravery': { ko: '용기의 불꽃', en: 'Flame of Bravery', ja: '勇気の炎' },
}
// 뽑기 레벨별 필요 누적 뽑기 횟수(cc.team-hobby.com ?p=rates). 쿠키 뽑기와 펫 뽑기의 레벨은 따로 오른다.
const LEVEL_DRAWS = {
  cookie: [0, 80, 300, 850, 1800, 3000, 4800, 7000, 10000, 18000],
  pet: [0, 100, 350, 1000, 2150, 3600, 5700, 8400, 12000, 22000],
}
const RANKS = new Set(['TSSR', 'SSR', 'SR', 'R', 'U', 'C'])

const cookieByEn = new Map(cookieDb.map((c) => [c.name.en, c]))
const petByEn = new Map(petDb.map((p) => [p.name.en, p]))
const unitKey = (kind, en) => {
  const unit = kind === 'pet' ? petByEn.get(en) : cookieByEn.get(en)
  return unit ? unit.slug : fail(`도감에 없는 ${kind === 'pet' ? '펫' : '쿠키'}: ${en}`)
}

const tables = new Map([...cookieTables, ...petTables].map((t) => [t.id, t]))
const out = banners.map((banner) => {
  const table = tables.get(banner.id) ?? fail(`${banner.id}: 확률표가 없습니다.`)
  const kind = banner.kind === 'pet' ? 'pet' : banner.kind === 'cookie' ? 'cookie' : fail(`${banner.id}: 모르는 종류 ${banner.kind}`)
  let featuredRates = null
  const rows = []
  for (const row of table.rows) {
    if (row.values.length !== 10 || row.values.some((v) => typeof v !== 'number' || v < 0)) fail(`${banner.id}: ${row.rank} 확률이 10단계 숫자가 아닙니다.`)
    if (row.rank === banner.featuredRow) featuredRates = row.values
    else if (RANKS.has(row.rank)) rows.push({ rank: row.rank, values: row.values })
    else fail(`${banner.id}: 모르는 등급 ${row.rank}`)
  }
  for (let i = 0; i < 10; i++) {
    const sum = rows.reduce((s, r) => s + r.values[i], featuredRates?.[i] ?? 0)
    if (Math.abs(sum - 100) > 0.001) fail(`${banner.id} Lv.${i + 1}: 확률 합이 ${sum}%입니다.`)
  }
  if (banner.featuredRow && !featuredRates) fail(`${banner.id}: 픽업 확률 줄이 없습니다.`)
  const fixed = banner.featuredFixed ? unitKey(kind, banner.featuredFixed) : null
  return {
    id: banner.id,
    kind,
    name: NAME[banner.id] ?? fail(`${banner.id}: 국내 이름이 없습니다.`),
    ticket: banner.ticket ? (ITEM[banner.ticket] ?? fail(`모르는 뽑기권 ${banner.ticket}`)) : null,
    currency: ITEM[banner.currency] ?? fail(`모르는 재화 ${banner.currency}`),
    cost: banner.cost,
    rows,
    featured: featuredRates
      ? {
          rates: featuredRates,
          // 고정 픽업(쿠키 차원 뽑기)은 대상이 정해져 있고, 나머지는 해당 등급 안에서 고른다.
          fixed,
          from: fixed ? [] : (banner.featuredFrom ?? fail(`${banner.id}: 픽업 대상 등급이 없습니다.`)),
          default: fixed ?? (banner.featuredDefault ? unitKey(kind, banner.featuredDefault) : null),
        }
      : null,
    // 공식 공지에 없는 커뮤니티 수치다. 화면에서는 '확인되지 않음'으로 표시하고 기본으로 끈다.
    reportedPity: typeof banner.pity === 'number' ? banner.pity : null,
  }
})

const excluded = { cookie: [], pet: [] }
for (const name of excludedNames) {
  if (cookieByEn.has(name)) excluded.cookie.push(cookieByEn.get(name).slug)
  else if (petByEn.has(name)) excluded.pet.push(petByEn.get(name).slug)
  else fail(`도감에 없는 뽑기 제외 대상: ${name}`)
}

const result = {
  _meta: {
    source: EOG_PAGE,
    sourceFile: url.startsWith('http') ? url : 'local bundle',
    fetchedAt: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
    note: '확률표·비용은 EOG.GG 번들의 데이터 리터럴, 뽑기·재화 이름과 레벨별 필요 누적 횟수는 국내 표기(cc.team-hobby.com). EOG 설명문은 포함하지 않는다.',
  },
  levelDraws: LEVEL_DRAWS,
  excluded,
  banners: out,
}
await writeFile(join(ROOT, 'src/data/gacha.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(`저장: src/data/gacha.json (뽑기 ${out.length}종, 제외 ${excludedNames.length})`)
