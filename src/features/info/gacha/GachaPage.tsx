import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { cookieDbQuery, petDbQuery } from '../../../api/queries'
import { pick, useI18n } from '../../../i18n'
import { asset } from '../../../lib/asset'
import { RARITY_ORDER } from '../../../lib/cookieLabels'
import { localizedText } from '../../../lib/localize'
import type { Locale } from '../../../types'
import {
  FEATURED_RANK,
  GACHA_LEVELS,
  buildPool,
  chanceAtLeastOne,
  drawsForChance,
  eligibleUnits,
  emptyRecord,
  expectedDraws,
  gachaData,
  rankChance,
  ratesAt,
  seedFrom,
  simulate,
  topRanks,
  unitChance,
  type DrawResult,
  type GachaBanner,
  type GachaUnit,
  type SimRecord,
} from './gacha'
import './gacha.css'

const DRAW_COUNTS = [1, 10]
const MAX_DRAWS = 100000

const pct = (value: number, locale: Locale, digits = 4) =>
  `${(value * 100).toLocaleString(locale, { maximumFractionDigits: value < 0.01 ? digits : 2 })}%`
const num = (value: number, locale: Locale) =>
  Number.isFinite(value) ? Math.round(value).toLocaleString(locale) : '-'
const rankLabel = (rank: string, locale: Locale) => (rank === FEATURED_RANK ? pick(locale, '픽업', 'Pick-up', 'ピックアップ') : rank)
const rankOrder = (rank: string) => RARITY_ORDER.indexOf(rank)
const randomSeed = () => (Math.random() * 4294967296) | 0

interface SimState {
  /** 설정이 바뀌면 기록을 처음부터 다시 쌓는다. */
  key: string
  record: SimRecord
  last: DrawResult[]
  /** 마지막으로 누른 뽑기 횟수(결과는 앞 100개만 보여 준다) */
  lastDraws: number
}

