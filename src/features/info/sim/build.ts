import type { CookieEntry, CookieElement } from '../../../types'
import { cookieStats, type GrowthData } from '../growth/growth'
import { applyPets, battleStats, type Loadout, type PetPick } from '../calc/damage'
import { ADD_CRIT, type CookieSpec, type EnemySpec, type SimEvent, type SimInput, type SimMode, type Vec } from './engine'
import type { EogStageRow } from '../stages/stageInfoData'
import type { AddAttack, AddStats, SimData, SkillRoot, SlotPos } from './simData'

/**
 * 화면에서 고른 쿠키·펫·성장 설정과 sim.json을 엔진 입력(SimInput)으로 바꾼다.
 * 능력치는 성장(레벨·별) → 추가 능력치(장비·슈가룬 자리) → 펫 순서로 피해 계산기(calc/damage.ts)와 같은 함수로 쌓는다.
 */

export interface BuildSettings {
  level: number
  grade: number
  /** 모든 쿠키에 똑같이 더하는 추가 능력치(인게임 표기 단위, % 값은 10 = 10%) */
  loadout: Partial<Loadout>
  /** 버티는 쪽 추가 능력치(%). 피해 계산기에는 없는 값이라 시뮬레이터에서만 더한다. */
  survival: { hpPct: number; defPct: number; damageReduction: number }
  pets: PetPick[]
  seed: number
  hits: 'average' | 'roll'
}

/** 쿠키 하나를 엔진이 쓰는 모양으로 바꾼다. 위치는 배치 칸에서 정한다. */
export function cookieSpec(cookie: CookieEntry, roots: SkillRoot[], growth: GrowthData, settings: BuildSettings, mode: SimMode, pos: Vec): CookieSpec {
  const base = cookieStats(growth, cookie, settings.level, settings.grade)
  const pets = applyPets(settings.pets, cookie, mode)
  const stats = battleStats(base, settings.loadout, pets.effects)
  // battleStats가 다루지 않는 회피·집중 펫 효과는 수치형만 여기서 더한다.
  const flat = (stat: string) => pets.effects.filter((e) => e.stat === stat && e.how === 'flat').reduce((sum, e) => sum + e.value, 0)
  return {
    eid: cookie.eid,
    element: cookie.element,
    receives: cookie.synergy.receives,
    stats: {
      atk: stats.atk,
      def: Math.floor(stats.def * (1 + settings.survival.defPct / 100)),
      hp: Math.floor(stats.hp * (1 + settings.survival.hpPct / 100)),
      critRate: stats.critRate,
      critDamage: stats.critDamage,
      skillAmp: stats.skillAmp,
      haste: stats.haste,
      bossDamage: stats.bossDamage,
      elementDamage: stats.elementDamage,
      accuracy: stats.accuracy,
      accuracyRate: stats.accuracyRate,
      avoidance: base.avoidance + flat('avoidance'),
      focus: base.focus + flat('focus'),
      damageReduction: 1 - (1 - stats.damageReduction) * (1 - Math.min(95, Math.max(0, settings.survival.damageReduction)) / 100),
      moveSpeed: cookie.combat.moveSpeed * (1 + stats.moveSpeedPct / 100),
    },
    range: cookie.combat.range,
    hitRadius: cookie.combat.hitRadius,
    targeting: cookie.combat.targeting,
    startCooldownReduction: cookie.combat.startCooldownReduction,
    knockbackResistance: cookie.combat.knockbackResistance,
    airborneResistance: cookie.combat.airborneResistance,
    roots,
    effects: cookie.effects,
    synergy: pets.synergy,
    pos,
  }
}

/** 고른 순서대로 배치 칸에 놓는다. 칸보다 많이 고르면 남는 쿠키는 빠진다. */
export function placeCookies(cookies: CookieEntry[], slots: SlotPos[], data: SimData, growth: GrowthData, settings: BuildSettings, mode: SimMode): CookieSpec[] {
  return cookies.slice(0, slots.length).map((cookie, i) => {
    const slot = slots[i]!
    return cookieSpec(cookie, data.skills[cookie.eid] ?? [], growth, settings, mode, { x: slot.x, z: slot.z })
  })
}

