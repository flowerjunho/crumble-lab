import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CookieDb } from '../../../types'
import type { GrowthData } from '../growth/growth'
import type { EogStagesData } from '../stages/stageInfoData'
import { byRange, dungeonEvents, dungeonInput, guildInput, placeCookies, stageInput, type BuildSettings } from './build'
import { seededRandom, simulate, steadyDps, type CookieSpec, type EnemySpec, type SimInput } from './engine'
import { skillHit } from './hit'
import type { SimData, SkillNode, SkillRoot } from './simData'
import { bodyReach, castProfile, countValue, scaleValue } from './skillTree'

const root = join(__dirname, '..', '..', '..', '..')
const read = <T,>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
const data = read<SimData>('public/data/sim.json')
const growth = read<GrowthData>('public/data/growth.json')
const cookies = read<CookieDb>('public/data/cookie-db.json').cookies
const stages = read<EogStagesData>('public/data/eog-stages.json')

const settings: BuildSettings = {
  level: 100,
  grade: 10,
  loadout: { critRate: 25, critDamage: 80, skillAmp: 10, haste: 10 },
  survival: { hpPct: 0, defPct: 0, damageReduction: 0 },
  pets: [],
  seed: 7,
  hits: 'average',
}

/** 시험용 쿠키: 4초마다 공격력 200% 한 대, 효과 없음 */
function dummyCookie(over: Partial<CookieSpec> = {}, tree: SkillNode = { key: 'hit', dmg: 2, cooldown: 4 }): CookieSpec {
  const skill: SkillRoot = { key: 'hit', cooldown: 4, effectiveCooldown: 4, anim: 0.3, counted: true, support: false, coef: 2, targeting: null, tree }
  return {
    eid: 'test',
    element: 'fire',
    receives: [],
    stats: {
      atk: 1000,
      def: 100,
      hp: 50000,
      critRate: 10,
      critDamage: 50,
      skillAmp: 20,
      haste: 0,
      bossDamage: 0,
      elementDamage: 0,
      accuracy: 100,
      accuracyRate: 0,
      avoidance: 100,
      focus: 100,
      damageReduction: 0,
      moveSpeed: 4,
    },
    range: 3,
    hitRadius: 0.4,
    targeting: 'EnemyWithMinDistance',
    startCooldownReduction: 0,
    knockbackResistance: 0,
    airborneResistance: 0,
    roots: [skill],
    effects: [],
    synergy: {},
    pos: { x: 0, z: 0 },
    ...over,
  }
}

/** 움직이지 않고 맞기만 하는 허수아비(방어력 0, 회피 0) */
const staticDummy = (hp = Infinity): EnemySpec => ({
  kind: 'dummy',
  hp,
  atk: 0,
  def: 0,
  avoidance: 0,
  accuracy: 100,
  resist: 100,
  element: null,
  isBoss: false,
  hitRadius: 1,
  pos: { x: 0, z: 3 },
  ccImmune: true,
  speed: 0,
})

const run = (over: Partial<SimInput> = {}) =>
  simulate({
    mode: null,
    duration: 60,
    seed: 1,
    hits: 'average',
    powerMultiplier: 1,
    cookies: [dummyCookie()],
    bosses: [staticDummy()],
    events: [],
    addTiers: {},
    stopOnKill: true,
    ...over,
  })

describe('전투 시뮬레이터 데이터', () => {
  it('모든 쿠키의 스킬 나무가 있고 쿠키 도감과 키가 맞다', () => {
    expect(Object.keys(data.skills)).toHaveLength(cookies.length)
    for (const cookie of cookies) {
      const roots = data.skills[cookie.eid]
      expect(roots, cookie.name.ko).toBeDefined()
      expect(roots!.some((r) => r.counted && r.effectiveCooldown > 0)).toBe(true)
    }
  })

  it('배치 칸: 메인·토벌전 12칸, 던전 40칸이 보스보다 아래(−z)에 있다', () => {
    expect(data.lineup.slots).toHaveLength(12)
    expect(data.dungeon.slots).toHaveLength(40)
    for (const s of [...data.lineup.slots, ...data.dungeon.slots]) expect(s.z).toBeLessThan(data.dungeon.bossPos.z)
  })

  it('크럼블 던전: 제한 60초, 4단계, 보스 공격력 200·방어력 100', () => {
    expect(data.dungeon.timeLimit).toBe(60)
    expect(data.dungeon.phases.map((p) => p.opensAt)).toEqual([0, 15, 30, 45])
    expect(data.dungeon.boss).toMatchObject({ atk: 200, def: 100, hitRadius: 5 })
    expect(data.dungeon.adds.soldier1).toMatchObject({ hp: 100, atk: 200 })
  })

  it('길드 토벌전: 피냐타는 어둠 속성, 제한 60초, 전투력 배율 1.2', () => {
    expect(data.guild.boss.element).toBe('dark')
    expect(data.guild.timeLimit).toBe(60)
    expect(data.guild.powerMultiplier).toBe(1.2)
    expect(data.guild.timeline.filter((e) => e.kind === 'gift')).toHaveLength(40)
  })
})

