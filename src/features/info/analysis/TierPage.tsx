import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { pick, useI18n } from '../../../i18n'
import { ROLE, ROLE_ORDER, SYNERGY, label, pct } from '../../../lib/cookieLabels'
import { localizedText } from '../../../lib/localize'
import type { CookieRole, Locale } from '../../../types'
import { runeCraftQuery, statLabel } from '../runes/runeCraft'
import { BuildPicker, ChipRow, CookieCell, Intro, LoadState, Method, PetCell, TierBadge, fmtInt, plusPct, useAnalysisData, type AnalysisData } from './common'
import { CROWD_TARGETS, areaShare, type Scenario } from './dps'
import {
  DEFAULT_BUILD,
  REF_ENEMY_DEF,
  TEAM_SIZE,
  TIER_CUTOFFS,
  cookieMetrics,
  rankBy,
  referenceAttacker,
  referenceDef,
  runePriority,
  supportScore,
  synergySupply,
  type RefBuild,
  type RuneDpsStat,
} from './model'
import { TEAM_PRESETS, isModePet, runPreset } from './presets'

type View = 'dealer' | 'support' | 'synergy' | 'pet' | 'rune'
const VIEWS: View[] = ['dealer', 'support', 'synergy', 'pet', 'rune']

/** 등급 기준 문장: '상위 10%는 S, 30%까지 A, …' */
function cutoffText(locale: Locale): string {
  const [s, a, b] = TIER_CUTOFFS.map(([, cut]) => Math.round(cut * 100))
  return pick(
    locale,
    `점수가 0보다 큰 항목만 줄을 세워 상위 ${s}%까지 S, ${a}%까지 A, ${b}%까지 B, 나머지를 C로 나눕니다.`,
    `Only entries scoring above zero are ranked: top ${s}% S, up to ${a}% A, up to ${b}% B, the rest C.`,
    `スコアが0より大きい項目だけを並べ、上位${s}%までS、${a}%までA、${b}%までB、残りをCとします。`,
  )
}

export function TierPage() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const { data, isPending, isError, refetch } = useAnalysisData()
  const [params, setParams] = useSearchParams()
  const [build, setBuild] = useState<RefBuild>(DEFAULT_BUILD)
  const view = (VIEWS as string[]).includes(params.get('view') ?? '') ? (params.get('view') as View) : 'dealer'
  const setView = (v: View) => {
    const next = new URLSearchParams(params)
    next.set('view', v)
    setParams(next, { replace: true })
  }

  if (!data) return <LoadState isPending={isPending && !isError} onRetry={refetch} />
  const ref = { level: Math.min(build.level, data.growth.maxLevel), grade: Math.min(build.grade, data.growth.maxGrade) }

  return (
    <div className="analysis">
      <Intro title={l('티어', 'Tiers', 'ティア')}>
        {l(
          '다른 사이트의 평가를 옮기지 않고 게임 데이터로 직접 계산한 순위입니다. 계산 방법은 각 표 위에 적었습니다.',
          'Our own rankings, computed from game data rather than copied from anyone’s tier list. Each table explains its method.',
          '他サイトの評価ではなく、ゲームデータから直接計算した順位です。計算方法は各表の上に記載しています。',
        )}
      </Intro>

      <section className="panel">
        <h3>{l('기준 육성', 'Reference build', '基準育成')}</h3>
        <p className="subtle">
          {l(
            '모든 쿠키를 같은 레벨·별로 맞추고 장비·펫·슈가룬은 끼우지 않은 상태로 비교합니다.',
            'Every Cookie is compared at the same level and stars, with no gear, Pets or Sugar Runes.',
            'すべてのクッキーを同じレベル・星にそろえ、装備・ペット・シュガールーンなしで比較します。',
          )}
        </p>
        <BuildPicker
          level={ref.level}
          grade={ref.grade}
          maxLevel={data.growth.maxLevel}
          maxGrade={data.growth.maxGrade}
          onLevel={(level) => setBuild((b) => ({ ...b, level }))}
          onGrade={(grade) => setBuild((b) => ({ ...b, grade }))}
        />
        <p className="field-note">{cutoffText(locale)}</p>
      </section>

      <div className="analysis-tabs filter-chips" role="group" aria-label={l('순위 종류', 'Ranking type', '順位の種類')}>
        {VIEWS.map((v) => (
          <button type="button" key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {
              {
                dealer: l('딜러 피해량', 'Damage', '与ダメージ'),
                support: l('지원·방어', 'Support & tank', '支援・防御'),
                synergy: l('시너지 공급', 'Synergy supply', 'シナジー供給'),
                pet: l('펫', 'Pets', 'ペット'),
                rune: l('슈가룬 옵션', 'Sugar Rune lines', 'シュガールーン'),
              }[v]
            }
          </button>
        ))}
      </div>

      {view === 'dealer' && <DealerRanking data={data} build={ref} locale={locale} />}
      {view === 'support' && <SupportRanking data={data} build={ref} locale={locale} />}
      {view === 'synergy' && <SynergyRanking data={data} locale={locale} />}
      {view === 'pet' && <PetRanking data={data} build={ref} locale={locale} />}
      {view === 'rune' && <RuneRanking data={data} build={ref} locale={locale} />}
    </div>
  )
}

