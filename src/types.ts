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

/** public/data/stage-bosses.json: 스테이지별 보스(게임 클라이언트 기준, EOG.GG 제공) */
export interface StageBossesData {
  _meta: { source: string; sourceFile: string; fetchedAt: string; note: string }
  bosses: LocalizedText[]
  /** rows[(챕터-1)*30 + (스테이지-1)] = [bosses 인덱스, 마리 수] */
  rows: [bossIndex: number, count: number][]
}

/** public/data/cookie-db.json: 쿠키 도감 */
export type CookieRole = 'charge' | 'tank' | 'support' | 'ranged'
export type CookieElement = 'water' | 'fire' | 'grass' | 'light' | 'dark'
export type SynergyKey = 'area' | 'dur' | 'burst' | 'speed' | 'hit' | 'pierce' | 'chain'

export interface CookieEffect {
  kind: string
  property: string | null
  calcType: string | null
  valueBase: string | null
  value: number | null
  unit: 'fraction' | 'steps' | 'none'
  duration: number | null
  lifetime: 'timed' | 'permanent'
  maxStack: number
  applyRate: number
  target: 'self' | 'ally' | 'allies' | 'enemy' | 'enemies'
  maxTargets: number | null
  excludeCaster: boolean
  tickSeconds: number | null
  scalesWithSkillAmp: boolean
  durationScalesWithDurationSynergy: boolean
  onlyIn: string[] | null
  category: 'Buff' | 'Debuff' | 'ActionControl'
}

export interface CookieSkillHit {
  perHit: number
  hits: number
  instances: [number, number]
  applications: [number, number]
  coef: [number, number]
  radius: number | null
  unlimitedTargets: boolean
}

export interface CookieSkillPart {
  cooldown: number
  effectiveCooldown: number
  gate: { kind: 'state' | 'charge'; operator: string; value: number } | null
  coefPerCycle: [number, number]
  support: boolean
  hits: CookieSkillHit[]
}

export interface CookieEntry {
  eid: string
  slug: string
  id: string
  name: LocalizedText
  image: string
  rarity: string
  role: CookieRole
  element: CookieElement
  stats: { power: number | null; atk: number; def: number; hp: number }
  combat: {
    range: number
    moveSpeed: number
    hitRadius: number
    targeting: string
    startCooldownReduction: number
    knockbackResistance: number
    airborneResistance: number
  }
  synergy: { gives: SynergyKey[]; receives: SynergyKey[] }
  skill: {
    nameKo: string | null
    nameEn: string | null
    cycleSeconds: number
    coefPerCycle: [number, number]
    atkPerSecond: [number, number]
    parts: CookieSkillPart[]
  }
  effects: CookieEffect[]
  runes: RuneOption[]
}

export interface CookieDb {
  _meta: { source: string; sourceFile: string; fetchedAt: string; note: string }
  cookies: CookieEntry[]
}
