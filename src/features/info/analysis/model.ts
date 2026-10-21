import type { CookieEffect, CookieEntry, CookieRole, PetEntry, SynergyKey } from '../../../types'
import { petAffectsCookie } from '../../../lib/petLabels'
import { battleStats, synergyFor, teamSynergy, type Loadout, type SynergySteps } from '../calc/damage'
import { cookieStats, type GrowthData } from '../growth/growth'
import { cookieDps, critFactor, defShredGain, effectiveHp, type Attacker, type Scenario } from './dps'

/**
 * 크럼블 정보 '티어'·'추천 편성' 화면의 계산. 모두 우리 기준으로 게임 데이터에서 직접 계산하고,
 * 다른 사이트의 티어표·추천은 쓰지 않는다. 화면에 보여 주는 설명과 같은 가정을 여기에 모아 둔다.
 *
 * 공통 가정
 * - 기준 육성: 모든 쿠키를 같은 레벨·별로 맞추고 장비·펫·슈가룬은 끼우지 않는다.
 * - 버프 가동률 = min(1, 지속 시간 ÷ 재사용 대기시간) × 적용 확률
 * - 팀 버프는 받는 쿠키마다 '그 쿠키의 초당 피해가 몇 % 늘어나는지'로 바꿔서 더한다(같은 종류끼리 곱하지 않고 더한다).
 * - 쿠키 한 명의 피해·시너지·펫은 피해 계산기와 같은 모델(calc/damage.ts)로 구한다. 방어력 감소는 그 모델의 방어 배율에
 *   기준 적 방어력 500을 넣어 피해 증가율로 바꾼다.
 */

export const TEAM_SIZE = 12
export const REF_ENEMY_DEF = 500

export interface RefBuild {
  level: number
  grade: number
}

export const DEFAULT_BUILD: RefBuild = { level: 120, grade: 5 }

export const attackerOf = (growth: GrowthData, cookie: CookieEntry, build: RefBuild): Attacker => {
  const s = cookieStats(growth, cookie, build.level, build.grade)
  return { atk: s.atk, critRate: s.critRate, critDamage: s.critDamage, skillAmp: 0, bossDamage: 0, haste: 0 }
}

// ───────────────────────── 등급 나누기 ─────────────────────────

export type Tier = 'S' | 'A' | 'B' | 'C'
/** 위에서부터 누적 비율: 상위 10%는 S, 30%까지 A, 60%까지 B, 나머지 C */
export const TIER_CUTOFFS: [Tier, number][] = [
  ['S', 0.1],
  ['A', 0.3],
  ['B', 0.6],
  ['C', 1],
]

/** 점수 내림차순으로 정렬된 목록에서 순위(0부터)로 등급을 정한다. */
export function tierOf(rank: number, count: number): Tier {
  const top = (rank + 1) / Math.max(1, count)
  return TIER_CUTOFFS.find(([, cut]) => top <= cut + 1e-9)?.[0] ?? 'C'
}

export interface Ranked<T> {
  item: T
  score: number
  rank: number
  tier: Tier
}

/**
 * 점수가 높은 순으로 정렬하고 백분위 등급을 붙인다. 점수가 0 이하인 항목은 등급을 매기지 않고 뺀다.
 * 점수가 같으면(기본 능력치가 같은 방어형 SSR 등) 같은 순위·같은 등급을 준다.
 */
export function rankBy<T>(items: T[], score: (item: T) => number): Ranked<T>[] {
  const scored = items.map((item) => ({ item, score: score(item) })).filter((x) => x.score > 0)
  scored.sort((a, b) => b.score - a.score)
  const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a))
  let rank = 0
  return scored.map((x, i) => {
    if (i > 0 && !same(x.score, scored[i - 1]!.score)) rank = i
    return { ...x, rank, tier: tierOf(rank, scored.length) }
  })
}

// ───────────────────────── 효과 하나의 가치 ─────────────────────────

/** 버프·디버프가 다시 걸리는 간격. 지원용 스킬 줄기가 따로 있으면 그 줄기의 재사용 대기시간을 쓴다. */
export function effectCycle(cookie: CookieEntry): number {
  const support = cookie.skill.parts.find((p) => p.support)
  return support?.effectiveCooldown || cookie.skill.cycleSeconds
}

