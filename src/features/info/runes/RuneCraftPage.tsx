import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { pick, useI18n } from '../../../i18n'
import { ROUTES } from '../../../routes'
import {
  HASTE,
  chanceWithin,
  formatPct,
  formatValue,
  lockPlan,
  rerollPercentiles,
  runeCraftQuery,
  runeOutcomes,
  runeSteps,
  slotChance,
  statLabel,
  triesFor,
  type RuneCraftData,
} from './runeCraft'
import './runes.css'

const QUANTILES = [0.5, 0.9, 0.99]

export function RuneCraftPage() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const { data, isPending, isError, refetch } = useQuery(runeCraftQuery)

  if (isPending) return <p className="result-placeholder">{l('슈가룬 확률표를 불러오고 있습니다.', 'Loading Sugar Rune odds…', 'シュガールーンの確率表を読み込み中…')}</p>
  if (isError)
    return (
      <div className="no-results">
        <p>{l('슈가룬 확률표를 불러오지 못했습니다.', 'Unable to load Sugar Rune odds.', 'シュガールーンの確率表を読み込めませんでした。')}</p>
        <button type="button" className="text-button" onClick={() => refetch()}>
          {l('다시 시도', 'Retry', '再試行')}
        </button>
      </div>
    )

  return (
    <div className="runes-page">
      <div className="section-intro">
        <div>
          <h2>{l('슈가룬 재조합', 'Sugar Rune reroll', 'シュガールーン再組み合わせ')}</h2>
          <p>
            {l(
              '국내 확률 공시 값으로 슈가룬 옵션별 확률과 원하는 옵션을 맞추는 데 드는 룬결정을 계산합니다.',
              'Option odds from the published rates, and the Rune Crystals it takes to land the options you want.',
              '公開確率をもとに、オプションごとの確率と狙ったオプションを揃えるのに必要なルーン結晶を計算します。',
            )}
          </p>
        </div>
      </div>
      <Overview data={data} />
      <TierTables data={data} />
      <Calculator data={data} />
      <p className="field-note runes-recommend">
        {l('쿠키별로 어떤 옵션을 먼저 챙길지는 ', 'For which options each Cookie should take first, see ', 'クッキーごとに優先するオプションは')}
        <Link to={ROUTES.recommend}>{l('추천 슈가룬', 'Recommended Sugar Runes', 'おすすめシュガールーン')}</Link>
        {l(' 탭에서 확인하세요.', '.', 'タブで確認できます。')}
      </p>
    </div>
  )
}

