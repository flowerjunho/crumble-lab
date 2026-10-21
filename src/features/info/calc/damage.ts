/**
 * 쿠키 한 명의 피해량·초당 피해(DPS)를 구하는 순수 계산 모듈.
 *
 * 피해 계산기·능력치 비교·빌드 메이커뿐 아니라 전투 시뮬레이터·티어표에서도 가져다 쓰도록
 * 화면 상태와 상관없는 함수만 둔다. 계산식은 EOG.GG 번들의 피해 계산(한 대 피해, 주기당 피해, 전투 시뮬레이터)에서
 * 단계와 상수를 읽어 우리 데이터 구조에 맞게 다시 썼다. 각 단계의 근거는 해당 함수 주석에 적는다.
 *
 * ## 한 대 피해
 *   피해 = ⌊ 공격력 × 스킬 계수 × (1 + 스킬증폭/100) × 치명 배율 × 보스 배율 × 방어 배율 × 속성 배율 × (1 − 피해감소) × 전투력 배율 ⌋
 *   - 치명 배율 = 1 + 기대 치명 횟수 × 치명피해. 기대 치명 횟수 = max(0, 치명확률 − 대상 치명저항)이고,
 *     100%를 넘는 치명확률은 버려지지 않고 한 번에 여러 번 치명이 터진다(200%면 2회).
 *   - 방어 배율 = 1 / (1 + ln(1 + 방어력/500)). 방어력이 오를수록 한 점당 효과가 줄어든다.
 *   - 속성 배율: 내 속성이 상대 속성에 강하면 1 + 15% + 속성피해. 상대가 강해도 기본으로는 깎이지 않는다.
 *   - 보스 배율 = 1 + 보스피해(대상이 보스일 때만).
 * ## 주기당 피해와 DPS
 *   주기당 피해 = 공격력 × 주기당 계수 × 위 배율들의 곱 × 적중률
 *   스킬 주기 = 기본 주기 × 100 / (100 + 스킬가속), DPS = 주기당 피해 / 스킬 주기
 */
import type { CookieElement, CookieEntry, PetEffect, PetEntry, SynergyKey } from '../../../types'
import { hitRate } from '../../../lib/formulas'
import { petAffectsCookie } from '../../../lib/petLabels'
import type { CookieStats } from '../growth/growth'
import calcKitsJson from '../../../data/calc-kits.json'

// ---------------------------------------------------------------------------
// 상수(EOG 번들의 피해 계산에서 읽은 값)
// ---------------------------------------------------------------------------

/** 방어 배율 식의 기준값: 1 / (1 + ln(1 + 방어력 / 500)) */
export const DEF_SCALE = 500
/** 속성 상성에서 유리할 때 더해지는 피해(15%) */
export const ELEMENT_ADVANTAGE = 0.15
/** 스킬가속 식의 기준값: 주기 × 100 / (100 + 스킬가속) */
export const HASTE_SCALE = 100

/** 내 속성 → 내가 강한 속성. 불 > 풀 > 물 > 불, 빛 ↔ 어둠 */
export const ELEMENT_BEATS: Record<CookieElement, CookieElement> = {
  fire: 'grass',
  water: 'fire',
  grass: 'water',
  light: 'dark',
  dark: 'light',
}

export const SYNERGY_KEYS: SynergyKey[] = ['area', 'dur', 'burst', 'speed', 'hit', 'pierce', 'chain']
/** 개수로 쌓이는 시너지. 나머지(범위·지속·탄속)는 비율(0.3 = 30%)로 쌓인다. */
export const COUNT_SYNERGY = new Set<SynergyKey>(['burst', 'hit', 'pierce', 'chain'])

// ---------------------------------------------------------------------------
// 시너지 레버(scripts/import-eog-calc.mjs → src/data/calc-kits.json)
// ---------------------------------------------------------------------------

