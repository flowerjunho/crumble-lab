#!/usr/bin/env node
/**
 * 피해 계산기용 보조 데이터(src/data/calc-kits.json)를 만든다.
 *
 * public/data/cookie-db.json의 스킬 피해 모델은 시너지를 받지 않은 상태의 수치만 담는다.
 * 시너지(다발·연타·지속·연쇄)가 한 대상에게 들어가는 타수를 어떻게 바꾸는지는
 * EOG.GG가 게임 클라이언트에서 읽은 스킬 구조(투사체 수·반복 횟수·지속 시간·연쇄 횟수에 붙은 시너지 키)에 있어서,
 * 그 구조에서 숫자만 뽑아 쿠키 → 스킬 부분 → 피해 항목 순서로 정리한다.
 * 같은 번들의 스킬 피해 모델에서 '한 주기 합계에 넣는 부분인지(counted)'와 지속 피해(독 등) 수치도 함께 옮긴다.
 *
 * 받아 온 JS는 실행하지 않고, 데이터 리터럴만 scripts/js-literal.mjs로 읽는다. EOG의 설명문은 가져오지 않는다.
 *
 * 사용법
 *   node scripts/import-eog-calc.mjs            # EOG 페이지에서 최신 번들을 받아 만든다
 *   node scripts/import-eog-calc.mjs <crc.js>   # 이미 받아 둔 크럼블 번들로 만든다
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
const kits = findLiteral('\\{cookie\\d{4}:\\{eid:"cookie\\d{4}",name:"[^"]+",cycleSeconds:', '스킬 피해 모델')
const trees = findLiteral('\\{cookie\\d{4}:\\{skill_', '스킬 구조')

const db = JSON.parse(await readFile(join(ROOT, 'public/data/cookie-db.json'), 'utf8'))

const SYNERGY = new Set(['area', 'dur', 'burst', 'speed', 'hit', 'pierce', 'chain'])
/** {v, k, m}: 기본값 v에 시너지 k의 값 × m을 더하거나(개수) 곱하는(비율) 수치 */
const isLever = (value) => value != null && typeof value === 'object' && !Array.isArray(value) && SYNERGY.has(value.k)
const num = (value) => (isLever(value) ? value.v : value)

/** 스킬 구조에서 key를 가진 노드까지 내려가는 경로(뿌리 포함)를 찾는다. */
function pathTo(node, key, trail = []) {
  const here = [...trail, node]
  if (node.key === key) return here
  for (const child of node.children ?? []) {
    const found = pathTo(child, key, here)
    if (found) return found
  }
  return null
}

const problems = []

/**
 * 피해 항목 하나에 걸린 시너지 레버를 모은다. 한 대상이 맞는 타수를 바꾸는 것만 남긴다.
 * - spawn: 다발 시너지로 한 번에 나가는 투사체 수가 늘어난다. 부채꼴로 퍼지면(fan) 한 대상은 그중 일부만 맞는다.
 * - repeat: 연타 시너지로 하위 공격이 반복되는 횟수의 상한이 늘어난다. cap은 상위 노드 수명 안에 들어가는 최대 횟수다.
 * - ticks: 지속 시너지로 장판·광선의 수명이 늘어나 주기 피해가 더 들어간다.
 * - chain: 연쇄 시너지로 튕기는 횟수가 늘어난다. 한 대상만 있을 때는 더 맞지 않는다.
 * 범위·탄속·관통은 한 대상이 받는 피해를 바꾸지 않아서 넣지 않는다.
 */