/** 재조합 방식, 등급별 확률, 잠금 수별 비용 */
function Overview({ data }: { data: RuneCraftData }) {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const outcomes = runeOutcomes(data)
  const rarityRows = data.rarities.map(({ rarity }) => {
    const weight = outcomes.filter((o) => o.rarity === rarity).reduce((sum, o) => sum + o.weight, 0)
    return { rarity, p: weight / data.totalWeight }
  })

  return (
    <section className="panel detail-section" aria-labelledby="runes-overview-title">
      <h3 id="runes-overview-title">{l('재조합 방식', 'How a reroll works', '再組み合わせの仕組み')}</h3>
      <ul className="runes-facts">
        <li>
          {l(
            `쿠키마다 슈가룬 슬롯이 최대 ${data.maxSlots}칸 있고 승급할수록 더 열립니다.`,
            `A Cookie has up to ${data.maxSlots} Sugar Rune slots, opened as it is promoted.`,
            `クッキー1体につきシュガールーンのスロットは最大${data.maxSlots}個で、昇級するほど開放されます。`,
          )}
        </li>
        <li>
          {l(
            `재조합하면 잠그지 않은 슬롯이 모두 다시 뽑히고 슬롯마다 ${outcomes.length}가지 결과(등급·수치·옵션) 중 하나가 따로 정해집니다.`,
            `A reroll redraws every unlocked slot, and each slot independently lands on one of ${outcomes.length} outcomes (rarity, value and option).`,
            `再組み合わせではロックしていないスロットがすべて引き直され、スロットごとに${outcomes.length}通り(等級・数値・オプション)のうち一つが決まります。`,
          )}
        </li>
        <li>
          {l(
            '같은 등급 안에서는 수치가 높을수록 드뭅니다. 스킬가속은 SSR과 SR의 높은 두 단계에만 있고 확률도 따로 정해져 있습니다.',
            'Within a rarity, higher values are rarer. Skill Haste only appears at the top two values of SSR and SR, with odds of its own.',
            '同じ等級の中では数値が高いほど出にくくなります。スキル加速はSSRとSRの上位2段階にしかなく、確率も別に決まっています。',
          )}
        </li>
      </ul>

      <div className="runes-two">
        <div className="table-scroll">
          <table className="detail-table">
            <caption className="runes-caption">{l('등급별 확률(슬롯 한 칸)', 'Odds per rarity (one slot)', '等級別確率(スロット1個)')}</caption>
            <thead>
              <tr>
                <th scope="col">{l('등급', 'Rarity', '等級')}</th>
                <th scope="col">{l('확률', 'Chance', '確率')}</th>
                <th scope="col">{l('평균', 'About', '平均')}</th>
              </tr>
            </thead>
            <tbody>
              {rarityRows.map(({ rarity, p }) => (
                <tr key={rarity}>
                  <th scope="row">
                    <span className={`rarity-badge rarity-${rarity.toLowerCase()}`}>{rarity}</span>
                  </th>
                  <td>{formatPct(p)}</td>
                  <td>{l(`${Math.round(1 / p).toLocaleString()}회에 1번`, `1 in ${Math.round(1 / p).toLocaleString()}`, `${Math.round(1 / p).toLocaleString()}回に1回`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-scroll">
          <table className="detail-table">
            <caption className="runes-caption">{l('잠근 슬롯 수별 재조합 비용', 'Reroll cost by locked slots', 'ロック数別の再組み合わせ費用')}</caption>
            <thead>
              <tr>
                <th scope="col">{l('잠근 슬롯', 'Locked', 'ロック数')}</th>
                <th scope="col">{l('룬결정', 'Rune Crystals', 'ルーン結晶')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rerollCosts.map((cost, locked) => (
                <tr key={locked}>
                  <th scope="row">{l(`${locked}칸`, `${locked}`, `${locked}個`)}</th>
                  <td>{cost.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

/** 등급을 고르면 옵션별 수치와 확률을 보여 준다. */
function TierTables({ data }: { data: RuneCraftData }) {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const [rarity, setRarity] = useState(data.rarities[0]?.rarity ?? 'SSR')
  const current = data.rarities.find((r) => r.rarity === rarity) ?? data.rarities[0]
  if (!current) return null
  const tiers = current.tiers

  return (
    <section className="panel detail-section" aria-labelledby="runes-tier-title">
      <h3 id="runes-tier-title">{l('등급별 옵션 수치', 'Option values by rarity', '等級別オプション数値')}</h3>
      <div className="filter-row">
        <span className="filter-label">{l('등급', 'Rarity', '等級')}</span>
        <div className="filter-chips">
          {data.rarities.map((r) => (
            <button key={r.rarity} type="button" aria-pressed={r.rarity === rarity} onClick={() => setRarity(r.rarity)}>
              {r.rarity}
            </button>
          ))}
        </div>
      </div>
      <div className="table-scroll runes-tier-table">
        <table className="detail-table">
          <thead>
            <tr>
              <th scope="col">{l('옵션', 'Option', 'オプション')}</th>
              {tiers.map((tier) => (
                <th key={tier.tier} scope="col">
                  {l(`${tier.tier}단계`, `Tier ${tier.tier}`, `${tier.tier}段階`)}
                  <br />
                  <small>{l(`옵션당 ${formatPct(tier.weight / data.totalWeight)}`, `${formatPct(tier.weight / data.totalWeight)} each`, `各${formatPct(tier.weight / data.totalWeight)}`)}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.stats.map(({ key, unit }) => {
              const isHaste = key === HASTE
              if (isHaste && !tiers.some((t) => t.haste)) return null
              return (
                <tr key={key}>
                  <th scope="row">{statLabel(key, locale)}</th>
                  {tiers.map((tier) => {
                    if (isHaste)
                      return (
                        <td key={tier.tier}>
                          {tier.haste ? (
                            <>
                              {formatValue(tier.haste.value, unit)}
                              <br />
                              <small>{formatPct(tier.haste.weight / data.totalWeight)}</small>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                      )
                    const value = tier.values[key]
                    return <td key={tier.tier}>{value == null ? '—' : formatValue(value, unit)}</td>
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="field-note">
        {l(
          '1단계가 그 등급에서 가장 높은 수치입니다. 이동속도와 스킬가속은 %가 아닌 수치로 더해집니다. 스킬가속은 확률을 칸 안에 따로 적었습니다.',
          'Tier 1 is the highest value at that rarity. Move Speed and Skill Haste add a flat amount rather than a percentage. Skill Haste odds are shown in its own cells.',
          '1段階がその等級で最も高い数値です。移動速度とスキル加速は%ではなく数値で加算されます。スキル加速の確率はセル内に記載しています。',
        )}
      </p>
    </section>
  )
}

function Calculator({ data }: { data: RuneCraftData }) {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const steps = useMemo(() => runeSteps(data), [data])
  const [stats, setStats] = useState<string[]>(['skillAmp'])
  const [maxStep, setMaxStep] = useState(steps.length - 1)
  const [slots, setSlots] = useState(data.maxSlots)
  const [need, setNeed] = useState(1)
  const [discount, setDiscount] = useState(0)

  const needCapped = Math.min(need, slots)
  const p = useMemo(() => slotChance(data, { stats, maxStep }), [data, stats, maxStep])
  const costs = useMemo(() => data.rerollCosts.map((c) => c * (1 - Math.min(Math.max(discount, 0), 90) / 100)), [data, discount])
  const plans = useMemo(() => {
    if (p <= 0) return null
    const optimal = lockPlan(slots, needCapped, p, costs, 'optimal')
    const greedy = lockPlan(slots, needCapped, p, costs, 'greedy')
    return { optimal, greedy, quantiles: rerollPercentiles(slots, needCapped, p, optimal, QUANTILES) }
  }, [p, slots, needCapped, costs])

  const toggleStat = (key: string) => setStats((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]))
  const stepLabel = (i: number) => {
    const s = steps[i]
    return s ? l(`${s.rarity} ${s.tier}단계 이상`, `${s.rarity} tier ${s.tier} or better`, `${s.rarity} ${s.tier}段階以上`) : ''
  }
  const count = (n: number) => (Number.isFinite(n) ? Math.ceil(n).toLocaleString() : '—')
  const times = (n: number) =>
    Number.isFinite(n) ? l(`${n.toLocaleString()}회`, `${n.toLocaleString()}`, `${n.toLocaleString()}回`) : l('20만 회 초과', 'over 200,000', '20万回超')
  const crystals = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString() : '—')

  return (
    <section className="panel detail-section" aria-labelledby="runes-calc-title">
      <h3 id="runes-calc-title">{l('목표 옵션 계산기', 'Target calculator', '目標オプション計算機')}</h3>
      <div className="runes-form">
        <div className="filter-row">
          <span className="filter-label">{l('옵션', 'Option', 'オプション')}</span>
          <div className="filter-chips">
            {data.stats.map(({ key }) => (
              <button key={key} type="button" aria-pressed={stats.includes(key)} onClick={() => toggleStat(key)}>
                {statLabel(key, locale)}
              </button>
            ))}
          </div>
        </div>
        <div className="runes-fields">
          <label className="runes-field">
            <span>{l('최소 수치', 'Minimum value', '最低数値')}</span>
            <select value={maxStep} onChange={(e) => setMaxStep(Number(e.target.value))}>
              {steps.map((_, i) => (
                <option key={i} value={i}>
                  {i === steps.length - 1 ? l('등급 무관', 'Any rarity', '等級問わず') : stepLabel(i)}
                </option>
              ))}
            </select>
          </label>
          <label className="runes-field">
            <span>{l('열린 슬롯', 'Open slots', '開放スロット')}</span>
            <select value={slots} onChange={(e) => setSlots(Number(e.target.value))}>
              {Array.from({ length: data.maxSlots }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {l(`${n}칸`, `${n}`, `${n}個`)}
                </option>
              ))}
            </select>
          </label>
          <label className="runes-field">
            <span>{l('맞출 슬롯', 'Slots to fill', '揃えるスロット')}</span>
            <select value={needCapped} onChange={(e) => setNeed(Number(e.target.value))}>
              {Array.from({ length: slots }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {l(`${n}칸`, `${n}`, `${n}個`)}
                </option>
              ))}
            </select>
          </label>
          <label className="runes-field">
            <span>{l('비용 감소(%)', 'Cost reduction (%)', '費用減少(%)')}</span>
            <input type="number" inputMode="numeric" min={0} max={90} step={5} value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} />
          </label>
        </div>
      </div>

      {p <= 0 ? (
        <div className="no-results">
          <p>
            {stats.includes(HASTE) && stats.length === 1
              ? l('스킬가속은 SSR·SR의 1·2단계에만 나옵니다. 최소 수치를 높여 보세요.', 'Skill Haste only rolls at SSR/SR tiers 1–2. Raise the minimum.', 'スキル加速はSSR・SRの1・2段階にしか出ません。最低数値を上げてください。')
              : l('조건에 맞는 결과가 없습니다.', 'No outcome matches.', '条件に合う結果がありません。')}
          </p>
        </div>
      ) : (
        <>
          <h4 className="runes-sub">{l('슬롯 한 칸 기준', 'One slot', 'スロット1個あたり')}</h4>
          <dl className="detail-stats">
            <div>
              <dt>{l('재조합 1회 확률', 'Chance per reroll', '1回の確率')}</dt>
              <dd>{formatPct(p)}</dd>
            </div>
            <div>
              <dt>{l('평균 재조합 횟수', 'Average rerolls', '平均回数')}</dt>
              <dd>{count(1 / p)}</dd>
            </div>
            {QUANTILES.map((q) => (
              <div key={q}>
                <dt>{l(`${q * 100}% 확률로 나오는 횟수`, `Rerolls for ${q * 100}%`, `${q * 100}%で出る回数`)}</dt>
                <dd>{count(triesFor(p, q))}</dd>
              </div>
            ))}
            <div>
              <dt>{l(`재조합 1회에 ${slots}칸 중 하나라도`, `Any of ${slots} slots per reroll`, `1回で${slots}個のうちどれか`)}</dt>
              <dd>{formatPct(chanceWithin(p, slots))}</dd>
            </div>
          </dl>

          {plans && (
            <>
              <h4 className="runes-sub">
                {l(`${slots}칸 중 ${needCapped}칸을 맞출 때`, `Filling ${needCapped} of ${slots} slots`, `${slots}個中${needCapped}個を揃える場合`)}
              </h4>
              <div className="table-scroll">
                <table className="detail-table">
                  <thead>
                    <tr>
                      <th scope="col">{l('잠금 방식', 'Locking', 'ロック方法')}</th>
                      <th scope="col">{l('평균 룬결정', 'Avg. Rune Crystals', '平均ルーン結晶')}</th>
                      <th scope="col">{l('평균 재조합', 'Avg. rerolls', '平均回数')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">{l('비용이 가장 적게 드는 잠금', 'Cheapest locking', '最安のロック')}</th>
                      <td>{crystals(plans.optimal.cost[0] ?? Infinity)}</td>
                      <td>{count(plans.optimal.rerolls[0] ?? Infinity)}</td>
                    </tr>
                    <tr>
                      <th scope="row">{l('맞는 대로 바로 잠금', 'Lock every hit', '出たらすぐロック')}</th>
                      <td>{crystals(plans.greedy.cost[0] ?? Infinity)}</td>
                      <td>{count(plans.greedy.rerolls[0] ?? Infinity)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <dl className="detail-stats runes-quantiles">
                {QUANTILES.map((q, i) => (
                  <div key={q}>
                    <dt>{l(`${q * 100}% 확률로 끝나는 재조합 횟수`, `Rerolls to finish with ${q * 100}%`, `${q * 100}%で終わる回数`)}</dt>
                    <dd>{times(plans.quantiles[i] ?? Infinity)}</dd>
                  </div>
                ))}
              </dl>
              <p className="field-note">
                {l(
                  '몬테카를로 시뮬레이션이 아니라 공시 확률로 정확히 계산한 값입니다. 처음에는 맞춘 슬롯이 없고 같은 옵션이 여러 슬롯에 겹쳐 나올 수 있다고 가정했습니다. ‘비용이 가장 적게 드는 잠금’은 잠글수록 재조합이 비싸지는 점을 고려해서 맞은 슬롯 가운데 몇 칸을 잠글지 매번 기대 비용이 가장 낮아지도록 고른 결과입니다. 횟수 분포(50·90·99%)도 이 방식 기준입니다.',
                  'Exact figures from the published odds, not a Monte Carlo run. Assumes no slot is filled at the start and that the same option can land in several slots. “Cheapest locking” picks, after every reroll, how many new hits to lock so the expected cost is lowest, since each lock makes the next reroll pricier. The 50/90/99% counts follow that plan.',
                  'モンテカルロではなく、公開確率から厳密に計算した値です。最初は揃ったスロットがなく、同じオプションが複数のスロットに出られると仮定しています。「最安のロック」はロックするほど費用が上がる点を考慮し、毎回期待費用が最も低くなるようにロック数を選んだ結果です。回数分布(50・90・99%)もこの方法に基づきます。',
                )}
              </p>
              <p className="field-note">
                {l(
                  '비용 감소는 입력한 비율만큼 매번 그대로 줄여 계산합니다. 게임에서 소수점을 어떻게 처리하는지는 확인하지 못했습니다.',
                  'Cost reduction is applied as an exact percentage; how the game rounds it has not been verified.',
                  '費用減少は入力した割合でそのまま差し引いて計算します。ゲーム内の端数処理は未確認です。',
                )}
              </p>
            </>
          )}
        </>
      )}
    </section>
  )
}