/** 한 대상이 맞는 타수를 시너지가 바꾸는 방식. 자세한 뜻은 import-eog-calc.mjs 주석을 본다. */
export type SynergyLever =
  | { key: 'burst'; kind: 'spawn'; base: number; m: number; fan: boolean }
  | { key: 'hit'; kind: 'repeat'; base: number; m: number; cap: number | null }
  | { key: 'dur'; kind: 'ticks'; life: number; period: number; m: number }
  | { key: 'chain'; kind: 'chain'; base: number; m: number }

export interface CalcDot {
  part: number
  hit: number
  cooldown: number
  value: number
  maxStack: number
  duration: number
  tick: number
  apps: [number, number]
  coef: [number, number]
}

export interface CalcKit {
  /** cookie-db의 skill.parts와 같은 순서. hits[i]는 그 피해 항목에 걸린 레버 목록 */
  parts: { counted: boolean; hits: SynergyLever[][] }[]
  dots: CalcDot[]
}

export const CALC_KITS = (calcKitsJson as unknown as { kits: Record<string, CalcKit> }).kits

/** 쿠키의 보조 데이터. 모르는 쿠키면 모든 부분을 합계에 넣고 레버가 없는 것으로 본다. */
export function calcKitOf(cookie: CookieEntry): CalcKit {
  return CALC_KITS[cookie.eid] ?? { parts: cookie.skill.parts.map((part) => ({ counted: true, hits: part.hits.map(() => []) })), dots: [] }
}

/**
 * 계수 범위. min은 한 대상만 맞는다고 보는 보수적인 값(부채꼴로 퍼지는 투사체는 하나, 튕기는 공격은 첫 대상만),
 * max는 나간 공격이 모두 같은 대상에게 들어간다고 보는 값이다.
 */
export type Bound = 'min' | 'max'
const boundIndex = (bound: Bound) => (bound === 'max' ? 1 : 0)

export type SynergySteps = Partial<Record<SynergyKey, number>>

/**
 * 레버 하나가 시너지 값 steps에서 타수를 몇 배로 바꾸는지.
 * 개수형 시너지는 값 × m의 정수 부분만 더하고(1.5개 → 1개), 비율형은 1 + 값 × m을 곱한다.
 */
export function leverFactor(lever: SynergyLever, steps: number, bound: Bound): number {
  if (!(steps > 0)) return 1
  const add = Math.trunc(steps * lever.m)
  switch (lever.kind) {
    case 'spawn':
      // 부채꼴로 퍼지면 한 대상은 하나만 맞는다고 보므로 min에서는 늘지 않는다.
      if (lever.fan && bound === 'min') return 1
      return lever.base > 0 ? (lever.base + add) / lever.base : 1
    case 'repeat': {
      // 반복 횟수는 상위 공격의 수명 안에 들어갈 수 있는 횟수(cap)를 넘지 못한다.
      const cap = lever.cap ?? Infinity
      const before = Math.min(lever.base, cap)
      return before > 0 ? Math.min(lever.base + add, cap) / before : 1
    }
    case 'ticks': {
      // 수명이 늘어난 만큼 주기 피해가 더 들어간다(주기 수는 정수로 내린다).
      const ticks = (life: number) => Math.max(1, Math.floor(life / lever.period + 1e-9))
      return ticks(lever.life * Math.max(0, 1 + steps * lever.m)) / ticks(lever.life)
    }
    case 'chain':
      // 튕기는 횟수가 늘어도 대상이 하나뿐이면 더 맞지 않는다.
      return bound === 'max' ? (1 + lever.base + add) / (1 + lever.base) : 1
  }
}

// ---------------------------------------------------------------------------
// 슈가룬 등 장착 능력치
// ---------------------------------------------------------------------------

/**
 * 성장(레벨·별) 능력치 위에 더하는 값. 단위는 인게임 표기를 따른다.
 * atkPct·critRate·critDamage·skillAmp·bossDamage·elementDamage·accuracyRate·damageReduction은 %(10 = 10%),
 * haste는 스킬가속 수치, atkFlat·accuracy는 수치다.
 */
