import type { SynergyKey } from '../../../types'
import type { ScaledNumber, SkillNode } from './simData'

/**
 * 스킬 나무 하나를 따라 내려가며 "한 번 시전하면 한 대상이 받는 피해 계수"를 구한다.
 *
 * 나무의 각 마디는 투사체·장판 하나다. 마디가 몇 개 생기는지(spawnCount), 얼마나 살아 있는지(life),
 * 몇 초마다 다시 때리는지(period)를 곱해 계수를 모은다. 시너지는 마디의 값을 바꾼다.
 *   - 다발·관통·연쇄·연타처럼 "개수"로 쌓이는 시너지: 기본값 + 단계 × 배율(소수점 아래 버림)
 *   - 범위·지속·탄속처럼 "비율"로 쌓이는 시너지: 기본값 × (1 + 비율 × 배율)
 * 부채꼴로 퍼지는 탄은 reach가 정하는 수만큼만 대상에 닿는다(기본은 한 발). 관통·연쇄로 늘어나는 대상 수는 보지 않는다.
 */

export type SynergyStacks = Partial<Record<SynergyKey, number>>

const isScaled = (value: ScaledNumber | undefined): value is Exclude<ScaledNumber, number> => typeof value === 'object' && value !== null

/** 개수로 쌓이는 값(생성 수·타수·최대 생성 수) */
export function countValue(value: ScaledNumber | undefined, syn: SynergyStacks): number | null {
  if (value === undefined) return null
  if (!isScaled(value)) return value
  return value.v + Math.trunc((syn[value.k] ?? 0) * value.m)
}

/** 비율로 쌓이는 값(지속 시간·반경) */
export function scaleValue(value: ScaledNumber | undefined, syn: SynergyStacks): number | null {
  if (value === undefined) return null
  if (!isScaled(value)) return value
  return Math.max(0, value.v * (1 + (syn[value.k] ?? 0) * value.m))
}

/** 이 모드에서 나오는 마디인지(길드 토벌전 전용 가지 같은 것) */
export const nodeAllowed = (node: SkillNode, mode: string | null) =>
  !(node.allowed?.length && !(mode && node.allowed.includes(mode))) && !(mode && node.banned?.includes(mode))

/** 부채꼴로 퍼지는 발 수 가운데 대상 하나에 닿는 수. 대상 정보가 없으면 1발(가장 가운데 발)만 친다. */
export type FanReach = (fan: NonNullable<SkillNode['fan']>, count: number) => number
export const SINGLE_REACH: FanReach = (fan, count) => (fan.at === 'target' ? count : 1)

/**
 * 크기가 있는 대상을 향해 쏜 부채꼴에서 몇 발이 닿는지.
 * distance는 쏘는 쿠키와 대상 중심의 거리, size는 대상 반경 + 탄 폭이다.
 * 발 사이 각도는 퍼짐 각도 안에 고르게 둔다(무작위로 퍼지는 탄도 평균적으로 같다고 본다).
 */
export function bodyReach(distance: number, size: number): FanReach {
  return (fan, count) => {
    if (fan.at === 'target') return count
    if (fan.at === 'single' || count <= 1) return 1
    const spread = (fan.angle * Math.PI) / 180
    let hits = 0
    for (let i = 0; i < count; i++) {
      const offset =
        fan.angle >= 360 ? ((2 * Math.PI) / count) * i : fan.centered ? ((i + 0.5) * spread) / count - spread / 2 : ((i + 1) * spread) / (count + 1) - spread / 2
      const a = Math.atan2(Math.sin(offset), Math.cos(offset))
      if (Math.abs(a) < Math.PI / 2 && distance * Math.abs(Math.sin(a)) <= size + 1e-9) hits++
    }
    return Math.max(1, hits)
  }
}

export interface CastProfile {
  /** 한 번 시전으로 대상 하나가 받는 피해 계수 합(공격력 배율) */
  damage: number
  /** 한 번 시전으로 아군 하나가 받는 회복 계수 합 */
  heal: number
  /** 피해 마디 가운데 가장 넓은 반경(없으면 0). 주변 적에게 같은 피해를 나눠 주는 데 쓴다. */
  radius: number
}

const PERIODIC = new Set(['PeriodicallyEachTarget', 'PeriodicallySharedTime'])

/**
 * 시전 한 번의 계수. cycle은 소환체처럼 주기를 넘겨 살아 있는 마디를 주기 안으로 자르는 데 쓴다.
 * 자식 마디의 개수 규칙
 *   - 부모가 생기거나 사라질 때 한 번 나오는 자식: 1개
 *   - 자기 쿨타임마다 나오는 자식: 부모가 살아 있는 동안(지연 시간을 뺀) 나올 수 있는 횟수, 최대 생성 수가 있으면 그 안에서
 *   - 최대 생성 수가 시너지로 늘어나는 자식(연타): 그 수만큼
 */
export function castProfile(root: SkillNode, syn: SynergyStacks, mode: string | null, cycle: number, reach: FanReach = SINGLE_REACH): CastProfile {
  const out: CastProfile = { damage: 0, heal: 0, radius: 0 }
  const walk = (node: SkillNode, copies: number, mul: number, atk: number) => {
    if (!nodeAllowed(node, mode)) return
    let count = Math.max(1, countValue(node.spawnCount, syn) ?? 1)
    if (node.fan && count > 1) count = Math.min(count, reach(node.fan, count))
    const life = scaleValue(node.life, syn)
    const cap = node.limit ? node.limit * copies : Infinity
    const instances = Math.min(copies * count, cap)
    let ticks = 1
    if (!node.limited && node.period && life && node.calc && PERIODIC.has(node.calc)) ticks = Math.max(1, Math.floor(life / node.period))
    const isAllyNode = node.heal === true || node.relation === 'Ally'
    // 지속 피해 마디(dot)는 한 번 붙을 때의 계수로 센다(겹쳐 쌓이는 효과는 보지 않는다).
    if (node.dot && !isAllyNode) out.damage += node.dot * atk * instances * mul
    if (node.dmg) {
      if (isAllyNode) out.heal += node.dmg * atk * instances * mul * ticks
      else {
        out.damage += node.dmg * atk * instances * mul * ticks
        out.radius = Math.max(out.radius, scaleValue(node.radius, syn) ?? 0)
      }
    }
    // 소환체는 다음 시전까지만 센다(겹쳐 쌓이는 것을 막는다).
    const window = node.summonAtk && life !== null ? Math.min(life, cycle || life) : life
    for (const child of node.children ?? []) {
      const spawn = child.spawn ?? {}
      const max = countValue(spawn.max, syn) ?? 0
      let k = 1
      if (spawn.on === 'OnStart' || spawn.on === 'OnDestroy') k = 1
      else if (child.cooldown && window) {
        const possible = Math.max(1, Math.floor(Math.max(0, window - (spawn.delay ?? 0)) / child.cooldown + 1e-9) + 1)
        k = max >= 1 ? Math.min(max, possible) : possible
      } else if (isScaled(spawn.max) && max >= 1) k = max
      walk(child, k, mul * instances, atk * (node.summonAtk ?? 1))
    }
  }
  walk(root, 1, 1, 1)
  return out
}
