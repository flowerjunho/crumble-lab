import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CookieDb } from '../../../types'
import { evaluateBand, maxElementCount, perkSummary, perksAvailable } from './mercenary'
import { CATEGORY_ORDER, crystalRates, median, sortValues, valuePackage } from './packages'
import { clampLevel, coinsTo, maxStep, planResolve, stepInfo, totalsAt, type ResolveData } from './resolve'
import { CONSTELLATION_MAX_AMP, averageArea, ceiling, ceilingChance, enclosedArea, placements, reshuffle, seededRandom } from './stellar'
import { systemsData } from './systemsData'

const root = join(__dirname, '..', '..', '..', '..')
const read = <T,>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
const cookies = read<CookieDb>('public/data/cookie-db.json').cookies
const resolve = read<ResolveData>('public/data/resolve.json')
const cookie = (ko: string) => cookies.find((c) => c.name.ko === ko) ?? (() => { throw new Error(ko) })()
const { band, stellar, packages } = systemsData
const perk = (en: string) => band.perks.find((p) => p.nameEn === en) ?? (() => { throw new Error(en) })()
const level = (n: number) => band.levels[n] ?? (() => { throw new Error(String(n)) })()

describe('용병단 데이터', () => {
  it('레벨 0~4, 특전 13개, 슬롯 수가 게임 데이터와 같다', () => {
    expect(band.levels.map((l) => [l.level, l.perkSlots, l.petSlots])).toEqual([
      [0, 0, 1],
      [1, 1, 1],
      [2, 1, 2],
      [3, 1, 3],
      [4, 2, 3],
    ])
    expect(band.perks).toHaveLength(13)
    expect(level(0).leader).toEqual([])
    expect(level(4).leader).toEqual([
      { stat: 'atk', how: 'pct', value: 10 },
      { stat: 'def', how: 'pct', value: 10 },
      { stat: 'hp', how: 'pct', value: 10 },
    ])
  })

  it('직업 조건은 게임 데이터의 초과 비교를 이상으로 바꿔 둔다(사격 GREATER 4 → 5명 이상)', () => {
    expect(perk('All Ammo Provided').condition).toEqual({ type: 'roleCount', role: 'ranged', min: 5 })
    expect(perk('Health Insurance').condition).toEqual({ type: 'roleCount', role: 'support', min: 2 })
    expect(perksAvailable(band.perks, 2).map((p) => p.unlockedAt).every((u) => u <= 2)).toBe(true)
  })

  it('특전 요약 문장을 국내 표기로 만든다', () => {
    expect(perkSummary(perk('Passion Pay'), 'ko')).toBe('공격력이 가장 높은 아군 1명: 공격력 +20%, 최대체력 −20%')
    expect(perkSummary(perk('All Ammo Provided'), 'ko')).toBe('편성에 사격 쿠키가 5명 이상일 때, 사격 아군: 스킬 가속 +15')
    expect(perkSummary(perk('Crunch Mode'), 'ko')).toBe('최대체력이 낮은 아군 2명: 공격력 +15%, 최대체력 −10%')
  })
})

describe('용병단 계산', () => {
  const lineup = ['샤르도네맛 쿠키', '바리공주맛 쿠키', '다크초코 쿠키', '딸기쇼트케이크맛 쿠키', '용감한 쿠키'].map(cookie)

  it('리더 효과는 리더 한 명에게만, 특전은 슬롯 수만큼만 센다', () => {
    const leader = lineup[0]!.eid
    const result = evaluateBand(level(1), band.perks, [perk('General Perks').id, perk('Meals Provided').id], lineup, leader)
    // 1레벨 특전 슬롯은 1칸이고 Meals Provided는 2레벨 특전이라 빠진다.
    expect(result.perks).toHaveLength(1)
    const leaderBuffs = result.cookies.find((c) => c.eid === leader)!.totals
    expect(leaderBuffs).toContainEqual({ stat: 'atk', how: 'pct', value: 11 })
    const other = result.cookies.find((c) => c.eid !== leader)!.totals
    expect(other).toContainEqual({ stat: 'atk', how: 'pct', value: 1 })
  })

  it('직업 인원이 모자라면 특전이 꺼지고, 속성 특전은 가장 많은 속성 인원만큼 곱한다', () => {
    const result = evaluateBand(level(4), band.perks, [perk('All Ammo Provided').id, perk('Like A Family').id], lineup, null)
    expect(result.perks[0]!.active).toBe(false)
    const family = result.perks[1]!
    expect(family.multiplier).toBe(maxElementCount(lineup))
    expect(result.cookies[0]!.totals).toContainEqual({ stat: 'elementDamage', how: 'rate', value: 2 * maxElementCount(lineup) })
  })

  it('최대체력이 낮은 2명을 기본 체력으로 고른다', () => {
    const result = evaluateBand(level(4), band.perks, [perk('Crunch Mode').id], lineup, null)
    const lowest = [...lineup].sort((a, b) => a.stats.hp - b.stats.hp).slice(0, 2).map((c) => c.eid)
    expect(result.perks[0]!.targets).toEqual(lowest)
  })
})