export interface Loadout {
  atkPct: number
  atkFlat: number
  critRate: number
  critDamage: number
  skillAmp: number
  haste: number
  bossDamage: number
  elementDamage: number
  accuracy: number
  accuracyRate: number
}

export const EMPTY_LOADOUT: Loadout = {
  atkPct: 0,
  atkFlat: 0,
  critRate: 0,
  critDamage: 0,
  skillAmp: 0,
  haste: 0,
  bossDamage: 0,
  elementDamage: 0,
  accuracy: 0,
  accuracyRate: 0,
}
export const LOADOUT_KEYS = Object.keys(EMPTY_LOADOUT) as (keyof Loadout)[]

const finite = (value: number | undefined) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
export const fullLoadout = (loadout: Partial<Loadout> = {}): Loadout =>
  Object.fromEntries(LOADOUT_KEYS.map((key) => [key, finite(loadout[key])])) as unknown as Loadout

// ---------------------------------------------------------------------------
// 펫
// ---------------------------------------------------------------------------

export interface PetPick {
  pet: PetEntry
  /** 별 1~5 */
  star: number
}

export type PetStatus = 'active' | 'target' | 'mode' | 'weaker'

export interface PetApplication {
  pet: PetEntry
  star: number
  /** active: 적용, target: 대상 조건이 안 맞음, mode: 이 모드에서는 효과 없음, weaker: 같은 묶음의 더 강한 펫에 밀림 */
  status: PetStatus
  effects: PetEffect[]
  synergy: { key: SynergyKey; steps: number }[]
}

export interface AppliedPets {
  list: PetApplication[]
  /** 실제로 적용되는 능력치 효과 */
  effects: PetEffect[]
  /** 이 쿠키가 받는 시너지에만 더해지는 값(개수형은 개수, 비율형은 0.3 = 30%) */
  synergy: SynergySteps
}

const clampStar = (star: number) => Math.min(5, Math.max(1, Math.round(Number.isFinite(star) ? star : 1)))

/** 펫 효과의 세기. 같은 묶음 안에서 비교할 때 쓴다(효과 수치의 절댓값과 시너지 값 중 가장 큰 것). */
const tierStrength = (pick: PetApplication) => Math.max(0, ...pick.effects.map((e) => Math.abs(e.value)), ...pick.synergy.map((s) => s.steps))

/**
 * 고른 펫(최대 3마리)을 한 쿠키에게 적용한다.
 * - 대상 조건(속성·직업·받는 시너지)이 안 맞으면 빠진다.
 * - modes가 있는 펫은 그 모드(mode)에서만 효과가 있다. 모드를 정하지 않으면(null) 빠진다.
 * - 같은 group(효과 묶음)끼리는 겹치지 않고 가장 강한 하나만 남는다. 세기가 같으면 나중에 고른 펫이 남는다(EOG 번들의 펫 적용 순서).
 * - 시너지 강화는 그 시너지를 받는 쿠키에게만 더해진다.
 */
export function applyPets(pets: PetPick[], cookie: CookieEntry, mode: string | null = null): AppliedPets {
  const list: PetApplication[] = pets.map(({ pet, star }) => {
    const s = clampStar(star)
    const tier = pet.tiers[s - 1] ?? pet.tiers[pet.tiers.length - 1]
    const synergy = (tier?.synergy ?? [])
      .filter((boost) => cookie.synergy.receives.includes(boost.key))
      .map((boost) => ({ key: boost.key, steps: boost.unit === 'pct' ? boost.value / 100 : boost.value }))
    let status: PetStatus = 'active'
    if (pet.modes.length && !(mode && pet.modes.includes(mode))) status = 'mode'
    else if (!petAffectsCookie(pet, cookie)) status = 'target'
    return { pet, star: s, status, effects: tier?.effects ?? [], synergy }
  })
  const best = new Map<number, PetApplication>()
  for (const pick of list) {
    if (pick.status !== 'active') continue
    const held = best.get(pick.pet.group)
    if (!held || tierStrength(pick) >= tierStrength(held)) best.set(pick.pet.group, pick)
  }
  for (const pick of list) if (pick.status === 'active' && best.get(pick.pet.group) !== pick) pick.status = 'weaker'
  const active = list.filter((pick) => pick.status === 'active')
  const synergy: SynergySteps = {}
  for (const pick of active) for (const { key, steps } of pick.synergy) synergy[key] = (synergy[key] ?? 0) + steps
  return { list, effects: active.flatMap((pick) => pick.effects), synergy }
}

