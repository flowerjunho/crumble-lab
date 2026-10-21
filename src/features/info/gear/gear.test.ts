import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GEAR_RARITY, GEAR_SLOT, GEAR_STAT, RUNE_STAT, RUNE_STAT_ORDER } from './gearLabels'
import type { GearData } from './gearTypes'
import { expectedPlateCost, platedValues, runeRarityTotals, stepOdds } from './plateMath'

const root = join(__dirname, '..', '..', '..', '..')
const data = JSON.parse(readFileSync(join(root, 'public/data/gear.json'), 'utf8')) as GearData
const none = { guard: false, ease: false, restore: false }

describe('장비 데이터', () => {
  it('장비 등급 10개, 장비 종류 12개에 모두 국내 이름표가 있다', () => {
    expect(data.rarities.map((r) => r.key)).toEqual(['common', 'advanced', 'excellent', 'magic', 'epic', 'special', 'superEpic', 'unique', 'legendary', 'eternal'])
    expect(data.slots).toHaveLength(12)
    for (const r of data.rarities) expect(GEAR_RARITY[r.key].ko).toMatch(/[가-힣]/)
    for (const s of data.slots) {
      expect(GEAR_SLOT[s.key].ko).toMatch(/[가-힣]/)
      expect(GEAR_STAT[s.main]).toBeDefined()
    }
  })

  // 공시 '오븐 레벨별 장비 종류 등장 확률': Lv.1에 검·활·지팡이·투구, Lv.9에 음식까지 12종
  it('장비 종류가 공시와 같은 오븐 레벨에 열린다', () => {
    const at = Object.fromEntries(data.slots.map((s) => [s.key, s.unlockAt]))
    expect(at).toEqual({ sword: 1, bow: 1, staff: 1, helmet: 1, armor: 2, shield: 3, necklace: 4, ring: 5, brooch: 6, artifact: 7, book: 8, food: 9 })
  })

  it('오븐 Lv.1~50의 등급 확률 합이 100%이고 공시 값과 같다', () => {
    expect(data.oven).toHaveLength(50)
    for (const o of data.oven) expect(o.odds.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6)
    expect(data.oven[0]!.odds[0]).toBe(100)
    // 공시: Lv.4 에픽 0.1%, Lv.9 스페셜 0.08%, Lv.31 이터널 0.002%, Lv.50 슈퍼에픽 60%
    expect(data.oven[3]!.odds[4]).toBe(0.1)
    expect(data.oven[8]!.odds[5]).toBe(0.08)
    expect(data.oven[30]!.odds[9]).toBe(0.002)
    expect(data.oven[49]!.odds[6]).toBe(60)
    expect(data.oven[49]!.itemLevel).toEqual([145, 150])
  })

  it('보조 옵션 후보는 무기·방어구 5종, 장신구 9종이고 모든 후보에 등급별 범위가 있다', () => {
    expect(data.subPools.weapon).toHaveLength(5)
    expect(data.subPools.armor).toHaveLength(5)
    expect(data.subPools.accessoryAtk).toHaveLength(9)
    expect(data.subPools.accessoryDef).toHaveLength(9)
    for (const pool of Object.values(data.subPools))
      for (const stat of pool) {
        const ranges = data.subRange.stats[stat]
        expect(ranges).toHaveLength(7)
        for (const [min, max] of ranges) expect(min).toBeLessThanOrEqual(max)
      }
  })
})

