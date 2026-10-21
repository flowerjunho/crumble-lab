import { NavLink } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { stagesQuery } from '../../../api/queries'
import { pick, useI18n } from '../../../i18n'
import { ELEMENT, ELEMENT_ORDER, RARITY_ORDER, ROLE, ROLE_ORDER, SYNERGY, SYNERGY_ORDER, label } from '../../../lib/cookieLabels'
import { ROUTES } from '../../../routes'
import type { CookieElement, Locale } from '../../../types'
import { INFO_TAB_GROUPS } from '../infoTabs'
import { Intro, LoadState, useAnalysisData, type AnalysisData } from './common'
import { TEAM_SIZE } from './model'

/** 속성 상성: 왼쪽이 오른쪽에게 우위. 국내 데이터 위키(cc.team-hobby.com ?p=formulas 속성 상성 탭)와 같다. */
const ADVANTAGE: [CookieElement, CookieElement][] = [
  ['fire', 'grass'],
  ['grass', 'water'],
  ['water', 'fire'],
  ['light', 'dark'],
  ['dark', 'light'],
]
const ADVANTAGE_BONUS = 0.15

export function OverviewPage() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const { data, isPending, isError, refetch } = useAnalysisData()
  const stages = useQuery(stagesQuery)
  if (!data) return <LoadState isPending={isPending && !isError} onRetry={refetch} />
  const maxChapter = stages.data?._meta.maxChapter

  return (
    <div className="analysis">
      <Intro title={l('개요', 'Overview', '概要')}>
        {l(
          '쿠키런: 크럼블의 현재 콘텐츠 규모와 기본 규칙을 우리 데이터로 집계했습니다.',
          'The current size of CookieRun: Crumble and its core rules, counted from our data.',
          'クッキーラン：クランブルの現在のコンテンツ規模と基本ルールを当サイトのデータで集計しました。',
        )}
      </Intro>

      <section className="panel">
        <h3>{l('한눈에 보기', 'At a glance', 'ひと目で')}</h3>
        <dl className="detail-stats">
          <div>
            <dt>{l('쿠키', 'Cookies', 'クッキー')}</dt>
            <dd>{l(`${data.cookies.length}종`, `${data.cookies.length}`, `${data.cookies.length}種`)}</dd>
          </div>
          <div>
            <dt>{l('펫', 'Pets', 'ペット')}</dt>
            <dd>{l(`${data.pets.length}종`, `${data.pets.length}`, `${data.pets.length}種`)}</dd>
          </div>
          <div>
            <dt>{l('메인 스테이지', 'Main stages', 'メインステージ')}</dt>
            <dd>{maxChapter ? `${maxChapter}-30` : '…'}</dd>
          </div>
          <div>
            <dt>{l('쿠키 최대 레벨', 'Cookie level cap', 'クッキー最大レベル')}</dt>
            <dd>{data.growth.maxLevel}</dd>
          </div>
          <div>
            <dt>{l('최대 별', 'Max stars', '最大星')}</dt>
            <dd>{`${data.growth.maxGrade}★`}</dd>
          </div>
          <div>
            <dt>{l('편성 인원', 'Lineup size', '編成人数')}</dt>
            <dd>{l(`${TEAM_SIZE}명`, `${TEAM_SIZE}`, `${TEAM_SIZE}体`)}</dd>
          </div>
        </dl>
      </section>

      <CookieCounts data={data} locale={locale} />
      <PetCounts data={data} locale={locale} />
      <SynergyTable data={data} locale={locale} />

      <section className="panel">
        <h3>{l('속성 상성', 'Element advantage', '属性相性')}</h3>
        <p className="subtle">
          {l(
            `불은 풀에, 풀은 물에, 물은 불에 우위이고 빛과 어둠은 서로에게 우위입니다. 우위일 때 피해가 ${ADVANTAGE_BONUS * 100}% 늘고(속성피해 능력치는 여기에 더해집니다), 열위라고 해서 피해가 깎이지는 않습니다.`,
            `Fire beats Grass, Grass beats Water, Water beats Fire, and Light and Dark each beat the other. Advantage adds ${ADVANTAGE_BONUS * 100}% damage (Elemental DMG stacks on top); disadvantage costs nothing.`,
            `火は草に、草は水に、水は火に有利で、光と闇は互いに有利です。有利なとき与ダメージが${ADVANTAGE_BONUS * 100}%増え(属性ダメージはこれに加算)、不利でもダメージは減りません。`,
          )}
        </p>
        <ul className="analysis-advantage">
          {ADVANTAGE.map(([a, b]) => (
            <li key={`${a}-${b}`}>
              <span className={`analysis-el analysis-el-${a}`}>{label(ELEMENT, a, locale)}</span> → <span className={`analysis-el analysis-el-${b}`}>{label(ELEMENT, b, locale)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h3>{l('콘텐츠', 'Modes', 'コンテンツ')}</h3>
        <ul className="analysis-modes">
          <li>
            <strong>{l('메인 스테이지', 'Main stages', 'メインステージ')}</strong>
            <span>{l('챕터마다 30스테이지가 있고 권장 전투력보다 전투력이 낮으면 주는 피해가 크게 줄어듭니다.', 'Each chapter has 30 stages; falling below the recommended Power sharply cuts your damage.', '各チャプターは30ステージで、推奨戦闘力を下回ると与ダメージが大きく下がります。')}</span>
          </li>
          <li>
            <strong>{l('차원의 이면', 'Dimension', '次元の裏側')}</strong>
            <span>{l('2주마다 시즌이 바뀌는 단계형 도전 콘텐츠입니다.', 'A tiered challenge whose season changes every two weeks.', '2週間ごとにシーズンが変わる段階制の挑戦コンテンツです。')}</span>
          </li>
          <li>
            <strong>{l('아레나', 'Arena', 'アリーナ')}</strong>
            <span>{l('다른 유저의 편성과 겨루는 시즌제 대전입니다.', 'Seasonal battles against other players’ lineups.', '他のユーザーの編成と戦うシーズン制の対戦です。')}</span>
          </li>
          <li>
            <strong>{l('와글와글 아레나', 'Rumble Arena', 'わいわいアリーナ')}</strong>
            <span>{l('1.4 업데이트에서 열린 또 하나의 시즌제 아레나입니다.', 'A second seasonal arena, opened in v1.4.', '1.4アップデートで開かれたもう一つのシーズン制アリーナです。')}</span>
          </li>
          <li>
            <strong>{l('길드 토벌전', 'Guild Raid', 'ギルド討伐戦')}</strong>
            <span>{l(`제한 시간 안에 보스 하나에게 준 피해량으로 겨루는 길드 콘텐츠로, 매주 새로 열립니다.`, 'A weekly guild mode scored by damage dealt to one boss within a time limit.', '制限時間内にボス1体へ与えたダメージで競うギルドコンテンツで、毎週開かれます。')}</span>
          </li>
          <li>
            <strong>{l('던전·임플란트 타워', 'Dungeons & Implant Tower', 'ダンジョン・インプラントタワー')}</strong>
            <span>{l('국내 데이터 위키에서 한 묶음으로 다루는 콘텐츠입니다. 우리 사이트에는 아직 정리하지 않았습니다.', 'Grouped together on the Korean data wiki; not covered on this site yet.', '韓国のデータWikiで一緒に扱われるコンテンツです。当サイトではまだ扱っていません。')}</span>
          </li>
        </ul>
      </section>

      <section className="panel">
        <h3>{l('크럼블 정보 메뉴', 'Crumble info menu', 'クランブル情報メニュー')}</h3>
        {INFO_TAB_GROUPS.map((group) => (
          <div key={group.label[0]} className="analysis-links">
            <h4 className="analysis-subhead">{pick(locale, ...group.label)}</h4>
            <ul>
              {group.tabs.map((tab) => (
                <li key={tab.path}>
                  <NavLink to={`${ROUTES.info}/${tab.path}`}>{pick(locale, ...tab.label)}</NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  )
}

function CookieCounts({ data, locale }: { data: AnalysisData; locale: Locale }) {
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const rarities = RARITY_ORDER.filter((r) => data.cookies.some((c) => c.rarity === r))
  const count = (f: (c: AnalysisData['cookies'][number]) => boolean) => data.cookies.filter(f).length
  return (
    <section className="panel">
      <h3>{l('쿠키 구성', 'Cookie roster', 'クッキー構成')}</h3>
      <div className="table-scroll">
        <table className="detail-table analysis-table">
          <caption className="subtle">{l('등급별 직업 수', 'Classes by rarity', 'レア度別の職業数')}</caption>
          <thead>
            <tr>
              <th scope="col">{l('등급', 'Rarity', 'レア度')}</th>
              {ROLE_ORDER.map((r) => (
                <th scope="col" key={r}>
                  {label(ROLE, r, locale)}
                </th>
              ))}
              <th scope="col">{l('합계', 'Total', '合計')}</th>
            </tr>
          </thead>
          <tbody>
            {rarities.map((rarity) => (
              <tr key={rarity}>
                <th scope="row">
                  <span className={`rarity-badge rarity-${rarity.toLowerCase()}`}>{rarity}</span>
                </th>
                {ROLE_ORDER.map((r) => (
                  <td key={r}>{count((c) => c.rarity === rarity && c.role === r) || '–'}</td>
                ))}
                <td>{count((c) => c.rarity === rarity)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">{l('합계', 'Total', '合計')}</th>
              {ROLE_ORDER.map((r) => (
                <td key={r}>{count((c) => c.role === r)}</td>
              ))}
              <td>{data.cookies.length}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="field-note">
        {ELEMENT_ORDER.map((e) => l(`${label(ELEMENT, e, locale)} ${count((c) => c.element === e)}종`, `${label(ELEMENT, e, locale)} ${count((c) => c.element === e)}`, `${label(ELEMENT, e, locale)}${count((c) => c.element === e)}種`)).join(' · ')}
      </p>
    </section>
  )
}

function PetCounts({ data, locale }: { data: AnalysisData; locale: Locale }) {
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const rarities = RARITY_ORDER.filter((r) => data.pets.some((p) => p.rarity === r))
  const kinds = [
    { text: l('아군 전체', 'All allies', '味方全体'), n: data.pets.filter((p) => !p.target.elements.length && !p.target.roles.length && !p.target.receivesSynergy).length },
    { text: l('특정 속성', 'One element', '特定属性'), n: data.pets.filter((p) => p.target.elements.length > 0).length },
    { text: l('특정 직업', 'One class', '特定職業'), n: data.pets.filter((p) => p.target.roles.length > 0).length },
    { text: l('시너지를 받는 쿠키', 'Synergy receivers', 'シナジーを受けるクッキー'), n: data.pets.filter((p) => p.target.receivesSynergy).length },
  ]
  return (
    <section className="panel">
      <h3>{l('펫 구성', 'Pet roster', 'ペット構成')}</h3>
      <dl className="detail-stats">
        {rarities.map((r) => (
          <div key={r}>
            <dt>
              <span className={`rarity-badge rarity-${r.toLowerCase()}`}>{r}</span>
            </dt>
            <dd>{l(`${data.pets.filter((p) => p.rarity === r).length}종`, `${data.pets.filter((p) => p.rarity === r).length}`, `${data.pets.filter((p) => p.rarity === r).length}種`)}</dd>
          </div>
        ))}
      </dl>
      <p className="field-note">
        {l('효과 대상', 'Effect target', '効果対象')}: {kinds.map((k) => l(`${k.text} ${k.n}종`, `${k.text} ${k.n}`, `${k.text}${k.n}種`)).join(' · ')}
      </p>
    </section>
  )
}

function SynergyTable({ data, locale }: { data: AnalysisData; locale: Locale }) {
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const providers = (key: string) => data.cookies.filter((c) => c.effects.some((e) => e.kind === 'synergy' && e.property === key && e.target !== 'self' && e.target !== 'enemy' && e.target !== 'enemies')).length
  return (
    <section className="panel">
      <h3>{l('시너지', 'Synergy', 'シナジー')}</h3>
      <p className="subtle">
        {l(
          '쿠키마다 받는 시너지가 정해져 있고 일부 쿠키의 스킬과 펫이 그 시너지를 채워 줍니다. 받는 쿠키가 많고 주는 쪽이 적은 시너지일수록 공급원의 값어치가 큽니다.',
          'Each Cookie receives certain Synergies, which some Cookies’ skills and Pets supply. The more receivers and the fewer suppliers, the more a supplier is worth.',
          'クッキーごとに受けるシナジーが決まっており、一部のクッキーのスキルとペットがそれを満たします。受ける側が多く与える側が少ないシナジーほど供給役の価値が高くなります。',
        )}
      </p>
      <div className="table-scroll">
        <table className="detail-table analysis-table">
          <thead>
            <tr>
              <th scope="col">{l('시너지', 'Synergy', 'シナジー')}</th>
              <th scope="col">{l('받는 쿠키', 'Receivers', '受けるクッキー')}</th>
              <th scope="col">{l('주는 쿠키', 'Cookie suppliers', '与えるクッキー')}</th>
              <th scope="col">{l('강화하는 펫', 'Boosting Pets', '強化ペット')}</th>
            </tr>
          </thead>
          <tbody>
            {SYNERGY_ORDER.map((key) => (
              <tr key={key}>
                <th scope="row">{label(SYNERGY, key, locale)}</th>
                <td>{data.cookies.filter((c) => c.synergy.receives.includes(key)).length}</td>
                <td>{providers(key)}</td>
                <td>{data.pets.filter((p) => p.tiers.some((t) => t.synergy.some((s) => s.key === key))).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
