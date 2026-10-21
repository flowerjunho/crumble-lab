/**
 * 쿠키 성장(레벨업·승급) 계산.
 *
 * 다른 화면(피해 계산기, 전투 시뮬레이터, 티어표)에서도 가져다 쓰도록 순수 함수로만 만든다.
 * 데이터는 public/data/growth.json(scripts/import-eog-growth.mjs)을 그대로 받는다.
 *
 * ## 능력치 식
 * 공격력·방어력·체력은 두 단계로 정해진다.
 *   1. 승급: 별 등급 능력치 = round(기본 능력치 × (1 + 별 증가율))
 *   2. 레벨: 최종 능력치   = round(별 등급 능력치 × (1 + 레벨 증가율))
 * 레벨 증가율은 세 능력치가 같고, 별 증가율은 등급(TSSR~C)마다 다르다(방어력만 등급과 상관없이 별마다 2%).
 * 치명확률·치명피해·명중·회피·집중·저항은 레벨과 상관없이 별마다 같은 양이 더해진다.
 *
 * 두 증가율을 곱하는지(compound) 더하는지(pooled)는 공개된 게임 수치만으로는 확정되지 않는다.
 * 국내 데이터 위키(cc.team-hobby.com 쿠키 상세)는 곱하는 식을 쓰고, 별 등급 능력치를 반올림한 정수로 싣는다
 * (예: 샤르도네맛 쿠키 ★1 공격력 133 × 1.09 = 144.97 → 145). 그래서 기본값은 곱하는 식이고,
 * 더하는 식이 필요한 화면을 위해 fold 옵션을 남겨 둔다.
 */

export const GROWTH_RARITIES = ['TSSR', 'SSR', 'SR', 'R', 'U', 'C'] as const
export type GrowthRarity = (typeof GROWTH_RARITIES)[number]

/** [레벨, 이 레벨로 올리는 데 드는 쿠키 경험치, 필요 크럼블 레벨, 공격력·방어력·체력 증가율(만분율)] */
export type GrowthLevelRow = [level: number, exp: number, crumbleLevel: number, boostBp: number]

/** 별 하나 등급의 누적 효과. atk·def·hp는 증가율(1 = 100%), critRate·critDamage는 더하는 비율(1 = 100%), 나머지는 더하는 수치 */
export interface GrowthGradeRow {
  atk: number
  def: number
  hp: number
  critRate: number
  critDamage: number
  accuracy: number
  avoidance: number
  focus: number
  resist: number
}

/** 레벨·별과 상관없는 쿠키 공통 기본값(치명 수치는 1 = 100%) */
export interface GrowthBase {
  critRate: number
  critDamage: number
  accuracy: number
  avoidance: number
  focus: number
  resist: number
}

/** public/data/growth.json */
export interface GrowthData {
  _meta: { source: string; sourceFile: string; fetchedAt: string; gameBuild: string; note: string }
  maxLevel: number
  maxGrade: number
  base: GrowthBase
  /** levels[레벨 - 1] */
  levels: GrowthLevelRow[]
  /** grades[등급][별 - 1]. 0성은 행이 없고 모든 효과가 0이다. */
  grades: Record<GrowthRarity, GrowthGradeRow[]>
}

/** compound: 별 등급 능력치에 레벨 배율을 곱한다(기본). pooled: 두 증가율을 더해 기본 능력치에 한 번 곱한다. */
export type StatFold = 'compound' | 'pooled'

/** 계산에 필요한 쿠키 정보. cookie-db.json의 CookieEntry를 그대로 넘겨도 된다. */
export interface GrowthCookie {
  rarity: string
  stats: { atk: number; def: number; hp: number }
}

export interface CookieStats {
  level: number
  grade: number
  atk: number
  def: number
  hp: number
  /** 1 = 100% */
  critRate: number
  /** 1 = 100% */
  critDamage: number
  accuracy: number
  avoidance: number
  focus: number
  resist: number
}

const ZERO_GRADE: GrowthGradeRow = { atk: 0, def: 0, hp: 0, critRate: 0, critDamage: 0, accuracy: 0, avoidance: 0, focus: 0, resist: 0 }

const clampInt = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : min)))

/** 소수점 아래 오차(0.1 + 0.05 = 0.15000000000000002)를 지운다. */
const tidy = (value: number) => Number(value.toFixed(6))

export const isGrowthRarity = (rarity: string): rarity is GrowthRarity => (GROWTH_RARITIES as readonly string[]).includes(rarity)

/** 레벨을 1~최대 레벨 정수로 맞춘다. */
export const clampLevel = (data: GrowthData, level: number) => clampInt(level, 1, data.maxLevel)