describe('플레이트 강화', () => {
  it('+0~+25 증폭이 국내 표와 같다', () => {
    const at = (g: number) => data.plate.boost[g]!
    expect(at(12)).toEqual({ grade: 12, main: 0.69, sub: 0.7 })
    expect(at(20)).toEqual({ grade: 20, main: 2, sub: 2 })
    expect(at(25)).toEqual({ grade: 25, main: 3.15, sub: 2.8 })
  })

  it('강화 확률은 단계마다 합이 100%이고 공시 값과 같다', () => {
    expect(data.plate.steps).toHaveLength(25)
    for (const s of data.plate.steps) expect(s.great + s.success + s.keep + s.down + s.crush).toBeCloseTo(1, 9)
    expect(data.plate.steps[0]).toMatchObject({ great: 0.1, success: 0.9, keep: 0 })
    expect(data.plate.steps[10]).toMatchObject({ down: 0.1, crush: 0, guard: 1 })
    expect(data.plate.steps[15]).toMatchObject({ crush: 0.05, down: 0.24, material: 17, restore: 20 })
    expect(data.plate.steps[24]).toMatchObject({ crush: 0.15, success: 0.02, great: 0.001 })
  })

  // 국내 예시: 검 · Lv.75 · 레전더리 · 12강 공격력 = 339 × 500% × 1.69 = 2,864
  it('강화 후 수치는 +0 값에 (1 + 증폭)을 곱한다', () => {
    const { main, sub } = platedValues(data.plate.boost, 12, 339 * 5, 100)
    expect(Math.round(main)).toBe(2865) // 1,695 × 1.69 = 2,864.55
    expect(Math.floor(main)).toBe(2864)
    expect(sub).toBeCloseTo(170, 9)
  })

  it('평균 비용: +0→+1은 1회, +0→+2는 손으로 푼 값과 같다', () => {
    expect(expectedPlateCost(data.plate.steps, 0, 1, none).tries).toBeCloseTo(1, 9)
    // E1 = 1 + 0.05·E1, E0 = 1 + 0.9·E1 (대성공은 바로 +2)
    const e = expectedPlateCost(data.plate.steps, 0, 2, none)
    expect(e.tries).toBeCloseTo(1 + 0.9 / 0.95, 9)
    expect(e.material).toBeCloseTo(1 + (0.9 * 2) / 0.95, 9)
    expect(e.syrup).toBe(0)
  })

  it('복구를 쓰면 박살나도 그 단계에 남고, 박살 1회마다 복구 비용이 든다', () => {
    // 하락 방지까지 쓰면 +15에 머물다 12.5%로 오르므로 평균 8회.
    // 시럽쇳물 = 하락 방지 8회 × 3 + 박살 8 × 5% = 0.4회 × 복구 20 = 24 + 8
    const e = expectedPlateCost(data.plate.steps, 15, 16, { guard: true, ease: false, restore: true })
    expect(e.tries).toBeCloseTo(8, 9)
    expect(e.material).toBeCloseTo(8 * 17, 9)
    expect(e.syrup).toBeCloseTo(32, 9)
  })

  it('하락 방지·박살 완화는 해당 단계에서만 확률을 바꾼다', () => {
    const s10 = data.plate.steps[10]!
    expect(stepOdds(s10, { guard: true, ease: true, restore: false })).toMatchObject({ keep: 0.74, down: 0, crush: 0, guard: true, ease: false })
    const s15 = data.plate.steps[15]!
    const eased = stepOdds(s15, { guard: false, ease: true, restore: false })
    expect(eased.crush).toBeCloseTo(0.025, 9)
    expect(eased.keep).toBeCloseTo(0.61, 9)
    const plain = expectedPlateCost(data.plate.steps, 10, 15, none)
    const guarded = expectedPlateCost(data.plate.steps, 10, 15, { guard: true, ease: false, restore: false })
    expect(guarded.tries).toBeLessThan(plain.tries)
    expect(guarded.syrup).toBeGreaterThan(0)
  })

  it('목표가 높을수록 평균 비용이 늘어난다', () => {
    let prev = 0
    for (let to = 1; to <= 25; to++) {
      const { material } = expectedPlateCost(data.plate.steps, 0, to, none)
      expect(material).toBeGreaterThan(prev)
      prev = material
    }
  })
})

describe('슈가룬', () => {
  it('5개 등급 12개 티어, 모든 효과에 국내 이름표가 있다', () => {
    expect(data.rune.tiers).toHaveLength(12)
    for (const t of data.rune.tiers) for (const s of RUNE_STAT_ORDER) expect(t.values[s]).toBeGreaterThan(0)
    for (const s of RUNE_STAT_ORDER) expect(RUNE_STAT[s].ko).toMatch(/[가-힣]/)
  })

  // 공시 반올림 탓에 등급 합은 cc.team-hobby 슈가룬 화면 값(SSR 1.07%, SR 4.29%, R 17.93%, U 26.9%, C 49.81%)과 소수 둘째 자리까지 맞춘다.
  it('등급별 합이 국내 표와 같고 전체 합은 100%다', () => {
    const totals = Object.fromEntries(runeRarityTotals(data.rune.tiers).map((t) => [t.rarity, Number(t.chance.toFixed(2))]))
    expect(totals).toEqual({ SSR: 1.07, SR: 4.29, R: 17.93, U: 26.9, C: 49.81 })
    const sum = runeRarityTotals(data.rune.tiers).reduce((a, t) => a + t.chance, 0)
    expect(sum).toBeCloseTo(100, 3)
  })

  it('스킬가속 증가는 SSR·SR의 01·02티어에만 있다', () => {
    const withHaste = data.rune.tiers.filter((t) => t.haste).map((t) => `${t.rarity}${t.tier}`)
    expect(withHaste).toEqual(['SSR1', 'SSR2', 'SR1', 'SR2'])
    expect(data.rune.craftCost).toEqual([20, 40, 80, 120, 180, 240, 300, 400])
  })
})