describe('스텔라 링크', () => {
  it('재설정 비용과 잠금 한도', () => {
    expect(stellar.resetCost).toEqual([10, 10, 30, 60, 100, 150, 220])
    expect(stellar.maxLocks).toBe(6)
    expect(CONSTELLATION_MAX_AMP).toHaveLength(10)
  })

  it('면적: 볼록 배치와 교차 배치를 손으로 계산한 값과 비교한다', () => {
    expect(enclosedArea(Array.from({ length: 12 }, (_, i) => i))).toBeCloseTo(1, 9)
    // 정사각형(0·3·6·9)은 넓이 2, 정12각형은 3이다.
    expect(enclosedArea([0, 3, 6, 9])).toBeCloseTo(2 / 3, 9)
    // 0→6→3→9는 지름 두 개가 교차해 삼각형 두 개(넓이 0.5씩)만 감싼다.
    expect(enclosedArea([0, 6, 3, 9])).toBeCloseTo(1 / 3, 9)
    // 방향을 뒤집거나 시작점을 바꿔도 같다.
    expect(enclosedArea([9, 3, 6, 0])).toBeCloseTo(enclosedArea([0, 6, 3, 9]), 9)
  })

  it('교차해 생긴 가운데 빈 공간도 면적에 넣는다(별 모양 = 볼록 육각형 전체)', () => {
    // 0→4→8 삼각형과 2→6→10 삼각형을 이어 만든 육각별: 바깥에서 닿지 않는 칸을 모두 센다.
    const star = enclosedArea([0, 4, 8, 2, 6, 10])
    expect(star).toBeGreaterThan(0)
    expect(star).toBeLessThanOrEqual(ceiling(6).area + 1e-9)
  })

  it('상한과 상한 배치 수가 국내 계산기 표와 같다', () => {
    expect(ceiling(3).area).toBeCloseTo(0.433, 3)
    expect(ceiling(6).area).toBeCloseTo(0.866, 3)
    expect(ceiling(12).area).toBeCloseTo(1, 9)
    expect(placements(12, 12) / ceiling(12).layouts.length).toBe(19_958_400)
    expect(placements(12, 6) / ceiling(6).layouts.length).toBe(27_720)
    expect(placements(12, 7) / ceiling(7).layouts.length).toBe(7_920)
    expect(placements(12, 3)).toBe(1_320)
    expect(placements(12, 11)).toBe(479_001_600)
  })

  it('6개를 잠그면 남은 6개가 한 순서로 들어올 확률은 1/720이다', () => {
    const best = ceiling(12).layouts[0]!
    const locked = new Map(best.slice(0, 6).map((slot, shard) => [shard, slot]))
    const odds = ceilingChance(12, locked)
    expect(odds.total).toBe(720)
    expect(odds.ways).toBe(1)
    // 하나만 잠그는 것은 잠그지 않은 것과 확률이 같다.
    expect(ceilingChance(12, new Map([[0, best[0]!]])).chance).toBeCloseTo(ceilingChance(12, new Map()).chance, 15)
  })

  it('재설정은 잠근 조각을 그대로 두고 슬롯이 겹치지 않는다', () => {
    const order = [0, 1, 2, 3, 4, 5, 6, 7, 8]
    const next = reshuffle(order, new Set([0, 4]), seededRandom(3))
    expect(next[0]).toBe(0)
    expect(next[4]).toBe(4)
    expect(new Set(next).size).toBe(order.length)
  })

  it('무작위 평균 면적이 국내 계산기 값(12개 64%대, 9개 52% 안팎)과 맞는다', () => {
    expect(averageArea(12, 3000)).toBeGreaterThan(0.62)
    expect(averageArea(12, 3000)).toBeLessThan(0.66)
    expect(averageArea(9, 3000)).toBeGreaterThan(0.5)
    expect(averageArea(9, 3000)).toBeLessThan(0.535)
  })
})

