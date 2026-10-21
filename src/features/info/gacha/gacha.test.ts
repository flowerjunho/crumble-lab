import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CookieDb, PetDb } from '../../../types'
import {
  FEATURED_RANK,
  GACHA_LEVELS,
  buildPool,
  chanceAtLeastOne,
  drawsForChance,
  eligibleUnits,
  emptyRecord,
  expectedDraws,
  gachaData,
  levelForDraws,
  rankChance,
  ratesAt,
  seedFrom,
  simulate,
  unitChance,
  type GachaBanner,
  type GachaUnit,
} from './gacha'

const root = join(__dirname, '..', '..', '..', '..')
const read = <T,>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
const cookies = eligibleUnits(
  read<CookieDb>('public/data/cookie-db.json').cookies.map((c) => ({ key: c.slug, name: c.name, rarity: c.rarity, image: c.image })),
  'cookie',
)
const pets = eligibleUnits(
  read<PetDb>('public/data/pet-db.json').pets.map((p) => ({ key: p.slug, name: p.name, rarity: p.rarity, image: p.image })),
  'pet',
)
const banner = (id: string): GachaBanner => gachaData.banners.find((b) => b.id === id) ?? (() => { throw new Error(id) })()
const unit = (units: GachaUnit[], key: string) => units.find((u) => u.key === key) ?? (() => { throw new Error(key) })()

describe('뽑기 확률표', () => {
  it('뽑기 5종(쿠키 3·펫 2)의 국내 이름이 있다', () => {
    expect(gachaData.banners.map((b) => b.name.ko)).toEqual(['고급 쿠키 뽑기', '쿠키 픽업 뽑기', '쿠키 차원 뽑기', '고급 펫 뽑기', '펫 픽업 뽑기'])
  })

  it('모든 뽑기의 레벨 1~10 확률 합이 100%다', () => {
    for (const b of gachaData.banners)
      for (const lv of GACHA_LEVELS) expect(ratesAt(b, lv).reduce((s, r) => s + r.pct, 0)).toBeCloseTo(100, 6)
  })

  it('국내 공개 표와 같은 값(cc.team-hobby.com 확률 페이지)', () => {
    // 고급 쿠키 뽑기 Lv.10: TSSR 0.05 · SSR 1.2 · SR 7 · R 13 · U 18 · C 60.75
    expect(ratesAt(banner('premium'), 10).map((r) => r.pct)).toEqual([0.05, 1.2, 7, 13, 18, 60.75])
    // 쿠키 픽업 뽑기 Lv.5: 픽업 0.6 · TSSR 0 · SSR 0.1
    expect(ratesAt(banner('pickup'), 5).slice(0, 3)).toEqual([
      { rank: FEATURED_RANK, pct: 0.6 },
      { rank: 'TSSR', pct: 0 },
      { rank: 'SSR', pct: 0.1 },
    ])
    // 고급 펫 뽑기 Lv.1에는 SSR이 없고 Lv.2부터 1.6%다.
    expect(ratesAt(banner('pet-premium'), 1)[0]).toEqual({ rank: 'SSR', pct: 0 })
    expect(ratesAt(banner('pet-premium'), 2)[0]).toEqual({ rank: 'SSR', pct: 1.6 })
    expect(gachaData.levelDraws.cookie[9]).toBe(18000)
    expect(gachaData.levelDraws.pet[9]).toBe(22000)
  })

  it('뽑기 제외 대상(실론나이트 쿠키, 무한바퀴)은 대상 목록에 없다', () => {
    expect(cookies.some((c) => c.key === 'tea-knight')).toBe(false)
    expect(pets.some((p) => p.key === 'continuum-cog')).toBe(false)
  })

  it('픽업 대상 기본값과 고정 대상이 도감에 있다', () => {
    expect(unit(cookies, banner('pickup').featured?.default ?? '').rarity).toBe('SSR')
    expect(unit(cookies, banner('special').featured?.fixed ?? '').rarity).toBe('TSSR')
    expect(unit(pets, banner('pet-pickup').featured?.default ?? '').rarity).toBe('SSR')
  })

  it('누적 뽑기 횟수로 레벨이 정해진다', () => {
    expect(levelForDraws('cookie', 0)).toBe(1)
    expect(levelForDraws('cookie', 79)).toBe(1)
    expect(levelForDraws('cookie', 80)).toBe(2)
    expect(levelForDraws('cookie', 18000)).toBe(10)
    expect(levelForDraws('pet', 999)).toBe(3)
  })
})

