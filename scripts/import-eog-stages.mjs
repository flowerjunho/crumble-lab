#!/usr/bin/env node
/**
 * EOG.GG가 게임 클라이언트의 스테이지 표에서 읽어 공개한 데이터를 1-1부터 마지막 스테이지까지 정리한다.
 * 스테이지 수는 번들에 든 값을 쓰고, public/data/stages.json과 같아야 한다(그 파일을 먼저 갱신한다).
 *
 * 만드는 파일
 *   public/data/eog-stages.json   스테이지별 종합 데이터(권장 전투력·명중·집중·보스·마리 수·체력·공격·방어 등)
 *   public/data/stage-bosses.json 앱이 쓰는 스테이지별 보스·마리 수만 뽑은 가벼운 파일
 *
 * 사용법
 *   node scripts/import-eog-stages.mjs                     # EOG 페이지에서 최신 번들을 받아 만든다
 *   node scripts/import-eog-stages.mjs <crc.js> <stages.js> # 이미 받아 둔 번들로 만든다
 *
 * 받아 온 JS는 실행하지 않고, 안에 든 데이터 리터럴만 읽어서 해석한다.
 * 보스 이름은 public/data/stages.json의 보스 목록(한·영·일 이름)에 영어 이름으로 맞춘다.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EOG_PAGE = 'https://eog.gg/games/cookierun-crumble/'
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const PER_CHAPTER = 30

const fail = (message) => {
  throw new Error(message)
}

async function loadBundles([mainPath, stagesPath]) {
  if (mainPath && stagesPath) {
    return { mainUrl: mainPath, stagesUrl: stagesPath, main: await readFile(mainPath, 'utf8'), stages: await readFile(stagesPath, 'utf8') }
  }
  const page = await (await fetch(EOG_PAGE)).text()
  const mainUrl = new URL(page.match(/\/assets\/cookierunCrumble-[\w-]+\.js/)?.[0] ?? fail('EOG 페이지에서 크럼블 번들을 찾지 못했습니다.'), EOG_PAGE).href
  const main = await (await fetch(mainUrl)).text()
  const chunk = main.match(/\.\/(stages-[\w-]+\.js)/)?.[1] ?? fail('크럼블 번들에서 stages 청크를 찾지 못했습니다.')
  const stagesUrl = new URL(`/assets/${chunk}`, EOG_PAGE).href
  return { mainUrl, stagesUrl, main, stages: await (await fetch(stagesUrl)).text() }
}

/** 따옴표 없는 키({name:"x"})를 JSON으로 바꿔 읽는다. 데이터 리터럴만 다루므로 실행하지 않는다. */
const parseLiteral = (literal) =>
  JSON.parse(literal.replace(/([{,])\s*([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/!0\b/g, 'true').replace(/!1\b/g, 'false'))

/** `이름=[ ... ]` 형태의 배열 리터럴을 괄호 짝을 맞춰 잘라 낸다. */
function arrayLiteral(text, name) {
  const start = text.search(new RegExp(`[,;{\\s]${name}=\\[`))
  if (start < 0) fail(`${name} 배열을 찾지 못했습니다.`)
  let i = text.indexOf('[', start)
  const from = i
  let depth = 0
  for (; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') i = text.indexOf('"', i + 1)
    else if (ch === '[' || ch === '{') depth++
    else if (ch === ']' || ch === '}') {
      depth--
      if (depth === 0) break
    }
  }
  return text.slice(from, i + 1)
}

const stringLiteral = (text, name) =>
  text.match(new RegExp(`[,;{\\s]${name}="([^"]*)"`))?.[1] ?? fail(`${name} 문자열을 찾지 못했습니다.`)

/** EOG의 es(): 쉼표로 나눈 36진수 증분을 누적하고 10으로 나눈다(소수 첫째 자리). */
function decodeDelta(text, name) {
  const raw = text.match(new RegExp(`[,;{\\s]${name}=[A-Za-z_$][\\w$]*\\("([^"]*)"\\)`))?.[1] ?? fail(`${name} 증분 배열을 찾지 못했습니다.`)
  let sum = 0
  return raw.split(',').map((token) => {
    sum += parseInt(token, 36)
    return Math.round(sum) / 10
  })
}

/** EOG의 decodeFixed(): 고정 폭 36진수 묶음 */
const decodeFixed = (text, width) => {
  const out = []
  for (let i = 0; i < text.length; i += width) out.push(parseInt(text.slice(i, i + width), 36))
  return out
}

/** EOG의 runValueAt(): [값, 마지막 스테이지 순번] 구간 표에서 순번(1부터)의 값을 찾는다. */
const runValueAt = (runs, order) => runs.find(([, last]) => order <= last)?.[0] ?? null

const { mainUrl, stagesUrl, main, stages } = await loadBundles(process.argv.slice(2))

// 스테이지 청크: 내보내기 이름으로 실제 변수 이름을 찾는다.
const exportsBlock = stages.match(/export\{([^}]+)\}/)?.[1] ?? fail('stages 청크의 내보내기를 찾지 못했습니다.')
const local = (exported) => exportsBlock.match(new RegExp(`(\\w+) as ${exported}\\b`))?.[1] ?? fail(`${exported}를 찾지 못했습니다.`)
const bossNames = parseLiteral(arrayLiteral(stages, local('BOSSES')))
const spawnCounts = parseLiteral(arrayLiteral(stages, local('SPAWN_COUNTS')))
const bossStream = stringLiteral(stages, local('BOSS_STREAM'))
const countStream = stringLiteral(stages, local('COUNT_STREAM'))
const hpWidth = Number(stages.match(new RegExp(`[,;{\\s]${local('HP_WIDTH')}=(\\d+)`))?.[1])
const atkWidth = Number(stages.match(new RegExp(`[,;{\\s]${local('ATK_WIDTH')}=(\\d+)`))?.[1])
const bossHp = decodeFixed(stringLiteral(stages, local('BOSS_HP')), hpWidth)
const bossAtk = decodeFixed(stringLiteral(stages, local('BOSS_ATK')), atkWidth)
const defRuns = parseLiteral(arrayLiteral(stages, local('DEF_RUNS')))
const killRuns = parseLiteral(arrayLiteral(stages, local('KILL_RUNS')))
const timeRuns = parseLiteral(arrayLiteral(stages, local('TIME_RUNS')))
const offlineItems = parseLiteral(arrayLiteral(stages, local('OFFLINE_ITEMS')))
const offlineRanges = parseLiteral(arrayLiteral(stages, local('OFFLINE_RANGES')))

// 메인 번들의 변수 이름은 빌드마다 바뀌므로 내용으로 찾는다.
// 스테이지 수: {chapters:N,perChapter:30,stages:N}
const sizeMatch = main.match(/\{chapters:(\d+),perChapter:(\d+),stages:(\d+)\}/) ?? fail('크럼블 번들에서 스테이지 수를 찾지 못했습니다.')
const STAGES = Number(sizeMatch[3])
if (Number(sizeMatch[2]) !== PER_CHAPTER || Number(sizeMatch[1]) * PER_CHAPTER !== STAGES) fail(`스테이지 수 모양이 다릅니다: ${sizeMatch[0]}`)

// 권장 전투력: 1-1부터 시작하는 숫자 배열
const recommendedPower = parseLiteral(arrayLiteral(main, main.match(/[,;{\s]([A-Za-z_$][\w$]*)=\[1600,1950,/)?.[1] ?? fail('권장 전투력 배열을 찾지 못했습니다.')))

// 필요 명중·필요 집중·적 명중: 스테이지 수만큼의 36진수 증분 문자열. 어느 것이 무엇인지는
// stages.json의 적 회피·적 저항(소수 첫째 자리 반올림 값)과 맞춰 보고 정한다.
const base = JSON.parse(await readFile(join(ROOT, 'public/data/stages.json'), 'utf8'))
if (base.rows.length !== STAGES) fail(`stages.json 스테이지 수(${base.rows.length})가 EOG(${STAGES})와 다릅니다. stages.json을 먼저 갱신하세요.`)
const deltaArrays = [...main.matchAll(/[,;{\s]([A-Za-z_$][\w$]*)=[A-Za-z_$][\w$]*\("([0-9a-z,]+)"\)/g)]
  .filter((m) => m[2].split(',').length === STAGES)
  .map((m) => ({ name: m[1], values: decodeDelta(main, m[1]) }))
const closeTo = (values, column) => values.every((v, i) => Math.abs(v - base.rows[i][column]) <= 1)
const pick = (label, test) => {
  const found = deltaArrays.filter(test)
  if (found.length !== 1) fail(`${label} 배열을 하나로 정하지 못했습니다(후보 ${found.length}개).`)
  return found[0]
}
const accuracy = pick('필요 명중', (a) => closeTo(a.values, 3))
const focus = pick('필요 집중', (a) => a !== accuracy && closeTo(a.values, 4))
const enemy = pick('적 명중', (a) => a !== accuracy && a !== focus)
const accuracyNeeded = accuracy.values
const focusNeeded = focus.values
const enemyAccuracy = enemy.values

const lengths = { bossStream: bossStream.length, countStream: countStream.length, bossHp: bossHp.length, bossAtk: bossAtk.length, recommendedPower: recommendedPower.length, accuracyNeeded: accuracyNeeded.length, enemyAccuracy: enemyAccuracy.length, focusNeeded: focusNeeded.length }
for (const [key, length] of Object.entries(lengths)) if (length !== STAGES) fail(`${key} 길이가 ${STAGES}가 아닙니다: ${length}`)

// 보스 이름을 한·영·일로 맞춘다.
const normalize = (name) => name.replace(/\s+/g, ' ').trim().toLowerCase()
const localized = new Map()
for (const [names] of base.bosses) {
  const key = normalize(names.en)
  if (!localized.has(key)) localized.set(key, { ko: names.ko, en: names.en.replace(/\s+/g, ' ').trim(), ja: names.ja })
}
const missing = bossNames.filter((name) => !localized.has(normalize(name)))
if (missing.length) fail(`stages.json 보스 목록에 없는 이름: ${missing.join(', ')}`)

const rows = []
const bossRows = []
for (let i = 0; i < STAGES; i++) {
  const bossIndex = ALPHABET.indexOf(bossStream[i])
  const spawns = spawnCounts[ALPHABET.indexOf(countStream[i])]
  if (bossIndex < 0 || bossIndex >= bossNames.length || spawns === undefined) fail(`${Math.floor(i / PER_CHAPTER) + 1}-${(i % PER_CHAPTER) + 1}를 해석하지 못했습니다.`)
  const order = i + 1
  rows.push([
    Math.floor(i / PER_CHAPTER) + 1,
    (i % PER_CHAPTER) + 1,
    recommendedPower[i],
    accuracyNeeded[i],
    focusNeeded[i],
    enemyAccuracy[i],
    bossIndex,
    spawns,
    bossHp[i],
    bossAtk[i],
    runValueAt(defRuns, order),
    runValueAt(killRuns, order),
    runValueAt(timeRuns, order),
  ])
  bossRows.push([bossIndex, spawns])
}

// 기존 stages.json과 권장 전투력이 같은지 확인한다(스테이지 순서가 맞는지 보는 기준).
const powerMismatch = rows.filter((row, i) => row[2] !== base.rows[i][2]).length
if (powerMismatch) console.warn(`주의: 권장 전투력이 stages.json과 다른 스테이지 ${powerMismatch}개`)

const fetchedAt = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const meta = {
  source: EOG_PAGE,
  sourceFiles: [mainUrl, stagesUrl],
  fetchedAt,
  note: 'EOG.GG가 게임 클라이언트의 스테이지 표에서 읽은 값. 개발사 공식 데이터가 아니다.',
  chapters: STAGES / PER_CHAPTER,
  perChapter: PER_CHAPTER,
  stages: STAGES,
}
const bosses = bossNames.map((name) => localized.get(normalize(name)))

const full = {
  _meta: {
    ...meta,
    columns: [
      'chapter', 'stage',
      'recommendedPower: 피해 100%에 필요한 팀 전투력',
      'accuracyNeeded: 적중률 100%에 필요한 명중(적 회피)',
      'focusNeeded: 디버프 적용률 100%(기본 적용률 100%)에 필요한 집중(적 저항)',
      'enemyAccuracy: 적의 명중',
      'bossIndex: bosses 인덱스',
      'spawns: 보스 마리 수',
      'bossHp: 보스 한 마리 체력',
      'bossAtk: 보스 공격력',
      'bossDef: 보스 방어력',
      'killsToBoss: 보스 소환까지 처치 수',
      'timeLimitSec: 보스전 제한 시간(초)',
    ],
    offline: 'offline.ranges[i] = [시작 순번, 끝 순번, ...items 순서대로 한 번에 받는 양]. 순번은 (챕터-1)*30+스테이지.',
  },
  bosses,
  rows,
  offline: { items: offlineItems, ranges: offlineRanges },
}
await writeFile(join(ROOT, 'public/data/eog-stages.json'), `${JSON.stringify(full)}\n`)

const slim = {
  _meta: { ...meta, note: `${meta.note} 앱은 여기서 스테이지별 보스만 쓴다. rows[(챕터-1)*30+(스테이지-1)] = [보스 인덱스, 마리 수].` },
  bosses,
  rows: bossRows,
}
await writeFile(join(ROOT, 'public/data/stage-bosses.json'), `${JSON.stringify(slim)}\n`)

console.log(`저장: eog-stages.json, stage-bosses.json (${STAGES}개 스테이지, 보스 ${bosses.length}종, 권장 전투력 불일치 ${powerMismatch}개)`)
