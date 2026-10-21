import { useDeferredValue, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cookieDbQuery, petDbQuery } from '../../../api/queries'
import { pick, useI18n } from '../../../i18n'
import { powerPenalty } from '../../../lib/formulas'
import { localizedText } from '../../../lib/localize'
import { readStorage } from '../../../lib/storage'
import { readTeamPower } from '../../../lib/teamPower'
import { growthQuery } from '../growth/growthData'
import { eogStagesQuery, formatCompact, formatFull } from '../stages/stageInfoData'
import { guildInput, placeCookies, STAGE_ATTACK_DEFAULTS, stageInput, cookieSpec } from './build'
import { simulate, steadyDps } from './engine'
import { ModelNotice, ResultView } from './ResultView'
import { BuildPanel, LineupPicker, NumberField, readLineup, toBuildSettings, useSimSettings, useStored } from './SimSetup'
import { simQuery } from './simData'
import { SIM_NAME } from './simLabels'
import './sim.css'

type Target = 'stage' | 'guild'

interface StageChoice {
  chapter: number
  stage: number
  /** 팀 전투력(M). 빈 값이면 피해 100%로 본다. */
  power: string
  bossAttacks: boolean
  attackEvery: number
  attackMultiplier: number
}

const LINEUP_KEY = 'crumble.sim.battle.lineup'
const SETTINGS_KEY = 'crumble.sim.battle.settings'
const TARGET_KEY = 'crumble.sim.battle.target'
const SQUAD = 12

function readChoice(): { target: Target; stage: StageChoice } {
  const fallback: StageChoice = { chapter: 1, stage: 10, power: readTeamPower() ?? '', bossAttacks: false, ...STAGE_ATTACK_DEFAULTS }
  try {
    const raw = JSON.parse(readStorage(TARGET_KEY) ?? 'null') as { target?: string; stage?: Partial<StageChoice> } | null
    if (!raw) return { target: 'stage', stage: fallback }
    const s = raw.stage ?? {}
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
    return {
      target: raw.target === 'guild' ? 'guild' : 'stage',
      stage: {
        chapter: num(s.chapter, fallback.chapter),
        stage: num(s.stage, fallback.stage),
        power: typeof s.power === 'string' ? s.power : fallback.power,
        bossAttacks: s.bossAttacks === true,
        attackEvery: num(s.attackEvery, fallback.attackEvery),
        attackMultiplier: num(s.attackMultiplier, fallback.attackMultiplier),
      },
    }
  } catch {
    return { target: 'stage', stage: fallback }
  }
}

/**
 * 전투 시뮬레이터: 쿠키 12명과 펫 3마리로 메인 스테이지 보스나 길드 토벌전 피냐타와 싸우는 모형.
 * 처치 여부·처치 시각·쿠키별 피해 몫을 시간에 따라 보여 준다.
 */
