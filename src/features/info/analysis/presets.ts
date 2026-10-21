import type { CookieEntry, PetEntry } from '../../../types'
import type { GrowthData } from '../growth/growth'
import type { Scenario } from './dps'
import { bestPets, buildTeam, petValue, type PetValue, type RefBuild, type TeamContext, type TeamResult, type TeamRules } from './model'

/** 추천 편성 화면이 만드는 편성 종류. 문구는 화면에서 붙인다. */
export interface TeamPreset {
  id: 'stage' | 'boss' | 'budget'
  scenario: Scenario
  rules: TeamRules
}

export const TEAM_PRESETS: TeamPreset[] = [
  // 스테이지: 적 여럿을 상대하므로 버티는 쿠키를 둘 이상 둔다.
  { id: 'stage', scenario: 'stage', rules: { minRoles: { tank: 2, support: 2 } } },
  // 보스전: 보스 하나만 때리므로 방어형은 한 명만 강제한다.
  { id: 'boss', scenario: 'boss', rules: { minRoles: { tank: 1, support: 2 } } },
  // 육성 부담이 적은 편성: SR 이하 쿠키만 쓴다.
  { id: 'budget', scenario: 'stage', rules: { minRoles: { tank: 2, support: 2 }, rarities: ['SR', 'R', 'U', 'C'] } },
]

/** 펫 순위에서 따로 빼는 펫: 특정 모드에서만 효과가 있다. */
export const isModePet = (pet: PetEntry) => pet.modes.length > 0

export interface PresetResult {
  preset: TeamPreset
  ctx: TeamContext
  team: TeamResult
  pets: PetValue[]
  /** 편성에 끼울 펫(효과 묶음이 겹치지 않게 3마리) */
  pickedPets: PetValue[]
}

export const PET_SLOTS = 3

export function runPreset(preset: TeamPreset, cookies: CookieEntry[], pets: PetEntry[], growth: GrowthData, build: RefBuild): PresetResult {
  const ctx: TeamContext = { growth, build, scenario: preset.scenario }
  const team = buildTeam(cookies, preset.rules, ctx)
  const values = pets.filter((p) => !isModePet(p)).map((p) => petValue(p, team, ctx))
  return { preset, ctx, team, pets: values, pickedPets: bestPets(values, PET_SLOTS, (v) => v.dps) }
}