// ---------------------------------------------------------------------------
// 전투 능력치
// ---------------------------------------------------------------------------

/** 피해 계산에 쓰는 최종 능력치. 비율은 %(10 = 10%), damageReduction만 0~1 */
export interface BattleStats {
  atk: number
  def: number
  hp: number
  critRate: number
  critDamage: number
  skillAmp: number
  haste: number
  bossDamage: number
  elementDamage: number
  accuracy: number
  accuracyRate: number
  damageReduction: number
  moveSpeedPct: number
}

/**
 * 성장 능력치 → 슈가룬 → 펫 순서로 능력치를 쌓는다(EOG 번들의 능력치 표 → 펫 적용 순서).
 * 공격력 증폭처럼 %로 오르는 값은 각 단계에서 내림하고, 수치로 더하는 값은 그 뒤에 더한다.
 * 피해감소는 더하지 않고 (1 − a)(1 − b)로 겹친다.
 */
export function battleStats(base: CookieStats, loadout: Partial<Loadout> = {}, petEffects: PetEffect[] = []): BattleStats {
  const rune = fullLoadout(loadout)
  const pct = { atk: 0, def: 0, hp: 0, moveSpeed: 0 }
  const flat = { atk: 0, def: 0, hp: 0, accuracy: 0 }
  const rate = { critRate: 0, critDamage: 0, skillAmp: 0, bossDamage: 0, accuracyRate: 0 }
  let kept = 1
  for (const effect of petEffects) {
    const { stat, how, value } = effect
    if (how === 'pct' && stat in pct) pct[stat as keyof typeof pct] += value / 100
    else if (how === 'flat' && stat in flat) flat[stat as keyof typeof flat] += value
    else if (how === 'rate' && stat === 'damageReduction') kept *= 1 - Math.min(100, value) / 100
    else if (how === 'rate' && stat in rate) rate[stat as keyof typeof rate] += value
  }
  const runeAtk = Math.floor(base.atk * (1 + rune.atkPct / 100)) + rune.atkFlat
  return {
    atk: Math.max(1, Math.floor(runeAtk * (1 + pct.atk)) + flat.atk),
    def: Math.max(0, Math.floor(base.def * (1 + pct.def)) + flat.def),
    hp: Math.max(1, Math.floor(base.hp * (1 + pct.hp)) + flat.hp),
    critRate: tidy(base.critRate * 100 + rune.critRate + rate.critRate),
    critDamage: tidy(base.critDamage * 100 + rune.critDamage + rate.critDamage),
    skillAmp: tidy(rune.skillAmp + rate.skillAmp),
    haste: rune.haste,
    bossDamage: tidy(rune.bossDamage + rate.bossDamage),
    elementDamage: rune.elementDamage,
    accuracy: base.accuracy + rune.accuracy + flat.accuracy,
    accuracyRate: tidy(rune.accuracyRate + rate.accuracyRate),
    damageReduction: tidy(1 - kept),
    moveSpeedPct: tidy(pct.moveSpeed * 100),
  }
}

/** 0.1 + 0.2 같은 소수 오차를 지운다. */
const tidy = (value: number) => Number(value.toFixed(6))

// ---------------------------------------------------------------------------
// 대상
// ---------------------------------------------------------------------------

