export type Locale = 'ko' | 'en' | 'ja'

export type LocalizedText = Record<Locale, string>

export interface DataMeta {
  schemaVersion: number
  generatedAt: string
  gameVersion: string
  releaseId: string
  dataVersion: string
  source: string
  sourceCommit: string
  scope: string
  dimensionSeason: number
  maxChapter: number
}

/** [chapter, stage, 필요 전투력(피해 100%), 적 회피, 적 저항, 보스 인덱스] */
export type StageRow = [ch: number, st: number, cp: number, avoidance: number, resist: number, bossIndex: number]

/** [이름, 등장 유형 코드] */
export type BossEntry = [name: LocalizedText, kind: number]

export interface StagesData {
  _meta: DataMeta
  bosses: BossEntry[]
  rows: StageRow[]
}

export interface DimensionEnemy {
  name: string
  amount: number
  names: LocalizedText
}

export interface DimensionStage {
  stage: number
  /** 권장 전투력. 2^53을 넘지 않지만 원본이 문자열로 내려준다. */
  cp: string
  avoidance: number
  resist: number
  critRaw: string
  enemies: DimensionEnemy[]
}

export interface DimensionData {
  _meta: DataMeta
  season: number
  stages: DimensionStage[]
  energy: { level: number; total: number }[]
  rewards: { stages: number[]; perMinute: number }[]
}

export type RuneBadge = 'core' | 'raid'

export interface RuneOption {
  key: string
  label: string
  bold: boolean
  badge: RuneBadge | null
}

export interface CookieRecommendation {
  id: string
  name: LocalizedText
  role: LocalizedText
  element: LocalizedText
  image: string
  pending: boolean
  options: RuneOption[]
}

export interface CookiesData {
  gameVersion: string
  cookies: CookieRecommendation[]
}

export interface StagePos {
  ch: number
  st: number
}