describe('나올 확률 계산', () => {
  const ssrCount = cookies.filter((c) => c.rarity === 'SSR').length

  it('고급 쿠키 뽑기 Lv.10에서 SSR 이상은 1.25%, 한 종은 등급 확률을 등급 인원수로 나눈 값이다', () => {
    const pool = buildPool(banner('premium'), 10, cookies, null)
    expect(pool.total).toBeCloseTo(1, 10)
    expect(rankChance(pool, ['TSSR', 'SSR'])).toBeCloseTo(0.0125, 10)
    expect(unitChance(pool, 'chardonnay')).toBeCloseTo(0.012 / ssrCount, 12)
  })

  it('픽업 대상은 픽업 줄 0.6%에 자기 등급 몫이 더해진다', () => {
    const chardonnay = unit(cookies, 'chardonnay')
    const pool = buildPool(banner('pickup'), 10, cookies, chardonnay)
    expect(unitChance(pool, 'chardonnay')).toBeCloseTo(0.006 + 0.006 / ssrCount, 12)
    // Lv.3까지는 픽업 확률이 0%다.
    expect(unitChance(buildPool(banner('pickup'), 3, cookies, chardonnay), 'chardonnay')).toBe(0)
  })

  it('n번 안에 한 번 이상: 1-(1-p)^n, 천장 이상이면 1', () => {
    expect(chanceAtLeastOne(0.006, 100)).toBeCloseTo(1 - 0.994 ** 100, 12)
    expect(chanceAtLeastOne(0.006, 100)).toBeCloseTo(0.45218, 4)
    expect(chanceAtLeastOne(0.006, 179, 180)).toBeCloseTo(1 - 0.994 ** 179, 12)
    expect(chanceAtLeastOne(0.006, 180, 180)).toBe(1)
    expect(chanceAtLeastOne(0, 50)).toBe(0)
    expect(chanceAtLeastOne(0.5, 0)).toBe(0)
  })

  it('처음 나올 때까지 평균: 천장이 없으면 1/p, 있으면 Σ(1-p)^k', () => {
    expect(expectedDraws(0.0125)).toBeCloseTo(80, 10)
    expect(expectedDraws(0)).toBe(Infinity)
    let sum = 0
    for (let k = 0; k < 180; k++) sum += 0.994 ** k
    expect(expectedDraws(0.006, 180)).toBeCloseTo(sum, 9)
    // 확률이 0이어도 천장이 있으면 정확히 천장 횟수다.
    expect(expectedDraws(0, 300)).toBe(300)
  })

  it('목표 확률에 필요한 횟수', () => {
    expect(drawsForChance(0.5, 0.75)).toBe(2)
    expect(drawsForChance(0.006, 0.5)).toBe(116)
    expect(chanceAtLeastOne(0.006, 115)).toBeLessThan(0.5)
    expect(chanceAtLeastOne(0.006, 116)).toBeGreaterThanOrEqual(0.5)
    expect(drawsForChance(0.006, 0.9, 180)).toBe(180)
    expect(drawsForChance(0, 0.5)).toBe(Infinity)
  })
})

describe('시뮬레이터', () => {
  it('같은 시드면 같은 결과가 나온다', () => {
    const pool = buildPool(banner('premium'), 10, cookies, null)
    const a = simulate(pool, emptyRecord(seedFrom('crumble')), 500)
    const b = simulate(pool, emptyRecord(seedFrom('crumble')), 500)
    expect(a.record).toEqual(b.record)
    expect(a.results).toHaveLength(100)
    expect(a.record.draws).toBe(500)
  })

  it('많이 뽑으면 등급 비율이 공개 확률에 가까워진다', () => {
    const pool = buildPool(banner('pet-premium'), 10, pets, null)
    const { record } = simulate(pool, emptyRecord(seedFrom('law-of-large-numbers')), 200000, { keep: 0 })
    expect((record.byRarity.C ?? 0) / record.draws).toBeCloseTo(0.586, 2)
    expect((record.byRarity.U ?? 0) / record.draws).toBeCloseTo(0.2, 2)
    expect(Math.abs((record.byRarity.SSR ?? 0) / record.draws - 0.024)).toBeLessThan(0.002)
  })

  it('천장을 켜면 픽업 대상 없이 천장 횟수를 넘기지 않는다', () => {
    const holy = unit(pets, 'holy-baby-drop')
    const pool = buildPool(banner('pet-pickup'), 2, pets, holy)
    const { record, results } = simulate(pool, emptyRecord(1), 30, { pity: 10, featured: holy })
    // 10번째마다 확정되거나 그 전에 나오므로 30번 중 최소 3번은 나온다.
    expect(record.byUnit['holy-baby-drop'] ?? 0).toBeGreaterThanOrEqual(3)
    let gap = 0
    for (const r of results) {
      gap = r.unit.key === 'holy-baby-drop' ? 0 : gap + 1
      expect(gap).toBeLessThan(10)
    }
  })
})
