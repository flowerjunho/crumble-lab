import { useDeferredValue } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { cookieDbQuery } from '../../api/queries'
import { pick, useI18n } from '../../i18n'
import { asset } from '../../lib/asset'
import { ELEMENT, ELEMENT_ORDER, RARITY_ORDER, ROLE, ROLE_ORDER, SYNERGY, SYNERGY_ORDER, label } from '../../lib/cookieLabels'
import { localizedText } from '../../lib/localize'
import { ROUTES } from '../../routes'
import type { CookieEntry, SynergyKey } from '../../types'

/** 공백을 무시하고 대소문자 구분 없이 비교한다. */
const normalize = (text: string) => text.replace(/\s/g, '').toLocaleLowerCase()

export interface DexFilters {
  q: string
  rarity: string
  role: string
  element: string
  synergy: string
  /** gives: 시너지를 주는 쿠키, receives: 받는 쿠키 */
  side: 'gives' | 'receives'
}

export function filterCookies(cookies: CookieEntry[], f: DexFilters, locale: Parameters<typeof localizedText>[1]): CookieEntry[] {
  return cookies.filter(
    (cookie) =>
      (!f.q || normalize(localizedText(cookie.name, locale)).includes(normalize(f.q)) || normalize(cookie.name.ko).includes(normalize(f.q))) &&
      (!f.rarity || cookie.rarity === f.rarity) &&
      (!f.role || cookie.role === f.role) &&
      (!f.element || cookie.element === f.element) &&
      (!f.synergy || cookie.synergy[f.side].includes(f.synergy as SynergyKey)),
  )
}

export function CookieDexPage() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const [params, setParams] = useSearchParams()
  const { data, isPending, isError, refetch } = useQuery(cookieDbQuery)

  const filters: DexFilters = {
    q: params.get('q') ?? '',
    rarity: params.get('rarity') ?? '',
    role: params.get('role') ?? '',
    element: params.get('element') ?? '',
    synergy: params.get('synergy') ?? '',
    side: params.get('side') === 'receives' ? 'receives' : 'gives',
  }
  const deferredQ = useDeferredValue(filters.q)

  // 필터는 주소에 남겨서 상세 화면에서 돌아오거나 링크를 공유해도 그대로 보이게 한다.
  const setFilter = (key: keyof DexFilters, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'synergy' && !value) next.delete('side')
    setParams(next, { replace: true })
  }

  const cookies = data?.cookies ?? []
  const rarities = RARITY_ORDER.filter((r) => cookies.some((c) => c.rarity === r))
  // 77종뿐이라 매번 걸러도 충분히 빠르다.
  const filtered = filterCookies(cookies, { ...filters, q: deferredQ }, locale)
  const filtering = Boolean(filters.q || filters.rarity || filters.role || filters.element || filters.synergy)

  if (isPending) return <p className="result-placeholder">{l('쿠키 정보를 불러오고 있습니다.', 'Loading Cookies…', 'クッキー情報を読み込み中…')}</p>
  if (isError)
    return (
      <div className="no-results">
        <p>{l('쿠키 정보를 불러오지 못했습니다.', 'Unable to load Cookies.', 'クッキー情報を読み込めませんでした。')}</p>
        <button type="button" className="text-button" onClick={() => refetch()}>
          {l('다시 시도', 'Retry', '再試行')}
        </button>
      </div>
    )

  const chip = (key: keyof DexFilters, value: string, text: string) => (
    <button type="button" key={value} aria-pressed={filters[key] === value} onClick={() => setFilter(key, filters[key] === value ? '' : value)}>
      {text}
    </button>
  )

  return (
    <div className="cookie-dex">
      <div className="section-intro">
        <div>
          <h2>{l('쿠키 도감', 'Cookie index', 'クッキー図鑑')}</h2>
          <p>
            {l(
              '쿠키를 누르면 능력치·시너지·스킬 수치를 자세히 볼 수 있습니다.',
              'Tap a Cookie for stats, Synergies and skill numbers.',
              'クッキーをタップすると能力値・シナジー・スキル数値を確認できます。',
            )}
          </p>
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
            placeholder={l('쿠키 이름 검색', 'Search Cookies', 'クッキー名で検索')}
            aria-label={l('쿠키 이름 검색', 'Search Cookies', 'クッキー名で検索')}
          />
        </div>
        <div className="filter-row">
          <span className="filter-label">{l('등급', 'Rarity', 'レア度')}</span>
          <div className="filter-chips">{rarities.map((r) => chip('rarity', r, r))}</div>
        </div>
        <div className="filter-row">
          <span className="filter-label">{l('직업', 'Role', '職業')}</span>
          <div className="filter-chips">{ROLE_ORDER.map((r) => chip('role', r, label(ROLE, r, locale)))}</div>
        </div>
        <div className="filter-row">
          <span className="filter-label">{l('속성', 'Element', '属性')}</span>
          <div className="filter-chips">{ELEMENT_ORDER.map((e) => chip('element', e, label(ELEMENT, e, locale)))}</div>
        </div>
        <div className="filter-row">
          <span className="filter-label">{l('시너지', 'Synergy', 'シナジー')}</span>
          <div className="filter-chips">
            {SYNERGY_ORDER.map((s) => chip('synergy', s, label(SYNERGY, s, locale)))}
            {filters.synergy && (
              <span className="side-toggle" role="group" aria-label={l('시너지 방향', 'Synergy side', 'シナジーの向き')}>
                <button type="button" aria-pressed={filters.side === 'gives'} onClick={() => setFilter('side', 'gives')}>
                  {l('주는 쿠키', 'Gives', '付与')}
                </button>
                <button type="button" aria-pressed={filters.side === 'receives'} onClick={() => setFilter('side', 'receives')}>
                  {l('받는 쿠키', 'Receives', '受ける')}
                </button>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="list-meta">
        <span>{filtering ? l(`검색 결과 ${filtered.length}종`, `${filtered.length} found`, `検索結果 ${filtered.length}種`) : l(`전체 ${filtered.length}종`, `${filtered.length} Cookies`, `全${filtered.length}種`)}</span>
        {filtering && (
          <button type="button" className="text-button" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            {l('필터 초기화', 'Clear filters', 'フィルター解除')}
          </button>
        )}
      </div>

      {filtered.length ? (
        <ul className="dex-grid">
          {filtered.map((cookie) => (
            <li key={cookie.slug}>
              <Link className={`dex-card element-${cookie.element}`} to={`${ROUTES.cookies}/${cookie.slug}`} state={{ from: params.toString() }}>
                <img src={asset(cookie.image)} alt="" width="64" height="70" loading="lazy" />
                <span className="dex-card-name">{localizedText(cookie.name, locale)}</span>
                <span className="dex-card-meta">
                  <span className={`rarity-badge rarity-${cookie.rarity.toLowerCase()}`}>{cookie.rarity}</span>
                  <span>{label(ROLE, cookie.role, locale)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{label(ELEMENT, cookie.element, locale)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="no-results">
          <p>{l('조건에 맞는 쿠키가 없습니다.', 'No Cookies match.', '条件に合うクッキーがありません。')}</p>
        </div>
      )}
    </div>
  )
}
