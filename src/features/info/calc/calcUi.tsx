/**
 * 계산기 세 화면(피해 계산기·능력치 비교·빌드 메이커)이 같이 쓰는 데이터 로딩과 입력 부품.
 */
import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cookieDbQuery, petDbQuery } from '../../../api/queries'
import { pick, useI18n } from '../../../i18n'
import { ELEMENT, ELEMENT_ORDER, RARITY_ORDER, SYNERGY, label as cookieLabel } from '../../../lib/cookieLabels'
import { localizedText } from '../../../lib/localize'
import { PET_MODE } from '../../../lib/petLabels'
import type { CookieElement, CookieEntry, Locale, PetEntry, SynergyKey } from '../../../types'
import type { GrowthData } from '../growth/growth'
import { growthQuery } from '../growth/growthData'
import { COUNT_SYNERGY, EMPTY_LOADOUT, type Loadout, type PetPick, type SynergySteps, type TargetSpec } from './damage'
import { LOADOUT_LABEL, LOADOUT_ORDER, label } from './calcLabels'

export const useL = () => {
  const { locale } = useI18n()
  return { locale, l: <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja) }
}

export interface CalcData {
  cookies: CookieEntry[]
  pets: PetEntry[]
  growth: GrowthData
}

/** 쿠키 도감·펫 도감·성장 데이터를 한꺼번에 불러온다. */
export function useCalcData() {
  const cookieDb = useQuery(cookieDbQuery)
  const petDb = useQuery(petDbQuery)
  const growth = useQuery(growthQuery)
  const isPending = cookieDb.isPending || petDb.isPending || growth.isPending
  const isError = cookieDb.isError || petDb.isError || growth.isError
  const refetch = () => {
    if (cookieDb.isError) cookieDb.refetch()
    if (petDb.isError) petDb.refetch()
    if (growth.isError) growth.refetch()
  }
  const data: CalcData | null = cookieDb.data && petDb.data && growth.data ? { cookies: cookieDb.data.cookies, pets: petDb.data.pets, growth: growth.data } : null
  return { data, isPending, isError, refetch }
}

/** 로딩·오류 화면. 데이터가 준비되면 null을 돌려준다. */
export function CalcStatus({ state }: { state: ReturnType<typeof useCalcData> }): ReactNode {
  const { l } = useL()
  if (state.isError)
    return (
      <div className="no-results">
        <p>{l('계산에 필요한 데이터를 불러오지 못했습니다.', 'Unable to load the data the calculator needs.', '計算に必要なデータを読み込めませんでした。')}</p>
        <button type="button" className="text-button" onClick={state.refetch}>
          {l('다시 시도', 'Retry', '再試行')}
        </button>
      </div>
    )
  if (state.isPending || !state.data) return <p className="result-placeholder">{l('쿠키·펫 정보를 불러오고 있습니다.', 'Loading Cookies and Pets…', 'クッキー・ペット情報を読み込み中…')}</p>
  return null
}

const rarityRank = (rarity: string) => {
  const i = RARITY_ORDER.indexOf(rarity)
  return i < 0 ? RARITY_ORDER.length : i
}

/** 등급 → 이름 순으로 정렬한 쿠키 목록 */
export const sortCookies = (cookies: CookieEntry[], locale: Locale) =>
  [...cookies].sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity) || localizedText(a.name, locale).localeCompare(localizedText(b.name, locale), locale))

export const sortPets = (pets: PetEntry[], locale: Locale) =>
  [...pets].sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity) || localizedText(a.name, locale).localeCompare(localizedText(b.name, locale), locale))

