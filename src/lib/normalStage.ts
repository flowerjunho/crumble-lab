import type { Locale, StagePos, StageRow, StagesData } from '../types'
import { localizedText } from './localize'
import {
  DAMAGE_BANDS,
  REACH_BAND_INDEXES,
  accuracyNeeded,
  debuffRate,
  focusNeeded,
  hitRate,
  powerPenalty,
  type PowerPenalty,
} from './formulas'

export const MAX_CHAPTER = 364
export const STAGES_PER_CHAPTER = 30
const TOTAL_STAGES = MAX_CHAPTER * STAGES_PER_CHAPTER

/** 화면 입력값. 원본처럼 모두 문자열로 보관한다. */
export interface NormalStageForm {
  ch: string
  st: string
  cpM: string
  accuracy: string
  focus: string
  debuffRate: string
}

export const EMPTY_FORM: NormalStageForm = {
  ch: '',
  st: '',
  cpM: '',
  accuracy: '',
  focus: '',
  debuffRate: '10000',
}

/** "예시 넣기" 버튼 값 */
export const EXAMPLE_FORM: NormalStageForm = {
  ch: '114',
  st: '22',
  cpM: '105',
  accuracy: '',
  focus: '',
  debuffRate: '10000',
}

/** ?demo=1 / ?fill=1 로 열었을 때 채우는 값 */
export const DEMO_FORM: NormalStageForm = {
  ch: '114',
  st: '22',
  cpM: '105',
  accuracy: '620',
  focus: '760',
  debuffRate: '10000',
}

export const DEBUFF_RATE_OPTIONS = [10000, 5000, 3000, 2000, 1500] as const

/** 챕터-스테이지를 delta만큼 옮긴다. 범위를 벗어나면 양 끝에서 멈춘다. */
export function shiftStage(pos: StagePos, delta: number): StagePos {
  const ch = Math.min(MAX_CHAPTER, Math.max(1, Math.floor(pos.ch) || 1))
  const st = Math.min(STAGES_PER_CHAPTER, Math.max(1, Math.floor(pos.st) || 1))
  const index = Math.min(TOTAL_STAGES, Math.max(1, (ch - 1) * STAGES_PER_CHAPTER + st + delta))
  return {
    ch: Math.floor((index - 1) / STAGES_PER_CHAPTER) + 1,
    st: ((index - 1) % STAGES_PER_CHAPTER) + 1,
  }
}

/** delta만큼 옮겼을 때 실제로 위치가 바뀌는지 */
export function canShiftStage(pos: StagePos, delta: number): boolean {
  const next = shiftStage(pos, delta)
  return next.ch !== pos.ch || next.st !== pos.st
}

/**
 * 주어진 전투력으로 피해 배율 minMultiplier 이상을 유지하는 마지막 스테이지.
 * 필요 전투력이 스테이지 순서대로 단조 증가하므로 이분 탐색한다.
 */
export function lastStageKeeping(rows: StageRow[], power: number, minMultiplier: number): StagePos | null {
  if (!Number.isFinite(power) || power <= 0) return null
  let lo = 0
  let hi = rows.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (powerPenalty(power, rows[mid]![2]).multiplier + 1e-9 >= minMultiplier) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found < 0 ? null : { ch: rows[found]![0], st: rows[found]![1] }
}

/** 표에 보여 줄 구간: 100%, 75%, 55%, 35% */
const TARGET_BANDS = [
  ...DAMAGE_BANDS.filter((band) => band.multiplier === 1),
  ...REACH_BAND_INDEXES.map((i) => DAMAGE_BANDS[i]!),
]

const parseField = (value: string): number | null => (value === '' ? null : Number(value))

export interface BandPower {
  multiplier: number
  power: number
}

export interface ReachTarget {
  multiplier: number
  power: number | null
  limit: StagePos | null
  limitNext: StagePos | null
}

export interface StatCheck {
  value: number
  rate: number
  needed: number
  missing: number
}

export interface NormalStageResult {
  error: null
  ch: number | null
  st: number | null
  row: StageRow | null
  boss: string | null
  /** 팀 전투력(원 단위) */
  cp: number | null
  penalty: PowerPenalty | null
  currentReach: { multiplier: number; limit: StagePos; limitNext: StagePos | null } | null
  bands: BandPower[]
  nextTarget: BandPower | null
  targets: ReachTarget[]
  accuracyNeeded: number | null
  focusNeeded: number | null
  accuracy: StatCheck | null
  focus: StatCheck | null
}

export type NormalStageOutcome = NormalStageResult | { error: string }

