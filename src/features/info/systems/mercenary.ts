import { ROLE, label } from '../../../lib/cookieLabels'
import type { CookieEntry, CookieRole, Locale } from '../../../types'
import type { BandLevel, BandPerk, PerkTarget, SystemEffect } from './systemsData'

/**
 * 용병단 특전 계산. 특전 이름·설명은 국내 표기를 확인하지 못해서, 게임 데이터의 조건·대상·수치로 문장을 직접 만든다.
 * 능력치 이름은 국내 인게임 표기(펫 배틀 패시브 문구의 최대체력·피해감소·이동속도, cc.team-hobby.com 연구의 속성피해)를 쓴다.
 * '스킬 가속'은 국내 표기를 찾지 못해 풀어 쓴 표현이다.
 */
type Labels = Record<Locale, string>
const L = (ko: string, en: string, ja: string): Labels => ({ ko, en, ja })

export const SYSTEM_STAT: Record<SystemEffect['stat'], Labels> = {
  atk: L('공격력', 'ATK', '攻撃力'),
  def: L('방어력', 'DEF', '防御力'),
  hp: L('최대체력', 'Max HP', '最大HP'),
  elementDamage: L('속성피해', 'Elemental DMG', '属性ダメージ'),
  haste: L('스킬 가속', 'Skill Haste', 'スキル加速'),
  damageReduction: L('피해감소', 'DMG reduction', 'ダメージ減少'),
  moveSpeed: L('이동속도', 'Move Speed', '移動速度'),
}

/** 효과 하나: '공격력 +20%', '최대체력 −20%', '스킬 가속 +15' */
export function effectText(effect: SystemEffect, locale: Locale, multiplier = 1): string {
  const value = effect.value * multiplier
  const name = label(SYSTEM_STAT, effect.stat, locale)
  const sign = value >= 0 ? '+' : '−'
  const amount = Number(Math.abs(value).toFixed(2))
  if (effect.how === 'screen') return `${name} ${amount}%`
  return `${name} ${sign}${amount}${effect.how === 'flat' ? '' : '%'}`
}

/** 특전이 붙는 대상: '전투력이 가장 높은 아군 1명', '사격 아군' */
export function targetText(target: PerkTarget, locale: Locale): string {
  const t = (ko: string, en: string, ja: string) => (locale === 'ko' ? ko : locale === 'ja' ? ja : en)
  const roles = target.roles.map((r) => label(ROLE, r, locale)).join('·')
  const who = roles ? t(`${roles} 아군`, `${roles} allies`, `${roles}の味方`) : t('아군', 'allies', '味方')
  const n = target.count ?? 1
  if (target.select === 'all') return roles ? who : t('아군 전체', 'All allies', '味方全体')
  if (target.select === 'powerTop')
    return n === 1 ? t(`전투력이 가장 높은 ${who} 1명`, `The ally with the highest CP`, `戦闘力が最も高い味方1体`) : t(`전투력 상위 ${who} ${n}명`, `Top ${n} allies by CP`, `戦闘力上位の味方${n}体`)
  const stat = label(SYSTEM_STAT, target.stat ?? 'atk', locale)
  const top = target.select === 'statTop'
  if (n === 1) return top ? t(`${stat}이 가장 높은 ${who} 1명`, `The ally with the highest ${stat}`, `${stat}が最も高い味方1体`) : t(`${stat}이 가장 낮은 ${who} 1명`, `The ally with the lowest ${stat}`, `${stat}が最も低い味方1体`)
  return top
    ? t(`${stat}이 높은 ${who} ${n}명`, `${n} allies with the highest ${stat}`, `${stat}が高い味方${n}体`)
    : t(`${stat}이 낮은 ${who} ${n}명`, `${n} allies with the lowest ${stat}`, `${stat}が低い味方${n}体`)
}

/** 발동 조건. 조건이 없으면 빈 문자열 */
export function conditionText(perk: BandPerk, locale: Locale): string {
  const t = (ko: string, en: string, ja: string) => (locale === 'ko' ? ko : locale === 'ja' ? ja : en)
  const c = perk.condition
  if (c.type === 'roleCount') {
    const role = label(ROLE, c.role, locale)
    return t(`편성에 ${role} 쿠키가 ${c.min}명 이상일 때`, `With ${c.min} or more ${role} Cookies in the lineup`, `編成に${role}クッキーが${c.min}体以上いるとき`)
  }
  if (c.type === 'elementMaxCount') return t('편성에서 가장 많은 속성의 쿠키 1명마다', 'Per Cookie of the most common Element in the lineup', '編成で最も多い属性のクッキー1体ごと')
  return ''
}

/** 특전 한 줄 요약: '[조건] 대상: 효과, 효과' */
export function perkSummary(perk: BandPerk, locale: Locale): string {
  const effects = perk.effects.map((e) => effectText(e, locale)).join(', ')
  const condition = conditionText(perk, locale)
  const body = `${targetText(perk.target, locale)}: ${effects}`
  return condition ? `${condition}, ${body}` : body
}

