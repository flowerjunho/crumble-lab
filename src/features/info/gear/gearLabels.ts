import type { Locale } from '../../../types'
import type { GearGroup, GearRarity, GearSlot, GearStat, RuneStat } from './gearTypes'

/**
 * 장비 화면 이름표. 국내 인게임 표기를 쓴다.
 * - 장비 종류·보조 옵션·슈가룬 효과: 데브시스터즈 확률 공시(오븐 뽑기, 슈가룬·플레이트 강화 — sugargnome.com/crc/rates)
 * - 장비 등급·메인 옵션·플레이트 재료(초코강·시럽쇳물)·룬결정: cc.team-hobby.com 오븐·플레이트 강화·슈가룬 화면
 * 일본어 표기는 확인하지 못해 뜻을 옮긴 일반 표현을 쓴다.
 */
type Labels = Record<Locale, string>
const L = (ko: string, en: string, ja: string): Labels => ({ ko, en, ja })

export const GEAR_RARITY: Record<GearRarity, Labels> = {
  common: L('일반', 'Common', '一般'),
  advanced: L('고급', 'Advanced', '高級'),
  excellent: L('우수', 'Excellent', '優秀'),
  magic: L('마법', 'Magic', '魔法'),
  epic: L('에픽', 'Epic', 'エピック'),
  special: L('스페셜', 'Special', 'スペシャル'),
  superEpic: L('슈퍼에픽', 'Super Epic', 'スーパーエピック'),
  unique: L('유니크', 'Unique', 'ユニーク'),
  legendary: L('레전더리', 'Legendary', 'レジェンダリー'),
  eternal: L('이터널', 'Eternal', 'エターナル'),
}

export const GEAR_SLOT: Record<GearSlot, Labels> = {
  sword: L('검', 'Sword', '剣'),
  bow: L('활', 'Bow', '弓'),
  staff: L('지팡이', 'Staff', '杖'),
  helmet: L('투구', 'Helmet', '兜'),
  armor: L('갑옷', 'Armor', '鎧'),
  shield: L('방패', 'Shield', '盾'),
  necklace: L('목걸이', 'Necklace', 'ネックレス'),
  ring: L('반지', 'Ring', '指輪'),
  brooch: L('브로치', 'Brooch', 'ブローチ'),
  artifact: L('마법물체', 'Artifact', '魔法の品'),
  book: L('책', 'Book', '本'),
  food: L('음식', 'Food', '料理'),
}

export const GEAR_GROUP: Record<GearGroup, Labels> = {
  weapon: L('무기', 'Weapons', '武器'),
  armor: L('방어구', 'Armor', '防具'),
  accessoryAtk: L('장신구(공격형)', 'Accessories (offense)', 'アクセサリー(攻撃型)'),
  accessoryDef: L('장신구(방어형)', 'Accessories (defense)', 'アクセサリー(防御型)'),
}
export const GEAR_GROUP_ORDER: GearGroup[] = ['weapon', 'armor', 'accessoryAtk', 'accessoryDef']

export const GEAR_STAT: Record<GearStat, Labels> = {
  atk: L('공격력', 'ATK', '攻撃力'),
  accuracy: L('명중', 'Accuracy', '命中'),
  critRate: L('치명확률', 'CRIT Rate', '会心率'),
  critDamage: L('치명피해', 'CRIT DMG', '会心ダメージ'),
  skillAmp: L('스킬증폭', 'Skill AMP', 'スキル増幅'),
  def: L('방어력', 'DEF', '防御力'),
  hp: L('체력', 'HP', 'HP'),
  avoidance: L('회피', 'Evasion', '回避'),
  critResist: L('치명저항', 'CRIT RES', '会心耐性'),
  damageReduction: L('피해감소', 'DMG Reduction', '被ダメージ減少'),
  focus: L('집중', 'Focus', '集中'),
  resist: L('저항', 'Resist', '抵抗'),
  haste: L('스킬가속', 'Skill Haste', 'スキル加速'),
  moveSpeed: L('이동속도', 'Move Speed', '移動速度'),
}
/** 장비에서 %로 붙는 스탯. 나머지는 정수(이동속도는 소수) 수치다. */
export const GEAR_PERCENT_STATS = new Set<GearStat>(['critRate', 'critDamage', 'skillAmp', 'critResist', 'damageReduction'])

export const RUNE_STAT: Record<RuneStat | 'haste', Labels> = {
  atkAmp: L('공격력 증폭', 'ATK Amplification', '攻撃力増幅'),
  defAmp: L('방어력 증폭', 'DEF Amplification', '防御力増幅'),
  hpAmp: L('체력 증폭', 'HP Amplification', 'HP増幅'),
  critRate: L('치명확률 증가', 'CRIT Rate', '会心率増加'),
  critResist: L('치명저항 증가', 'CRIT RES', '会心耐性増加'),
  critDamage: L('치명피해 증가', 'CRIT DMG', '会心ダメージ増加'),
  accuracyRate: L('명중률 증가', 'Accuracy Rate', '命中率増加'),
  avoidanceRate: L('회피율 증가', 'Evasion Rate', '回避率増加'),
  focusRate: L('집중확률 증가', 'Focus Rate', '集中確率増加'),
  resistRate: L('저항확률 증가', 'Resistance Rate', '抵抗確率増加'),
  skillAmp: L('스킬증폭 증가', 'Skill Amplification', 'スキル増幅増加'),
  damageReduction: L('피해 감소', 'DMG Reduction', '被ダメージ減少'),
  moveSpeed: L('이동속도 증가', 'Movement Speed', '移動速度増加'),
  haste: L('스킬가속 증가', 'Skill Haste', 'スキル加速増加'),
}
export const RUNE_STAT_ORDER: RuneStat[] = [
  'atkAmp',
  'defAmp',
  'hpAmp',
  'critRate',
  'critResist',
  'critDamage',
  'accuracyRate',
  'avoidanceRate',
  'focusRate',
  'resistRate',
  'skillAmp',
  'damageReduction',
  'moveSpeed',
]

export const label = <K extends string>(table: Record<K, Labels>, key: K, locale: Locale): string => table[key][locale]

/** 소수 자릿수가 흔들리지 않게 최대 digits자리까지만 보여 준다. 1234.5 → "1,234.5" */
export const num = (value: number, locale: Locale, digits = 2): string => value.toLocaleString(locale, { maximumFractionDigits: digits })

/** 장비 스탯 수치를 단위와 함께: 치명확률 4.8 → "4.8%", 공격력 131 → "131" */
export const gearValue = (stat: GearStat, value: number, locale: Locale): string =>
  `${num(value, locale)}${GEAR_PERCENT_STATS.has(stat) ? '%' : ''}`

/** 확률(1 = 100%)을 퍼센트로. 0.005 → "0.5%" */
export const ratio = (value: number, locale: Locale): string => `${num(value * 100, locale, 3)}%`