/**
 * 던전 40칸: 사거리가 짧은 쿠키부터 앞 칸(1번 칸부터)에 놓는다.
 * 게임이 칸을 정하는 규칙은 공개되지 않아, 사거리 순으로 채우는 것으로 가정했다. 같은 사거리는 고른 순서를 지킨다.
 */
export function byRange(cookies: CookieEntry[]): CookieEntry[] {
  return cookies
    .map((cookie, i) => ({ cookie, i }))
    .sort((a, b) => a.cookie.combat.range - b.cookie.combat.range || a.i - b.i)
    .map(({ cookie }) => cookie)
}

const elementOf = (value: string | null | undefined): CookieElement | null =>
  value === 'fire' || value === 'water' || value === 'grass' || value === 'light' || value === 'dark' ? value : null

const add = (stats: AddStats, attack: AddAttack & { opener?: Partial<AddAttack> }, element: CookieElement | null): Omit<EnemySpec, 'pos' | 'isBoss' | 'kind'> => ({
  hp: stats.hp,
  atk: stats.atk,
  def: stats.def,
  avoidance: 100,
  accuracy: 100,
  resist: 100,
  element,
  hitRadius: stats.hitRadius,
  ccImmune: Boolean(stats.ccImmune),
  speed: stats.speed,
  life: stats.life,
  attack,
  crit: ADD_CRIT,
})

// ---------------------------------------------------------------------------
// 메인 스테이지
// ---------------------------------------------------------------------------

export interface StageOptions {
  /** 보스가 공격하는 것으로 볼지(게임 데이터가 없어 우리가 정한 가정) */
  bossAttacks: boolean
  /** 보스 공격 가정: 몇 초마다, 공격력의 몇 배로 가장 가까운 쿠키를 친다 */
  attackEvery: number
  attackMultiplier: number
  powerMultiplier: number
}

export const STAGE_ATTACK_DEFAULTS = { attackEvery: 2, attackMultiplier: 1 }

/** 메인 스테이지 보스. 여러 마리면 보스 자리 앞에 가로로 늘어세운다. */
export function stageInput(row: EogStageRow, cookies: CookieSpec[], data: SimData, settings: BuildSettings, options: StageOptions): SimInput {
  const [, , , accuracyNeeded, focusNeeded, enemyAccuracy, , spawns, hp, atk, def, , timeLimit] = row
  const count = Math.max(1, spawns)
  const big = count === 1
  const radius = big ? data.defaults.bossBody : 1.5
  const perRow = 5
  const bosses: EnemySpec[] = Array.from({ length: count }, (_, i) => {
    const r = Math.floor(i / perRow)
    const inRow = Math.min(perRow, count - r * perRow)
    const c = i % perRow
    return {
      kind: 'boss',
      hp,
      atk,
      def: def ?? 0,
      avoidance: accuracyNeeded,
      accuracy: enemyAccuracy,
      resist: focusNeeded,
      element: null,
      isBoss: true,
      hitRadius: radius,
      pos: { x: data.lineup.bossPos.x + (c - (inRow - 1) / 2) * (radius * 2 + 1), z: data.lineup.bossPos.z + r * (radius * 2 + 1) },
      ccImmune: true,
      speed: 0,
    }
  })
  const duration = timeLimit ?? 60
  const events: SimEvent[] = []
  if (options.bossAttacks && options.attackEvery > 0) {
    for (let t = options.attackEvery; t <= duration; t += options.attackEvery) {
      events.push({ t, kind: 'strike', label: 'basic', multiplier: options.attackMultiplier, knockBack: 0, airborne: 0, shape: { type: 'nearest' } })
    }
  }
  return {
    mode: null,
    duration,
    seed: settings.seed,
    hits: settings.hits,
    powerMultiplier: options.powerMultiplier,
    cookies,
    bosses,
    events,
    addTiers: {},
    stopOnKill: true,
  }
}

