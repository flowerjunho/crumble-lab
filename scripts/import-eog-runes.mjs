#!/usr/bin/env node
/**
 * 슈가룬 재조합 확률표(public/data/rune-craft.json)를 만든다.
 *
 * 등급·수치·확률은 EOG.GG가 공개한 슈가룬 확률표(국내 확률 공시와 같은 값)를 쓴다.
 * 공시 확률은 소수점에서 반올림된 값이라, 전체 가중치 13050 기준의 정수 가중치로 되돌려서 저장한다.
 * 그래야 화면의 확률 계산이 반올림 오차 없이 정확하게 맞는다.
 * 잠금 개수별 재조합 비용(룬결정)은 EOG 번들에 없어서 게임 데이터 위키(cc.team-hobby.com, 슈가룬 시뮬레이터)의 값을 옮겨 둔다.
 * EOG가 직접 쓴 설명문·평가(옵션 추천 순위, 해설)는 가져오지 않는다. 받아 온 JS는 실행하지 않는다.
 *
 * 사용법
 *   node scripts/import-eog-runes.mjs            # EOG 페이지에서 최신 번들을 받아 만든다
 *   node scripts/import-eog-runes.mjs <crc.js>   # 이미 받아 둔 크럼블 번들로 만든다
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readNamedLiteral } from './js-literal.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EOG_PAGE = 'https://eog.gg/games/cookierun-crumble/'
const WIKI_PAGE = 'https://cc.team-hobby.com/?p=runesim'

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
const pattern = '\\[\\{rarity:"SSR",tiers:\\[\\{tier:"01",p:'
const m = new RegExp(`[,;{\\s]([A-Za-z_$][\\w$]*)=(?=${pattern})`).exec(text) ?? fail('슈가룬 확률표를 찾지 못했습니다.')
const source = readNamedLiteral(text, m[1], pattern)

// EOG 옵션 이름 → 우리 키. unit: pct(% 수치), flat(그냥 수치)
// 인게임 옵션 이름은 '치명확률 증가'처럼 '증가'가 붙지만, 화면에서는 추천 슈가룬 탭과 같은 짧은 이름을 쓴다.
const STAT = {
  'ATK Amplification': ['atkAmp', 'pct'],
  'DEF Amplification': ['defAmp', 'pct'],
  'HP Amplification': ['hpAmp', 'pct'],
  'CRIT%': ['critRate', 'pct'],
  'CRIT RES': ['critResist', 'pct'],
  'CRIT DMG': ['critDamage', 'pct'],
  'Accuracy Amplification': ['accuracyRate', 'pct'],
  'Evasion Amplification': ['avoidanceRate', 'pct'],
  'Focus Rate': ['focusRate', 'pct'],
  'Resistance Rate': ['resistRate', 'pct'],
  'Skill Amplification': ['skillAmp', 'pct'],
  'DMG Reduction': ['damageReduction', 'pct'],
  'Movement SPD': ['moveSpeed', 'flat'],
}
const HASTE = ['skillHaste', 'flat']

// 국내 확률 공시의 분모. 가장 드문 칸(SSR 최고 수치, 0.007663%)이 가중치 1이다.
const TOTAL_WEIGHT = 13050
// 잠근 슬롯 수(0~7)별 재조합 1회 비용(룬결정). 슬롯은 쿠키 승급에 따라 최대 8칸까지 열린다.
const REROLL_COSTS = [20, 40, 80, 120, 180, 240, 300, 400]
const MAX_SLOTS = 8

const problems = []
const toWeight = (p, where) => {
  const raw = (p / 100) * TOTAL_WEIGHT
  const weight = Math.round(raw)
  if (weight < 1 || Math.abs(raw - weight) > 0.01) problems.push(`${where}: 확률 ${p}%가 가중치 정수로 떨어지지 않습니다(${raw}).`)
  return weight
}

const RARITIES = ['SSR', 'SR', 'R', 'U', 'C']
if (source.map((r) => r.rarity).join() !== RARITIES.join()) fail(`등급 구성이 예상과 다릅니다: ${source.map((r) => r.rarity).join()}`)

const statOrder = [...Object.values(STAT).map(([key]) => key), HASTE[0]]
const rarities = source.map(({ rarity, tiers }) => ({
  rarity,
  tiers: tiers.map((tier, index) => {
    if (Number(tier.tier) !== index + 1) problems.push(`${rarity}: 수치 단계 순서가 다릅니다(${tier.tier}).`)
    const names = Object.keys(tier.stats)
    for (const name of names) if (!STAT[name]) problems.push(`${rarity} ${tier.tier}: 모르는 옵션 '${name}'`)
    for (const name of Object.keys(STAT)) if (!(name in tier.stats)) problems.push(`${rarity} ${tier.tier}: '${name}' 옵션이 빠졌습니다.`)
    const values = Object.fromEntries(Object.entries(tier.stats).map(([name, value]) => [STAT[name]?.[0] ?? name, value]))
    const haste = tier.hasteP == null || tier.haste == null ? null : { value: tier.haste, weight: toWeight(tier.hasteP, `${rarity} ${tier.tier} 스킬가속`) }
    return { tier: index + 1, weight: toWeight(tier.p, `${rarity} ${tier.tier}`), values, haste }
  }),
}))

// 무결성 검사: 모든 결과(등급×수치 단계×옵션)의 가중치 합이 분모와 같아야 한다.
let sum = 0
let outcomes = 0
for (const { tiers } of rarities)
  for (const tier of tiers) {
    sum += tier.weight * Object.keys(tier.values).length
    outcomes += Object.keys(tier.values).length
    if (tier.haste) {
      sum += tier.haste.weight
      outcomes += 1
    }
  }
if (sum !== TOTAL_WEIGHT) problems.push(`가중치 합이 ${TOTAL_WEIGHT}이 아니라 ${sum}입니다.`)
// 같은 옵션은 높은 단계일수록 수치가 커야 한다.
for (const { rarity, tiers } of rarities)
  for (let i = 1; i < tiers.length; i++)
    for (const [key, value] of Object.entries(tiers[i].values))
      if (!(value < tiers[i - 1].values[key])) problems.push(`${rarity}: ${key} 수치가 단계 순서대로 줄지 않습니다.`)
if (problems.length) fail(`확인이 필요합니다:\n${problems.join('\n')}`)

const out = {
  _meta: {
    source: EOG_PAGE,
    sourceFile: url.startsWith('http') ? url : 'local bundle',
    costSource: WIKI_PAGE,
    fetchedAt: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
    note: '등급·수치·확률은 EOG.GG가 옮긴 국내 확률 공시 값(가중치로 환산), 재조합 비용은 게임 데이터 위키 값. EOG 평가·설명문은 포함하지 않는다.',
  },
  totalWeight: TOTAL_WEIGHT,
  maxSlots: MAX_SLOTS,
  rerollCosts: REROLL_COSTS,
  stats: statOrder.map((key) => ({ key, unit: key === HASTE[0] ? HASTE[1] : (Object.values(STAT).find(([k]) => k === key)?.[1] ?? 'pct') })),
  rarities,
}
await writeFile(join(ROOT, 'public/data/rune-craft.json'), `${JSON.stringify(out)}\n`)
console.log(`저장: public/data/rune-craft.json (결과 ${outcomes}가지, 가중치 합 ${sum})`)
