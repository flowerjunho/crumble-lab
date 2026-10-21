import { queryOptions } from '@tanstack/react-query'
import { asset } from '../../../lib/asset'
import type { Locale } from '../../../types'

/** public/data/rune-craft.json (scripts/import-eog-runes.mjs) */
export interface RuneTier {
  /** 1이 가장 높은 수치 */
  tier: number
  /** 이 단계에서 옵션 하나가 나올 가중치(전체 totalWeight 중) */
  weight: number
  values: Record<string, number>
  /** 스킬가속은 따로 정해진 가중치를 쓰고, SSR·SR의 1·2단계에만 있다. */
  haste: { value: number; weight: number } | null
}
export interface RuneRarity {
  rarity: string
  tiers: RuneTier[]
}
export interface RuneCraftData {
  totalWeight: number
  maxSlots: number
  /** 잠근 슬롯 수(인덱스)별 재조합 1회 비용(룬결정) */
  rerollCosts: number[]
  stats: { key: string; unit: 'pct' | 'flat' }[]
  rarities: RuneRarity[]
}

export const HASTE = 'skillHaste'

export const runeCraftQuery = queryOptions({
  queryKey: ['crumble', 'rune-craft'],
  queryFn: async () => {
    const path = asset('/data/rune-craft.json')
    // 빌드마다 주소가 바뀌어서 배포 직후 예전 캐시를 읽지 않는다.
    const response = await fetch(`${path}?v=${__BUILD_ID__}`)
    if (!response.ok) throw new Error(`${path} 요청이 실패했습니다 (${response.status})`)
    return (await response.json()) as RuneCraftData
  },
  // 게임 버전이 바뀌기 전에는 확률이 변하지 않는다.
  staleTime: Infinity,
  gcTime: Infinity,
})

type Labels = Record<Locale, string>
const L = (ko: string, en: string, ja: string): Labels => ({ ko, en, ja })

/**
 * 슈가룬 옵션 이름. 인게임 옵션은 '치명확률 증가'처럼 '증가'가 붙지만,
 * 추천 슈가룬 탭(/recommend)과 맞춰 짧은 이름을 쓴다. 국내 표기는 cc.team-hobby.com 슈가룬 시뮬레이터(게임 데이터)에서 확인했다.
 */
export const RUNE_STAT: Record<string, Labels> = {
  atkAmp: L('공격력 증폭', 'ATK Amplification', '攻撃力増幅'),
  defAmp: L('방어력 증폭', 'DEF Amplification', '防御力増幅'),
  hpAmp: L('체력 증폭', 'HP Amplification', 'HP増幅'),
  critRate: L('치명확률', 'CRIT Rate', '会心率'),
  critResist: L('치명저항', 'CRIT RES', '会心耐性'),
  critDamage: L('치명피해', 'CRIT DMG', '会心ダメージ'),
  accuracyRate: L('명중률', 'Accuracy rate', '命中率'),
  avoidanceRate: L('회피율', 'Evasion rate', '回避率'),
  focusRate: L('집중확률', 'Focus rate', '集中確率'),
  resistRate: L('저항확률', 'Resist rate', '抵抗確率'),
  skillAmp: L('스킬증폭', 'Skill AMP', 'スキル増幅'),
  damageReduction: L('피해감소', 'DMG reduction', 'ダメージ減少'),
  moveSpeed: L('이동속도', 'Move Speed', '移動速度'),
  skillHaste: L('스킬가속', 'Skill Haste', 'スキル加速'),
}

export const statLabel = (key: string, locale: Locale) => RUNE_STAT[key]?.[locale] ?? key

/** 결과 하나(등급 × 수치 단계 × 옵션). 재조합 한 번에 슬롯 한 칸이 이 중 하나가 된다. */
export interface RuneOutcome {
  rarity: string
  tier: number
  /** 등급·단계를 수치 높은 순으로 늘어놓은 순번(SSR 1단계 = 0) */
  step: number
  stat: string
  value: number
  weight: number
}

