import { queryOptions } from '@tanstack/react-query'
import type { CookieDb, CookiesData, DimensionData, StageBossesData, StagesData } from '../types'
import { asset } from '../lib/asset'
import { applyBossOverrides, type BossOverrideFile } from '../lib/bossOverrides'
import { mergeStageBosses } from '../lib/stageBosses'
import bossOverridesJson from '../data/boss-overrides.json'

const bossOverrides: BossOverrideFile = bossOverridesJson

/** 원본이 쓰는 데이터 묶음과 같은 시즌이어야 계산이 맞는다. */
export const DIMENSION_SEASON = 2

async function fetchJson<T>(path: string): Promise<T> {
  // 빌드마다 주소가 바뀌어서 배포 직후 예전 캐시를 읽지 않는다.
  const response = await fetch(`${path}?v=${__BUILD_ID__}`)
  if (!response.ok) throw new Error(`${path} 요청이 실패했습니다 (${response.status})`)
  return (await response.json()) as T
}

// 게임 버전이 바뀌기 전에는 데이터가 변하지 않으므로 다시 받지 않는다.
const STATIC = { staleTime: Infinity, gcTime: Infinity } as const

export const stagesQuery = queryOptions({
  queryKey: ['crumble', 'stages'],
  queryFn: async () => {
    const [raw, stageBosses] = await Promise.all([
      fetchJson<StagesData>(asset('/data/stages.json')),
      fetchJson<StageBossesData>(asset('/data/stage-bosses.json')),
    ])
    // 스테이지별 보스는 게임 클라이언트 기준 데이터로 바꾸고, 그래도 다른 곳은 보정 파일로 덮어쓴다.
    const { data, problems } = applyBossOverrides(mergeStageBosses(raw, stageBosses), bossOverrides)
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

/** 쿠키 도감(게임 클라이언트 수치 + 국내 이름·이미지·추천 슈가룬) */
export const cookieDbQuery = queryOptions({
  queryKey: ['crumble', 'cookie-db'],
  queryFn: () => fetchJson<CookieDb>(asset('/data/cookie-db.json')),
  ...STATIC,
})
