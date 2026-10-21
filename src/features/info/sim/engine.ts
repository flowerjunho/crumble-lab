/**
 * 쿠키런: 크럼블 전투를 흉내 낸 시간 단위 시뮬레이션 엔진. 화면과 상관없는 순수 함수만 둔다.
 *
 * EOG.GG가 공개한 전투 수치(스킬 쿨타임·투사체 나무·보스 공격 시간표·소환되는 적 능력치)를 바탕으로,
 * 그 시뮬레이터가 어떻게 움직이는지 읽어 이해한 규칙을 우리 방식으로 다시 짰다. 게임 그 자체가 아니라 모형이다.
 *
 * ## 한 걸음(0.05초)마다 하는 일
 *   1. 끝난 버프·디버프를 지우고, 지속 피해를 굴린다.
 *   2. 시각이 된 보스 패턴(공격·적 소환·보스 강화)을 처리한다.
 *   3. 쿠키: 목표를 정해 사거리 안으로 걸어가고, 사거리 안이면 쿨타임이 끝난 스킬을 쓴다.
 *      - 쿨타임 = 기본 쿨타임 × 100 / (100 + 스킬가속). 첫 시전은 전투 시작부터 (1 − 시작 쿨타임 감소)만큼 기다린다.
 *      - 시전 동작 시간 동안은 움직이거나 다른 스킬을 쓰지 못한다. 공중에 뜬 동안과 기절한 동안도 마찬가지다.
 *      - 한 번 시전한 피해 계수는 스킬 나무(skillTree.ts)에서 시너지를 반영해 구한다.
 *      - 스킬 효과(버프·디버프·시너지·보호막·기절·지속 피해)는 쿨타임이 가장 긴 스킬(주 스킬)을 쓸 때 붙는다.
 *   4. 소환된 적: 가장 가까운 쿠키에게 걸어가 쿨타임마다 때린다. 수명이 다하면 사라진다.
 *   5. 0.25초마다 쿠키별 누적 피해와 보스 남은 체력을 기록한다.
 *
 * 같은 입력과 같은 시드면 결과가 늘 같다. 치명·적중은 기댓값(average)으로 곱하거나 시드로 굴린다(roll).
 */
import type { CookieEffect, CookieElement, SynergyKey } from '../../../types'
import { debuffRate } from '../../../lib/formulas'
import { hastedCycle } from '../calc/damage'
import { skillHit, type HitMode, type HitSource, type HitTarget } from './hit'
import type { AddAttack, SkillRoot, SpawnGroup } from './simData'
import { bodyReach, castProfile, type SynergyStacks } from './skillTree'

export const STEP = 0.05
export const SAMPLE_EVERY = 0.25
/** 이보다 짧게 뜨면 행동을 멈추지 않는다 */
const AIRBORNE_LOCK = 0.4
/** 뜨지 않고 밀리기만 할 때 밀리는 거리를 줄이는 값 */
const PUSH_ONLY_SCALE = 15
/** 소환된 적의 기본 치명확률·치명피해(%) */
export const ADD_CRIT = { rate: 10, damage: 50 }

export type SimMode = 'GUILD_RAID' | 'CRUMBLE_DUNGEON' | null

export interface Vec {
  x: number
  z: number
}

/** 시뮬레이션에 넣는 쿠키 하나. 비율 값은 %(10 = 10%), damageReduction·저항은 0~1 */
export interface CookieSpec {
  eid: string
  element: CookieElement
  receives: SynergyKey[]
  stats: {
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
    avoidance: number
    focus: number
    damageReduction: number
    moveSpeed: number
  }
  range: number
  hitRadius: number
  targeting: string
  startCooldownReduction: number
  knockbackResistance: number
  airborneResistance: number
  roots: SkillRoot[]
  effects: CookieEffect[]
  /** 펫처럼 전투 내내 붙어 있는 시너지 */
  synergy: SynergyStacks
  pos: Vec
}

/** 보스나 소환된 적. hp가 Infinity면 쓰러지지 않는다(점수 모드). */
export interface EnemySpec {
  kind: string
  hp: number
  atk: number
  def: number
  avoidance: number
  accuracy: number
  /** 디버프 적용률을 깎는 저항 */
  resist: number
  element: CookieElement | null
  isBoss: boolean
  hitRadius: number
  pos: Vec
  ccImmune: boolean
  speed: number
  /** 등장 후 사라지기까지(초). 없으면 끝까지 남는다. */
  life?: number
  attack?: AddAttack & { opener?: Partial<AddAttack> }
  crit?: { rate: number; damage: number }
}

