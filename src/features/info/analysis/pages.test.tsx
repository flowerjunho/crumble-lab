import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { cookieDbQuery, petDbQuery, stagesQuery } from '../../../api/queries'
import { I18nProvider } from '../../../i18n'
import type { CookieDb, PetDb, StagesData } from '../../../types'
import type { GrowthData } from '../growth/growth'
import { growthQuery } from '../growth/growthData'
import { runeCraftQuery, type RuneCraftData } from '../runes/runeCraft'
import { OverviewPage } from './OverviewPage'
import { TeamsPage } from './TeamsPage'
import { TierPage } from './TierPage'
import { UpdatesPage } from './UpdatesPage'

/** 데이터를 미리 채운 상태로 화면을 서버 렌더링해서, 네 화면이 오류 없이 그려지는지 확인한다. */
const root = join(__dirname, '..', '..', '..', '..')
const read = <T,>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T

function render(node: ReactNode, url = '/') {
  const client = new QueryClient()
  client.setQueryData(cookieDbQuery.queryKey, read<CookieDb>('public/data/cookie-db.json'))
  client.setQueryData(petDbQuery.queryKey, read<PetDb>('public/data/pet-db.json'))
  client.setQueryData(growthQuery.queryKey, read<GrowthData>('public/data/growth.json'))
  client.setQueryData(runeCraftQuery.queryKey, read<RuneCraftData>('public/data/rune-craft.json'))
  client.setQueryData(stagesQuery.queryKey, read<StagesData>('public/data/stages.json'))
  return renderToString(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <MemoryRouter initialEntries={[url]}>{node}</MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )
}

describe('티어·편성·개요·일정 화면', () => {
  it('티어 화면의 다섯 가지 순위가 모두 그려진다', () => {
    expect(render(<TierPage />, '/?view=dealer')).toContain('딜러 피해량 순위')
    expect(render(<TierPage />, '/?view=support')).toContain('방어형 내구도 순위')
    expect(render(<TierPage />, '/?view=synergy')).toContain('시너지 공급원 순위')
    expect(render(<TierPage />, '/?view=pet')).toContain('펫 순위')
    const rune = render(<TierPage />, '/?view=rune')
    expect(rune).toContain('슈가룬 옵션 가치')
    expect(rune).toContain('공격력 증폭')
  })

  it('추천 편성 세 가지와 빌드 메이커 링크를 그린다', () => {
    const html = render(<TeamsPage />)
    for (const title of ['스테이지 돌파', '보스전', 'SR 이하 편성']) expect(html).toContain(title)
    expect(html).toContain('/info/builds')
  })

  it('개요에 쿠키·펫 수와 최대 스테이지가 나온다', () => {
    const html = render(<OverviewPage />)
    expect(html).toContain('364-30')
    expect(html).toContain('77종')
  })

  it('업데이트 일정과 쿠폰 코드를 그린다', () => {
    const html = render(<UpdatesPage />)
    expect(html).toContain('COOKIERUNCRUMBLE1ST')
    expect(html).toContain('크리스탈')
  })
})
