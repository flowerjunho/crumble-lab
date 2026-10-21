import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pick, useI18n } from '../../../i18n'
import { clampLevel, clampStep, maxStep, planResolve, resolveQuery, stepInfo, type ResolveData } from './resolve'
import './systems.css'

const PAGE = 50
const num = (value: number) => Math.round(value).toLocaleString('en-US')

/** 단계를 다 채웠을 때까지의 누적 능력치·코인(능력치 3개 합)을 한 번에 계산한다. */
function cumulativeRows(data: ResolveData) {
  const rows = []
  let atk = 0
  let def = 0
  let hp = 0
  let coins = 0
  for (let step = 1; step <= maxStep(data); step++) {
    const info = stepInfo(data, step)
    if (!info) break
    atk += info.levels * info.atk
    def += info.levels * info.def
    hp += info.levels * info.hp
    const stepCoins = info.levels * info.unitCost * 3
    coins += stepCoins
    rows.push({ ...info, stepCoins, total: { atk, def, hp, coins } })
  }
  return rows
}

export function ResolvePage() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const { data, isPending, isError, refetch } = useQuery(resolveQuery)

  const rows = useMemo(() => (data ? cumulativeRows(data) : []), [data])
  const [from, setFrom] = useState({ step: 1, level: 0 })
  const [to, setTo] = useState({ step: 51, level: 0 })
  const [page, setPage] = useState(0)

  if (isPending) return <p className="result-placeholder">{l('돌파력 정보를 불러오고 있습니다.', 'Loading Resolve…', '突破力の情報を読み込み中…')}</p>
  if (isError || !data)
    return (
      <div className="no-results">
        <p>{l('돌파력 정보를 불러오지 못했습니다.', 'Unable to load Resolve.', '突破力の情報を読み込めませんでした。')}</p>
        <button type="button" className="text-button" onClick={() => refetch()}>
          {l('다시 시도', 'Retry', '再試行')}
        </button>
      </div>
    )

  const last = maxStep(data)
  const pages = Math.ceil(rows.length / PAGE)
  const plan = planResolve(data, from, to)
  const visible = rows.slice(page * PAGE, page * PAGE + PAGE)

  const field = (value: { step: number; level: number }, set: (v: { step: number; level: number }) => void, which: 'from' | 'to') => (
    <>
      <label>
        {which === 'from' ? l('현재 단계', 'Current stage', '現在の段階') : l('목표 단계', 'Target stage', '目標の段階')}
        <input
          type="number"
          min={1}
          max={last}
          inputMode="numeric"
          value={value.step}
          onChange={(e) => {
            const step = clampStep(data, Number(e.target.value))
            set({ step, level: clampLevel(data, step, value.level) })
          }}
        />
      </label>
      <label>
        {which === 'from' ? l('현재 단계 Lv', 'Current Lv', '現在のLv') : l('목표 단계 Lv', 'Target Lv', '目標のLv')}
        <input
          type="number"
          min={0}
          max={stepInfo(data, value.step)?.levels ?? 0}
          inputMode="numeric"
          value={value.level}
          onChange={(e) => set({ ...value, level: clampLevel(data, value.step, Number(e.target.value)) })}
        />
      </label>
    </>
  )

  return (
    <div className="systems-page">
      <div className="section-intro">
        <div>
          <h2>{l('돌파력', 'Resolve', '突破力')}</h2>
          <p>
            {l(
              '코인으로 공격력·방어력·체력을 단계마다 최대 Lv까지 올리는 돌파력의 상승치와 비용을 단계별로 보고, 목표까지 드는 코인을 계산합니다.',
              'Resolve raises ATK, DEF and HP with Coins, stage by stage. See each stage and the Coins to reach a target.',
              'コインで攻撃力・防御力・HPを段階ごとに最大Lvまで上げる突破力の上昇量と費用を確認し、目標までのコインを計算します。',
            )}
          </p>
        </div>
      </div>

      <section className="panel">
        <h3>{l('목표까지 계산', 'Plan to a target', '目標までの計算')}</h3>
        <p className="subtle">
          {l(
            '세 능력치를 같은 Lv로 함께 올린다고 보고 계산합니다. 단계 Lv는 그 단계 안에서 이미 올린 레벨이며, 0이면 그 단계를 막 시작한 상태입니다.',
            'Assumes all three stats rise together. Lv is how far into the stage you are; 0 means just started.',
            '3つの能力値を同じLvで上げるとみなして計算します。Lvはその段階で上げたレベルで、0は段階を始めたばかりの状態です。',
          )}
        </p>
        <div className="systems-fields">
          {field(from, setFrom, 'from')}
          {field(to, setTo, 'to')}
        </div>
        <dl className="detail-stats" style={{ marginTop: 12 }}>
          <div>
            <dt>{l('필요 코인(능력치 3개)', 'Coins (all three)', '必要コイン(3つ)')}</dt>
            <dd>{num(plan.coinsAll)}</dd>
          </div>
          <div>
            <dt>{l('능력치 1개만', 'One stat only', '1つだけ')}</dt>
            <dd>{num(plan.coinsPerStat)}</dd>
          </div>
          <div>
            <dt>{l('공격력', 'ATK', '攻撃力')}</dt>
            <dd>+{num(plan.gain.atk)}</dd>
          </div>
          <div>
            <dt>{l('방어력', 'DEF', '防御力')}</dt>
            <dd>+{num(plan.gain.def)}</dd>
          </div>
          <div>
            <dt>{l('체력', 'HP', 'HP')}</dt>
            <dd>+{num(plan.gain.hp)}</dd>
          </div>
        </dl>
        <p className="field-note">
          {l(
            '돌파력으로 오르는 능력치는 편성 중인 쿠키 모두에게 고정 수치로 더해집니다.',
            'Resolve adds these flat values to every Cookie in the lineup.',
            '突破力の上昇値は、編成中のすべてのクッキーに固定値で加算されます。',
          )}
        </p>
      </section>

      <section className="panel">
        <h3>{l('단계별 표', 'Stage table', '段階別の表')}</h3>
        <div className="systems-pager">
          <button type="button" className="text-button" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>
            {l('이전', 'Prev', '前へ')}
          </button>
          <span className="systems-num">
            {page * PAGE + 1}–{Math.min(rows.length, (page + 1) * PAGE)} / {num(rows.length)}
          </span>
          <button type="button" className="text-button" onClick={() => setPage(Math.min(pages - 1, page + 1))} disabled={page >= pages - 1}>
            {l('다음', 'Next', '次へ')}
          </button>
          <label className="subtle">
            {l('단계로 이동', 'Go to stage', '段階へ移動')}{' '}
            <input
              type="number"
              min={1}
              max={last}
              inputMode="numeric"
              onChange={(e) => {
                const step = clampStep(data, Number(e.target.value))
                setPage(Math.floor((step - 1) / PAGE))
              }}
            />
          </label>
        </div>
        <div className="table-scroll">
          <table className="detail-table systems-resolve">
            <thead>
              <tr>
                <th>{l('단계', 'Stage', '段階')}</th>
                <th>{l('최대 Lv', 'Max Lv', '最大Lv')}</th>
                <th>{l('1레벨 상승', 'Per level', '1レベル上昇')}</th>
                <th>{l('1레벨 비용', 'Coins / level', '1レベル費用')}</th>
                <th>{l('단계 비용(3개)', 'Stage coins (×3)', '段階費用(3つ)')}</th>
                <th>{l('누적 공격력', 'Total ATK', '累計攻撃力')}</th>
                <th>{l('누적 방어력', 'Total DEF', '累計防御力')}</th>
                <th>{l('누적 체력', 'Total HP', '累計HP')}</th>
                <th>{l('누적 코인', 'Total coins', '累計コイン')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.step} className={row.step === from.step ? 'is-current' : undefined}>
                  <th>{row.step}</th>
                  <td>{row.levels}</td>
                  <td>
                    {row.atk} / {row.def} / {row.hp}
                  </td>
                  <td>{num(row.unitCost)}</td>
                  <td>{num(row.stepCoins)}</td>
                  <td>{num(row.total.atk)}</td>
                  <td>{num(row.total.def)}</td>
                  <td>{num(row.total.hp)}</td>
                  <td>{num(row.total.coins)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="field-note">
          {l(
            '1레벨 상승은 공격력 / 방어력 / 체력 순서입니다. 누적 값은 그 단계의 세 능력치를 모두 최대 Lv까지 올렸을 때 기준입니다. 비용은 국내 데이터 위키(cc.team-hobby.com) 돌파력 표, 상승치는 게임 데이터에서 가져왔고 두 출처가 단계마다 일치하는 것을 확인했습니다.',
            'Per level reads ATK / DEF / HP. Totals assume all three stats are maxed in that stage. Costs come from cc.team-hobby.com; gains from the game data, cross-checked stage by stage.',
            '1レベル上昇は攻撃力/防御力/HPの順です。累計はその段階の3能力値をすべて最大Lvにしたときの値です。',
          )}
        </p>
      </section>
    </div>
  )
}
