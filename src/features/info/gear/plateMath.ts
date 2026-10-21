import type { PlateBoost, PlateStep, RuneTier } from './gearTypes'

/** 박살나면 이 단계로 내려간다(복구를 쓰면 그대로 남는다). */
export const PLATE_CRUSH_TO = 10

/** 플레이트를 단계 grade까지 강화했을 때 메인·보조 옵션 값. 장비에 적힌 +0 값에 (1 + 증폭)을 곱한다. */
export function platedValues(boost: PlateBoost[], grade: number, main: number, sub: number): { main: number; sub: number } {
  const row = boost.find((b) => b.grade === grade)
  if (!row) throw new Error(`플레이트 +${grade} 단계가 없습니다.`)
  return { main: main * (1 + row.main), sub: sub * (1 + row.sub) }
}

export interface PlateOptions {
  /** 하락 방지: 하락 확률이 모두 유지로 옮겨 간다. */
  guard: boolean
  /** 박살 완화: 박살 확률이 절반으로 줄고, 줄어든 만큼 유지로 옮겨 간다. */
  ease: boolean
  /** 복구: 박살나도 시럽쇳물을 내고 그 단계에 남는다. */
  restore: boolean
}

export interface PlateExpectation {
  /** 평균 시도 횟수 */
  tries: number
  /** 평균 초코강 */
  material: number
  /** 평균 시럽쇳물(하락 방지·박살 완화·복구) */
  syrup: number
}

/** 재료 옵션을 반영한 한 번 시도의 결과 확률. 재료를 쓸 수 없는 단계에서는 기본 확률 그대로다. */
export function stepOdds(step: PlateStep, options: PlateOptions) {
  let { keep, down, crush } = step
  const guard = options.guard && step.guard != null && down > 0
  const ease = options.ease && step.ease != null && crush > 0
  if (guard) {
    keep += down
    down = 0
  }
  if (ease) {
    keep += crush / 2
    crush /= 2
  }
  return { great: step.great, success: step.success, keep, down, crush, guard, ease }
}

/**
 * +start에서 +target에 처음 닿을 때까지 드는 평균 시도·재료를 구한다.
 * 단계별 기대값 E[g] = (한 번 비용) + Σ 결과 확률 × E[다음 단계] 를 연립방정식으로 푼다(목표 이상은 0).
 * 대성공 때 돌려받는 초코강은 반영하지 않는다(환급 방식이 공개되지 않았다).
 */
export function expectedPlateCost(steps: PlateStep[], start: number, target: number, options: PlateOptions): PlateExpectation {
  const max = steps.length
  if (!(start >= 0 && target <= max && start < target)) return { tries: 0, material: 0, syrup: 0 }
  const n = target
  // A·E = c 를 세 가지 비용(시도, 초코강, 시럽쇳물)에 대해 한꺼번에 푼다.
  const a = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  const c = Array.from({ length: n }, () => [0, 0, 0])
  const add = (row: number[], to: number, p: number) => {
    if (to < n && p > 0) row[to] = (row[to] ?? 0) - p
  }
  for (let g = 0; g < n; g++) {
    const step = steps[g]
    if (!step) throw new Error(`플레이트 +${g} 확률이 없습니다.`)
    const row = a[g]!
    row[g] = 1
    const odds = stepOdds(step, options)
    add(row, Math.min(g + 2, max), odds.great)
    add(row, g + 1, odds.success)
    add(row, g, odds.keep)
    add(row, g - 1, odds.down)
    const restore = options.restore && step.restore != null && odds.crush > 0
    add(row, restore ? g : PLATE_CRUSH_TO, odds.crush)
    const syrup = (odds.guard ? (step.guard ?? 0) : 0) + (odds.ease ? (step.ease ?? 0) : 0) + (restore ? odds.crush * (step.restore ?? 0) : 0)
    c[g] = [1, step.material, syrup]
  }
  const solved = solve(a, c)
  const from = solved[start] ?? [0, 0, 0]
  return { tries: from[0] ?? 0, material: from[1] ?? 0, syrup: from[2] ?? 0 }
}

/** 가우스 소거. 행렬이 작아서(최대 25×25) 단순하게 푼다. */
function solve(a: number[][], b: number[][]): number[][] {
  const n = a.length
  const m = a.map((row, i) => [...row, ...(b[i] ?? [])])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r
    ;[m[col], m[pivot]] = [m[pivot]!, m[col]!]
    const p = m[col]![col]!
    if (Math.abs(p) < 1e-12) throw new Error('플레이트 기대값을 풀지 못했습니다.')
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = m[r]![col]! / p
      if (f === 0) continue
      for (let k = col; k < m[r]!.length; k++) m[r]![k] = m[r]![k]! - f * m[col]![k]!
    }
  }
  return m.map((row, i) => row.slice(n).map((v) => v / row[i]!))
}

export interface RuneRarityTotal {
  rarity: RuneTier['rarity']
  /** 세공 1회에서 이 등급이 나올 확률(%) */
  chance: number
}

/** 등급별 합계: 13종 효과 × 티어 확률 + 스킬가속 확률 */
export function runeRarityTotals(tiers: RuneTier[]): RuneRarityTotal[] {
  const totals = new Map<RuneTier['rarity'], number>()
  for (const t of tiers) totals.set(t.rarity, (totals.get(t.rarity) ?? 0) + t.chance * Object.keys(t.values).length + (t.haste?.chance ?? 0))
  return [...totals].map(([rarity, chance]) => ({ rarity, chance }))
}
