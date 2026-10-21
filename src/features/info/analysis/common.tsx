import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { cookieDbQuery, petDbQuery } from '../../../api/queries'
import { pick, useI18n } from '../../../i18n'
import { ELEMENT, ROLE, label } from '../../../lib/cookieLabels'
import { localizedText } from '../../../lib/localize'
import { ROUTES } from '../../../routes'
import type { CookieEntry, Locale, PetEntry } from '../../../types'
import type { GrowthData } from '../growth/growth'
import { growthQuery } from '../growth/growthData'
import type { Tier } from './model'
import './analysis.css'

export interface AnalysisData {
  cookies: CookieEntry[]
  pets: PetEntry[]
  growth: GrowthData
}

/** 쿠키 도감·펫 도감·성장 데이터를 한꺼번에 받는다. 셋 중 하나라도 없으면 계산할 수 없다. */
export function useAnalysisData() {
  const cookies = useQuery(cookieDbQuery)
  const pets = useQuery(petDbQuery)
  const growth = useQuery(growthQuery)
  const data: AnalysisData | undefined = cookies.data && pets.data && growth.data ? { cookies: cookies.data.cookies, pets: pets.data.pets, growth: growth.data } : undefined
  return {
    data,
    isPending: cookies.isPending || pets.isPending || growth.isPending,
    isError: cookies.isError || pets.isError || growth.isError,
    refetch: () => {
      if (cookies.isError) void cookies.refetch()
      if (pets.isError) void pets.refetch()
      if (growth.isError) void growth.refetch()
    },
  }
}

/** 불러오는 중·실패 화면(펫 도감과 같은 모양) */
export function LoadState({ isPending, onRetry }: { isPending: boolean; onRetry: () => void }) {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  if (isPending) return <p className="result-placeholder">{l('게임 데이터를 불러오고 있습니다.', 'Loading game data…', 'ゲームデータを読み込み中…')}</p>
  return (
    <div className="no-results">
      <p>{l('게임 데이터를 불러오지 못했습니다.', 'Unable to load game data.', 'ゲームデータを読み込めませんでした。')}</p>
      <button type="button" className="text-button" onClick={onRetry}>
        {l('다시 시도', 'Retry', '再試行')}
      </button>
    </div>
  )
}

export function Intro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="section-intro">
      <div>
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
    </div>
  )
}

export const TierBadge = ({ tier }: { tier: Tier }) => <span className={`analysis-tier analysis-tier-${tier.toLowerCase()}`}>{tier}</span>

/** 표 안의 쿠키 이름: 도감 상세로 가는 링크 + 등급·직업·속성 */
export function CookieCell({ cookie, locale, meta = true }: { cookie: CookieEntry; locale: Locale; meta?: boolean }) {
  return (
    <span className="analysis-cookie">
      <Link to={`${ROUTES.cookies}/${cookie.slug}`}>{localizedText(cookie.name, locale)}</Link>
      {meta && (
        <small>
          <span className={`rarity-badge rarity-${cookie.rarity.toLowerCase()}`}>{cookie.rarity}</span> {label(ROLE, cookie.role, locale)} · {label(ELEMENT, cookie.element, locale)}
        </small>
      )}
    </span>
  )
}

export function PetCell({ pet, locale }: { pet: PetEntry; locale: Locale }) {
  return (
    <span className="analysis-cookie">
      <Link to={`${ROUTES.pets}/${pet.slug}`}>{localizedText(pet.name, locale)}</Link>
      <small>
        <span className={`rarity-badge rarity-${pet.rarity.toLowerCase()}`}>{pet.rarity}</span>
      </small>
    </span>
  )
}

export const fmtInt = (value: number, locale: Locale) => Math.round(value).toLocaleString(locale)
/** 0.123 → "+12.3%" */
export const plusPct = (fraction: number, digits = 1) => `${fraction >= 0 ? '+' : '−'}${Math.abs(fraction * 100).toFixed(digits)}%`

/** 칩 버튼 묶음(하나만 고르는 필터) */
export function ChipRow<T extends string | number>({ title, value, options, onChange }: { title: string; value: T; options: { value: T; text: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="filter-row">
      <span className="filter-label">{title}</span>
      <div className="filter-chips">
        {options.map((o) => (
          <button type="button" key={String(o.value)} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
            {o.text}
          </button>
        ))}
      </div>
    </div>
  )
}

/** 기준 레벨·별 고르기. 레벨은 대표값만 칩으로 고른다(10 단위). */
export function BuildPicker({ level, grade, maxLevel, maxGrade, onLevel, onGrade }: { level: number; grade: number; maxLevel: number; maxGrade: number; onLevel: (v: number) => void; onGrade: (v: number) => void }) {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const levels = [60, 80, 100, maxLevel].filter((v, i, a) => v <= maxLevel && a.indexOf(v) === i)
  return (
    <div className="analysis-build">
      <ChipRow title={l('레벨', 'Level', 'レベル')} value={level} options={levels.map((v) => ({ value: v, text: `Lv.${v}` }))} onChange={onLevel} />
      <ChipRow title={l('별', 'Stars', '星')} value={grade} options={Array.from({ length: maxGrade + 1 }, (_, g) => ({ value: g, text: `${g}★` }))} onChange={onGrade} />
    </div>
  )
}

/** 접었다 펴는 '계산 방법' 상자 */
export function Method({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="analysis-method">
      <summary>{title}</summary>
      <div className="analysis-method-body">{children}</div>
    </details>
  )
}
