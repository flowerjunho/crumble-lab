import type { LocalizedText } from '../../../types'
import gachaJson from '../../../data/gacha.json'

export type GachaKind = 'cookie' | 'pet'

export interface GachaRow {
  rank: string
  /** 뽑기 레벨 1~10의 확률(%) */
  values: number[]
}

export interface GachaBanner {
  id: string
  kind: GachaKind
  name: LocalizedText
  /** 1회에 뽑기권 1장을 쓴다. 없으면 재화로만 뽑는다. */
  ticket: LocalizedText | null
  currency: LocalizedText
  /** 뽑기권이 없을 때 1회에 드는 재화 */
  cost: number
  rows: GachaRow[]
  featured: {
    /** 픽업 대상 한 명의 레벨별 확률(%) */
    rates: number[]
    /** 대상이 정해진 뽑기(쿠키 차원 뽑기)의 대상 */
    fixed: string | null
    /** 사용자가 대상을 고를 수 있는 등급 */
    from: string[]
    default: string | null
  } | null
  /** 커뮤니티에서 말하는 픽업 확정 횟수. 공식 공지에 없는 수치다. */
  reportedPity: number | null
}

export interface GachaData {
  _meta: { source: string; sourceFile: string; fetchedAt: string; note: string }
  /** 뽑기 레벨 1~10에 필요한 누적 뽑기 횟수 */
  levelDraws: Record<GachaKind, number[]>
  /** 뽑기에서 나오지 않는 쿠키·펫(slug) */
  excluded: Record<GachaKind, string[]>
  banners: GachaBanner[]
}

export const gachaData = gachaJson as GachaData

export const GACHA_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
/** 픽업 줄을 확률표에서 가리키는 등급 이름 */
export const FEATURED_RANK = 'PICKUP'

/** 시뮬레이터가 쓰는 쿠키·펫 한 종 */
export interface GachaUnit {
  key: string
  name: LocalizedText
  rarity: string
  image: string
}

export interface PoolEntry {
  unit: GachaUnit
  /** 확률표의 줄(등급 또는 PICKUP) */
  rank: string
  /** 1회에 이 줄로 이 대상이 나올 확률(0~1) */
  p: number
}

export interface GachaPool {
  entries: PoolEntry[]
  /** 대상이 하나도 없어 뽑을 수 없는 줄 */
  missing: string[]
  /** entries의 p 합(빠진 줄이 없으면 1) */
  total: number
}

/** 레벨에 맞는 확률표(%). 픽업 줄이 있으면 맨 앞에 PICKUP으로 둔다. */
export function ratesAt(banner: GachaBanner, level: number): { rank: string; pct: number }[] {
  const i = Math.max(1, Math.min(10, Math.round(level))) - 1
  const rows = banner.rows.map((row) => ({ rank: row.rank, pct: row.values[i] ?? 0 }))
  return banner.featured ? [{ rank: FEATURED_RANK, pct: banner.featured.rates[i] ?? 0 }, ...rows] : rows
}

/** 뽑기 대상: 도감에서 그 뽑기 종류의 쿠키·펫 중 뽑기 제외 대상을 뺀다. */
export function eligibleUnits(units: GachaUnit[], kind: GachaKind, data: GachaData = gachaData): GachaUnit[] {
  const excluded = new Set(data.excluded[kind])
  return units.filter((unit) => !excluded.has(unit.key))
}

/**
 * 한 번 뽑을 때 나올 수 있는 대상과 확률.
 * 공개 확률은 등급별 합계라서, 같은 등급 안에서는 모두 같은 확률로 나눈다고 본다.
 * 픽업 대상은 픽업 줄 확률을 따로 받고, 자기 등급의 일반 줄에도 그대로 남아 있다고 본다.
 */
export function buildPool(banner: GachaBanner, level: number, units: GachaUnit[], featured: GachaUnit | null): GachaPool {
  const entries: PoolEntry[] = []
  const missing: string[] = []
  for (const { rank, pct } of ratesAt(banner, level)) {
    if (!(pct > 0)) continue
    if (rank === FEATURED_RANK) {
      if (featured) entries.push({ unit: featured, rank, p: pct / 100 })
      else missing.push(rank)
      continue
    }
    const same = units.filter((unit) => unit.rarity === rank)
    if (!same.length) {
      missing.push(rank)
      continue
    }
    for (const unit of same) entries.push({ unit, rank, p: pct / 100 / same.length })
  }
  return { entries, missing, total: entries.reduce((s, e) => s + e.p, 0) }
}

/** 한 대상이 1회에 나올 확률(픽업 줄 + 자기 등급 몫). 빠진 줄이 있으면 남은 줄 기준으로 다시 나눈다. */
export function unitChance(pool: GachaPool, key: string): number {
  if (!pool.total) return 0
  return pool.entries.filter((e) => e.unit.key === key).reduce((s, e) => s + e.p, 0) / pool.total
}

/** 정해진 등급 이상(픽업 포함)이 1회에 나올 확률 */
export function rankChance(pool: GachaPool, ranks: string[]): number {
  if (!pool.total) return 0
  return pool.entries.filter((e) => ranks.includes(e.unit.rarity)).reduce((s, e) => s + e.p, 0) / pool.total
}