/** 별을 0~최대 별 정수로 맞춘다. */
export const clampGrade = (data: GrowthData, grade: number) => clampInt(grade, 0, data.maxGrade)

/** 레벨 표의 한 행. 범위를 벗어나면 가장 가까운 레벨로 맞춘다. */
export function levelRow(data: GrowthData, level: number): GrowthLevelRow {
  return data.levels[clampLevel(data, level) - 1] ?? [1, 0, 1, 0]
}

/** 레벨 증가율(1 = 100%). 1레벨은 0이다. */
export const levelBoost = (data: GrowthData, level: number): number => levelRow(data, level)[3] / 1e4

/** 별 등급의 누적 효과. 0성이거나 모르는 등급이면 모두 0이다. */
export function gradeBonus(data: GrowthData, rarity: string, grade: number): GrowthGradeRow {
  const g = clampGrade(data, grade)
  if (!g || !isGrowthRarity(rarity)) return ZERO_GRADE
  return data.grades[rarity][g - 1] ?? ZERO_GRADE
}

/** 승급만 반영한 공격력·방어력·체력(레벨 1 기준). 국내 데이터 위키 승급 표와 같은 값이다. */
export function gradeStats(data: GrowthData, cookie: GrowthCookie, grade: number): { atk: number; def: number; hp: number } {
  const bonus = gradeBonus(data, cookie.rarity, grade)
  return {
    atk: Math.round(cookie.stats.atk * (1 + bonus.atk)),
    def: Math.round(cookie.stats.def * (1 + bonus.def)),
    hp: Math.round(cookie.stats.hp * (1 + bonus.hp)),
  }
}

/**
 * 레벨·별 등급에서 쿠키의 능력치를 구한다(장비·펫·슈가룬 등 다른 성장 요소는 넣지 않는다).
 * level은 1~최대 레벨, grade는 0~10으로 맞춰서 계산한다.
 */
export function cookieStats(data: GrowthData, cookie: GrowthCookie, level: number, grade: number, fold: StatFold = 'compound'): CookieStats {
  const lv = clampLevel(data, level)
  const g = clampGrade(data, grade)
  const boost = levelBoost(data, lv)
  const bonus = gradeBonus(data, cookie.rarity, g)
  let main: { atk: number; def: number; hp: number }
  if (fold === 'compound') {
    const graded = gradeStats(data, cookie, g)
    main = { atk: Math.round(graded.atk * (1 + boost)), def: Math.round(graded.def * (1 + boost)), hp: Math.round(graded.hp * (1 + boost)) }
  } else {
    main = {
      atk: Math.round(cookie.stats.atk * (1 + boost + bonus.atk)),
      def: Math.round(cookie.stats.def * (1 + boost + bonus.def)),
      hp: Math.round(cookie.stats.hp * (1 + boost + bonus.hp)),
    }
  }
  const { base } = data
  return {
    level: lv,
    grade: g,
    ...main,
    critRate: tidy(base.critRate + bonus.critRate),
    critDamage: tidy(base.critDamage + bonus.critDamage),
    accuracy: base.accuracy + bonus.accuracy,
    avoidance: base.avoidance + bonus.avoidance,
    focus: base.focus + bonus.focus,
    resist: base.resist + bonus.resist,
  }
}

/** 1레벨에서 각 레벨까지 쌓인 쿠키 경험치. cumulativeExp(data)[레벨 - 1] */
export function cumulativeExp(data: GrowthData): number[] {
  let sum = 0
  return data.levels.map((row) => (sum += row[1]))
}

export interface LevelCost {
  from: number
  to: number
  /** from에서 to까지 드는 쿠키 경험치 */
  exp: number
  /** to 레벨을 올리는 데 필요한 크럼블 레벨 */
  crumbleLevel: number
  /** from 대비 공격력·방어력·체력이 늘어나는 비율(레벨 배율끼리 나눈 값, 1 = 100%) */
  statGain: number
}

/** from 레벨에서 to 레벨까지 올리는 비용. to가 from보다 낮으면 from으로 맞춘다. */
export function levelCost(data: GrowthData, from: number, to: number): LevelCost {
  const a = clampLevel(data, from)
  const b = Math.max(a, clampLevel(data, to))
  let exp = 0
  for (let lv = a + 1; lv <= b; lv++) exp += levelRow(data, lv)[1]
  return {
    from: a,
    to: b,
    exp,
    crumbleLevel: levelRow(data, b)[2],
    statGain: (1 + levelBoost(data, b)) / (1 + levelBoost(data, a)) - 1,
  }
}