interface ViewProps {
  data: AnalysisData
  build: RefBuild
  locale: Locale
}

function useMetrics(data: AnalysisData, build: RefBuild) {
  return useMemo(() => {
    const reference = referenceAttacker(data.growth, data.cookies, build)
    const def = referenceDef(data.growth, data.cookies, build)
    return { reference, metrics: data.cookies.map((c) => cookieMetrics(data.growth, c, build, reference, def)) }
  }, [data, build])
}

function DealerRanking({ data, build, locale }: ViewProps) {
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const [scenario, setScenario] = useState<Scenario>('boss')
  const [role, setRole] = useState<CookieRole | ''>('')
  const { metrics } = useMetrics(data, build)
  const ranked = rankBy(metrics, (m) => m.dps[scenario])
  const top = ranked[0]?.score ?? 1
  const shown = role ? ranked.filter((r) => r.item.cookie.role === role) : ranked

  return (
    <section className="panel">
      <h3>{l('딜러 피해량 순위', 'Damage ranking', '与ダメージ順位')}</h3>
      <Method title={l('계산 방법', 'How it is computed', '計算方法')}>
        <p>
          {l(
            '초당 피해는 피해 계산기와 같은 모델로 구합니다. 크게 보면 스킬 계수 × 공격력 × 치명 평균 배수 ÷ 스킬 주기이고 스킬 계수는 쿠키 도감의 스킬 데이터(대상 하나가 받는 공격력 배율)입니다. 맞는 횟수가 범위로만 정해지면 최솟값과 최댓값의 가운데를 씁니다.',
            'DPS comes from the same model as the damage calculator: roughly skill coefficient × ATK × average crit multiplier ÷ skill cycle, with coefficients from the Cookie index skill data (ATK multiplier one target takes). Where the hit count is a range we take the midpoint of min and max.',
            '秒間ダメージはダメージ計算機と同じモデルで求めます。おおむねスキル係数 × 攻撃力 × 会心平均倍率 ÷ スキル周期で、係数はクッキー図鑑のスキルデータ(対象1体が受ける攻撃力倍率)です。命中数が範囲の場合は最小値と最大値の中央を使います。',
          )}
        </p>
        <p>
          {l(
            '치명 평균 배수는 1 + 치명확률 × 치명피해입니다. 치명확률이 100%를 넘으면 치명이 한 번 더 겹치므로 상한을 두지 않습니다.',
            'Average crit multiplier is 1 + CRIT Rate × CRIT DMG, with no cap: rate above 100% stacks a second crit.',
            '会心平均倍率は 1 + 会心率 × 会心ダメージで、上限はありません(100%を超えると会心が重なります)。',
          )}
        </p>
        <p>
          {l(
            `보스전은 대상 하나만 계산하고 스테이지는 범위 공격이 적 ${CROWD_TARGETS}명을 함께 맞힌다고 봅니다. 방어력과 속성 상성은 모든 쿠키에 같은 비율로 곱해지므로 순위에 영향이 없어 넣지 않았습니다. 버프·디버프는 이 표에 넣지 않고 '지원·방어'와 '추천 편성'에서 따로 계산합니다.`,
            `Boss counts one target; Stage assumes area hits catch ${CROWD_TARGETS} enemies. DEF and element scale every Cookie equally, so they are left out. Buffs are scored separately under Support and in the team builder.`,
            `ボス戦は対象1体、ステージは範囲攻撃が敵${CROWD_TARGETS}体に当たると仮定します。防御力と属性相性は全員に同じ比率でかかるため除外しています。バフは「支援・防御」と「おすすめ編成」で別に計算します。`,
          )}
        </p>
      </Method>
      <ChipRow
        title={l('상황', 'Fight', '状況')}
        value={scenario}
        options={[
          { value: 'boss', text: l('보스전', 'Boss', 'ボス戦') },
          { value: 'stage', text: l('스테이지', 'Stage', 'ステージ') },
        ]}
        onChange={setScenario}
      />
      <ChipRow title={l('직업', 'Class', '職業')} value={role} options={[{ value: '' as const, text: l('전체', 'All', 'すべて') }, ...ROLE_ORDER.map((r) => ({ value: r, text: label(ROLE, r, locale) }))]} onChange={setRole} />
      <div className="table-scroll">
        <table className="detail-table analysis-table">
          <thead>
            <tr>
              <th scope="col">{l('순위', 'Rank', '順位')}</th>
              <th scope="col">{l('쿠키', 'Cookie', 'クッキー')}</th>
              <th scope="col">{l('초당 피해', 'DPS', '秒間ダメージ')}</th>
              <th scope="col">{l('1위 대비', 'vs #1', '1位比')}</th>
              <th scope="col">{l('공격력', 'ATK', '攻撃力')}</th>
              <th scope="col">{l('범위 비율', 'Area share', '範囲比率')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.item.cookie.eid}>
                <th scope="row">
                  <TierBadge tier={r.tier} /> {r.rank + 1}
                </th>
                <td className="analysis-name">
                  <CookieCell cookie={r.item.cookie} locale={locale} />
                </td>
                <td>{fmtInt(r.score, locale)}</td>
                <td>{pct(r.score / top)}</td>
                <td>{fmtInt(r.item.attacker.atk, locale)}</td>
                <td>{pct(areaShare(r.item.cookie))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SupportRanking({ data, build, locale }: ViewProps) {
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const { metrics, reference } = useMetrics(data, build)
  const support = rankBy(metrics, supportScore)
  const tanks = rankBy(
    metrics.filter((m) => m.cookie.role === 'tank'),
    (m) => m.durability,
  )

  return (
    <>
      <section className="panel">
        <h3>{l('지원 순위', 'Support ranking', '支援順位')}</h3>
        <Method title={l('계산 방법', 'How it is computed', '計算方法')}>
          <p>
            {l(
              `스킬 효과 하나하나를 '받는 아군의 초당 피해가 몇 % 늘어나는지'로 바꾸고 가동률(지속 시간 ÷ 재사용 대기시간, 최대 100%)과 받는 인원(팀 ${TEAM_SIZE}명 기준)을 곱해 더했습니다. 그래서 '공격 지원 +100%'는 쿠키 한 명의 피해가 통째로 더해지는 만큼입니다.`,
              `Each skill effect is converted into how much it raises a receiving ally’s DPS, times uptime (duration ÷ cooldown, capped at 100%) and the number of receivers in a ${TEAM_SIZE}-Cookie team. So +100% offense equals one extra Cookie’s worth of damage.`,
              `スキル効果を「受ける味方の秒間ダメージが何%増えるか」に換算し、稼働率(持続時間÷再使用時間、最大100%)と受ける人数(${TEAM_SIZE}人編成)を掛けて合計しました。「攻撃支援+100%」はクッキー1体分の火力に相当します。`,
            )}
          </p>
          <p>
            {l(
              `버프를 받는 쪽은 같은 육성 상태의 SSR 사격형 평균(치명확률 ${pct(reference.critRate)}, 치명피해 ${pct(reference.critDamage)})으로 봅니다. 적 방어력 감소는 피해 계산기의 방어 배율 1 / (1 + ln(1 + 방어력 ÷ 500))에 적 방어력 ${REF_ENEMY_DEF}을 넣어 피해 증가율로 바꿉니다.`,
              `Receivers are modelled as the average SSR Ranged Cookie at this build (CRIT Rate ${pct(reference.critRate)}, CRIT DMG ${pct(reference.critDamage)}). Enemy DEF cuts use the damage calculator’s DEF factor 1 / (1 + ln(1 + DEF ÷ 500)) with enemy DEF ${REF_ENEMY_DEF}.`,
              `受ける側は同じ育成状態のSSR射撃型の平均(会心率${pct(reference.critRate)}、会心ダメージ${pct(reference.critDamage)})とします。敵の防御力減少はダメージ計算機の防御倍率 1 / (1 + ln(1 + 防御力 ÷ 500)) に敵防御力${REF_ENEMY_DEF}を入れて換算します。`,
            )}
          </p>
          <p>
            {l(
              "'보호'는 받는 피해 감소·아군 방어력 증가·적 공격력 감소를 '버틸 수 있는 피해량이 몇 % 늘어나는지'로 바꾼 값이고 '제어'는 기절·변이 가동률입니다. 지원 점수 = 공격 지원 + 보호 × 0.5 + 제어입니다.",
              "'Protection' turns damage-taken cuts, ally DEF buffs and enemy ATK cuts into extra damage survived; 'Control' is stun/transform uptime. Score = offense + protection × 0.5 + control.",
              '「防護」は被ダメージ減少・味方防御力増加・敵攻撃力減少を耐えられるダメージの増加率に換算した値、「制御」は気絶・変異の稼働率です。支援スコア = 攻撃支援 + 防護 × 0.5 + 制御。',
            )}
          </p>
        </Method>
        <div className="table-scroll">
          <table className="detail-table analysis-table">
            <thead>
              <tr>
                <th scope="col">{l('순위', 'Rank', '順位')}</th>
                <th scope="col">{l('쿠키', 'Cookie', 'クッキー')}</th>
                <th scope="col">{l('점수', 'Score', 'スコア')}</th>
                <th scope="col">{l('공격 지원', 'Offense', '攻撃支援')}</th>
                <th scope="col">{l('보호', 'Protection', '防護')}</th>
                <th scope="col">{l('제어', 'Control', '制御')}</th>
                <th scope="col">{l('보호막/초', 'Shield/s', 'シールド/秒')}</th>
              </tr>
            </thead>
            <tbody>
              {support.map((r) => (
                <tr key={r.item.cookie.eid}>
                  <th scope="row">
                    <TierBadge tier={r.tier} /> {r.rank + 1}
                  </th>
                  <td className="analysis-name">
                    <CookieCell cookie={r.item.cookie} locale={locale} />
                  </td>
                  <td>{r.score.toFixed(2)}</td>
                  <td>{plusPct(r.item.teamOffense, 0)}</td>
                  <td>{plusPct(r.item.teamDefense, 0)}</td>
                  <td>{pct(r.item.control)}</td>
                  <td>{r.item.shieldPerSecond ? fmtInt(r.item.shieldPerSecond, locale) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3>{l('방어형 내구도 순위', 'Defense Cookie durability', '防御型の耐久順位')}</h3>
        <p className="subtle">
          {l(
            '내구도는 버틸 수 있는 피해량으로, 체력을 방어 배율 1 / (1 + ln(1 + 방어력 ÷ 500))로 나눈 값입니다. 체력과 방어력을 하나의 수치로 합쳐 비교할 수 있습니다. 자기 자신에게 거는 피해 감소는 넣지 않았습니다.',
            'Durability is the damage a Cookie can absorb: HP divided by the DEF factor 1 / (1 + ln(1 + DEF ÷ 500)), folding HP and DEF into one number. Self damage-reduction skills are not included.',
            '耐久度は耐えられるダメージ量で、HPを防御倍率 1 / (1 + ln(1 + 防御力 ÷ 500)) で割った値です。HPと防御力を一つの値にまとめました。自分への被ダメージ減少は含めていません。',
          )}
        </p>
        <div className="table-scroll">
          <table className="detail-table analysis-table">
            <thead>
              <tr>
                <th scope="col">{l('순위', 'Rank', '順位')}</th>
                <th scope="col">{l('쿠키', 'Cookie', 'クッキー')}</th>
                <th scope="col">{l('내구도', 'Durability', '耐久度')}</th>
                <th scope="col">{l('체력', 'HP', 'HP')}</th>
                <th scope="col">{l('방어력', 'DEF', '防御力')}</th>
              </tr>
            </thead>
            <tbody>
              {tanks.map((r) => (
                <tr key={r.item.cookie.eid}>
                  <th scope="row">
                    <TierBadge tier={r.tier} /> {r.rank + 1}
                  </th>
                  <td className="analysis-name">
                    <CookieCell cookie={r.item.cookie} locale={locale} />
                  </td>
                  <td>{fmtInt(r.score, locale)}</td>
                  <td>{fmtInt(r.item.hp, locale)}</td>
                  <td>{fmtInt(r.item.def, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function SynergyRanking({ data, locale }: { data: AnalysisData; locale: Locale }) {
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const supply = synergySupply(data.cookies)
  const ranked = rankBy(supply, (s) => s.score)
  return (
    <section className="panel">
      <h3>{l('시너지 공급원 순위', 'Synergy providers', 'シナジー供給順位')}</h3>
      <Method title={l('계산 방법', 'How it is computed', '計算方法')}>
        <p>
          {l(
            `스킬로 아군에게 시너지를 주는 쿠키마다, 그 시너지를 받는 다른 쿠키가 도감 ${data.cookies.length}종 가운데 몇 종인지 셌습니다. 점수 = 받는 쿠키 수 × 가동률입니다. 받는 쿠키가 많을수록 어떤 편성에 넣어도 시너지를 채워 줄 가능성이 높습니다.`,
            `For every Cookie whose skill grants a Synergy to allies, we count how many of the ${data.cookies.length} Cookies receive that Synergy. Score = receivers × uptime: the more receivers, the more lineups it helps.`,
            `スキルで味方にシナジーを与えるクッキーごとに、そのシナジーを受ける他のクッキーが図鑑${data.cookies.length}種のうち何種かを数えました。スコア = 受けるクッキー数 × 稼働率です。`,
          )}
        </p>
        <p>
          {l(
            "시너지가 실제로 피해를 얼마나 올리는지는 쿠키마다 다르므로(다발은 투사체 수, 연타는 타수 등), '추천 편성' 탭에서 피해 계산기와 같은 모델로 편성 안에서 계산합니다.",
            'How much a Synergy adds depends on the Cookie (Volley adds projectiles, Rapid Fire adds hits…), so the Teams tab computes it inside each lineup with the damage calculator’s model.',
            'シナジーが実際にどれだけ火力を上げるかはクッキーごとに異なるため(多発は弾数、連打は命中数など)、「おすすめ編成」タブでダメージ計算機と同じモデルで編成内で計算します。',
          )}
        </p>
      </Method>
      <div className="table-scroll">
        <table className="detail-table analysis-table">
          <thead>
            <tr>
              <th scope="col">{l('순위', 'Rank', '順位')}</th>
              <th scope="col">{l('쿠키', 'Cookie', 'クッキー')}</th>
              <th scope="col">{l('주는 시너지', 'Synergy', '付与シナジー')}</th>
              <th scope="col">{l('받는 쿠키', 'Receivers', '受けるクッキー')}</th>
              <th scope="col">{l('가동률', 'Uptime', '稼働率')}</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => (
              <tr key={`${r.item.provider.eid}-${r.item.key}`}>
                <th scope="row">
                  <TierBadge tier={r.tier} /> {r.rank + 1}
                </th>
                <td className="analysis-name">
                  <CookieCell cookie={r.item.provider} locale={locale} />
                </td>
                <td>{label(SYNERGY, r.item.key, locale)}</td>
                <td>{l(`${r.item.receivers}종`, `${r.item.receivers}`, `${r.item.receivers}種`)}</td>
                <td>{pct(r.item.uptime)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PetRanking({ data, build, locale }: ViewProps) {
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const [by, setBy] = useState<'dps' | 'survival'>('dps')
  const preset = TEAM_PRESETS[0]!
  const result = useMemo(() => runPreset(preset, data.cookies, data.pets, data.growth, build), [preset, data, build])
  const ranked = rankBy(result.pets, (v) => v[by])
  const modePets = data.pets.filter(isModePet)
  const unscored = result.pets.filter((v) => v.dps <= 0 && v.survival <= 0)

  return (
    <section className="panel">
      <h3>{l('펫 순위', 'Pet ranking', 'ペット順位')}</h3>
      <Method title={l('계산 방법', 'How it is computed', '計算方法')}>
        <p>
          {l(
            `'추천 편성' 탭의 스테이지 편성(우리 알고리즘이 고른 ${TEAM_SIZE}명)에 ★5 펫 하나를 더했을 때를 계산합니다. 피해 증가는 효과를 받는 쿠키의 증가율을 편성 안 피해 비중으로 가중한 값이라, 편성 전체 초당 피해가 몇 % 느는지와 같습니다. 생존 증가는 편성 쿠키가 버티는 피해량의 평균 증가율입니다.`,
            `Each ★5 Pet is added to the Stage lineup from the Teams tab (${TEAM_SIZE} Cookies picked by our algorithm). Damage gain is weighted by each receiver’s share of team damage, so it equals the whole team’s DPS gain. Survival gain is the average extra damage the lineup can take.`,
            `「おすすめ編成」タブのステージ編成(当サイトのアルゴリズムが選んだ${TEAM_SIZE}体)に★5ペットを1体加えた場合を計算します。火力増加は効果を受けるクッキーの増加率を編成内の火力比で加重した値で、編成全体の秒間ダメージ増加率と同じです。生存増加は編成の耐久の平均増加率です。`,
          )}
        </p>
        <p>
          {l(
            '명중·회피·집중·저항, 띄우기·밀치기 저항, 시너지 강화처럼 피해·생존 식에 넣을 수 없는 효과는 계산에서 빠지며 표에 * 표시를 붙였습니다. 특정 모드에서만 효과가 있는 펫은 따로 적었습니다.',
            'Effects that do not enter the damage or survival formula (accuracy, evasion, focus, resist, lift/push resist, Synergy boosts) are left out and marked *. Mode-only Pets are listed separately.',
            '命中・回避・集中・抵抗、浮かし・押し出し耐性、シナジー強化など計算式に入れられない効果は除外し、*を付けました。特定モード専用のペットは別に記載します。',
          )}
        </p>
      </Method>
      <ChipRow
        title={l('기준', 'Sort by', '基準')}
        value={by}
        options={[
          { value: 'dps', text: l('피해 증가', 'Damage gain', '火力増加') },
          { value: 'survival', text: l('생존 증가', 'Survival gain', '生存増加') },
        ]}
        onChange={setBy}
      />
      <div className="table-scroll">
        <table className="detail-table analysis-table">
          <thead>
            <tr>
              <th scope="col">{l('순위', 'Rank', '順位')}</th>
              <th scope="col">{l('펫', 'Pet', 'ペット')}</th>
              <th scope="col">{l('피해 증가', 'Damage', '火力')}</th>
              <th scope="col">{l('생존 증가', 'Survival', '生存')}</th>
              <th scope="col">{l('받는 쿠키', 'Receivers', '受けるクッキー')}</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => (
              <tr key={r.item.pet.id}>
                <th scope="row">
                  <TierBadge tier={r.tier} /> {r.rank + 1}
                </th>
                <td className="analysis-name">
                  <PetCell pet={r.item.pet} locale={locale} />
                  {r.item.partial && <span aria-label={l('일부 효과 제외', 'Some effects excluded', '一部効果除外')}> *</span>}
                </td>
                <td>{plusPct(r.item.dps)}</td>
                <td>{plusPct(r.item.survival)}</td>
                <td>{l(`${r.item.covered}명`, `${r.item.covered}`, `${r.item.covered}体`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unscored.length > 0 && (
        <p className="field-note">
          {l('계산 식에 넣을 수 있는 효과가 없는 펫', 'Pets with no effect our formulas cover', '計算式に入る効果がないペット')}: {unscored.map((v) => localizedText(v.pet.name, locale)).join(', ')}
        </p>
      )}
      {modePets.length > 0 && (
        <p className="field-note">
          {l('특정 모드 전용이라 순위에서 뺀 펫', 'Mode-only Pets left out of the ranking', 'モード専用のため順位から除外したペット')}: {modePets.map((p) => localizedText(p.name, locale)).join(', ')}
        </p>
      )}
    </section>
  )
}

function RuneRanking({ data, build, locale }: ViewProps) {
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const runes = useQuery(runeCraftQuery)
  const { metrics } = useMetrics(data, build)
  const values = useMemo(() => {
    const ssr = runes.data?.rarities.find((r) => r.rarity === 'SSR')?.tiers.find((t) => t.tier === 1)
    if (!ssr) return null
    const v = ssr.values
    return { atkAmp: v.atkAmp ?? 0, critRate: v.critRate ?? 0, critDamage: v.critDamage ?? 0, skillAmp: v.skillAmp ?? 0, skillHaste: ssr.haste?.value ?? 0 } satisfies Record<RuneDpsStat, number>
  }, [runes.data])

  if (!values) return <LoadState isPending={runes.isPending} onRetry={() => void runes.refetch()} />
  const dealers = rankBy(metrics, (m) => m.dps.boss).filter((r) => r.tier !== 'C')
  const stats = Object.keys(values) as RuneDpsStat[]

  return (
    <section className="panel">
      <h3>{l('슈가룬 옵션 가치', 'Sugar Rune line value', 'シュガールーンのオプション価値')}</h3>
      <Method title={l('계산 방법', 'How it is computed', '計算方法')}>
        <p>
          {l(
            `SSR 1단계 옵션 한 줄(${stats.map((s) => `${statLabel(s, locale)} ${values[s]}${s === 'skillHaste' ? '' : '%'}`).join(', ')})을 더했을 때 보스전 초당 피해가 몇 % 느는지를 쿠키마다 계산했습니다. 공격력 증폭은 공격력에 그대로 곱해지고 치명 옵션은 치명 평균 배수를 통해 들어가므로 치명 수치가 낮을수록 가치가 떨어집니다.`,
            `For each Cookie, the boss DPS gain from one SSR tier-1 line (${stats.map((s) => `${statLabel(s, locale)} ${values[s]}${s === 'skillHaste' ? '' : '%'}`).join(', ')}). ATK Amplification multiplies ATK directly; crit lines work through the crit multiplier, so they are worth less on low-crit Cookies.`,
            `SSR1段階のオプション1行(${stats.map((s) => `${statLabel(s, locale)} ${values[s]}${s === 'skillHaste' ? '' : '%'}`).join('、')})を加えたときにボス戦の秒間ダメージが何%増えるかをクッキーごとに計算しました。`,
          )}
        </p>
        <p>
          {l(
            "스킬가속은 피해 계산기와 같이 스킬 주기를 100 ÷ (100 + 스킬가속)배로 줄입니다. 버프를 받은 상태의 가치는 '추천 편성' 탭에서 편성별로 보여 줍니다. 피해 순위 C등급 쿠키는 표에서 뺐습니다.",
            'Skill Haste shortens the skill cycle to 100 ÷ (100 + Haste), as in the damage calculator. Values with team buffs are shown per lineup in the Teams tab. C-tier damage Cookies are omitted.',
            'スキル加速はダメージ計算機と同じくスキル周期を100 ÷ (100 + スキル加速)倍に短縮します。バフを受けた状態の価値は「おすすめ編成」タブで編成ごとに表示します。火力順位Cのクッキーは省略しました。',
          )}
        </p>
      </Method>
      <div className="table-scroll">
        <table className="detail-table analysis-table">
          <thead>
            <tr>
              <th scope="col">{l('쿠키', 'Cookie', 'クッキー')}</th>
              {stats.map((s) => (
                <th scope="col" key={s}>
                  {statLabel(s, locale)}
                </th>
              ))}
              <th scope="col">{l('우선순위', 'Priority', '優先順位')}</th>
            </tr>
          </thead>
          <tbody>
            {dealers.map((r) => {
              const order = runePriority(values, r.item.cookie, r.item.attacker, 'boss')
              const best = order[0]?.stat
              return (
                <tr key={r.item.cookie.eid}>
                  <th scope="row" className="analysis-name">
                    <CookieCell cookie={r.item.cookie} locale={locale} meta={false} />
                  </th>
                  {stats.map((s) => {
                    const gain = order.find((o) => o.stat === s)?.gain ?? 0
                    return (
                      <td key={s} className={s === best ? 'analysis-best' : undefined}>
                        {plusPct(gain, 2)}
                      </td>
                    )
                  })}
                  <td className="analysis-priority">{order.map((o) => statLabel(o.stat, locale)).join(' > ')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