// ---------------------------------------------------------------------------
// 길드 토벌전(지나치게 무거워진 피냐타)
// ---------------------------------------------------------------------------

export function guildInput(cookies: CookieSpec[], data: SimData, settings: BuildSettings): SimInput {
  const g = data.guild
  const element = elementOf(g.boss.element)
  const events: SimEvent[] = []
  for (const e of g.timeline) {
    if (e.kind === 'addSpawn') events.push({ t: e.t, kind: 'spawn', tier: e.tier, groups: e.groups })
    else {
      const knockBack = e.knockBack ?? 0
      const airborne = e.airborne ?? 0
      const shape =
        e.kind === 'wave'
          ? ({ type: 'all' } as const)
          : e.kind === 'gift'
            ? ({ type: 'random', radius: e.radius ?? 1, limit: e.pickLimit } as const)
            : ({ type: 'nearBoss', radius: e.radius ?? 10, limit: e.hits ?? 1 } as const)
      events.push({ t: e.t, kind: 'strike', label: e.kind, multiplier: e.damageMultiplier, knockBack, airborne, shape })
    }
  }
  // 단계마다 피해 감소가 먼저 걸리고(drStart), 조금 뒤 공격력이 오른다(start). 피해 감소는 단계 값으로 바뀐다.
  for (const phase of g.phases) {
    if (!phase.inTime) continue
    if (phase.drStart !== undefined && phase.drStart < phase.start) events.push({ t: phase.drStart, kind: 'bossBuff', dr: phase.dr, drMode: 'set', atkMult: 0 })
    events.push({ t: phase.start, kind: 'bossBuff', dr: phase.dr, drMode: 'set', atkMult: phase.atkMult })
  }
  const addTiers = Object.fromEntries(Object.entries(g.adds).map(([tier, stats]) => [tier, add(stats, g.addAttack, elementOf('dark'))]))
  return {
    mode: 'GUILD_RAID',
    duration: g.timeLimit,
    seed: settings.seed,
    hits: settings.hits,
    powerMultiplier: g.powerMultiplier,
    cookies,
    bosses: [
      {
        kind: 'pinata',
        hp: Infinity,
        atk: g.boss.atk,
        def: g.boss.def,
        avoidance: g.boss.avoidance,
        accuracy: 100,
        resist: 100,
        element,
        isBoss: true,
        hitRadius: g.boss.hitRadius,
        pos: { ...g.bossPos },
        ccImmune: g.boss.ccImmune,
        speed: 0,
      },
    ],
    events,
    addTiers,
    stopOnKill: false,
  }
}

// ---------------------------------------------------------------------------
// 크럼블 던전(황금갓방울)
// ---------------------------------------------------------------------------

/** 황금 방울 종류: soldier1 → soldier */
export const addKind = (tier: string): 'soldier' | 'mage' | 'golem' => (tier.startsWith('mage') ? 'mage' : tier.startsWith('golem') ? 'golem' : 'soldier')

/** 번개가 떨어질 쿠키를 고르는 범위(보스에서 이 거리 안) */
export const LIGHTNING_PICK_RANGE = 20

/**
 * 던전 단계 표에서 보스 패턴 시간표를 만든다. 단계마다
 *   나선 탄막(두 갈래로 돌며 쏘는 탄, 한 발은 처음 닿는 쿠키 하나만 맞힌다) → 번개 여러 번(번개마다 황금병사방울 소환)
 *   → 단계 중간에 황금법사방울·황금골렘방울 소환 번개 → 단계 끝 무렵 전체 충격파.
 * 보스 강화는 정해진 시각에 한 번씩 걸리고, 피해 감소는 (1 − a)(1 − b)로 겹친다고 가정했다.
 */
