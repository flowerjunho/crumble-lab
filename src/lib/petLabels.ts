import type { CookieEntry, Locale, PetEffect, PetEntry, PetTier } from '../types'
import { ELEMENT, ROLE, SYNERGY, label } from './cookieLabels'

/**
 * 펫 도감에 쓰는 이름표. 한국어는 국내 배틀 패시브 문구(cookieruncrumble.net 한국어 펫 페이지)의 표기를 따른다.
 * 예) 최대체력·피해감소·치명저항·명중(수치)과 명중률(%)·집중확률·저항확률·밀치기 저항
 */
type Labels = Record<Locale, string>
const L = (ko: string, en: string, ja: string): Labels => ({ ko, en, ja })

export const PET_STAT: Record<string, Labels> = {
  atk: L('공격력', 'ATK', '攻撃力'),
  def: L('방어력', 'DEF', '防御力'),
  hp: L('최대체력', 'Max HP', '最大HP'),
  critRate: L('치명확률', 'CRIT Rate', '会心率'),
  critDamage: L('치명피해', 'CRIT DMG', '会心ダメージ'),
  critResist: L('치명저항', 'CRIT RES', '会心耐性'),
  skillAmp: L('스킬증폭', 'Skill AMP', 'スキル増幅'),
  bossDamage: L('보스피해', 'Boss DMG', 'ボスダメージ'),
  damageReduction: L('피해감소', 'DMG reduction', 'ダメージ減少'),
  moveSpeed: L('이동속도', 'Move Speed', '移動速度'),
  accuracy: L('명중', 'Accuracy', '命中'),
  accuracyRate: L('명중률', 'Accuracy rate', '命中率'),
  avoidance: L('회피', 'Avoidance', '回避'),
  avoidanceRate: L('회피율', 'Avoidance rate', '回避率'),
  focus: L('집중', 'Focus', '集中'),
  focusRate: L('집중확률', 'Focus rate', '集中確率'),
  resist: L('저항', 'Resist', '抵抗'),
  resistRate: L('저항확률', 'Resist rate', '抵抗確率'),
  liftResist: L('띄우기 저항', 'Lift RES', '浮かし耐性'),
  pushResist: L('밀치기 저항', 'Push RES', '押し出し耐性'),
}

/** 목록 필터에 쓰는 효과 종류. 수치형과 %형(명중·명중률 등)은 한 종류로 묶는다. */
export const PET_EFFECT_KIND: Record<string, Labels> = {
  atk: L('공격력', 'ATK', '攻撃力'),
  critRate: L('치명확률', 'CRIT Rate', '会心率'),
  critDamage: L('치명피해', 'CRIT DMG', '会心ダメージ'),
  skillAmp: L('스킬증폭', 'Skill AMP', 'スキル増幅'),
  synergy: L('시너지', 'Synergy', 'シナジー'),
  def: L('방어력', 'DEF', '防御力'),
  hp: L('최대체력', 'Max HP', '最大HP'),
  damageReduction: L('피해감소', 'DMG reduction', 'ダメージ減少'),
  critResist: L('치명저항', 'CRIT RES', '会心耐性'),
  accuracy: L('명중', 'Accuracy', '命中'),
  avoidance: L('회피', 'Avoidance', '回避'),
  focus: L('집중', 'Focus', '集中'),
  resist: L('저항', 'Resist', '抵抗'),
  cc: L('띄우기·밀치기 저항', 'Lift/Push RES', '浮かし・押し出し耐性'),
  moveSpeed: L('이동속도', 'Move Speed', '移動速度'),
  bossDamage: L('보스피해', 'Boss DMG', 'ボスダメージ'),
}
export const PET_EFFECT_KIND_ORDER = Object.keys(PET_EFFECT_KIND)

const KIND_OF_STAT: Record<string, string> = {
  accuracyRate: 'accuracy',
  avoidanceRate: 'avoidance',
  focusRate: 'focus',
  resistRate: 'resist',
  liftResist: 'cc',
  pushResist: 'cc',
}

