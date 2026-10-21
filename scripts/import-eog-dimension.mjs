#!/usr/bin/env node
/**
 * 차원의 이면 정보 데이터(public/data/dimension-info.json)를 만든다.
 *
 * 시즌 일정·단계별 첫 클리어 보상·방치 보상·랭킹 보상·보스 순환·차원의 힘 레벨 능력치는
 * EOG.GG가 게임 클라이언트에서 읽어 공개한 값을 쓴다. EOG가 직접 쓴 설명문·조합 추천은 가져오지 않는다.
 * 보스 이름은 단계 계산기가 쓰는 public/data/dimension.json의 국내 표기를, 보상 아이템 이름은
 * 국내 데이터 위키(cc.team-hobby.com ?p=dimension)에서 확인한 인게임 표기를 쓴다. 받아 온 JS는 실행하지 않는다.
 *
 * 사용법
 *   node scripts/import-eog-dimension.mjs            # EOG 페이지에서 최신 번들을 받아 만든다
 *   node scripts/import-eog-dimension.mjs <crc.js>   # 이미 받아 둔 크럼블 번들로 만든다
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

// 변수 이름은 빌드마다 바뀌므로 내용의 시작 모양으로 찾는다.
function literal(label, pattern) {
  const m = new RegExp(`[,;{\\s]([A-Za-z_$][\\w$]*)=(?=${pattern})`).exec(text) ?? fail(`${label} 데이터를 찾지 못했습니다.`)
  return readNamedLiteral(text, m[1], pattern)
}

// 기본 설정: 방치 보상이 몇 초마다 들어오는지
const config = literal('차원의 이면 설정', '\\{pools:\\d+,stagesPerPool:\\d+,')
// 단계 보상: 순환(보스 묶음)마다 [단계, [[아이템, 수량]...], 방치 보상(idleSeconds마다), 고정 보상 여부]
const rewardPools = literal('단계 보상', '\\[\\[\\[1,\\[\\["[^"]+",\\d+\\]\\],\\d+,[01]\\]')
// 랭킹 보상: 순위 구간별 시즌·일일 보상
const rankRows = literal('랭킹 보상', '\\[\\{rank:1,label:"[^"]*",season:')
// 시즌 일정: [시즌, 시작(UTC), 종료(UTC), 순환 번호(0부터)]
const schedule = literal('시즌 일정', '\\[\\[1,"\\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d","\\d{4}-')
// 순환: 단계 수, 보스 순서, 적용 시즌
const rotations = literal('보스 순환', '\\[\\{stageCount:\\d+,cycle:\\[')
// 보스 정보: 마릿수와 함께 나오는 부하
const bossRows = literal('보스 목록', '\\[\\{key:"[^"]+",name:"[^"]+",bodies:\\d+,adds:')
// 차원의 힘 레벨: [레벨, 누적 필요량, 능력치 증가(%)...]와 그 능력치 순서
const energyStats = literal('차원의 힘 능력치', '\\[\\{label:"ATK",unit:"percent"\\}')
const energyRows = literal('차원의 힘 레벨', '\\[\\[1,0,0,0,0,0,0,0,0\\],\\[2,')

if (config.idleSeconds <= 0 || config.idleReward !== 'Dimensional Energy') fail(`설정 모양이 다릅니다: ${JSON.stringify(config)}`)
if (rewardPools.length !== rotations.length) fail(`보상 묶음(${rewardPools.length})과 순환(${rotations.length}) 수가 다릅니다.`)

// 보상 아이템 국내 표기(cc.team-hobby.com ?p=dimension 단계 표). 일본어는 확인하지 못한 것은 비워 둔다.
const ITEMS = {
  'Dimension Fragment': ['fragment', '차원의 조각', ''],
  'Continuum Cog': ['continuumCog', '무한바퀴', ''],
  'Dimensional Rift Stage 10 Frame': ['frame10', '차원의 이면 10단계 달성 테두리', ''],
  'Dimensional Rift Stage 30 Frame': ['frame30', '차원의 이면 30단계 달성 테두리', ''],
  '1-min Speed-up': ['speedUp1m', '1분 가속권', ''],
  'Metal Syrup': ['metalSyrup', '시럽쇳물', ''],
  'SSR Cookie Select Box 2': ['ssrCookieBox2', 'SSR 쿠키 선택상자2', ''],
}
const usedItems = new Map()
const item = ([name, qty]) => {
  const found = ITEMS[name] ?? fail(`국내 표기가 없는 보상 아이템: ${name}`)
  if (!Number.isInteger(qty) || qty <= 0) fail(`${name}: 수량이 이상합니다(${qty}).`)
  usedItems.set(found[0], { ko: found[1], en: name, ja: found[2] })
  return { item: found[0], qty }
}

// 무한바퀴는 펫이라 펫 도감 이름과도 맞춰 본다.
const pets = JSON.parse(await readFile(join(ROOT, 'public/data/pet-db.json'), 'utf8')).pets
const cog = pets.find((p) => p.name.en === 'Continuum Cog') ?? fail('펫 도감에 무한바퀴가 없습니다.')
if (cog.name.ko !== ITEMS['Continuum Cog'][1]) fail(`무한바퀴 이름이 펫 도감(${cog.name.ko})과 다릅니다.`)

// 보스 국내 이름: 단계 계산기 데이터의 적 이름표를 영어 이름으로 찾는다.
const calc = JSON.parse(await readFile(join(ROOT, 'public/data/dimension.json'), 'utf8'))
const names = new Map()
for (const stage of calc.stages) for (const enemy of stage.enemies) names.set(enemy.names.en, enemy.names)
const nameOf = (en) => names.get(en) ?? fail(`국내 이름이 없는 적: ${en}`)

const bosses = bossRows.map((boss) => ({
  key: boss.key,
  name: nameOf(boss.name),
  bodies: boss.bodies,
  adds: boss.adds.map((add) => ({ name: nameOf(add.name), count: add.count })),
}))
const bossKeys = new Set(bosses.map((b) => b.key))

const perMinute = (value) => (value * 60) / config.idleSeconds
const outRotations = rotations.map((rotation, index) => {
  for (const key of rotation.cycle) if (!bossKeys.has(key)) fail(`순환 ${index + 1}: 모르는 보스 ${key}`)
  const rows = rewardPools[index]
  if (rows.length !== rotation.stageCount) fail(`순환 ${index + 1}: 보상 단계 수(${rows.length})가 단계 수(${rotation.stageCount})와 다릅니다.`)
  const stages = rows.map((row, i) => {
    const [stage, rewards, idle, fixed] = row
    if (row.length !== 4 || stage !== i + 1) fail(`순환 ${index + 1}: ${i + 1}단계 줄 모양이 다릅니다: ${JSON.stringify(row)}`)
    return { stage, rewards: rewards.map(item), idlePerMinute: perMinute(idle), milestone: fixed === 1 }
  })
  return { rotation: index + 1, firstSeason: rotation.firstSeason, lastSeason: rotation.lastSeason, cycle: rotation.cycle, stages }
})

// EOG 표기 시각은 UTC다(문자열 뒤에 Z를 붙여 읽는다).
const utc = (s) => /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(s) ? `${s.replace(' ', 'T')}:00Z` : fail(`시각 모양이 다릅니다: ${s}`)
const seasons = schedule.map(([season, start, end, pool], i) => {
  if (season !== i + 1) fail(`시즌 번호가 이어지지 않습니다: ${season}`)
  if (!outRotations[pool]) fail(`시즌 ${season}: 없는 순환 ${pool}`)
  const rotation = outRotations[pool]
  if (season < rotation.firstSeason || season > rotation.lastSeason) fail(`시즌 ${season}: 순환 ${pool + 1}의 적용 시즌 밖입니다.`)
  if (Date.parse(utc(start)) >= Date.parse(utc(end))) fail(`시즌 ${season}: 시작이 종료보다 늦습니다.`)
  return { season, start: utc(start), end: utc(end), rotation: pool + 1 }
})

// 순위 구간: rank는 그 구간의 마지막 순위, null은 참여 보상
const rank = rankRows.map((row) => ({ rank: row.rank, season: row.season.map(item), daily: row.daily.map(item) }))
if (rank.at(-1)?.rank !== null) fail('마지막 랭킹 줄이 참여 보상이 아닙니다.')

const ENERGY_STAT = { ATK: 'atk', DEF: 'def', HP: 'hp', 'CRIT%': 'critRate', 'CRIT DMG': 'critDamage', Accuracy: 'accuracy', Focus: 'focus' }
const energy = {
  stats: energyStats.map((s) => (s.unit === 'percent' && ENERGY_STAT[s.label]) || fail(`모르는 차원의 힘 능력치: ${JSON.stringify(s)}`)),
  levels: energyRows.map((row, i) => {
    if (row[0] !== i + 1 || row.length !== energyStats.length + 2) fail(`차원의 힘 ${i + 1}레벨 줄 모양이 다릅니다.`)
    return row
  }),
}
// 계산기 데이터의 누적 필요량과 같아야 한다(같은 시즌 데이터인지 확인).
for (const [i, level] of calc.energy.entries())
  if (energy.levels[i]?.[1] !== level.total) fail(`차원의 힘 ${level.level}레벨 누적량이 계산기 데이터와 다릅니다.`)

const out = {
  _meta: {
    source: EOG_PAGE,
    sourceFile: url.startsWith('http') ? url : 'local bundle',
    fetchedAt: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
    note: '수치·일정은 EOG.GG 공개 클라이언트 값, 이름은 국내 인게임 표기(보스: dimension.json, 아이템: cc.team-hobby.com). EOG 설명문·추천은 포함하지 않는다.',
  },
  items: Object.fromEntries(usedItems),
  bosses,
  rotations: outRotations,
  seasons,
  rank,
  energy,
}
await writeFile(join(ROOT, 'public/data/dimension-info.json'), `${JSON.stringify(out)}\n`)
console.log(`저장: public/data/dimension-info.json (시즌 ${seasons.length}개, 순환 ${outRotations.length}개, 보스 ${bosses.length}종)`)