/** 쿠키 고르기(등급별 묶음). value는 eid */
export function CookieSelect({
  cookies,
  value,
  onChange,
  emptyLabel,
  ariaLabel,
  className,
}: {
  cookies: CookieEntry[]
  value: string | null
  onChange: (eid: string | null) => void
  emptyLabel?: string
  ariaLabel: string
  className?: string
}) {
  const { locale } = useL()
  const sorted = sortCookies(cookies, locale)
  const rarities = RARITY_ORDER.filter((r) => sorted.some((c) => c.rarity === r))
  return (
    <select className={className} value={value ?? ''} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value || null)}>
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {rarities.map((rarity) => (
        <optgroup key={rarity} label={rarity}>
          {sorted
            .filter((c) => c.rarity === rarity)
            .map((c) => (
              <option key={c.eid} value={c.eid}>
                {localizedText(c.name, locale)}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  )
}

/** 입력 중에는 빈 칸·범위 밖 값도 그대로 두고, 확정할 때(포커스 해제·Enter) 범위로 맞춘다. */
export function CalcNumber({
  label: text,
  value,
  min,
  max,
  step = 1,
  integer = false,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  integer?: boolean
  onChange: (v: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null) {
      const n = Number(draft)
      if (draft.trim() === '') onChange(Math.max(min, Math.min(max, 0)))
      else if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, integer ? Math.round(n) : Number(n.toFixed(2)))))
    }
    setDraft(null)
  }
  return (
    <label className="calc-field">
      <span>{text}</span>
      <input
        type="number"
        inputMode={integer ? 'numeric' : 'decimal'}
        min={min}
        max={max}
        step={step}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
    </label>
  )
}

/** 레벨(1~최대)·별(0~최대) */
export function GrowthFields({ growth, level, grade, onLevel, onGrade }: { growth: GrowthData; level: number; grade: number; onLevel: (v: number) => void; onGrade: (v: number) => void }) {
  const { l } = useL()
  return (
    <div className="calc-fields">
      <CalcNumber label={l('레벨', 'Level', 'レベル')} value={level} min={1} max={growth.maxLevel} integer onChange={onLevel} />
      <CalcNumber label={l('별', 'Stars', '星')} value={grade} min={0} max={growth.maxGrade} integer onChange={onGrade} />
    </div>
  )
}

/** 슈가룬 등 장착 능력치 입력 */
export function LoadoutFields({ value, onChange }: { value: Partial<Loadout>; onChange: (next: Loadout) => void }) {
  const { locale } = useL()
  const full = { ...EMPTY_LOADOUT, ...value }
  return (
    <div className="calc-fields">
      {LOADOUT_ORDER.map((key) => (
        <CalcNumber
          key={key}
          label={label(LOADOUT_LABEL, key, locale)}
          value={full[key]}
          min={0}
          max={key === 'atkFlat' || key === 'accuracy' ? 100000 : 1000}
          step={key === 'haste' || key === 'atkFlat' || key === 'accuracy' ? 1 : 0.5}
          onChange={(v) => onChange({ ...full, [key]: v })}
        />
      ))}
    </div>
  )
}

/** 펫 3칸(펫 + 별) */
export function PetSlots({ pets, value, onChange }: { pets: PetEntry[]; value: (PetPick | null)[]; onChange: (next: (PetPick | null)[]) => void }) {
  const { l, locale } = useL()
  const sorted = sortPets(pets, locale)
  const set = (i: number, pick: PetPick | null) => onChange(value.map((p, j) => (j === i ? pick : p)))
  return (
    <div className="calc-pets">
      {value.map((pick, i) => (
        <div className="calc-pet" key={i}>
          <select
            aria-label={l(`펫 ${i + 1}`, `Pet ${i + 1}`, `ペット${i + 1}`)}
            value={pick?.pet.slug ?? ''}
            onChange={(e) => {
              const pet = sorted.find((p) => p.slug === e.target.value)
              set(i, pet ? { pet, star: pick?.star ?? 5 } : null)
            }}
          >
            <option value="">{l('펫 없음', 'No Pet', 'ペットなし')}</option>
            {sorted.map((p) => (
              <option key={p.slug} value={p.slug}>
                {`${p.rarity} ${localizedText(p.name, locale)}`}
              </option>
            ))}
          </select>
          <select
            aria-label={l(`펫 ${i + 1} 별`, `Pet ${i + 1} stars`, `ペット${i + 1}の星`)}
            value={pick?.star ?? 5}
            disabled={!pick}
            onChange={(e) => pick && set(i, { ...pick, star: Number(e.target.value) })}
          >
            {[1, 2, 3, 4, 5].map((s) => (
              <option key={s} value={s}>
                {`★${s}`}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}

/** 모드 한정 펫(차원의 이면)을 켤지 */
export function ModeToggle({ mode, onChange }: { mode: string | null; onChange: (mode: string | null) => void }) {
  const { l, locale } = useL()
  return (
    <div className="filter-row">
      <span className="filter-label">{l('모드', 'Mode', 'モード')}</span>
      <div className="filter-chips">
        <button type="button" aria-pressed={mode === null} onClick={() => onChange(null)}>
          {l('일반', 'Standard', '通常')}
        </button>
        <button type="button" aria-pressed={mode === 'DIMENSION_STAGE'} onClick={() => onChange('DIMENSION_STAGE')}>
          {label(PET_MODE, 'DIMENSION_STAGE', locale)}
        </button>
      </div>
    </div>
  )
}

/** 대상 입력 */
export function TargetFields({ value, onChange }: { value: TargetSpec; onChange: (next: TargetSpec) => void }) {
  const { l, locale } = useL()
  const set = <K extends keyof TargetSpec>(key: K, v: TargetSpec[K]) => onChange({ ...value, [key]: v })
  return (
    <>
      <div className="filter-row">
        <span className="filter-label">{l('대상 속성', 'Target element', '対象の属性')}</span>
        <div className="filter-chips">
          <button type="button" aria-pressed={value.element === null} onClick={() => set('element', null)}>
            {l('없음', 'None', 'なし')}
          </button>
          {ELEMENT_ORDER.map((e: CookieElement) => (
            <button type="button" key={e} aria-pressed={value.element === e} onClick={() => set('element', e)}>
              {cookieLabel(ELEMENT, e, locale)}
            </button>
          ))}
        </div>
      </div>
      <div className="filter-row">
        <span className="filter-label">{l('보스', 'Boss', 'ボス')}</span>
        <div className="filter-chips">
          <button type="button" aria-pressed={value.isBoss} onClick={() => set('isBoss', true)}>
            {l('보스', 'Boss', 'ボス')}
          </button>
          <button type="button" aria-pressed={!value.isBoss} onClick={() => set('isBoss', false)}>
            {l('일반 적', 'Regular enemy', '通常の敵')}
          </button>
        </div>
      </div>
      <div className="calc-fields">
        <CalcNumber label={l('방어력', 'DEF', '防御力')} value={value.def} min={0} max={1e9} integer onChange={(v) => set('def', v)} />
        <CalcNumber label={l('회피', 'Avoidance', '回避')} value={value.avoidance} min={0} max={1e9} integer onChange={(v) => set('avoidance', v)} />
        <CalcNumber label={l('회피율(%)', 'Avoidance rate (%)', '回避率(%)')} value={value.avoidanceRate} min={0} max={1000} step={0.5} onChange={(v) => set('avoidanceRate', v)} />
        <CalcNumber label={l('피해감소(%)', 'DMG reduction (%)', 'ダメージ減少(%)')} value={value.damageReduction} min={0} max={100} step={0.5} onChange={(v) => set('damageReduction', v)} />
        <CalcNumber label={l('치명저항(%)', 'CRIT RES (%)', '会心耐性(%)')} value={value.critResist} min={0} max={1000} step={0.5} onChange={(v) => set('critResist', v)} />
      </div>
    </>
  )
}

/** 시너지 값 표기. 개수형은 '+2', 비율형은 '+50%' */
export const synergyAmount = (key: SynergyKey, steps: number) => (COUNT_SYNERGY.has(key) ? `+${Number(steps.toFixed(2))}` : `+${Number((steps * 100).toFixed(1))}%`)

/** 받는 시너지 입력. 이 쿠키가 받는 시너지만 보여 준다. 비율형은 %로 받는다. */
export function SynergyFields({ cookie, value, onChange }: { cookie: CookieEntry; value: SynergySteps; onChange: (next: SynergySteps) => void }) {
  const { l, locale } = useL()
  if (!cookie.synergy.receives.length) return <p className="field-note">{l('이 쿠키는 받는 시너지가 없습니다.', 'This Cookie receives no Synergy.', 'このクッキーが受けるシナジーはありません。')}</p>
  return (
    <div className="calc-fields">
      {cookie.synergy.receives.map((key) => {
        const name = cookieLabel(SYNERGY, key, locale)
        const count = COUNT_SYNERGY.has(key)
        return (
          <CalcNumber
            key={key}
            label={count ? l(`${name} 시너지(개수)`, `${name} Synergy (count)`, `${name}シナジー(個数)`) : l(`${name} 시너지(%)`, `${name} Synergy (%)`, `${name}シナジー(%)`)}
            value={count ? (value[key] ?? 0) : Number(((value[key] ?? 0) * 100).toFixed(1))}
            min={0}
            max={count ? 20 : 500}
            step={count ? 1 : 5}
            integer={count}
            onChange={(v) => onChange({ ...value, [key]: count ? v : v / 100 })}
          />
        )
      })}
    </div>
  )
}

/** 큰 수는 천 단위 구분, 작은 수는 소수 둘째 자리까지 */
export const fmt = (value: number, locale: Locale, digits = 2) => (Number.isFinite(value) ? value.toLocaleString(locale, { maximumFractionDigits: digits }) : '—')
/** 0.1234 → "12.34%" */
export const fmtPct = (fraction: number, locale: Locale) => `${fmt(fraction * 100, locale)}%`
/** 배율 1.15 → "×1.15" */
export const fmtTimes = (value: number, locale: Locale) => `×${fmt(value, locale, 3)}`
