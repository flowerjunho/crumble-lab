import { queryOptions } from '@tanstack/react-query'
import { asset } from '../../../lib/asset'
import type { SynergyKey } from '../../../types'

/**
 * public/data/sim.json(scripts/import-eog-sim.mjs)의 모양.
 * 좌표는 게임 거리 단위이고, 보스는 +z 쪽, 쿠키 배치 칸은 −z 쪽에 있다. 시간은 초, 배율은 1 = 공격력 100%.
 */

/** 시너지로 바뀌는 값: 기본값 v, 시너지 종류 k, 한 단계(또는 100%)당 배율 m */
export interface Scaled {
  v: number
  k: SynergyKey
  m: number
}
export type ScaledNumber = number | Scaled

/** 스킬 하나가 만들어 내는 투사체·장판의 나무. 피해 계산에 필요한 값만 남겼다. */
export interface SkillNode {
  key: string
  /** 한 번 맞을 때의 공격력 배율 */
  dmg?: number
  heal?: boolean
  relation?: string
  spawnCount?: ScaledNumber
  life?: ScaledNumber
  period?: number
  calc?: string
  limited?: boolean
  limit?: number
  hits?: ScaledNumber
  radius?: ScaledNumber
  /** 부채꼴로 퍼지는 여러 발. at: target(대상 위치에 생김), single(한 발만 닿음), spread(각도 안에 퍼짐) */
  fan?: { angle: number; at: 'target' | 'single' | 'spread'; centered: boolean }
  /** 지속 피해 계수 */
  dot?: number
  cooldown?: number
  /** 소환체가 주인 공격력의 몇 배로 때리는지 */
  summonAtk?: number
  /** 이 모드에서만 나온다 */
  allowed?: string[]
  banned?: string[]
  spawn?: { on?: string; delay?: number; max?: ScaledNumber }
  children?: SkillNode[]
}

export interface SkillRoot {
  key: string
  cooldown: number
  effectiveCooldown: number
  /** 시전 동작 시간(이 동안 움직이거나 다른 스킬을 쓰지 못한다) */
  anim: number
  /** 스스로 시전하는 가지인지(쓰러질 때 나오는 소환 같은 가지는 false) */
  counted: boolean
  support: boolean
  /** 시너지 없이 한 번 시전할 때의 피해 계수 합 */
  coef: number
  targeting: { rule: string | null; ally: boolean; synergy: SynergyKey | null; range: number | null } | null
  tree: SkillNode
}

export interface SlotPos {
  slot: number
  x: number
  z: number
}

export interface SpawnGroup {
  dx: number
  dz: number
  count: number
  scatter: number
}

export interface AddStats {
  hp: number
  atk: number
  def: number
  hitRadius: number
  speed: number
  life: number
  range?: number
  ccImmune?: boolean
}

export interface AddAttack {
  cooldown: number
  damageMultiplier: number
  attackRange: number
  radius?: number
  hitCountLimit?: number
  knockBack?: number
  airborne?: number
  projectileSpeed?: number
}

export interface DungeonData {
  boss: { atk: number; def: number; hitRadius: number; avoidance: number; resist: number; ccImmune: boolean }
  timeLimit: number
  bossPos: { x: number; z: number }
  slots: SlotPos[]
  phases: {
    phase: number
    opensAt: number
    strikes: number
    strikeTier: string
    strikeGroups: SpawnGroup[]
    carriers: { at: number; tier: string; groups: SpawnGroup[] }[]
  }[]
  timing: { spiralAt: number; lightningAt: number; firstStrikeDelay: number; strikeInterval: number; shockwaveCarrierAt: number; carrierToHit: number }
  attacks: {
    spiral: { damageMultiplier: number; knockBack: number }
    lightning: { strikeRadius: number; damageMultiplier: number; knockBack: number; airborneDuration: number }
    shockwave: { radius: number; damageMultiplier: number; knockBack: number; airborneDuration: number }
  }
  spiral: {
    emitters: { startAngleDeg: number; rotationSpeed: number }[]
    firstBulletAt: number
    bulletInterval: number
    bulletsEmitted: number
    bulletSpeed: number
    bulletReach: number
    bulletRadius: number
    angularStepDeg: number
  }
  bossBuffs: { tier: number; appliesAt: number; dr: number; atkMultiplier: number; maxStack: number }[]
  adds: Record<string, AddStats>
  addAttacks: Record<'soldier' | 'mage' | 'golem', AddAttack>
}

export type GuildEvent =
  | { t: number; kind: 'addSpawn'; phase: number; tier: string; groups: SpawnGroup[] }
  | {
      t: number
      kind: 'gift' | 'wave' | 'blast'
      phase: number
      damageMultiplier: number
      radius?: number
      pickLimit?: number
      hits?: number
      knockBack?: number
      airborne?: number
      targeting: string | null
    }

export interface GuildData {
  boss: { element: string; atk: number; def: number; avoidance: number; hitRadius: number; ccImmune: boolean }
  bossPos: { x: number; z: number }
  timeLimit: number
  /** 길드 토벌전에서 쿠키 피해에 곱해지는 전투력 배율 */
  powerMultiplier: number
  phases: { start: number; drStart?: number; dr: number; atkMult: number; inTime: boolean }[]
  timeline: GuildEvent[]
  adds: Record<string, AddStats>
  addAttack: AddAttack & { opener: Partial<AddAttack> }
}

export interface SimData {
  _meta: { source: string; sourceFile: string; fetchedAt: string; note: string }
  defaults: { level: number; grade: number; bossBody: number; smallBody: number }
  lineup: { bossPos: { x: number; z: number }; slots: SlotPos[] }
  dungeon: DungeonData
  guild: GuildData
  skills: Record<string, SkillRoot[]>
}

/** 전투 시뮬레이터 데이터. 게임 버전이 바뀌기 전에는 변하지 않는다. */
export const simQuery = queryOptions({
  queryKey: ['crumble', 'sim'],
  queryFn: async () => {
    const path = asset('/data/sim.json')
    // 빌드마다 주소가 바뀌어서 배포 직후 예전 캐시를 읽지 않는다.
    const response = await fetch(`${path}?v=${__BUILD_ID__}`)
    if (!response.ok) throw new Error(`${path} 요청이 실패했습니다 (${response.status})`)
    const data = (await response.json()) as SimData
    if (!data.lineup.slots.length || !data.dungeon.slots.length) throw new Error('전투 시뮬레이터 데이터의 배치 칸이 비어 있습니다.')
    return data
  },
  staleTime: Infinity,
  gcTime: Infinity,
})
