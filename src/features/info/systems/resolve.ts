import { queryOptions } from '@tanstack/react-query'
import { asset } from '../../../lib/asset'

/**
 * 돌파력 계산. 단계마다 공격력·방어력·체력을 각각 최대 Lv까지 따로 올리고, 세 능력치를 모두 채우면 다음 단계로 넘어간다.
 * 1레벨을 올릴 때마다 그 단계의 상승치만큼 편성 중인 쿠키 모두의 능력치가 고정 수치로 오른다.
 */
export interface ResolveRange {
  from: number
  to: number
  levels: number
  atk: number
  def: number
  hp: number
}

export interface ResolveData {
  _meta: { source: string; sourceFile: string; fetchedAt: string; note: string }
  ranges: ResolveRange[]
  /** cost[i] = (i+1)단계에서 능력치 하나를 1레벨 올리는 코인 */
  cost: number[]
}

export interface StatTotals {
  atk: number
  def: number
  hp: number
}

export interface ResolveStep extends ResolveRange {
  step: number
  /** 이 단계에서 능력치 하나를 1레벨 올리는 코인 */
  unitCost: number
}

export const maxStep = (data: ResolveData) => data.ranges.at(-1)?.to ?? 0

export function stepInfo(data: ResolveData, step: number): ResolveStep | null {
  const range = data.ranges.find((r) => step >= r.from && step <= r.to)
  const unitCost = data.cost[step - 1]
  return range && unitCost !== undefined ? { ...range, step, unitCost } : null
}

/** 단계를 1~최대 단계 사이 정수로 맞춘다. */
export const clampStep = (data: ResolveData, step: number) => Math.min(maxStep(data), Math.max(1, Math.floor(step) || 1))

/** 단계 안의 레벨을 0~그 단계 최대 Lv 사이 정수로 맞춘다. */
export const clampLevel = (data: ResolveData, step: number, level: number) => Math.min(stepInfo(data, step)?.levels ?? 0, Math.max(0, Math.floor(level) || 0))

/**
 * (step, level) 위치까지 오른 능력치 합. step 이전 단계는 모두 채웠고, step 단계에서는 세 능력치가 모두 level이라고 본다.
 */
export function totalsAt(data: ResolveData, step: number, level = 0): StatTotals {
  const out = { atk: 0, def: 0, hp: 0 }
  for (const r of data.ranges) {
    if (r.from >= step) break
    const steps = Math.min(r.to, step - 1) - r.from + 1
    out.atk += steps * r.levels * r.atk
    out.def += steps * r.levels * r.def
    out.hp += steps * r.levels * r.hp
  }
  const current = stepInfo(data, step)
  if (current) {
    const lv = Math.min(level, current.levels)
    out.atk += lv * current.atk
    out.def += lv * current.def
    out.hp += lv * current.hp
  }
  return out
}

/** 능력치 하나를 (step, level) 위치까지 올리는 데 든 코인 합 */
export function coinsTo(data: ResolveData, step: number, level = 0): number {
  let sum = 0
  for (let s = 1; s < step; s++) sum += (data.cost[s - 1] ?? 0) * (stepInfo(data, s)?.levels ?? 0)
  const current = stepInfo(data, step)
  if (current) sum += current.unitCost * Math.min(level, current.levels)
  return sum
}

export interface ResolvePlan {
  /** 능력치 하나에 드는 코인 */
  coinsPerStat: number
  /** 공격력·방어력·체력 셋을 모두 올리는 코인 */
  coinsAll: number
  gain: StatTotals
}

/** A 위치에서 B 위치까지 세 능력치를 함께 올릴 때의 비용과 상승량. B가 A보다 앞이면 0이다. */
export function planResolve(data: ResolveData, from: { step: number; level: number }, to: { step: number; level: number }): ResolvePlan {
  const coinsPerStat = Math.max(0, coinsTo(data, to.step, to.level) - coinsTo(data, from.step, from.level))
  const a = totalsAt(data, from.step, from.level)
  const b = totalsAt(data, to.step, to.level)
  return {
    coinsPerStat,
    coinsAll: coinsPerStat * 3,
    gain: { atk: Math.max(0, b.atk - a.atk), def: Math.max(0, b.def - a.def), hp: Math.max(0, b.hp - a.hp) },
  }
}

async function fetchResolve(): Promise<ResolveData> {
  const path = asset('/data/resolve.json')
  // 빌드마다 주소가 바뀌어서 배포 직후 예전 캐시를 읽지 않는다.
  const response = await fetch(`${path}?v=${__BUILD_ID__}`)
  if (!response.ok) throw new Error(`${path} 요청이 실패했습니다 (${response.status})`)
  return (await response.json()) as ResolveData
}

export const resolveQuery = queryOptions({
  queryKey: ['crumble', 'resolve'],
  queryFn: fetchResolve,
  // 게임 버전이 바뀌기 전에는 데이터가 변하지 않으므로 다시 받지 않는다.
  staleTime: Infinity,
  gcTime: Infinity,
})
