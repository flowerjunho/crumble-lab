import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RUNE_STAT, binomial, chanceWithin, lockPlan, rerollPercentiles, runeOutcomes, runeSteps, slotChance, triesFor, type RuneCraftData } from './runeCraft'

const root = join(__dirname, '..', '..', '..', '..')
const data = JSON.parse(readFileSync(join(root, 'public/data/rune-craft.json'), 'utf8')) as RuneCraftData
const outcomes = runeOutcomes(data)
const stepOf = (rarity: string, tier: number) => runeSteps(data).findIndex((s) => s.rarity === rarity && s.tier === tier)

describe('슈가룬 확률표 데이터', () => {
  it('결과 160가지의 가중치 합이 분모 13050과 같다', () => {
    expect(outcomes).toHaveLength(160)
    expect(outcomes.reduce((sum, o) => sum + o.weight, 0)).toBe(data.totalWeight)
    expect(data.totalWeight).toBe(13050)
  })

  it('등급별 확률이 국내 공시(SSR 1.07%·SR 4.29%·R 17.93%·U 26.9%·C 49.81%)와 같다', () => {
    const pct = (rarity: string) => (outcomes.filter((o) => o.rarity === rarity).reduce((s, o) => s + o.weight, 0) / data.totalWeight) * 100
    expect(pct('SSR')).toBeCloseTo(1.07, 2)
    expect(pct('SR')).toBeCloseTo(4.29, 2)
    expect(pct('R')).toBeCloseTo(17.93, 2)
    expect(pct('U')).toBeCloseTo(26.9, 2)
    expect(pct('C')).toBeCloseTo(49.81, 2)
  })

  it('모든 옵션에 세 언어 이름표가 있고, 스킬가속은 SSR·SR 1·2단계에만 있다', () => {
    for (const { key } of data.stats) expect(RUNE_STAT[key]).toBeDefined()
    const haste = outcomes.filter((o) => o.stat === 'skillHaste')
    expect(haste.map((o) => `${o.rarity}${o.tier}:${o.value}`)).toEqual(['SSR1:5', 'SSR2:4', 'SR1:3', 'SR2:2'])
  })

  it('손으로 확인한 값: SSR 1단계 공격력 증폭 7%, C 2단계 피해감소 1.5%, 재조합 비용', () => {
    const ssr1 = data.rarities[0]?.tiers[0]
    expect(ssr1?.values.atkAmp).toBe(7)
    expect(ssr1?.weight).toBe(1)
    expect(data.rarities.at(-1)?.tiers[1]?.values.damageReduction).toBe(1.5)
    expect(data.rerollCosts).toEqual([20, 40, 80, 120, 180, 240, 300, 400])
  })

  it('어느 옵션이든 등급·단계 순서(runeSteps)대로 수치가 줄어든다', () => {
    for (const { key } of data.stats) {
      const values = outcomes.filter((o) => o.stat === key).sort((a, b) => a.step - b.step).map((o) => o.value)
      for (let i = 1; i < values.length; i++) expect(values[i]!).toBeLessThan(values[i - 1]!)
    }
  })
})

describe('슈가룬 확률 계산', () => {
  it('한 칸 확률: 공격력 증폭 아무 등급 = 1000/13050, SSR 이상 = 10/13050', () => {
    expect(slotChance(data, { stats: ['atkAmp'], maxStep: 11 })).toBeCloseTo(1000 / 13050, 12)
    expect(slotChance(data, { stats: ['atkAmp'], maxStep: stepOf('SSR', 3) })).toBeCloseTo(10 / 13050, 12)
    expect(slotChance(data, { stats: [], maxStep: 11 })).toBeCloseTo(1, 12)
    // 스킬가속: SSR 2 + 8, SR 10 + 30
    expect(slotChance(data, { stats: ['skillHaste'], maxStep: 11 })).toBeCloseTo(50 / 13050, 12)
  })

  it('기하분포: 평균·누적 확률·필요 횟수', () => {
    expect(chanceWithin(0.5, 2)).toBe(0.75)
    expect(triesFor(0.5, 0.75)).toBe(2)
    expect(triesFor(0.1, 0.5)).toBe(7)
    expect(binomial(3, 0.5)).toEqual([0.125, 0.375, 0.375, 0.125])
  })

  it('한 칸만 맞출 때 기대 비용은 20 / (1 - (1-p)^n) 이다', () => {
    const p = 0.01
    const plan = lockPlan(8, 1, p, data.rerollCosts, 'optimal')
    expect(plan.cost[0]).toBeCloseTo(20 / chanceWithin(p, 8), 9)
    expect(plan.rerolls[0]).toBeCloseTo(1 / chanceWithin(p, 8), 9)
  })

  it('최저 비용 계획은 가치 반복으로 구한 값과 같고, 바로 잠그는 방식보다 비싸지 않다', () => {
    for (const [n, need, p] of [
      [8, 8, 1000 / 13050],
      [8, 4, 0.05],
      [5, 3, 0.3],
      [8, 6, 0.5],
    ] as const) {
      const optimal = lockPlan(n, need, p, data.rerollCosts, 'optimal')
      const greedy = lockPlan(n, need, p, data.rerollCosts, 'greedy')
      expect(optimal.cost[0]!).toBeLessThanOrEqual(greedy.cost[0]! + 1e-6)
      // 가치 반복: V[j] = c_j + Σ P(h) · min_{j ≤ j' ≤ j+h} V[j']
      let v = new Array<number>(need + 1).fill(0)
      for (let it = 0; it < 200_000; it++) {
        const next = v.map((_, j) => {
          if (j === need) return 0
          const dist = binomial(n - j, p)
          return data.rerollCosts[j]! + dist.reduce((s, pr, h) => s + pr * Math.min(...v.slice(j, Math.min(j + h, need) + 1)), 0)
        })
        const diff = Math.max(...next.map((x, i) => Math.abs(x - v[i]!)))
        v = next
        if (diff < 1e-9) break
      }
      expect(optimal.cost[0]!).toBeCloseTo(v[0]!, 4)
    }
  })

  it('바로 잠그는 방식은 비용이 늘어도 1칸 목표에서는 최저 비용과 같다', () => {
    const a = lockPlan(4, 1, 0.2, data.rerollCosts, 'greedy')
    const b = lockPlan(4, 1, 0.2, data.rerollCosts, 'optimal')
    expect(a.cost[0]).toBeCloseTo(b.cost[0]!, 9)
  })

  it('횟수 분포: 한 칸 목표는 기하분포 필요 횟수와 같다', () => {
    const p = 0.02
    const plan = lockPlan(1, 1, p, data.rerollCosts, 'optimal')
    expect(rerollPercentiles(1, 1, p, plan, [0.5, 0.9])).toEqual([triesFor(p, 0.5), triesFor(p, 0.9)])
  })
})
