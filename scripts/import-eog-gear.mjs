#!/usr/bin/env node
/**
 * 장비 데이터(public/data/gear.json)를 만든다: 오븐 레벨별 등장 확률, 장비 슬롯, 플레이트 강화, 슈가룬.
 *
 * - EOG.GG 번들에서 읽는 값: 플레이트 단계별 메인·보조 옵션 증폭, 오븐 레벨별 장비 등급 확률과 장비 레벨 범위,
 *   오븐 레벨별 장비 종류 해금 순서, 슈가룬 등급·티어별 확률과 효과 수치.
 * - 번들에 없는 값은 아래 OFFICIAL·WIKI 상수로 옮겨 적었다. 번들 값과 겹치는 부분은 서로 대조해서 다르면 멈춘다.
 *   OFFICIAL: 데브시스터즈 고객센터 확률 공시(슈가룬·플레이트 강화, 오븐 뽑기), sugargnome.com/crc/rates 에 공시 그대로 옮겨 둔 표
 *   WIKI: cc.team-hobby.com(?p=oven, ?p=oven&v=opts, ?p=runesim) — 국내 인게임 화면 기준 수치
 * EOG가 직접 쓴 설명문·조언(headline, note, takeaways, advice)은 가져오지 않는다. 받아 온 JS는 실행하지 않는다.
 *
 * 사용법
 *   node scripts/import-eog-gear.mjs            # EOG 페이지에서 최신 번들을 받아 만든다
 *   node scripts/import-eog-gear.mjs <crc.js>   # 이미 받아 둔 크럼블 번들로 만든다
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
function literal(pattern, what) {
  const m = new RegExp(`[,;{\\s]([A-Za-z_$][\\w$]*)=(?=${pattern})`).exec(text) ?? fail(`${what}를 찾지 못했습니다.`)
  return readNamedLiteral(text, m[1], pattern)
}

const plateLadder = literal('\\[\\{grade:0,main:0,sub:0\\}', '플레이트 증폭표')
const ovenRows = literal('\\[\\{lv:1,min:\\d+,max:\\d+,p:\\[', '오븐 레벨별 등급 확률')
const rarityNames = literal('\\["Common","Advanced",', '장비 등급 이름')
const ovenGuide = literal('\\{ovenGate:\\[', '오븐 슬롯 해금표')
const runeRows = literal('\\[\\{rarity:"SSR",tiers:\\[\\{tier:"01",p:', '슈가룬 확률표')
const plateGuide = literal('\\{headline:"Plating', '플레이트 위험 구간')

const problems = []
const near = (a, b) => Math.abs(a - b) < 1e-9

// ---------- 장비 등급 ----------
const RARITY = {
  Common: 'common',
  Advanced: 'advanced',
  Excellent: 'excellent',
  Magic: 'magic',
  Epic: 'epic',
  Special: 'special',
  SuperEpic: 'superEpic',
  Unique: 'unique',
  Legendary: 'legendary',
  Eternal: 'eternal',
}
const rarities = rarityNames.map((name) => RARITY[name] ?? fail(`모르는 장비 등급 ${name}`))
if (rarities.length !== 10) fail(`장비 등급이 10개가 아닙니다(${rarities.length}).`)

// ---------- 장비 슬롯 ----------
const SLOT = { Sword: 'sword', Bow: 'bow', Staff: 'staff', Helmet: 'helmet', Armor: 'armor', Shield: 'shield', Necklace: 'necklace', Ring: 'ring', Brooch: 'brooch', Artifact: 'artifact', Book: 'book', Food: 'food' }
// 슬롯 해금 순서는 EOG 표에서 레벨과 슬롯 이름만 읽는다(옆에 붙은 설명문은 버린다).
const unlockAt = {}
for (const gate of ovenGuide.ovenGate) {
  const level = Number(/Lv\.(\d+)/.exec(gate.level)?.[1] ?? fail(`오븐 레벨을 읽지 못했습니다: ${gate.level}`))
  for (const word of gate.unlocked.match(/[A-Z][a-z]+/g) ?? []) if (SLOT[word]) unlockAt[SLOT[word]] ??= level
}
// 메인 옵션은 슬롯마다 고정이다(WIKI ?p=oven&v=opts ① 메인 옵션).
// 보조 옵션 후보는 공시의 '장비별 보조옵션 등장 확률'과 같다: 무기·방어구 5종(각 20%), 장신구 9종(각 11.1111%).
const SUB_POOL = {
  weapon: ['atk', 'accuracy', 'critRate', 'critDamage', 'skillAmp'],
  armor: ['def', 'hp', 'avoidance', 'critResist', 'damageReduction'],
  accessoryAtk: ['atk', 'accuracy', 'critRate', 'critDamage', 'skillAmp', 'focus', 'resist', 'haste', 'moveSpeed'],
  accessoryDef: ['def', 'hp', 'avoidance', 'critResist', 'damageReduction', 'focus', 'resist', 'haste', 'moveSpeed'],
}
const SLOT_INFO = [
  ['sword', 'weapon', 'atk'],
  ['bow', 'weapon', 'accuracy'],
  ['staff', 'weapon', 'critRate'],
  ['helmet', 'armor', 'def'],
  ['armor', 'armor', 'hp'],
  ['shield', 'armor', 'avoidance'],
  ['necklace', 'accessoryAtk', 'critResist'],
  ['ring', 'accessoryAtk', 'focus'],
  ['brooch', 'accessoryAtk', 'resist'],
  ['artifact', 'accessoryDef', 'critDamage'],
  ['book', 'accessoryDef', 'skillAmp'],
  ['food', 'accessoryDef', 'damageReduction'],
]
const slots = SLOT_INFO.map(([key, group, main]) => ({ key, group, main, unlockAt: unlockAt[key] ?? fail(`해금 레벨이 없는 슬롯: ${key}`) }))
// 공시 '오븐 레벨별 장비 종류 등장 확률'과 같아야 한다: Lv.1에 4종, 이후 한 레벨에 1종씩, Lv.9에 12종.
const OFFICIAL_UNLOCK = { sword: 1, bow: 1, staff: 1, helmet: 1, armor: 2, shield: 3, necklace: 4, ring: 5, brooch: 6, artifact: 7, book: 8, food: 9 }
for (const slot of slots) if (OFFICIAL_UNLOCK[slot.key] !== slot.unlockAt) problems.push(`${slot.key}: 해금 레벨이 공시와 다릅니다(${slot.unlockAt}).`)

// ---------- 오븐 ----------
// 한 번에 여는 개수(자동 열기)는 번들에 없어 WIKI ?p=oven 표를 옮겼다(Lv.1~50).
const AUTO_OPEN = [1, 1, 1, 1, 2, 2, 2, 2, 2, 5, 5, 5, 5, 5, 10, 10, 10, 10, 10, 20, 20, 20, 20, 20, 30, 30, 30, 30, 30, 50, 50, 200, 200, 300, 300, 400, 400, ...Array(13).fill(500)]
if (ovenRows.length !== 50) fail(`오븐 레벨이 50단계가 아닙니다(${ovenRows.length}).`)
const oven = ovenRows.map((row, index) => {
  if (row.lv !== index + 1) fail(`오븐 레벨 순서가 맞지 않습니다: ${row.lv}`)
  if (row.p.length !== rarities.length) fail(`Lv.${row.lv}: 등급 확률 개수가 다릅니다.`)
  const sum = row.p.reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 100) > 1e-6) problems.push(`오븐 Lv.${row.lv}: 확률 합이 100이 아닙니다(${sum}).`)
  return { level: row.lv, itemLevel: [row.min, row.max], autoOpen: AUTO_OPEN[index], odds: row.p }
})
// 공시 원문과 한 칸만 다르다: Lv.40 레전더리를 공시는 0.095%, EOG는 0.085%로 싣는다.
// 공시 값이면 합이 100.01%가 되고 Lv.39(0.08)→Lv.41(0.09) 흐름도 깨져서 EOG 값을 쓴다.
const legendaryAt40 = oven[39]?.odds[rarities.indexOf('legendary')]
if (!near(legendaryAt40 ?? NaN, 0.085)) problems.push(`오븐 Lv.40 레전더리 확률이 바뀌었습니다(${legendaryAt40}). 공시와 다시 대조해 주세요.`)

// ---------- 장비 등급별 배율·보조 옵션 ----------
// WIKI ?p=oven&v=opts ② 등급 배율(메인·보조 옵션 공통, 기본값 대비 %). 공격력·방어력·체력과 그 외 스탯이 다르게 오른다.
const RARITY_SCALE_PRIMARY = [100, 150, 200, 250, 300, 350, 400, 450, 500, 550]
const RARITY_SCALE_OTHER = [100, 110, 120, 130, 140, 150, 162.5, 175, 187.5, 200]
// ⑤ 보조 옵션 개수: 일반·고급·우수 0개, 마법·에픽 1개, 스페셜 이상 2개
const SUB_COUNT = [0, 0, 0, 1, 1, 2, 2, 2, 2, 2]
const rarityInfo = rarities.map((key, i) => ({ key, primaryScale: RARITY_SCALE_PRIMARY[i], otherScale: RARITY_SCALE_OTHER[i], subCount: SUB_COUNT[i] }))

// ⑥ 보조 옵션 범위(0강 기준, 마법~이터널 7개 등급의 [최소, 최대]). %가 붙은 스탯은 % 수치 그대로 적는다.
const SUB_RANGE = {
  atk: [[3, 5], [8, 10], [16, 20], [32, 40], [65, 81], [131, 164], [266, 335]],
  accuracy: [[9, 19], [15, 28], [19, 39], [25, 51], [29, 60], [33, 67], [40, 79]],
  critRate: [[0.8, 1.6], [0.8, 2.4], [1.6, 4], [2.4, 4.8], [3.2, 6.4], [4, 8], [4.8, 9.6]],
  critDamage: [[0.5, 1], [0.7, 1.4], [1.2, 2.4], [1.4, 2.9], [2.2, 4.3], [2.9, 5.8], [3.6, 7.2]],
  skillAmp: [[0.3, 0.6], [0.5, 1], [0.6, 1.3], [0.8, 1.6], [1.6, 2.4], [2.4, 3.2], [3.2, 4]],
  def: [[3, 5], [8, 10], [16, 20], [32, 40], [65, 81], [131, 164], [266, 335]],
  hp: [[42, 71], [113, 141], [226, 282], [452, 565], [918, 1144], [1849, 2315], [3755, 4701]],
  avoidance: [[5, 12], [9, 19], [13, 25], [17, 33], [20, 40], [23, 44], [27, 52]],
  critResist: [[0.8, 1.6], [0.8, 2.4], [1.6, 4], [2.4, 4.8], [3.2, 6.4], [4, 8], [4.8, 9.6]],
  damageReduction: [[0.24, 0.48], [0.36, 0.72], [0.48, 0.96], [0.6, 1.2], [1.2, 1.8], [1.8, 2.4], [2.4, 3]],
  focus: [[12, 23], [18, 35], [23, 48], [32, 63], [37, 75], [42, 83], [50, 98]],
  resist: [[7, 15], [12, 23], [17, 32], [22, 42], [25, 50], [28, 55], [33, 65]],
  haste: [[1, 1], [1, 1], [1, 1], [1, 1], [2, 2], [2, 2], [2, 2]],
  moveSpeed: [[0.06, 0.09], [0.09, 0.14], [0.12, 0.18], [0.15, 0.23], [0.23, 0.3], [0.3, 0.38], [0.38, 0.45]],
}
const subRangeFrom = 'magic'
for (const pool of Object.values(SUB_POOL)) for (const stat of pool) if (!SUB_RANGE[stat]) fail(`보조 옵션 범위가 없는 스탯: ${stat}`)

// ---------- 플레이트 강화 ----------
if (plateLadder.length !== 26) fail(`플레이트 단계가 +0~+25가 아닙니다(${plateLadder.length}).`)
const plateBoost = plateLadder.map((row, index) => {
  if (row.grade !== index) fail(`플레이트 단계 순서가 맞지 않습니다: ${row.grade}`)
  return { grade: row.grade, main: row.main, sub: row.sub }
})
// OFFICIAL 플레이트 등급별 강화 확률(1 = 100%): [박살, 하락, 유지, 성공, 대성공], +0→+1부터 +24→+25까지
const PLATE_RATES = [
  [0, 0, 0, 0.9, 0.1],
  [0, 0, 0.05, 0.85, 0.1],
  [0, 0, 0.1, 0.8, 0.1],
  [0, 0, 0.15, 0.75, 0.1],
  [0, 0, 0.45, 0.5, 0.05],
  [0, 0, 0.47, 0.5, 0.03],
  [0, 0, 0.52, 0.45, 0.03],
  [0, 0, 0.54, 0.43, 0.03],
  [0, 0, 0.57, 0.4, 0.03],
  [0, 0, 0.685, 0.3, 0.015],
  [0, 0.1, 0.64, 0.25, 0.01],
  [0, 0.13, 0.62, 0.24, 0.01],
  [0, 0.14, 0.62, 0.23, 0.01],
  [0, 0.16, 0.635, 0.2, 0.005],
  [0, 0.2, 0.655, 0.14, 0.005],
  [0.05, 0.24, 0.585, 0.12, 0.005],
  [0.06, 0.28, 0.555, 0.1, 0.005],
  [0.07, 0.32, 0.527, 0.08, 0.003],
  [0.08, 0.36, 0.498, 0.06, 0.002],
  [0.1, 0.39, 0.489, 0.02, 0.001],
  [0.11, 0.42, 0.449, 0.02, 0.001],
  [0.12, 0.43, 0.429, 0.02, 0.001],
  [0.13, 0.44, 0.409, 0.02, 0.001],
  [0.14, 0.45, 0.389, 0.02, 0.001],
  [0.15, 0.46, 0.369, 0.02, 0.001],
]
// WIKI ?p=oven&v=opts ④ 시도 1회 비용: [초코강, 하락 방지, 박살 완화, 복구(박살 후 되살리기), 대성공 시 초코강 환급 비율]
// 하락 방지·박살 완화·복구는 시럽쇳물로 낸다. null은 그 단계에서 쓸 수 없다는 뜻이다.
const PLATE_COSTS = [
  [1, null, null, null, 0.1],
  [2, null, null, null, 0.1],
  [3, null, null, null, 0.1],
  [4, null, null, null, 0.1],
  [5, null, null, null, 0.1],
  [6, null, null, null, 0.1],
  [7, null, null, null, 0.25],
  [8, null, null, null, 0.25],
  [9, null, null, null, 0.25],
  [10, null, null, null, 0.25],
  [11, 1, null, null, 0.25],
  [12, 2, null, null, 0.4],
  [13, 2, null, null, 0.4],
  [14, 2, null, null, 0.4],
  [15, 2, null, null, 0.4],
  [17, 3, 2, 20, 0.4],
  [18, 3, 2, 20, 0.5],
  [19, 4, 3, 30, 0.5],
  [20, 4, 4, 40, 0.5],
  [25, 4, 5, 50, 0.5],
  [26, 5, 5, 60, 0.5],
  [27, 5, 5, 65, 0.5],
  [28, 5, 5, 70, 0.5],
  [29, 5, 5, 75, 0.5],
  [31, 5, 5, 80, 1],
]
const plateSteps = PLATE_RATES.map(([crush, down, keep, success, great], from) => {
  const sum = crush + down + keep + success + great
  if (Math.abs(sum - 1) > 1e-6) problems.push(`플레이트 +${from}: 확률 합이 1이 아닙니다(${sum}).`)
  const [material, guard, ease, restore, refund] = PLATE_COSTS[from] ?? fail(`플레이트 +${from} 비용이 없습니다.`)
  return { from, great, success, keep, down, crush, material, guard, ease, restore, refund }
})
// 하락 방지는 하락이 생기는 단계에서만, 박살 완화·복구는 박살이 생기는 단계에서만 쓸 수 있어야 한다.
for (const step of plateSteps) {
  if ((step.down > 0) !== (step.guard != null)) problems.push(`플레이트 +${step.from}: 하락 확률과 하락 방지 비용이 맞지 않습니다.`)
  if ((step.crush > 0) !== (step.ease != null) || (step.crush > 0) !== (step.restore != null)) problems.push(`플레이트 +${step.from}: 박살 확률과 박살 완화·복구 비용이 맞지 않습니다.`)
}
// EOG 위험 구간 표의 숫자(성공 확률·하락·박살 시작점)와 공시 표를 대조한다. EOG 문장 자체는 저장하지 않는다.
const bandNumbers = plateGuide.rows.map((row) => ({
  range: (row.band.match(/\d+/g) ?? []).map(Number),
  upgrade: (row.upgrade.match(/\d+/g) ?? []).map(Number),
  risk: (row.risk.match(/\d+/g) ?? []).map(Number),
}))
for (const band of bandNumbers) {
  const [lo, hi] = band.range
  const first = plateSteps[lo]
  const last = plateSteps[hi]
  if (!first || !last) fail(`플레이트 위험 구간을 읽지 못했습니다: ${band.range}`)
  if (Math.round(first.success * 100) !== band.upgrade[0] || Math.round(last.success * 100) !== band.upgrade[1]) problems.push(`플레이트 +${lo}~+${hi}: 성공 확률이 EOG 구간 표와 다릅니다.`)
  if (band.risk.length === 2) {
    const risk = (step) => Math.round((step.crush || step.down) * 100)
    if (risk(first) !== band.risk[0] || risk(last) !== band.risk[1]) problems.push(`플레이트 +${lo}~+${hi}: 하락·박살 확률이 EOG 구간 표와 다릅니다.`)
  }
}

// ---------- 슈가룬 ----------
const RUNE_STAT = {
  'ATK Amplification': 'atkAmp',
  'DEF Amplification': 'defAmp',
  'HP Amplification': 'hpAmp',
  'CRIT%': 'critRate',
  'CRIT RES': 'critResist',
  'CRIT DMG': 'critDamage',
  'Accuracy Amplification': 'accuracyRate',
  'Evasion Amplification': 'avoidanceRate',
  'Focus Rate': 'focusRate',
  'Resistance Rate': 'resistRate',
  'Skill Amplification': 'skillAmp',
  'DMG Reduction': 'damageReduction',
  'Movement SPD': 'moveSpeed',
}
const runeTiers = runeRows.flatMap((group) =>
  group.tiers.map((tier) => ({
    rarity: group.rarity,
    tier: Number(tier.tier),
    chance: tier.p,
    values: Object.fromEntries(Object.entries(tier.stats).map(([name, value]) => [RUNE_STAT[name] ?? fail(`모르는 슈가룬 효과 ${name}`), value])),
    haste: tier.haste == null ? null : { chance: tier.hasteP, value: tier.haste },
  })),
)
for (const t of runeTiers) if (Object.keys(t.values).length !== 13) problems.push(`슈가룬 ${t.rarity} ${t.tier}티어: 효과가 13종이 아닙니다.`)
// 한 번 세공하면 (등급, 티어, 효과) 조합 하나가 나온다. 모든 조합의 확률 합은 공시 반올림 오차 안에서 100%다.
const runeSum = runeTiers.reduce((sum, t) => sum + t.chance * 13 + (t.haste?.chance ?? 0), 0)
if (Math.abs(runeSum - 100) > 0.001) problems.push(`슈가룬 확률 합이 100%가 아닙니다(${runeSum}).`)
// 공시 대조: SSR 01티어 공격력 증폭 7.00, 등장 확률 0.007663%, 스킬가속 증가 5(0.015326%)
const top = runeTiers[0]
if (top?.rarity !== 'SSR' || top.tier !== 1 || top.values.atkAmp !== 7 || top.chance !== 0.007663 || top.haste?.value !== 5 || top.haste.chance !== 0.015326) problems.push('슈가룬 SSR 01티어 값이 공시와 다릅니다.')
// WIKI ?p=runesim: 잠근 슬롯 수(0~7)별 세공 1회 비용(룬결정)
const RUNE_CRAFT_COST = [20, 40, 80, 120, 180, 240, 300, 400]

if (problems.length) fail(`확인이 필요합니다:\n${problems.join('\n')}`)

const out = {
  _meta: {
    source: EOG_PAGE,
    sourceFile: url.startsWith('http') ? url : 'local bundle',
    fetchedAt: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
    note: '플레이트 증폭·오븐 등급 확률·장비 레벨·슈가룬은 EOG.GG 공개 값, 플레이트 강화 확률은 데브시스터즈 확률 공시, 비용·등급 배율·보조 옵션 범위·자동 열기는 cc.team-hobby.com 국내 인게임 기준 값. EOG 평가·설명문은 포함하지 않는다.',
  },
  rarities: rarityInfo,
  slots,
  subPools: SUB_POOL,
  subRange: { from: subRangeFrom, stats: SUB_RANGE },
  oven,
  plate: { boost: plateBoost, steps: plateSteps },
  rune: { tiers: runeTiers, craftCost: RUNE_CRAFT_COST },
}
await writeFile(join(ROOT, 'public/data/gear.json'), `${JSON.stringify(out)}\n`)
console.log(`저장: public/data/gear.json (오븐 ${oven.length}단계, 플레이트 ${plateBoost.length}단계, 슈가룬 ${runeTiers.length}티어)`)