export function dungeonEvents(data: SimData): SimEvent[] {
  const d = data.dungeon
  const round = (t: number) => Math.round(t * 1000) / 1000
  const events: SimEvent[] = []
  const bolt = (t: number): SimEvent => ({
    t,
    kind: 'strike',
    label: 'lightning',
    multiplier: d.attacks.lightning.damageMultiplier,
    knockBack: d.attacks.lightning.knockBack,
    airborne: d.attacks.lightning.airborneDuration,
    shape: { type: 'random', radius: d.attacks.lightning.strikeRadius, within: LIGHTNING_PICK_RANGE },
  })
  for (const phase of d.phases) {
    const open = phase.opensAt
    const s = d.spiral
    for (const emitter of s.emitters) {
      for (let i = 0; i < s.bulletsEmitted; i++) {
        const elapsed = s.firstBulletAt + i * s.bulletInterval
        events.push({
          t: round(open + d.timing.spiralAt + elapsed),
          kind: 'strike',
          label: 'spiral',
          multiplier: d.attacks.spiral.damageMultiplier,
          knockBack: d.attacks.spiral.knockBack,
          airborne: 0,
          // 시계 방향(+)은 각도가 줄어드는 쪽으로 돈다. 0°는 +x, −90°가 쿠키 쪽(−z)이다.
          shape: { type: 'ray', angleDeg: emitter.startAngleDeg - emitter.rotationSpeed * i * s.bulletInterval, width: s.bulletRadius, reach: s.bulletReach },
        })
      }
    }
    for (let i = 0; i < phase.strikes; i++) {
      const t = round(open + d.timing.lightningAt + d.timing.firstStrikeDelay + d.timing.strikeInterval * i)
      events.push(bolt(t), { t, kind: 'spawn', tier: phase.strikeTier, groups: phase.strikeGroups })
    }
    for (const carrier of phase.carriers) {
      const t = round(open + d.timing.lightningAt + carrier.at)
      events.push(bolt(t), { t, kind: 'spawn', tier: carrier.tier, groups: carrier.groups })
    }
    events.push({
      t: round(open + d.timing.shockwaveCarrierAt + d.timing.carrierToHit),
      kind: 'strike',
      label: 'shockwave',
      multiplier: d.attacks.shockwave.damageMultiplier,
      knockBack: d.attacks.shockwave.knockBack,
      airborne: d.attacks.shockwave.airborneDuration,
      shape: { type: 'all' },
    })
  }
  for (const buff of d.bossBuffs) events.push({ t: buff.appliesAt, kind: 'bossBuff', dr: buff.dr, drMode: 'stack', atkMult: buff.atkMultiplier })
  return events.sort((a, b) => a.t - b.t)
}

export function dungeonInput(cookies: CookieSpec[], data: SimData, settings: BuildSettings, options: { adds: boolean } = { adds: true }): SimInput {
  const d = data.dungeon
  const addTiers = Object.fromEntries(Object.entries(d.adds).map(([tier, stats]) => [tier, add(stats, d.addAttacks[addKind(tier)], null)]))
  const events = dungeonEvents(data).filter((e) => options.adds || e.kind !== 'spawn')
  return {
    mode: 'CRUMBLE_DUNGEON',
    duration: d.timeLimit,
    seed: settings.seed,
    hits: settings.hits,
    powerMultiplier: 1,
    cookies,
    bosses: [
      {
        kind: 'golden',
        hp: Infinity,
        atk: d.boss.atk,
        def: d.boss.def,
        avoidance: d.boss.avoidance,
        accuracy: 100,
        resist: d.boss.resist,
        element: null,
        isBoss: true,
        hitRadius: d.boss.hitRadius,
        pos: { ...d.bossPos },
        ccImmune: d.boss.ccImmune,
        speed: 0,
      },
    ],
    events,
    addTiers,
    stopOnKill: false,
  }
}
