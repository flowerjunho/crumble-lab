import type { ReactNode } from 'react'
import { pick, useI18n } from '../../../i18n'
import { localizedText } from '../../../lib/localize'
import type { CookieEntry } from '../../../types'
import { formatCompact, formatFull } from '../stages/stageInfoData'
import { DamageChart, chartSeries } from './DamageChart'
import type { SimResult } from './engine'
import { STRIKE_NAME, label } from './simLabels'

/** 이 화면이 모형이라는 안내. 두 시뮬레이터 화면 맨 위에 같은 문구를 쓴다. */
export function ModelNotice() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  return (
    <div className="panel sim-notice" role="note">
      <strong>{l('게임이 아니라 모형입니다.', 'This is a model, not the game.', 'ゲームではなくモデルです。')}</strong>{' '}
      {l(
        '공개된 전투 수치로 전투 흐름을 흉내 낸 계산이라, 실제 결과와 다를 수 있습니다. 같은 조건에서 출전 쿠키나 설정을 바꿔 가며 어느 쪽이 나은지 비교하는 데 쓰세요.',
        'It replays a fight from published combat numbers, so a real run can differ. Use it to compare lineups and settings under the same conditions.',
        '公開された戦闘数値で戦闘の流れを再現した計算なので、実際の結果とは異なる場合があります。同じ条件で出撃クッキーや設定を変えて比較するのに使ってください。',
      )}
    </div>
  )
}

interface Props {
  result: SimResult
  cookies: CookieEntry[]
  /** 맨 위 요약 칸들 */
  summary: { label: string; value: ReactNode; tone?: 'good' | 'warn' }[]
  markers?: { t: number; label: string }[]
  /** 점수 모드면 보스에게 준 피해와 소환된 적에게 준 피해를 나눠 보여 준다 */
  splitAdds?: boolean
}

export function ResultView({ result, cookies, summary, markers, splitAdds }: Props) {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const nameOf = (i: number) => {
    const eid = result.rows[i]?.eid
    const cookie = cookies.find((c) => c.eid === eid)
    return cookie ? localizedText(cookie.name, locale) : (eid ?? '')
  }
  const series = chartSeries(result, nameOf, l('나머지 쿠키', 'Everyone else', 'その他のクッキー'))
  const total = result.totalDamage
  const seconds = Math.max(STEP_FLOOR, result.elapsed)
  const rows = result.rows.map((row, i) => ({ row, i })).sort((a, b) => b.row.damage - a.row.damage)
  const fmt = (v: number) => formatCompact(v, locale)
  const died = result.rows.filter((r) => r.diedAt !== null)
  const causes = new Map<string, number>()
  for (const r of died) causes.set(r.killedBy ?? 'add', (causes.get(r.killedBy ?? 'add') ?? 0) + 1)

  return (
    <>
      <section className="panel sim-panel">
        <h3>{l('결과', 'Result', '結果')}</h3>
        <dl className="detail-stats sim-summary">
          {summary.map((item) => (
            <div key={item.label} className={item.tone ? `sim-tone-${item.tone}` : undefined}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
        {died.length > 0 && (
          <p className="field-note">
            {l(
              `쓰러진 쿠키 ${died.length}명: `,
              `${died.length} Cookies fell: `,
              `倒れたクッキー${died.length}人: `,
            )}
            {[...causes.entries()].map(([cause, n]) => `${label(STRIKE_NAME, cause, locale)} ${n}`).join(', ')}
          </p>
        )}
      </section>

      <section className="panel sim-panel">
        <h3>{l('시간에 따른 쿠키별 피해', 'Damage per Cookie over time', '時間ごとのクッキー別ダメージ')}</h3>
        <p className="subtle">
          {l(
            '띠 하나가 쿠키 한 명의 누적 피해이고, 맨 위 선이 팀 전체입니다. 피해가 큰 6명은 따로, 나머지는 한 띠로 묶었습니다.',
            'Each band is one Cookie’s running total and the top edge is the whole team. The six biggest hitters get their own band; the rest share one.',
            '帯1本がクッキー1人の累計ダメージで、一番上の線がチーム全体です。ダメージが大きい6人は個別に、残りは1本にまとめました。',
          )}
        </p>
        <DamageChart result={result} series={series} markers={markers} />
      </section>

      <section className="panel sim-panel">
        <h3>{l('쿠키별 기록', 'Per-Cookie record', 'クッキー別記録')}</h3>
        <div className="table-scroll">
          <table className="detail-table sim-table">
            <thead>
              <tr>
                <th scope="col">{l('쿠키', 'Cookie', 'クッキー')}</th>
                <th scope="col">{l('피해', 'Damage', 'ダメージ')}</th>
                <th scope="col">{l('비중', 'Share', '割合')}</th>
                <th scope="col">{l('초당 피해', 'DPS', '秒間ダメージ')}</th>
                {splitAdds && <th scope="col">{l('소환된 적에게', 'On adds', '召喚された敵へ')}</th>}
                <th scope="col">{l('시전', 'Casts', '発動')}</th>
                <th scope="col">{l('첫 시전', 'First cast', '初発動')}</th>
                <th scope="col">{l('회복·보호막', 'Heal / shield', '回復・シールド')}</th>
                <th scope="col">{l('쓰러진 시각', 'Fell at', '倒れた時刻')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ row, i }) => (
                <tr key={`${row.eid}-${i}`}>
                  <th scope="row">{nameOf(i)}</th>
                  <td>{fmt(row.damage)}</td>
                  <td>{total > 0 ? `${((row.damage / total) * 100).toFixed(1)}%` : '0%'}</td>
                  <td>{fmt(row.damage / seconds)}</td>
                  {splitAdds && <td>{fmt(row.damage - row.bossDamage)}</td>}
                  <td>{formatFull(row.casts, locale)}</td>
                  <td>{row.firstCastAt === null ? '—' : l(`${row.firstCastAt.toFixed(2)}초`, `${row.firstCastAt.toFixed(2)} s`, `${row.firstCastAt.toFixed(2)}秒`)}</td>
                  <td>{row.healing + row.shielding > 0 ? fmt(row.healing + row.shielding) : '—'}</td>
                  <td>
                    {row.diedAt === null
                      ? '—'
                      : l(`${row.diedAt.toFixed(2)}초`, `${row.diedAt.toFixed(2)} s`, `${row.diedAt.toFixed(2)}秒`)}
                    {row.killedBy && <small> {label(STRIKE_NAME, row.killedBy, locale)}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

/** 0초로 나누지 않도록 */
const STEP_FLOOR = 0.05