describe('스킬 나무 계수', () => {
  it('시너지가 없을 때 한 번 시전 계수가 EOG가 적은 계수와 거의 모두 같다', () => {
    let same = 0
    let total = 0
    for (const roots of Object.values(data.skills))
      for (const r of roots) {
        if (!r.counted) continue
        total++
        const ours = castProfile(r.tree, {}, null, r.cooldown, () => 1).damage
        if (Math.abs(ours - r.coef) <= 1e-6 * Math.max(1, r.coef)) same++
      }
    // 겹쳐 쌓이는 지속 피해 하나(바늘)는 우리 나무 계산이 한 번 붙는 값만 센다.
    expect(same).toBeGreaterThanOrEqual(total - 2)
  })

  it('샤르도네맛 쿠키: 한 번 시전 계수 2.5', () => {
    const roots = data.skills.cookie4011!
    expect(castProfile(roots[0]!.tree, {}, null, roots[0]!.cooldown).damage).toBeCloseTo(2.5, 6)
  })

  it('개수 시너지는 단계 × 배율만큼 더하고, 비율 시너지는 (1 + 비율 × 배율)을 곱한다', () => {
    expect(countValue({ v: 4, k: 'burst', m: 2 }, { burst: 2 })).toBe(8)
    expect(countValue({ v: 1, k: 'hit', m: 1 }, { hit: 1.5 })).toBe(2)
    expect(scaleValue({ v: 2, k: 'dur', m: 1 }, { dur: 0.75 })).toBeCloseTo(3.5, 9)
    // 0.3초마다 때리는 장판: 지속 2초 → 6번, 지속 시너지 50% → 3초 → 10번
    const tree: SkillNode = { key: 'pool', dmg: 0.1, life: { v: 2, k: 'dur', m: 1 }, period: 0.3, calc: 'PeriodicallyEachTarget' }
    expect(castProfile(tree, {}, null, 5).damage).toBeCloseTo(0.6, 9)
    expect(castProfile(tree, { dur: 0.5 }, null, 5).damage).toBeCloseTo(1.0, 9)
  })

  it('부채꼴 탄: 큰 보스에 가까이 붙으면 여러 발이 닿는다', () => {
    const fan = { angle: 30, at: 'spread' as const, centered: false }
    expect(bodyReach(8, 5)(fan, 3)).toBe(3)
    expect(bodyReach(40, 0.4)(fan, 3)).toBe(1)
  })
})

