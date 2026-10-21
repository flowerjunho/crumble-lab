import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PetDb } from '../../../types'
import {
  bossAt,
  cumulativeFragments,
  formatKst,
  isSpecialStage,
  rankLabel,
  rewardTotals,
  seasonPhase,
  seasonStatus,
  splitDuration,
  stagesOfBoss,
  type DimensionInfo,
} from './dimensionInfo'

const root = join(__dirname, '..', '..', '..', '..')
const read = <T,>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
const data = read<DimensionInfo>('public/data/dimension-info.json')
const pets = read<PetDb>('public/data/pet-db.json').pets
const rotation = (no: number) => data.rotations.find((r) => r.rotation === no) ?? (() => { throw new Error(String(no)) })()
const kst = (s: string) => Date.parse(`${s.replace(' ', 'T')}:00+09:00`)

describe('차원의 이면 정보 데이터', () => {
  it('순환 2개, 각 100단계이고 단계 번호가 1부터 이어진다', () => {
    expect(data.rotations.map((r) => r.stages.length)).toEqual([100, 100])
    for (const r of data.rotations) r.stages.forEach((s, i) => expect(s.stage).toBe(i + 1))
  })

  it('모든 보상·보스에 국내 이름이 있다', () => {
    for (const r of data.rotations) for (const s of r.stages) for (const x of s.rewards) expect(data.items[x.item]?.ko).toMatch(/[가-힣]/)
    for (const row of data.rank) for (const x of [...row.season, ...row.daily]) expect(data.items[x.item]?.ko).toBe('차원의 조각')
    for (const b of data.bosses) expect(b.name.ko).toMatch(/[가-힣]/)
  })

  it('무한바퀴는 펫 도감의 펫 이름과 같다', () => {
    expect(pets.find((p) => p.name.en === 'Continuum Cog')?.name.ko).toBe(data.items.continuumCog?.ko)
  })

  it('시즌은 번호 순서대로 겹치지 않고, 시즌 1만 1순환을 쓴다', () => {
    data.seasons.forEach((s, i) => {
      expect(s.season).toBe(i + 1)
      expect(Date.parse(s.start)).toBeLessThan(Date.parse(s.end))
      const prev = data.seasons[i - 1]
      if (prev) expect(Date.parse(prev.end)).toBeLessThanOrEqual(Date.parse(s.start))
      expect(s.rotation).toBe(s.season === 1 ? 1 : 2)
    })
  })

  // 국내 데이터 위키(cc.team-hobby.com)의 단계 표와 대조한 값
  it('손으로 확인한 단계 보상', () => {
    const r1 = rotation(1)
    const r2 = rotation(2)
    expect(r1.stages[1]?.rewards).toEqual([{ item: 'fragment', qty: 110 }])
    expect(r1.stages[9]?.rewards).toEqual([{ item: 'frame10', qty: 1 }])
    expect(r2.stages[1]?.rewards).toEqual([{ item: 'fragment', qty: 170 }])
    expect(r2.stages[4]?.rewards).toEqual([{ item: 'speedUp1m', qty: 500 }])
    expect(r2.stages[14]?.rewards).toEqual([{ item: 'metalSyrup', qty: 50 }])
    expect(r2.stages[24]?.rewards).toEqual([{ item: 'ssrCookieBox2', qty: 1 }])
    // 방치 보상: 분당 차원의 힘 = 단계 번호(1시간 기준 40단계 2,400)
    expect(r1.stages[39]?.idlePerMinute).toBe(40)
  })

  it('보스 순서: 2순환 5단계는 숙성의 대천사, 1순환 5단계는 비겁한 쿠키', () => {
    const name = (key: string) => data.bosses.find((b) => b.key === key)?.name.ko
    expect(name(bossAt(rotation(1), 5))).toBe('비겁한 쿠키')
    expect(name(bossAt(rotation(2), 5))).toBe('숙성의 대천사')
    expect(name(bossAt(rotation(2), 100))).toBe('폭주단 트럭')
    expect(stagesOfBoss(rotation(2), 'well-aged-archangel').slice(0, 3)).toEqual([5, 11, 17])
  })
})

describe('차원의 이면 계산', () => {
  it('누적 차원의 조각과 합계', () => {
    const r1 = rotation(1)
    const cum = cumulativeFragments(r1.stages)
    expect(cum[0]).toBe(0)
    expect(cum[2]).toBe(230)
    // 2~9단계 110~180, 11~19단계 200~280, 21~29단계 300~380, 31~100단계 400×70
    const expected = 1160 + 2160 + 3060 + 28000
    expect(cum[99]).toBe(expected)
    const totals = rewardTotals(r1.stages)
    expect(totals[0]).toEqual({ item: 'fragment', qty: expected })
    expect(totals.find((t) => t.item === 'continuumCog')?.qty).toBe(2)
    expect(isSpecialStage(r1.stages[0]!)).toBe(true)
    expect(isSpecialStage(r1.stages[1]!)).toBe(false)
  })

  it('현재·다음 시즌을 한국 시간 기준으로 찾는다', () => {
    // 시즌 2 종료 2026-10-22 12:00 KST, 시즌 3 시작 13:30 KST
    expect(seasonStatus(data.seasons, kst('2026-10-21 09:00')).current?.season).toBe(2)
    const gap = seasonStatus(data.seasons, kst('2026-10-22 12:30'))
    expect(gap.current).toBeNull()
    expect(gap.next?.season).toBe(3)
    expect(seasonStatus(data.seasons, kst('2026-10-22 13:30')).current?.season).toBe(3)
    const s2 = data.seasons[1]!
    expect(seasonPhase(s2, kst('2026-10-22 12:00'))).toBe('past')
    expect(formatKst(s2.end)).toBe('2026.10.22 12:00')
    expect(formatKst(data.seasons[0]!.start)).toBe('2026.09.23 11:30')
  })

  it('순위 구간 이름과 남은 시간', () => {
    expect(data.rank.map((_, i) => rankLabel(data.rank, i, 'ko'))).toEqual([
      '1위', '2위', '3위', '4~10위', '11~50위', '51~100위', '101~200위', '201~500위', '501~1000위', '참여 보상',
    ])
    expect(rankLabel(data.rank, 3, 'en')).toBe('#4–10')
    expect(splitDuration((26 * 60 + 5) * 60000)).toEqual({ days: 1, hours: 2, minutes: 5 })
    expect(splitDuration(-1)).toEqual({ days: 0, hours: 0, minutes: 0 })
  })

  it('차원의 힘 레벨 표는 100레벨, 능력치 7종', () => {
    expect(data.energy.stats).toEqual(['atk', 'def', 'hp', 'critRate', 'critDamage', 'accuracy', 'focus'])
    expect(data.energy.levels).toHaveLength(100)
    expect(data.energy.levels[1]).toEqual([2, 30, 10, 10, 10, 10, 30, 10, 5])
  })
})
