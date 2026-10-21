import { queryOptions } from '@tanstack/react-query'
import { asset } from '../../../lib/asset'
import type { GrowthData } from './growth'

/** 쿠키 성장 데이터(레벨 표·승급 표). 게임 버전이 바뀌기 전에는 변하지 않는다. */
export const growthQuery = queryOptions({
  queryKey: ['crumble', 'growth'],
  queryFn: async () => {
    const path = asset('/data/growth.json')
    // 빌드마다 주소가 바뀌어서 배포 직후 예전 캐시를 읽지 않는다.
    const response = await fetch(`${path}?v=${__BUILD_ID__}`)
    if (!response.ok) throw new Error(`${path} 요청이 실패했습니다 (${response.status})`)
    const data = (await response.json()) as GrowthData
    if (data.levels.length !== data.maxLevel) throw new Error('쿠키 성장 데이터의 레벨 표가 최대 레벨과 맞지 않습니다.')
    return data
  },
  staleTime: Infinity,
  gcTime: Infinity,
})
