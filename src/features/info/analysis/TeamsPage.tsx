import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { pick, useI18n } from '../../../i18n'
import { ROLE, ROLE_ORDER, label, pct } from '../../../lib/cookieLabels'
import { petTierText } from '../../../lib/petLabels'
import { ROUTES } from '../../../routes'
import type { Locale } from '../../../types'
import { runeCraftQuery, statLabel } from '../runes/runeCraft'
import { BuildPicker, CookieCell, Intro, LoadState, Method, PetCell, fmtInt, plusPct, useAnalysisData, type AnalysisData } from './common'
import { CROWD_TARGETS } from './dps'
import { DEFAULT_BUILD, TEAM_SIZE, buffedAttacker, runePriority, type RefBuild, type RuneDpsStat } from './model'
import { PET_SLOTS, TEAM_PRESETS, runPreset, type PresetResult, type TeamPreset } from './presets'

/** 다른 화면(빌드 메이커)의 주소. 그 화면은 다른 작업에서 만든다. */
const BUILDS_ROUTE = `${ROUTES.info}/builds`

function presetText(preset: TeamPreset, locale: Locale) {
  const l = (ko: string, en: string, ja: string) => pick(locale, ko, en, ja)
  const roles = ROLE_ORDER.filter((r) => preset.rules.minRoles[r])
    .map((r) => l(`${label(ROLE, r, locale)} ${preset.rules.minRoles[r]}명 이상`, `${preset.rules.minRoles[r]}+ ${label(ROLE, r, locale)}`, `${label(ROLE, r, locale)}${preset.rules.minRoles[r]}体以上`))
    .join(l(', ', ', ', '、'))
  switch (preset.id) {
    case 'stage':
      return {
        title: l('스테이지 돌파', 'Stage push', 'ステージ突破'),
        desc: l(
          `적 여럿을 상대하는 일반 스테이지용입니다. 범위 공격이 적 ${CROWD_TARGETS}명을 함께 맞힌다고 보고 ${roles}을 조건으로 둡니다.`,
          `For regular stages with many enemies. Area hits are assumed to catch ${CROWD_TARGETS} enemies; requires ${roles}.`,
          `敵が多い通常ステージ向けです。範囲攻撃が敵${CROWD_TARGETS}体に当たると仮定し、条件は${roles}です。`,
        ),
      }
    case 'boss':
      return {
        title: l('보스전', 'Boss fight', 'ボス戦'),
        desc: l(
          `보스 하나만 때리는 싸움(길드 토벌전, 차원의 이면 보스 등)용입니다. 범위 효과는 세지 않고 보스피해 버프를 셉니다. 조건은 ${roles}입니다.`,
          `For single-boss fights (Guild Raid, Dimension bosses). Area is not counted, Boss DMG buffs are. Requires ${roles}.`,
          `ボス1体を叩く戦闘(ギルド討伐戦、次元の裏側のボスなど)向けです。範囲は数えず、ボスダメージバフを数えます。条件は${roles}です。`,
        ),
      }
    case 'budget':
      return {
        title: l('SR 이하 편성', 'SR-and-below lineup', 'SR以下編成'),
        desc: l(
          `SR·R·U·C 등급 쿠키만으로 만든 스테이지 편성입니다. 육성 재화가 적을 때 먼저 키울 쿠키를 고르는 데 참고하세요. 조건은 ${roles}입니다.`,
          `A Stage lineup built only from SR, R, U and C Cookies, useful for deciding what to raise first on a tight budget. Requires ${roles}.`,
          `SR・R・U・Cのクッキーだけで作ったステージ編成です。育成資源が少ないときに先に育てるクッキー選びの参考にしてください。条件は${roles}です。`,
        ),
      }
  }
}