export function uptime(effect: CookieEffect, cycle: number): number {
  const base = effect.lifetime === 'permanent' ? 1 : effect.duration && cycle > 0 ? Math.min(1, effect.duration / cycle) : 0
  return base * effect.applyRate
}

const isAllyTarget = (e: CookieEffect) => e.target === 'ally' || e.target === 'allies'
const isEnemyTarget = (e: CookieEffect) => e.target === 'enemy' || e.target === 'enemies'

/** 팀에서 이 효과를 받는 아군 수(자신 포함 여부 반영). 한 명 대상 버프는 1명이다. */
export function receivers(effect: CookieEffect, teamSize = TEAM_SIZE): number {
  if (effect.target === 'ally') return Math.min(effect.maxTargets ?? 1, teamSize - 1)
  const pool = effect.excludeCaster ? teamSize - 1 : teamSize
  return Math.min(effect.maxTargets ?? pool, pool)
}

/**
 * 버프·디버프 하나가 받는 쿠키(공격자 a)의 초당 피해를 몇 % 올리는지(가동률은 곱하지 않은 값).
 * 피해와 관계없는 효과는 0이다.
 */
export function offenseGain(effect: CookieEffect, a: Attacker, casterAtk: number, scenario: Scenario): number {
  if (effect.kind !== 'stat' || !effect.property || effect.value == null) return 0
  const v = effect.value
  const crit = critFactor(a.critRate, a.critDamage)
  if (isAllyTarget(effect)) {
    switch (effect.property) {
      case 'atk':
        return effect.valueBase === 'CastersAttackPoint' ? (v * casterAtk) / Math.max(1, a.atk) : v
      case 'critRate':
        return (v * a.critDamage) / crit
      case 'critDamage':
        return (v * Math.max(0, a.critRate)) / crit
      case 'skillAmp':
        return v / (1 + a.skillAmp)
      case 'bossDamage':
        return scenario === 'boss' ? v / (1 + a.bossDamage) : 0
      default:
        return 0
    }
  }
  if (isEnemyTarget(effect) && effect.property === 'def' && v < 0) return defShredGain(-v, REF_ENEMY_DEF)
  return 0
}

/**
 * 아군이 받는 피해를 몇 % 줄이는지를 '버틸 수 있는 피해량'의 증가율로 바꾼다(가동률 미적용).
 * 받는 피해 감소, 아군 방어력 증가, 적 공격력 감소가 해당한다.
 */
export function defenseGain(effect: CookieEffect, allyDef: number): number {
  if (effect.kind !== 'stat' || effect.value == null) return 0
  if (isAllyTarget(effect) && effect.property === 'def' && effect.value > 0) return effectiveHp(1, allyDef * (1 + effect.value)) / effectiveHp(1, allyDef) - 1
  if (isAllyTarget(effect) && effect.property === 'damageTaken' && effect.calcType === 'screen' && effect.value > 0) return 1 / (1 - Math.min(0.95, effect.value)) - 1
  if (isEnemyTarget(effect) && effect.property === 'atk' && effect.value < 0) return 1 / (1 - Math.min(0.95, -effect.value)) - 1
  return 0
}

// ───────────────────────── 쿠키별 지표 ─────────────────────────

export interface CookieMetrics {
  cookie: CookieEntry
  attacker: Attacker
  hp: number
  def: number
  /** 혼자일 때 초당 피해(스테이지·보스전) */
  dps: Record<Scenario, number>
  /** 팀 버프 가치: 아군 한 명 한 명이 얻는 피해 증가율 × 가동률을 팀 전체로 더한 값(1 = 쿠키 한 명분 100%) */
  teamOffense: number
  /** 팀 보호 가치: 아군이 버티는 피해량 증가율 × 가동률을 팀 전체로 더한 값 */
  teamDefense: number
  /** 보호막: 1초에 팀 전체에 씌우는 보호막 양(체력 기준) */
  shieldPerSecond: number
  /** 기절·변이 가동률(0~1, 여러 개면 더한 값) */
  control: number
  /** 버틸 수 있는 피해량: 체력 ÷ 방어 배율 */
  durability: number
}

