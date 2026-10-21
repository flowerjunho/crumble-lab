#!/usr/bin/env node
/**
 * 전투 시뮬레이터·던전 시뮬레이터가 쓰는 전투 데이터(public/data/sim.json)를 만든다.
 *
 * 담는 것(모두 EOG.GG가 게임 클라이언트에서 읽어 공개한 수치)
 *   - lineup   : 12칸 출전 배치 좌표(길드 토벌전 배치)와 메인 스테이지 보스 위치
 *   - dungeon  : 크럼블 던전(황금갓방울) 보스 능력치·단계 표·공격 패턴·보스 강화·소환되는 황금 방울 능력치와 공격 방식, 40칸 배치
 *   - guild    : 길드 토벌전(지나치게 무거워진 피냐타) 보스 능력치·단계별 피해 감소·공격 시간표·소환되는 적 능력치와 공격 방식
 *   - skills   : 쿠키 스킬마다 쿨타임·시전 동작 시간·투사체 나무(생성 수·지속·주기·피해 계수와 시너지 배율)
 *   - defaults : 시뮬레이션 기본 레벨·별, 몸통 크기
 *
 * EOG가 직접 쓴 설명문(note·offsets·travel·openQuestions 같은 문장)과 계산 코드는 가져오지 않는다.
 * 받아 온 JS는 실행하지 않고, 데이터 리터럴만 읽는다.
 *
 * 사용법
 *   node scripts/import-eog-sim.mjs            # EOG 페이지에서 최신 번들을 받아 만든다
 *   node scripts/import-eog-sim.mjs <crc.js>   # 이미 받아 둔 크럼블 번들로 만든다
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

// 변수 이름은 빌드마다 바뀌므로, 리터럴이 시작하는 모양(내용)으로 이름을 찾은 뒤 읽는다.
function literal(label, pattern) {
  const m = new RegExp(`[,;{\\s]([A-Za-z_$][\\w$]*)=(?=${pattern})`).exec(text) ?? fail(`${label}을(를) 찾지 못했습니다.`)
  return readNamedLiteral(text, m[1], pattern)
}

const arena = literal('던전 배치(보스 위치·40칸)', '\\{bossPos:\\{x:')
const dungeonPhases = literal('던전 단계 표', '\\[\\{phase:1,opensAt:')
const dungeonTiming = literal('던전 패턴 시각', '\\{spiralAt:')
const dungeonAttacks = literal('던전 보스 공격 배율', '\\{spiral:\\{damageMultiplier:')
const spiral = literal('나선 탄막 모양', '\\{emitters:\\[\\{dir:')
const dungeonBoss = literal('황금갓방울 능력치', '\\{name:"Holy Golden Drop",atk:')
const dungeonLimit = literal('던전 제한 시간', '\\{timeLimit:\\d+,openQuestions:')
const bossBuffs = literal('던전 보스 강화', '\\{sources:\\[\\{tier:1,appliesAt:')
const dungeonAdds = literal('황금 방울 능력치', '\\{soldier1:\\{name:')
const dungeonAddAttacks = literal('황금 방울 공격 방식', '\\{soldier:\\{form:')
const guildBoss = literal('피냐타 보스', '\\{name:"Extra-Stuffed Pi')
const guildTimeline = literal('피냐타 공격 시간표', '\\[\\{t:[\\d.]+,kind:"gift"')
const guildAdds = literal('피냐타 소환 적', '\\{pinataMinion:\\{name:')
const guildAddAttacks = literal('피냐타 소환 적 공격', '\\{pinataMinion:\\{cooldown:')
const guildPower = literal('길드 토벌전 전투력 배율', '\\{recommendedPower:\\d+,powerLadder:')
const simDefaults = literal('시뮬레이션 기본값', '\\{build:\\{level:')
const kits = literal('쿠키 스킬 요약', '\\{cookie\\d+:\\{eid:"cookie\\d+",name:"[^"]+",cycleSeconds:')
const trees = literal('쿠키 스킬 투사체 나무', '\\{cookie\\d+:\\{skill_')

// ---------- 모양 확인: 바뀌었으면 조용히 틀린 값을 내보내지 않고 멈춘다 ----------
const num = (value, label) => (typeof value === 'number' && Number.isFinite(value) ? value : fail(`${label}이(가) 숫자가 아닙니다: ${JSON.stringify(value)}`))
const slot = (s, label) => ({ slot: num(s.slot, `${label}.slot`), x: num(s.x, `${label}.x`), z: num(s.z, `${label}.z`) })
if (arena.slots?.length !== 40) fail(`던전 배치 칸이 40개가 아닙니다: ${arena.slots?.length}`)
if (guildBoss.slots?.length !== 12) fail(`길드 토벌전 배치 칸이 12개가 아닙니다: ${guildBoss.slots?.length}`)
if (dungeonPhases.length < 1 || !dungeonPhases.every((p) => typeof p.opensAt === 'number' && Array.isArray(p.carriers))) fail('던전 단계 표 모양이 바뀌었습니다.')
const ADD_KIND = /^(soldier|mage|golem)\d+$/
const addTiers = Object.keys(dungeonAdds).filter((key) => ADD_KIND.test(key))
if (!addTiers.length) fail('황금 방울 능력치가 비어 있습니다.')
for (const p of dungeonPhases) for (const tier of [p.strikeTier, ...p.carriers.map((c) => c.tier)]) if (!dungeonAdds[tier]) fail(`단계 표가 모르는 방울을 부릅니다: ${tier}`)
const KINDS = new Set(['gift', 'addSpawn', 'wave', 'blast'])
for (const e of guildTimeline) if (!KINDS.has(e.kind)) fail(`피냐타 공격 시간표에 모르는 종류가 있습니다: ${e.kind}`)

// ---------- 정리 ----------
const pickNum = (obj, keys, label) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, num(obj[k], `${label}.${k}`)]))

// 황금 방울: 이름 대신 종류(soldier·mage·golem)와 능력치만 남긴다. 국내 이름은 화면에서 붙인다.
const adds = Object.fromEntries(
  addTiers.map((tier) => {
    const a = dungeonAdds[tier]
    return [tier, { ...pickNum(a, ['hp', 'atk', 'def', 'range', 'hitRadius', 'speed', 'life'], tier), ccImmune: Boolean(a.immune?.knockBack && a.immune?.airborne) }]
  }),
)
const ATTACK_KEYS = ['cooldown', 'damageMultiplier', 'attackRange', 'radius', 'hitCountLimit', 'knockBack', 'airborne', 'projectileSpeed']
const addAttacks = Object.fromEntries(
  ['soldier', 'mage', 'golem'].map((kind) => {
    const a = dungeonAddAttacks[kind] ?? fail(`황금 방울 공격 방식이 없습니다: ${kind}`)
    return [kind, pickNum({ ...a, hitCountLimit: a.hitCountLimit ?? undefined }, ATTACK_KEYS, kind)]
  }),
)

const dungeon = {
  boss: { ...pickNum(dungeonBoss, ['atk', 'def', 'hitRadius', 'avoidance', 'resist'], 'boss'), ccImmune: Boolean(dungeonBoss.immune?.actionControl) },
  timeLimit: num(dungeonLimit.timeLimit, 'timeLimit'),
  bossPos: { x: num(arena.bossPos.x, 'bossPos.x'), z: num(arena.bossPos.z, 'bossPos.z') },
  slots: arena.slots.map((s, i) => slot(s, `slots[${i}]`)),
  phases: dungeonPhases.map((p) => ({
    phase: num(p.phase, 'phase'),
    opensAt: num(p.opensAt, 'opensAt'),
    strikes: num(p.strikes, 'strikes'),
    strikeTier: p.strikeTier,
    strikeGroups: p.strikeGroups.map((g) => pickNum(g, ['dx', 'dz', 'count', 'scatter'], 'group')),
    carriers: p.carriers.map((c) => ({ at: num(c.at, 'carrier.at'), tier: c.tier, groups: c.groups.map((g) => pickNum(g, ['dx', 'dz', 'count', 'scatter'], 'group')) })),
  })),
  timing: pickNum(dungeonTiming, ['spiralAt', 'lightningAt', 'firstStrikeDelay', 'strikeInterval', 'shockwaveCarrierAt', 'carrierToHit'], 'timing'),
  attacks: {
    spiral: pickNum(dungeonAttacks.spiral, ['damageMultiplier', 'knockBack'], 'spiral'),
    lightning: pickNum(dungeonAttacks.lightning, ['strikeRadius', 'damageMultiplier', 'knockBack', 'airborneDuration'], 'lightning'),
    shockwave: pickNum(dungeonAttacks.shockwave, ['radius', 'damageMultiplier', 'knockBack', 'airborneDuration'], 'shockwave'),
  },
  spiral: {
    emitters: spiral.emitters.map((e) => ({ startAngleDeg: num(e.startAngleDeg, 'startAngleDeg'), rotationSpeed: num(e.rotationSpeed, 'rotationSpeed') })),
    ...pickNum(spiral, ['firstBulletAt', 'bulletInterval', 'bulletsEmitted', 'bulletSpeed', 'bulletReach', 'bulletRadius', 'angularStepDeg'], 'spiral'),
  },
  bossBuffs: bossBuffs.sources.map((s) => pickNum(s, ['tier', 'appliesAt', 'dr', 'atkMultiplier', 'maxStack'], 'bossBuff')),
  adds,
  addAttacks,
}

const guild = {
  boss: {
    element: String(guildBoss.element).toLowerCase(),
    ...pickNum(guildBoss, ['atk', 'def', 'avoidance', 'hitRadius'], 'guild'),
    ccImmune: Boolean(guildBoss.ccImmune),
  },
  bossPos: { x: num(guildBoss.position.x, 'position.x'), z: num(guildBoss.position.z, 'position.z') },
  timeLimit: num(guildBoss.timeLimit, 'guild.timeLimit'),
  powerMultiplier: num(guildPower.powerMultiplier, 'powerMultiplier'),
  phases: guildBoss.phases.map((p) => ({ ...pickNum(p, ['start', 'drStart', 'dr', 'atkMult'], 'guild.phase'), inTime: Boolean(p.inTime) })),
  timeline: guildTimeline.map((e) => {
    const base = { t: num(e.t, 't'), kind: e.kind, phase: num(e.phase, 'phase') }
    if (e.kind === 'addSpawn') return { ...base, tier: e.tier, groups: e.groups.map((g) => pickNum(g, ['dx', 'dz', 'count', 'scatter'], 'group')) }
    return { ...base, ...pickNum(e, ['damageMultiplier', 'radius', 'pickLimit', 'hits', 'knockBack', 'airborne'], e.kind), targeting: e.targeting ?? null }
  }),
  adds: Object.fromEntries(Object.entries(guildAdds).map(([tier, a]) => [tier, pickNum(a, ['hp', 'atk', 'def', 'hitRadius', 'speed', 'life'], tier)])),
  addAttack: {
    ...pickNum(guildAddAttacks.pinataMinion, ['cooldown', 'damageMultiplier', 'attackRange', 'knockBack', 'airborne'], 'minion'),
    opener: pickNum(guildAddAttacks.pinataMinion.opener ?? {}, ['attackRange', 'damageMultiplier', 'knockBack', 'airborne'], 'opener'),
  },
}

const lineup = {
  bossPos: dungeon.bossPos,
  slots: guildBoss.slots.map((s, i) => slot(s, `guild.slots[${i}]`)),
}

// 시너지로 바뀌는 값은 {v, k, m}(기본값, 시너지 종류, 한 단계당 배율)로 그대로 둔다.
const scaled = (value) => {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number') return value
  if (Array.isArray(value)) return value
  if (typeof value === 'object' && 'v' in value) return { v: value.v, k: value.k, m: value.m ?? 1 }
  fail(`시너지 배율 모양이 바뀌었습니다: ${JSON.stringify(value)}`)
}
// 투사체 나무에서 피해 계산에 쓰는 값만 남긴다(회전·크기 같은 모양 정보는 버린다).
function node(n) {
  const out = { key: n.key }
  const put = (k, v) => v !== undefined && (out[k] = v)
  put('dmg', n.dmg)
  put('heal', n.heal === true ? true : undefined)
  put('relation', n.relation)
  put('spawnCount', scaled(n.spawnCount))
  put('life', scaled(n.life))
  put('period', n.period)
  put('calc', n.calc)
  put('limited', n.limited)
  put('limit', n.limit)
  put('hits', scaled(n.hits))
  put('radius', scaled(n.radius))
  // 부채꼴로 퍼지는 여러 발은 대상 하나에 한 발만 닿는다.
  if (n.spread && !n.summon) {
    // 부채꼴 정보: 대상 위치에 바로 생기면(target) 모두 맞고, 움직이며 도는 탄이거나 각도가 없으면(single) 한 발만,
    // 그 밖에는(spread) 각도 안에 고르게 퍼져서 대상의 크기만큼 맞는다고 본다.
    const aimed = n.rot === 'TowardTarget' || n.rot === 'Inherit'
    const at = n.pos === 'OpponentPosition' ? 'target' : !n.spread.angle || n.move || !aimed ? 'single' : 'spread'
    put('fan', { angle: n.spread.angle ?? 0, at, centered: n.spread.type === 'UniformCentered' })
  }
  put('dot', n.dot)
  put('cooldown', n.cooldown)
  put('summonAtk', n.summon?.atk)
  put('allowed', n.allowed)
  put('banned', n.banned)
  if (n.spawn) put('spawn', { on: n.spawn.on, delay: n.spawn.delay, max: scaled(n.spawn.max) })
  if (n.children?.length) out.children = n.children.map(node)
  return out
}

const skills = {}
for (const [eid, kit] of Object.entries(kits)) {
  const tree = trees[eid] ?? fail(`${eid}: 투사체 나무가 없습니다.`)
  skills[eid] = kit.roots.map((root) => {
    const t = tree[root.key] ?? fail(`${eid}: ${root.key} 나무가 없습니다.`)
    return {
      key: root.key,
      // 스스로 시전하지 않는 가지(쓰러질 때만 나오는 소환 등)는 쿨타임이 없다. 0으로 두고 counted로 거른다.
      cooldown: root.counted ? num(root.cooldown, `${eid}.cooldown`) : (root.cooldown ?? 0),
      effectiveCooldown: root.counted ? num(root.effectiveCooldown, `${eid}.effectiveCooldown`) : (root.effectiveCooldown ?? 0),
      anim: root.anim ? num(root.anim.duration, `${eid}.anim`) : 0,
      counted: Boolean(root.counted),
      support: Boolean(root.support),
      // 피해 계수 합(시너지 없음). 우리 나무 계산이 맞는지 시험에서 맞춰 본다.
      coef: num(root.coefPerCycleMin, `${eid}.coef`),
      targeting: root.targeting ? { rule: root.targeting.searchRule ?? null, ally: root.targeting.relation === 'Ally', synergy: root.targeting.synergyFilter ?? null, range: root.targeting.range ?? null } : null,
      tree: node(t),
    }
  })
}
if (Object.keys(skills).length < 70) fail(`쿠키 스킬 수가 너무 적습니다: ${Object.keys(skills).length}`)

const out = {
  _meta: {
    source: EOG_PAGE,
    sourceFile: url.startsWith('http') ? url : 'local bundle',
    fetchedAt: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
    note: 'EOG.GG가 게임 클라이언트에서 읽어 공개한 전투 수치(개발사 공식 아님). 좌표 단위는 게임 거리, 시간은 초. 배율은 1 = 공격력 100%. EOG 설명문·계산 코드는 포함하지 않는다.',
  },
  defaults: { level: num(simDefaults.build.level, 'level'), grade: num(simDefaults.build.grade, 'grade'), bossBody: num(simDefaults.bodies.boss, 'boss body'), smallBody: num(simDefaults.bodies.small, 'small body') },
  lineup,
  dungeon,
  guild,
  skills,
}
await writeFile(join(ROOT, 'public/data/sim.json'), `${JSON.stringify(out)}\n`)
console.log(`저장: public/data/sim.json (쿠키 ${Object.keys(skills).length}명, 던전 단계 ${dungeon.phases.length}개, 토벌전 시간표 ${guild.timeline.length}개)`)
