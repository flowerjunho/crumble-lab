import type { CookieRole } from '../../../types'
import raw from './systems-data.json'

/**
 * 용병단·스텔라 링크·패키지 가치 화면이 같이 쓰는 데이터(scripts/import-eog-systems.mjs가 만든다).
 * 화면 셋이 모두 작은 정적 표라서 따로 받지 않고 번들에 넣는다.
 */

/** how: pct(능력치의 %), rate(%p 더하기), flat(수치 더하기), screen(받는 피해를 걸러 냄) */
export interface SystemEffect {
  stat: 'atk' | 'def' | 'hp' | 'elementDamage' | 'haste' | 'damageReduction' | 'moveSpeed'
  how: 'pct' | 'rate' | 'flat' | 'screen'
  value: number
}

export type PerkCondition = { type: 'none' } | { type: 'elementMaxCount' } | { type: 'roleCount'; role: CookieRole; min: number }

export interface PerkTarget {
  /** all: 대상 전체, powerTop: 전투력 상위, statTop/statBottom: stat 기준 상위·하위 */
  select: 'all' | 'powerTop' | 'statTop' | 'statBottom'
  stat: 'atk' | 'hp' | null
  count: number | null
  /** 비어 있으면 직업 제한이 없다. */
  roles: CookieRole[]
}

export interface BandPerk {
  id: number
  /** 영문 클라이언트의 특전 이름(국내 이름은 확인하지 못했다) */
  nameEn: string
  unlockedAt: number
  condition: PerkCondition
  target: PerkTarget
  effects: SystemEffect[]
}

export interface BandLevel {
  level: number
  nameEn: string
  perkSlots: number
  petSlots: number
  leader: SystemEffect[]
}

export type CurrencyKey =
  | 'diamonds'
  | 'pickupCookie'
  | 'cookie'
  | 'pickupPet'
  | 'pet'
  | 'flames'
  | 'ssrCookie'
  | 'ssrPet'
  | 'srCookie'
  | 'tssrCookie'
  | 'luckyDough'
  | 'runeCrystal'
  | 'stellarPoint'

export type PackageCategory = 'standing' | 'hotDeal' | 'pass' | 'weekly' | 'blessing' | 'membership' | 'update'

export interface ShopPackage {
  id: string
  nameEn: string
  /** 국내 상점 이름. null이면 확인하지 못한 것이다. */
  nameKo: string | null
  category: PackageCategory
  priceKRW: number
  contents: Partial<Record<CurrencyKey, number>>
  /** 국내 상점 목록으로 구성품을 고쳤는지 */
  corrected: boolean
  /** 멤버십·패스처럼 기간에 걸쳐 나눠 받는지 */
  recurring: boolean
  limit?: number | null
  /** 크리스탈로 환산하지 않는 구성품(국내 이름) */
  others?: { name: string; qty: number }[]
}

/** 재화를 크리스탈로 바꾸는 기본 가정값. 게임이 공개한 값이 아니다. */
export interface ValueAssumptions {
  /** 쿠키 뽑기 1회의 크리스탈 */
  cookieDraw: number
  /** 펫 뽑기 1회의 크리스탈 */
  petDraw: number
  flame: number
  luckyDough: number
  runeCrystal: number
  stellarPoint: number
  /** SSR 쿠키 1장 = 쿠키 뽑기 몇 회 */
  ssrCookieDraws: number
  /** SSR 펫 1마리 = 펫 뽑기 몇 회 */
  ssrPetDraws: number
  /** TSSR 쿠키 1장 = 용기의 불꽃 몇 개 */
  tssrCookieFlames: number
}

export interface SystemsData {
  _meta: { source: string; sourceFile: string; fetchedAt: string; note: string }
  band: { levels: BandLevel[]; perks: BandPerk[] }
  stellar: { slots: number; maxLocks: number; resetCost: number[] }
  packages: { currencies: CurrencyKey[]; assumptions: ValueAssumptions; list: ShopPackage[] }
}

export const systemsData = raw as SystemsData