/** 버프를 받는 쪽은 같은 기준 육성의 '평균적인 아군'으로 본다(치명 수치는 육성에서 정해진다). */
export function cookieMetrics(growth: GrowthData, cookie: CookieEntry, build: RefBuild, reference: Attacker, referenceDef: number): CookieMetrics {
  const attacker = attackerOf(growth, cookie, build)
  const s = cookieStats(growth, cookie, build.level, build.grade)
  const cycle = effectCycle(cookie)
  let teamOffense = 0
  let teamDefense = 0
  let shieldPerSecond = 0
  let control = 0
  for (const e of cookie.effects) {
    const up = uptime(e, cycle)
    if (isAllyTarget(e)) {
      teamOffense += offenseGain(e, reference, attacker.atk, 'stage') * up * receivers(e)
      teamDefense += defenseGain(e, referenceDef) * up * receivers(e)
      if (e.kind === 'shield' && e.value != null) {
        const base = e.valueBase === 'CastersAttackPoint' ? attacker.atk : s.hp
        shieldPerSecond += (e.value * base * receivers(e) * e.applyRate) / Math.max(0.1, cycle)
      }
    } else if (isEnemyTarget(e)) {
      // 적에게 거는 약화는 같은 적을 때리는 팀 전체가 득을 본다.
      teamOffense += offenseGain(e, reference, attacker.atk, 'stage') * up * TEAM_SIZE
      teamDefense += defenseGain(e, referenceDef) * up * TEAM_SIZE
      if (e.kind === 'stun' || e.kind === 'transform') control += up
    }
  }
  return {
    cookie,
    attacker,
    hp: s.hp,
    def: s.def,
    dps: { stage: cookieDps(cookie, attacker, 'stage'), boss: cookieDps(cookie, attacker, 'boss') },
    teamOffense,
    teamDefense,
    shieldPerSecond,
    control,
    durability: effectiveHp(s.hp, s.def),
  }
}

/** 버프를 받는 쪽의 기준: 같은 육성 상태의 사격형 SSR 쿠키 평균 치명 수치 */
export function referenceAttacker(growth: GrowthData, cookies: CookieEntry[], build: RefBuild): Attacker {
  const pool = cookies.filter((c) => c.rarity === 'SSR' && c.role === 'ranged')
  const list = (pool.length ? pool : cookies).map((c) => attackerOf(growth, c, build))
  const avg = (f: (a: Attacker) => number) => list.reduce((t, a) => t + f(a), 0) / Math.max(1, list.length)
  return { atk: avg((a) => a.atk), critRate: avg((a) => a.critRate), critDamage: avg((a) => a.critDamage), skillAmp: 0, bossDamage: 0, haste: 0 }
}

/** 버프를 받는 쪽의 기준 방어력: 같은 육성 상태의 모든 쿠키 평균 */
export function referenceDef(growth: GrowthData, cookies: CookieEntry[], build: RefBuild): number {
  if (!cookies.length) return 0
  return cookies.reduce((t, c) => t + cookieStats(growth, c, build.level, build.grade).def, 0) / cookies.length
}

/** 지원 점수: 팀 버프 가치 + 팀 보호 가치의 절반(피해를 늘리는 쪽을 더 무겁게 본다) */
export const supportScore = (m: CookieMetrics) => m.teamOffense + m.teamDefense * 0.5 + m.control

// ───────────────────────── 시너지 공급원 ─────────────────────────

export interface SynergySupply {
  provider: CookieEntry
  key: SynergyKey
  /** 이 시너지를 받는 다른 쿠키 수 */
  receivers: number
  uptime: number
  /** 받는 쿠키 수 × 가동률 */
  score: number
}

/** 쿠키가 스킬로 아군에게 주는 시너지마다, 그 시너지를 받는 쿠키가 몇 명인지 센다. */
export function synergySupply(cookies: CookieEntry[]): SynergySupply[] {
  const out: SynergySupply[] = []
  for (const provider of cookies) {
    const cycle = effectCycle(provider)
    for (const e of provider.effects) {
      if (e.kind !== 'synergy' || !e.property || !isAllyTarget(e)) continue
      const key = e.property as SynergyKey
      const count = cookies.filter((c) => c !== provider && c.synergy.receives.includes(key)).length
      const up = uptime(e, cycle)
      out.push({ provider, key, receivers: count, uptime: up, score: count * up })
    }
  }
  return out.sort((a, b) => b.score - a.score)
}

