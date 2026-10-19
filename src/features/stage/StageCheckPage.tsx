import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useI18n, pick } from '../../i18n'
import { readStorage, writeStorage } from '../../lib/storage'
import { NormalStage } from './NormalStage'
import { DimensionStage } from './DimensionStage'

type Mode = 'normal' | 'dimension'

const MODE_KEY = 'crumble.stage-mode'

/** ?mode=dimension 이 저장된 값보다 우선한다. 원본처럼 dimension일 때만 적용한다. */
function useInitialMode(): Mode {
  const [params] = useSearchParams()
  const requested = params.get('mode') ?? readStorage(MODE_KEY)
  return requested === 'dimension' ? 'dimension' : 'normal'
}

export function StageCheckPage() {
  const { locale } = useI18n()
  const initialMode = useInitialMode()
  const [mode, setMode] = useState<Mode>(initialMode)
  const labels = pick(locale, ['일반 스테이지', '차원의 이면'], ['Normal stages', 'Dimension'], ['通常ステージ', '次元の裏側'])

  const select = (next: Mode) => {
    setMode(next)
    writeStorage(MODE_KEY, next)
  }

  return (
    <>
      <div className="mode-row">
        <div className="mode-switch" role="group">
          {(['normal', 'dimension'] as const).map((item, index) => (
            <button key={item} type="button" aria-pressed={mode === item} onClick={() => select(item)}>
              {labels[index]}
              {index === 1 && <span className="new-badge">NEW</span>}
            </button>
          ))}
        </div>
      </div>
      {mode === 'normal' ? <NormalStage /> : <DimensionStage />}
    </>
  )
}
