import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { Layout } from './components/Layout'
import { StageCheckPage } from './features/stage/StageCheckPage'
import { OptionConsultPage } from './features/runes/OptionConsultPage'
import { GuidePage } from './features/guide/GuidePage'
import { InfoSection } from './features/info/InfoSection'
import { CookieDexPage } from './features/info/CookieDexPage'
import { CookieDetailPage } from './features/info/CookieDetailPage'
import { PetDexPage } from './features/info/PetDexPage'
import { PetDetailPage } from './features/info/PetDetailPage'
import { LEGACY_REDIRECTS, ROUTES } from './routes'

/** 예전 주소는 새 주소로, 알 수 없는 주소는 스테이지 계산으로 보낸다. ?demo=1 같은 쿼리는 유지한다. */
function RedirectToStageCheck() {
  const { pathname, search } = useLocation()
  return <Navigate to={{ pathname: LEGACY_REDIRECTS[pathname] ?? ROUTES.stage, search }} replace />
}

export function App() {
  return (
    <Routes>
      {/* 일반·차원의 이면은 Layout을 공유해서 서로 오갈 때 헤더가 다시 그려지지 않게 한다. */}
      <Route
        path={ROUTES.stage}
        element={
          <Layout page="stage">
            <Outlet />
          </Layout>
        }
      >
        <Route index element={<StageCheckPage mode="normal" />} />
        <Route path="dimension" element={<StageCheckPage mode="dimension" />} />
      </Route>
      <Route
        path={ROUTES.info}
        element={
          <Layout page="info">
            <InfoSection />
          </Layout>
        }
      >
        <Route index element={<Navigate to={ROUTES.cookies} replace />} />
        <Route path="cookies" element={<CookieDexPage />} />
        <Route path="cookies/:slug" element={<CookieDetailPage />} />
        <Route path="pets" element={<PetDexPage />} />
        <Route path="pets/:slug" element={<PetDetailPage />} />
      </Route>
      <Route
        path={ROUTES.recommend}
        element={
          <Layout page="runes">
            <OptionConsultPage />
          </Layout>
        }
      />
      <Route
        path={ROUTES.guide}
        element={
          <Layout page="guide">
            <GuidePage />
          </Layout>
        }
      />
      <Route path="*" element={<RedirectToStageCheck />} />
    </Routes>
  )
}
