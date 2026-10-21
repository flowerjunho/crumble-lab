import { queryOptions } from '@tanstack/react-query'
import { asset } from '../../../lib/asset'
import type { CookieElement, Locale, LocalizedText } from '../../../types'

/**
 * 스테이지 정보 화면이 쓰는 데이터와 계산.
 * - public/data/eog-stages.json: scripts/import-eog-stages.mjs가 만든 1-1 ~ 364-30 스테이지 표
 * - public/data/stage-extras.json: scripts/import-eog-stage-extras.mjs가 만든 속성 상성 표
 */

export const PER_CHAPTER = 30

/** eog-stages.json rows 한 줄. 열 순서는 파일의 _meta.columns와 같다. */
export type EogStageRow = [
  chapter: number,
  stage: number,
  recommendedPower: number,
  accuracyNeeded: number,
  focusNeeded: number,
  enemyAccuracy: number,
  bossIndex: number,
  spawns: number,
  bossHp: number,
  bossAtk: number,
  bossDef: number | null,
  killsToBoss: number | null,
  timeLimitSec: number | null,
]

export interface OfflineItem {
  name: string
  everySec: number
}

export interface EogStagesData {
  _meta: { chapters: number; perChapter: number; stages: number; fetchedAt: string }
  bosses: LocalizedText[]
  rows: EogStageRow[]
  /** ranges[i] = [시작 순번, 끝 순번, ...items 순서대로 everySec마다 받는 양] */
  offline: { items: OfflineItem[]; ranges: number[][] }
}

export interface ElementAdvantageRow {
  element: CookieElement
  strongAgainst: CookieElement
  weakAgainst: CookieElement
}

export interface StageExtrasData {
  elementAdvantage: { bonusPercent: number; rows: ElementAdvantageRow[] }
}

async function fetchJson<T>(path: string): Promise<T> {
  // 공용 fetchJson과 같이 빌드마다 주소를 바꿔서 배포 직후 예전 캐시를 읽지 않는다.
  const response = await fetch(`${path}?v=${__BUILD_ID__}`)
  if (!response.ok) throw new Error(`${path} 요청이 실패했습니다 (${response.status})`)
  return (await response.json()) as T
}

// 게임 버전이 바뀌기 전에는 데이터가 변하지 않으므로 다시 받지 않는다.
const STATIC = { staleTime: Infinity, gcTime: Infinity } as const

export const eogStagesQuery = queryOptions({
  queryKey: ['crumble', 'eog-stages'],
  queryFn: async () => {
    const data = await fetchJson<EogStagesData>(asset('/data/eog-stages.json'))
    // 순번으로 바로 찾아 쓰므로 1-1부터 빠짐없이 순서대로 있어야 한다.
    if (data.rows.length !== data._meta.stages || data.rows.some((row, i) => stageOrder(row[0], row[1]) !== i + 1)) {
      throw new Error('스테이지 표의 순서가 맞지 않습니다.')
    }
    return data
  },
  ...STATIC,
})

export const stageExtrasQuery = queryOptions({
  queryKey: ['crumble', 'stage-extras'],
  queryFn: () => fetchJson<StageExtrasData>(asset('/data/stage-extras.json')),
  ...STATIC,
})

/** 1-1이 1번인 스테이지 순번 */
export const stageOrder = (chapter: number, stage: number) => (chapter - 1) * PER_CHAPTER + stage

export function chapterRows(data: EogStagesData, chapter: number): EogStageRow[] {
  const from = (chapter - 1) * PER_CHAPTER
  return data.rows.slice(from, from + PER_CHAPTER)
}

export interface ChapterPoint {
  chapter: number
  /** 챕터 첫 스테이지의 권장 전투력 */
  first: number
  /** 챕터에서 가장 높은 권장 전투력(대개 30번째 스테이지) */
  max: number
}

/** 그래프에 쓰는 챕터별 권장 전투력 */
export function chapterSeries(data: EogStagesData): ChapterPoint[] {
  const points: ChapterPoint[] = []
  for (let ch = 1; ch <= data._meta.chapters; ch++) {
    const rows = chapterRows(data, ch)
    const first = rows[0]
    if (!first) break
    points.push({ chapter: ch, first: first[2], max: Math.max(...rows.map((r) => r[2])) })
  }
  return points
}