/** 때리는 대상. avoidanceRate·damageReduction·critResist는 %(10 = 10%) */
export interface TargetSpec {
  def: number
  element: CookieElement | null
  isBoss: boolean
  /** 0이면 회피를 따지지 않는다(항상 적중). */
  avoidance: number
  avoidanceRate: number
  damageReduction: number
  critResist: number
}

/** 방어력 0, 속성 없음, 회피 없음인 허수아비 */
export const TRAINING_DUMMY: TargetSpec = { def: 0, element: null, isBoss: false, avoidance: 0, avoidanceRate: 0, damageReduction: 0, critResist: 0 }

// ---------------------------------------------------------------------------
// 배율 하나하나
// ---------------------------------------------------------------------------

/** 기대 치명 횟수. 치명확률이 대상 치명저항을 넘는 만큼(%) / 100. 200%면 한 대에 두 번 치명이 터진다. */
export const critStacks = (critRatePct: number, critResistPct = 0) => Math.max(0, (critRatePct - critResistPct) / 100)

/** 치명 배율: 1 + 기대 치명 횟수 × 치명피해 */
export const critFactor = (stacks: number, critDamagePct: number) => 1 + stacks * (critDamagePct / 100)

/** 방어 배율: 1 / (1 + ln(1 + 방어력 / 500)). 방어력 0 이하면 1 */
export const defenseFactor = (def: number) => (def > 0 ? 1 / (1 + Math.log(1 + def / DEF_SCALE)) : 1)

/** 속성 배율. 유리하면 1 + 15% + 속성피해, 그 밖에는 1(불리해도 기본으로는 깎이지 않는다). */
export function elementFactor(attacker: CookieElement, target: CookieElement | null, elementDamagePct = 0): number {
  if (target && ELEMENT_BEATS[attacker] === target) return 1 + ELEMENT_ADVANTAGE + elementDamagePct / 100
  return 1
}

/** 스킬가속이 적용된 주기(초) */
export const hastedCycle = (seconds: number, haste: number) => (seconds * HASTE_SCALE) / (Math.max(0, haste) + HASTE_SCALE)

// ---------------------------------------------------------------------------
// DPS
// ---------------------------------------------------------------------------

export type FactorKey = 'amp' | 'crit' | 'boss' | 'def' | 'element' | 'dr' | 'power' | 'hit'
export interface Factor {
  key: FactorKey
  value: number
}

export interface DamageInput {
  cookie: CookieEntry
  /** 성장 능력치(growth.ts cookieStats) */
  stats: CookieStats
  loadout?: Partial<Loadout>
  pets?: PetPick[]
  /** 펫의 모드 제한을 따질 모드(예: DIMENSION_STAGE). 없으면 모드 한정 펫은 빠진다. */
  mode?: string | null
  /** 아군에게서 받는 시너지(펫 강화분 제외). 이 쿠키가 받지 않는 시너지는 무시한다. */
  synergy?: SynergySteps
  target?: Partial<TargetSpec>
  bound?: Bound
  /** 권장 전투력 대비 피해 배율(formulas.ts powerPenalty). 기본 1 */
  powerMultiplier?: number
  /** 보조 데이터를 바꿔 끼울 때(테스트 등). 기본은 calc-kits.json */
  kit?: CalcKit
}

/** 피해 항목 한 줄 */
export interface HitRow {
  part: number
  hit: number
  /** 한 대 계수(공격력 배율) */
  perHit: number
  /** 한 번 시전할 때 같은 대상이 맞는 횟수(시너지 반영) */
  hitsPerCast: number
  /** 스킬 주기 한 번 동안 시전 횟수 */
  castsPerCycle: number
  /** 주기당 계수 = perHit × hitsPerCast × castsPerCycle */
  coefPerCycle: number
  /** 시너지가 바꾼 배율(1이면 그대로) */
  synergyFactor: number
  /** 한 대 피해(치명 기대값 포함, 적중률 제외, 내림) */
  damagePerHit: number
  /** 주기당 피해(적중률 포함) */
  damagePerCycle: number
  /** 지속 피해(독 등)를 포함하는 항목인지 */
  dot: boolean
}