export function GachaPage() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const [params, setParams] = useSearchParams()
  const cookies = useQuery(cookieDbQuery)
  const pets = useQuery(petDbQuery)

  const banners = gachaData.banners
  const banner: GachaBanner = banners.find((b) => b.id === params.get('banner')) ?? banners[0]!
  const levelParam = Number(params.get('lv'))
  const level = GACHA_LEVELS.includes(levelParam) ? levelParam : 10

  const units = useMemo<GachaUnit[]>(() => {
    if (banner.kind === 'pet')
      return eligibleUnits((pets.data?.pets ?? []).map((p) => ({ key: p.slug, name: p.name, rarity: p.rarity, image: p.image })), 'pet')
    return eligibleUnits((cookies.data?.cookies ?? []).map((c) => ({ key: c.slug, name: c.name, rarity: c.rarity, image: c.image })), 'cookie')
  }, [banner.kind, cookies.data, pets.data])

  // 픽업 대상: 정해진 뽑기는 그 대상, 아니면 고른 등급 안에서 주소의 값 → 기본값 → 첫 번째 순으로 정한다.
  const featuredChoices = banner.featured ? units.filter((u) => banner.featured!.from.includes(u.rarity)).sort((a, b) => rankOrder(a.rarity) - rankOrder(b.rarity)) : []
  const featured: GachaUnit | null = banner.featured
    ? (units.find((u) => u.key === (banner.featured!.fixed ?? params.get('pick'))) ??
      units.find((u) => u.key === banner.featured!.default) ??
      featuredChoices[0] ??
      null)
    : null

  const pool = useMemo(() => buildPool(banner, level, units, featured), [banner, level, units, featured])
  const top = topRanks(banner.kind)

  // 기대 확률: 목표 대상(기본은 픽업 대상)과 계획한 뽑기 횟수
  const [planText, setPlanText] = useState('100')
  const plan = Math.min(MAX_DRAWS, Math.max(0, Math.floor(Number(planText) || 0)))
  const [targetKey, setTargetKey] = useState('')
  const [pityOn, setPityOn] = useState(false)
  const targetChoices = [...new Map(pool.entries.filter((e) => top.includes(e.unit.rarity)).map((e) => [e.unit.key, e.unit])).values()]
  const target = targetChoices.find((u) => u.key === targetKey) ?? featured ?? targetChoices[0] ?? null
  const pity = pityOn && banner.reportedPity && featured ? banner.reportedPity : null
  const targetPity = target && featured && target.key === featured.key ? pity : null

  // 시뮬레이터
  const [seedText, setSeedText] = useState('')
  const [countText, setCountText] = useState('100')
  const count = Math.min(MAX_DRAWS, Math.max(1, Math.floor(Number(countText) || 1)))
  const simKey = `${banner.id}|${level}|${featured?.key ?? ''}|${pity ?? ''}|${seedText}`
  const [sim, setSim] = useState<SimState | null>(null)
  const current = sim?.key === simKey ? sim : null
  const startRecord = () => emptyRecord(seedText.trim() ? seedFrom(seedText.trim()) : randomSeed())

  const draw = (n: number) => {
    const { record, results } = simulate(pool, current?.record ?? startRecord(), n, { pity, featured })
    setSim({ key: simKey, record, last: results, lastDraws: n })
  }

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  if (cookies.isPending || pets.isPending)
    return <p className="result-placeholder">{l('뽑기 정보를 불러오고 있습니다.', 'Loading gacha data…', 'ガチャ情報を読み込み中…')}</p>
  if (cookies.isError || pets.isError)
    return (
      <div className="no-results">
        <p>{l('뽑기 정보를 불러오지 못했습니다.', 'Unable to load gacha data.', 'ガチャ情報を読み込めませんでした。')}</p>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            void cookies.refetch()
            void pets.refetch()
          }}
        >
          {l('다시 시도', 'Retry', '再試行')}
        </button>
      </div>
    )

  const rates = ratesAt(banner, level)
  const levelDraws = gachaData.levelDraws[banner.kind]
  const featuredRate = rates.find((r) => r.rank === FEATURED_RANK)?.pct ?? 0
  const pTarget = target ? unitChance(pool, target.key) : 0
  const pTop = rankChance(pool, top)
  const topLabel = banner.kind === 'pet' ? 'SSR' : l('SSR 이상', 'SSR or better', 'SSR以上')
  const unitWord = banner.kind === 'pet' ? l('펫', 'Pet', 'ペット') : l('쿠키', 'Cookie', 'クッキー')
  const costText = (draws: number) =>
    banner.ticket
      ? l(
          `${localizedText(banner.ticket, locale)} ${num(draws, locale)}장 또는 ${localizedText(banner.currency, locale)} ${num(draws * banner.cost, locale)}개`,
          `${num(draws, locale)} ${localizedText(banner.ticket, locale)} or ${num(draws * banner.cost, locale)} ${localizedText(banner.currency, locale)}`,
          `${localizedText(banner.ticket, locale)} ${num(draws, locale)}枚 または ${localizedText(banner.currency, locale)} ${num(draws * banner.cost, locale)}個`,
        )
      : l(
          `${localizedText(banner.currency, locale)} ${num(draws * banner.cost, locale)}개`,
          `${num(draws * banner.cost, locale)} ${localizedText(banner.currency, locale)}`,
          `${localizedText(banner.currency, locale)} ${num(draws * banner.cost, locale)}個`,
        )

  const record = current?.record
  const obtained = record
    ? Object.entries(record.byUnit)
        .map(([key, n]) => ({ unit: units.find((u) => u.key === key), n }))
        .filter((x): x is { unit: GachaUnit; n: number } => Boolean(x.unit && top.includes(x.unit.rarity)))
        .sort((a, b) => rankOrder(a.unit.rarity) - rankOrder(b.unit.rarity) || b.n - a.n)
    : []

  return (
    <div className="gacha">
      <div className="section-intro">
        <div>
          <h2>{l('뽑기 시뮬레이터', 'Gacha simulator', 'ガチャシミュレーター')}</h2>
          <p>
            {l(
              '공개된 뽑기 레벨별 확률로 쿠키·펫 뽑기를 돌려 보고, 원하는 대상이 나올 확률을 계산합니다.',
              'Roll Cookie and Pet gacha on the published odds for each Gacha Level, and work out your chances of a target.',
              '公開されたガチャレベル別確率でクッキー・ペットのガチャを回し、狙いが出る確率を計算します。',
            )}
          </p>
        </div>
      </div>

      <div className="panel gacha-settings">
        <div className="filter-row">
          <span className="filter-label">{l('뽑기', 'Gacha', 'ガチャ')}</span>
          <div className="filter-chips">
            {banners.map((b) => (
              <button type="button" key={b.id} aria-pressed={b.id === banner.id} onClick={() => setParam('banner', b.id === banners[0]?.id ? '' : b.id)}>
                {localizedText(b.name, locale)}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-row">
          <span className="filter-label">{l('뽑기 레벨', 'Gacha Lv.', 'ガチャLv.')}</span>
          <div className="filter-chips">
            {GACHA_LEVELS.map((lv) => (
              <button type="button" key={lv} aria-pressed={lv === level} onClick={() => setParam('lv', lv === 10 ? '' : String(lv))}>
                Lv.{lv}
              </button>
            ))}
          </div>
        </div>
        {banner.featured && (
          <div className="filter-row">
            <span className="filter-label">{l('픽업 대상', 'Featured', 'ピックアップ対象')}</span>
            {banner.featured.fixed ? (
              <span className="gacha-fixed">{featured ? localizedText(featured.name, locale) : '-'}</span>
            ) : (
              <select className="gacha-select" value={featured?.key ?? ''} onChange={(e) => setParam('pick', e.target.value)}>
                {featuredChoices.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.rarity} · {localizedText(u.name, locale)}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <p className="field-note">
          {l(
            `1회 비용은 ${costText(1)}입니다. ${unitWord} 뽑기 레벨은 ${unitWord} 뽑기를 누적 ${num(levelDraws[level - 1] ?? 0, locale)}회 하면 Lv.${level}이 됩니다.`,
            `Cost per draw: ${costText(1)}. ${unitWord} Gacha Lv.${level} takes ${num(levelDraws[level - 1] ?? 0, locale)} total ${unitWord} draws.`,
            `1回のコスト: ${costText(1)}。Lv.${level}には累計${num(levelDraws[level - 1] ?? 0, locale)}回のガチャが必要です。`,
          )}
        </p>
        {banner.featured && featuredRate === 0 && (
          <p className="field-note">
            {l(
              `Lv.${level}에서는 픽업 확률이 0%라서 픽업 대상이 나오지 않습니다.`,
              `At Lv.${level} the featured rate is 0%, so the featured unit cannot appear.`,
              `Lv.${level}ではピックアップ確率が0%のため、対象は出ません。`,
            )}
          </p>
        )}
      </div>

      <section className="panel detail-section">
        <h3>{l('뽑기 레벨별 확률', 'Odds by Gacha Level', 'ガチャレベル別確率')}</h3>
        <p className="subtle">
          {l(
            `공개 확률은 등급별 합계입니다. 같은 등급의 ${unitWord}는 모두 같은 확률로 나온다고 보고 나눴습니다.`,
            `Published odds are per rank; each ${unitWord} in a rank is assumed to share it equally.`,
            `公開確率はレア度ごとの合計です。同じレア度の${unitWord}は均等に出ると仮定しています。`,
          )}
        </p>
        <div className="table-scroll">
          <table className="detail-table gacha-rates">
            <thead>
              <tr>
                <th>{l('레벨', 'Level', 'レベル')}</th>
                <th>{l('필요 누적', 'Total draws', '必要累計')}</th>
                {rates.map((r) => (
                  <th key={r.rank}>{rankLabel(r.rank, locale)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GACHA_LEVELS.map((lv) => (
                <tr key={lv} className={lv === level ? 'gacha-row-on' : undefined}>
                  <th>Lv.{lv}</th>
                  <td>{num(levelDraws[lv - 1] ?? 0, locale)}</td>
                  {ratesAt(banner, lv).map((r) => (
                    <td key={r.rank}>{r.pct > 0 ? `${r.pct}%` : '-'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={2}>{l(`Lv.${level} 1종당`, `Lv.${level} each`, `Lv.${level} 1種あたり`)}</th>
                {rates.map((r) => {
                  const n = r.rank === FEATURED_RANK ? 1 : units.filter((u) => u.rarity === r.rank).length
                  return (
                    <td key={r.rank}>
                      {r.pct > 0 && n ? pct(r.pct / 100 / n, locale) : '-'}
                      {r.pct > 0 && n > 1 && <small> /{n}</small>}
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
        {pool.missing.length > 0 && (
          <p className="field-note">
            {l(
              `도감에 해당 등급이 없어 뽑을 수 없는 줄(${pool.missing.map((r) => rankLabel(r, locale)).join(', ')})은 빼고 나머지 확률을 다시 나눴습니다.`,
              `Rows with no unit in the index (${pool.missing.map((r) => rankLabel(r, locale)).join(', ')}) are left out and the rest rescaled.`,
              `図鑑に該当がない行（${pool.missing.map((r) => rankLabel(r, locale)).join(', ')}）は除いて残りを按分しました。`,
            )}
          </p>
        )}
      </section>

      <section className="panel detail-section">
        <h3>{l('나올 확률 계산', 'Chance calculator', '排出確率の計算')}</h3>
        <p className="subtle">
          {l(
            '시뮬레이션이 아니라 공개 확률로 정확히 계산한 값입니다.',
            'Exact values from the published odds, not a simulation.',
            'シミュレーションではなく公開確率から正確に計算した値です。',
          )}
        </p>
        <div className="gacha-inputs">
          <label>
            <span>{l('목표', 'Target', '目標')}</span>
            <select className="gacha-select" value={target?.key ?? ''} onChange={(e) => setTargetKey(e.target.value)}>
              {targetChoices.map((u) => (
                <option key={u.key} value={u.key}>
                  {featured?.key === u.key ? `★ ${rankLabel(FEATURED_RANK, locale)} · ` : `${u.rarity} · `}
                  {localizedText(u.name, locale)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{l('뽑기 횟수', 'Draws', 'ガチャ回数')}</span>
            <input type="number" inputMode="numeric" min={0} max={MAX_DRAWS} value={planText} onChange={(e) => setPlanText(e.target.value)} />
          </label>
          {banner.reportedPity && featured && (
            <label className="gacha-check">
              <input type="checkbox" checked={pityOn} onChange={(e) => setPityOn(e.target.checked)} />
              <span>
                {l(
                  `${num(banner.reportedPity, locale)}회 픽업 확정 적용(공식 확인 안 됨)`,
                  `Apply the reported ${num(banner.reportedPity, locale)}-draw guarantee (unconfirmed)`,
                  `${num(banner.reportedPity, locale)}回ピックアップ確定を適用（公式未確認）`,
                )}
              </span>
            </label>
          )}
        </div>
        {target ? (
          <dl className="detail-stats gacha-stats">
            <div>
              <dt>{l('1회에 나올 확률', 'Per draw', '1回あたり')}</dt>
              <dd>{pct(pTarget, locale)}</dd>
            </div>
            <div>
              <dt>{l(`${num(plan, locale)}회 안에 1번 이상`, `At least once in ${num(plan, locale)}`, `${num(plan, locale)}回で1回以上`)}</dt>
              <dd>{pct(chanceAtLeastOne(pTarget, plan, targetPity), locale, 2)}</dd>
            </div>
            <div>
              <dt>{l('처음 나올 때까지 평균', 'Average draws to first', '初回までの平均')}</dt>
              <dd>{num(expectedDraws(pTarget, targetPity), locale)}</dd>
            </div>
            <div>
              <dt>{l('50% 확률이 되는 횟수', 'Draws for 50%', '50%に必要な回数')}</dt>
              <dd>{num(drawsForChance(pTarget, 0.5, targetPity), locale)}</dd>
            </div>
            <div>
              <dt>{l('90% 확률이 되는 횟수', 'Draws for 90%', '90%に必要な回数')}</dt>
              <dd>{num(drawsForChance(pTarget, 0.9, targetPity), locale)}</dd>
            </div>
            <div>
              <dt>{l(`${topLabel} 1회 확률`, `${topLabel} per draw`, `${topLabel} 1回あたり`)}</dt>
              <dd>{pct(pTop, locale)}</dd>
            </div>
            <div>
              <dt>{l(`${num(plan, locale)}회 안에 ${topLabel} 1번 이상`, `${topLabel} at least once in ${num(plan, locale)}`, `${num(plan, locale)}回で${topLabel}1回以上`)}</dt>
              <dd>{pct(chanceAtLeastOne(pTop, plan), locale, 2)}</dd>
            </div>
            <div>
              <dt>{l(`${topLabel}까지 평균`, `Average draws to ${topLabel}`, `${topLabel}までの平均`)}</dt>
              <dd>{num(expectedDraws(pTop), locale)}</dd>
            </div>
          </dl>
        ) : (
          <p className="no-results">{l(`Lv.${level}에서는 ${topLabel}가 나오지 않습니다.`, `No ${topLabel} at Lv.${level}.`, `Lv.${level}では${topLabel}は出ません。`)}</p>
        )}
        <p className="field-note">
          {l(`${num(plan, locale)}회 비용: ${costText(plan)}.`, `Cost of ${num(plan, locale)} draws: ${costText(plan)}.`, `${num(plan, locale)}回のコスト: ${costText(plan)}。`)}
          {targetPity
            ? l(
                ` 픽업 확정은 커뮤니티에서 말하는 수치이고, 공식 확률 공지에는 없습니다.`,
                ' The guarantee is a community figure; the official odds disclosure does not mention it.',
                ' ピックアップ確定はコミュニティの数値で、公式の確率公開にはありません。',
              )
            : ''}
        </p>
      </section>

      <section className="panel detail-section">
        <h3>{l('뽑기 돌려 보기', 'Try a few draws', 'ガチャを回してみる')}</h3>
        <div className="gacha-inputs">
          <label>
            <span>{l('시드(비우면 매번 다름)', 'Seed (blank = random)', 'シード（空欄で毎回変わる）')}</span>
            <input type="text" value={seedText} onChange={(e) => setSeedText(e.target.value)} placeholder="crumble" />
          </label>
          <label>
            <span>{l('여러 번 뽑기', 'Draw many', 'まとめて回す')}</span>
            <input type="number" inputMode="numeric" min={1} max={MAX_DRAWS} value={countText} onChange={(e) => setCountText(e.target.value)} />
          </label>
        </div>
        <div className="gacha-actions">
          {DRAW_COUNTS.map((n) => (
            <button type="button" key={n} className="gacha-draw" onClick={() => draw(n)} disabled={!pool.entries.length}>
              {l(`${n}회 뽑기`, `Draw ×${n}`, `${n}回引く`)}
            </button>
          ))}
          <button type="button" className="gacha-draw" onClick={() => draw(count)} disabled={!pool.entries.length}>
            {l(`${num(count, locale)}회 뽑기`, `Draw ×${num(count, locale)}`, `${num(count, locale)}回引く`)}
          </button>
          <button type="button" className="text-button" onClick={() => setSim(null)} disabled={!current}>
            {l('기록 지우기', 'Reset', '記録をリセット')}
          </button>
        </div>

        {record ? (
          <>
            <dl className="detail-stats gacha-stats">
              <div>
                <dt>{l('뽑은 횟수', 'Draws', '回数')}</dt>
                <dd>{num(record.draws, locale)}</dd>
              </div>
              <div>
                <dt>{l('쓴 재화', 'Spent', '消費')}</dt>
                <dd className="text-value">{costText(record.draws)}</dd>
              </div>
              {pity && (
                <div>
                  <dt>{l('픽업 확정까지', 'Until guarantee', '確定まで')}</dt>
                  <dd>{num(pity - record.sincePity, locale)}</dd>
                </div>
              )}
            </dl>
            <div className="table-scroll">
              <table className="detail-table">
                <thead>
                  <tr>
                    <th>{l('등급', 'Rank', 'レア度')}</th>
                    <th>{l('횟수', 'Count', '回数')}</th>
                    <th>{l('실제 비율', 'Observed', '実際')}</th>
                    <th>{l('공개 확률', 'Published', '公開確率')}</th>
                  </tr>
                </thead>
                <tbody>
                  {RARITY_ORDER.filter((rank) => pool.entries.some((e) => e.unit.rarity === rank)).map((rank) => {
                    const n = record.byRarity[rank] ?? 0
                    return (
                      <tr key={rank}>
                        <th>
                          <span className={`rarity-badge rarity-${rank.toLowerCase()}`}>{rank}</span>
                        </th>
                        <td>{num(n, locale)}</td>
                        <td>{pct(record.draws ? n / record.draws : 0, locale, 2)}</td>
                        <td>{pct(rankChance(pool, [rank]), locale)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {obtained.length > 0 && (
              <>
                <h4 className="gacha-sub">{l(`얻은 ${topLabel}`, `${topLabel} pulled`, `入手した${topLabel}`)}</h4>
                <ul className="gacha-grid">
                  {obtained.map(({ unit, n }) => (
                    <li key={unit.key} className={featured?.key === unit.key ? 'gacha-card gacha-card-feat' : 'gacha-card'}>
                      <img src={asset(unit.image)} alt="" width="56" height="56" loading="lazy" />
                      <span className="gacha-card-name">{localizedText(unit.name, locale)}</span>
                      <span className="gacha-card-meta">
                        <span className={`rarity-badge rarity-${unit.rarity.toLowerCase()}`}>{unit.rarity}</span> ×{num(n, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {current && current.last.length > 0 && (
              <>
                <h4 className="gacha-sub">
                  {current.lastDraws > current.last.length
                    ? l(`방금 뽑은 결과(앞 ${current.last.length}개)`, `Last pull (first ${current.last.length})`, `直前の結果（先頭${current.last.length}件）`)
                    : l('방금 뽑은 결과', 'Last pull', '直前の結果')}
                </h4>
                <ul className="gacha-grid gacha-grid-small">
                  {current.last.map((r, i) => (
                    <li key={i} className={`gacha-card gacha-rank-${r.rank.toLowerCase()}${r.forced ? ' gacha-card-feat' : ''}`}>
                      <img src={asset(r.unit.image)} alt="" width="40" height="40" loading="lazy" />
                      <span className="gacha-card-name">{localizedText(r.unit.name, locale)}</span>
                      <span className={`rarity-badge rarity-${r.rank.toLowerCase()}`}>{r.forced ? l('확정', 'Pity', '確定') : r.rank}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <p className="result-placeholder">{l('아직 뽑은 결과가 없습니다.', 'Nothing pulled yet.', 'まだ結果はありません。')}</p>
        )}
      </section>
    </div>
  )
}