export interface OfflineBand {
  /** 이 보상이 나오는 챕터 안 스테이지 범위 */
  fromStage: number
  toStage: number
  /** items 순서대로 1시간에 받는 양 */
  perHour: number[]
}

/**
 * 챕터 안에서 자동 사냥 보상이 같은 구간끼리 묶는다.
 * 게임은 everySec마다 정해진 양을 주므로 1시간 분량은 양 × 3600 / everySec이다.
 */
export function chapterOffline(data: EogStagesData, chapter: number): OfflineBand[] {
  const { items, ranges } = data.offline
  const bands: OfflineBand[] = []
  const first = stageOrder(chapter, 1)
  const last = stageOrder(chapter, PER_CHAPTER)
  for (const range of ranges) {
    const [start, end, ...amounts] = range
    if (start === undefined || end === undefined || end < first || start > last) continue
    bands.push({
      fromStage: Math.max(start, first) - first + 1,
      toStage: Math.min(end, last) - first + 1,
      perHour: items.map((item, i) => ((amounts[i] ?? 0) * 3600) / item.everySec),
    })
  }
  return bands
}

/** 자동 사냥 보상 아이템 이름. 국내 표기는 삥스크럼블 아이템 도감(cc.team-hobby.com/?p=items)과 대조했다. */
const OFFLINE_ITEM: Record<string, LocalizedText> = {
  'Mileage Points': { ko: '마일리지 포인트', en: 'Mileage Points', ja: 'マイレージポイント' },
  Coins: { ko: '코인', en: 'Coins', ja: 'コイン' },
  'Crumble EXP': { ko: '크럼블 경험치', en: 'Crumble EXP', ja: 'クランブル経験値' },
  'Cookie EXP': { ko: '쿠키 경험치', en: 'Cookie EXP', ja: 'クッキー経験値' },
  'Lucky Dough': { ko: '행운반죽', en: 'Lucky Dough', ja: 'ラッキー生地' },
  'Arena Ticket': { ko: '아레나 입장권', en: 'Arena Ticket', ja: 'アリーナ入場券' },
  'Basic Innovite': { ko: '기본 연구석', en: 'Basic Innovite', ja: '基本研究石' },
  'Rune Crystals': { ko: '룬결정', en: 'Rune Crystals', ja: 'ルーン結晶' },
  Chocosteel: { ko: '초코강', en: 'Chocosteel', ja: 'チョコ鋼' },
  'Premium Cookie Cutter': { ko: '고급 쿠키커터', en: 'Premium Cookie Cutter', ja: '高級クッキーカッター' },
  'Premium Pet Ticket': { ko: '고급 펫 뽑기권', en: 'Premium Pet Ticket', ja: '高級ペットガチャチケット' },
  'Robust Treasure Chest': { ko: '단단한 보물상자', en: 'Robust Treasure Chest', ja: '頑丈な宝箱' },
  'Fancy Treasure Chest': { ko: '고급 보물상자', en: 'Fancy Treasure Chest', ja: '高級宝箱' },
  'Amazing Treasure Chest': { ko: '엄청난 보물상자', en: 'Amazing Treasure Chest', ja: 'すごい宝箱' },
}

export const offlineItemName = (name: string, locale: Locale): string => OFFLINE_ITEM[name]?.[locale] ?? name

/** 앞자리 몇 개만 남긴 짧은 수(1.6천, 242억, 24.2B). 표와 그래프에 함께 쓴다. */
export const formatCompact = (value: number, locale: Locale, digits = 3): string =>
  new Intl.NumberFormat(locale, { notation: 'compact', maximumSignificantDigits: digits }).format(value)

export const formatFull = (value: number, locale: Locale): string => value.toLocaleString(locale, { maximumFractionDigits: 1 })

/** 1시간 보상처럼 소수가 생길 수 있는 양 */
export const formatAmount = (value: number, locale: Locale): string =>
  value >= 10000 ? formatCompact(value, locale, 4) : value.toLocaleString(locale, { maximumFractionDigits: 2 })
