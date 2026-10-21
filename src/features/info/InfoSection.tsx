import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router'
import { pick, useI18n } from '../../i18n'
import { ROUTES } from '../../routes'
import { INFO_TAB_GROUPS } from './infoTabs'

/**
 * 크럼블 정보 탭. 서브탭은 infoTabs.ts의 묶음(도감, 성장·계산, 시뮬레이터, 분석)대로 보여 준다.
 * 각 서브탭은 게임 데이터로 직접 만든 화면이다.
 */
export function InfoSection() {
  const { locale } = useI18n()
  return (
    <section className="info-section" aria-label={pick(locale, '크럼블 정보', 'Crumble info', 'クランブル情報')}>
      <nav className="info-subtabs" aria-label={pick(locale, '크럼블 정보 메뉴', 'Crumble info menu', 'クランブル情報メニュー')}>
        {INFO_TAB_GROUPS.map((group) => (
          <div key={group.label[0]} className="info-subtab-group">
            <span className="info-subtab-group-label">{pick(locale, ...group.label)}</span>
            <div className="info-subtab-links">
              {group.tabs.map((tab) => (
                <NavLink key={tab.path} to={`${ROUTES.info}/${tab.path}`}>
                  {pick(locale, ...tab.label)}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <Suspense fallback={<p className="result-placeholder">{pick(locale, '화면을 불러오고 있습니다.', 'Loading…', '読み込み中…')}</p>}>
        <Outlet />
      </Suspense>
    </section>
  )
}
