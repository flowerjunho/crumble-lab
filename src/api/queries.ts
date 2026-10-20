import { queryOptions } from '@tanstack/react-query'
import type { CookiesData, DimensionData, StagesData } from '../types'
import { asset } from '../lib/asset'
import { applyBossOverrides, type BossOverrideFile } from '../lib/bossOverrides'
import bossOverridesJson from '../data/boss-overrides.json'

const bossOverrides: BossOverrideFile = bossOverridesJson

/** 원본이 쓰는 데이터 묶음과 같은 시즌이어야 계산이 맞는다. */
export const DIMENSION_SEASON = 2

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`${path} 요청이 실패했습니다 (${response.status})`)
  return (await response.json()) as T
}

// 게임 버전이 바뀌기 전에는 데이터가 변하지 않으므로 다시 받지 않는다.
const STATIC = { staleTime: Infinity, gcTime: Infinity } as const

export const stagesQuery = queryOptions({
  queryKey: ['crumble', 'stages'],
  queryFn: async () => {
    const raw = await fetchJson<StagesData>(asset('/data/stages.json'))
    // 인게임과 다른 보스는 src/data/boss-overrides.json으로 덮어쓴다.
    const { data, problems } = applyBossOverrides(raw, bossOverrides)
    if (problems.length > 0 && import.meta.env.DEV) console.warn('보스 보정 파일에 적용하지 못한 항목이 있습니다.', problems)
    return data
  },
  ...STATIC,
})

export const dimensionQuery = queryOptions({
  queryKey: ['crumble', 'dimension', DIMENSION_SEASON],
  queryFn: async () => {
    const data = await fetchJson<DimensionData>(asset('/data/dimension.json'))
    // 원본과 같은 무결성 검사: 시즌이 맞고 1~100단계가 빠짐없이 순서대로 있어야 한다.
    if (
      data.season !== DIMENSION_SEASON ||
      data.stages.length !== 100 ||
      data.stages.some((stage, index) => stage.stage !== index + 1)
    ) {
      throw new Error('차원의 이면 데이터의 시즌 또는 단계 구성이 맞지 않습니다.')
    }
    return data
  },
  ...STATIC,
})

export const cookiesQuery = queryOptions({
  queryKey: ['crumble', 'cookies'],
  queryFn: () => fetchJson<CookiesData>(asset('/data/cookies.json')),
  ...STATIC,
})
