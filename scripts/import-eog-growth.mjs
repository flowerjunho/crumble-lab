#!/usr/bin/env node
/**
 * 쿠키 성장 데이터(public/data/growth.json)를 만든다.
 *
 * - 레벨 표: 레벨마다 필요한 쿠키 경험치, 필요 크럼블 레벨, 공격력·방어력·체력 증가율(만분율)
 * - 승급 표: 등급(TSSR~C)과 별(1~10)마다 공격력·방어력·체력 증가율과 치명확률·치명피해·명중·회피·집중·저항 증가량
 * - 쿠키 기본 치명확률·치명피해: 쿠키 능력치 표에서 읽고, 모든 쿠키가 같은 값인지 확인한다.
 *
 * 수치는 EOG.GG가 게임 클라이언트에서 읽어 공개한 값을 쓴다. EOG가 직접 쓴 설명문은 가져오지 않는다.
 * 받아 온 JS는 실행하지 않는다.
 *
 * 사용법
 *   node scripts/import-eog-growth.mjs            # EOG 페이지에서 최신 번들을 받아 만든다
 *   node scripts/import-eog-growth.mjs <crc.js>   # 이미 받아 둔 크럼블 번들로 만든다
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

// 클라이언트 빌드 번호와 최대 레벨: {build:"1.5.002",maxLevel:120}
const client = literal('\\{build:"[\\d.]+",maxLevel:\\d+\\}', '클라이언트 정보')
// 레벨 표: [레벨, 그 레벨까지 올리는 데 드는 쿠키 경험치, 필요 크럼블 레벨, 능력치 증가율(만분율)]
const levelRows = literal('\\[\\[1,0,1,0\\],\\[2,\\d+,\\d+,\\d+\\]', '레벨 표')
// 승급 표: {C:[{grade:1,mult:{atk,def,hp},add:{critRate,...}}, ...], U:..., ..., TSSR:...}
const gradeTable = literal('\\{C:\\[\\{grade:1,mult:\\{atk:', '승급 표')
// 쿠키 능력치 표: 치명확률(cr)·치명피해(cd)를 만분율로 싣는다.
const cookieRows = literal('\\[\\{id:\\d+,name:"[^"]+",rarity:"[A-Z_]+",role:"[A-Z]+",element:"\\w+",atk:', '쿠키 능력치 표')

const maxLevel = client.maxLevel
if (!Number.isInteger(maxLevel) || maxLevel < 100) fail(`최대 레벨이 이상합니다: ${maxLevel}`)

// 레벨 표는 1부터 최대 레벨까지 빠짐없이, 비용·증가율은 줄지 않아야 한다.
if (levelRows.length !== maxLevel) fail(`레벨 표가 ${levelRows.length}행입니다(최대 레벨 ${maxLevel}).`)
levelRows.forEach((row, i) => {
  if (!Array.isArray(row) || row.length !== 4 || row.some((v) => !Number.isInteger(v) || v < 0)) fail(`레벨 표 ${i + 1}행 모양이 다릅니다: ${JSON.stringify(row)}`)
  if (row[0] !== i + 1) fail(`레벨 표 순서가 다릅니다: ${row[0]}`)
  const prev = levelRows[i - 1]
  if (prev && (row[2] < prev[2] || row[3] <= prev[3])) fail(`레벨 ${row[0]}: 필요 크럼블 레벨이나 증가율이 줄었습니다.`)
})

// 승급 표: 모든 등급이 별 10개이고, 공격력·체력 증가율은 같고, 추가 능력치는 등급과 상관없이 같아야 한다.
const RARITIES = ['TSSR', 'SSR', 'SR', 'R', 'U', 'C']
const ADD_KEYS = ['critRate', 'critDamage', 'accuracy', 'avoidance', 'focus', 'resist']
const sameKeys = (a, b) => JSON.stringify(Object.keys(a).sort()) === JSON.stringify([...b].sort())
if (!sameKeys(gradeTable, RARITIES)) fail(`승급 표 등급이 다릅니다: ${Object.keys(gradeTable).join(',')}`)
const grades = {}
for (const rarity of RARITIES) {
  const rows = gradeTable[rarity]
  if (rows.length !== 10) fail(`${rarity}: 별 ${rows.length}단계`)
  grades[rarity] = rows.map((row, i) => {
    if (row.grade !== i + 1) fail(`${rarity}: 별 순서가 다릅니다.`)
    if (!sameKeys(row.mult, ['atk', 'def', 'hp']) || !sameKeys(row.add, ADD_KEYS)) fail(`${rarity} ★${row.grade}: 항목이 다릅니다.`)
    if (row.mult.atk !== row.mult.hp) fail(`${rarity} ★${row.grade}: 공격력과 체력 증가율이 다릅니다.`)
    // 비율 두 개(치명확률·치명피해)는 1 = 100%, 나머지는 정수 수치다.
    return { atk: row.mult.atk, def: row.mult.def, hp: row.mult.hp, ...Object.fromEntries(ADD_KEYS.map((k) => [k, row.add[k]])) }
  })
}
const addOf = (row) => JSON.stringify(ADD_KEYS.map((k) => row[k]))
for (const rarity of RARITIES)
  grades[rarity].forEach((row, i) => {
    if (addOf(row) !== addOf(grades.C[i])) fail(`${rarity} ★${i + 1}: 추가 능력치가 C 등급과 다릅니다.`)
  })

// 기본 치명확률·치명피해는 모든 쿠키가 같은 값이어야 기본값 하나로 둘 수 있다.
const crit = new Set(cookieRows.map((c) => `${c.cr}/${c.cd}`))
if (crit.size !== 1) fail(`쿠키마다 기본 치명 수치가 다릅니다: ${[...crit].join(', ')}`)
const [cr, cd] = [...crit][0].split('/').map(Number)

const out = {
  _meta: {
    source: EOG_PAGE,
    sourceFile: url.startsWith('http') ? url : 'local bundle',
    fetchedAt: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
    gameBuild: client.build,
    note: '수치는 EOG.GG가 게임 클라이언트에서 읽은 값(개발사 공식 아님). levels: [레벨, 필요 쿠키 경험치, 필요 크럼블 레벨, 공격력·방어력·체력 증가율(만분율)]. grades: 별 1~10의 증가율(1 = 100%)과 추가 능력치(치명 수치는 1 = 100%).',
  },
  maxLevel,
  maxGrade: 10,
  // 명중·회피·집중·저항 기본값 100은 국내 데이터 위키(cc.team-hobby.com)와 공식 도감 페이지(cookieruncrumble.net)의 기본 능력치 표기와 같다.
  base: { critRate: cr / 1e4, critDamage: cd / 1e4, accuracy: 100, avoidance: 100, focus: 100, resist: 100 },
  levels: levelRows,
  grades,
}
await writeFile(join(ROOT, 'public/data/growth.json'), `${JSON.stringify(out)}\n`)
console.log(`저장: public/data/growth.json (레벨 ${levelRows.length}단계, 등급 ${RARITIES.length}종 × 별 10단계, 클라이언트 ${client.build})`)