export function computeNormalStage(data: StagesData, form: NormalStageForm, locale: Locale): NormalStageOutcome {
  const ch = parseField(form.ch)
  const st = parseField(form.st)
  const cpM = parseField(form.cpM)
  const accuracyValue = parseField(form.accuracy)
  const focusValue = parseField(form.focus)
  const hasStage = ch !== null || st !== null

  if (
    hasStage &&
    (ch === null ||
      st === null ||
      !Number.isInteger(ch) ||
      !Number.isInteger(st) ||
      ch < 1 ||
      ch > MAX_CHAPTER ||
      st < 1 ||
      st > STAGES_PER_CHAPTER)
  ) {
    return { error: '챕터와 스테이지를 함께 입력해 주세요. 챕터는 1–364, 스테이지는 1–30입니다.' }
  }
  if (cpM !== null && (!Number.isFinite(cpM) || cpM <= 0 || !Number.isSafeInteger(Math.ceil(1e6 * cpM)))) {
    return { error: '팀 전투력은 0보다 큰 값으로, M 단위로 입력해 주세요.' }
  }
  if ([accuracyValue, focusValue].some((v) => v !== null && (!Number.isFinite(v) || v < 0))) {
    return { error: '명중과 집중은 0 이상의 숫자로 입력해 주세요.' }
  }

  const rows = data.rows.filter((r) => r[0] <= MAX_CHAPTER)
  const row = hasStage ? (rows.find((r) => r[0] === ch && r[1] === st) ?? null) : null
  if (hasStage && !row) return { error: '해당 스테이지 데이터가 없습니다.' }

  const baseRate = parseField(form.debuffRate) ?? 1e4
  if (!Number.isFinite(baseRate) || baseRate <= 0 || baseRate > 1e4) {
    return { error: '기본 디버프 적용률을 확인해 주세요.' }
  }

  const cp = cpM === null ? null : 1e6 * cpM
  const penalty = cp !== null && row ? powerPenalty(cp, row[2]) : null
  const nextBand = penalty ? DAMAGE_BANDS.find((b) => b.multiplier > penalty.multiplier) : undefined
  const reach = cp !== null && penalty ? lastStageKeeping(rows, cp, penalty.multiplier) : null
  const bossEntry = row && row[5] >= 0 ? data.bosses[row[5]] : undefined

  const accNeeded = row ? accuracyNeeded(0, row[3]) : null
  const focNeeded = row ? focusNeeded(0, row[4], 0, baseRate) : null

  return {
    error: null,
    ch,
    st,
    row,
    boss: row && row[5] >= 0 ? localizedText(bossEntry?.[0] ?? '', locale) : null,
    cp,
    penalty,
    currentReach:
      penalty && reach
        ? {
            multiplier: penalty.multiplier,
            limit: reach,
            limitNext: canShiftStage(reach, 1) ? shiftStage(reach, 1) : null,
          }
        : null,
    bands: row ? DAMAGE_BANDS.map((b) => ({ multiplier: b.multiplier, power: Math.ceil(row[2] * b.min) })) : [],
    nextTarget: nextBand && row ? { multiplier: nextBand.multiplier, power: Math.ceil(row[2] * nextBand.min) } : null,
    targets: TARGET_BANDS.map((band) => {
      const limit = cp === null ? null : lastStageKeeping(rows, cp, band.multiplier)
      return {
        multiplier: band.multiplier,
        power: row ? Math.ceil(row[2] * band.min) : null,
        limit,
        limitNext: limit && canShiftStage(limit, 1) ? shiftStage(limit, 1) : null,
      }
    }),
    accuracyNeeded: accNeeded,
    focusNeeded: focNeeded,
    accuracy:
      accuracyValue !== null && row
        ? {
            value: accuracyValue,
            rate: hitRate(accuracyValue, 0, row[3]),
            needed: accNeeded!,
            missing: Math.max(0, accNeeded! - accuracyValue),
          }
        : null,
    focus:
      focusValue !== null && row
        ? {
            value: focusValue,
            rate: debuffRate(focusValue, 0, row[4], 0, baseRate),
            needed: focNeeded!,
            missing: Math.max(0, focNeeded! - focusValue),
          }
        : null,
  }
}

/** localStorage에서 읽은 값이 올바른 폼인지 검사한다(원본과 같은 기준). */
export function parseStoredForm(raw: string | null): NormalStageForm | null {
  if (!raw || raw.length >= 2000) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Record<string, unknown>
    const keys = Object.keys(EMPTY_FORM) as (keyof NormalStageForm)[]
    if (!keys.every((k) => typeof record[k] === 'string' && (record[k] as string).length <= 32)) return null
    return Object.fromEntries(keys.map((k) => [k, record[k]])) as unknown as NormalStageForm
  } catch {
    return null
  }
}

/** 챕터 전체 표에 보여 줄 피해 구간(낮은 구간부터) */
export const CHAPTER_BAND_MULTIPLIERS = [0.15, 0.35, 0.55, 0.75, 1] as const

export interface ChapterStage {
  st: number
  boss: string
  /** 피해 100%에 필요한 팀 전투력(원) */
  power: number
  /** 피해 15%·35%·55%·75%·100% 구간에 들어가는 팀 전투력(원), CHAPTER_BAND_MULTIPLIERS 순서 */
  bands: BandPower[]
  accuracyNeeded: number
  focusNeeded: number
  /** 팀 전투력을 넣었을 때 이 스테이지에서의 피해 배율 */
  multiplier: number | null
}

/** 한 챕터의 30개 스테이지 필요 스펙을 한 번에 계산한다. 단일 스테이지 계산과 같은 공식을 쓴다. */
export function computeChapter(
  data: StagesData,
  ch: number,
  options: { cp: number | null; baseRateBp: number; locale: Locale },
): ChapterStage[] {
  const bands = CHAPTER_BAND_MULTIPLIERS.map((m) => DAMAGE_BANDS.find((band) => band.multiplier === m)!)
  return data.rows
    .filter((row) => row[0] === ch)
    .sort((a, b) => a[1] - b[1])
    .map((row) => ({
      st: row[1],
      boss: row[5] >= 0 ? localizedText(data.bosses[row[5]]?.[0] ?? '', options.locale) : '',
      power: row[2],
      bands: bands.map((band) => ({ multiplier: band.multiplier, power: Math.ceil(row[2] * band.min) })),
      accuracyNeeded: accuracyNeeded(0, row[3]),
      focusNeeded: focusNeeded(0, row[4], 0, options.baseRateBp),
      multiplier: options.cp === null ? null : powerPenalty(options.cp, row[2]).multiplier,
    }))
}
