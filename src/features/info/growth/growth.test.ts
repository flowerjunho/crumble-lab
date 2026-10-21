import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CookieDb } from '../../../types'
import { GROWTH_RARITIES, cookieStats, cumulativeExp, gradeBonus, gradeStats, levelBoost, levelCost, type GrowthData } from './growth'

const root = join(__dirname, '..', '..', '..', '..')
const read = <T,>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
const data = read<GrowthData>('public/data/growth.json')
const cookies = read<CookieDb>('public/data/cookie-db.json').cookies
const cookie = (ko: string) => cookies.find((c) => c.name.ko === ko) ?? (() => { throw new Error(ko) })()

describe('쿠키 성장 데이터', () => {
  it('레벨 1~120이 빠짐없고, 경험치·증가율이 레벨마다 있다', () => {
    expect(data.maxLevel).toBe(120)
    expect(data.levels).toHaveLength(120)
    data.levels.forEach((row, i) => {
      expect(row[0]).toBe(i + 1)
      if (i > 0) {
        expect(row[1]).toBeGreaterThan(0)
        expect(row[3]).toBeGreaterThan(data.levels[i - 1]![3])
      }
    })
  })

  // 국내 데이터 위키(cc.team-hobby.com 쿠키 경험치표)와 같은 값인지 몇 행을 대조한다.
  it('레벨 표가 국내 쿠키 경험치표와 같다', () => {
    expect(data.levels[1]).toEqual([2, 500, 1, 691])
    expect(data.levels[49]).toEqual([50, 22056, 42, 62525])
    expect(data.levels[99]).toEqual([100, 3347644, 100, 265299])
    expect(data.levels[119]).toEqual([120, 31234919, 200, 441109])
    expect(cumulativeExp(data)[2]).toBe(1032)
  })

  it('모든 등급이 별 10단계이고, 쿠키 도감의 등급이 모두 들어 있다', () => {
    for (const rarity of GROWTH_RARITIES) expect(data.grades[rarity]).toHaveLength(10)
    for (const c of cookies) expect(GROWTH_RARITIES as readonly string[]).toContain(c.rarity)
    expect(gradeBonus(data, 'TSSR', 10).atk).toBe(1.5937)
    expect(gradeBonus(data, 'C', 10).atk).toBe(0.6289)
    expect(gradeBonus(data, 'SSR', 0).atk).toBe(0)
  })
})

describe('쿠키 능력치 계산', () => {
  // cc.team-hobby.com 쿠키 상세의 승급 표(★별 공격력·방어력·체력)와 같은 값
  it('승급 능력치가 국내 데이터 위키 승급 표와 같다', () => {
    const adventurer = cookie('탐험가맛 쿠키') // U, 73/85/1318
    expect(gradeStats(data, adventurer, 1)).toEqual({ atk: 77, def: 87, hp: 1397 })
    expect(gradeStats(data, adventurer, 10)).toEqual({ atk: 131, def: 102, hp: 2360 })
    const chardonnay = cookie('샤르도네맛 쿠키') // SSR, 133/60/2790
    expect(gradeStats(data, chardonnay, 1)).toEqual({ atk: 145, def: 61, hp: 3041 })
    expect(gradeStats(data, chardonnay, 9)).toEqual({ atk: 289, def: 71, hp: 6060 })
    expect(gradeStats(data, chardonnay, 10)).toEqual({ atk: 315, def: 72, hp: 6605 })
  })

  it('120레벨 10성 탐험가맛 쿠키가 국내 데이터 위키 계산과 같다', () => {
    const s = cookieStats(data, cookie('탐험가맛 쿠키'), 120, 10)
    expect([s.atk, s.def, s.hp]).toEqual([5910, 4601, 106462])
    expect([s.critRate, s.critDamage, s.accuracy, s.avoidance, s.focus, s.resist]).toEqual([0.15, 0.6, 120, 120, 120, 120])
  })

  it('1레벨 0성은 기본 능력치 그대로다', () => {
    const c = cookie('샤르도네맛 쿠키')
    const s = cookieStats(data, c, 1, 0)
    expect([s.atk, s.def, s.hp]).toEqual([c.stats.atk, c.stats.def, c.stats.hp])
    expect([s.critRate, s.critDamage, s.accuracy]).toEqual([0.1, 0.5, 100])
  })

  it('pooled는 두 증가율을 더해서 한 번 곱한다', () => {
    const c = cookie('샤르도네맛 쿠키') // SSR ★10 공격력 +136.74%, 100레벨 +2652.99%
    const s = cookieStats(data, c, 100, 10, 'pooled')
    expect(s.atk).toBe(Math.round(133 * (1 + 26.5299 + 1.3674)))
    expect(cookieStats(data, c, 100, 10).atk).toBe(Math.round(315 * (1 + 26.5299)))
  })

  it('범위를 벗어난 레벨·별은 가장 가까운 값으로 맞춘다', () => {
    const c = cookie('탐험가맛 쿠키')
    expect(cookieStats(data, c, 999, 99)).toEqual(cookieStats(data, c, 120, 10))
    expect(cookieStats(data, c, 0, -3)).toEqual(cookieStats(data, c, 1, 0))
    expect(levelBoost(data, 1)).toBe(0)
  })
})

describe('레벨업 비용', () => {
  it('구간 경험치는 그 사이 레벨 비용의 합이다', () => {
    expect(levelCost(data, 1, 3)).toMatchObject({ from: 1, to: 3, exp: 1032, crumbleLevel: 2 })
    const cum = cumulativeExp(data)
    expect(levelCost(data, 100, 120).exp).toBe(cum[119]! - cum[99]!)
    expect(levelCost(data, 1, 120).exp).toBe(cum[119])
  })

  it('목표가 현재보다 낮으면 비용이 0이다', () => {
    expect(levelCost(data, 50, 10)).toMatchObject({ from: 50, to: 50, exp: 0, statGain: 0 })
  })

  it('능력치 증가 비율은 레벨 배율끼리 나눈 값이다', () => {
    expect(levelCost(data, 100, 120).statGain).toBeCloseTo(45.1109 / 27.5299 - 1, 10)
  })
})
