import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CookieDb, CookieEffect, PetDb } from '../../../types'
import type { GrowthData } from '../growth/growth'
import { CROWD_TARGETS, areaShare, cookieDps, defShredGain, type Attacker } from './dps'
import { DEFAULT_BUILD, TEAM_SIZE, buildTeam, petValue, rankBy, receivers, runeGain, synergySupply, teamDps, tierOf, uptime, type TeamContext } from './model'
import { TEAM_PRESETS, runPreset } from './presets'
import { REWARD_ITEM, couponActive, formatKst, phaseOf, scheduleItems, scheduleName, splitSchedule, updates } from './updatesData'

const root = join(__dirname, '..', '..', '..', '..')
const read = <T,>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
const cookies = read<CookieDb>('public/data/cookie-db.json').cookies
const pets = read<PetDb>('public/data/pet-db.json').pets
const growth = read<GrowthData>('public/data/growth.json')
const cookie = (ko: string) => cookies.find((c) => c.name.ko === ko) ?? (() => { throw new Error(ko) })()
const pet = (ko: string) => pets.find((p) => p.name.ko === ko) ?? (() => { throw new Error(ko) })()

const plain: Attacker = { atk: 1000, critRate: 0, critDamage: 0.5, skillAmp: 0, bossDamage: 0, haste: 0 }
const effect = (over: Partial<CookieEffect>): CookieEffect => ({
  kind: 'stat',
  property: 'atk',
  calcType: 'mult',
  valueBase: 'Fixed',
  value: 0.1,
  unit: 'fraction',
  duration: 5,
  lifetime: 'timed',
  maxStack: 1,
  applyRate: 1,
  target: 'allies',
  maxTargets: null,
  excludeCaster: false,
  tickSeconds: null,
  scalesWithSkillAmp: false,
  durationScalesWithDurationSynergy: false,
  onlyIn: null,
  category: 'Buff',
  ...over,
})

describe('등급 나누기', () => {
  it('상위 10%는 S, 30%까지 A, 60%까지 B, 나머지는 C다', () => {
    expect([0, 1, 2, 3, 5, 6, 9].map((r) => tierOf(r, 10))).toEqual(['S', 'A', 'A', 'B', 'B', 'C', 'C'])
  })

  it('점수가 0 이하면 빼고, 같은 점수는 같은 순위·등급을 준다', () => {
    const ranked = rankBy([5, 0, 9, 9, -1, 3], (x) => x)
    expect(ranked.map((r) => [r.score, r.rank])).toEqual([
      [9, 0],
      [9, 0],
      [5, 2],
      [3, 3],
    ])
    expect(ranked[1]!.tier).toBe(ranked[0]!.tier)
  })
})

describe('효과 하나의 가치', () => {
  it('가동률 = min(1, 지속 ÷ 주기) × 적용 확률, 상시 효과는 1이다', () => {
    expect(uptime(effect({ duration: 5 }), 10)).toBe(0.5)
    expect(uptime(effect({ duration: 12 }), 10)).toBe(1)
    expect(uptime(effect({ duration: 4, applyRate: 0.5 }), 8)).toBe(0.25)
    expect(uptime(effect({ lifetime: 'permanent', duration: null }), 10)).toBe(1)
  })

  it('받는 인원: 아군 전체는 팀 인원, 자신 제외면 한 명 적고, 한 명 대상은 1명이다', () => {
    expect(receivers(effect({ target: 'allies' }))).toBe(TEAM_SIZE)
    expect(receivers(effect({ target: 'allies', excludeCaster: true }))).toBe(TEAM_SIZE - 1)
    expect(receivers(effect({ target: 'allies', maxTargets: 2 }))).toBe(2)
    expect(receivers(effect({ target: 'ally' }))).toBe(1)
  })

  it('방어력 감소는 0이면 이득이 없고, 많이 깎을수록 이득이 커진다', () => {
    expect(defShredGain(0, 500)).toBe(0)
    expect(defShredGain(0.3, 500)).toBeGreaterThan(0)
    expect(defShredGain(0.6, 500)).toBeGreaterThan(defShredGain(0.3, 500))
  })
})

