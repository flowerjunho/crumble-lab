import { NavLink, Outlet } from 'react-router'
import { pick, useI18n } from '../../i18n'
import { ROUTES } from '../../routes'

/**
 * 크럼블 정보 탭. 서브탭을 하나씩 늘려 간다(현재: 쿠키 도감, 펫 도감).
 * 각 서브탭은 게임 데이터로 직접 만든 화면이다.
 */
const SUB_TABS: { to: string; label: readonly [string, string, string] }[] = [
  { to: ROUTES.cookies, label: ['쿠키 도감', 'Cookie index', 'クッキー図鑑'] as const },
  { to: ROUTES.pets, label: ['펫 도감', 'Pet index', 'ペット図鑑'] as const },
]

export function InfoSection() {
  const { locale } = useI18n()
  return (
    <section className="info-section" aria-label={pick(locale, '크럼블 정보', 'Crumble info', 'クランブル情報')}>
      <nav className="info-subtabs" aria-label={pick(locale, '크럼블 정보 메뉴', 'Crumble info menu', 'クランブル情報メニュー')}>
        {SUB_TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to}>
            {pick(locale, ...tab.label)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </section>
  )
}