export function BattleSimPage() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const sim = useQuery(simQuery)
  const growth = useQuery(growthQuery)
  const cookieDb = useQuery(cookieDbQuery)
  const petDb = useQuery(petDbQuery)
  const stages = useQuery(eogStagesQuery)
  const [settings, setSettings] = useSimSettings(SETTINGS_KEY)
  const [lineup, setLineup] = useStored<string[]>(LINEUP_KEY, () => readLineup(LINEUP_KEY))
  const [choice, setChoice] = useStored(TARGET_KEY, readChoice)

  // 입력이 바뀔 때만 다시 계산하고, 계산은 입력보다 한 박자 늦게 따라가게 해서 타이핑이 끊기지 않게 한다.
  const inputs = useMemo(() => ({ settings, lineup, choice }), [settings, lineup, choice])
  const deferred = useDeferredValue(inputs)
  const loaded = sim.data && growth.data && cookieDb.data && petDb.data && stages.data
  const cookies = cookieDb.data?.cookies ?? []

  const stageRow = useMemo(() => {
    if (!stages.data) return null
    const ch = Math.min(stages.data._meta.chapters, Math.max(1, Math.round(choice.stage.chapter)))
    const st = Math.min(stages.data._meta.perChapter, Math.max(1, Math.round(choice.stage.stage)))
    return stages.data.rows[(ch - 1) * stages.data._meta.perChapter + st - 1] ?? null
  }, [stages.data, choice.stage.chapter, choice.stage.stage])

  const teamPower = Number(choice.stage.power) * 1e6
  const penalty = stageRow && Number.isFinite(teamPower) && teamPower > 0 ? powerPenalty(teamPower, stageRow[2]) : null

  const outcome = useMemo(() => {
    if (!sim.data || !growth.data || !cookieDb.data || !petDb.data || !stageRow) return null
    const { settings: s, lineup: ids, choice: c } = deferred
    const picked = ids.map((eid) => cookieDb.data.cookies.find((x) => x.eid === eid)).filter((x) => x !== undefined)
    if (!picked.length) return null
    const build = toBuildSettings(s, petDb.data.pets)
    if (c.target === 'guild') {
      const team = placeCookies(picked, sim.data.lineup.slots, sim.data, growth.data, build, 'GUILD_RAID')
      return { picked, result: simulate(guildInput(team, sim.data, build)) }
    }
    const team = placeCookies(picked, sim.data.lineup.slots, sim.data, growth.data, build, null)
    const power = Number(c.stage.power) * 1e6
    const multiplier = Number.isFinite(power) && power > 0 ? powerPenalty(power, stageRow[2]).multiplier : 1
    const input = stageInput(stageRow, team, sim.data, build, {
      bossAttacks: c.stage.bossAttacks,
      attackEvery: c.stage.attackEvery,
      attackMultiplier: c.stage.attackMultiplier,
      powerMultiplier: multiplier,
    })
    return { picked, result: simulate(input) }
  }, [deferred, sim.data, growth.data, cookieDb.data, petDb.data, stageRow])

  const queries = [sim, growth, cookieDb, petDb, stages]
  if (queries.some((q) => q.isPending)) return <p className="result-placeholder">{l('전투 데이터를 불러오고 있습니다.', 'Loading battle data…', '戦闘データを読み込み中…')}</p>
  if (!loaded)
    return (
      <div className="no-results">
        <p>{l('전투 데이터를 불러오지 못했습니다.', 'Unable to load battle data.', '戦闘データを読み込めませんでした。')}</p>
        <button type="button" className="text-button" onClick={() => queries.forEach((q) => q.isError && q.refetch())}>
          {l('다시 시도', 'Retry', '再試行')}
        </button>
      </div>
    )

  const setStage = (patch: Partial<StageChoice>) => setChoice({ ...choice, stage: { ...choice.stage, ...patch } })
  const boss = stageRow ? stages.data.bosses[stageRow[6]] : undefined

  // 이 상대에게 기댓값 초당 피해가 큰 순으로 12명을 채운다(움직임·보스 패턴은 빼고 계산한 순위).
  const autoFill = () => {
    const build = toBuildSettings(settings, petDb.data.pets)
    const mode = choice.target === 'guild' ? 'GUILD_RAID' : null
    const target =
      choice.target === 'guild'
        ? { def: sim.data.guild.boss.def, avoidance: sim.data.guild.boss.avoidance, critResist: 0, damageReduction: 0, element: 'dark' as const, isBoss: true }
        : { def: stageRow?.[10] ?? 0, avoidance: stageRow?.[3] ?? 0, critResist: 0, damageReduction: 0, element: null, isBoss: true }
    const ranked = cookies
      .map((cookie) => ({ cookie, dps: steadyDps(cookieSpec(cookie, sim.data.skills[cookie.eid] ?? [], growth.data, build, mode, { x: 0, z: 0 }), target, mode) }))
      .sort((a, b) => b.dps - a.dps)
    setLineup(ranked.slice(0, SQUAD).map((r) => r.cookie.eid))
  }

  const result = outcome?.result
  const guild = choice.target === 'guild'

  return (
    <div className="sim">
      <div className="section-intro">
        <div>
          <h2>{l('전투 시뮬레이터', 'Battle simulator', '戦闘シミュレーター')}</h2>
          <p>
            {l(
              '쿠키 12명과 펫 3마리로 보스와 싸워 보고, 제한 시간 안에 쓰러뜨리는지와 누가 피해를 얼마나 넣는지 확인합니다.',
              'Send 12 Cookies and 3 Pets at a boss and see whether it falls in time and who does the damage.',
              'クッキー12人とペット3匹でボスと戦い、制限時間内に倒せるかと誰がどれだけダメージを出すかを確認します。',
            )}
          </p>
        </div>
      </div>
      <ModelNotice />

      <section className="panel sim-panel">
        <h3>{l('상대', 'Opponent', '相手')}</h3>
        <div className="filter-chips">
          <button type="button" aria-pressed={!guild} onClick={() => setChoice({ ...choice, target: 'stage' })}>
            {localizedText(SIM_NAME.stage, locale)}
          </button>
          <button type="button" aria-pressed={guild} onClick={() => setChoice({ ...choice, target: 'guild' })}>
            {localizedText(SIM_NAME.guild, locale)}
          </button>
        </div>

        {!guild && stageRow && (
          <>
            <div className="sim-fields">
              <NumberField label={l('챕터', 'Chapter', '章')} value={choice.stage.chapter} min={1} max={stages.data._meta.chapters} onChange={(v) => setStage({ chapter: Math.round(v) })} />
              <NumberField label={l('스테이지', 'Stage', 'ステージ')} value={choice.stage.stage} min={1} max={stages.data._meta.perChapter} onChange={(v) => setStage({ stage: Math.round(v) })} />
              <label className="sim-field">
                <span className="filter-label">{l('팀 전투력(M)', 'Team Power (M)', 'チーム戦闘力(M)')}</span>
                <input type="text" inputMode="decimal" value={choice.stage.power} onChange={(e) => setStage({ power: e.target.value })} placeholder="0" />
              </label>
            </div>
            <dl className="detail-stats">
              <div>
                <dt>{l('보스', 'Boss', 'ボス')}</dt>
                <dd className="text-value">
                  {boss ? localizedText(boss, locale) : '—'}
                  {stageRow[7] > 1 && l(` ${stageRow[7]}마리`, ` ×${stageRow[7]}`, ` ${stageRow[7]}体`)}
                </dd>
              </div>
              <div>
                <dt>{l('보스 체력(한 마리)', 'Boss HP (each)', 'ボスHP(1体)')}</dt>
                <dd>{formatFull(stageRow[8], locale)}</dd>
              </div>
              <div>
                <dt>{l('보스 공격력', 'Boss ATK', 'ボス攻撃力')}</dt>
                <dd>{formatFull(stageRow[9], locale)}</dd>
              </div>
              <div>
                <dt>{l('보스 방어력', 'Boss DEF', 'ボス防御力')}</dt>
                <dd>{stageRow[10] === null ? '—' : formatFull(stageRow[10], locale)}</dd>
              </div>
              <div>
                <dt>{l('제한 시간', 'Time limit', '制限時間')}</dt>
                <dd>{l(`${stageRow[12] ?? 60}초`, `${stageRow[12] ?? 60} s`, `${stageRow[12] ?? 60}秒`)}</dd>
              </div>
              <div>
                <dt>{l('권장 전투력', 'Recommended Power', '推奨戦闘力')}</dt>
                <dd>{formatCompact(stageRow[2], locale, 4)}</dd>
              </div>
              <div>
                <dt>{l('주는 피해', 'Damage dealt', '与ダメージ')}</dt>
                <dd>{penalty ? `${Math.round(penalty.multiplier * 100)}%` : '100%'}</dd>
              </div>
            </dl>
            <p className="field-note">
              {penalty
                ? l(
                    '팀 전투력이 권장 전투력에 못 미치면 쿠키가 주는 피해가 구간에 따라 줄어듭니다. 이 비율을 모든 피해에 곱했습니다.',
                    'Below the recommended Power, Cookie damage drops by bracket. That rate is applied to every hit.',
                    'チーム戦闘力が推奨戦闘力に届かないと与ダメージが区間ごとに減ります。この割合をすべてのダメージに掛けました。',
                  )
                : l(
                    '팀 전투력을 적지 않으면 피해 100%로 계산합니다.',
                    'Without a team Power the sim uses 100% damage.',
                    'チーム戦闘力を入力しない場合はダメージ100%で計算します。',
                  )}
            </p>
            <label className="sim-check">
              <input type="checkbox" checked={choice.stage.bossAttacks} onChange={(e) => setStage({ bossAttacks: e.target.checked })} />
              {l('보스가 반격하는 것으로 보기', 'Let the boss hit back', 'ボスの反撃を入れる')}
            </label>
            {choice.stage.bossAttacks && (
              <div className="sim-fields">
                <NumberField label={l('공격 간격(초)', 'Every (s)', '攻撃間隔(秒)')} value={choice.stage.attackEvery} min={0.5} max={30} step={0.5} onChange={(v) => setStage({ attackEvery: v })} />
                <NumberField label={l('공격력 배율', 'ATK multiplier', '攻撃力倍率')} value={choice.stage.attackMultiplier} min={0} max={100} step={0.1} onChange={(v) => setStage({ attackMultiplier: v })} />
              </div>
            )}
            <p className="field-note">
              {l(
                '메인 스테이지 보스의 공격 패턴은 공개된 데이터가 없습니다. 반격을 켜면 정한 간격마다 가장 가까운 쿠키를 보스 공격력 × 배율로 친다고 가정합니다.',
                'Campaign boss attack patterns are not published. With this on, the boss hits the nearest Cookie for its ATK × the multiplier at the chosen interval — our assumption.',
                'メインステージのボスの攻撃パターンは公開データがありません。オンにすると、決めた間隔で最も近いクッキーをボス攻撃力 × 倍率で攻撃すると仮定します。',
              )}
            </p>
          </>
        )}

        {guild && (
          <>
            <dl className="detail-stats">
              <div>
                <dt>{l('보스', 'Boss', 'ボス')}</dt>
                <dd className="text-value">{localizedText(SIM_NAME.guildBoss, locale)}</dd>
              </div>
              <div>
                <dt>{l('공격력', 'ATK', '攻撃力')}</dt>
                <dd>{formatFull(sim.data.guild.boss.atk, locale)}</dd>
              </div>
              <div>
                <dt>{l('방어력', 'DEF', '防御力')}</dt>
                <dd>{formatFull(sim.data.guild.boss.def, locale)}</dd>
              </div>
              <div>
                <dt>{l('제한 시간', 'Time limit', '制限時間')}</dt>
                <dd>{l(`${sim.data.guild.timeLimit}초`, `${sim.data.guild.timeLimit} s`, `${sim.data.guild.timeLimit}秒`)}</dd>
              </div>
            </dl>
            <p className="field-note">
              {l(
                `피냐타는 쓰러지지 않습니다. 제한 시간 동안 준 피해가 점수입니다. 시간이 지날수록 받는 피해 감소가 커지고 공격력이 크게 오르며, 단계마다 적을 부르고 낙하·전체 공격·주변 폭발을 씁니다. 길드 토벌전에서는 쿠키 피해에 전투력 배율 ${sim.data.guild.powerMultiplier}배가 붙습니다.`,
                `The piñata never falls; damage within the time limit is the score. Its damage reduction and ATK climb as the fight goes on, and each phase it calls minions and uses drops, an arena wave and a blast. Guild Raid applies a ×${sim.data.guild.powerMultiplier} power multiplier to Cookie damage.`,
                `ピニャータは倒れません。制限時間内に与えたダメージがスコアです。時間とともにダメージ減少と攻撃力が大きく上がり、段階ごとに手下を呼び、落下・全体攻撃・周辺爆発を使います。ギルド討伐戦ではクッキーのダメージに戦闘力倍率${sim.data.guild.powerMultiplier}倍が付きます。`,
              )}
            </p>
          </>
        )}
      </section>

      <LineupPicker
        cookies={cookies}
        selected={lineup}
        onChange={setLineup}
        max={SQUAD}
        title={l('출전 쿠키', 'Lineup', '出撃クッキー')}
        note={l(
          '고른 순서대로 앞줄부터 2열로 섭니다. 위·아래 버튼으로 자리를 바꿀 수 있습니다.',
          'Cookies line up two abreast in the order you pick them. Use the arrows to swap places.',
          '選んだ順に前列から2列で並びます。上下ボタンで位置を入れ替えられます。',
        )}
        extra={
          <button type="button" className="text-button sim-autofill" onClick={autoFill}>
            {l('이 상대에게 초당 피해가 큰 12명으로 채우기', 'Fill with the 12 highest-DPS Cookies for this fight', 'この相手への秒間ダメージが大きい12人で埋める')}
          </button>
        }
      />

      <BuildPanel settings={settings} onChange={setSettings} pets={petDb.data.pets} maxLevel={growth.data.maxLevel} maxGrade={growth.data.maxGrade} />

      {!result ? (
        <p className="result-placeholder">{l('출전 쿠키를 고르면 결과가 나옵니다.', 'Pick a lineup to see the result.', '出撃クッキーを選ぶと結果が表示されます。')}</p>
      ) : (
        <>
          <div className="sim-rerun">
            {settings.hits === 'roll' && (
              <button
                type="button"
                className="text-button"
                onClick={() => setSettings({ ...settings, seed: (settings.seed % 2147483646) + 1 })}
              >
                {l('다른 시드로 다시 돌리기', 'Run again with another seed', '別のシードでもう一度')}
              </button>
            )}
          </div>
          <ResultView
            result={result}
            cookies={cookies}
            splitAdds={guild}
            summary={
              guild
                ? [
                    { label: l('점수(피냐타에게 준 피해)', 'Score (damage to the piñata)', 'スコア(ピニャータへのダメージ)'), value: formatCompact(result.bossDamage, locale, 4) },
                    { label: l('소환된 적에게 준 피해', 'Damage to minions', '手下へのダメージ'), value: formatCompact(result.totalDamage - result.bossDamage, locale, 4) },
                    { label: l('끝까지 버틴 쿠키', 'Cookies standing at the end', '最後まで残ったクッキー'), value: `${result.rows.length - result.deaths}/${result.rows.length}` },
                  ]
                : [
                    {
                      label: l('결과', 'Outcome', '結果'),
                      value: result.killed ? l('처치 성공', 'Boss down', '撃破成功') : l('시간 안에 쓰러뜨리지 못함', 'Not down in time', '時間内に倒せず'),
                      tone: result.killed ? 'good' : 'warn',
                    },
                    {
                      label: l('처치 시각', 'Time to kill', '撃破時刻'),
                      value: result.killTime !== null ? l(`${result.killTime.toFixed(2)}초`, `${result.killTime.toFixed(2)} s`, `${result.killTime.toFixed(2)}秒`) : '—',
                    },
                    {
                      label: l('보스 남은 체력', 'Boss HP left', 'ボス残りHP'),
                      value: `${(((result.samples[result.samples.length - 1]?.bossHp ?? 0) * 100) || 0).toFixed(1)}%`,
                    },
                    { label: l('준 피해', 'Damage dealt', '与ダメージ'), value: formatCompact(result.totalDamage, locale, 4) },
                    { label: l('끝까지 버틴 쿠키', 'Cookies standing at the end', '最後まで残ったクッキー'), value: `${result.rows.length - result.deaths}/${result.rows.length}` },
                  ]
            }
          />
        </>
      )}

      <p className="field-note sim-assumptions">
        {l(
          '계산 방식: 0.05초마다 쿠키가 가장 가까운 적에게 걸어가 사거리 안에서 쿨타임이 끝난 스킬을 씁니다. 한 번 시전한 피해 계수는 스킬이 만드는 투사체·장판의 개수·지속 시간·주기를 시너지와 함께 곱해 구하고, 한 대 피해는 피해 계산기와 같은 식을 씁니다. 스킬 효과는 쿨타임이 가장 긴 스킬을 쓸 때 붙습니다. 관통·연쇄로 늘어나는 대상 수와 일부 특수 효과(변신·소환체의 별도 행동)는 넣지 않았습니다.',
          'How it works: every 0.05 s each Cookie walks to the nearest enemy and fires any skill off cooldown once in range. A cast’s coefficient multiplies the projectiles, duration and tick rate its skill makes, synergies included, and each hit uses the same formula as the damage calculator. Skill effects land with the longest-cooldown skill. Extra targets from Pierce or Chain and a few special effects (transforms, separate summon behaviour) are not modelled.',
          '計算方法: 0.05秒ごとにクッキーが最も近い敵へ歩き、射程内でクールタイムが終わったスキルを使います。1回の発動のダメージ係数はスキルが作る投射体・設置物の数・持続・周期をシナジー込みで掛けて求め、1発のダメージはダメージ計算機と同じ式です。スキル効果はクールタイムが最も長いスキルを使ったときに付きます。貫通・連鎖で増える対象数と一部の特殊効果(変身・召喚体の個別行動)は入れていません。',
        )}
      </p>
    </div>
  )
}