describe('피해량 어댑터', () => {
  it('용감한 쿠키: 계수 3.6을 4초마다 → 공격력 1000이면 보스전 초당 피해 900', () => {
    expect(cookieDps(cookie('용감한 쿠키'), plain, 'boss')).toBeCloseTo(900, 6)
  })

  it('치명확률 10%·치명피해 50%면 ×1.05, 보스피해 50%면 ×1.5', () => {
    const c = cookie('용감한 쿠키')
    expect(cookieDps(c, { ...plain, critRate: 0.1 }, 'boss')).toBeCloseTo(945, 6)
    expect(cookieDps(c, { ...plain, bossDamage: 0.5 }, 'boss')).toBeCloseTo(1350, 6)
  })

  it('스테이지는 범위 몫만큼 적 수를 곱한다', () => {
    const c = cookie('용감한 쿠키')
    const share = areaShare(c)
    expect(cookieDps(c, plain, 'stage')).toBeCloseTo(900 * (1 + share * (CROWD_TARGETS - 1)), 6)
  })

  it('슈가룬: 공격력 증폭 7%는 약 7%, 치명확률 0%에서 치명피해 옵션은 이득이 없다', () => {
    const c = cookie('전갈맛 쿠키')
    const a = { ...plain, atk: 10000 }
    expect(runeGain('atkAmp', 7, c, a, 'boss')).toBeCloseTo(0.07, 3)
    expect(runeGain('critDamage', 8, c, a, 'boss')).toBeCloseTo(0, 9)
    // 치명확률 8%p × 치명피해 50% = 4%
    expect(runeGain('critRate', 8, c, a, 'boss')).toBeCloseTo(0.04, 6)
  })
})

describe('시너지 공급원', () => {
  it('받는 쿠키 수는 그 시너지를 받는 다른 쿠키 수와 같다', () => {
    const supply = synergySupply(cookies)
    const macaron = supply.find((s) => s.provider.name.ko === '마카롱맛 쿠키' && s.key === 'area')!
    expect(macaron.receivers).toBe(cookies.filter((c) => c.name.ko !== '마카롱맛 쿠키' && c.synergy.receives.includes('area')).length)
    expect(macaron.uptime).toBe(1)
  })
})

describe('편성', () => {
  const ctx: TeamContext = { growth, build: DEFAULT_BUILD, scenario: 'stage' }

  it('추천 편성은 12명이고 역할·등급 조건을 지킨다', () => {
    for (const preset of TEAM_PRESETS) {
      const { team } = runPreset(preset, cookies, pets, growth, DEFAULT_BUILD)
      expect(team.members).toHaveLength(TEAM_SIZE)
      expect(new Set(team.members).size).toBe(TEAM_SIZE)
      for (const [role, min] of Object.entries(preset.rules.minRoles)) expect(team.members.filter((c) => c.role === role).length).toBeGreaterThanOrEqual(min ?? 0)
      if (preset.rules.rarities) expect(team.members.every((c) => preset.rules.rarities!.includes(c.rarity))).toBe(true)
    }
  })

  it('탐색 결과는 같은 조건의 무작위 편성보다 팀 피해가 크다', () => {
    const rules = TEAM_PRESETS[0]!.rules
    const best = buildTeam(cookies, rules, ctx).total
    const tanks = cookies.filter((c) => c.role === 'tank').slice(0, 2)
    const supports = cookies.filter((c) => c.role === 'support').slice(0, 2)
    const rest = cookies.filter((c) => c.role === 'charge').slice(0, 8)
    expect(best).toBeGreaterThan(teamDps([...tanks, ...supports, ...rest], ctx).total)
  })

  it('치즈케이크맛 쿠키(아군 공격력 +60%, 7초 / 주기 8초)를 넣으면 다른 쿠키의 버프가 60% × 7/8 늘어난다', () => {
    const scorpion = cookie('전갈맛 쿠키')
    const cheesecake = cookie('치즈케이크맛 쿠키')
    const row = teamDps([scorpion, cheesecake], ctx).rows.find((r) => r.cookie === scorpion)!
    expect(row.buff).toBeCloseTo(0.6 * (7 / 8), 6)
  })

  it('아군 전체 공격력 20% 펫은 공격하는 쿠키 모두에게 들어가 팀 피해를 약 20% 올린다', () => {
    const { team, ctx: presetCtx } = runPreset(TEAM_PRESETS[0]!, cookies, pets, growth, DEFAULT_BUILD)
    const value = petValue(pet('갓난갓방울'), team, presetCtx)
    expect(value.covered).toBe(TEAM_SIZE)
    expect(value.dps).toBeGreaterThan(0.19)
    expect(value.dps).toBeLessThan(0.201)
    expect(value.partial).toBe(false)
  })

  it('명중 펫은 피해·생존 계산에 들어가지 않는다고 표시한다', () => {
    const { team, ctx: presetCtx } = runPreset(TEAM_PRESETS[0]!, cookies, pets, growth, DEFAULT_BUILD)
    const value = petValue(pet('초코방울'), team, presetCtx)
    expect(value.partial).toBe(true)
    expect(value.dps).toBe(0)
  })
})

