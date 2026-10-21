import { queryOptions } from '@tanstack/react-query'
import { asset } from '../../../lib/asset'
import type { Locale, LocalizedText } from '../../../types'

/** 보상 한 줄: 아이템 키와 수량 */
export interface DimensionReward {
  item: string
  qty: number
}

export interface DimensionBoss {
  key: string
  name: LocalizedText
  /** 한 단계에 나오는 보스 수(케이크 들개떼 20마리, 폭주단 트럭 3대) */
  bodies: number
  adds: { name: LocalizedText; count: number }[]
}

export interface DimensionStageReward {
  stage: number
  /** 첫 클리어 때 한 번 받는 보상 */
  rewards: DimensionReward[]
  /** 이 단계에 머무를 때 1분마다 쌓이는 차원의 힘 */
  idlePerMinute: number
  /** 게임 데이터가 표시해 둔 고정 보상 단계 */
  milestone: boolean
}

export interface DimensionRotation {
  rotation: number
  firstSeason: number
  lastSeason: number
  /** 1단계부터 이 순서대로 보스가 반복된다. */
  cycle: string[]
  stages: DimensionStageReward[]
}

export interface DimensionSeason {
  season: number
  /** ISO 시각(UTC) */
  start: string
  end: string
  rotation: number
}

export interface DimensionRankReward {
  /** 구간의 마지막 순위. null은 참여 보상 */
  rank: number | null
  season: DimensionReward[]
  daily: DimensionReward[]
}

export interface DimensionInfo {
  items: Record<string, LocalizedText>
  bosses: DimensionBoss[]
  rotations: DimensionRotation[]
  seasons: DimensionSeason[]
  rank: DimensionRankReward[]
  energy: {
    stats: string[]
    /** [레벨, 누적 차원의 힘, 능력치별 증가(%)...] */
    levels: number[][]
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  // 빌드마다 주소가 바뀌어서 배포 직후 예전 캐시를 읽지 않는다(queries.ts와 같은 방식).
  const response = await fetch(`${path}?v=${__BUILD_ID__}`)
  if (!response.ok) throw new Error(`${path} 요청이 실패했습니다 (${response.status})`)
  return (await response.json()) as T
}

export const dimensionInfoQuery = queryOptions({
  queryKey: ['dimension-info'],
  queryFn: () => fetchJson<DimensionInfo>(asset('/data/dimension-info.json')),
  // 게임 버전이 바뀌기 전에는 데이터가 변하지 않는다.
  staleTime: Infinity,
  gcTime: Infinity,
})

export const FRAGMENT = 'fragment'

/** 지금 진행 중인 시즌과 다음 시즌. 시즌 사이 정산 시간에는 current가 없다. */
export function seasonStatus(seasons: DimensionSeason[], now: number) {
  const current = seasons.find((s) => Date.parse(s.start) <= now && now < Date.parse(s.end)) ?? null
  const next = seasons.find((s) => Date.parse(s.start) > now) ?? null
  return { current, next }
}

export type SeasonPhase = 'past' | 'current' | 'upcoming'
export const seasonPhase = (season: DimensionSeason, now: number): SeasonPhase =>
  now >= Date.parse(season.end) ? 'past' : now >= Date.parse(season.start) ? 'current' : 'upcoming'

/** 단계 번호의 보스 키(1단계부터 순환 순서대로 반복) */
export function bossAt(rotation: DimensionRotation, stage: number): string {
  const { cycle } = rotation
  return cycle[(stage - 1) % cycle.length] ?? ''
}

/** 순환에서 그 보스가 나오는 단계 번호 */
export function stagesOfBoss(rotation: DimensionRotation, key: string): number[] {
  const first = rotation.cycle.indexOf(key)
  if (first < 0) return []
  const out: number[] = []
  for (let stage = first + 1; stage <= rotation.stages.length; stage += rotation.cycle.length) out.push(stage)
  return out
}

/** 단계마다 그 단계까지 받은 차원의 조각 누적량 */
export function cumulativeFragments(stages: DimensionStageReward[]): number[] {
  let sum = 0
  return stages.map((s) => (sum += s.rewards.reduce((acc, r) => acc + (r.item === FRAGMENT ? r.qty : 0), 0)))
}

/** 순환 전체 첫 클리어 보상을 아이템별로 더한다. 차원의 조각을 먼저, 나머지는 처음 나오는 순서로 둔다. */
export function rewardTotals(stages: DimensionStageReward[]): DimensionReward[] {
  const totals = new Map<string, number>([[FRAGMENT, 0]])
  for (const s of stages) for (const r of s.rewards) totals.set(r.item, (totals.get(r.item) ?? 0) + r.qty)
  return [...totals].filter(([, qty]) => qty > 0).map(([item, qty]) => ({ item, qty }))
}

/** 차원의 조각이 아닌 보상이 걸린 단계(펫·테두리·재료 등) */
export const isSpecialStage = (s: DimensionStageReward) => s.milestone || s.rewards.some((r) => r.item !== FRAGMENT)

/** 순위 구간 이름: 1위, 4~10위, 참여 보상 */
export function rankLabel(rows: DimensionRankReward[], index: number, locale: Locale): string {
  const row = rows[index]
  if (!row) return ''
  if (row.rank === null) return locale === 'ko' ? '참여 보상' : locale === 'ja' ? '参加報酬' : 'Participation'
  const from = index === 0 ? 1 : (rows[index - 1]?.rank ?? 0) + 1
  const unit = (n: number) => (locale === 'ko' ? `${n}위` : locale === 'ja' ? `${n}位` : `#${n}`)
  return from === row.rank ? unit(row.rank) : locale === 'en' ? `#${from}–${row.rank}` : `${from}~${unit(row.rank)}`
}

/** 한국 시간으로 'YYYY.MM.DD HH:mm' */
export function formatKst(iso: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  )
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`
}

/** 남은 시간을 일·시간·분으로 나눈다. */
export function splitDuration(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60000))
  return { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60 }
}