export type StrikeLabel = 'basic' | 'spiral' | 'lightning' | 'shockwave' | 'gift' | 'wave' | 'blast'

export type StrikeShape =
  | { type: 'all' }
  /** 살아 있는 쿠키 하나를 골라 그 주변 반경 안을 친다. within이 있으면 보스에서 그 거리 안의 쿠키만 고른다. */
  | { type: 'random'; radius: number; within?: number; limit?: number }
  /** 보스 중심에서 반경 안의 가까운 쿠키부터 limit명 */
  | { type: 'nearBoss'; radius: number; limit: number }
  /** 보스에서 직선으로 날아가 처음 닿는 쿠키 하나 */
  | { type: 'ray'; angleDeg: number; width: number; reach: number }
  /** 가장 가까운 쿠키 하나 */
  | { type: 'nearest' }

export type SimEvent =
  | { t: number; kind: 'strike'; label: StrikeLabel; multiplier: number; knockBack: number; airborne: number; shape: StrikeShape }
  /** 보스 위치에서 (dx, −dz)만큼 떨어진 곳에 적을 부른다 */
  | { t: number; kind: 'spawn'; tier: string; groups: SpawnGroup[] }
  /** 보스 강화. stack: 피해 감소를 (1 − a)(1 − b)로 겹친다, set: 새 값으로 바꾼다. atkMult는 공격력 × (1 + atkMult) 중 가장 큰 것 */
  | { t: number; kind: 'bossBuff'; dr: number; drMode: 'stack' | 'set'; atkMult: number }

export interface SimInput {
  mode: SimMode
  duration: number
  seed: number
  hits: 'average' | 'roll'
  /** 쿠키 피해에 곱하는 전투력 배율 */
  powerMultiplier: number
  cookies: CookieSpec[]
  bosses: EnemySpec[]
  events: SimEvent[]
  /** spawn 이벤트가 부르는 적 */
  addTiers: Record<string, Omit<EnemySpec, 'pos' | 'isBoss' | 'kind'>>
  /** 보스가 모두 쓰러지면 멈춘다 */
  stopOnKill: boolean
}

export interface CookieRow {
  eid: string
  slot: number
  damage: number
  bossDamage: number
  healing: number
  shielding: number
  taken: number
  casts: number
  diedAt: number | null
  killedBy: StrikeLabel | 'add' | null
  /** 사거리 안에서 싸운 시간(초) */
  activeSeconds: number
  /** 처음으로 스킬을 쓴 시각 */
  firstCastAt: number | null
}

export interface SimSample {
  t: number
  /** 쿠키 순서대로 그 시각까지의 누적 피해 */
  cum: number[]
  /** 쓰러질 수 있는 보스의 남은 체력 비율(0~1). 점수 모드면 null */
  bossHp: number | null
  alive: number
}

export interface SimResult {
  /** 실제로 돌린 시간(보스를 쓰러뜨려 멈췄으면 그 시각) */
  elapsed: number
  timeLimit: number
  killed: boolean
  killTime: number | null
  /** 보스 전체 체력(점수 모드면 null) */
  bossMaxHp: number | null
  bossDamage: number
  totalDamage: number
  rows: CookieRow[]
  samples: SimSample[]
  addsSpawned: number
  addsKilled: number
  deaths: number
}