describe('업데이트 일정', () => {
  // 2026-10-21 09:00 KST
  const now = Date.parse('2026-10-21T00:00:00Z')

  it('데이터 모양: 시각은 ISO이고, 쿠폰 보상은 모두 국내 이름이 있다', () => {
    for (const e of updates.schedule) {
      expect(Number.isFinite(Date.parse(e.start))).toBe(true)
      expect(scheduleName(e, 'ko')).not.toBe('')
    }
    updates.riftSeasons.forEach((s, i) => expect(s.season).toBe(i + 1))
    for (const c of updates.coupons) {
      expect(c.code).toMatch(/^[A-Z0-9]+$/)
      expect(c.expires).toMatch(/\+09:00$/)
      for (const r of c.rewards) expect(REWARD_ITEM[r.item]?.ko).toBeTruthy()
    }
  })

  it('시작 전은 예정, 끝나기 전은 진행 중, 끝났거나 끝 시각이 없으면 지난 일정이다', () => {
    expect(phaseOf({ start: '2026-10-22T04:30:00Z', end: '2026-11-05T03:00:00Z' }, now)).toBe('upcoming')
    expect(phaseOf({ start: '2026-10-08T04:30:00Z', end: '2026-10-22T03:00:00Z' }, now)).toBe('ongoing')
    expect(phaseOf({ start: '2026-10-08T04:30:00Z', end: null }, now)).toBe('past')
    expect(phaseOf({ start: '2026-10-08T07:00:00Z', end: '2026-10-12T03:00:00Z' }, now)).toBe('past')
  })

  it('2026-10-21 기준: 1.5 업데이트는 지났고, 차원의 이면 시즌 2는 진행 중, 시즌 3은 예정이다', () => {
    const groups = splitSchedule(scheduleItems(updates, now), now)
    const keys = (phase: keyof typeof groups) => groups[phase].map((i) => i.key)
    expect(keys('past')).toContain('v15')
    expect(keys('ongoing')).toContain('rift-s2')
    expect(keys('upcoming')[0]).toBe('rift-s3')
    // 시즌 2는 업데이트 일정에 이미 있으므로 시즌 표에서 한 번 더 붙지 않는다.
    expect(scheduleItems(updates, now).filter((i) => i.key === 'rift-s2')).toHaveLength(1)
  })

  it('쿠폰은 만료 시각(KST)이 지나면 쓸 수 없다', () => {
    const c = updates.coupons.find((x) => x.code === 'COOKIERUNCRUMBLENO1')!
    expect(couponActive(c, Date.parse('2026-08-31T14:58:00Z'))).toBe(true)
    expect(couponActive(c, Date.parse('2026-08-31T15:00:00Z'))).toBe(false)
    expect(couponActive(c, now)).toBe(false)
  })

  it('UTC 04:30은 한국 시간 13:30이다', () => {
    expect(formatKst('2026-10-08T04:30:00Z')).toBe('2026-10-08 13:30')
    expect(formatKst('2026-08-25T23:59:00+09:00')).toBe('2026-08-25 23:59')
  })
})