function leversFor(path) {
  const levers = []
  path.forEach((node, depth) => {
    const parent = depth > 0 ? path[depth - 1] : null
    const own = depth === path.length - 1
    if (isLever(node.spawnCount) && node.spawnCount.k === 'burst') {
      levers.push({ key: 'burst', kind: 'spawn', base: node.spawnCount.v, m: node.spawnCount.m, fan: Boolean(node.spread) && !node.summon })
    }
    const max = node.spawn?.max
    const once = node.spawn?.on === 'OnStart' || node.spawn?.on === 'OnDestroy'
    if (isLever(max) && max.k === 'hit' && !once) {
      const life = num(parent?.life)
      const cap = node.cooldown && life ? Math.max(1, Math.floor(Math.max(0, life - (node.spawn.delay ?? 0)) / node.cooldown + 1e-9) + 1) : null
      levers.push({ key: 'hit', kind: 'repeat', base: max.v, m: max.m, cap })
    }
    if (own && isLever(node.life) && node.life.k === 'dur' && node.period && !node.limited) {
      levers.push({ key: 'dur', kind: 'ticks', life: node.life.v, period: node.period, m: node.life.m })
    }
    if (isLever(node.chain?.count) && node.chain.count.k === 'chain') {
      levers.push({ key: 'chain', kind: 'chain', base: node.chain.count.v, m: node.chain.count.m })
    }
  })
  return levers
}

const out = {}
for (const cookie of db.cookies) {
  const kit = kits[cookie.eid] ?? fail(`스킬 피해 모델이 없는 쿠키: ${cookie.name.ko}`)
  const tree = trees[cookie.eid] ?? {}
  if (kit.roots.length !== cookie.skill.parts.length) problems.push(`${cookie.name.ko}: 스킬 부분 수가 쿠키 도감과 다릅니다.`)
  const parts = kit.roots.map((root, p) => {
    const damage = root.damage ?? []
    if (damage.length !== (cookie.skill.parts[p]?.hits.length ?? -1)) problems.push(`${cookie.name.ko}: ${root.key} 피해 항목 수가 쿠키 도감과 다릅니다.`)
    const top = tree[root.key]
    const hits = damage.map((hit) => {
      const path = top ? pathTo(top, hit.key) : null
      if (!path) problems.push(`${cookie.name.ko}: 스킬 구조에서 ${hit.key}를 찾지 못했습니다.`)
      return path ? leversFor(path) : []
    })
    return { counted: root.counted !== false, hits }
  })
  const dots = (kit.dots ?? []).map((dot) => {
    const p = kit.roots.findIndex((root) => root.key === dot.root)
    const h = p < 0 ? -1 : (kit.roots[p].damage ?? []).findIndex((hit) => hit.key === dot.key)
    if (h < 0) problems.push(`${cookie.name.ko}: 지속 피해 ${dot.key}의 위치를 찾지 못했습니다.`)
    for (const field of ['cooldown', 'value', 'maxStack', 'duration', 'tick']) if (typeof dot[field] !== 'number') problems.push(`${cookie.name.ko}: 지속 피해 ${field} 값이 숫자가 아닙니다.`)
    return {
      part: p,
      hit: h,
      cooldown: dot.cooldown,
      value: dot.value,
      maxStack: dot.maxStack,
      duration: dot.duration,
      tick: dot.tick,
      apps: [dot.appsMin, dot.appsMax],
      coef: [dot.coefMin, dot.coefMax],
    }
  })
  out[cookie.eid] = { parts, dots }
}

if (problems.length) fail(`계산기 데이터를 맞추지 못했습니다:\n- ${problems.join('\n- ')}`)

const file = {
  _meta: {
    source: EOG_PAGE,
    sourceFile: url,
    fetchedAt: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
    note: '수치는 EOG.GG가 게임 클라이언트에서 읽은 스킬 구조에서 뽑았다(개발사 공식 아님). parts·hits 순서는 cookie-db.json의 skill.parts·hits와 같다.',
  },
  kits: out,
}
await writeFile(join(ROOT, 'src/data/calc-kits.json'), `${JSON.stringify(file)}\n`)
const leverCount = Object.values(out).reduce((sum, kit) => sum + kit.parts.reduce((s, part) => s + part.hits.reduce((t, levers) => t + levers.length, 0), 0), 0)
console.log(`저장: src/data/calc-kits.json (쿠키 ${Object.keys(out).length}종, 시너지 레버 ${leverCount}개)`)