export interface DamageResult {
  stats: BattleStats
  attack: number
  /** 스킬가속 전 주기(초) */
  baseCycle: number
  /** 스킬가속이 적용된 주기(초) */
  cycle: number
  coefPerCycle: number
  factors: Factor[]
  /** 적중률을 뺀 배율 곱(한 대 피해에 쓰는 값) */
  hitProduct: number
  product: number
  perCycle: number
  dps: number
  critStacks: number
  hitChance: number
  breakdown: HitRow[]
  pets: AppliedPets
  /** 실제로 받는 시너지(아군 + 펫, 이 쿠키가 받는 것만) */
  synergy: SynergySteps
  /** 피해 계수가 0인 쿠키(회복·버프만 하는 지원형) */
  support: boolean
}

/** 받는 시너지 합치기. 이 쿠키가 받는 시너지만 남긴다. */
export function receivedSynergy(cookie: CookieEntry, ...sources: SynergySteps[]): SynergySteps {
  const out: SynergySteps = {}
  for (const key of cookie.synergy.receives) {
    const total = sources.reduce((sum, source) => sum + finite(source[key]), 0)
    if (total > 0) out[key] = tidy(total)
  }
  return out
}

/**
 * 지속 피해(독 등) 한 번 시전분의 계수를 스킬가속이 적용된 주기로 다시 구한다.
 * 지속 시간이 시전 간격보다 길면 중첩이 최대치까지 유지되고, 짧으면 한 번 시전으로 쌓인 만큼만 들어간다.
 * 틱 수 = ⌊min(지속 시간, 시전 간격) / 틱 간격⌋
 */
export function dotCoefPerCast(dot: CalcDot, haste: number, bound: Bound): number {
  const interval = hastedCycle(dot.cooldown, haste)
  if (!(interval > 0) || !(dot.tick > 0)) return 0
  const held = dot.duration > interval + 1e-9
  const stacks = held ? dot.maxStack || 1 : Math.min(dot.maxStack || 1, dot.apps[boundIndex(bound)])
  return dot.value * stacks * Math.max(0, Math.floor(Math.min(dot.duration, interval) / dot.tick + 1e-9))
}

/**
 * 쿠키 한 명의 피해 항목별 내역과 주기당 피해·DPS를 구한다.
 * 스킬 부분마다 '주기 안에 몇 번 시전하는지(기본 주기 / 실제 쿨타임)'를 곱해 더하며, 합계에 넣지 않는 부분(counted=false,
 * 변신 상태 전용 공격 등)은 건너뛴다. 이렇게 더한 계수는 시너지·스킬가속이 없을 때 cookie-db의 skill.coefPerCycle과 같다.
 */