describe('엔진', () => {
  it('쿠키 한 명 vs 허수아비: 시전 횟수 × 한 대 피해와 정확히 같고, 이론 DPS × 60초와 10% 안으로 맞는다', () => {
    const result = run()
    const spec = dummyCookie()
    // 4초 쿨타임, 시작 쿨타임 감소 없음 → 4, 8, …, 60초에 15번
    expect(result.rows[0]!.casts).toBe(15)
    const perCast = 1000 * 2 * 1.2 * (1 + 0.1 * 0.5)
    expect(result.totalDamage).toBeCloseTo(15 * perCast, 6)
    const dps = steadyDps(spec, { def: 0, avoidance: 0, critResist: 0, damageReduction: 0, element: null, isBoss: false }, null)
    expect(dps).toBeCloseTo(perCast / 4, 6)
    expect(Math.abs(result.totalDamage - dps * 60) / (dps * 60)).toBeLessThan(0.1)
  })

  it('스킬가속 100이면 쿨타임이 절반이 되어 시전이 두 배 가까이 늘어난다', () => {
    const fast = run({ cookies: [dummyCookie({ stats: { ...dummyCookie().stats, haste: 100 } })] })
    expect(fast.rows[0]!.casts).toBe(30)
  })

  it('멀리서 시작하면 걸어가는 동안은 쓰지 못한다', () => {
    const far = run({ cookies: [dummyCookie({ pos: { x: 0, z: -20 } })] })
    // 사거리 끝(3 + 1 + 0.4)까지 23 − 4.4 = 18.6 거리를 초당 4로 걷는다 → 4.65초 뒤부터
    expect(far.rows[0]!.firstCastAt).toBeGreaterThan(4.6)
    expect(far.rows[0]!.casts).toBeLessThan(15)
  })

  it('제한 시간을 지킨다: 쓰러지지 않는 대상이면 60초 끝까지 돌고 처치 실패', () => {
    const result = run()
    expect(result.killed).toBe(false)
    expect(result.elapsed).toBe(60)
    expect(result.samples[result.samples.length - 1]!.t).toBe(60)
  })

  it('체력이 있는 보스를 쓰러뜨리면 그 시각에 멈추고, 넘친 피해는 세지 않는다', () => {
    const perCast = 1000 * 2 * 1.2 * 1.05
    const result = run({ bosses: [staticDummy(perCast * 3)] })
    expect(result.killed).toBe(true)
    expect(result.killTime).toBe(12)
    expect(result.totalDamage).toBeCloseTo(perCast * 3, 6)
    expect(result.samples[result.samples.length - 1]!.bossHp).toBe(0)
  })

  it('같은 시드면 결과가 같고, 시드가 다르면 굴림 결과가 달라진다', () => {
    const input = dungeonInput(placeCookies(cookies.slice(0, 40), data.dungeon.slots, data, growth, { ...settings, hits: 'roll' }, 'CRUMBLE_DUNGEON'), data, {
      ...settings,
      hits: 'roll',
    })
    const a = simulate(input)
    const b = simulate(input)
    const c = simulate({ ...input, seed: input.seed + 1 })
    expect(b).toEqual(a)
    expect(c.totalDamage).not.toBe(a.totalDamage)
  })

  it('난수는 0 이상 1 미만이고 시드마다 순서가 같다', () => {
    const r1 = seededRandom(42)
    const r2 = seededRandom(42)
    for (let i = 0; i < 100; i++) {
      const v = r1()
      expect(v).toBe(r2())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('치명확률 200%를 굴리면 두 번 치명이 확정으로 터진다', () => {
    const source = { atk: 100, critRate: 200, critDamage: 50, skillAmp: 0, bossDamage: 0, elementDamage: 0, accuracy: 100, accuracyRate: 0, element: null }
    const target = { def: 0, avoidance: 0, critResist: 0, damageReduction: 0, element: null, isBoss: false }
    expect(skillHit(source, 1, target, 1, { kind: 'roll', random: () => 0.99 })).toBe(200)
    expect(skillHit(source, 1, target, 1, { kind: 'average' })).toBe(200)
  })
})

describe('보스 시나리오', () => {
  it('던전 시간표: 단계마다 나선 탄 66발·충격파 1번, 번개는 단계 표의 번개 수 + 소환 번개 수', () => {
    const events = dungeonEvents(data)
    const strikes = events.filter((e) => e.kind === 'strike')
    expect(strikes.filter((e) => e.label === 'spiral')).toHaveLength(4 * 2 * 33)
    expect(strikes.filter((e) => e.label === 'shockwave').map((e) => e.t)).toEqual([11.9, 26.9, 41.9, 56.9])
    const bolts = data.dungeon.phases.reduce((sum, p) => sum + p.strikes + p.carriers.length, 0)
    expect(strikes.filter((e) => e.label === 'lightning')).toHaveLength(bolts)
    expect(events.filter((e) => e.kind === 'bossBuff').map((e) => e.t)).toEqual([13.5, 28.5, 43.5])
  })

  it('던전 40명: 점수(보스에게 준 피해)가 양수이고 누적 피해 기록이 줄지 않는다', () => {
    const lineup = byRange(cookies.slice(0, 40))
    const result = simulate(dungeonInput(placeCookies(lineup, data.dungeon.slots, data, growth, settings, 'CRUMBLE_DUNGEON'), data, settings))
    expect(result.bossMaxHp).toBeNull()
    expect(result.bossDamage).toBeGreaterThan(0)
    expect(result.addsSpawned).toBeGreaterThan(0)
    for (let i = 1; i < result.samples.length; i++)
      result.samples[i]!.cum.forEach((v, j) => expect(v).toBeGreaterThanOrEqual(result.samples[i - 1]!.cum[j]!))
  })

  it('길드 토벌전: 쓰러지지 않는 피냐타에 60초 동안 피해를 준다', () => {
    const result = simulate(guildInput(placeCookies(cookies.slice(0, 12), data.lineup.slots, data, growth, settings, 'GUILD_RAID'), data, settings))
    expect(result.killed).toBe(false)
    expect(result.bossDamage).toBeGreaterThan(0)
  })

  it('1-1 보스는 만렙 쿠키 12명이면 몇 초 안에 쓰러진다', () => {
    const row = stages.rows[0]!
    const team = placeCookies(cookies.slice(0, 12), data.lineup.slots, data, growth, settings, null)
    const result = simulate(stageInput(row, team, data, settings, { bossAttacks: true, attackEvery: 2, attackMultiplier: 1, powerMultiplier: 1 }))
    expect(result.killed).toBe(true)
    expect(result.killTime!).toBeLessThan(row[12] ?? 60)
    expect(result.bossDamage).toBeCloseTo(row[8], 6)
  })
})
