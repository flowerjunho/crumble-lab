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
  const [name, count] = data.bosses[row[5]]!
  return `${name.ko}×${count}`
}
/** 맵 6: 젤리 왕꿀벌·식쿠식물·초코크림 늑대 망치공주가 함께 나오는 챕터 */
const map6Chapters = Array.from({ length: 364 }, (_, i) => i + 1).filter((ch) => {
  const names = new Set(raw.rows.filter((r) => r[0] === ch).map((r) => raw.bosses[r[5]]![0].ko))
  return ['젤리 왕꿀벌', '식쿠식물', '초코크림 늑대 망치공주'].every((n) => names.has(n))
})

describe('보스 보정 파일', () => {
  // 배포 워크플로가 테스트를 먼저 돌리므로, 잘못 적은 항목이 있으면 배포 전에 멈춘다.
  it('파일의 모든 항목이 문제 없이 적용된다', () => {
    expect(applyBossOverrides(raw, overrideFile).problems).toEqual([])
  })

  it('맵 6 챕터 45개의 10번 스테이지가 모두 레드베리 암살자로 바뀐다', () => {
    const { data } = applyBossOverrides(raw, overrideFile)
    expect(map6Chapters).toHaveLength(45)
    for (const ch of map6Chapters) {
      expect(bossOf(raw, ch, 10)).toBe('식쿠식물×4')
      expect(bossOf(data, ch, 10)).toBe('레드베리 암살자×1')
    }
    // 외부에서 확인된 세 곳
    for (const ch of [46, 262, 326]) expect(bossOf(data, ch, 10)).toBe('레드베리 암살자×1')
  })

  it('보정한 스테이지 말고는 아무것도 바뀌지 않는다', () => {
    const { data } = applyBossOverrides(raw, overrideFile)
    const changed = data.rows.filter((row, i) => row.some((v, j) => v !== raw.rows[i]![j]))
    expect(changed.map((r) => `${r[0]}-${r[1]}`).sort()).toEqual(map6Chapters.map((ch) => `${ch}-10`).sort())
    // 전투력·명중·집중은 그대로이고, 원본 데이터도 바뀌지 않는다.
    for (const row of changed) {
      const before = raw.rows.find((r) => r[0] === row[0] && r[1] === row[1])!
      expect(row.slice(0, 5)).toEqual(before.slice(0, 5))
      expect(before[5]).not.toBe(row[5])
    }
  })

  it('단일 스테이지·챕터 전체 계산 모두 보정된 보스와 마리 수를 쓴다', () => {
    const { data } = applyBossOverrides(raw, overrideFile)
    const single = computeNormalStage(data, { ...DEMO_FORM, ch: '326', st: '10' }, 'en') as NormalStageResult
    expect([single.boss, single.bossCount]).toEqual(['Redberry Assassin', 1])
    const chapter = computeChapter(data, 326, { cp: null, baseRateBp: 10000, locale: 'ko' })
    expect([chapter[9]!.boss, chapter[9]!.bossCount]).toEqual(['레드베리 암살자', 1])
    expect([chapter[2]!.boss, chapter[2]!.bossCount]).toEqual(['식쿠식물', 4])
  })

  it('마리 수를 지정하면 그 마리 수의 항목을 쓰고, 없으면 새로 만든다', () => {
    const { data, problems } = applyBossOverrides(raw, {
      overrides: [
        { stage: '1-1', boss: '식쿠식물', count: 2 },
        { stage: '1-2', boss: '레드베리 암살자', count: 3 },
      ],
    })
    expect(problems).toEqual([])
    expect(bossOf(data, 1, 1)).toBe('식쿠식물×2')
    expect(bossOf(data, 1, 2)).toBe('레드베리 암살자×3')
    expect(data.bosses.length).toBe(raw.bosses.length + 1)
  })

  it('잘못 적은 항목은 적용하지 않고 이유를 알려 준다', () => {
    const { data, problems } = applyBossOverrides(raw, {
      overrides: [
        { stage: '326/10', boss: '레드베리 암살자' },
        { stages: ['326-11'], boss: '없는 보스' },
        { stage: '999-1', boss: '레드베리 암살자' },
        { stage: '326-12', boss: '레드베리 암살자', count: 0 },
      ],
    })
    expect(problems.map((p) => p.stage)).toEqual(['326/10', '326-11', '326-12', '999-1'])
    expect(bossOf(data, 326, 10)).toBe(bossOf(raw, 326, 10))
    expect(bossOf(data, 326, 11)).toBe(bossOf(raw, 326, 11))
  })
})
