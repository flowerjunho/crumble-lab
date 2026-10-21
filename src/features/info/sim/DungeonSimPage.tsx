import { useDeferredValue, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cookieDbQuery, petDbQuery } from '../../../api/queries'
import { pick, useI18n } from '../../../i18n'
import { localizedText } from '../../../lib/localize'
import { readStorage } from '../../../lib/storage'
import { growthQuery } from '../growth/growthData'
import { formatCompact, formatFull } from '../stages/stageInfoData'
import { addKind, byRange, cookieSpec, dungeonInput, placeCookies } from './build'
import { simulate, steadyDps } from './engine'
import { ModelNotice, ResultView } from './ResultView'
import { BuildPanel, LineupPicker, readLineup, toBuildSettings, useSimSettings, useStored } from './SimSetup'
import { simQuery } from './simData'
import { ADD_NAME, SIM_NAME, label } from './simLabels'
import './sim.css'

const LINEUP_KEY = 'crumble.sim.dungeon.lineup'
const SETTINGS_KEY = 'crumble.sim.dungeon.settings'
const OPTIONS_KEY = 'crumble.sim.dungeon.options'
/** 던전에는 전투력이 높은 쿠키 40명이 나간다(배치 칸 40개) */
const FIELD = 40

/**
 * 크럼블 던전 누적 점수 달성 구간(국내 데이터 위키 cc.team-hobby.com ?p=dungeon의 달성 보상 표).
 * 결과 점수가 어느 구간에 있는지, 다음 구간까지 얼마나 남았는지 보여 주는 데만 쓴다.
 */
const SCORE_MARKS = [
  4e5, 7e5, 1e6, 2e6, 5e6, 6e6, 7e6, 8e6, 9e6, 1e7, 2e7, 3e7, 4e7, 5e7, 6e7, 7e7, 8e7, 9e7, 1e8, 2e8, 3e8, 4e8, 5e8, 6e8, 7e8, 8e8, 9e8, 1e9, 2e9, 3e9, 4e9,
  5e9, 6e9, 7e9, 8e9, 9e9, 1e10, 2e10, 3e10, 4e10, 5e10, 6e10, 8e10, 1e11, 2e11, 3e11, 4e11, 6e11, 8e11, 1e12,
]

const readOptions = () => {
  try {
    const raw = JSON.parse(readStorage(OPTIONS_KEY) ?? 'null') as { adds?: unknown } | null
    return { adds: raw?.adds !== false }
  } catch {
    return { adds: true }
  }
}

/**
 * 던전 시뮬레이터: 크럼블 던전의 황금갓방울을 상대로 60초 동안 쿠키 40명이 얼마나 점수를 내는지 보는 모형.
 * 보스는 쓰러지지 않고, 단계마다 회전 탄막·번개(황금 방울 소환)·전체 충격파를 쓰며 시간이 지날수록 단단해진다.
 */