/** 펫이 가진 효과 종류(필터용). */
export function petEffectKinds(pet: PetEntry): string[] {
  const tier = pet.tiers[0]
  if (!tier) return []
  const kinds = tier.effects.map((effect) => KIND_OF_STAT[effect.stat] ?? effect.stat)
  if (tier.synergy.length) kinds.push('synergy')
  return [...new Set(kinds)]
}

export const PET_MODE: Record<string, Labels> = {
  DIMENSION_STAGE: L('차원의 이면', 'Dimension stages', '次元の裏側'),
}

/** 대상 범위 요약. 예) '불속성 아군', '돌격형 아군', '연쇄 시너지를 받는 아군', '아군 전체' */
export function petTargetLabel(pet: PetEntry, locale: Locale): string {
  const t = (ko: string, en: string, ja: string) => (locale === 'ko' ? ko : locale === 'ja' ? ja : en)
  const { elements, roles, receivesSynergy } = pet.target
  if (elements.length) {
    // ELEMENT의 한국어·일본어 이름에 이미 '속성'이 붙어 있다.
    const names = elements.map((e) => label(ELEMENT, e, locale)).join(', ')
    return t(`${names} 아군`, `${names} allies`, `${names}の味方`)
  }
  if (roles.length) {
    // 인게임 문구 표기: '돌격형 아군'
    const names = roles.map((r) => label(ROLE, r, locale)).join(', ')
    return t(`${roles.map((r) => `${label(ROLE, r, locale)}형`).join(', ')} 아군`, `${names} allies`, `${names}型の味方`)
  }
  if (receivesSynergy) {
    const name = label(SYNERGY, receivesSynergy, locale)
    return t(`${name} 시너지를 받는 아군`, `Allies receiving ${name} Synergy`, `${name}シナジーを受ける味方`)
  }
  return t('아군 전체', 'All allies', '味方全体')
}

const amount = (effect: PetEffect) => `+${effect.value}${effect.how === 'flat' ? '' : '%'}`

/**
 * 별 등급 효과 한 줄. 한국어는 인게임 문구를 그대로 쓰고, 다른 언어는 같은 수치로 문장을 만든다.
 */
export function petTierText(pet: PetEntry, tier: PetTier, locale: Locale): string {
  if (locale === 'ko') return tier.text
  const t = (en: string, ja: string) => (locale === 'ja' ? ja : en)
  const parts: string[] = []
  for (const boost of tier.synergy) {
    const name = label(SYNERGY, boost.key, locale)
    parts.push(t(`${name} Synergy +${boost.value}${boost.unit === 'pct' ? '%' : ''}`, `${name}シナジー +${boost.value}${boost.unit === 'pct' ? '%' : ''}`))
  }
  const stats = tier.effects.map((effect) => `${label(PET_STAT, effect.stat, locale)} ${amount(effect)}`).join(', ')
  if (stats) parts.push(stats)
  const mode = pet.modes.map((m) => label(PET_MODE, m, locale)).join(', ')
  const body = `${parts.join(t('; ', '、'))} (${petTargetLabel(pet, locale)})`
  return mode ? t(`${mode} only: ${body}`, `${mode}限定: ${body}`) : body
}

/** 펫 효과를 받는 쿠키인지(아군 전체 대상이면 모두 해당). */
export function petAffectsCookie(pet: PetEntry, cookie: CookieEntry): boolean {
  const { elements, roles, receivesSynergy } = pet.target
  if (elements.length && !elements.includes(cookie.element)) return false
  if (roles.length && !roles.includes(cookie.role)) return false
  if (receivesSynergy && !cookie.synergy.receives.includes(receivesSynergy)) return false
  return true
}

/** 아군 전체가 아니라 특정 쿠키에게만 효과가 있는 펫인지. */
export const isTargetedPet = (pet: PetEntry) => Boolean(pet.target.elements.length || pet.target.roles.length || pet.target.receivesSynergy)