/** 등급·단계를 수치가 높은 순으로 늘어놓는다. 어느 옵션이든 이 순서대로 수치가 줄어든다. */
export function runeSteps(data: RuneCraftData): { rarity: string; tier: number }[] {
  return data.rarities.flatMap(({ rarity, tiers }) => tiers.map(({ tier }) => ({ rarity, tier })))
}

export function runeOutcomes(data: RuneCraftData): RuneOutcome[] {
  const out: RuneOutcome[] = []
  let step = 0
  for (const { rarity, tiers } of data.rarities)
    for (const tier of tiers) {
      for (const [stat, value] of Object.entries(tier.values)) out.push({ rarity, tier: tier.tier, step, stat, value, weight: tier.weight })
      if (tier.haste) out.push({ rarity, tier: tier.tier, step, stat: HASTE, value: tier.haste.value, weight: tier.haste.weight })
      step++
    }
  return out
}

export interface RuneTarget {
  /** 원하는 옵션(이 중 하나면 된다). 비어 있으면 옵션을 가리지 않는다. */
  stats: string[]
  /** 이 순번(runeSteps) 이하, 즉 이 등급·단계 이상의 수치만 인정한다. */
  maxStep: number
}

/** 슬롯 한 칸을 재조합했을 때 목표에 맞는 결과가 나올 확률 */
export function slotChance(data: RuneCraftData, target: RuneTarget): number {
  const wanted = new Set(target.stats)
  let weight = 0
  for (const o of runeOutcomes(data)) if ((!wanted.size || wanted.has(o.stat)) && o.step <= target.maxStep) weight += o.weight
  return weight / data.totalWeight
}

/** 한 번에 p로 성공하는 시도를 n번 했을 때 한 번 이상 성공할 확률 */
export const chanceWithin = (p: number, n: number) => (p >= 1 ? 1 : p <= 0 ? 0 : 1 - Math.pow(1 - p, n))

/** 누적 확률이 q 이상이 되는 최소 시도 횟수 */
export function triesFor(p: number, q: number): number {
  if (p >= 1) return 1
  if (p <= 0) return Infinity
  return Math.max(1, Math.ceil(Math.log(1 - q) / Math.log(1 - p)))
}

/** 이항분포 확률 P(X = h), X ~ B(n, p) */
export function binomial(n: number, p: number): number[] {
  const out: number[] = []
  let coef = 1
  for (let h = 0; h <= n; h++) {
    out.push(coef * Math.pow(p, h) * Math.pow(1 - p, n - h))
    coef = (coef * (n - h)) / (h + 1)
  }
  return out
}

export interface LockPlan {
  /** 잠근 슬롯 수별 남은 기대 비용(룬결정) */
  cost: number[]
  /** 잠근 슬롯 수별 남은 기대 재조합 횟수 */
  rerolls: number[]
  /** move[j][h]: 잠근 슬롯 j칸에서 새로 h칸이 맞았을 때 잠근 뒤의 칸 수 */
  move: number[][]
}

/**
 * 슬롯 n칸 중 need칸을 목표 옵션으로 채우는 재조합 계획.
 * 재조합은 잠그지 않은 슬롯을 한꺼번에 다시 뽑고, 비용은 잠근 슬롯 수에 따라 오른다.
 * 맞은 슬롯을 바로 다 잠그면(greedy) 다음 재조합이 비싸지므로, optimal은 기대 비용이 가장 낮도록
 * 맞은 슬롯 중 몇 칸을 잠글지 고른다(마르코프 결정 과정을 정확히 풀어 몬테카를로가 아니다).
 */
