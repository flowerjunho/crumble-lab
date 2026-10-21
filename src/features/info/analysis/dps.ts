import type { CookieEntry } from '../../../types'
import type { CookieStats } from '../growth/growth'
import { cookieDps as calcDps, defenseFactor, type Bound, type Loadout, type PetPick, type SynergySteps, type TargetSpec } from '../calc/damage'

/**
 * 티어표·추천 편성이 쓰는 피해량 어댑터.
 *
 * 한 쿠키의 초당 피해는 피해 계산기와 같은 모델(src/features/info/calc/damage.ts의 cookieDps)로 구한다.
 * 이 파일은 그 모델에 '기준 육성 + 팀 버프로 바뀐 능력치(Attacker)'를 넘기는 다리 역할만 한다.
 *
 * - 대상은 방어력 0·속성 없음의 허수아비다. 방어력과 속성 상성은 모든 쿠키에 같은 비율로 곱해지므로 순위에는 영향이 없다.
 * - 투사체가 퍼지는 쿠키처럼 몇 번 맞는지 범위로만 정해지는 경우가 있어서, 최솟값(min)과 최댓값(max)의 가운데를 쓴다.
 * - 스테이지에서는 범위 공격이 적 여럿을 함께 맞히므로, 범위 타격 몫만큼 적 수를 곱한다(피해 계산기에는 없는 우리 가정).
 */

/** 스테이지에서 범위 공격이 한 번에 맞힌다고 보는 적 수(가정) */
export const CROWD_TARGETS = 3

/** 계산에 쓰는 능력치. 비율은 모두 1 = 100%로 둔다(피해 모델에 넘길 때 %로 바꾼다). */
export interface Attacker {
  atk: number
  critRate: number
  /** 치명타 한 번에 더해지는 피해 */
  critDamage: number
  skillAmp: number
  bossDamage: number
  /** 스킬가속 수치 ÷ 100 (슈가룬 5 → 0.05) */
  haste: number
}

export type Scenario = 'stage' | 'boss'

/**
 * 스킬 계수 가운데 범위로 맞는 몫(0~1). 반경이 있거나 대상 수 제한이 없는 타격을 범위 공격으로 본다.
 */
export function areaShare(cookie: CookieEntry): number {
  let area = 0
  let total = 0
  for (const part of cookie.skill.parts) {
    for (const hit of part.hits) {
      const coef = (hit.coef[0] + hit.coef[1]) / 2
      total += coef
      if (hit.unlimitedTargets || (hit.radius ?? 0) > 0) area += coef
    }
  }
  return total > 0 ? area / total : 0
}

/** 치명 평균 배수(피해 모델과 같은 식): 1 + 치명확률 × 치명피해. 100%를 넘는 치명확률은 치명이 한 번 더 겹친다. */
export const critFactor = (critRate: number, critDamage: number) => 1 + Math.max(0, critRate) * critDamage

/** 방어력 감소 fraction이 아군 피해를 몇 % 올리는지(피해 모델의 방어 배율 기준) */
export const defShredGain = (fraction: number, def: number) => defenseFactor(def * (1 - fraction)) / defenseFactor(def) - 1

/** 체력·방어력·피해감소로 '버틸 수 있는 피해량'(피해 모델의 방어 배율 기준) */
export const effectiveHp = (hp: number, def: number, damageReduction = 0) => hp / defenseFactor(def) / Math.max(0.05, 1 - damageReduction)

const toStats = (a: Attacker): CookieStats => ({
  level: 1,
  grade: 0,
  atk: a.atk,
  def: 0,
  hp: 1,
  critRate: a.critRate,
  critDamage: a.critDamage,
  accuracy: 100,
  avoidance: 100,
  focus: 100,
  resist: 100,
})
const toLoadout = (a: Attacker): Partial<Loadout> => ({ skillAmp: a.skillAmp * 100, haste: a.haste * 100, bossDamage: a.bossDamage * 100 })
const targetOf = (scenario: Scenario): Partial<TargetSpec> => (scenario === 'boss' ? { isBoss: true } : {})

export interface DpsOptions {
  synergy?: SynergySteps
  pets?: PetPick[]
  mode?: string | null
  /** 슈가룬처럼 능력치 위에 더하는 값(피해 모델 단위: % 수치) */
  extra?: Partial<Loadout>
}

/** 초당 피해(공격력 1 = 피해 1). 계수 범위의 가운데 값이고, 스테이지는 범위 몫만큼 적 수를 곱한다. */
export function cookieDps(cookie: CookieEntry, a: Attacker, scenario: Scenario, options: DpsOptions = {}): number {
  const loadout = toLoadout(a)
  for (const [key, value] of Object.entries(options.extra ?? {}) as [keyof Loadout, number][]) loadout[key] = (loadout[key] ?? 0) + value
  const run = (bound: Bound) =>
    calcDps({ cookie, stats: toStats(a), loadout, synergy: options.synergy, pets: options.pets, mode: options.mode ?? null, target: targetOf(scenario), bound }).dps
  const dps = (run('min') + run('max')) / 2
  return scenario === 'stage' ? dps * (1 + areaShare(cookie) * (CROWD_TARGETS - 1)) : dps
}
