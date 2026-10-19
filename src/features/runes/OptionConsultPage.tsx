import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cookiesQuery } from '../../api/queries'
import { pick, useI18n } from '../../i18n'
import { asset } from '../../lib/asset'
import { localizedText } from '../../lib/localize'
import type { CookieRecommendation, LocalizedText } from '../../types'

/** 공백을 무시하고 대소문자 구분 없이 비교한다. */
const normalize = (text: string) => text.replace(/\s/g, '').toLocaleLowerCase()

export function OptionConsultPage() {
  const { t, locale } = useI18n()
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const { data, isPending, isError, refetch } = useQuery(cookiesQuery)
  const deferredQuery = useDeferredValue(query)

  // 입력 칸 밖에서 "/"를 누르면 검색창으로 이동한다.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        event.key === '/' &&
        !(target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
      ) {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const cookies = data?.cookies ?? []
  const roles = useMemo<LocalizedText[]>(
    () => [...new Map(cookies.map((cookie) => [cookie.role.ko, cookie.role])).values()],
    [cookies],
  )
  const filtered = useMemo(
    () =>
      cookies.filter(
        (cookie) =>
          (!deferredQuery || normalize(localizedText(cookie.name, locale)).includes(normalize(deferredQuery))) &&
          (!role || cookie.role.ko === role),
      ),
    [cookies, deferredQuery, role, locale],
  )

  const reset = () => {
    setQuery('')
    setRole('')
  }
  const countLabel = t(query || role ? '검색 결과 {count}종' : '전체 {count}종', { count: filtered.length })

  return (
    <section aria-label={t('추천 슈가룬')}>
      <div className="section-intro">
        <p className="lead">{t('먼저 챙길 슈가룬 옵션을 확인하세요.')}</p>
      </div>

      <div className="toolbar">
        <div className="search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 5 5" />
          </svg>
          <input
            ref={searchRef}
            id="search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('쿠키 이름 검색')}
            aria-label={t('쿠키 이름 검색')}
          />
          <kbd>/</kbd>
        </div>
        <select aria-label={t('역할 필터')} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">{t('모든 역할')}</option>
          {roles.map((item) => (
            <option key={item.ko} value={item.ko}>
              {localizedText(item, locale)}
            </option>
          ))}
        </select>
        <button type="button" className="icon-button" onClick={reset} aria-label={t('검색과 필터 초기화')} title={t('검색과 필터 초기화')}>
          ↺
        </button>
      </div>

      <div className="list-meta">
        <span>{countLabel}</span>
        <span>{t('신규 쿠키 우선')}</span>
      </div>
      <p className="field-note">
        {t(
          '기존 수집 로그와 캐릭터별 검토를 바탕으로 제공하는 기본 추천입니다. 실제 피해 증가와 관계없이 전략적으로 필요한 옵션은 ‘토벌’로 별도 표시합니다.',
        )}
      </p>
      <ul className="priority-guide" aria-label={t('추천 강조와 배지 안내')}>
        <li>
          <strong>{t('굵은 글씨')}</strong> {t('우선적으로 챙길 옵션')}
        </li>
        <li>
          <span className="priority-badge core">{t('핵심')}</span> {t('해당 옵션으로 대부분 세팅')}
        </li>
        <li>
          <span className="priority-badge raid">{t('토벌')}</span> {t('토벌에서 전략적으로 사용되는 옵션')}
        </li>
      </ul>

      <div className="sr-only" role="status">
        {t('검색 결과 {count}종', { count: filtered.length })}
      </div>

      {isPending ? (
        <p className="result-placeholder">
          {pick(locale, '추천 데이터를 불러오고 있습니다.', 'Loading recommendations…', 'おすすめを読み込み中…')}
        </p>
      ) : isError ? (
        <div className="no-results">
          <p>
            {pick(
              locale,
              '추천 데이터를 불러오지 못했습니다.',
              'Unable to load recommendations.',
              'おすすめを読み込めませんでした。',
            )}
          </p>
          <button type="button" className="text-button" onClick={() => refetch()}>
            {pick(locale, '다시 시도', 'Retry', '再試行')} ↺
          </button>
        </div>
      ) : (
        <div className="recommendation-table" role="table" aria-label={t('캐릭터별 추천 슈가룬')}>
          <div className="table-heading" role="row">
            <span role="columnheader">{t('캐릭터')}</span>
            {[1, 2, 3].map((rank) => (
              <span key={rank} role="columnheader">
                {t('{rank}순위', { rank })}
              </span>
            ))}
          </div>
          <div role="rowgroup">
            {filtered.map((cookie) => (
              <CookieRow key={cookie.id} cookie={cookie} />
            ))}
          </div>
        </div>
      )}

      {data && filtered.length === 0 && (
        <div className="no-results">
          <p>{t('조건에 맞는 쿠키가 없습니다.')}</p>
          <button type="button" onClick={reset} className="text-button">
            {t('검색과 필터 초기화')} ↺
          </button>
        </div>
      )}

      <div className="list-bottom">
        <span>{countLabel}</span>
      </div>
    </section>
  )
}

function CookieRow({ cookie }: { cookie: CookieRecommendation }) {
  const { t, locale } = useI18n()
  return (
    <div className={`cookie-row ${cookie.pending ? 'past' : ''}`} role="row">
      <div className="cookie-identity" role="cell">
        <img className="cookie-thumb" src={asset(cookie.image)} alt="" width="50" height="55" loading="lazy" />
        <div>
          <div className="cookie-name">{localizedText(cookie.name, locale)}</div>
          <div className="cookie-sub">
            <span>{localizedText(cookie.role, locale)}</span>
            <span>·</span>
            <span>{localizedText(cookie.element, locale)}</span>
            {cookie.pending && <span className="tiny-badge">{t('검토 중')}</span>}
          </div>
        </div>
      </div>
      {cookie.options.length ? (
        cookie.options.map((option, index) => (
          <div key={`${option.key}-${index}`} className={`option ${option.bold ? 'first' : ''}`} role="cell">
            <span className="option-num">{index + 1}</span>
            <span className="option-copy">
              {option.bold ? <strong>{t(option.label)}</strong> : <span>{t(option.label)}</span>}
              {option.badge && (
                <span
                  className={`priority-badge ${option.badge}`}
                  title={t(option.badge === 'core' ? '해당 옵션으로 대부분 세팅' : '토벌에서 전략적으로 사용되는 옵션')}
                >
                  {t(option.badge === 'core' ? '핵심' : '토벌')}
                </span>
              )}
            </span>
          </div>
        ))
      ) : (
        <div className="pending-options" role="cell" aria-colspan={3}>
          {t('추천 준비 중')}
        </div>
      )}
    </div>
  )
}
