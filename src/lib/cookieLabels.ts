import type { CookieEffect, CookieElement, CookieRole, Locale, SynergyKey } from '../types'

/**
 * 쿠키 도감에 쓰는 이름표. 국내 인게임 표기를 쓴다.
 * - 시너지: 국내 시너지 도감(설탕노움의 비밀창고)
 * - 효과·능력치: 국내 인게임 스킬 설명(cookieruncrumble.net 한국어 쿠키 페이지, 나무위키 크럼블 항목)과 대조
 *   예) 띄우기 저항·밀어내기 저항·띄우기/밀치기 면역·받는 회복량 감소·명중률·회피율·보스피해·길드 토벌전
 */
type Labels = Record<Locale, string>
const L = (ko: string, en: string, ja: string): Labels => ({ ko, en, ja })

export const SYNERGY: Record<SynergyKey, Labels> = {
  area: L('범위', 'Range', '範囲'),
  dur: L('지속', 'Duration', '持続'),
  burst: L('다발', 'Volley', '多発'),
  speed: L('탄속', 'Projectile Speed', '弾速'),
  hit: L('연타', 'Rapid Fire', '連打'),
  pierce: L('관통', 'Pierce', '貫通'),
  chain: L('연쇄', 'Chain', '連鎖'),
}
export const SYNERGY_ORDER: SynergyKey[] = ['area', 'dur', 'burst', 'speed', 'hit', 'pierce', 'chain']

export const ROLE: Record<CookieRole, Labels> = {
  charge: L('돌격', 'Charge', '突撃'),
  tank: L('방어', 'Defense', '防御'),
  support: L('지원', 'Support', '支援'),
  ranged: L('사격', 'Ranged', '射撃'),
}
export const ROLE_ORDER: CookieRole[] = ['charge', 'tank', 'support', 'ranged']

export const ELEMENT: Record<CookieElement, Labels> = {
  fire: L('불속성', 'Fire', '火属性'),
  water: L('물속성', 'Water', '水属性'),
  grass: L('풀속성', 'Grass', '草属性'),
  light: L('빛속성', 'Light', '光属性'),
  dark: L('어둠속성', 'Dark', '闇属性'),
}
export const ELEMENT_ORDER: CookieElement[] = ['fire', 'water', 'grass', 'light', 'dark']

export const RARITY_ORDER = ['TSSR', 'SSR', 'SR', 'R', 'U', 'C']

const STAT: Record<string, Labels> = {
  atk: L('공격력', 'ATK', '攻撃力'),
  def: L('방어력', 'DEF', '防御力'),
  hp: L('체력', 'HP', 'HP'),
  critRate: L('치명확률', 'CRIT Rate', '会心率'),
  critDamage: L('치명피해', 'CRIT DMG', '会心ダメージ'),
  skillAmp: L('스킬증폭', 'Skill AMP', 'スキル増幅'),
  // 스킬 효과로 바뀌는 것은 명중·회피 수치가 아니라 명중률·회피율이다(인게임 스킬 설명 표기).
  accuracy: L('명중률', 'Accuracy rate', '命中率'),
  avoidance: L('회피율', 'Avoidance rate', '回避率'),
  moveSpeed: L('이동 속도', 'Move Speed', '移動速度'),
  bossDamage: L('보스피해', 'Boss DMG', 'ボスダメージ'),
  damageTaken: L('받는 피해', 'Damage taken', '被ダメージ'),
}

const KIND: Record<string, Labels> = {
  stun: L('기절', 'Stun', '気絶'),
  dot: L('지속 피해', 'Damage over time', '継続ダメージ'),
  transform: L('변이', 'Transform', '変異'),
  transformSelf: L('변신', 'Transform', '変身'),
  shield: L('보호막', 'Shield', 'シールド'),
  liftResist: L('띄우기 저항', 'Lift RES', '浮かし耐性'),
  pushResist: L('밀어내기 저항', 'Push RES', '押し出し耐性'),
  liftImmune: L('띄우기 면역', 'Lift immunity', '浮かし免疫'),
  pushImmune: L('밀치기 면역', 'Push immunity', '押し出し免疫'),
  healReduction: L('받는 회복량 감소', 'Healing received down', '被回復量減少'),
  // 아래 두 가지는 인게임 스킬 설명에 따로 적힌 표기를 찾지 못해 일반 표현을 쓴다.
  scale: L('크기 증가', 'Size up', 'サイズ増加'),
  spawner: L('소환', 'Summon', '召喚'),
}

