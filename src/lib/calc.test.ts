import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DimensionData, StagesData } from '../types'
import messages from '../messages.json'
import { DAMAGE_BANDS, powerPenalty } from './formulas'
import { formatDimensionMillions, formatMillionsUnit } from './format'
import { DEMO_FORM, computeChapter, computeNormalStage, shiftStage, type NormalStageResult } from './normalStage'

const root = join(__dirname, '..', '..')
const stages = JSON.parse(readFileSync(join(root, 'public/data/stages.json'), 'utf8')) as StagesData
const dimension = JSON.parse(readFileSync(join(root, 'public/data/dimension.json'), 'utf8')) as DimensionData

/**
 * 기대값은 2026-10-19 alkapa.gg 원본 화면에 같은 값을 넣고 읽은 결과다.
 * 일반: 114-22, 105M, 명중 620, 집중 760 / 차원: 10단계, 30000M, 레벨 10
 */
describe('일반 스테이지 (원본 화면과 비교)', () => {
  const outcome = computeNormalStage(stages, DEMO_FORM, 'ko')
  const result = outcome as NormalStageResult

  it('스테이지 정보와 현재 피해 구간', () => {
    expect(outcome.error).toBeNull()
    expect(result.boss).toBe('두리안 해적 추종자')
    expect(result.penalty?.multiplier).toBe(0.75)
    expect(result.nextTarget?.multiplier).toBe(1)
    expect(formatMillionsUnit(result.nextTarget!.power, 'ko')).toBe('111.18 M')
    expect(formatMillionsUnit(result.nextTarget!.power - result.cp!, 'ko')).toBe('6.18 M')
  })

  it('피해 구간별 목표 전투력과 유지 범위', () => {
    const rows = result.targets.map((target) => [
      Math.round(target.multiplier * 100),
      formatMillionsUnit(target.power!, 'ko'),
      `${target.limit!.ch}–${target.limit!.st}`,
      `${target.limitNext!.ch}–${target.limitNext!.st}`,
    ])
    expect(rows).toEqual([
      [100, '111.18 M', '110–16', '110–17'],
      [75, '88.94 M', '130–5', '130–6'],
      [55, '66.71 M', '157–12', '157–13'],
      [35, '44.47 M', '180–19', '180–20'],
    ])
    expect(result.currentReach?.limit).toEqual({ ch: 130, st: 5 })
  })

  it('명중과 집중', () => {
    expect(result.accuracyNeeded).toBe(722)
    expect(result.accuracy?.missing).toBe(102)
    expect(Math.round(result.accuracy!.rate * 100)).toBe(86)
    expect(result.focusNeeded).toBe(612)
    expect(result.focus?.missing).toBe(0)
  })

  it('입력 검증 문구', () => {
    expect(computeNormalStage(stages, { ...DEMO_FORM, st: '' }, 'ko').error).toContain('챕터와 스테이지를 함께')
    expect(computeNormalStage(stages, { ...DEMO_FORM, cpM: '0' }, 'ko').error).toContain('팀 전투력은')
    expect(computeNormalStage(stages, { ...DEMO_FORM, accuracy: '-1' }, 'ko').error).toContain('명중과 집중은')
  })

  it('스테이지 이동은 양 끝에서 멈춘다', () => {
    expect(shiftStage({ ch: 1, st: 30 }, 1)).toEqual({ ch: 2, st: 1 })
    expect(shiftStage({ ch: 1, st: 1 }, -1)).toEqual({ ch: 1, st: 1 })
    expect(shiftStage({ ch: 364, st: 30 }, 1)).toEqual({ ch: 364, st: 30 })
  })
})

describe('챕터 전체 보기', () => {
  const chapter = computeChapter(stages, 114, { cp: 105e6, baseRateBp: 10000, locale: 'ko' })
  const single = computeNormalStage(stages, DEMO_FORM, 'ko') as NormalStageResult

  it('30개 스테이지를 순서대로 돌려준다', () => {
    expect(chapter.map((stage) => stage.st)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1))
  })

  it('단일 스테이지 계산과 같은 값을 낸다', () => {
    const st22 = chapter[21]!
    expect(st22.boss).toBe(single.boss)
    expect(st22.power).toBe(single.row![2])
    // 15%~100% 구간 전투력이 단일 스테이지 계산의 구간 값과 같아야 한다.
    for (const band of st22.bands) {
      expect(band.power).toBe(single.bands.find((b) => b.multiplier === band.multiplier)!.power)
    }
    expect(st22.bands.map((b) => b.multiplier)).toEqual([0.15, 0.35, 0.55, 0.75, 1])
    expect(st22.bands.at(-1)!.power).toBe(st22.power)
    expect(st22.accuracyNeeded).toBe(722)
    expect(st22.focusNeeded).toBe(612)
    expect(st22.multiplier).toBe(0.75)
  })
})

describe('차원의 이면 (원본 화면과 비교)', () => {
  const required = Number(dimension.stages[9]!.cp)
  const penalty = powerPenalty(30000 * 1e6, required)

  it('피해 구간과 다음 목표', () => {
    expect(penalty.multiplier).toBe(0.15)
    expect((100 * penalty.ratio).toFixed(2)).toBe('26.44')
    expect(penalty.nextMultiplier).toBe(0.35)
    expect(formatDimensionMillions(penalty.nextTarget, 'ko')).toBe('45,379.123932')
    expect(formatDimensionMillions(penalty.needed, 'ko')).toBe('15,379.123932')
  })

  it('구간별 진입 전투력 표', () => {
    expect(DAMAGE_BANDS.map((band) => formatDimensionMillions(Math.ceil(required * band.min), 'ko'))).toEqual([
      '0',
      '11,344.780983',
      '22,689.561966',
      '45,379.123932',
      '68,068.685898',
      '90,758.247864',
      '113,447.809829',
      '136,137.371795',
    ])
  })

  it('적 정보와 차원의 힘', () => {
    expect(dimension.stages[9]!.avoidance).toBe(2287)
    expect(dimension.stages[9]!.resist).toBe(2327)
    expect(dimension.energy[9]!.total).toBe(24870)
    expect(dimension.energy[10]!.total - dimension.energy[9]!.total).toBe(6000)
    expect(dimension.rewards.find((r) => r.stages.includes(10))?.perMinute).toBe(10)
  })
})

describe('데이터 무결성', () => {
  it('일반 스테이지 필요 전투력은 순서대로 커진다(이분 탐색 전제)', () => {
    const rows = stages.rows
    expect(rows).toHaveLength(364 * 30)
    expect(rows.every((row, i) => i === 0 || row[2] >= rows[i - 1]![2])).toBe(true)
  })
})

describe('번역 사전', () => {
  // t('...')로 넘기는 한국어 원문이 사전에 모두 있어야 영어·일본어 화면에서 빠지는 문구가 없다.
  it('코드에서 쓰는 번역 키가 사전에 모두 있다', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (path.endsWith('.tsx')) files.push(path)
      }
    }
    walk(join(root, 'src'))
    const keys = new Set<string>()
    for (const file of files) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([^']+)'/g)) keys.add(match[1]!)
    }
    const dictionary = messages as Record<string, unknown>
    expect([...keys].filter((key) => !(key in dictionary))).toEqual([])
  })
})