export function cookieDps(input: DamageInput): DamageResult {
  const { cookie } = input
  const bound = input.bound ?? 'min'
  const b = boundIndex(bound)
  const kit = input.kit ?? calcKitOf(cookie)
  const pets = applyPets(input.pets ?? [], cookie, input.mode ?? null)
  const stats = battleStats(input.stats, input.loadout, pets.effects)
  const target: TargetSpec = { ...TRAINING_DUMMY, ...input.target }
  const synergy = receivedSynergy(cookie, input.synergy ?? {}, pets.synergy)

  // 1. 배율. 한 대 피해에 들어가는 배율과 적중률을 나눠 둔다.
  const stacks = critStacks(stats.critRate, target.critResist)
  const hitChance = hitRate(stats.accuracy, stats.accuracyRate * 100, target.avoidance, target.avoidanceRate * 100)
  const factors: Factor[] = [
    { key: 'amp', value: 1 + stats.skillAmp / 100 },
    { key: 'crit', value: critFactor(stacks, stats.critDamage) },
    { key: 'boss', value: target.isBoss ? 1 + stats.bossDamage / 100 : 1 },
    { key: 'def', value: defenseFactor(target.def) },
    { key: 'element', value: elementFactor(cookie.element, target.element, stats.elementDamage) },
    // 피해감소는 0~100%로 자른다.
    { key: 'dr', value: 1 - Math.min(1, Math.max(0, target.damageReduction / 100)) },
    { key: 'power', value: input.powerMultiplier ?? 1 },
    { key: 'hit', value: hitChance },
  ]
  const hitProduct = factors.filter((f) => f.key !== 'hit').reduce((p, f) => p * f.value, 1)
  const product = hitProduct * hitChance

  // 2. 스킬 주기. 모든 부분의 쿨타임이 같은 비율로 줄어서 '주기 안의 시전 횟수'는 변하지 않는다.
  const baseCycle = cookie.skill.cycleSeconds
  const cycle = hastedCycle(baseCycle, stats.haste)

  // 3. 피해 항목별 계수
  const breakdown: HitRow[] = []
  cookie.skill.parts.forEach((part, p) => {
    const meta = kit.parts[p]
    if (!(part.effectiveCooldown > 0) || meta?.counted === false) return
    const castsPerCycle = baseCycle / part.effectiveCooldown
    part.hits.forEach((hit, h) => {
      const levers = meta?.hits[h] ?? []
      const synergyFactor = levers.reduce((f, lever) => f * leverFactor(lever, finite(synergy[lever.key]), bound), 1)
      const dot = kit.dots.find((d) => d.part === p && d.hit === h)
      // 지속 피해가 섞인 항목은 계수에서 원래 지속 피해분을 빼고 가속 주기로 다시 구한 값을 넣는다.
      const direct = dot ? Math.max(0, hit.coef[b] - dot.coef[b]) : hit.coef[b]
      const perCast = direct * synergyFactor + (dot ? dotCoefPerCast(dot, stats.haste, bound) : 0)
      const coefPerCycle = perCast * castsPerCycle
      breakdown.push({
        part: p,
        hit: h,
        perHit: hit.perHit,
        hitsPerCast: hit.perHit > 0 ? perCast / hit.perHit : 0,
        castsPerCycle,
        coefPerCycle,
        synergyFactor,
        damagePerHit: Math.max(0, Math.floor(stats.atk * hit.perHit * hitProduct)),
        damagePerCycle: stats.atk * coefPerCycle * product,
        dot: Boolean(dot),
      })
    })
  })

  const coefPerCycle = breakdown.reduce((sum, row) => sum + row.coefPerCycle, 0)
  const perCycle = stats.atk * coefPerCycle * product
  return {
    stats,
    attack: stats.atk,
    baseCycle,
    cycle,
    coefPerCycle,
    factors,
    hitProduct,
    product,
    perCycle,
    dps: cycle > 0 ? perCycle / cycle : 0,
    critStacks: stacks,
    hitChance,
    breakdown,
    pets,
    synergy,
    support: coefPerCycle === 0,
  }
}

// ---------------------------------------------------------------------------
// 팀 시너지
// ---------------------------------------------------------------------------

export interface SynergyGrant {
  from: CookieEntry
  /** 효과 한 번에 주는 값(개수형은 개수, 비율형은 0.5 = 50%) */
  value: number
  /** 스킬 주기 중 효과가 걸려 있는 비율(0~1) = min(1, 지속 시간 / 주기) */
  uptime: number
  /** 한 번에 받을 수 있는 인원(없으면 전원) */
  maxTargets: number | null
}

export interface TeamSynergyRow {
  key: SynergyKey
  givers: SynergyGrant[]
  receivers: CookieEntry[]
  /** 받는 쿠키 한 명이 평균적으로 받는 값(가장 강한 주는 쿠키 기준) */
  steps: number
}

