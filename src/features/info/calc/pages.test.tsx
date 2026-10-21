import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { cookieDbQuery, petDbQuery } from '../../../api/queries'
import { I18nProvider } from '../../../i18n'
import type { CookieDb, PetDb } from '../../../types'
import type { GrowthData } from '../growth/growth'
import { growthQuery } from '../growth/growthData'
import { BuildMakerPage } from './BuildMakerPage'
import { DamageCalcPage } from './DamageCalcPage'
import { StatComparePage } from './StatComparePage'

/** 데이터를 미리 채운 상태로 화면을 서버 렌더링해서, 세 화면이 오류 없이 그려지는지 확인한다. */
const root = join(__dirname, '..', '..', '..', '..')
const read = <T,>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T

function render(node: ReactNode, url = '/') {
  const client = new QueryClient()
  client.setQueryData(cookieDbQuery.queryKey, read<CookieDb>('public/data/cookie-db.json'))
  client.setQueryData(petDbQuery.queryKey, read<PetDb>('public/data/pet-db.json'))
  client.setQueryData(growthQuery.queryKey, read<GrowthData>('public/data/growth.json'))
  return renderToString(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <MemoryRouter initialEntries={[url]}>{node}</MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )
}

describe('계산기 화면', () => {
  it('피해 계산기가 결과와 내역 표를 그린다', () => {
    const html = render(<DamageCalcPage />)
    expect(html).toContain('피해 계산기')
    expect(html).toContain('피해 항목별 내역')
    expect(html).toContain('DPS')
  })

  it('능력치 비교가 기본으로 쿠키 두 명을 비교한다', () => {
    const html = render(<StatComparePage />)
    expect(html).toContain('능력치 비교')
    expect(html.match(/class="calc-bar"/g)?.length).toBeGreaterThanOrEqual(2 * 10)
  })

  it('빌드 메이커가 주소의 빌드를 읽어 시너지와 팀 DPS를 그린다', () => {
    // 샤르도네맛 쿠키(cookie4011) + 닌자맛 쿠키(cookie0007)
    const html = render(<BuildMakerPage />, `/?c=${(4011).toString(36)}.7`)
    expect(html).toContain('빌드 메이커')
    expect(html).toContain('샤르도네맛 쿠키')
    expect(html).toContain('닌자맛 쿠키')
    expect(html).toContain('다발 +2')
    expect(html).toContain('팀 DPS')
  })
})