// ───────────────────────── 편성 ─────────────────────────

export interface TeamRow {
  cookie: CookieEntry
  /** 팀 시너지를 받은 상태의 초당 피해(버프 전) */
  base: number
  /** 팀 버프로 늘어난 비율(1 = +100%) */
  buff: number
  /** 받는 시너지 값(피해 모델 단위) */
  synergy: SynergySteps
  /** 채워진 시너지 수 */
  synergies: number
  final: number
}

export interface TeamResult {
  members: CookieEntry[]
  rows: TeamRow[]
  total: number
  /** 받는 시너지 칸 가운데 채워진 수 / 전체 */
  coverage: [covered: number, wanted: number]
}

export interface TeamContext {
  growth: GrowthData
  build: RefBuild
  scenario: Scenario
}

/** 편성 탐색 중에 같은 계산(쿠키 × 받는 시너지)이 수없이 되풀이되므로 맥락마다 결과를 기억해 둔다. */
const dpsCache = new WeakMap<TeamContext, Map<string, number>>()
function cachedDps(cookie: CookieEntry, a: Attacker, synergy: SynergySteps, ctx: TeamContext): number {
  let cache = dpsCache.get(ctx)
  if (!cache) dpsCache.set(ctx, (cache = new Map()))
  const key = `${cookie.eid}|${JSON.stringify(synergy)}`
  let value = cache.get(key)
  if (value === undefined) cache.set(key, (value = cookieDps(cookie, a, ctx.scenario, { synergy })))
  return value
}

/**
 * 편성 전체의 초당 피해.
 * - 시너지: 피해 계산기의 팀 시너지 규칙(가장 강한 공급원 하나, 가동률·인원 제한 반영)으로 받는 값을 정하고 피해 모델에 넘긴다.
 * - 버프·디버프: 받는 확률(받는 인원 ÷ 팀 인원)과 가동률을 곱해 피해 증가율로 더한다.
 */
export function teamDps(members: CookieEntry[], ctx: TeamContext): TeamResult {
  const n = members.length
  const attackers = new Map(members.map((c) => [c, attackerOf(ctx.growth, c, ctx.build)]))
  const synergyRows = teamSynergy(members)
  let covered = 0
  let wanted = 0
  const rows = members.map((cookie) => {
    const a = attackers.get(cookie)!
    let buff = 0
    for (const giver of members) {
      const cycle = effectCycle(giver)
      const casterAtk = attackers.get(giver)!.atk
      for (const e of giver.effects) {
        if (e.target === 'self') continue
        const up = uptime(e, cycle)
        if (isAllyTarget(e)) {
          if (giver === cookie && (e.excludeCaster || e.target === 'ally')) continue
          // 몇 명만 받는 버프는 받는 확률(인원 ÷ 팀 인원)로 나눠 준다.
          const share = n <= 1 ? 1 : Math.min(1, receivers(e, n) / (e.excludeCaster || e.target === 'ally' ? n - 1 : n))
          buff += offenseGain(e, a, casterAtk, ctx.scenario) * up * share
        } else if (isEnemyTarget(e)) {
          buff += offenseGain(e, a, casterAtk, ctx.scenario) * up
        }
      }
    }
    const synergy = synergyFor(cookie, synergyRows)
    const synergies = Object.keys(synergy).length
    wanted += cookie.synergy.receives.length
    covered += synergies
    const base = cachedDps(cookie, a, synergy, ctx)
    return { cookie, base, buff, synergy, synergies, final: base * (1 + buff) }
  })
  return { members, rows, total: rows.reduce((t, r) => t + r.final, 0), coverage: [covered, wanted] }
}

export interface TeamRules {
  /** 역할별 최소 인원 */
  minRoles: Partial<Record<CookieRole, number>>
  /** 이 등급만 쓸 수 있다(비어 있으면 모두) */
  rarities?: string[]
  size?: number
}

const roleCount = (team: CookieEntry[], role: CookieRole) => team.filter((c) => c.role === role).length

/** 남은 칸으로 최소 인원 조건을 채울 수 있는지 */
function feasible(team: CookieEntry[], rules: TeamRules, size: number): boolean {
  const need = Object.entries(rules.minRoles).reduce((t, [role, min]) => t + Math.max(0, (min ?? 0) - roleCount(team, role as CookieRole)), 0)
  return need <= size - team.length
}