const TARGET: Record<CookieEffect['target'], Labels> = {
  self: L('자신', 'Self', '自分'),
  ally: L('아군', 'Ally', '味方'),
  allies: L('아군들', 'Allies', '味方たち'),
  enemy: L('적', 'Enemy', '敵'),
  enemies: L('적들', 'Enemies', '敵たち'),
}

export const TARGETING: Record<string, Labels> = {
  EnemyWithMinDistance: L('가장 가까운 적', 'Nearest enemy', '最も近い敵'),
  EnemyWithMaxDensity: L('적이 가장 많이 모인 곳', 'Densest group of enemies', '敵が最も密集した場所'),
  AllyWithMaxDamaged: L('체력을 가장 많이 잃은 아군', 'Most injured ally', '最もHPを失った味方'),
  EnemyWithMaxAttackPoint: L('공격력이 가장 높은 적', 'Highest-ATK enemy', '攻撃力が最も高い敵'),
  EnemyWithMaxHealth: L('체력이 가장 높은 적', 'Highest-HP enemy', 'HPが最も高い敵'),
}

const MODE: Record<string, Labels> = {
  GUILD_RAID: L('길드 토벌전', 'Guild Raid', 'ギルド討伐戦'),
}

export const label = (table: Record<string, Labels>, key: string, locale: Locale): string => table[key]?.[locale] ?? key

/** 0.65 → "65%", 0.075 → "7.5%" */
export const pct = (fraction: number): string => `${Number((fraction * 100).toFixed(2))}%`
const seconds = (value: number, locale: Locale) => (locale === 'ko' ? `${value}초` : locale === 'ja' ? `${value}秒` : `${value}s`)
const signed = (fraction: number) => `${fraction >= 0 ? '+' : '−'}${pct(Math.abs(fraction))}`

export interface EffectView {
  /** 버프·디버프·행동 제어 */
  category: CookieEffect['category']
  /** 대상(인원 제한 포함) */
  target: string
  /** 무엇이 어떻게 바뀌는지 */
  what: string
  /** 지속 시간·확률·중첩·조건 */
  details: string[]
}