export function lockPlan(n: number, need: number, p: number, costs: number[], mode: 'optimal' | 'greedy'): LockPlan {
  const cost = new Array<number>(need + 1).fill(0)
  const move: number[][] = []
  for (let j = need - 1; j >= 0; j--) {
    const c = costs[j] ?? Infinity
    const dist = binomial(n - j, p)
    if (mode === 'greedy') {
      // 맞은 만큼 바로 잠근다: V = (c + Σ P(h)·V[j+h]) / (1 - P(0))
      const stay = dist[0] ?? 0
      let sum = c
      for (let h = 1; h < dist.length; h++) sum += (dist[h] ?? 0) * (cost[Math.min(j + h, need)] ?? 0)
      cost[j] = stay < 1 ? sum / (1 - stay) : Infinity
      move[j] = dist.map((_, h) => Math.min(j + h, need))
      continue
    }
    // h칸이 맞았을 때 갈 수 있는 가장 싼 칸 수(j보다 큰 쪽)
    const best = dist.map((_, h) => {
      let to = -1
      for (let k = j + 1; k <= Math.min(j + h, need); k++) if (to < 0 || (cost[k] ?? 0) < (cost[to] ?? 0)) to = k
      return to
    })
    // V = c + Σ P(h)·min(V, m_h). m_h가 작은 순서로 '잠그는 경우'를 하나씩 넣어 보며 가장 낮은 값을 고른다.
    const order = dist.map((pr, h) => ({ pr, m: best[h]! < 0 ? Infinity : (cost[best[h]!] ?? 0) })).filter((x) => Number.isFinite(x.m) && x.pr > 0)
    order.sort((a, b) => a.m - b.m)
    let v = Infinity
    let num = c
    let den = 0
    for (const { pr, m } of order) {
      num += pr * m
      den += pr
      v = Math.min(v, num / den)
    }
    cost[j] = v
    move[j] = best.map((to) => (to >= 0 && (cost[to] ?? 0) < v ? to : j))
  }
  // 정한 계획대로 갈 때의 기대 재조합 횟수
  const rerolls = new Array<number>(need + 1).fill(0)
  for (let j = need - 1; j >= 0; j--) {
    const dist = binomial(n - j, p)
    let stay = 0
    let sum = 1
    dist.forEach((pr, h) => {
      const to = move[j]?.[h] ?? j
      if (to === j) stay += pr
      else sum += pr * (rerolls[to] ?? 0)
    })
    rerolls[j] = stay < 1 ? sum / (1 - stay) : Infinity
  }
  return { cost, rerolls, move }
}

/**
 * 계획대로 재조합할 때 r회 안에 목표를 채울 확률이 각 q에 처음 닿는 횟수.
 * 한 회씩 상태 분포를 넘겨 계산하고, limit회를 넘으면 Infinity로 둔다.
 */
export function rerollPercentiles(n: number, need: number, p: number, plan: LockPlan, qs: number[], limit = 200_000): number[] {
  const out = qs.map(() => Infinity)
  if (p <= 0) return out
  const trans = Array.from({ length: need }, (_, j) => binomial(n - j, p))
  let state = new Array<number>(need + 1).fill(0)
  state[0] = 1
  let pending = qs.length
  for (let r = 1; r <= limit && pending > 0; r++) {
    const next = new Array<number>(need + 1).fill(0)
    next[need] = state[need] ?? 0
    for (let j = 0; j < need; j++) {
      const s = state[j] ?? 0
      if (!s) continue
      trans[j]!.forEach((pr, h) => {
        const to = plan.move[j]?.[h] ?? j
        next[to] = (next[to] ?? 0) + s * pr
      })
    }
    state = next
    const done = state[need] ?? 0
    qs.forEach((q, i) => {
      if (out[i] === Infinity && done >= q - 1e-12) {
        out[i] = r
        pending--
      }
    })
  }
  return out
}

/** 확률을 읽기 좋은 퍼센트 문자열로 */
export function formatPct(p: number): string {
  const pct = p * 100
  if (pct === 0) return '0%'
  if (pct >= 10) return `${pct.toFixed(2)}%`
  if (pct >= 1) return `${pct.toFixed(3)}%`
  if (pct >= 0.01) return `${pct.toFixed(4)}%`
  return `${pct.toPrecision(3)}%`
}

export const formatValue = (value: number, unit: 'pct' | 'flat') => (unit === 'pct' ? `${value}%` : `${value}`)
