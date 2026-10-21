import type { CookieElement } from '../../../types'
import { hitRate } from '../../../lib/formulas'
import { critFactor, critStacks, defenseFactor, elementFactor } from '../calc/damage'

/**
 * 시뮬레이터의 한 대 피해. 배율 하나하나는 피해 계산기(calc/damage.ts)의 함수를 그대로 써서
 * 두 도구가 같은 식을 쓰게 한다. 시뮬레이터에서만 필요한 것(치명·적중을 주사위로 굴리기, 적이 쿠키를 때릴 때)만 여기서 더한다.
 *
 *   피해 = 공격력 × 계수 × (1 + 스킬증폭) × 치명 배율 × 보스 배율 × 방어 배율 × 속성 배율 × (1 − 피해감소) × 전투력 배율
 */

/** 때리는 쪽. 비율 값은 %(10 = 10%) */
export interface HitSource {
  atk: number
  critRate: number
  critDamage: number
  skillAmp: number
  bossDamage: number
  elementDamage: number
  accuracy: number
  /** 명중률(%). 적중률 식에서 만분율 보너스로 더한다. */
  accuracyRate: number
  element: CookieElement | null
}

/** 맞는 쪽. damageReduction은 0~1 */
export interface HitTarget {
  def: number
  avoidance: number
  critResist: number
  damageReduction: number
  element: CookieElement | null
  isBoss: boolean
}

/** average: 치명·적중을 기댓값으로 곱한다(같은 입력이면 늘 같은 결과). roll: 주사위를 굴린다. */
export type HitMode = { kind: 'average' } | { kind: 'roll'; random: () => number }

export function skillHit(source: HitSource, coefficient: number, target: HitTarget, powerMultiplier: number, mode: HitMode): number {
  if (!(coefficient > 0) || !(source.atk > 0)) return 0
  const chance = hitRate(source.accuracy, source.accuracyRate * 100, target.avoidance)
  const stacks = critStacks(source.critRate, target.critResist)
  let crit: number
  let landed: number
  if (mode.kind === 'average') {
    crit = critFactor(stacks, source.critDamage)
    landed = chance
  } else {
    // 100%를 넘는 치명확률은 정수 부분만큼 확정으로 터지고, 나머지 확률로 한 번 더 터진다.
    const whole = Math.floor(stacks)
    crit = critFactor(whole + (mode.random() < stacks - whole ? 1 : 0), source.critDamage)
    landed = mode.random() < chance ? 1 : 0
  }
  if (!landed) return 0
  const element = source.element ? elementFactor(source.element, target.element, source.elementDamage) : 1
  const value =
    source.atk *
    coefficient *
    (1 + source.skillAmp / 100) *
    crit *
    (target.isBoss ? 1 + source.bossDamage / 100 : 1) *
    defenseFactor(target.def) *
    element *
    (1 - Math.min(1, Math.max(0, target.damageReduction))) *
    powerMultiplier *
    landed
  return mode.kind === 'average' ? Math.max(0, value) : Math.max(0, Math.floor(value))
}
