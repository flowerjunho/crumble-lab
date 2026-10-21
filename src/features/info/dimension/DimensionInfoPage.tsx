import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { pick, useI18n } from '../../../i18n'
import { localizedText } from '../../../lib/localize'
import { ROUTES } from '../../../routes'
import type { Locale } from '../../../types'
import {
  FRAGMENT,
  bossAt,
  cumulativeFragments,
  dimensionInfoQuery,
  formatKst,
  isSpecialStage,
  rankLabel,
  rewardTotals,
  seasonPhase,
  seasonStatus,
  splitDuration,
  stagesOfBoss,
  type DimensionInfo,
  type DimensionReward,
} from './dimensionInfo'
import './dimension.css'

type Labels = Record<Locale, string>
const L = (ko: string, en: string, ja: string): Labels => ({ ko, en, ja })

// 차원의 힘 레벨이 올려 주는 능력치(국내 데이터 위키 cc.team-hobby.com 차원의 힘 표, 펫 도감 표기와 같다)
const ENERGY_STAT: Record<string, Labels> = {
  atk: L('공격력', 'ATK', '攻撃力'),
  def: L('방어력', 'DEF', '防御力'),
  hp: L('체력', 'HP', 'HP'),
  critRate: L('치명확률', 'CRIT Rate', '会心率'),
  critDamage: L('치명피해', 'CRIT DMG', '会心ダメージ'),
  accuracy: L('명중', 'Accuracy', '命中'),
  focus: L('집중', 'Focus', '集中'),
}

// 시즌이 끝나면 한 시간 반 정도 정산 시간이 있어서, 남은 시간은 1분마다 다시 계산한다.
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

export function DimensionInfoPage() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const now = useNow()
  const { data, isPending, isError, refetch } = useQuery(dimensionInfoQuery)
  const [picked, setPicked] = useState<number | null>(null)

  if (isPending) return <p className="result-placeholder">{l('차원의 이면 정보를 불러오고 있습니다.', 'Loading Dimension info…', '次元の裏側の情報を読み込み中…')}</p>
  if (isError)
    return (
      <div className="no-results">
        <p>{l('차원의 이면 정보를 불러오지 못했습니다.', 'Unable to load Dimension info.', '次元の裏側の情報を読み込めませんでした。')}</p>
        <button type="button" className="text-button" onClick={() => refetch()}>
          {l('다시 시도', 'Retry', '再試行')}
        </button>
      </div>
    )

  const { current, next } = seasonStatus(data.seasons, now)
  // 보상·보스 표는 사용자가 고른 순환, 아니면 지금(정산 중이면 다음) 시즌의 순환을 보여 준다.
  const liveRotation = (current ?? next)?.rotation ?? data.rotations.at(-1)?.rotation ?? 1
  const rotationNo = picked ?? liveRotation
  const rotation = data.rotations.find((r) => r.rotation === rotationNo) ?? data.rotations[0]
  if (!rotation) return null

  return (
    <div className="dimension-info">
      <div className="section-intro">
        <div>
          <h2>{l('차원의 이면', 'Dimension', '次元の裏側')}</h2>
          <p>
            {l(
              '시즌 일정과 단계별 보상, 랭킹 보상, 보스 순서를 한곳에 모았습니다. 시각은 모두 한국 시간입니다.',
              'Season dates, stage rewards, ranking rewards and the boss order in one place. All times are KST.',
              'シーズン日程、ステージ報酬、ランキング報酬、ボスの順番をまとめました。時刻はすべて韓国時間です。',
            )}
          </p>
        </div>
        <Link className="text-button" to={ROUTES.dimension}>
          {l('단계 계산기로 가기', 'Open stage calculator', 'ステージ計算へ')}
        </Link>
      </div>

      <SeasonNow data={data} now={now} />
      <SeasonSchedule data={data} now={now} />

      {data.rotations.length > 1 && (
        <div className="panel dimension-info-rotations" role="group" aria-label={l('보스 순환 선택', 'Choose rotation', 'ボス循環の選択')}>
          <span className="filter-label">{l('보스 순환', 'Rotation', 'ボス循環')}</span>
          <div className="filter-chips">
            {data.rotations.map((r) => (
              <button type="button" key={r.rotation} aria-pressed={r.rotation === rotationNo} onClick={() => setPicked(r.rotation)}>
                {seasonRange(r.firstSeason, r.lastSeason, locale)}
                {r.rotation === liveRotation && ` · ${l('현재', 'now', '現在')}`}
              </button>
            ))}
          </div>
        </div>
      )}

      <StageRewards data={data} rotationNo={rotation.rotation} />
      <BossRotation data={data} rotationNo={rotation.rotation} />
      <RankRewards data={data} />
      <EnergyLevels data={data} />
    </div>
  )
}

