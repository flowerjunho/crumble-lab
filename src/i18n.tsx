import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import messages from './messages.json'
import type { Locale } from './types'
import { readStorage, writeStorage } from './lib/storage'

/** 원본 번들에서 추출한 번역 사전. 키는 한국어 원문, 값은 [영어, 일본어]. */
const dictionary: Record<string, string[]> = messages

const LOCALE_KEY = 'crumble.locale'
export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
]

export type Params = Record<string, string | number>
export type Translate = (key: string, params?: Params) => string

export function translate(locale: Locale, key: string, params: Params = {}): string {
  const text = locale === 'ko' ? key : (dictionary[key]?.[locale === 'ja' ? 1 : 0] ?? key)
  return text.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match))
}

/** 차원의 이면 화면처럼 문구를 사전 대신 세 언어로 직접 들고 있는 곳에서 쓴다. */
export function pick<T>(locale: Locale, ko: T, en: T, ja: T): T {
  return locale === 'ko' ? ko : locale === 'ja' ? ja : en
}

interface I18nValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Translate
}

const I18nContext = createContext<I18nValue | null>(null)

function initialLocale(): Locale {
  const saved = readStorage(LOCALE_KEY)
  return saved === 'en' || saved === 'ja' ? saved : 'ko'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    writeStorage(LOCALE_KEY, next)
  }, [])

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: (key, params) => translate(locale, key, params) }),
    [locale, setLocale],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n은 I18nProvider 안에서만 쓸 수 있습니다.')
  return value
}
