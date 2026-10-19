import { useEffect } from 'react'
import { Navigate, NavLink, useSearchParams } from 'react-router'
import { useI18n, pick } from '../../i18n'
import { writeStorage } from '../../lib/storage'
import { ROUTES, STAGE_MODE_KEY } from '../../routes'
import { NormalStage } from './NormalStage'
import { DimensionStage } from './DimensionStage'

export type StageMode = 'normal' | 'dimension'

const MODE_PATHS: Record<StageMode, string> = {
  normal: ROUTES.stage,
  dimension: ROUTES.dimension,
}

/**
 * 일반 스테이지는 /stage, 차원의 이면은 /stage/dimension 으로 나눈다.
 * 주소만으로 화면이 정해지므로 링크를 공유하거나 새로고침해도 같은 탭이 열린다.
 */
export function StageCheckPage({ mode }: { mode: StageMode }) {
  const { locale } = useI18n()
  const [params] = useSearchParams()
  const labels = pick(locale, ['일반 스테이지', '차원의 이면'], ['Normal stages', 'Dimension'], ['通常ステージ', '次元の裏側'])

  // 상단 "스테이지 계산" 탭이 마지막으로 본 화면으로 열리도록 기억해 둔다.
  useEffect(() => {
    writeStorage(STAGE_MODE_KEY, mode)
  }, [mode])

  // 예전 링크(?mode=dimension)는 새 경로로 옮긴다.
  if (mode === 'normal' && params.get('mode') === 'dimension') {
    return <Navigate to={ROUTES.dimension} replace />
  }

  return (
    <>
      <div className="mode-row">
        <nav className="mode-switch" aria-label={pick(locale, '스테이지 종류', 'Stage type', 'ステージの種類')}>
          {(['normal', 'dimension'] as const).map((item, index) => (
            <NavLink key={item} to={MODE_PATHS[item]} end>
              {labels[index]}
              {index === 1 && <span className="new-badge">NEW</span>}
            </NavLink>
          ))}
        </nav>
      </div>
      {mode === 'normal' ? <NormalStage /> : <DimensionStage />}
    </>
  )
}
