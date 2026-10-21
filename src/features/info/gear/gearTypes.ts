/** public/data/gear.json (scripts/import-eog-gear.mjs) */

export type GearRarity = 'common' | 'advanced' | 'excellent' | 'magic' | 'epic' | 'special' | 'superEpic' | 'unique' | 'legendary' | 'eternal'
export type GearSlot = 'sword' | 'bow' | 'staff' | 'helmet' | 'armor' | 'shield' | 'necklace' | 'ring' | 'brooch' | 'artifact' | 'book' | 'food'
export type GearGroup = 'weapon' | 'armor' | 'accessoryAtk' | 'accessoryDef'
export type GearStat =
  | 'atk'
  | 'accuracy'
  | 'critRate'
  | 'critDamage'
  | 'skillAmp'
  | 'def'
  | 'hp'
  | 'avoidance'
  | 'critResist'
  | 'damageReduction'
  | 'focus'
  | 'resist'
  | 'haste'
  | 'moveSpeed'
export type RuneStat =
  | 'atkAmp'
  | 'defAmp'
  | 'hpAmp'
  | 'critRate'
  | 'critResist'
  | 'critDamage'
  | 'accuracyRate'
  | 'avoidanceRate'
  | 'focusRate'
  | 'resistRate'
  | 'skillAmp'
  | 'damageReduction'
  | 'moveSpeed'

export interface GearRarityInfo {
  key: GearRarity
  /** 공격력·방어력·체력에 곱하는 등급 배율(%) */
  primaryScale: number
  /** 그 외 스탯에 곱하는 등급 배율(%) */
  otherScale: number
  /** 보조 옵션 개수 */
  subCount: number
}

export interface GearSlotInfo {
  key: GearSlot
  group: GearGroup
  /** 슬롯마다 고정된 메인 옵션 */
  main: GearStat
  /** 이 슬롯이 오븐에서 나오기 시작하는 오븐 레벨 */
  unlockAt: number
}

export interface OvenLevel {
  level: number
  /** 이 오븐 레벨에서 나오는 장비 레벨 [최소, 최대] */
  itemLevel: [number, number]
  /** 한 번에 여는 개수(자동 열기) */
  autoOpen: number
  /** rarities 순서대로 등장 확률(%) */
  odds: number[]
}

export interface PlateBoost {
  grade: number
  /** 메인 옵션 증폭(0.69 = +69%) */
  main: number
  /** 보조 옵션 증폭 */
  sub: number
}

/** +from → +from+1 시도 1회. 확률은 1 = 100%. */
export interface PlateStep {
  from: number
  great: number
  success: number
  keep: number
  down: number
  crush: number
  /** 초코강 */
  material: number
  /** 하락 방지에 드는 시럽쇳물(쓸 수 없으면 null) */
  guard: number | null
  /** 박살 완화에 드는 시럽쇳물 */
  ease: number | null
  /** 박살난 플레이트를 되살리는 시럽쇳물 */
  restore: number | null
  /** 대성공 때 돌려받는 초코강 비율 */
  refund: number
}

export interface RuneTier {
  rarity: 'SSR' | 'SR' | 'R' | 'U' | 'C'
  tier: number
  /** 효과 하나가 이 등급·티어로 나올 확률(%) */
  chance: number
  /** 효과 수치. 이동속도 증가만 고정 수치, 나머지는 % */
  values: Record<RuneStat, number>
  /** 스킬가속 증가(고정 수치)는 확률이 따로 있고 일부 티어에만 있다. */
  haste: { chance: number; value: number } | null
}

export interface GearData {
  rarities: GearRarityInfo[]
  slots: GearSlotInfo[]
  subPools: Record<GearGroup, GearStat[]>
  /** from 등급부터 이터널까지 [최소, 최대] */
  subRange: { from: GearRarity; stats: Record<GearStat, [number, number][]> }
  oven: OvenLevel[]
  plate: { boost: PlateBoost[]; steps: PlateStep[] }
  /** craftCost[n] = 슬롯 n개를 잠그고 세공 1회 하는 데 드는 룬결정 */
  rune: { tiers: RuneTier[]; craftCost: number[] }
}
