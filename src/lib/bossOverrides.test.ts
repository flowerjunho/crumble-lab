import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { StageBossesData, StagesData } from '../types'
import overrideFile from '../data/boss-overrides.json'
import { applyBossOverrides, type BossOverrideFile } from './bossOverrides'
import { mergeStageBosses } from './stageBosses'

const root = join(__dirname, '..', '..')
const read = <T,>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
const base = mergeStageBosses(read<StagesData>('public/data/stages.json'), read<StageBossesData>('public/data/stage-bosses.json'))
const bossOf = (data: StagesData, ch: number, st: number) => {
  const row = data.rows.find((r) => r[0] === ch && r[1] === st)!
  const [name, count] = data.bosses[row[5]]!
  return `${name.ko}×${count}`
}

describe('보스 보정 파일', () => {
  // 배포 워크플로가 테스트를 먼저 돌리므로, 잘못 적은 항목이 있으면 배포 전에 멈춘다.
  it('파일의 모든 항목이 문제 없이 적용된다', () => {
    expect(applyBossOverrides(base, overrideFile as BossOverrideFile).problems).toEqual([])
  })

  it('지정한 스테이지만 바뀌고 수치와 원본 데이터는 그대로다', () => {
    const { data, problems } = applyBossOverrides(base, {
      overrides: [{ stages: ['1-1', '1-2'], boss: '레드베리 암살자', count: 3 }],
    })
    expect(problems).toEqual([])
    expect(bossOf(data, 1, 1)).toBe('레드베리 암살자×3')
    expect(bossOf(data, 1, 2)).toBe('레드베리 암살자×3')
    const changed = data.rows.filter((row, i) => row[5] !== base.rows[i]![5]).map((r) => `${r[0]}-${r[1]}`)
    expect(changed).toEqual(['1-1', '1-2'])
    data.rows.forEach((row, i) => expect(row.slice(0, 5)).toEqual(base.rows[i]!.slice(0, 5)))
  })

  it('잘못 적은 항목은 적용하지 않고 이유를 알려 준다', () => {
    const { data, problems } = applyBossOverrides(base, {
      overrides: [
        { stage: '326/10', boss: '레드베리 암살자' },
        { stages: ['326-11'], boss: '없는 보스' },
        { stage: '999-1', boss: '레드베리 암살자' },
        { stage: '326-12', boss: '레드베리 암살자', count: 0 },
      ],
    })
    expect(problems.map((p) => p.stage)).toEqual(['326/10', '326-11', '326-12', '999-1'])
    expect(data.rows.every((row, i) => row[5] === base.rows[i]![5])).toBe(true)
  })
})
