import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

type Label = readonly [ko: string, en: string, ja: string]

export interface InfoTab {
  /** /info 아래 경로 */
  path: string
  label: Label
  /** 도감 두 개를 뺀 화면은 처음 열 때 불러온다(첫 화면 번들을 가볍게 유지). */
  page?: LazyExoticComponent<ComponentType>
}

export interface InfoTabGroup {
  label: Label
  tabs: InfoTab[]
}

const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })))

/**
 * 크럼블 정보 탭의 서브탭 목록. 메뉴와 라우트가 모두 이 목록을 따른다.
 * 쿠키·펫 도감은 App.tsx에서 상세 라우트와 함께 직접 연결한다.
 */
export const INFO_TAB_GROUPS: InfoTabGroup[] = [
  {
    label: ['도감', 'Index', '図鑑'],
    tabs: [
      { path: 'cookies', label: ['쿠키 도감', 'Cookie index', 'クッキー図鑑'] },
      { path: 'pets', label: ['펫 도감', 'Pet index', 'ペット図鑑'] },
      { path: 'stages', label: ['스테이지 정보', 'Stage info', 'ステージ情報'], page: page(() => import('./stages/StageInfoPage'), 'StageInfoPage') },
      { path: 'dimension', label: ['차원의 이면', 'Dimension', '次元の裏側'], page: page(() => import('./dimension/DimensionInfoPage'), 'DimensionInfoPage') },
    ],
  },
  {
    label: ['성장·계산', 'Growth & calculators', '育成・計算'],
    tabs: [
      { path: 'growth', label: ['성장', 'Growth', '育成'], page: page(() => import('./growth/GrowthPage'), 'GrowthPage') },
      { path: 'runes', label: ['슈가룬 재조합', 'Sugar Rune reroll', 'シュガールーン再組み合わせ'], page: page(() => import('./runes/RuneCraftPage'), 'RuneCraftPage') },
      { path: 'gear', label: ['장비', 'Gear', '装備'], page: page(() => import('./gear/GearPage'), 'GearPage') },
      { path: 'resolve', label: ['돌파력', 'Resolve', '突破力'], page: page(() => import('./systems/ResolvePage'), 'ResolvePage') },
      { path: 'mercenary', label: ['용병단', 'Mercenary Band', '傭兵団'], page: page(() => import('./systems/MercenaryPage'), 'MercenaryPage') },
      { path: 'stellar', label: ['스텔라 링크', 'Stellar Link', 'ステラリンク'], page: page(() => import('./systems/StellarLinkPage'), 'StellarLinkPage') },
      { path: 'packages', label: ['패키지 가치', 'Package value', 'パッケージ価値'], page: page(() => import('./systems/PackageValuePage'), 'PackageValuePage') },
    ],
  },
  {
    label: ['계산기·시뮬레이터', 'Calculators & sims', '計算機・シミュレーター'],
    tabs: [
      { path: 'damage', label: ['피해 계산기', 'Damage calculator', 'ダメージ計算機'], page: page(() => import('./calc/DamageCalcPage'), 'DamageCalcPage') },
      { path: 'compare', label: ['능력치 비교', 'Stat comparison', 'ステータス比較'], page: page(() => import('./calc/StatComparePage'), 'StatComparePage') },
      { path: 'builds', label: ['빌드 메이커', 'Build maker', 'ビルドメーカー'], page: page(() => import('./calc/BuildMakerPage'), 'BuildMakerPage') },
      { path: 'battle', label: ['전투 시뮬레이터', 'Battle simulator', '戦闘シミュレーター'], page: page(() => import('./sim/BattleSimPage'), 'BattleSimPage') },
      { path: 'dungeon', label: ['던전 시뮬레이터', 'Dungeon simulator', 'ダンジョンシミュレーター'], page: page(() => import('./sim/DungeonSimPage'), 'DungeonSimPage') },
      { path: 'gacha', label: ['뽑기 시뮬레이터', 'Gacha simulator', 'ガチャシミュレーター'], page: page(() => import('./gacha/GachaPage'), 'GachaPage') },
    ],
  },
  {
    label: ['분석', 'Analysis', '分析'],
    tabs: [
      { path: 'overview', label: ['개요', 'Overview', '概要'], page: page(() => import('./analysis/OverviewPage'), 'OverviewPage') },
      { path: 'tiers', label: ['티어', 'Tiers', 'ティア'], page: page(() => import('./analysis/TierPage'), 'TierPage') },
      { path: 'teams', label: ['추천 편성', 'Suggested teams', 'おすすめ編成'], page: page(() => import('./analysis/TeamsPage'), 'TeamsPage') },
      { path: 'updates', label: ['업데이트 일정', 'Update schedule', 'アップデート日程'], page: page(() => import('./analysis/UpdatesPage'), 'UpdatesPage') },
    ],
  },
]

export const INFO_TABS = INFO_TAB_GROUPS.flatMap((group) => group.tabs)