export function DungeonSimPage() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const sim = useQuery(simQuery)
  const growth = useQuery(growthQuery)
  const cookieDb = useQuery(cookieDbQuery)
  const petDb = useQuery(petDbQuery)
  const [settings, setSettings] = useSimSettings(SETTINGS_KEY)
  const [lineup, setLineup] = useStored<string[]>(LINEUP_KEY, () => readLineup(LINEUP_KEY))
  const [options, setOptions] = useStored(OPTIONS_KEY, readOptions)
  const inputs = useMemo(() => ({ settings, lineup, options }), [settings, lineup, options])
  const deferred = useDeferredValue(inputs)
  const cookies = cookieDb.data?.cookies ?? []

  const result = useMemo(() => {
    if (!sim.data || !growth.data || !cookieDb.data || !petDb.data) return null
    const picked = deferred.lineup.map((eid) => cookieDb.data.cookies.find((c) => c.eid === eid)).filter((c) => c !== undefined)
    if (!picked.length) return null
    const build = toBuildSettings(deferred.settings, petDb.data.pets)
    const team = placeCookies(byRange(picked), sim.data.dungeon.slots, sim.data, growth.data, build, 'CRUMBLE_DUNGEON')
    return simulate(dungeonInput(team, sim.data, build, deferred.options))
  }, [deferred, sim.data, growth.data, cookieDb.data, petDb.data])

  const queries = [sim, growth, cookieDb, petDb]
  if (queries.some((q) => q.isPending)) return <p className="result-placeholder">{l('던전 데이터를 불러오고 있습니다.', 'Loading dungeon data…', 'ダンジョンデータを読み込み中…')}</p>
  if (!sim.data || !growth.data || !cookieDb.data || !petDb.data)
    return (
      <div className="no-results">
        <p>{l('던전 데이터를 불러오지 못했습니다.', 'Unable to load dungeon data.', 'ダンジョンデータを読み込めませんでした。')}</p>
        <button type="button" className="text-button" onClick={() => queries.forEach((q) => q.isError && q.refetch())}>
          {l('다시 시도', 'Retry', '再試行')}
        </button>
      </div>
    )

  const d = sim.data.dungeon
  const autoFill = () => {
    const build = toBuildSettings(settings, petDb.data.pets)
    const target = { def: d.boss.def, avoidance: d.boss.avoidance, critResist: 0, damageReduction: 0, element: null, isBoss: true }
    const ranked = cookies
      .map((cookie) => ({
        cookie,
        dps: steadyDps(cookieSpec(cookie, sim.data.skills[cookie.eid] ?? [], growth.data, build, 'CRUMBLE_DUNGEON', { x: 0, z: 0 }), target, 'CRUMBLE_DUNGEON'),
      }))
      .sort((a, b) => b.dps - a.dps)
    setLineup(ranked.slice(0, FIELD).map((r) => r.cookie.eid))
  }

  const score = result?.bossDamage ?? 0
  const reached = SCORE_MARKS.filter((m) => m <= score).pop() ?? null
  const next = SCORE_MARKS.find((m) => m > score) ?? null
  const markers = d.phases.filter((p) => p.opensAt > 0).map((p) => ({ t: p.opensAt, label: l(`${p.phase}단계`, `P${p.phase}`, `${p.phase}段階`) }))
  const tiers = Object.entries(d.adds)

  return (
    <div className="sim">
      <div className="section-intro">
        <div>
          <h2>{l('던전 시뮬레이터', 'Dungeon simulator', 'ダンジョンシミュレーター')}</h2>
          <p>
            {l(
              `${localizedText(SIM_NAME.dungeon, locale)}의 ${localizedText(SIM_NAME.dungeonBoss, locale)}에게 쿠키 40명이 ${d.timeLimit}초 동안 넣는 점수를 계산합니다.`,
              `Estimates the score 40 Cookies put on the ${localizedText(SIM_NAME.dungeonBoss, locale)} in the ${localizedText(SIM_NAME.dungeon, locale)} within ${d.timeLimit} seconds.`,
              `${localizedText(SIM_NAME.dungeon, locale)}の${localizedText(SIM_NAME.dungeonBoss, locale)}にクッキー40人が${d.timeLimit}秒で出すスコアを計算します。`,
            )}
          </p>
        </div>
      </div>
      <ModelNotice />

      <section className="panel sim-panel">
        <h3>{l('던전 규칙', 'How the dungeon works', 'ダンジョンのルール')}</h3>
        <p className="subtle">
          {l(
            `${localizedText(SIM_NAME.dungeonBoss, locale)}은 쓰러지지 않으며, ${d.timeLimit}초 동안 보스에게 준 피해가 점수입니다. 전투는 15초씩 ${d.phases.length}단계로 나뉩니다. 단계마다 보스가 두 갈래로 도는 탄막을 쏘고, 번개를 여러 번 떨어뜨려 떨어진 자리 근처에 황금 방울을 부르며, 단계가 끝날 무렵 모든 쿠키를 밀어내는 충격파를 씁니다. 13.5초·28.5초·43.5초에는 보스가 받는 피해를 줄이고 공격력을 크게 올립니다.`,
            `The ${localizedText(SIM_NAME.dungeonBoss, locale)} never falls; damage dealt in ${d.timeLimit} s is the score. The fight runs in ${d.phases.length} phases of 15 s. Each phase the boss fires a two-armed spiral, drops lightning bolts that call Golden Drops near the boss, and ends with a shockwave that throws every Cookie back. At 13.5 s, 28.5 s and 43.5 s it hardens itself and its ATK jumps.`,
            `${localizedText(SIM_NAME.dungeonBoss, locale)}は倒れず、${d.timeLimit}秒間に与えたダメージがスコアです。戦闘は15秒ずつ${d.phases.length}段階です。段階ごとに2方向に回る弾幕、黄金ドロップを呼ぶ落雷、最後に全員を押し戻す衝撃波を使います。13.5秒・28.5秒・43.5秒にボスの被ダメージが下がり攻撃力が大きく上がります。`,
          )}
        </p>
        <div className="table-scroll">
          <table className="detail-table sim-table">
            <thead>
              <tr>
                <th scope="col">{l('소환되는 적', 'Summoned enemy', '召喚される敵')}</th>
                <th scope="col">{l('체력', 'HP', 'HP')}</th>
                <th scope="col">{l('공격력', 'ATK', '攻撃力')}</th>
                <th scope="col">{l('방어력', 'DEF', '防御力')}</th>
                <th scope="col">{l('사거리', 'Range', '射程')}</th>
                <th scope="col">{l('머무는 시간', 'Lasts', '滞在時間')}</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map(([tier, a]) => (
                <tr key={tier}>
                  <th scope="row">
                    {label(ADD_NAME, addKind(tier), locale)} <small>{tier.replace(/\D/g, '')}</small>
                  </th>
                  <td>{formatFull(a.hp, locale)}</td>
                  <td>{formatFull(a.atk, locale)}</td>
                  <td>{formatFull(a.def, locale)}</td>
                  <td>{a.range ?? '—'}</td>
                  <td>{l(`${a.life}초`, `${a.life} s`, `${a.life}秒`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="sim-check">
          <input type="checkbox" checked={options.adds} onChange={(e) => setOptions({ ...options, adds: e.target.checked })} />
          {l('황금 방울 소환 넣기', 'Include summoned Golden Drops', '黄金ドロップの召喚を入れる')}
        </label>
      </section>

      <LineupPicker
        cookies={cookies}
        selected={lineup}
        onChange={setLineup}
        max={FIELD}
        title={l('출전 쿠키', 'Lineup', '出撃クッキー')}
        note={l(
          '게임에서는 전투력이 높은 쿠키 40명이 자동으로 나갑니다. 여기서는 직접 고르고, 사거리가 짧은 쿠키부터 앞 칸에 세운다고 가정했습니다.',
          'In game the 40 highest-Power Cookies go in automatically. Here you pick them, and we assume shorter-range Cookies take the front slots.',
          'ゲームでは戦闘力が高いクッキー40人が自動で出撃します。ここでは自分で選び、射程が短いクッキーから前の枠に並ぶと仮定しました。',
        )}
        extra={
          <button type="button" className="text-button sim-autofill" onClick={autoFill}>
            {l('초당 피해가 큰 40명으로 채우기', 'Fill with the 40 highest-DPS Cookies', '秒間ダメージが大きい40人で埋める')}
          </button>
        }
      />

      <BuildPanel settings={settings} onChange={setSettings} pets={petDb.data.pets} maxLevel={growth.data.maxLevel} maxGrade={growth.data.maxGrade} />

      {!result ? (
        <p className="result-placeholder">{l('출전 쿠키를 고르면 결과가 나옵니다.', 'Pick a lineup to see the result.', '出撃クッキーを選ぶと結果が表示されます。')}</p>
      ) : (
        <>
          {settings.hits === 'roll' && (
            <div className="sim-rerun">
              <button type="button" className="text-button" onClick={() => setSettings({ ...settings, seed: (settings.seed % 2147483646) + 1 })}>
                {l('다른 시드로 다시 돌리기', 'Run again with another seed', '別のシードでもう一度')}
              </button>
            </div>
          )}
          <ResultView
            result={result}
            cookies={cookies}
            markers={markers}
            splitAdds
            summary={[
              { label: l('점수(보스에게 준 피해)', 'Score (damage to the boss)', 'スコア(ボスへのダメージ)'), value: formatCompact(score, locale, 4), tone: 'good' },
              {
                label: l('달성 점수 구간', 'Score milestone', '達成スコア区間'),
                value: reached ? formatFull(reached, locale) : l('첫 구간 전', 'Below the first', '最初の区間前'),
              },
              {
                label: l('다음 구간까지', 'To the next milestone', '次の区間まで'),
                value: next ? formatCompact(next - score, locale, 3) : '—',
              },
              {
                label: l('소환된 적 처치', 'Summons defeated', '召喚された敵の撃破'),
                value: l(`${result.addsKilled}/${result.addsSpawned}`, `${result.addsKilled}/${result.addsSpawned}`, `${result.addsKilled}/${result.addsSpawned}`),
              },
              { label: l('끝까지 버틴 쿠키', 'Cookies standing at the end', '最後まで残ったクッキー'), value: `${result.rows.length - result.deaths}/${result.rows.length}` },
            ]}
          />
        </>
      )}

      <p className="field-note sim-assumptions">
        {l(
          '가정한 것: 번개는 보스에서 20 거리 안의 쿠키 하나를 골라 떨어지고, 황금 방울은 보스 앞쪽에 나타납니다. 보스가 스스로 거는 강화는 한 번씩만 걸리고 피해 감소는 서로 곱해서 겹칩니다. 회전 탄막 한 발은 처음 닿는 쿠키 하나만 맞힙니다. 쓰러진 쿠키 자리를 다른 쿠키가 채우는 교대는 넣지 않았습니다.',
          'Assumed: each bolt picks a Cookie within 20 units of the boss, and Golden Drops appear in front of the boss. The boss’s self-buffs land once each and their damage reductions multiply. A spiral bullet hits only the first Cookie it touches. Reserve Cookies stepping in for fallen ones are not modelled.',
          '仮定: 落雷はボスから20以内のクッキーを1人選んで落ち、黄金ドロップはボスの前方に現れます。ボスの自己強化は1回ずつで、ダメージ減少は掛け合わせて重なります。回転弾幕の1発は最初に触れたクッキー1人だけに当たります。倒れたクッキーの交代は入れていません。',
        )}
      </p>
    </div>
  )
}
