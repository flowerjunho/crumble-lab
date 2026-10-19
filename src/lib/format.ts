import type { Locale } from '../types'

/** 0.55 → "55%" */
export const formatPercent = (value: number): string => `${Math.round(100 * value)}%`

/** 원 단위 전투력을 0.01M 단위로 올림해 "111.18" 형태로 표시한다. */
export const formatMillions = (value: number, locale: Locale): string =>
  (Math.ceil(value / 1e4) / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const formatMillionsUnit = (value: number, locale: Locale): string => `${formatMillions(value, locale)} M`

/** 명중·집중처럼 정수로 올림해 보여 주는 수치 */
export const formatCeil = (value: number, locale: Locale): string => Math.ceil(value).toLocaleString(locale)

/** 차원의 이면 표의 전투력(M, 소수 6자리까지) */
export const formatDimensionMillions = (value: number, locale: Locale): string =>
  (value / 1e6).toLocaleString(locale, { maximumFractionDigits: 6 })

/** 차원의 이면 일반 수치(소수 2자리까지) */
export const formatNumber = (value: number, locale: Locale): string =>
  value.toLocaleString(locale, { maximumFractionDigits: 2 })
