/**
 * 원본(alkapa.gg) 번들의 계산식을 그대로 옮긴 모듈이다.
 * 반올림·올림 위치까지 원본과 같아야 결과가 일치하므로 식을 단순화하지 않는다.
 */

/** 전투력 피해 배율(만분율). 인덱스가 커질수록 높은 구간이다. */
export const DAMAGE_MULTIPLIERS_BP = [100, 500, 1500, 3500, 5500, 7500, 10000, 12000] as const

/** 권장 전투력 대비 비율의 구간 경계. i번째 구간은 [x[i-1], x[i]) 이다. */
const RATIO_THRESHOLDS = [0.1, 0.2, 0.4, 0.6, 0.8, 1, 1.2, Infinity] as const

export interface DamageBand {
  /** 이 구간에 들어가는 최소 비율 */
  min: number
  /** 이 구간의 상한(미만). 마지막 구간은 null */
  max: number | null
  multiplier: number
}

export const DAMAGE_BANDS: DamageBand[] = DAMAGE_MULTIPLIERS_BP.map((bp, i) => ({
  min: i === 0 ? 0 : RATIO_THRESHOLDS[i - 1]!,
  max: Number.isFinite(RATIO_THRESHOLDS[i]!) ? RATIO_THRESHOLDS[i]! : null,
  multiplier: bp / 1e4,
}))

/** "어디까지 도전할까" 표에 100% 다음으로 보여 주는 구간(75%, 55%, 35%) */
export const REACH_BAND_INDEXES = [5, 4, 3] as const

export interface PowerPenalty {
  multiplier: number
  ratio: number
  nextThreshold: number | null
  needed: number
  nextTarget: number
  nextMultiplier: number
  nextGain: number
}

/** 내 전투력과 권장 전투력으로 현재 피해 구간과 다음 구간을 구한다. */
export function powerPenalty(power: number, required: number): PowerPenalty {
  const table = DAMAGE_MULTIPLIERS_BP
  if (required <= 0) {
    return {
      multiplier: 1.2,
      ratio: Infinity,
      nextThreshold: null,
      needed: 0,
      nextTarget: 0,
      nextMultiplier: 1.2,
      nextGain: 0,
    }
  }
  const ratio = power / required
  let index = RATIO_THRESHOLDS.findIndex((x) => ratio < x)
  if (index < 0) index = table.length - 1
  const multiplier = table[index]! / 1e4
  const isTop = index >= table.length - 1
  const nextTarget = isTop ? 0 : Math.ceil(RATIO_THRESHOLDS[index]! * required)
  return {
    multiplier,
    ratio,
    nextThreshold: isTop ? null : RATIO_THRESHOLDS[index]!,
    needed: isTop ? 0 : Math.max(0, nextTarget - power),
    nextTarget,
    nextMultiplier: isTop ? multiplier : table[index + 1]! / 1e4,
    nextGain: isTop ? 0 : table[index + 1]! / table[index]! - 1,
  }
}

/** 명중으로 얻는 적중률(0~1). */
export function hitRate(accuracy: number, bonusBp: number, avoidance: number, penaltyBp = 0): number {
  return avoidance <= 0 ? 1 : Math.min(1, Math.max(0, accuracy / avoidance + bonusBp / 1e4 - penaltyBp / 1e4))
}

/** 적중률 100%에 필요한 명중. */
export function accuracyNeeded(bonusBp: number, avoidance: number, penaltyBp = 0): number {
  return avoidance <= 0 ? 0 : Math.max(0, Math.ceil(avoidance * (1 + penaltyBp / 1e4 - bonusBp / 1e4)))
}

/** 집중과 기본 적용률(만분율)로 얻는 디버프 적용률(0~1). */
export function debuffRate(focus: number, bonusBp: number, resist: number, penaltyBp: number, baseRateBp: number): number {
  return Math.min(
    1,
    Math.max(0, Math.floor((baseRateBp * ((resist <= 0 ? 1e4 : Math.floor((1e4 * focus) / resist)) + bonusBp - penaltyBp)) / 1e4) / 1e4),
  )
}

/** 디버프 적용률 100%에 필요한 집중. */
export function focusNeeded(bonusBp: number, resist: number, penaltyBp: number, baseRateBp: number): number {
  return resist <= 0 || baseRateBp <= 0
    ? 0
    : Math.max(0, Math.ceil(((Math.ceil(1e8 / baseRateBp) - (bonusBp - penaltyBp)) * resist) / 1e4))
}