export function TeamsPage() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const { data, isPending, isError, refetch } = useAnalysisData()
  const [build, setBuild] = useState<RefBuild>(DEFAULT_BUILD)

  if (!data) return <LoadState isPending={isPending && !isError} onRetry={refetch} />
  const ref = { level: Math.min(build.level, data.growth.maxLevel), grade: Math.min(build.grade, data.growth.maxGrade) }

  return (
    <div className="analysis">
      <Intro title={l('추천 편성', 'Suggested teams', 'おすすめ編成')}>
        {l(
          '우리 알고리즘이 게임 데이터만으로 고른 편성입니다. 쿠키마다 왜 들어갔는지 숫자로 보여 줍니다.',
          'Lineups picked by our own algorithm from game data alone, with the numbers behind every pick.',
          '当サイトのアルゴリズムがゲームデータだけで選んだ編成です。各クッキーが選ばれた理由を数値で示します。',
        )}
      </Intro>

      <section className="panel">
        <h3>{l('기준 육성', 'Reference build', '基準育成')}</h3>
        <BuildPicker
          level={ref.level}
          grade={ref.grade}
          maxLevel={data.growth.maxLevel}
          maxGrade={data.growth.maxGrade}
          onLevel={(level) => setBuild((b) => ({ ...b, level }))}
          onGrade={(grade) => setBuild((b) => ({ ...b, grade }))}
        />
        <Method title={l('편성 알고리즘', 'How teams are picked', '編成アルゴリズム')}>
          <ol>
            <li>
              {l(
                `빈 편성에서 시작해 넣었을 때 팀 초당 피해가 가장 많이 느는 쿠키를 ${TEAM_SIZE}명이 찰 때까지 한 명씩 넣습니다. 남은 칸으로 역할 최소 인원을 채울 수 없으면 그 역할의 쿠키만 고릅니다.`,
                `Starting empty, add the Cookie that raises team DPS the most, one at a time, until ${TEAM_SIZE}. When the remaining slots are needed for role minimums, only those roles are eligible.`,
                `空の編成から始め、加えたときにチームの秒間ダメージが最も増えるクッキーを${TEAM_SIZE}体まで1体ずつ加えます。残り枠で役割の最低人数を満たせない場合はその役割だけを選びます。`,
              )}
            </li>
            <li>
              {l(
                '다 채운 뒤에는 편성 안의 한 명을 밖의 쿠키와 바꿔 보고 팀 피해가 늘면 바꾸는 일을 더 나아지지 않을 때까지 되풀이합니다.',
                'Then try swapping each member for each outside Cookie, keeping any swap that raises team damage, until no swap helps.',
                'その後、編成内の1体を外のクッキーと入れ替えてみて、チーム火力が増えれば入れ替える処理を改善がなくなるまで繰り返します。',
              )}
            </li>
            <li>
              {l(
                "팀 초당 피해는 쿠키마다 '편성 시너지를 받은 초당 피해 × (1 + 받는 버프)'를 더한 값입니다. 시너지는 피해 계산기와 같은 규칙(같은 시너지는 가장 강한 공급원 하나만, 가동률 반영)으로 타수에 들어가고 버프는 가동률과 받을 확률(받는 인원 ÷ 팀 인원)을 곱해 더합니다.",
                "Team DPS sums each Cookie’s DPS with the lineup’s Synergy × (1 + buffs received). Synergy follows the damage calculator’s rules (strongest supplier only, scaled by uptime) and changes hit counts; buffs are weighted by uptime and the chance to receive them (receivers ÷ team size).",
                "チームの秒間ダメージは各クッキーの「編成シナジーを受けた秒間ダメージ × (1 + 受けるバフ)」の合計です。シナジーはダメージ計算機と同じ規則(同じシナジーは最も強い供給元1つ、稼働率反映)で命中数に入り、バフは稼働率と受ける確率(受ける人数 ÷ 編成人数)を掛けて足します。",
              )}
            </li>
            <li>
              {l(
                `펫은 그 편성에서 피해 증가가 큰 ★5 펫을 효과 묶음이 겹치지 않게 ${PET_SLOTS}마리 골랐습니다. 슈가룬은 편성 버프를 받은 상태에서 SSR 1단계 옵션 한 줄의 가치가 큰 순서입니다.`,
                `Pets: the ${PET_SLOTS} ★5 Pets with the biggest damage gain for that lineup, never two from the same effect group. Sugar Runes: SSR tier-1 lines ranked with the lineup’s buffs applied.`,
                `ペットはその編成で火力増加が大きい★5ペットを効果グループが重ならないように${PET_SLOTS}体選びました。シュガールーンは編成のバフを受けた状態でSSR1段階のオプション1行の価値が大きい順です。`,
              )}
            </li>
          </ol>
          <p>
            {l(
              '실제 전투의 위치 선정·이동·보스 기믹은 계산하지 못하므로, 출발점으로 쓰고 직접 바꿔 보세요.',
              'Positioning, movement and boss mechanics are not modelled, so treat these as starting points.',
              '実戦の位置取り・移動・ボスギミックは計算していないため、出発点として使ってください。',
            )}{' '}
            <Link to={BUILDS_ROUTE}>{l('빌드 메이커에서 직접 편성하기', 'Build your own in the build maker', 'ビルドメーカーで自分で編成する')}</Link>
          </p>
        </Method>
      </section>

      {TEAM_PRESETS.map((preset) => (
        <PresetPanel key={preset.id} preset={preset} data={data} build={ref} locale={locale} />
      ))}
    </div>
  )
}

