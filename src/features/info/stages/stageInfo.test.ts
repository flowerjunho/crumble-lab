import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ELEMENT_ORDER } from '../../../lib/cookieLabels'
import { parseChapter, savedTeamPower } from './StageInfoPage'
import {
  chapterOffline,
  chapterRows,
  chapterSeries,
  offlineItemName,
  stageOrder,
  type EogStagesData,
  type StageExtrasData,
} from './stageInfoData'

const root = join(__dirname, '..', '..', '..', '..')
const read = <T,>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
const stages = read<EogStagesData>('public/data/eog-stages.json')
const extras = read<StageExtrasData>('public/data/stage-extras.json')

describe('스테이지 표', () => {
  it('364챕터 × 30스테이지가 1-1부터 순서대로 있다', () => {
    expect(stages.rows).toHaveLength(10920)
    stages.rows.forEach((row, i) => expect(stageOrder(row[0], row[1])).toBe(i + 1))
  })

  it('모든 보스에 국내 이름이 있다', () => {
    for (const boss of stages.bosses) expect(boss.ko).toMatch(/[가-힣]/)
    for (const row of stages.rows) expect(stages.bosses[row[6]]).toBeDefined()
  })

  it('권장 전투력은 스테이지가 올라가도 줄지 않는다', () => {
    for (let i = 1; i < stages.rows.length; i++) expect(stages.rows[i]![2]).toBeGreaterThanOrEqual(stages.rows[i - 1]![2])
  })

  it('챕터 표가 그 챕터의 30줄을 돌려준다', () => {
    const rows = chapterRows(stages, 20)
    expect(rows).toHaveLength(30)
    expect(rows[0]!.slice(0, 2)).toEqual([20, 1])
    // 손으로 확인한 값: 20-30 권장 전투력 412,941, 보스 체력 428,058
    expect(rows[29]!.slice(0, 3)).toEqual([20, 30, 412941])
    expect(rows[29]![8]).toBe(428058)
  })
})

describe('챕터별 권장 전투력 그래프', () => {
  const series = chapterSeries(stages)

  it('챕터마다 점이 하나씩 있고 최고값은 30번째 스테이지 값이다', () => {
    expect(series).toHaveLength(364)
    expect(series[0]).toEqual({ chapter: 1, first: 1600, max: 10258 })
    expect(series[363]!.max).toBe(24202164458)
  })

  it('로그 눈금에 쓸 수 있게 모든 값이 0보다 크다', () => {
    for (const p of series) expect(Math.min(p.first, p.max)).toBeGreaterThan(0)
  })
})

describe('자동 사냥 보상', () => {
  it('1챕터는 1-2·1-10·1-20·1-30에서 구간이 나뉜다', () => {
    const bands = chapterOffline(stages, 1)
    expect(bands.map((b) => [b.fromStage, b.toStage])).toEqual([
      [1, 2],
      [3, 10],
      [11, 20],
      [21, 30],
    ])
  })

  it('1시간 분량은 everySec마다 받는 양을 1시간으로 환산한 값이다', () => {
    const [first] = chapterOffline(stages, 1)
    const coin = stages.offline.items.findIndex((item) => item.name === 'Coins')
    const mileage = stages.offline.items.findIndex((item) => item.name === 'Mileage Points')
    // 코인은 60초마다 10개 → 1시간 600개, 마일리지 포인트는 1시간마다 5점
    expect(first!.perHour[coin]).toBe(600)
    expect(first!.perHour[mileage]).toBe(5)
    const late = chapterOffline(stages, 41)
    expect(late.map((b) => b.perHour[coin])).toEqual([16600 * 60, 17500 * 60, 18400 * 60])
  })

  it('모든 챕터에 보상 구간이 있고 1~30을 빈틈없이 덮는다', () => {
    for (let ch = 1; ch <= 364; ch++) {
      const bands = chapterOffline(stages, ch)
      expect(bands[0]!.fromStage).toBe(1)
      expect(bands[bands.length - 1]!.toStage).toBe(30)
      for (let i = 1; i < bands.length; i++) expect(bands[i]!.fromStage).toBe(bands[i - 1]!.toStage + 1)
    }
  })

  it('보상 아이템마다 국내 이름이 있다', () => {
    for (const item of stages.offline.items) expect(offlineItemName(item.name, 'ko')).toMatch(/[가-힣]/)
    expect(offlineItemName('Chocosteel', 'ko')).toBe('초코강')
  })
})

describe('속성 상성', () => {
  it('다섯 속성이 한 줄씩 있고 유리한 상대에게 피해 +15%', () => {
    const { rows, bonusPercent } = extras.elementAdvantage
    expect(bonusPercent).toBe(15)
    expect(rows.map((r) => r.element).sort()).toEqual([...ELEMENT_ORDER].sort())
    expect(rows.find((r) => r.element === 'fire')).toEqual({ element: 'fire', strongAgainst: 'grass', weakAgainst: 'water' })
    // 빛과 어둠은 서로에게 유리하다.
    expect(rows.find((r) => r.element === 'light')?.strongAgainst).toBe('dark')
    expect(rows.find((r) => r.element === 'dark')?.strongAgainst).toBe('light')
  })

  it('불·물·풀은 서로 맞물려 돈다', () => {
    const strong = new Map(extras.elementAdvantage.rows.map((r) => [r.element, r.strongAgainst]))
    expect(strong.get(strong.get(strong.get('fire')!)!)).toBe('fire')
  })
})

describe('입력 읽기', () => {
  it('주소의 챕터 값은 범위를 벗어나면 1챕터가 된다', () => {
    expect(parseChapter('42', 364)).toBe(42)
    expect(parseChapter(null, 364)).toBe(1)
    expect(parseChapter('0', 364)).toBe(1)
    expect(parseChapter('365', 364)).toBe(1)
    expect(parseChapter('3.5', 364)).toBe(1)
  })

  it('계산기의 팀 전투력(M)을 원 단위로 바꾼다', () => {
    expect(savedTeamPower('105')).toBe(105e6)
    expect(savedTeamPower('')).toBeNull()
    expect(savedTeamPower(null)).toBeNull()
    expect(savedTeamPower('-1')).toBeNull()
    expect(savedTeamPower('abc')).toBeNull()
  })
})
