import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { StagesData } from '../types'
import overrideFile from '../data/boss-overrides.json'
import { applyBossOverrides } from './bossOverrides'
import { DEMO_FORM, computeChapter, computeNormalStage, type NormalStageResult } from './normalStage'

const root = join(__dirname, '..', '..')
const raw = JSON.parse(readFileSync(join(root, 'public/data/stages.json'), 'utf8')) as StagesData
const bossOf = (data: StagesData, ch: number, st: number) => {
  const row = data.rows.find((r) => r[0] === ch && r[1] === st)!
  return data.bosses[row[5]]![0].ko
}

describe('보스 보정 파일', () => {
  // 배포 워크플로가 테스트를 먼저 돌리므로, 잘못 적은 항목이 있으면 배포 전에 멈춘다.
  it('파일의 모든 항목이 문제 없이 적용된다', () => {
    expect(applyBossOverrides(raw, overrideFile).problems).toEqual([])
  })

  it('326-10은 레드베리 암살자로 바뀌고 수치는 그대로다', () => {
    const { data } = applyBossOverrides(raw, overrideFile)
    expect(bossOf(raw, 326, 10)).toBe('식쿠식물')
    expect(bossOf(data, 326, 10)).toBe('레드베리 암살자')
    const before = raw.rows.find((r) => r[0] === 326 && r[1] === 10)!
    const after = data.rows.find((r) => r[0] === 326 && r[1] === 10)!
    expect(after.slice(0, 5)).toEqual(before.slice(0, 5))
    // 원본 데이터는 바꾸지 않는다.
    expect(raw.rows.find((r) => r[0] === 326 && r[1] === 10)![5]).toBe(before[5])
  })

  it('단일 스테이지·챕터 전체 계산 모두 보정된 보스를 쓴다', () => {
    const { data } = applyBossOverrides(raw, overrideFile)
    const single = computeNormalStage(data, { ...DEMO_FORM, ch: '326', st: '10' }, 'en') as NormalStageResult
    expect(single.boss).toBe('Redberry Assassin')
    expect(computeChapter(data, 326, { cp: null, baseRateBp: 10000, locale: 'ko' })[9]!.boss).toBe('레드베리 암살자')
  })

  it('잘못 적은 항목은 적용하지 않고 이유를 알려 준다', () => {
    const { data, problems } = applyBossOverrides(raw, {
      overrides: [
        { stage: '326/10', boss: '레드베리 암살자' },
        { stage: '326-11', boss: '없는 보스' },
        { stage: '999-1', boss: '레드베리 암살자' },
      ],
    })
    expect(problems.map((p) => p.stage)).toEqual(['326/10', '326-11', '999-1'])
    expect(bossOf(data, 326, 10)).toBe('식쿠식물')
    expect(bossOf(data, 326, 11)).toBe(bossOf(raw, 326, 11))
  })
})
