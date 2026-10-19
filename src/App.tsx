import { Navigate, Route, Routes, useLocation } from 'react-router'
import { Layout } from './components/Layout'
import { StageCheckPage } from './features/stage/StageCheckPage'
import { OptionConsultPage } from './features/runes/OptionConsultPage'
import { GuidePage } from './features/guide/GuidePage'
import { LEGACY_REDIRECTS, ROUTES } from './routes'

/** 예전 주소는 새 주소로, 알 수 없는 주소는 스테이지 계산으로 보낸다. ?demo=1 같은 쿼리는 유지한다. */
function RedirectToStageCheck() {
  const { pathname, search } = useLocation()
  return <Navigate to={{ pathname: LEGACY_REDIRECTS[pathname] ?? ROUTES.stage, search }} replace />
}

export function App() {
  return (
    <Routes>
      <Route
        path={ROUTES.stage}
        element={
          <Layout page="stage">
            <StageCheckPage />
          </Layout>
        }
      />
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
