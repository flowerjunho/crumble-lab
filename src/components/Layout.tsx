import { useEffect, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { LOCALES, useI18n } from '../i18n'
import { cookiesQuery, stagesQuery } from '../api/queries'
import { ROUTES } from '../routes'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'
import type { Locale } from '../types'

type Page = 'stage' | 'runes' | 'guide'

/** 깃발이 꽂힌 계단: 스테이지를 하나씩 올라가는 모습 */
function StageIcon() {
  return (
    <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 21h6v-5h5v-5h6" />
      <path d="M15 11V3l5 2.5L15 8" />
    </svg>
  )
}

/** 다이아몬드 모양 룬 */
function RuneIcon() {
  return (
    <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5 19.5 10 12 21.5 4.5 10Z" />
      <path d="M4.5 10h15M9 10l3 11.5L15 10M9 10l3-7.5 3 7.5" />
    </svg>
  )
}

/** 펼친 책 */
function GuideIcon() {
  return (
    <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 6.5c-2-1.6-4.7-2-8-1.5v13c3.3-.5 6 0 8 1.5 2-1.5 4.7-2 8-1.5V5c-3.3-.5-6-.1-8 1.5Z" />
      <path d="M12 6.5V20" />
    </svg>
  )
}

/** 각 탭이 실제로 쓰는 데이터 묶음의 게임 버전을 보여 준다. */
function useGameVersion(page: Page): string {
  const stages = useQuery({ ...stagesQuery, enabled: page !== 'runes' })
  const cookies = useQuery({ ...cookiesQuery, enabled: page === 'runes' })
  return (page === 'runes' ? cookies.data?.gameVersion : stages.data?._meta.gameVersion) ?? '—'
}

const PAGE_TITLES: Record<Page, string> = {
  stage: '스테이지 계산',
  runes: '추천 슈가룬',
  guide: '크럼블 가이드',
}

export function Layout({ page, children }: { page: Page; children: ReactNode }) {
  const { t, locale, setLocale } = useI18n()
  const version = useGameVersion(page)

  useEffect(() => {
    document.title =
      page === 'runes'
        ? t('쿠키런 크럼블 슈가룬 추천 | 쿠키별 옵션 우선순위')
        : `${t('쿠키런: 크럼블')} · ${t(PAGE_TITLES[page])}`
  }, [page, t])

  return (
    <div className="app">
      <header className="topbar">
        <div className="shell topbar-inner">
          <Link to={ROUTES.stage} className="brand" aria-label="Crumble Lab">
            <Logo />
          </Link>

          {/* 데스크톱에서는 헤더 가운데 알약 모양, 모바일에서는 화면 아래 고정 탭바가 된다. */}
          <nav className="tool-tabs" aria-label={t('크럼블 도구')}>
            <NavLink to={ROUTES.stage}>
              <StageIcon />
              <span>{t('스테이지 계산')}</span>
            </NavLink>
            <NavLink to={ROUTES.recommend}>
              <RuneIcon />
              <span>{t('추천 슈가룬')}</span>
            </NavLink>
            <NavLink to={ROUTES.guide}>
              <GuideIcon />
              <span>{t('크럼블 가이드')}</span>
            </NavLink>
          </nav>

          <div className="topbar-actions">
            <ThemeToggle />
            <label className="locale-select">
              <span className="sr-only">Language</span>
              <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
                {LOCALES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>

      <main className="shell tool-main" id="main">
        <h1 className="sr-only">
          {t('쿠키런: 크럼블')} {t(PAGE_TITLES[page])}
        </h1>

        {children}

        <footer className="page-footer">
          {page !== 'guide' && (
            <Link className="guide-link" to={ROUTES.guide}>
              {t('계산 기준과 게임 가이드')}
            </Link>
          )}
          <span className="version-chip">
            {t('쿠키런: 크럼블')} {version}
          </span>
        </footer>
      </main>
    </div>
  )
}
