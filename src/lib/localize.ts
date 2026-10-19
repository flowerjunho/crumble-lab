import type { Locale, LocalizedText } from '../types'

const LOCALES: Locale[] = ['ko', 'en', 'ja']
const FALLBACK_ORDER: Locale[] = ['en', 'ko']

const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

/** 다국어 이름에서 현재 언어를 고르고, 비어 있으면 영어 → 한국어 순으로 대신 쓴다. */
export function localizedText(value: LocalizedText | string | null | undefined, locale: Locale): string {
  const target = LOCALES.includes(locale) ? locale : 'ko'
  if (typeof value === 'string') return value
  if (value == null) return ''
  if (hasText(value[target])) return value[target]
  for (const fallback of FALLBACK_ORDER) {
    if (fallback !== target && hasText(value[fallback])) return value[fallback]
  }
  return ''
}
