import { useDeferredValue } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { petDbQuery } from '../../api/queries'
import { pick, useI18n } from '../../i18n'
import { asset } from '../../lib/asset'
import { ELEMENT, ELEMENT_ORDER, RARITY_ORDER, ROLE, ROLE_ORDER, label } from '../../lib/cookieLabels'
import { localizedText } from '../../lib/localize'
import { PET_EFFECT_KIND, PET_EFFECT_KIND_ORDER, petEffectKinds, petTargetLabel, petTierText } from '../../lib/petLabels'
import { ROUTES } from '../../routes'
import type { Locale, PetEntry } from '../../types'

const normalize = (text: string) => text.replace(/\s/g, '').toLocaleLowerCase()

export interface PetFilters {
  q: string
  rarity: string
  effect: string
  /** all: 아군 전체 대상, 속성 키(fire…) 또는 직업 키(charge…) */
  target: string
}

export function filterPets(pets: PetEntry[], f: PetFilters, locale: Locale): PetEntry[] {
  return pets.filter((pet) => {
    const { elements, roles, receivesSynergy } = pet.target
    const targetOk =
      !f.target ||
      (f.target === 'all' ? !elements.length && !roles.length && !receivesSynergy : elements.includes(f.target as never) || roles.includes(f.target as never))
    return (
      (!f.q || normalize(localizedText(pet.name, locale)).includes(normalize(f.q)) || normalize(pet.name.ko).includes(normalize(f.q))) &&
      (!f.rarity || pet.rarity === f.rarity) &&
      (!f.effect || petEffectKinds(pet).includes(f.effect)) &&
      targetOk
    )
  })
}

/** 같은 등급 안에서는 게임 데이터 순서를 지키고, 등급은 높은 것부터 보여 준다. */
const byRarity = (pets: PetEntry[]) => [...pets].sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity))

export function PetDexPage() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const [params, setParams] = useSearchParams()
  const { data, isPending, isError, refetch } = useQuery(petDbQuery)

  const filters: PetFilters = {
    q: params.get('q') ?? '',
    rarity: params.get('rarity') ?? '',
    effect: params.get('effect') ?? '',
    target: params.get('target') ?? '',
  }
  const deferredQ = useDeferredValue(filters.q)

  const setFilter = (key: keyof PetFilters, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const pets = byRarity(data?.pets ?? [])
  const rarities = RARITY_ORDER.filter((r) => pets.some((p) => p.rarity === r))
  const effects = PET_EFFECT_KIND_ORDER.filter((kind) => pets.some((p) => petEffectKinds(p).includes(kind)))
  const filtered = filterPets(pets, { ...filters, q: deferredQ }, locale)
  const filtering = Boolean(filters.q || filters.rarity || filters.effect || filters.target)

  if (isPending) return <p className="result-placeholder">{l('펫 정보를 불러오고 있습니다.', 'Loading Pets…', 'ペット情報を読み込み中…')}</p>
  if (isError)
    return (
      <div className="no-results">
        <p>{l('펫 정보를 불러오지 못했습니다.', 'Unable to load Pets.', 'ペット情報を読み込めませんでした。')}</p>
        <button type="button" className="text-button" onClick={() => refetch()}>
          {l('다시 시도', 'Retry', '再試行')}
        </button>
      </div>
    )

  const chip = (key: keyof PetFilters, value: string, text: string) => (
    <button type="button" key={value} aria-pressed={filters[key] === value} onClick={() => setFilter(key, filters[key] === value ? '' : value)}>
      {text}
    </button>
  )

  return (
    <div className="cookie-dex">
      <div className="section-intro">
        <div>
          <h2>{l('펫 도감', 'Pet index', 'ペット図鑑')}</h2>
          <p>{l('펫을 누르면 별 등급별 효과와 효과를 받는 쿠키를 볼 수 있습니다.', 'Tap a Pet for its effect at each star and the Cookies it helps.', 'ペットをタップすると星ごとの効果と効果を受けるクッキーを確認できます。')}</p>
        </div>
      </div>

      <div className="dex-filters panel">
        <div className="search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 5 5" />
          </svg>
          <input
            type="search"
            value={filters.q}
            onChange={(e) => setFilter('q', e.target.value)}
            placeholder={l('펫 이름 검색', 'Search Pets', 'ペット名で検索')}
            aria-label={l('펫 이름 검색', 'Search Pets', 'ペット名で検索')}
          />
        </div>
        <div className="filter-row">
          <span className="filter-label">{l('등급', 'Rarity', 'レア度')}</span>
          <div className="filter-chips">{rarities.map((r) => chip('rarity', r, r))}</div>
        </div>
        <div className="filter-row">
          <span className="filter-label">{l('효과', 'Effect', '効果')}</span>
          <div className="filter-chips">{effects.map((kind) => chip('effect', kind, label(PET_EFFECT_KIND, kind, locale)))}</div>
        </div>
        <div className="filter-row">
          <span className="filter-label">{l('대상', 'Target', '対象')}</span>
          <div className="filter-chips">
            {chip('target', 'all', l('아군 전체', 'All allies', '味方全体'))}
            {ELEMENT_ORDER.map((e) => chip('target', e, label(ELEMENT, e, locale)))}
            {ROLE_ORDER.map((r) => chip('target', r, label(ROLE, r, locale)))}
          </div>
        </div>
      </div>

      <div className="list-meta">
        <span>{filtering ? l(`검색 결과 ${filtered.length}종`, `${filtered.length} found`, `検索結果 ${filtered.length}種`) : l(`전체 ${filtered.length}종`, `${filtered.length} Pets`, `全${filtered.length}種`)}</span>
        {filtering && (
          <button type="button" className="text-button" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            {l('필터 초기화', 'Clear filters', 'フィルター解除')}
          </button>
        )}
      </div>

      {filtered.length ? (
        <ul className="dex-grid">
          {filtered.map((pet) => {
            const top = pet.tiers[pet.tiers.length - 1]
            return (
              <li key={pet.slug}>
                <Link className="dex-card pet-card" to={`${ROUTES.pets}/${pet.slug}`} state={{ from: params.toString() }}>
                  <img src={asset(pet.image)} alt="" width="64" height="64" loading="lazy" />
                  <span className="dex-card-name">{localizedText(pet.name, locale)}</span>
                  <span className="dex-card-meta">
                    <span className={`rarity-badge rarity-${pet.rarity.toLowerCase()}`}>{pet.rarity}</span>
                    <span>{petTargetLabel(pet, locale)}</span>
                  </span>
                  {top && <span className="pet-card-effect">★5 {petTierText(pet, top, locale)}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="no-results">
          <p>{l('조건에 맞는 펫이 없습니다.', 'No Pets match.', '条件に合うペットがいません。')}</p>
        </div>
      )}
    </div>
  )
}
