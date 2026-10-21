import type { Locale } from '../../../types'
import type { StrikeLabel } from './engine'

/**
 * 시뮬레이터 이름표. 한국어는 국내 인게임 표기를 쓴다.
 * - 크럼블 던전·황금갓방울·황금병사방울·황금법사방울·황금골렘방울, 길드 토벌전·지나치게 무거워진 피냐타:
 *   국내 데이터 위키(cc.team-hobby.com ?p=dungeon, ?p=guildraid, ?p=monsters) 표기
 * - 보스 공격 이름과 피냐타가 부르는 적은 인게임 이름을 찾지 못해 모양을 설명하는 일반 표현을 쓴다.
 */
type Labels = Record<Locale, string>
const L = (ko: string, en: string, ja: string): Labels => ({ ko, en, ja })

export const SIM_NAME = {
  dungeon: L('크럼블 던전', 'Crumble Dungeon', 'クランブルダンジョン'),
  dungeonBoss: L('황금갓방울', 'Holy Golden Drop', '黄金ゴッドドロップ'),
  guild: L('길드 토벌전', 'Guild Raid', 'ギルド討伐戦'),
  guildBoss: L('지나치게 무거워진 피냐타', 'Extra-Stuffed Piñata', '重すぎるピニャータ'),
  stage: L('메인 스테이지', 'Main stage', 'メインステージ'),
}

/** 황금 방울 종류 */
export const ADD_NAME: Record<string, Labels> = {
  soldier: L('황금병사방울', 'Golden Soldier Drop', '黄金兵士ドロップ'),
  mage: L('황금법사방울', 'Golden Mage Drop', '黄金魔法使いドロップ'),
  golem: L('황금골렘방울', 'Golden Golem Drop', '黄金ゴーレムドロップ'),
  pinata: L('피냐타가 부른 적', 'Piñata minion', 'ピニャータの手下'),
}

export const STRIKE_NAME: Record<StrikeLabel | 'add', Labels> = {
  basic: L('보스 기본 공격(가정)', 'Boss basic attack (assumed)', 'ボス通常攻撃(仮定)'),
  spiral: L('회전 탄막', 'Spiral volley', '回転弾幕'),
  lightning: L('번개', 'Lightning', '落雷'),
  shockwave: L('전체 충격파', 'Shockwave', '全体衝撃波'),
  gift: L('무작위 낙하 공격', 'Random drop', 'ランダム落下攻撃'),
  wave: L('전체 공격', 'Arena wave', '全体攻撃'),
  blast: L('보스 주변 폭발', 'Blast around the boss', 'ボス周辺の爆発'),
  add: L('소환된 적', 'Summoned enemy', '召喚された敵'),
}

export const label = (table: Record<string, Labels>, key: string, locale: Locale): string => table[key]?.[locale] ?? key