describe('패키지 가치', () => {
  const rates = crystalRates(packages.assumptions)
  const all = new Set(packages.currencies)

  it('모든 패키지에 가격과 아는 재화만 있다', () => {
    expect(packages.list.length).toBeGreaterThan(60)
    for (const p of packages.list) {
      expect(p.priceKRW).toBeGreaterThan(0)
      for (const key of Object.keys(p.contents)) expect(packages.currencies).toContain(key)
      expect(CATEGORY_ORDER).toContain(p.category)
    }
  })

  it('크리스탈 초대박 패키지: 50,000크리스탈 / 35,000원 = 1,000원당 약 1,428.6', () => {
    const pack = packages.list.find((p) => p.nameKo === '크리스탈 초대박 패키지')!
    const v = valuePackage(pack, rates, all, packages.currencies)
    expect(v.total).toBe(50_000)
    expect(v.per1000).toBeCloseTo(1428.571, 2)
  })

  it('끈 재화는 합계에서 빠지고, 정렬·중앙값이 맞다', () => {
    const pack = packages.list.find((p) => p.id === 'package-24')!
    const withSp = valuePackage(pack, rates, all, packages.currencies).total
    const noSp = valuePackage(pack, rates, new Set([...all].filter((k) => k !== 'stellarPoint')), packages.currencies).total
    expect(withSp - noSp).toBe(12_000 * packages.assumptions.stellarPoint)
    const values = packages.list.map((p) => valuePackage(p, rates, all, packages.currencies))
    const sorted = sortValues(values, 'per1000', true)
    expect(sorted[0]!.per1000).toBeGreaterThanOrEqual(sorted.at(-1)!.per1000)
    expect(median([1, 3, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it('국내 상점 목록으로 고친 구성품을 쓴다(크럼블 출시 축하 7일 출석 패키지)', () => {
    const pack = packages.list.find((p) => p.id === 'package-04')!
    expect(pack.corrected).toBe(true)
    expect(pack.contents.diamonds).toBe(27_000)
  })
})

describe('돌파력', () => {
  it('1,500단계, 단계마다 비용이 있다', () => {
    expect(maxStep(resolve)).toBe(1500)
    expect(resolve.cost).toHaveLength(1500)
    expect(stepInfo(resolve, 1)).toMatchObject({ levels: 20, atk: 1, def: 1, hp: 10, unitCost: 258 })
    expect(stepInfo(resolve, 101)).toMatchObject({ levels: 30, atk: 2, def: 2, hp: 20, unitCost: 17_647 })
  })

  it('누적 능력치: 1단계를 모두 채우면 공격력 +20, 체력 +200', () => {
    expect(totalsAt(resolve, 2, 0)).toEqual({ atk: 20, def: 20, hp: 200 })
    expect(totalsAt(resolve, 1, 5)).toEqual({ atk: 5, def: 5, hp: 50 })
    expect(clampLevel(resolve, 1, 99)).toBe(20)
  })

  it('비용: 1단계 능력치 하나를 끝까지 올리면 258 × 20 = 5,160코인', () => {
    expect(coinsTo(resolve, 2, 0)).toBe(5_160)
    const plan = planResolve(resolve, { step: 1, level: 0 }, { step: 3, level: 0 })
    expect(plan.coinsPerStat).toBe(258 * 20 + 278 * 20)
    expect(plan.coinsAll).toBe(plan.coinsPerStat * 3)
    expect(plan.gain).toEqual({ atk: 40, def: 40, hp: 400 })
    expect(planResolve(resolve, { step: 5, level: 0 }, { step: 2, level: 0 }).coinsAll).toBe(0)
  })
})