/** 효과 데이터 한 건을 화면에 보여 줄 문장 조각으로 바꾼다. */
export function describeEffect(effect: CookieEffect, locale: Locale): EffectView {
  const t = (ko: string, en: string, ja: string) => (locale === 'ko' ? ko : locale === 'ja' ? ja : en)
  const value = effect.value ?? 0
  let what: string

  if (effect.kind === 'stat' && effect.property) {
    const name = label(STAT, effect.property, locale)
    if (effect.calcType === 'screen') {
      // 받는 피해를 일정 비율 걸러 낸다(양수면 감소).
      what = t(`${name} ${pct(Math.abs(value))} ${value >= 0 ? '감소' : '증가'}`, `${name} ${value >= 0 ? '−' : '+'}${pct(Math.abs(value))}`, `${name} ${pct(Math.abs(value))}${value >= 0 ? '減少' : '増加'}`)
    } else if (effect.valueBase === 'CastersAttackPoint') {
      what = t(`${name} +시전자 공격력의 ${pct(value)}`, `${name} +${pct(value)} of caster ATK`, `${name} +発動者の攻撃力の${pct(value)}`)
    } else {
      what = `${name} ${signed(value)}`
    }
  } else if (effect.kind === 'synergy' && effect.property) {
    const name = label(SYNERGY, effect.property, locale)
    // 인게임 표기 순서: '연쇄 시너지'
    const synergyName = t(`${name} 시너지`, `${name} Synergy`, `${name}シナジー`)
    what = effect.unit === 'steps' ? `${synergyName} +${value}` : `${synergyName} ${signed(value)}`
  } else if (effect.kind === 'dot') {
    const base = effect.valueBase === 'CastersHealthPoint' ? t('시전자 체력', 'caster HP', '発動者のHP') : t('시전자 공격력', 'caster ATK', '発動者の攻撃力')
    const tick = effect.tickSeconds ? t(` (${effect.tickSeconds}초마다)`, ` every ${effect.tickSeconds}s`, `(${effect.tickSeconds}秒ごと)`) : ''
    what = t(`${label(KIND, 'dot', locale)}: ${base}의 ${pct(value)}${tick}`, `${label(KIND, 'dot', locale)}: ${pct(value)} of ${base}${tick}`, `${label(KIND, 'dot', locale)}: ${base}の${pct(value)}${tick}`)
  } else if (effect.kind === 'shield') {
    const base = effect.valueBase === 'CastersAttackPoint' ? t('시전자 공격력', 'caster ATK', '発動者の攻撃力') : t('시전자 체력', 'caster HP', '発動者のHP')
    what = t(`${label(KIND, 'shield', locale)}: ${base}의 ${pct(value)}`, `${label(KIND, 'shield', locale)}: ${pct(value)} of ${base}`, `${label(KIND, 'shield', locale)}: ${base}の${pct(value)}`)
  } else if (effect.kind === 'liftResist' || effect.kind === 'pushResist') {
    // 100%면 인게임에서 '띄우기와 밀치기 면역'으로 쓴다(바리공주맛 쿠키).
    what = value >= 1 ? label(KIND, effect.kind === 'liftResist' ? 'liftImmune' : 'pushImmune', locale) : `${label(KIND, effect.kind, locale)} +${pct(value)}`
  } else if (effect.kind === 'healReduction') {
    what = `${label(KIND, effect.kind, locale)} ${pct(value)}`
  } else if (effect.kind === 'scale') {
    what = `${label(KIND, effect.kind, locale)} ×${value}`
  } else if (effect.kind === 'transform') {
    // 자신에게 걸면 변신(정글전사 쿠키), 적에게 걸면 변이(도넛행성 에일리언 도넛킹)
    what = label(KIND, effect.target === 'self' ? 'transformSelf' : 'transform', locale)
  } else {
    what = label(KIND, effect.kind, locale)
  }

  const details: string[] = []
  if (effect.lifetime === 'permanent') details.push(t('상시', 'Permanent', '常時'))
  else if (effect.duration) details.push(seconds(effect.duration, locale))
  if (effect.applyRate < 1) details.push(t(`확률 ${pct(effect.applyRate)}`, `${pct(effect.applyRate)} chance`, `確率${pct(effect.applyRate)}`))
  if (effect.maxStack > 1) details.push(t(`최대 ${effect.maxStack}중첩`, `up to ${effect.maxStack} stacks`, `最大${effect.maxStack}スタック`))
  if (effect.scalesWithSkillAmp) details.push(t('스킬증폭 적용', 'scales with Skill AMP', 'スキル増幅適用'))
  if (effect.durationScalesWithDurationSynergy) details.push(t('지속 시너지로 시간 증가', 'Duration Synergy extends it', '持続シナジーで延長'))
  if (effect.onlyIn?.length) details.push(t(`${effect.onlyIn.map((m) => label(MODE, m, locale)).join('·')}에서만`, `${effect.onlyIn.map((m) => label(MODE, m, locale)).join('/')} only`, `${effect.onlyIn.map((m) => label(MODE, m, locale)).join('・')}のみ`))

  // 인원 제한이 있으면 '아군 최대 2명'처럼 단수형에 인원을 붙인다.
  const base = effect.maxTargets ? ({ allies: 'ally', enemies: 'enemy' } as const)[effect.target as 'allies' | 'enemies'] ?? effect.target : effect.target
  let target = label(TARGET, base, locale)
  if (effect.maxTargets === 1 && effect.target !== 'self') target += t(' 1명', ' (1)', '1体')
  else if (effect.maxTargets && effect.target !== 'self') target += t(` 최대 ${effect.maxTargets}명`, ` (up to ${effect.maxTargets})`, `(最大${effect.maxTargets}体)`)
  if (effect.excludeCaster && effect.target !== 'self') target += t(' (자신 제외)', ' (not self)', '(自分を除く)')

  return { category: effect.category, target, what, details }
}