/** 쿠키는 TSSR·SSR, 펫은 SSR이 최고 등급 묶음이다. */
export const topRanks = (kind: GachaKind) => (kind === 'pet' ? ['SSR'] : ['TSSR', 'SSR'])

/**
 * 확률 p로 나오는 대상을 n번 안에 한 번 이상 얻을 확률.
 * pity가 있으면 직전 획득 뒤 pity번째 뽑기에서 반드시 나오므로, n ≥ pity면 1이다.
 */
export function chanceAtLeastOne(p: number, n: number, pity: number | null = null): number {
  if (n <= 0) return 0
  if (pity && n >= pity) return 1
  if (p <= 0) return 0
  if (p >= 1) return 1
  // 1-(1-p)^n을 작은 p에서도 정확하게 계산한다.
  return -Math.expm1(n * Math.log1p(-p))
}

/** 처음 얻을 때까지 걸리는 뽑기 횟수의 기댓값. pity가 있으면 Σ(1-p)^k (k=0..pity-1). */
export function expectedDraws(p: number, pity: number | null = null): number {
  if (pity) return p > 0 ? -Math.expm1(pity * Math.log1p(-p)) / p : pity
  return p > 0 ? 1 / p : Infinity
}

/** 한 번 이상 얻을 확률이 target 이상이 되는 가장 적은 뽑기 횟수 */
export function drawsForChance(p: number, target: number, pity: number | null = null): number {
  if (target <= 0) return 0
  if (p >= 1) return 1
  const plain = p > 0 && target < 1 ? Math.ceil(Math.log1p(-target) / Math.log1p(-p) - 1e-9) : Infinity
  return pity ? Math.min(plain, pity) : plain
}

/** 시드를 넣으면 같은 결과가 다시 나오는 난수(mulberry32). 상태는 32비트 정수 하나다. */
export function nextRandom(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) | 0
  let t = s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s]
}

/** 글자 시드를 32비트 정수로 바꾼다(FNV-1a). */
export function seedFrom(text: string): number {
  let h = 0x811c9dc5
  for (const ch of text) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 0x01000193)
  return h | 0
}

export interface DrawResult {
  unit: GachaUnit
  rank: string
  /** 천장으로 확정된 결과 */
  forced: boolean
}

export interface SimRecord {
  draws: number
  /** 등급별 횟수(픽업 대상은 자기 등급으로 센다) */
  byRarity: Record<string, number>
  /** 대상별 횟수 */
  byUnit: Record<string, number>
  /** 마지막 픽업 대상 획득 뒤 지난 뽑기 횟수 */
  sincePity: number
  rng: number
}

export const emptyRecord = (seed: number): SimRecord => ({ draws: 0, byRarity: {}, byUnit: {}, sincePity: 0, rng: seed })

/** 0~1 난수를 누적 확률에 대어 하나를 고른다. */
function pickEntry(pool: GachaPool, r: number): PoolEntry | undefined {
  const target = r * pool.total
  let acc = 0
  for (const entry of pool.entries) {
    acc += entry.p
    if (target < acc) return entry
  }
  return pool.entries[pool.entries.length - 1]
}

/**
 * n번 뽑는다. record는 바꾸지 않고 새 기록을 돌려준다.
 * pity가 있으면 pity번째 뽑기에서 픽업 대상을 확정하고, 픽업 대상이 나오면 횟수를 처음부터 센다.
 * keep개까지만 결과 목록을 돌려준다(많이 뽑을 때 화면에 다 그리지 않는다).
 */
export function simulate(
  pool: GachaPool,
  record: SimRecord,
  n: number,
  { pity = null, featured = null, keep = 100 }: { pity?: number | null; featured?: GachaUnit | null; keep?: number } = {},
): { record: SimRecord; results: DrawResult[] } {
  const next: SimRecord = { ...record, byRarity: { ...record.byRarity }, byUnit: { ...record.byUnit } }
  const results: DrawResult[] = []
  if (!pool.entries.length) return { record: next, results }
  for (let i = 0; i < n; i++) {
    let result: DrawResult
    if (pity && featured && next.sincePity + 1 >= pity) {
      result = { unit: featured, rank: featured.rarity, forced: true }
    } else {
      const [r, state] = nextRandom(next.rng)
      next.rng = state
      const entry = pickEntry(pool, r)
      if (!entry) break
      result = { unit: entry.unit, rank: entry.unit.rarity, forced: false }
    }
    if (featured) next.sincePity = result.unit.key === featured.key ? 0 : next.sincePity + 1
    next.draws += 1
    next.byRarity[result.rank] = (next.byRarity[result.rank] ?? 0) + 1
    next.byUnit[result.unit.key] = (next.byUnit[result.unit.key] ?? 0) + 1
    if (results.length < keep) results.push(result)
  }
  return { record: next, results }
}

/** 누적 뽑기 횟수로 오른 뽑기 레벨 */
export function levelForDraws(kind: GachaKind, draws: number, data: GachaData = gachaData): number {
  const steps = data.levelDraws[kind]
  let level = 1
  steps.forEach((need, i) => {
    if (draws >= need) level = i + 1
  })
  return level
}
