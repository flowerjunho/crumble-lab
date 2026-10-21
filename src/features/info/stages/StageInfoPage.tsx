import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { pick, useI18n } from '../../../i18n'
import { ELEMENT, label } from '../../../lib/cookieLabels'
import { formatPercent } from '../../../lib/format'
import { powerPenalty } from '../../../lib/formulas'
import { readTeamPower } from '../../../lib/teamPower'
import { ROUTES } from '../../../routes'
import { PowerChart } from './PowerChart'
import {
  chapterOffline,
  chapterRows,
  chapterSeries,
  eogStagesQuery,
  formatAmount,
  formatCompact,
  formatFull,
  offlineItemName,
  stageExtrasQuery,
} from './stageInfoData'
import './stages.css'

/** 계산기와 같이 쓰는 팀 전투력(M 단위 문자열)을 원 단위로 바꾼다. 없거나 잘못된 값이면 null. */
export function savedTeamPower(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value * 1e6 : null
}

/** 주소의 ?chapter= 값을 1~max 사이 정수로 읽는다. 잘못된 값이면 1챕터. */
export function parseChapter(raw: string | null, max: number): number {
  const value = Number(raw)
  return Number.isInteger(value) && value >= 1 && value <= max ? value : 1
}

export function StageInfoPage() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const [params, setParams] = useSearchParams()
  const stages = useQuery(eogStagesQuery)
  const extras = useQuery(stageExtrasQuery)
  // 팀 전투력은 계산기 화면에서 입력한 값을 그대로 읽기만 한다.
  const [teamPower] = useState(() => savedTeamPower(readTeamPower()))

  const data = stages.data
  const maxChapter = data?._meta.chapters ?? 1
  const chapter = parseChapter(params.get('chapter'), maxChapter)
  const [draft, setDraft] = useState<string | null>(null)

  const series = useMemo(() => (data ? chapterSeries(data) : []), [data])

  const setChapter = (next: number) => {
    const clamped = Math.min(maxChapter, Math.max(1, Math.round(next)))
    setDraft(null)
    const nextParams = new URLSearchParams(params)
    if (clamped === 1) nextParams.delete('chapter')
    else nextParams.set('chapter', String(clamped))
    setParams(nextParams, { replace: true })
  }

  if (stages.isPending) return <p className="result-placeholder">{l('스테이지 정보를 불러오고 있습니다.', 'Loading stages…', 'ステージ情報を読み込み中…')}</p>
  if (stages.isError || !data)
    return (
      <div className="no-results">
        <p>{l('스테이지 정보를 불러오지 못했습니다.', 'Unable to load stages.', 'ステージ情報を読み込めませんでした。')}</p>
        <button type="button" className="text-button" onClick={() => stages.refetch()}>
          {l('다시 시도', 'Retry', '再試行')}
        </button>
      </div>
    )

  const rows = chapterRows(data, chapter)
  const offline = chapterOffline(data, chapter)
  // 이 챕터에서 한 번도 나오지 않는 보상은 줄을 만들지 않는다.
  const offlineItems = data.offline.items
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => offline.some((band) => (band.perHour[index] ?? 0) > 0))
  const bossName = (index: number) => data.bosses[index]?.[locale] ?? '?'
  const advantage = extras.data?.elementAdvantage

  return (
    <div className="stages-page">
      <div className="section-intro">
        <div>
          <h2>{l('스테이지 정보', 'Stage info', 'ステージ情報')}</h2>
          <p>
            {l(
              `1-1부터 ${maxChapter}-30까지 스테이지마다 보스 능력치와 권장 전투력, 자동 사냥 보상을 보여 줍니다.`,
              `Boss stats, recommended Power and idle rewards for every stage from 1-1 to ${maxChapter}-30.`,
              `1-1から${maxChapter}-30まで、ステージごとのボス能力値・推奨戦闘力・自動狩り報酬を表示します。`,
            )}
          </p>
        </div>
      </div>

      <section className="panel" aria-labelledby="stages-chart-title">
        <h3 id="stages-chart-title">{l('챕터별 권장 전투력', 'Recommended Power by chapter', '章ごとの推奨戦闘力')}</h3>
        <p className="subtle">
          {l(
            '권장 전투력은 피해 100%를 내는 데 필요한 팀 전투력입니다. 값의 차이가 커서 세로축을 로그 눈금으로 그렸습니다.',
            'Recommended Power is the team Power needed for 100% damage. The vertical axis is logarithmic because the values span many orders of magnitude.',
            '推奨戦闘力はダメージ100%に必要なチーム戦闘力です。値の幅が大きいため縦軸は対数目盛です。',
          )}
        </p>
        <PowerChart points={series} selected={chapter} onSelect={setChapter} teamPower={teamPower} />
      </section>

      <section className="panel" aria-labelledby="stages-table-title">
        <div className="stages-table-head">
          <h3 id="stages-table-title">{l(`${chapter}챕터 스테이지`, `Chapter ${chapter} stages`, `${chapter}章のステージ`)}</h3>
          <form
            className="stages-picker"
            onSubmit={(e) => {
              e.preventDefault()
              if (draft !== null && draft !== '') setChapter(Number(draft))
            }}
          >
            <button type="button" className="stages-step" onClick={() => setChapter(chapter - 1)} disabled={chapter <= 1} aria-label={l('이전 챕터', 'Previous chapter', '前の章')}>
              ‹
            </button>
            <label>
              <span className="filter-label">{l('챕터', 'Chapter', '章')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={maxChapter}
                value={draft ?? String(chapter)}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  if (draft !== null && draft !== '') setChapter(Number(draft))
                  else setDraft(null)
                }}
              />
            </label>
            <button type="button" className="stages-step" onClick={() => setChapter(chapter + 1)} disabled={chapter >= maxChapter} aria-label={l('다음 챕터', 'Next chapter', '次の章')}>
              ›
            </button>
          </form>
        </div>
        <p className="subtle">
          {l(
            '보스 체력은 한 마리 기준입니다. 명중과 집중은 적중률·디버프 적용률(기본 적용률 100%)을 100%로 만드는 데 필요한 값입니다.',
            'Boss HP is per boss. Accuracy and Focus are the values needed for a 100% hit rate and a 100% debuff rate (at a 100% base rate).',
            'ボスHPは1体あたりです。命中と集中は命中率・デバフ適用率(基本適用率100%)を100%にするために必要な値です。',
          )}
          {teamPower !== null &&
            l(
              ' 피해 배율은 계산기에 입력한 팀 전투력으로 구했습니다.',
              ' Damage rate uses the team Power you entered in the calculator.',
              ' ダメージ倍率は計算機に入力したチーム戦闘力で求めました。',
            )}
        </p>
        <div className="table-scroll">
          <table className="detail-table stages-table">
            <thead>
              <tr>
                <th scope="col">{l('스테이지', 'Stage', 'ステージ')}</th>
                <th scope="col">{l('보스', 'Boss', 'ボス')}</th>
                <th scope="col">{l('권장 전투력', 'Rec. Power', '推奨戦闘力')}</th>
                {teamPower !== null && <th scope="col">{l('피해 배율', 'Damage rate', 'ダメージ倍率')}</th>}
                <th scope="col">{l('명중', 'Accuracy', '命中')}</th>
                <th scope="col">{l('집중', 'Focus', '集中')}</th>
                <th scope="col">{l('적 명중', 'Enemy Accuracy', '敵の命中')}</th>
                <th scope="col">{l('보스 체력', 'Boss HP', 'ボスHP')}</th>
                <th scope="col">{l('보스 공격력', 'Boss ATK', 'ボス攻撃力')}</th>
                <th scope="col">{l('보스 방어력', 'Boss DEF', 'ボス防御力')}</th>
                <th scope="col">{l('보스까지 처치 수', 'Kills to boss', 'ボスまでの撃破数')}</th>
                <th scope="col">{l('보스전 제한 시간', 'Boss time limit', 'ボス戦の制限時間')}</th>
                <th scope="col">
                  <span className="sr-only">{l('계산기', 'Calculator', '計算機')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const [ch, st, power, accuracy, focus, enemyAccuracy, bossIndex, spawns, hp, atk, def, kills, time] = row
                const penalty = teamPower !== null ? powerPenalty(teamPower, power) : null
                return (
                  <tr key={st}>
                    <th scope="row">
                      {ch}-{st}
                    </th>
                    <td className="stages-boss">
                      {bossName(bossIndex)}
                      {spawns > 1 && <small> ×{spawns}</small>}
                    </td>
                    <td title={formatFull(power, locale)}>{formatCompact(power, locale, 4)}</td>
                    {penalty && (
                      <td className={penalty.multiplier >= 1 ? 'stages-ok' : 'stages-short'}>{formatPercent(penalty.multiplier)}</td>
                    )}
                    <td>{formatFull(Math.ceil(accuracy), locale)}</td>
                    <td>{formatFull(Math.ceil(focus), locale)}</td>
                    <td>{formatFull(enemyAccuracy, locale)}</td>
                    <td title={formatFull(hp, locale)}>{formatCompact(hp, locale, 4)}</td>
                    <td title={formatFull(atk, locale)}>{formatCompact(atk, locale, 4)}</td>
                    <td>{def === null ? '–' : formatFull(def, locale)}</td>
                    <td>{kills === null ? '–' : formatFull(kills, locale)}</td>
                    <td>{time === null ? '–' : l(`${time}초`, `${time}s`, `${time}秒`)}</td>
                    <td>
                      <Link
                        className="stages-calc-link"
                        to={`${ROUTES.stage}?ch=${ch}&st=${st}`}
                        aria-label={l(`${ch}-${st} 계산기에서 보기`, `Open ${ch}-${st} in the calculator`, `${ch}-${st}を計算機で見る`)}
                      >
                        {l('계산기', 'Calc', '計算')}
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="field-note">
          {l(
            '숫자를 줄여 표시한 칸은 가리키면 전체 값이 나옵니다. 계산기를 누르면 그 스테이지가 골라진 상태로 스테이지 계산이 열립니다.',
            'Shortened numbers show the full value on hover. Calc opens the stage calculator with that stage selected.',
            '短く表示した数値はカーソルを合わせると全桁が出ます。「計算」を押すとそのステージを選んだ状態でステージ計算が開きます。',
          )}
        </p>
      </section>

      <section className="panel" aria-labelledby="stages-offline-title">
        <h3 id="stages-offline-title">{l(`${chapter}챕터 자동 사냥 보상`, `Chapter ${chapter} idle rewards`, `${chapter}章の自動狩り報酬`)}</h3>
        <p className="subtle">
          {l(
            '머물러 있는 스테이지에 따라 1시간 동안 쌓이는 양입니다. 같은 챕터 안에서도 스테이지 구간마다 달라질 수 있습니다.',
            'What builds up per hour while you sit on a stage. It can change between stage ranges within a chapter.',
            '滞在中のステージで1時間に貯まる量です。同じ章の中でもステージ区間ごとに変わることがあります。',
          )}
        </p>
        {offline.length ? (
          <div className="table-scroll">
            <table className="detail-table stages-offline">
              <thead>
                <tr>
                  <th scope="col">{l('보상', 'Reward', '報酬')}</th>
                  {offline.map((band) => (
                    <th scope="col" key={band.fromStage}>
                      {band.fromStage === band.toStage
                        ? `${chapter}-${band.fromStage}`
                        : `${chapter}-${band.fromStage} ~ ${chapter}-${band.toStage}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {offlineItems.map(({ item, index }) => (
                  <tr key={item.name}>
                    <th scope="row">{offlineItemName(item.name, locale)}</th>
                    {offline.map((band) => {
                      const value = band.perHour[index] ?? 0
                      return <td key={band.fromStage}>{value > 0 ? formatAmount(value, locale) : '–'}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="no-results">{l('이 챕터의 자동 사냥 보상 정보가 없습니다.', 'No idle reward data for this chapter.', 'この章の自動狩り報酬データはありません。')}</p>
        )}
      </section>

      {advantage && (
        <section className="panel" aria-labelledby="stages-element-title">
          <h3 id="stages-element-title">{l('속성 상성', 'Element advantage', '属性相性')}</h3>
          <p className="subtle">
            {l(
              `유리한 속성의 적을 공격하면 피해가 ${advantage.bonusPercent}% 늘어납니다. 메인 스테이지 보스는 모두 속성이 없습니다.`,
              `Hitting an enemy of the element you beat adds ${advantage.bonusPercent}% damage. Every main-stage boss has no element.`,
              `有利な属性の敵を攻撃するとダメージが${advantage.bonusPercent}%増えます。メインステージのボスはすべて無属性です。`,
            )}
          </p>
          <div className="table-scroll">
            <table className="detail-table stages-element">
              <thead>
                <tr>
                  <th scope="col">{l('속성', 'Element', '属性')}</th>
                  <th scope="col">{l(`유리한 상대 (피해 +${advantage.bonusPercent}%)`, `Strong against (+${advantage.bonusPercent}% DMG)`, `有利な相手(ダメージ+${advantage.bonusPercent}%)`)}</th>
                  <th scope="col">{l('불리한 상대', 'Weak against', '不利な相手')}</th>
                </tr>
              </thead>
              <tbody>
                {advantage.rows.map((row) => (
                  <tr key={row.element}>
                    <th scope="row">
                      <span className={`stages-el stages-el-${row.element}`}>{label(ELEMENT, row.element, locale)}</span>
                    </th>
                    <td>{label(ELEMENT, row.strongAgainst, locale)}</td>
                    <td>{label(ELEMENT, row.weakAgainst, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="field-note">
        {l(
          `EOG.GG가 게임 클라이언트에서 읽어 공개한 값을 정리했습니다(${data._meta.fetchedAt} 기준). 개발사가 공개한 공식 표는 아닙니다.`,
          `Compiled from values EOG.GG read from the game client (as of ${data._meta.fetchedAt}). Not an official table from the developer.`,
          `EOG.GGがゲームクライアントから読み取って公開した値をまとめました(${data._meta.fetchedAt}時点)。開発元の公式表ではありません。`,
        )}
      </p>
    </div>
  )
}