const meetsRules = (team: CookieEntry[], rules: TeamRules) =>
  Object.entries(rules.minRoles).every(([role, min]) => roleCount(team, role as CookieRole) >= (min ?? 0))

/**
 * 우리 편성 알고리즘.
 * 1. 빈 편성에서 시작해 '넣었을 때 팀 초당 피해가 가장 많이 느는 쿠키'를 한 명씩 넣는다(역할 최소 인원은 지킨다).
 * 2. 다 채운 뒤, 한 명을 밖의 쿠키와 바꿔서 팀 피해가 늘면 바꾸는 일을 더 나아지지 않을 때까지 되풀이한다.
 * 버프 담당은 혼자서는 피해가 낮아도 다른 쿠키의 피해를 올리므로 1단계·2단계에서 자연스럽게 뽑힌다.
 */
export function buildTeam(pool: CookieEntry[], rules: TeamRules, ctx: TeamContext): TeamResult {
  const size = rules.size ?? TEAM_SIZE
  const candidates = pool.filter((c) => !rules.rarities?.length || rules.rarities.includes(c.rarity))
  const team: CookieEntry[] = []
  while (team.length < size) {
    let best: CookieEntry | null = null
    let bestScore = -Infinity
    for (const c of candidates) {
      if (team.includes(c)) continue
      const next = [...team, c]
      if (!feasible(next, rules, size)) continue
      const score = teamDps(next, ctx).total
      if (score > bestScore) {
        bestScore = score
        best = c
      }
    }
    if (!best) break
    team.push(best)
  }
  for (let round = 0; round < 30; round++) {
    const current = teamDps(team, ctx).total
    let bestSwap: [number, CookieEntry, number] | null = null
    for (let i = 0; i < team.length; i++) {
      for (const c of candidates) {
        if (team.includes(c)) continue
        const next = team.map((m, j) => (j === i ? c : m))
        if (!meetsRules(next, rules)) continue
        const score = teamDps(next, ctx).total
        if (score > current * (1 + 1e-9) && (!bestSwap || score > bestSwap[2])) bestSwap = [i, c, score]
      }
    }
    if (!bestSwap) break
    team[bestSwap[0]] = bestSwap[1]
  }
  return teamDps(team, ctx)
}

// ───────────────────────── 펫 ─────────────────────────

/** 피해·생존 식에 들어가는 펫 능력치. 나머지(명중·회피·집중·저항, 띄우기·밀치기 저항, 이동속도 등)는 계산에서 빠진다. */
const PET_MODELLED = new Set(['atk', 'critRate', 'critDamage', 'skillAmp', 'bossDamage', 'hp', 'def', 'damageReduction'])

export interface PetValue {
  pet: PetEntry
  /** 편성 전체 초당 피해 증가율 */
  dps: number
  /** 편성 쿠키가 버티는 피해량의 평균 증가율 */
  survival: number
  /** 효과 가운데 계산에 넣지 못한 것이 있는지 */
  partial: boolean
  /** 효과를 받는 편성 쿠키 수 */
  covered: number
}

/**
 * 기준 편성(보통 추천 편성)에 ★5 펫 하나를 더했을 때의 이득.
 * 쿠키마다 피해 모델에 펫을 넣고 다시 계산하므로 시너지 강화 펫도 그 시너지를 받는 쿠키의 타수 변화로 들어간다.
 */
export function petValue(pet: PetEntry, team: TeamResult, ctx: TeamContext): PetValue {
  const tier = pet.tiers[pet.tiers.length - 1]
  if (!tier || !team.rows.length) return { pet, dps: 0, survival: 0, partial: true, covered: 0 }
  const partial = tier.effects.some((e) => !PET_MODELLED.has(e.stat))
  const mode = pet.modes[0] ?? null
  const scenario: Scenario = mode ? 'boss' : ctx.scenario
  let gained = 0
  let survival = 0
  let covered = 0
  for (const row of team.rows) {
    if (!petAffectsCookie(pet, row.cookie)) continue
    covered += 1
    const a = attackerOf(ctx.growth, row.cookie, ctx.build)
    if (row.base > 0) {
      const before = mode ? cookieDps(row.cookie, a, scenario, { synergy: row.synergy }) : row.base
      const after = cookieDps(row.cookie, a, scenario, { synergy: row.synergy, pets: [{ pet, star: 5 }], mode })
      gained += (after - before) * (1 + row.buff)
    }
    const s = cookieStats(ctx.growth, row.cookie, ctx.build.level, ctx.build.grade)
    const stats = battleStats(s, {}, tier.effects)
    survival += effectiveHp(stats.hp, stats.def, stats.damageReduction) / effectiveHp(s.hp, s.def) - 1
  }
  return { pet, dps: team.total ? gained / team.total : 0, survival: survival / team.rows.length, partial, covered }
}

