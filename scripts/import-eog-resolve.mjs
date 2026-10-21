#!/usr/bin/env node
/**
 * 돌파력 데이터(public/data/resolve.json)를 만든다.
 *
 * - 단계별 최대 Lv와 1레벨당 공격력·방어력·체력: EOG.GG가 게임 클라이언트에서 읽어 공개한 표
 * - 단계별 1레벨 비용(코인): cc.team-hobby.com 돌파력 페이지(국내 데이터 위키)
 * 두 출처가 최대 Lv·상승치를 같게 말하는지 단계마다 대조하고, 하나라도 다르면 멈춘다.
 * 받아 온 JS는 실행하지 않는다.
 *
 * 사용법
 *   node scripts/import-eog-resolve.mjs                         # 두 페이지에서 최신 데이터를 받아 만든다
 *   node scripts/import-eog-resolve.mjs <crc.js> <rushpower.html> # 이미 받아 둔 파일로 만든다
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readLiteralAt, readNamedLiteral } from './js-literal.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EOG_PAGE = 'https://eog.gg/games/cookierun-crumble/'
const CC_PAGE = 'https://cc.team-hobby.com/?p=rushpower'
// 기본 사용자 에이전트로는 cc.team-hobby.com이 403을 돌려준다.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'

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
const ccHtml = process.argv[3] ? await readFile(process.argv[3], 'utf8') : await (await fetch(CC_PAGE, { headers: { 'user-agent': UA } })).text()

// 변수 이름은 빌드마다 바뀌므로 내용의 시작 모양으로 찾는다.
const pattern = '\\[\\{from:1,to:\\d+,levels:\\d+,atk:'
const m = new RegExp(`[,;{\\s]([A-Za-z_$][\\w$]*)=(?=${pattern})`).exec(text) ?? fail('돌파력 표를 찾지 못했습니다.')
const ranges = readNamedLiteral(text, m[1], pattern)

// cc.team-hobby.com 표: [단계, 최대 Lv, 1업 비용(문자열), 공격력 1업, 공격력 최종, 방어력 1업, 방어력 최종, 체력 1업, 체력 최종]
const cm = /var RSTEPS = (?=\[\[)/.exec(ccHtml) ?? fail('cc.team-hobby.com 돌파력 표를 찾지 못했습니다.')
const ccRows = readLiteralAt(ccHtml, cm.index + cm[0].length).value

let expected = 1
for (const r of ranges) {
  if (r.from !== expected || r.to < r.from) fail(`돌파력 구간이 이어지지 않습니다: ${r.from}~${r.to}`)
  expected = r.to + 1
}
const last = ranges.at(-1).to
if (ccRows.length !== last) fail(`단계 수가 다릅니다(EOG ${last}, cc ${ccRows.length}).`)

const cost = ccRows.map((row, index) => {
  const [step, levels, unit, atk, , def, , hp] = row
  const range = ranges.find((r) => step >= r.from && step <= r.to)
  if (step !== index + 1 || !range) fail(`cc ${index + 1}번째 줄의 단계가 맞지 않습니다.`)
  if (levels !== range.levels || atk !== range.atk || def !== range.def || hp !== range.hp) fail(`${step}단계: EOG와 cc의 최대 Lv·상승치가 다릅니다.`)
  const value = Number(unit)
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${step}단계: 비용이 이상합니다(${unit}).`)
  return value
})

const out = {
  _meta: {
    source: `${EOG_PAGE} · ${CC_PAGE}`,
    sourceFile: url.startsWith('http') ? url : 'local bundle',
    fetchedAt: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
    note: '최대 Lv·1레벨 상승치는 EOG.GG 공개 클라이언트 값, 1레벨 비용(코인)은 cc.team-hobby.com 돌파력 표. 두 출처의 최대 Lv·상승치가 단계마다 같은 것을 확인했다.',
  },
  // 같은 최대 Lv·상승치가 이어지는 구간. 공격력·방어력·체력은 1레벨마다 오르는 양이다.
  ranges: ranges.map(({ from, to, levels, atk, def, hp }) => ({ from, to, levels, atk, def, hp })),
  // cost[i] = (i+1)단계에서 능력치 하나를 1레벨 올리는 코인
  cost,
}
await writeFile(join(ROOT, 'public/data/resolve.json'), `${JSON.stringify(out)}\n`)
console.log(`저장: public/data/resolve.json (${last}단계, 구간 ${ranges.length}개)`)