/** 이 레벨에서 고를 수 있는 특전(해금 레벨 이하) */
export const perksAvailable = (perks: BandPerk[], level: number) => perks.filter((p) => p.unlockedAt <= level)

export interface PerkResult {
  perk: BandPerk
  active: boolean
  /** 직업 조건을 따질 때 편성에 있는 그 직업 쿠키 수 */
  roleCount: number | null
  /** 같은 속성 최대 인원(속성 조건 특전) */
  multiplier: number
  /** 효과를 받는 쿠키 eid */
  targets: string[]
}

export interface CookieBuffs {
  eid: string
  /** 같은 능력치끼리 더한 효과 */
  totals: SystemEffect[]
}

export interface BandResult {
  perks: PerkResult[]
  leader: string | null
  cookies: CookieBuffs[]
}

/**
 * 전투력 상위·능력치 상위 대상을 고르는 기준. 실제 전투력은 성장에 따라 달라서 알 수 없으므로,
 * 모든 쿠키의 레벨·성장이 같다고 보고 쿠키 도감의 기본 공격력·체력으로 줄을 세운다.
 */
const powerOf = (c: CookieEntry) => c.stats.power ?? c.stats.atk * c.stats.hp

function pickTargets(target: PerkTarget, lineup: CookieEntry[]): CookieEntry[] {
  let pool = target.roles.length ? lineup.filter((c) => target.roles.includes(c.role)) : lineup
  const n = target.count ?? 1
  if (target.select === 'powerTop') pool = [...pool].sort((a, b) => powerOf(b) - powerOf(a)).slice(0, n)
  else if (target.select === 'statTop') pool = [...pool].sort((a, b) => b.stats[target.stat ?? 'atk'] - a.stats[target.stat ?? 'atk']).slice(0, n)
  else if (target.select === 'statBottom') pool = [...pool].sort((a, b) => a.stats[target.stat ?? 'hp'] - b.stats[target.stat ?? 'hp']).slice(0, n)
  return pool
}

const countRole = (lineup: CookieEntry[], role: CookieRole) => lineup.filter((c) => c.role === role).length

export function maxElementCount(lineup: CookieEntry[]): number {
  const count = new Map<string, number>()
  for (const c of lineup) count.set(c.element, (count.get(c.element) ?? 0) + 1)
  return Math.max(0, ...count.values())
}

/** 같은 능력치·같은 방식의 효과를 하나로 더한다. */
export function sumEffects(effects: SystemEffect[]): SystemEffect[] {
  const out = new Map<string, SystemEffect>()
  for (const e of effects) {
    const key = `${e.stat}:${e.how}`
    const prev = out.get(key)
    out.set(key, prev ? { ...prev, value: prev.value + e.value } : { ...e })
  }
  return [...out.values()].filter((e) => e.value !== 0)
}

/**
 * 레벨·고른 특전·편성·리더로 쿠키마다 받는 효과를 구한다.
 * 특전 슬롯보다 많이 고르면 앞에서부터 슬롯 수만큼만 센다. 해금되지 않은 특전은 무시한다.
 */
export function evaluateBand(level: BandLevel, perks: BandPerk[], chosen: number[], lineup: CookieEntry[], leader: string | null): BandResult {
  const buffs = new Map<string, SystemEffect[]>(lineup.map((c) => [c.eid, []]))
  const leaderOk = leader && buffs.has(leader) && level.leader.length ? leader : null
  if (leaderOk) buffs.get(leaderOk)!.push(...level.leader)

  const picked = chosen
    .map((id) => perks.find((p) => p.id === id))
    .filter((p): p is BandPerk => Boolean(p) && p!.unlockedAt <= level.level)
    .slice(0, level.perkSlots)

  const results = picked.map((perk): PerkResult => {
    const c = perk.condition
    const roleCount = c.type === 'roleCount' ? countRole(lineup, c.role) : null
    const active = lineup.length > 0 && (c.type !== 'roleCount' || (roleCount ?? 0) >= c.min)
    const multiplier = c.type === 'elementMaxCount' ? maxElementCount(lineup) : 1
    const targets = active ? pickTargets(perk.target, lineup).map((x) => x.eid) : []
    for (const eid of targets) buffs.get(eid)!.push(...perk.effects.map((e) => ({ ...e, value: e.value * multiplier })))
    return { perk, active, roleCount, multiplier, targets }
  })

  return {
    perks: results,
    leader: leaderOk,
    cookies: lineup.map((c) => ({ eid: c.eid, totals: sumEffects(buffs.get(c.eid) ?? []) })),
  }
}

/** 편성 최대 인원(국내 공략: 마지막 12번째 슬롯은 스테이지 13-30에서 열린다) */
export const LINEUP_MAX = 12