/** 시즌 범위 이름: '시즌 1', '시즌 2 이후' */
function seasonRange(first: number, last: number, locale: Locale): string {
  if (first === last) return pick(locale, `시즌 ${first}`, `Season ${first}`, `シーズン${first}`)
  return pick(locale, `시즌 ${first}부터`, `Season ${first} onward`, `シーズン${first}以降`)
}

function RewardList({ rewards, data }: { rewards: DimensionReward[]; data: DimensionInfo }) {
  const { locale } = useI18n()
  return (
    <span className="dimension-info-rewards">
      {rewards.map((r) => (
        <span key={r.item} className={r.item === FRAGMENT ? undefined : 'is-special'}>
          {localizedText(data.items[r.item], locale) || r.item} <b>×{r.qty.toLocaleString(locale)}</b>
        </span>
      ))}
    </span>
  )
}

function SeasonNow({ data, now }: { data: DimensionInfo; now: number }) {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const { current, next } = seasonStatus(data.seasons, now)
  const left = (iso: string) => {
    const { days, hours, minutes } = splitDuration(Date.parse(iso) - now)
    return l(
      days ? `${days}일 ${hours}시간 남음` : `${hours}시간 ${minutes}분 남음`,
      days ? `${days}d ${hours}h left` : `${hours}h ${minutes}m left`,
      days ? `残り${days}日${hours}時間` : `残り${hours}時間${minutes}分`,
    )
  }

  return (
    <section className="panel detail-section" aria-labelledby="dimension-now-title">
      <h3 id="dimension-now-title">{l('지금 시즌', 'Current season', '現在のシーズン')}</h3>
      <dl className="detail-stats">
        <div>
          <dt>{l('진행 중', 'In progress', '開催中')}</dt>
          <dd className={current ? undefined : 'text-value'}>
            {current ? l(`시즌 ${current.season}`, `Season ${current.season}`, `シーズン${current.season}`) : l('정산 중', 'Settling', '精算中')}
          </dd>
        </div>
        {current && (
          <div>
            <dt>{l('종료', 'Ends', '終了')}</dt>
            <dd className="text-value">
              {formatKst(current.end)}
              <br />
              <small className="subtle">{left(current.end)}</small>
            </dd>
          </div>
        )}
        {next && (
          <div>
            <dt>{l(`다음 시즌 ${next.season} 시작`, `Season ${next.season} starts`, `次のシーズン${next.season}開始`)}</dt>
            <dd className="text-value">
              {formatKst(next.start)}
              <br />
              <small className="subtle">{left(next.start)}</small>
            </dd>
          </div>
        )}
      </dl>
      <p className="field-note">
        {l(
          '시즌이 끝나면 차원의 힘 레벨과 단계 진행도, 랭킹이 초기화됩니다. 시즌이 끝나고 다음 시즌이 열리기 전까지는 랭킹 정산 시간입니다.',
          'When a season ends, Dimensional energy level, stage progress and ranking reset. The gap before the next season is the ranking settlement window.',
          'シーズンが終わると次元の力のレベル、ステージ進行、ランキングがリセットされます。次のシーズンが始まるまではランキングの精算時間です。',
        )}
      </p>
    </section>
  )
}

