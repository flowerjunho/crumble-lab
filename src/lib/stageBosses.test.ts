import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { StageBossesData, StagesData } from '../types'
import { mergeStageBosses } from './stageBosses'
import { DEMO_FORM, computeChapter, computeNormalStage, type NormalStageResult } from './normalStage'

const root = join(__dirname, '..', '..')
const read = <T,>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
const raw = read<StagesData>('public/data/stages.json')
const stageBosses = read<StageBossesData>('public/data/stage-bosses.json')
const merged = mergeStageBosses(raw, stageBosses)
const bossOf = (ch: number, st: number) => {
  const row = merged.rows.find((r) => r[0] === ch && r[1] === st)!
  return merged.bosses[row[5]]![0].ko
}

describe('스테이지별 보스(게임 클라이언트 기준)', () => {
  it('10,920개 스테이지가 모두 있고 보스 이름이 한·영·일 모두 채워져 있다', () => {
    expect(stageBosses.rows).toHaveLength(364 * 30)
    for (const names of stageBosses.bosses) {
      expect(names.ko && names.en && names.ja).toBeTruthy()
    }
  })

  // 인게임 확인(326-10, 326-24)과 공개 영상(46-10, 262-10)에서 확인된 보스
  it('인게임으로 확인된 스테이지와 일치한다', () => {
    expect(bossOf(326, 10)).toBe('레드베리 암살자')
    expect(bossOf(326, 24)).toBe('레드베리 암살자')
    expect(bossOf(46, 10)).toBe('레드베리 암살자')
    expect(bossOf(262, 10)).toBe('레드베리 암살자')
  })

  // cookierun.wiki Main Stages(1~168챕터, 8개 맵 순환)에 스테이지 번호가 적힌 보스
  it('위키에 스테이지 번호가 적힌 보스와 모두 일치한다', () => {
    const wiki: Record<number, Record<string, number[]>> = {
      1: { 'King Choco Drop': [1, 2, 5, 10, 15], 'Jelly Worm': [20], 'Cool Mint Cookie': [30] },
      2: { 'Mangosteen Water Bomber': [10, 20], 'Cool Mint Cookie': [30] },
      3: { 'Rowdy Biker': [10, 17, 21, 24, 27], 'Rowdy Truck': [20], GingerCraven: [30] },
      4: { 'Cream Eagle': [10, 16, 19, 23, 26, 29], 'Ginkgoblin Stormer': [20, 30] },
      6: { 'Choco Werehound Princess': [20], 'Cool Mint Cookie': [30] },
      8: { 'Ice Candy Golem': [20], GingerCraven: [30] },
    }
    let checked = 0
    for (let ch = 1; ch <= 168; ch++) {
      for (const [boss, waves] of Object.entries(wiki[((ch - 1) % 8) + 1] ?? {})) {
        for (const st of waves) {
          const row = merged.rows.find((r) => r[0] === ch && r[1] === st)!
          expect(merged.bosses[row[5]]![0].en.toLowerCase()).toBe(boss.toLowerCase())
          checked += 1
        }
      }
    }
    expect(checked).toBe(609)
  })

  it('보스만 바뀌고 전투력·명중·집중은 stages.json 그대로다', () => {
    merged.rows.forEach((row, i) => expect(row.slice(0, 5)).toEqual(raw.rows[i]!.slice(0, 5)))
    const single = computeNormalStage(merged, DEMO_FORM, 'ko') as NormalStageResult
    expect(single.accuracyNeeded).toBe(722)
    expect(computeChapter(merged, 326, { cp: null, baseRateBp: 10000, locale: 'ja' })[23]!.boss).toBe('レッドベリー暗殺者')
  })
})

describe('EOG 종합 스테이지 데이터(eog-stages.json)', () => {
  const full = read<{ bosses: unknown[]; rows: number[][]; offline: { items: unknown[]; ranges: number[][] } }>('public/data/eog-stages.json')

  it('1-1부터 364-30까지 순서대로 빠짐없이 있다', () => {
    expect(full.rows).toHaveLength(10920)
    full.rows.forEach((row, i) => {
      expect(row[0]).toBe(Math.floor(i / 30) + 1)
      expect(row[1]).toBe((i % 30) + 1)
      expect(row).toHaveLength(13)
    })
  })

  it('권장 전투력은 stages.json과 모든 스테이지에서 같다', () => {
    full.rows.forEach((row, i) => expect(row[2]).toBe(raw.rows[i]![2]))
  })

  it('명중·집중은 stages.json 값과 1 미만으로만 다르다(소수 첫째 자리 반올림 차이)', () => {
    full.rows.forEach((row, i) => {
      expect(Math.abs(row[3]! - raw.rows[i]![3])).toBeLessThanOrEqual(1)
      expect(Math.abs(row[4]! - raw.rows[i]![4])).toBeLessThanOrEqual(1)
    })
  })

  it('앱이 쓰는 stage-bosses.json과 보스·마리 수가 같다', () => {
    full.rows.forEach((row, i) => expect([row[6], row[7]]).toEqual(stageBosses.rows[i]))
  })

  it('오프라인 보상 구간이 1번부터 마지막 스테이지까지 이어진다', () => {
    const ranges = full.offline.ranges
    expect(ranges[0]![0]).toBe(1)
    expect(ranges.at(-1)![1]).toBe(10920)
    for (let i = 1; i < ranges.length; i++) expect(ranges[i]![0]).toBe(ranges[i - 1]![1]! + 1)
  })
})
