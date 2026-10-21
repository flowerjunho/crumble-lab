import { queryOptions } from '@tanstack/react-query'
import { asset } from '../../../lib/asset'
import type { GearData } from './gearTypes'

export const gearQuery = queryOptions({
  queryKey: ['crumble', 'gear'],
  queryFn: async () => {
    // 빌드마다 주소가 바뀌어서 배포 직후 예전 캐시를 읽지 않는다(src/api/queries.ts와 같은 방식).
    const path = asset('/data/gear.json')
    const response = await fetch(`${path}?v=${__BUILD_ID__}`)
    if (!response.ok) throw new Error(`${path} 요청이 실패했습니다 (${response.status})`)
    return (await response.json()) as GearData
  },
  // 게임 버전이 바뀌기 전에는 데이터가 변하지 않으므로 다시 받지 않는다.
  staleTime: Infinity,
  gcTime: Infinity,
})