function PresetPanel({ preset, data, build, locale }: { preset: TeamPreset; data: AnalysisData; build: RefBuild; locale: Locale }) {
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const result: PresetResult = useMemo(() => runPreset(preset, data.cookies, data.pets, data.growth, build), [preset, data, build])
  const runes = useQuery(runeCraftQuery)
  const runeValues = useMemo(() => {
    const ssr = runes.data?.rarities.find((r) => r.rarity === 'SSR')?.tiers.find((t) => t.tier === 1)
    if (!ssr) return null
    const v = ssr.values
    return { atkAmp: v.atkAmp ?? 0, critRate: v.critRate ?? 0, critDamage: v.critDamage ?? 0, skillAmp: v.skillAmp ?? 0, skillHaste: ssr.haste?.value ?? 0 } satisfies Record<RuneDpsStat, number>
  }, [runes.data])
  const { title, desc } = presetText(preset, locale)
  const { team } = result
  const solo = team.rows.reduce((t, r) => t + r.base, 0)
  const rows = [...team.rows].sort((a, b) => b.final - a.final)

  return (
    <section className="panel analysis-team">
      <h3>{title}</h3>
      <p className="subtle">{desc}</p>
      <dl className="detail-stats analysis-team-stats">
        <div>
          <dt>{l('팀 초당 피해', 'Team DPS', 'チーム秒間ダメージ')}</dt>
          <dd>{fmtInt(team.total, locale)}</dd>
        </div>
        <div>
          <dt>{l('버프·시너지 효과', 'From buffs & Synergy', 'バフ・シナジー効果')}</dt>
          <dd>{plusPct(solo ? team.total / solo - 1 : 0, 0)}</dd>
        </div>
        <div>
          <dt>{l('채운 시너지', 'Synergies filled', '満たしたシナジー')}</dt>
          <dd>{`${team.coverage[0]} / ${team.coverage[1]}`}</dd>
        </div>
        <div>
          <dt>{l('역할 구성', 'Roles', '役割構成')}</dt>
          <dd>
            {ROLE_ORDER.map((r) => `${label(ROLE, r, locale)} ${team.members.filter((c) => c.role === r).length}`).join(' · ')}
          </dd>
        </div>
      </dl>

      <div className="table-scroll">
        <table className="detail-table analysis-table">
          <thead>
            <tr>
              <th scope="col">{l('쿠키', 'Cookie', 'クッキー')}</th>
              <th scope="col">{l('혼자', 'Solo', '単独')}</th>
              <th scope="col">{l('받는 버프', 'Buffs', 'バフ')}</th>
              <th scope="col">{l('시너지', 'Synergy', 'シナジー')}</th>
              <th scope="col">{l('편성 안', 'In team', '編成内')}</th>
              <th scope="col">{l('비중', 'Share', '比率')}</th>
              <th scope="col">{l('슈가룬 1순위', 'Top rune line', 'ルーン1位')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const top = runeValues && r.base > 0 ? runePriority(runeValues, r.cookie, buffedAttacker(r.cookie, team.members, result.ctx), preset.scenario, r.synergy)[0] : undefined
              return (
                <tr key={r.cookie.eid}>
                  <th scope="row" className="analysis-name">
                    <CookieCell cookie={r.cookie} locale={locale} />
                  </th>
                  <td>{fmtInt(r.base, locale)}</td>
                  <td>{plusPct(r.buff, 0)}</td>
                  <td>{`${r.synergies} / ${r.cookie.synergy.receives.length}`}</td>
                  <td>{fmtInt(r.final, locale)}</td>
                  <td>{pct(team.total ? r.final / team.total : 0)}</td>
                  <td>{top ? `${statLabel(top.stat, locale)} ${plusPct(top.gain, 1)}` : '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="field-note">
        {l(
          "피해가 0인 쿠키는 스스로 공격하지 않고 버프만 주는 쿠키입니다. 이런 쿠키는 '받는 버프' 열에서 다른 쿠키 쪽 숫자를 올립니다.",
          'Cookies with 0 damage only buff; their value shows up in the Buffs column of the others.',
          '火力0のクッキーは自分では攻撃せずバフだけを与えます。その価値は他のクッキーの「バフ」列に表れます。',
        )}
      </p>

      <h4 className="analysis-subhead">{l(`함께 쓸 펫 ${PET_SLOTS}마리`, `${PET_SLOTS} Pets to pair`, `組み合わせるペット${PET_SLOTS}体`)}</h4>
      <ul className="analysis-pets">
        {result.pickedPets.map((v) => {
          const tier = v.pet.tiers[v.pet.tiers.length - 1]
          return (
            <li key={v.pet.id}>
              <PetCell pet={v.pet} locale={locale} />
              <span>{tier ? petTierText(v.pet, tier, locale) : ''}</span>
              <strong>{l(`팀 피해 ${plusPct(v.dps)}`, `Team DPS ${plusPct(v.dps)}`, `チーム火力${plusPct(v.dps)}`)}</strong>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