/** 효과 묶음이 같은 펫은 하나만 적용되므로, 묶음이 겹치지 않게 위에서부터 고른다. */
export function bestPets(values: PetValue[], slots: number, by: (v: PetValue) => number): PetValue[] {
  const picked: PetValue[] = []
  for (const v of [...values].sort((x, y) => by(y) - by(x))) {
    if (picked.length >= slots) break
    if (by(v) <= 0 || picked.some((p) => p.pet.group === v.pet.group)) continue
    picked.push(v)
  }
  return picked
}

// ───────────────────────── 슈가룬 ─────────────────────────

export const RUNE_DPS_STATS = ['atkAmp', 'critRate', 'critDamage', 'skillAmp', 'skillHaste'] as const
export type RuneDpsStat = (typeof RUNE_DPS_STATS)[number]

/** 슈가룬 옵션 → 피해 모델의 능력치 키 */
const RUNE_LOADOUT: Record<RuneDpsStat, keyof Loadout> = { atkAmp: 'atkPct', critRate: 'critRate', critDamage: 'critDamage', skillAmp: 'skillAmp', skillHaste: 'haste' }

/**
 * 슈가룬 옵션 한 줄(value: 그 옵션의 수치, % 옵션은 7 = 7%)을 더했을 때 초당 피해가 늘어나는 비율.
 * 피해 모델에 옵션을 넣고 다시 계산한 차이(유한 차분)라서, 치명 옵션은 치명 수치가 낮을수록 가치가 떨어진다.
 * 공격자 a에 팀 버프(치명확률 등)를 미리 더해 넣으면 편성 안에서의 가치가 된다.
 */
export function runeGain(stat: RuneDpsStat, value: number, cookie: CookieEntry, a: Attacker, scenario: Scenario, synergy: SynergySteps = {}): number {
  const before = cookieDps(cookie, a, scenario, { synergy })
  if (!(before > 0)) return 0
  return cookieDps(cookie, a, scenario, { synergy, extra: { [RUNE_LOADOUT[stat]]: value } }) / before - 1
}

/** 옵션별 이득을 큰 순서로 늘어놓은 우선순위 */
export function runePriority(values: Record<RuneDpsStat, number>, cookie: CookieEntry, a: Attacker, scenario: Scenario, synergy: SynergySteps = {}): { stat: RuneDpsStat; gain: number }[] {
  return RUNE_DPS_STATS.map((stat) => ({ stat, gain: runeGain(stat, values[stat], cookie, a, scenario, synergy) })).sort((x, y) => y.gain - x.gain)
}

/** 편성 버프 가운데 치명·스킬증폭처럼 공격자 능력치로 옮길 수 있는 것을 더한다(가동률 반영). */
export function buffedAttacker(cookie: CookieEntry, team: CookieEntry[], ctx: TeamContext): Attacker {
  const a = { ...attackerOf(ctx.growth, cookie, ctx.build) }
  const n = team.length
  for (const giver of team) {
    const cycle = effectCycle(giver)
    for (const e of giver.effects) {
      if (!isAllyTarget(e) || e.kind !== 'stat' || e.value == null) continue
      if (giver === cookie && (e.excludeCaster || e.target === 'ally')) continue
      const share = n <= 1 ? 1 : Math.min(1, receivers(e, n) / (e.excludeCaster || e.target === 'ally' ? n - 1 : n))
      const add = e.value * uptime(e, cycle) * share
      if (e.property === 'critRate') a.critRate += add
      else if (e.property === 'critDamage') a.critDamage += add
      else if (e.property === 'skillAmp') a.skillAmp += add
      else if (e.property === 'bossDamage') a.bossDamage += add
    }
  }
  return a
}
