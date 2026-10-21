import type { Locale } from '../../../types'
import type { FactorKey, Loadout } from './damage'

/**
 * 계산기 화면 이름표. 한국어는 국내 인게임 표기를 쓴다.
 * - 슈가룬 옵션: 공격력 증폭·스킬증폭·스킬가속·치명확률·치명피해(쿠키 도감 추천 슈가룬 표기, cookies.json)
 * - 보스피해·피해감소·치명저항·명중·명중률·회피·회피율: 펫 배틀 패시브 문구(src/lib/petLabels.ts)
 * - 속성피해: 국내 데이터 위키(cc.team-hobby.com) 연구 항목 표기(src/features/info/systems/mercenary.ts와 같다)
 */
type Labels = Record<Locale, string>
const L = (ko: string, en: string, ja: string): Labels => ({ ko, en, ja })

export const LOADOUT_LABEL: Record<keyof Loadout, Labels> = {
  atkPct: L('공격력 증폭(%)', 'ATK Amplification (%)', '攻撃力増幅(%)'),
  atkFlat: L('공격력(수치)', 'ATK (flat)', '攻撃力(数値)'),
  critRate: L('치명확률(%)', 'CRIT Rate (%)', '会心率(%)'),
  critDamage: L('치명피해(%)', 'CRIT DMG (%)', '会心ダメージ(%)'),
  skillAmp: L('스킬증폭(%)', 'Skill AMP (%)', 'スキル増幅(%)'),
  haste: L('스킬가속', 'Skill Haste', 'スキル加速'),
  bossDamage: L('보스피해(%)', 'Boss DMG (%)', 'ボスダメージ(%)'),
  elementDamage: L('속성피해(%)', 'Elemental DMG (%)', '属性ダメージ(%)'),
  accuracy: L('명중', 'Accuracy', '命中'),
  accuracyRate: L('명중률(%)', 'Accuracy rate (%)', '命中率(%)'),
}

/** 화면에 보여 주는 슈가룬 입력 순서(자주 쓰는 것부터) */
export const LOADOUT_ORDER: (keyof Loadout)[] = ['atkPct', 'critRate', 'critDamage', 'skillAmp', 'haste', 'bossDamage', 'elementDamage', 'atkFlat', 'accuracy', 'accuracyRate']

export const FACTOR_LABEL: Record<FactorKey, Labels> = {
  amp: L('스킬증폭', 'Skill AMP', 'スキル増幅'),
  crit: L('치명(기대값)', 'CRIT (expected)', '会心(期待値)'),
  boss: L('보스피해', 'Boss DMG', 'ボスダメージ'),
  def: L('대상 방어력', 'Target DEF', '対象の防御力'),
  element: L('속성 상성', 'Element advantage', '属性相性'),
  dr: L('대상 피해감소', 'Target DMG reduction', '対象のダメージ減少'),
  power: L('전투력 배율', 'Power bracket', '戦闘力倍率'),
  hit: L('적중률', 'Hit chance', '命中確率'),
}

/** 배율이 어떻게 정해지는지 한 줄 설명(우리 말로 쓴 것) */
export const FACTOR_NOTE: Record<FactorKey, Labels> = {
  amp: L('1 + 스킬증폭', '1 + Skill AMP', '1 + スキル増幅'),
  crit: L('1 + 기대 치명 횟수 × 치명피해. 100%를 넘는 치명확률은 한 번에 여러 번 치명이 터지는 것으로 계산합니다.', '1 + expected crits × CRIT DMG. CRIT Rate above 100% means more than one crit per hit.', '1 + 期待会心回数 × 会心ダメージ。100%を超える会心率は1回に複数回の会心として計算します。'),
  boss: L('대상이 보스일 때만 1 + 보스피해', '1 + Boss DMG, bosses only', 'ボスのみ 1 + ボスダメージ'),
  def: L('1 / (1 + ln(1 + 방어력 ÷ 500))', '1 / (1 + ln(1 + DEF ÷ 500))', '1 / (1 + ln(1 + 防御力 ÷ 500))'),
  element: L('내 속성이 유리하면 1 + 15% + 속성피해', '1 + 15% + Elemental DMG when you have the advantage', '有利なら 1 + 15% + 属性ダメージ'),
  dr: L('1 − 피해감소', '1 − DMG reduction', '1 − ダメージ減少'),
  power: L('권장 전투력 대비 피해 구간', 'Damage band vs. recommended Power', '推奨戦闘力に対するダメージ区間'),
  hit: L('명중 ÷ 회피 + 명중률 − 회피율(최대 100%)', 'Accuracy ÷ Avoidance + rate bonuses (max 100%)', '命中 ÷ 回避 + 命中率 − 回避率(最大100%)'),
}

export const BOUND_LABEL = {
  min: L('한 대상만 맞을 때', 'Single target', '単体のみ'),
  max: L('모두 같은 대상에 맞을 때', 'Everything lands', 'すべて命中'),
}

export const PET_STATUS_LABEL = {
  active: L('적용', 'Applied', '適用'),
  target: L('대상 아님', 'Not a target', '対象外'),
  mode: L('이 모드에서 효과 없음', 'Inactive in this mode', 'このモードでは無効'),
  weaker: L('같은 종류의 더 강한 펫이 우선', 'Outranked by a stronger Pet of the same kind', '同じ系統のより強いペットが優先'),
}

export const label = (table: Record<string, Labels>, key: string, locale: Locale): string => table[key]?.[locale] ?? key