function SeasonSchedule({ data, now }: { data: DimensionInfo; now: number }) {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const phaseText = { past: l('종료', 'Ended', '終了'), current: l('진행 중', 'Live', '開催中'), upcoming: l('예정', 'Upcoming', '予定') }

  return (
    <section className="panel detail-section" aria-labelledby="dimension-schedule-title">
      <h3 id="dimension-schedule-title">{l('시즌 일정', 'Season schedule', 'シーズン日程')}</h3>
      <div className="table-scroll dimension-info-tall" tabIndex={0} role="region" aria-labelledby="dimension-schedule-title">
        <table className="detail-table">
          <thead>
            <tr>
              <th scope="col">{l('시즌', 'Season', 'シーズン')}</th>
              <th scope="col">{l('시작', 'Start', '開始')}</th>
              <th scope="col">{l('종료', 'End', '終了')}</th>
              <th scope="col">{l('보스 순환', 'Rotation', 'ボス循環')}</th>
              <th scope="col">{l('상태', 'Status', '状態')}</th>
            </tr>
          </thead>
          <tbody>
            {data.seasons.map((s) => {
              const phase = seasonPhase(s, now)
              return (
                <tr key={s.season} className={`is-${phase}`} aria-current={phase === 'current' ? 'true' : undefined}>
                  <th scope="row">{s.season}</th>
                  <td>{formatKst(s.start)}</td>
                  <td>{formatKst(s.end)}</td>
                  <td>{s.rotation}</td>
                  <td>{phaseText[phase]}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="field-note">
        {l(
          '게임 데이터에 들어 있는 일정을 그대로 옮겼습니다. 아직 공지되지 않은 시즌은 점검 일정에 따라 바뀔 수 있습니다.',
          'Copied from the schedule in the game data. Seasons not yet announced may move with maintenance.',
          'ゲームデータの日程をそのまま載せています。未告知のシーズンはメンテナンスにより変わる場合があります。',
        )}
      </p>
    </section>
  )
}

function StageRewards({ data, rotationNo }: { data: DimensionInfo; rotationNo: number }) {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const rotation = data.rotations.find((r) => r.rotation === rotationNo)
  if (!rotation) return null
  const cumulative = cumulativeFragments(rotation.stages)
  const totals = rewardTotals(rotation.stages)
  const bossName = (key: string) => {
    const boss = data.bosses.find((b) => b.key === key)
    return boss ? `${localizedText(boss.name, locale)}${boss.bodies > 1 ? ` ×${boss.bodies}` : ''}` : key
  }
  const last = rotation.stages.at(-1)

  return (
    <section className="panel detail-section" aria-labelledby="dimension-rewards-title">
      <h3 id="dimension-rewards-title">
        {l('단계별 첫 클리어 보상', 'First-clear rewards by stage', 'ステージ別の初回クリア報酬')}{' '}
        <small className="subtle">{seasonRange(rotation.firstSeason, rotation.lastSeason, locale)}</small>
      </h3>
      <dl className="detail-stats">
        {totals.map((t) => (
          <div key={t.item}>
            <dt>{localizedText(data.items[t.item], locale) || t.item}</dt>
            <dd>{t.qty.toLocaleString(locale)}</dd>
          </div>
        ))}
      </dl>
      <p className="field-note">
        {l(
          `${rotation.stages.length}단계를 모두 처음 클리어했을 때 받는 보상의 합계입니다. 차원의 조각이 아닌 보상이 걸린 단계는 색을 넣어 표시했습니다.`,
          `Totals for first-clearing all ${rotation.stages.length} stages. Stages that pay something other than Dimension Fragments are highlighted.`,
          `${rotation.stages.length}ステージをすべて初回クリアしたときの報酬合計です。Dimension Fragment以外の報酬があるステージは色付きで示しています。`,
        )}
      </p>
      <div className="table-scroll dimension-info-tall" tabIndex={0} role="region" aria-labelledby="dimension-rewards-title">
        <table className="detail-table dimension-info-stages">
          <thead>
            <tr>
              <th scope="col">{l('단계', 'Stage', 'ステージ')}</th>
              <th scope="col">{l('보스', 'Boss', 'ボス')}</th>
              <th scope="col">{l('첫 클리어 보상', 'First clear', '初回クリア')}</th>
              <th scope="col">{l('누적 차원의 조각', 'Fragments so far', 'Fragment累計')}</th>
              <th scope="col">{l('방치 보상(분당 차원의 힘)', 'Idle (energy/min)', '放置報酬(毎分)')}</th>
            </tr>
          </thead>
          <tbody>
            {rotation.stages.map((s, i) => (
              <tr key={s.stage} className={isSpecialStage(s) ? 'is-special' : undefined}>
                <th scope="row">{s.stage}</th>
                <td className="dimension-info-boss">{bossName(bossAt(rotation, s.stage))}</td>
                <td className="dimension-info-reward">
                  <RewardList rewards={s.rewards} data={data} />
                </td>
                <td>{(cumulative[i] ?? 0).toLocaleString(locale)}</td>
                <td>{s.idlePerMinute.toLocaleString(locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {last && (
        <p className="field-note">
          {l(
            `방치 보상은 도달한 단계에 머무르는 동안 1분마다 쌓이며, ${last.stage}단계에서는 1시간에 ${(last.idlePerMinute * 60).toLocaleString(locale)}만큼 쌓입니다.`,
            `Idle energy accrues every minute on your current stage: ${(last.idlePerMinute * 60).toLocaleString(locale)} per hour at stage ${last.stage}.`,
            `放置報酬は到達したステージで毎分たまり、${last.stage}ステージでは1時間に${(last.idlePerMinute * 60).toLocaleString(locale)}たまります。`,
          )}
        </p>
      )}
    </section>
  )
}

function BossRotation({ data, rotationNo }: { data: DimensionInfo; rotationNo: number }) {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const rotation = data.rotations.find((r) => r.rotation === rotationNo)
  if (!rotation) return null
  const previous = data.rotations.find((r) => r.rotation === rotationNo - 1)
  const stageList = (stages: number[]) =>
    stages.length > 5 ? `${stages.slice(0, 4).join(', ')} … ${stages.at(-1)}` : stages.join(', ')

  return (
    <section className="panel detail-section" aria-labelledby="dimension-boss-title">
      <h3 id="dimension-boss-title">
        {l('보스 순서', 'Boss order', 'ボスの順番')} <small className="subtle">{seasonRange(rotation.firstSeason, rotation.lastSeason, locale)}</small>
      </h3>
      <p className="field-note">
        {l(
          `1단계부터 아래 ${rotation.cycle.length}종이 순서대로 돌아가며 나옵니다.`,
          `From stage 1, these ${rotation.cycle.length} bosses repeat in this order.`,
          `1ステージから次の${rotation.cycle.length}種が順番に繰り返し登場します。`,
        )}
      </p>
      <ol className="dimension-info-cycle">
        {rotation.cycle.map((key) => {
          const boss = data.bosses.find((b) => b.key === key)
          if (!boss) return null
          const isNew = previous ? !previous.cycle.includes(key) : false
          return (
            <li key={key}>
              <div className="dimension-info-cycle-head">
                <strong>{localizedText(boss.name, locale)}</strong>
                {boss.bodies > 1 && <span className="subtle">×{boss.bodies}</span>}
                {isNew && <span className="dimension-info-new">{l('새 보스', 'New', '新ボス')}</span>}
              </div>
              {boss.adds.map((add) => (
                <p key={add.name.en} className="subtle">
                  {l(
                    `${localizedText(add.name, locale)} ${add.count}마리가 함께 나옵니다.`,
                    `Comes with ${add.count} ${localizedText(add.name, locale)}.`,
                    `${localizedText(add.name, locale)}${add.count}体が一緒に登場します。`,
                  )}
                </p>
              ))}
              <p className="dimension-info-cycle-stages">
                {l('단계', 'Stages', 'ステージ')} {stageList(stagesOfBoss(rotation, key))}
              </p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function RankRewards({ data }: { data: DimensionInfo }) {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  return (
    <section className="panel detail-section" aria-labelledby="dimension-rank-title">
      <h3 id="dimension-rank-title">{l('랭킹 보상', 'Ranking rewards', 'ランキング報酬')}</h3>
      <div className="table-scroll">
        <table className="detail-table">
          <thead>
            <tr>
              <th scope="col">{l('순위', 'Rank', '順位')}</th>
              <th scope="col">{l('시즌 보상', 'Season', 'シーズン報酬')}</th>
              <th scope="col">{l('일일 보상', 'Daily', '日次報酬')}</th>
            </tr>
          </thead>
          <tbody>
            {data.rank.map((row, i) => (
              <tr key={row.rank ?? 'all'}>
                <th scope="row">{rankLabel(data.rank, i, locale)}</th>
                <td className="dimension-info-reward">
                  <RewardList rewards={row.season} data={data} />
                </td>
                <td className="dimension-info-reward">
                  <RewardList rewards={row.daily} data={data} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="field-note">
        {l(
          '순위는 클리어한 가장 높은 단계로 정하고, 단계가 같으면 더 빨리 클리어한 사람이 앞섭니다. 참여 보상은 순위 구간 밖이어도 도전한 사람 모두가 받습니다.',
          'Rank is set by the highest stage cleared, with faster clears ahead on ties. Everyone who takes part gets the participation reward.',
          '順位はクリアした最高ステージで決まり、同じ場合は先にクリアした人が上位です。参加報酬は挑戦した全員が受け取れます。',
        )}
      </p>
    </section>
  )
}

function EnergyLevels({ data }: { data: DimensionInfo }) {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const { stats, levels } = data.energy

  return (
    <section className="panel detail-section" aria-labelledby="dimension-energy-title">
      <h3 id="dimension-energy-title">{l('차원의 힘 레벨별 능력치', 'Dimensional energy level bonuses', '次元の力のレベル別能力値')}</h3>
      <p className="field-note">
        {l(
          '차원의 힘 레벨을 올리면 차원의 이면에서만 쿠키 능력치가 오릅니다. 표의 증가량은 앞 레벨과의 차이가 아니라 그 레벨에서 받는 전체 증가량입니다.',
          'Dimensional energy levels raise Cookie stats inside Dimension only. Each bonus is the total at that level, not the step from the previous one.',
          '次元の力のレベルを上げると、次元の裏側の中でだけクッキーの能力値が上がります。増加量は前のレベルとの差ではなく、そのレベルでの合計です。',
        )}
      </p>
      <div className="table-scroll dimension-info-tall" tabIndex={0} role="region" aria-labelledby="dimension-energy-title">
        <table className="detail-table">
          <thead>
            <tr>
              <th scope="col">{l('레벨', 'Level', 'レベル')}</th>
              <th scope="col">{l('누적 차원의 힘', 'Total energy', '累計次元の力')}</th>
              {stats.map((key) => (
                <th scope="col" key={key}>
                  {ENERGY_STAT[key]?.[locale] ?? key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {levels.map(([level = 0, total = 0, ...bonus]) => (
              <tr key={level} className={level % 10 === 0 ? 'is-mark' : undefined}>
                <th scope="row">{level}</th>
                <td>{total.toLocaleString(locale)}</td>
                {bonus.map((value, i) => (
                  <td key={stats[i] ?? i}>{value ? `+${value}%` : '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