// ---------------------------------------------------------------------------
// 난수: 시드 하나로 늘 같은 순서를 낸다(splitmix32).
// ---------------------------------------------------------------------------

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x9e3779b9) >>> 0
    let z = state
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0
    return ((z ^ (z >>> 16)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// 전투 중의 몸
// ---------------------------------------------------------------------------

interface Mod {
  key: string
  effect: CookieEffect
  /** 스킬증폭·시전자 공격력을 반영한 한 겹의 값 */
  value: number
  stacks: number
  expires: number
  /** 지속 피해: 다음 틱 시각과 시전자 */
  nextTick?: number
  source?: Body
}

interface Live {
  atk: number
  def: number
  critRate: number
  critDamage: number
  skillAmp: number
  bossDamage: number
  accuracy: number
  avoidance: number
  damageReduction: number
  moveSpeed: number
  knockbackResistance: number
  airborneResistance: number
  synergy: SynergyStacks
}

interface Body {
  index: number
  side: 'ally' | 'enemy'
  spec: CookieSpec | null
  enemy: EnemySpec | null
  pos: Vec
  hitRadius: number
  hp: number
  maxHp: number
  shield: number
  alive: boolean
  base: Live
  live: Live
  mods: Mod[]
  airborneUntil: number
  lockedUntil: number
  stunnedUntil: number
  expiresAt: number
  cooldowns: number[]
  nextSwing: number
  swung: boolean
  row: CookieRow | null
  /** 보스 공격력 배율(보스 강화) */
  atkMult: number
  bossDr: number
}

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z)
/** 몸 가장자리까지의 거리 */
const edge = (from: Body, to: Body) => dist(from.pos, to.pos) - to.hitRadius

function cookieBody(spec: CookieSpec, index: number): Body {
  const s = spec.stats
  const base: Live = {
    atk: s.atk,
    def: s.def,
    critRate: s.critRate,
    critDamage: s.critDamage,
    skillAmp: s.skillAmp,
    bossDamage: s.bossDamage,
    accuracy: s.accuracy,
    avoidance: s.avoidance,
    damageReduction: s.damageReduction,
    moveSpeed: s.moveSpeed,
    knockbackResistance: spec.knockbackResistance,
    airborneResistance: spec.airborneResistance,
    synergy: { ...spec.synergy },
  }
  return {
    index,
    side: 'ally',
    spec,
    enemy: null,
    pos: { ...spec.pos },
    hitRadius: spec.hitRadius,
    hp: s.hp,
    maxHp: s.hp,
    shield: 0,
    alive: true,
    base,
    live: { ...base, synergy: { ...base.synergy } },
    mods: [],
    airborneUntil: 0,
    lockedUntil: 0,
    stunnedUntil: 0,
    expiresAt: Infinity,
    // 첫 시전: 가속한 쿨타임에서 시작 쿨타임 감소만큼 덜 기다린다.
    cooldowns: spec.roots.map((root) => hastedCycle(root.effectiveCooldown, s.haste) * Math.min(1, Math.max(0, 1 - spec.startCooldownReduction))),
    nextSwing: 0,
    swung: false,
    row: {
      eid: spec.eid,
      slot: index + 1,
      damage: 0,
      bossDamage: 0,
      healing: 0,
      shielding: 0,
      taken: 0,
      casts: 0,
      diedAt: null,
      killedBy: null,
      activeSeconds: 0,
      firstCastAt: null,
    },
    atkMult: 0,
    bossDr: 0,
  }
}

function enemyBody(spec: EnemySpec, index: number, now: number): Body {
  const base: Live = {
    atk: spec.atk,
    def: spec.def,
    critRate: spec.crit?.rate ?? 0,
    critDamage: spec.crit?.damage ?? 0,
    skillAmp: 0,
    bossDamage: 0,
    accuracy: spec.accuracy,
    avoidance: spec.avoidance,
    damageReduction: 0,
    moveSpeed: spec.speed,
    knockbackResistance: spec.ccImmune ? 1 : 0,
    airborneResistance: spec.ccImmune ? 1 : 0,
    synergy: {},
  }
  return {
    index,
    side: 'enemy',
    spec: null,
    enemy: spec,
    pos: { ...spec.pos },
    hitRadius: spec.hitRadius,
    hp: spec.hp,
    maxHp: spec.hp,
    shield: 0,
    alive: true,
    base,
    live: { ...base },
    mods: [],
    airborneUntil: 0,
    lockedUntil: 0,
    stunnedUntil: 0,
    expiresAt: spec.life !== undefined ? now + spec.life : Infinity,
    cooldowns: [],
    nextSwing: now,
    swung: false,
    row: null,
    atkMult: 0,
    bossDr: 0,
  }
}

/** 버프·디버프를 다시 쌓아 지금 능력치를 구한다. */
function refresh(body: Body) {
  const b = body.base
  const live: Live = { ...b, synergy: { ...b.synergy } }
  let kept = 1 - b.damageReduction
  for (const mod of body.mods) {
    const e = mod.effect
    const v = mod.value * mod.stacks
    if (e.kind === 'synergy' && e.property) {
      const key = e.property as SynergyKey
      if (body.spec?.receives.includes(key)) live.synergy[key] = (live.synergy[key] ?? 0) + v
    } else if (e.kind === 'pushResist') live.knockbackResistance += v
    else if (e.kind === 'liftResist') live.airborneResistance += v
    else if (e.kind === 'stat') {
      switch (e.property) {
        case 'atk':
          live.atk += e.calcType === 'mult' ? b.atk * v : v
          break
        case 'def':
          live.def += e.calcType === 'mult' ? b.def * v : v
          break
        case 'moveSpeed':
          live.moveSpeed += e.calcType === 'mult' ? b.moveSpeed * v : v
          break
        case 'critRate':
          live.critRate += v * 100
          break
        case 'critDamage':
          live.critDamage += v * 100
          break
        case 'skillAmp':
          live.skillAmp += v * 100
          break
        case 'bossDamage':
          live.bossDamage += v * 100
          break
        case 'accuracy':
          live.accuracy += v * 100
          break
        case 'avoidance':
          live.avoidance += v * 100
          break
        case 'damageTaken':
          kept *= 1 - Math.min(1, v)
          break
      }
    }
  }
  live.atk = Math.max(0, live.atk) * (1 + body.atkMult)
  live.def = Math.max(0, live.def)
  live.moveSpeed = Math.max(0, live.moveSpeed)
  live.damageReduction = 1 - kept * (1 - body.bossDr)
  live.knockbackResistance = Math.min(1, live.knockbackResistance)
  live.airborneResistance = Math.min(1, live.airborneResistance)
  body.live = live
}

const sourceOf = (body: Body): HitSource => ({
  atk: body.live.atk,
  critRate: body.live.critRate,
  critDamage: body.live.critDamage,
  skillAmp: body.live.skillAmp,
  bossDamage: body.live.bossDamage,
  elementDamage: body.spec?.stats.elementDamage ?? 0,
  accuracy: body.live.accuracy,
  accuracyRate: body.spec?.stats.accuracyRate ?? 0,
  element: body.spec?.element ?? body.enemy?.element ?? null,
})

const targetOf = (body: Body): HitTarget => ({
  def: body.live.def,
  avoidance: body.live.avoidance,
  critResist: 0,
  damageReduction: body.live.damageReduction,
  element: body.spec?.element ?? body.enemy?.element ?? null,
  isBoss: Boolean(body.enemy?.isBoss),
})

// ---------------------------------------------------------------------------
// 시뮬레이션
// ---------------------------------------------------------------------------

/** 주 스킬: 쿨타임이 가장 긴 스스로 쓰는 스킬(효과는 이 스킬을 쓸 때 붙인다) */
export function mainRootIndex(roots: SkillRoot[]): number {
  let best = -1
  roots.forEach((root, i) => {
    if (!root.counted || !(root.effectiveCooldown > 0)) return
    if (best < 0 || root.effectiveCooldown > (roots[best]?.effectiveCooldown ?? 0)) best = i
  })
  return best
}

export function simulate(input: SimInput): SimResult {
  const random = seededRandom(input.seed)
  const hitMode: HitMode = input.hits === 'average' ? { kind: 'average' } : { kind: 'roll', random }
  const allies = input.cookies.map(cookieBody)
  const enemies: Body[] = input.bosses.map((boss, i) => enemyBody(boss, i, 0))
  const bosses = enemies.slice()
  const finiteBoss = bosses.some((b) => Number.isFinite(b.maxHp))
  const bossMaxHp = finiteBoss ? bosses.reduce((sum, b) => sum + (Number.isFinite(b.maxHp) ? b.maxHp : 0), 0) : null
  const events = [...input.events].sort((a, b) => a.t - b.t)
  const mains = input.cookies.map((spec) => mainRootIndex(spec.roots))
  let eventCursor = 0
  let addsSpawned = 0
  let addsKilled = 0
  let killTime: number | null = null
  let now = 0
  const samples: SimSample[] = []
  const steps = Math.round(input.duration / STEP)
  const sampleEvery = Math.max(1, Math.round(SAMPLE_EVERY / STEP))

  const living = () => allies.filter((a) => a.alive)

  // ---- 피해 주고받기 ----
  const dealToEnemy = (from: Body, to: Body, coefficient: number) => {
    if (!to.alive) return 0
    let amount = skillHit(sourceOf(from), coefficient, targetOf(to), input.powerMultiplier, hitMode)
    if (Number.isFinite(to.hp)) amount = Math.min(amount, to.hp)
    if (!(amount > 0)) return 0
    to.hp -= amount
    if (from.row) {
      from.row.damage += amount
      if (to.enemy?.isBoss) from.row.bossDamage += amount
    }
    if (to.hp <= 0 && Number.isFinite(to.maxHp)) {
      to.alive = false
      to.hp = 0
      if (!to.enemy?.isBoss) addsKilled++
    }
    return amount
  }

  const dealToCookie = (from: Body, to: Body, multiplier: number, label: StrikeLabel | 'add') => {
    if (!to.alive) return
    let amount = skillHit(sourceOf(from), multiplier, targetOf(to), 1, hitMode)
    if (!(amount > 0)) return
    const absorbed = Math.min(to.shield, amount)
    to.shield -= absorbed
    amount -= absorbed
    to.hp -= amount
    if (to.row) to.row.taken += amount + absorbed
    if (to.hp <= 0) {
      to.alive = false
      to.hp = 0
      if (to.row) {
        to.row.diedAt = now
        to.row.killedBy = label
      }
    }
  }

  /** 밀치기·띄우기. 저항만큼 줄이고, 0.4초보다 오래 뜨면 그동안 행동하지 못한다. */
  const push = (body: Body, from: Vec, knockBack: number, airborne: number) => {
    const k = knockBack * (1 - body.live.knockbackResistance)
    const a = airborne * (1 - body.live.airborneResistance)
    if (a > AIRBORNE_LOCK) body.airborneUntil = Math.max(body.airborneUntil, now + a)
    if (!(k > 0)) return
    const dx = body.pos.x - from.x
    const dz = body.pos.z - from.z
    const d = Math.hypot(dx, dz) || 1
    const travel = a > 0 ? k * a : k / PUSH_ONLY_SCALE
    body.pos.x += (dx / d) * travel
    body.pos.z += (dz / d) * travel
  }

  // ---- 목표 고르기 ----
  const pickEnemy = (from: Body, rule: string): Body | null => {
    const alive = enemies.filter((e) => e.alive)
    if (!alive.length) return null
    switch (rule) {
      case 'EnemyWithMaxHealth':
        return alive.reduce((a, b) => (b.maxHp > a.maxHp ? b : a))
      case 'EnemyWithMaxAttackPoint':
      case 'HighestAttackPoint':
        return alive.reduce((a, b) => (b.live.atk > a.live.atk ? b : a))
      case 'EnemyWithMaxDensity': {
        let best = alive[0]!
        let most = -1
        for (const e of alive) {
          const n = alive.filter((o) => dist(o.pos, e.pos) <= 3).length
          if (n > most) {
            most = n
            best = e
          }
        }
        return best
      }
      default:
        return alive.reduce((a, b) => (edge(from, b) < edge(from, a) ? b : a))
    }
  }

  const inRange = (from: Body, to: Body, range: number) => edge(from, to) <= range + from.hitRadius + 1e-6

  // ---- 스킬 효과 ----
  const alliesFor = (caster: Body, effect: CookieEffect): Body[] => {
    const pool = living()
    if (effect.target === 'self') return [caster]
    const byDistance = (list: Body[]) => [...list].sort((a, b) => dist(a.pos, caster.pos) - dist(b.pos, caster.pos))
    if (effect.target === 'allies') {
      const list = effect.excludeCaster ? pool.filter((a) => a !== caster) : pool
      return effect.maxTargets ? byDistance(list).slice(0, effect.maxTargets) : list
    }
    // ally: 시너지는 그 시너지를 받는 아군에게, 나머지는 가장 가까운 다른 아군에게(없으면 자신)
    const count = effect.maxTargets ?? 1
    let list = pool.filter((a) => a !== caster)
    if (effect.kind === 'synergy' && effect.property) {
      const receivers = list.filter((a) => a.spec?.receives.includes(effect.property as SynergyKey))
      if (receivers.length) list = receivers
    }
    const picked = byDistance(list).slice(0, count)
    return picked.length || effect.excludeCaster ? picked : [caster]
  }

  const enemiesFor = (primary: Body, effect: CookieEffect): Body[] => {
    if (effect.target === 'enemy') return [primary]
    const alive = enemies.filter((e) => e.alive).sort((a, b) => dist(a.pos, primary.pos) - dist(b.pos, primary.pos))
    return effect.maxTargets ? alive.slice(0, effect.maxTargets) : alive
  }

  const applyEffect = (caster: Body, target: Body, effect: CookieEffect, index: number) => {
    if (!target.alive) return
    const amp = effect.scalesWithSkillAmp ? 1 + caster.live.skillAmp / 100 : 1
    const durSteps = effect.durationScalesWithDurationSynergy ? (caster.live.synergy.dur ?? 0) : 0
    const duration = (effect.duration ?? Infinity) * (1 + durSteps)
    if (effect.kind === 'shield') {
      const amount = caster.maxHp * (effect.value ?? 0) * amp
      target.shield += amount
      if (caster.row) caster.row.shielding += amount
      return
    }
    if (effect.kind === 'stun') {
      if (!target.enemy?.ccImmune) target.stunnedUntil = Math.max(target.stunnedUntil, now + (effect.duration ?? 0))
      return
    }
    if (!['stat', 'synergy', 'pushResist', 'liftResist', 'dot'].includes(effect.kind)) return
    let value = (effect.value ?? 0) * amp
    // 시전자 공격력의 몇 %를 더하는 버프는 걸리는 순간의 공격력으로 정해진다.
    if (effect.kind === 'stat' && effect.valueBase === 'CastersAttackPoint') value = caster.live.atk * (effect.value ?? 0)
    const key = `${caster.index}:${index}`
    const held = target.mods.find((m) => m.key === key)
    if (held) {
      held.stacks = Math.min(held.stacks + 1, Math.max(1, effect.maxStack))
      held.expires = now + duration
      held.value = value
    } else {
      target.mods.push({
        key,
        effect,
        value,
        stacks: 1,
        expires: now + duration,
        nextTick: effect.kind === 'dot' ? now + (effect.tickSeconds ?? 1) : undefined,
        source: caster,
      })
    }
    refresh(target)
  }

  const castEffects = (caster: Body, primary: Body) => {
    const spec = caster.spec!
    spec.effects.forEach((effect, index) => {
      if (effect.onlyIn?.length && !(input.mode && effect.onlyIn.includes(input.mode))) return
      const enemySide = effect.target === 'enemy' || effect.target === 'enemies'
      const targets = enemySide ? enemiesFor(primary, effect) : alliesFor(caster, effect)
      for (const target of targets) {
        // 디버프·행동 제어는 기본 적용률에 내 집중 / 적 저항 비율을 곱한다(디버프 적용률 식).
        const chance =
          enemySide && effect.category !== 'Buff'
            ? debuffRate(spec.stats.focus, 0, target.enemy?.resist ?? 100, 0, effect.applyRate * 1e4)
            : effect.applyRate
        if (chance < 1 && random() >= chance) continue
        applyEffect(caster, target, effect, index)
      }
    })
  }

  const heal = (caster: Body, coefficient: number) => {
    if (!(coefficient > 0)) return
    const pool = living()
    if (!pool.length) return
    const target = pool.reduce((a, b) => (b.maxHp - b.hp > a.maxHp - a.hp ? b : a))
    const amount = Math.min(target.maxHp - target.hp, caster.live.atk * coefficient * (1 + caster.live.skillAmp / 100))
    if (amount > 0) {
      target.hp += amount
      if (caster.row) caster.row.healing += amount
    }
  }

  const cast = (caster: Body, rootIndex: number, primary: Body) => {
    const spec = caster.spec!
    const root = spec.roots[rootIndex]!
    const reach = bodyReach(dist(caster.pos, primary.pos), primary.hitRadius)
    const profile = castProfile(root.tree, caster.live.synergy, input.mode, root.cooldown, reach)
    dealToEnemy(caster, primary, profile.damage)
    if (profile.radius > 0 && profile.damage > 0) {
      // 범위 피해: 맞은 대상 주변의 다른 적도 같은 계수로 맞는다.
      for (const other of enemies) if (other !== primary && other.alive && dist(other.pos, primary.pos) <= profile.radius + other.hitRadius) dealToEnemy(caster, other, profile.damage)
    }
    heal(caster, profile.heal)
    if (rootIndex === mains[caster.index]) castEffects(caster, primary)
    if (caster.row) {
      caster.row.casts++
      if (caster.row.firstCastAt === null) caster.row.firstCastAt = now
    }
  }

  // ---- 보스 패턴 ----
  const strike = (event: Extract<SimEvent, { kind: 'strike' }>) => {
    const boss = bosses.find((b) => b.alive) ?? bosses[0]
    if (!boss) return
    const pool = living()
    if (!pool.length) return
    let victims: Body[] = []
    let origin: Vec = boss.pos
    const shape = event.shape
    if (shape.type === 'all') victims = pool
    else if (shape.type === 'nearest') victims = [pool.reduce((a, b) => (edge(boss, b) < edge(boss, a) ? b : a))]
    else if (shape.type === 'random') {
      const candidates = shape.within !== undefined ? pool.filter((c) => dist(c.pos, boss.pos) <= shape.within!) : pool
      if (!candidates.length) return
      const center = candidates[Math.floor(random() * candidates.length)] ?? candidates[0]!
      origin = { ...center.pos }
      victims = pool
        .filter((c) => dist(c.pos, origin) <= shape.radius + c.hitRadius)
        .sort((a, b) => dist(a.pos, origin) - dist(b.pos, origin))
        .slice(0, shape.limit ?? Infinity)
    } else if (shape.type === 'nearBoss') {
      victims = pool
        .filter((c) => dist(c.pos, boss.pos) <= shape.radius + c.hitRadius)
        .sort((a, b) => dist(a.pos, boss.pos) - dist(b.pos, boss.pos))
        .slice(0, shape.limit)
    } else {
      // 직선 탄: 진행 방향에서 폭 안에 들어오는 쿠키 가운데 가장 먼저 닿는 하나
      const angle = (shape.angleDeg * Math.PI) / 180
      const dx = Math.cos(angle)
      const dz = Math.sin(angle)
      let first: Body | null = null
      let firstAt = Infinity
      for (const c of pool) {
        const rx = c.pos.x - boss.pos.x
        const rz = c.pos.z - boss.pos.z
        const along = rx * dx + rz * dz
        const side = Math.abs(rx * dz - rz * dx)
        if (along < 0 || side > c.hitRadius + shape.width || along - c.hitRadius > shape.reach) continue
        if (along < firstAt) {
          firstAt = along
          first = c
        }
      }
      victims = first ? [first] : []
    }
    for (const victim of victims) {
      dealToCookie(boss, victim, event.multiplier, event.label)
      push(victim, origin, event.knockBack, event.airborne)
    }
  }

  const spawn = (event: Extract<SimEvent, { kind: 'spawn' }>) => {
    const tier = input.addTiers[event.tier]
    const anchor = bosses[0]?.pos
    if (!tier || !anchor) return
    for (const group of event.groups) {
      for (let i = 0; i < group.count; i++) {
        const sx = (random() - 0.5) * 2 * group.scatter
        const sz = (random() - 0.5) * 2 * group.scatter
        const add = enemyBody({ ...tier, kind: event.tier, isBoss: false, pos: { x: anchor.x + group.dx + sx, z: anchor.z - group.dz + sz } }, enemies.length, now)
        enemies.push(add)
        addsSpawned++
      }
    }
  }

  const bossBuff = (event: Extract<SimEvent, { kind: 'bossBuff' }>) => {
    for (const boss of bosses) {
      boss.bossDr = event.drMode === 'set' ? event.dr : 1 - (1 - boss.bossDr) * (1 - event.dr)
      boss.atkMult = Math.max(boss.atkMult, event.atkMult)
      refresh(boss)
    }
  }

  const sample = () => {
    const bossHp = finiteBoss && bossMaxHp ? bosses.reduce((sum, b) => sum + (Number.isFinite(b.hp) ? b.hp : 0), 0) / bossMaxHp : null
    samples.push({ t: Number(now.toFixed(3)), cum: allies.map((a) => a.row!.damage), bossHp, alive: allies.filter((a) => a.alive).length })
  }

  let lastStep = 0
  for (let step = 0; step <= steps; step++) {
    now = Number((step * STEP).toFixed(3))
    lastStep = step

    // 1. 버프 만료·지속 피해
    for (const body of [...allies, ...enemies]) {
      if (!body.alive || !body.mods.length) continue
      for (const mod of body.mods) {
        if (mod.effect.kind !== 'dot' || !mod.source || mod.nextTick === undefined) continue
        const tick = mod.effect.tickSeconds ?? 1
        while (mod.nextTick <= now + 1e-9 && mod.nextTick <= mod.expires + 1e-9 && body.alive) {
          dealToEnemy(mod.source, body, mod.value * mod.stacks)
          mod.nextTick += tick
        }
      }
      const before = body.mods.length
      body.mods = body.mods.filter((m) => m.expires > now)
      if (body.mods.length !== before) refresh(body)
    }

    // 2. 보스 패턴
    while (eventCursor < events.length && events[eventCursor]!.t <= now + 1e-9) {
      const event = events[eventCursor]!
      if (event.kind === 'strike') strike(event)
      else if (event.kind === 'spawn') spawn(event)
      else bossBuff(event)
      eventCursor++
    }

    // 3. 쿠키
    for (const body of allies) {
      if (!body.alive) continue
      const spec = body.spec!
      if (now < body.airborneUntil || now < body.lockedUntil - 1e-9 || now < body.stunnedUntil) continue
      const target = pickEnemy(body, spec.targeting)
      if (!target) continue
      const reach = spec.range + target.hitRadius + body.hitRadius
      const d = dist(body.pos, target.pos)
      if (d > reach) {
        const move = Math.min(body.live.moveSpeed * STEP, d - reach) / d
        body.pos.x += (target.pos.x - body.pos.x) * move
        body.pos.z += (target.pos.z - body.pos.z) * move
        continue
      }
      if (!inRange(body, target, spec.range)) continue
      body.row!.activeSeconds += STEP
      for (let i = 0; i < spec.roots.length; i++) {
        const root = spec.roots[i]!
        if (!root.counted || !(root.effectiveCooldown > 0) || now < (body.cooldowns[i] ?? 0) - 1e-9) continue
        body.cooldowns[i] = now + hastedCycle(root.effectiveCooldown, spec.stats.haste)
        cast(body, i, target)
        if (root.anim > 0) {
          body.lockedUntil = now + root.anim
          break
        }
      }
    }

    // 4. 소환된 적
    for (const body of enemies) {
      if (!body.alive || body.enemy?.isBoss) continue
      if (now >= body.expiresAt) {
        body.alive = false
        continue
      }
      const attack = body.enemy?.attack
      if (!attack || now < body.airborneUntil || now < body.stunnedUntil) continue
      const pool = living()
      if (!pool.length) continue
      const target = pool.reduce((a, b) => (edge(body, b) < edge(body, a) ? b : a))
      const swing = !body.swung && attack.opener ? { ...attack, ...attack.opener } : attack
      const reach = (swing.attackRange ?? 0.5) + target.hitRadius + body.hitRadius
      const d = dist(body.pos, target.pos)
      if (d > reach) {
        const move = Math.min(body.live.moveSpeed * STEP, d - reach) / d
        body.pos.x += (target.pos.x - body.pos.x) * move
        body.pos.z += (target.pos.z - body.pos.z) * move
        continue
      }
      if (now < body.nextSwing) continue
      body.swung = true
      body.nextSwing = now + (swing.cooldown ?? 2)
      const victims = swing.radius
        ? pool
            .filter((c) => dist(c.pos, target.pos) <= swing.radius! + c.hitRadius)
            .sort((a, b) => dist(a.pos, target.pos) - dist(b.pos, target.pos))
            .slice(0, swing.hitCountLimit ?? Infinity)
        : [target]
      for (const victim of victims) {
        dealToCookie(body, victim, swing.damageMultiplier ?? 1, 'add')
        push(victim, body.pos, swing.knockBack ?? 0, swing.airborne ?? 0)
      }
    }

    // 5. 처치 확인과 기록
    if (finiteBoss && killTime === null && bosses.every((b) => !b.alive)) killTime = now
    if (step % sampleEvery === 0) sample()
    if (killTime !== null && input.stopOnKill) break
    if (!living().length) {
      if (step % sampleEvery !== 0) sample()
      break
    }
  }
  if (samples[samples.length - 1]?.t !== now) sample()

  const rows = allies.map((a) => a.row!)
  const totalDamage = rows.reduce((sum, r) => sum + r.damage, 0)
  return {
    elapsed: Number((lastStep * STEP).toFixed(3)),
    timeLimit: input.duration,
    killed: killTime !== null,
    killTime,
    bossMaxHp,
    bossDamage: rows.reduce((sum, r) => sum + r.bossDamage, 0),
    totalDamage,
    rows,
    samples,
    addsSpawned,
    addsKilled,
    deaths: rows.filter((r) => r.diedAt !== null).length,
  }
}

/**
 * 움직임·보스 패턴 없이, 사거리 안에 서서 쉬지 않고 스킬을 쓸 때의 초당 피해(기댓값).
 * 던전 출전 쿠키를 자동으로 고를 때 순위를 매기는 데 쓴다.
 */
export function steadyDps(spec: CookieSpec, target: HitTarget, mode: SimMode, powerMultiplier = 1): number {
  const source: HitSource = {
    atk: spec.stats.atk,
    critRate: spec.stats.critRate,
    critDamage: spec.stats.critDamage,
    skillAmp: spec.stats.skillAmp,
    bossDamage: spec.stats.bossDamage,
    elementDamage: spec.stats.elementDamage,
    accuracy: spec.stats.accuracy,
    accuracyRate: spec.stats.accuracyRate,
    element: spec.element,
  }
  let dps = 0
  for (const root of spec.roots) {
    if (!root.counted || !(root.effectiveCooldown > 0)) continue
    const coef = castProfile(root.tree, spec.synergy, mode, root.cooldown).damage
    dps += skillHit(source, coef, target, powerMultiplier, { kind: 'average' }) / hastedCycle(root.effectiveCooldown, spec.stats.haste)
  }
  return dps
}