/**
 * 라인업 안에서 시너지를 누가 주고 누가 받는지 정리한다.
 * - 주는 쿠키의 스킬 효과(kind = synergy)에서 값·지속 시간을 읽고, 주기 대비 유지 비율을 곱해 평균값을 낸다.
 * - 인원 제한이 있으면(아군 1명 등) 받는 쿠키 수로 나눠 한 명이 받는 기대값으로 바꾼다.
 * - 같은 시너지를 여러 쿠키가 줘도 겹치지 않고 가장 큰 값 하나만 남긴다(EOG 빌드 메이커가 남는 공급자를 '중복'으로 세는 방식).
 * 스킬가속은 반영하지 않는다(주는 쿠키의 기본 주기 기준).
 */
export function teamSynergy(cookies: CookieEntry[]): TeamSynergyRow[] {
  const rows: TeamSynergyRow[] = []
  for (const key of SYNERGY_KEYS) {
    const givers: SynergyGrant[] = []
    for (const cookie of cookies) {
      if (!cookie.synergy.gives.includes(key)) continue
      const effect = cookie.effects.find((e) => e.kind === 'synergy' && e.property === key)
      const cycle = cookie.skill.cycleSeconds
      givers.push({
        from: cookie,
        value: effect?.value ?? 0,
        uptime: effect?.lifetime === 'permanent' ? 1 : cycle > 0 && effect?.duration ? Math.min(1, effect.duration / cycle) : 0,
        maxTargets: effect?.maxTargets ?? null,
      })
    }
    const receivers = cookies.filter((cookie) => cookie.synergy.receives.includes(key))
    if (!givers.length && !receivers.length) continue
    const share = (grant: SynergyGrant) => (grant.maxTargets && receivers.length > grant.maxTargets ? grant.maxTargets / receivers.length : 1)
    const steps = Math.max(0, ...givers.map((grant) => grant.value * grant.uptime * share(grant)))
    rows.push({ key, givers, receivers, steps: tidy(steps) })
  }
  return rows
}

/** 팀 시너지 표에서 한 쿠키가 아군에게 받는 값만 뽑는다(펫 강화분은 cookieDps가 따로 더한다). */
export function synergyFor(cookie: CookieEntry, rows: TeamSynergyRow[]): SynergySteps {
  const out: SynergySteps = {}
  for (const row of rows) if (row.steps > 0 && cookie.synergy.receives.includes(row.key)) out[row.key] = row.steps
  return out
}

// ---------------------------------------------------------------------------
// 라인업
// ---------------------------------------------------------------------------

/** 2열 × 6행 배치 칸 수(EOG 번들의 '한 번에 출전하는 쿠키 12명, 2×6 배치' 데이터와 배치 좌표 12칸) */
export const SQUAD_SIZE = 12
export const SQUAD_COLUMNS = 2
/** 한 라인업에 데려가는 펫 수 */
export const PET_SLOTS = 3

export interface TeamMember {
  cookie: CookieEntry
  stats: CookieStats
  loadout?: Partial<Loadout>
}

export interface TeamResult {
  synergy: TeamSynergyRow[]
  members: { cookie: CookieEntry; result: DamageResult }[]
  dps: number
}

/** 라인업 전체의 시너지·펫을 반영해 쿠키별 DPS와 합계를 낸다. */
export function teamDps(members: TeamMember[], options: { pets?: PetPick[]; mode?: string | null; target?: Partial<TargetSpec>; bound?: Bound; powerMultiplier?: number } = {}): TeamResult {
  const synergy = teamSynergy(members.map((m) => m.cookie))
  const results = members.map((member) => ({
    cookie: member.cookie,
    result: cookieDps({
      cookie: member.cookie,
      stats: member.stats,
      loadout: member.loadout,
      pets: options.pets,
      mode: options.mode,
      synergy: synergyFor(member.cookie, synergy),
      target: options.target,
      bound: options.bound,
      powerMultiplier: options.powerMultiplier,
    }),
  }))
  return { synergy, members: results, dps: results.reduce((sum, m) => sum + m.result.dps, 0) }
}
