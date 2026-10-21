import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { asset } from '../../../lib/asset'
import { SYNERGY, label as cookieLabel } from '../../../lib/cookieLabels'
import { localizedText } from '../../../lib/localize'
import type { CookieEntry, SynergyKey } from '../../../types'
import { cookieStats } from '../growth/growth'
import { BOUND_LABEL, PET_STATUS_LABEL, label } from './calcLabels'
import { decodeBuild, deleteSavedBuild, encodeBuild, loadoutAt, readSavedBuilds, saveBuild, type BuildState, type SavedBuild } from './buildCodec'
import { CalcStatus, CookieSelect, GrowthFields, LoadoutFields, ModeToggle, PetSlots, TargetFields, fmt, synergyAmount, useCalcData, useL, type CalcData } from './calcUi'
import { SQUAD_COLUMNS, SQUAD_SIZE, TRAINING_DUMMY, teamDps, type Bound, type PetPick, type TargetSpec } from './damage'
import './calc.css'

/** 빌드 상태와 같이 주소에 담는 모드 값 */
const MODE_PARAM = 'm'
const MODE_CODES: Record<string, string> = { dim: 'DIMENSION_STAGE' }

export function BuildMakerPage() {
  const state = useCalcData()
  const { l } = useL()
  return (
    <div className="calc">
      <div className="section-intro">
        <div>
          <h2>{l('빌드 메이커', 'Build maker', 'ビルドメーカー')}</h2>
          <p>{l('쿠키 12명과 펫 3마리로 라인업을 짜고 시너지·펫 효과·팀 DPS를 확인합니다.', 'Build a lineup of 12 Cookies and 3 Pets, then check Synergy, Pet effects and team DPS.', 'クッキー12体とペット3体で編成を組み、シナジー・ペット効果・チームDPSを確認します。')}</p>
        </div>
      </div>
      <CalcStatus state={state} />
      {state.data && <BuildMaker data={state.data} />}
    </div>
  )
}

function BuildMaker({ data }: { data: CalcData }) {
  const { l, locale } = useL()
  const [params, setParams] = useSearchParams()
  const build = decodeBuild(params)
  const modeCode = params.get(MODE_PARAM)
  const mode = (modeCode && MODE_CODES[modeCode]) || null
  const [slot, setSlot] = useState(0)
  const [target, setTarget] = useState<TargetSpec>({ ...TRAINING_DUMMY, isBoss: true })
  const [bound, setBound] = useState<Bound>('min')
  const [saved, setSaved] = useState<SavedBuild[]>(readSavedBuilds)
  const [name, setName] = useState('')
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)

  /** 빌드가 바뀌면 주소를 바꾼다(기록은 남기지 않는다). 모드 값은 그대로 둔다. */
  const update = (next: BuildState, nextMode: string | null = mode) => {
    const query = encodeBuild(next)
    const code = Object.entries(MODE_CODES).find(([, m]) => m === nextMode)?.[0]
    if (code) query.set(MODE_PARAM, code)
    setParams(query, { replace: true })
    setCopied(null)
  }

  const byEid = new Map(data.cookies.map((c) => [c.eid, c]))
  const lineup = build.cookies.map((eid) => (eid ? byEid.get(eid) ?? null : null))
  const pets: (PetPick | null)[] = build.pets.map((p) => {
    const pet = p && data.pets.find((x) => x.id === p.id)
    return pet && p ? { pet, star: p.star } : null
  })
  const members = lineup.flatMap((cookie, i) => (cookie ? [{ cookie, slot: i, stats: cookieStats(data.growth, cookie, build.level, build.grade), loadout: loadoutAt(build, i) }] : []))
  const team = teamDps(members, { pets: pets.filter((p): p is PetPick => p !== null), mode, target, bound })
  const selected = lineup[slot] ?? null

  /** 같은 쿠키는 한 칸에만 둘 수 있어서, 이미 다른 칸에 있으면 두 칸을 맞바꾼다. */
  const placeCookie = (eid: string | null) => {
    const cookies = [...build.cookies]
    const loadouts = { ...build.loadouts }
    const from = eid ? cookies.indexOf(eid) : -1
    if (from >= 0 && from !== slot) {
      cookies[from] = cookies[slot] ?? null
      const moving = loadouts[from]
      const staying = loadouts[slot]
      if (staying) loadouts[from] = staying
      else delete loadouts[from]
      if (moving) loadouts[slot] = moving
      else delete loadouts[slot]
    }
    cookies[slot] = eid
    if (!eid) delete loadouts[slot]
    update({ ...build, cookies, loadouts })
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
  }

  const synergyRows = team.synergy.filter((row) => row.givers.length || row.receivers.length)
  // 시너지를 받는 쿠키 수(주는 쿠키가 있는 시너지만). 같은 쿠키가 두 가지를 받으면 두 번 센다.
  const appliedCount = synergyRows.reduce((sum, row) => sum + (row.givers.length ? row.receivers.length : 0), 0)
  const resultFor = (cookie: CookieEntry) => team.members.find((m) => m.cookie.eid === cookie.eid)?.result

  return (
    <>
      <section className="panel" aria-labelledby="build-lineup-title">
        <h3 id="build-lineup-title">{l('라인업', 'Lineup', '編成')}</h3>
        <p className="subtle">
          {l(
            '칸을 누른 다음 아래에서 쿠키와 그 쿠키의 슈가룬을 정합니다. 배치는 게임처럼 2열 6행입니다.',
            'Tap a slot, then pick its Cookie and Sugar Runes below. The grid is 2 columns by 6 rows, as in the game.',
            'マスをタップしてから、下でクッキーとそのシュガールーンを選びます。配置はゲームと同じ2列6行です。',
          )}
        </p>
        <ol className="calc-grid" style={{ gridTemplateColumns: `repeat(${SQUAD_COLUMNS}, minmax(0, 1fr))` }}>
          {lineup.map((cookie, i) => (
            <li key={i}>
              <button type="button" className="calc-slot" aria-pressed={slot === i} onClick={() => setSlot(i)}>
                <span className="calc-slot-no">{i + 1}</span>
                {cookie ? (
                  <>
                    <img src={asset(cookie.image)} alt="" width="36" height="36" loading="lazy" />
                    <span className="calc-slot-name">{localizedText(cookie.name, locale)}</span>
                  </>
                ) : (
                  <span className="calc-slot-name subtle">{l('빈칸', 'Empty', '空き')}</span>
                )}
              </button>
            </li>
          ))}
        </ol>
        <div className="calc-slot-editor">
          <h4 className="calc-subhead">{l(`${slot + 1}번 칸`, `Slot ${slot + 1}`, `${slot + 1}番のマス`)}</h4>
          <div className="calc-pick">
            <CookieSelect
              cookies={data.cookies}
              value={build.cookies[slot] ?? null}
              onChange={placeCookie}
              emptyLabel={l('비워 두기', 'Leave empty', '空ける')}
              ariaLabel={l(`${slot + 1}번 칸 쿠키`, `Slot ${slot + 1} Cookie`, `${slot + 1}番のクッキー`)}
            />
          </div>
          {selected && (
            <>
              <p className="field-note">{l('이 쿠키의 슈가룬', "This Cookie's Sugar Runes", 'このクッキーのシュガールーン')}</p>
              <LoadoutFields value={loadoutAt(build, slot)} onChange={(v) => update({ ...build, loadouts: { ...build.loadouts, [slot]: v } })} />
            </>
          )}
        </div>
        <h4 className="calc-subhead">{l('모든 쿠키의 레벨·별', 'Level and stars for every Cookie', '全クッキーのレベル・星')}</h4>
        <GrowthFields growth={data.growth} level={build.level} grade={build.grade} onLevel={(v) => update({ ...build, level: v })} onGrade={(v) => update({ ...build, grade: v })} />
      </section>

      <section className="panel" aria-labelledby="build-pet-title">
        <h3 id="build-pet-title">{l('펫', 'Pets', 'ペット')}</h3>
        <PetSlots pets={data.pets} value={pets} onChange={(next) => update({ ...build, pets: next.map((p) => (p ? { id: p.pet.id, star: p.star } : null)) })} />
        <ModeToggle mode={mode} onChange={(m) => update(build, m)} />
      </section>

      <section className="panel" aria-labelledby="build-synergy-title">
        <h3 id="build-synergy-title">{l('시너지', 'Synergy', 'シナジー')}</h3>
        {synergyRows.length ? (
          <>
            <p className="subtle">
              {l(
                `주는 쿠키가 있는 시너지는 ${synergyRows.filter((r) => r.givers.length).length}종입니다. 이 시너지를 받는 쿠키는 모두 ${appliedCount}명입니다.`,
                `${synergyRows.filter((r) => r.givers.length).length} Synergies are provided, reaching ${appliedCount} recipients in total.`,
                `与えるクッキーがいるシナジーは${synergyRows.filter((r) => r.givers.length).length}種で、受けるクッキーは計${appliedCount}体です。`,
              )}
            </p>
            <div className="table-scroll">
              <table className="detail-table calc-synergy-table">
                <thead>
                  <tr>
                    <th scope="col">{l('시너지', 'Synergy', 'シナジー')}</th>
                    <th scope="col">{l('주는 쿠키', 'Given by', '与えるクッキー')}</th>
                    <th scope="col">{l('받는 쿠키', 'Received by', '受けるクッキー')}</th>
                    <th scope="col">{l('한 명이 받는 값', 'Per recipient', '1体あたり')}</th>
                  </tr>
                </thead>
                <tbody>
                  {synergyRows.map((row) => (
                    <tr key={row.key} className={!row.givers.length ? 'is-dead' : undefined}>
                      <th scope="row">{cookieLabel(SYNERGY, row.key, locale)}</th>
                      <td>{row.givers.length ? row.givers.map((g) => localizedText(g.from.name, locale)).join(', ') : l('없음', 'None', 'なし')}</td>
                      <td>{row.receivers.length ? row.receivers.map((c) => localizedText(c.name, locale)).join(', ') : l('없음', 'None', 'なし')}</td>
                      <td>{row.givers.length ? synergyAmount(row.key, row.steps) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="field-note">
              {l(
                '한 명이 받는 값은 주는 쿠키의 스킬 효과 값에 스킬 주기 중 효과가 유지되는 비율을 곱한 평균입니다. 인원 제한이 있는 효과는 받는 쿠키 수로 나눴습니다. 같은 시너지를 여러 쿠키가 주면 겹치지 않고 가장 큰 값 하나만 셉니다. 펫이 주는 시너지는 쿠키별 결과에 따로 더합니다.',
                'Per-recipient value is the giver\'s skill effect times the share of its skill cycle the effect stays up. Effects with a target limit are split across recipients, and several givers of one Synergy do not stack: the largest counts. Pet Synergy is added per Cookie below.',
                '1体あたりの値は、与えるクッキーのスキル効果値にスキル周期中の効果維持率を掛けた平均です。人数制限のある効果は受けるクッキー数で割り、同じシナジーを複数のクッキーが与えても重ならず最大値1つだけを数えます。ペットのシナジーはクッキー別の結果に加算します。',
              )}
            </p>
          </>
        ) : (
          <p className="field-note">{l('라인업에 쿠키를 넣으면 시너지를 정리해 보여 줍니다.', 'Add Cookies to see their Synergy.', '編成にクッキーを入れるとシナジーを表示します。')}</p>
        )}
      </section>

      <section className="panel" aria-labelledby="build-target-title">
        <h3 id="build-target-title">{l('대상', 'Target', '対象')}</h3>
        <TargetFields value={target} onChange={setTarget} />
        <div className="filter-row">
          <span className="filter-label">{l('타수 기준', 'Hits counted', '命中数の基準')}</span>
          <div className="filter-chips">
            {(['min', 'max'] as const).map((b) => (
              <button type="button" key={b} aria-pressed={bound === b} onClick={() => setBound(b)}>
                {label(BOUND_LABEL, b, locale)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel calc-result" aria-labelledby="build-result-title">
        <h3 id="build-result-title">{l('쿠키별 결과', 'Per-Cookie result', 'クッキー別の結果')}</h3>
        <dl className="detail-stats">
          <div className="calc-headline">
            <dt>{l('팀 DPS', 'Team DPS', 'チームDPS')}</dt>
            <dd>{fmt(team.dps, locale, 0)}</dd>
          </div>
          <div>
            <dt>{l('쿠키', 'Cookies', 'クッキー')}</dt>
            <dd>{`${members.length} / ${SQUAD_SIZE}`}</dd>
          </div>
        </dl>
        {members.length > 0 && (
          <div className="table-scroll">
            <table className="detail-table calc-member-table">
              <thead>
                <tr>
                  <th scope="col">{l('쿠키', 'Cookie', 'クッキー')}</th>
                  <th scope="col">{l('받는 시너지', 'Synergy received', '受けるシナジー')}</th>
                  <th scope="col">{l('펫 효과', 'Pet effects', 'ペット効果')}</th>
                  <th scope="col">DPS</th>
                </tr>
              </thead>
              <tbody>
                {members.map(({ cookie, slot: i }) => {
                  const result = resultFor(cookie)
                  if (!result) return null
                  const synergy = Object.entries(result.synergy) as [SynergyKey, number][]
                  const active = result.pets.list.filter((p) => p.status === 'active')
                  const others = result.pets.list.filter((p) => p.status !== 'active')
                  return (
                    <tr key={cookie.eid}>
                      <th scope="row">
                        {`${i + 1}. ${localizedText(cookie.name, locale)}`}
                        {result.support && <small>{l(' 피해 없음', ' no damage', ' ダメージなし')}</small>}
                      </th>
                      <td className="calc-wrap-cell">{synergy.length ? synergy.map(([k, v]) => `${cookieLabel(SYNERGY, k, locale)} ${synergyAmount(k, v)}`).join(', ') : '—'}</td>
                      <td className="calc-wrap-cell">
                        {active.length ? active.map((p) => `${localizedText(p.pet.name, locale)} ★${p.star}`).join(', ') : '—'}
                        {others.length > 0 && (
                          <small>
                            {others.map((p) => ` · ${localizedText(p.pet.name, locale)}: ${label(PET_STATUS_LABEL, p.status, locale)}`).join('')}
                          </small>
                        )}
                      </td>
                      <td>{fmt(result.dps, locale, 0)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="field-note">
          {l(
            '팀 DPS는 쿠키마다 피해 계산기와 같은 식으로 구한 DPS를 더한 값입니다. 쿠키끼리 주고받는 능력치 버프(치명확률 증가 등)와 배치 위치에 따른 이동 시간은 넣지 않았습니다.',
            'Team DPS sums each Cookie\'s DPS from the same formula as the damage calculator. Stat buffs Cookies give each other (CRIT Rate up and so on) and travel time from grid position are not included.',
            'チームDPSはクッキーごとにダメージ計算機と同じ式で求めたDPSの合計です。クッキー同士のステータスバフ(会心率増加など)や配置による移動時間は含みません。',
          )}
        </p>
      </section>

      <section className="panel" aria-labelledby="build-save-title">
        <h3 id="build-save-title">{l('저장·공유', 'Save and share', '保存・共有')}</h3>
        <div className="calc-save">
          <input
            type="text"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder={l('빌드 이름', 'Build name', 'ビルド名')}
            aria-label={l('빌드 이름', 'Build name', 'ビルド名')}
          />
          <button type="button" className="calc-button" onClick={() => setSaved(saveBuild(name, build))}>
            {l('이 브라우저에 저장', 'Save in this browser', 'このブラウザに保存')}
          </button>
          <button type="button" className="calc-button" onClick={copyLink}>
            {l('공유 링크 복사', 'Copy share link', '共有リンクをコピー')}
          </button>
        </div>
        {copied === 'ok' && <p className="field-note">{l('링크를 복사했습니다.', 'Link copied.', 'リンクをコピーしました。')}</p>}
        {copied === 'fail' && (
          <p className="field-note">
            {l('복사하지 못했습니다. 아래 주소를 직접 복사해 주세요.', 'Copy failed. Copy the address below instead.', 'コピーできませんでした。下のアドレスを直接コピーしてください。')}
            <input className="calc-share-url" type="text" readOnly value={window.location.href} onFocus={(e) => e.currentTarget.select()} aria-label={l('공유 주소', 'Share address', '共有アドレス')} />
          </p>
        )}
        {saved.length > 0 ? (
          <ul className="calc-saved">
            {saved.map((item) => (
              <li key={item.name}>
                <span>{item.name}</span>
                <button type="button" className="text-button" onClick={() => setParams(new URLSearchParams(item.code), { replace: true })}>
                  {l('불러오기', 'Load', '読み込む')}
                </button>
                <button type="button" className="text-button" onClick={() => setSaved(deleteSavedBuild(item.name))}>
                  {l('삭제', 'Delete', '削除')}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="field-note">{l('저장한 빌드가 없습니다. 저장한 빌드는 이 브라우저에만 남습니다.', 'No saved builds yet. Saved builds stay in this browser only.', '保存したビルドはありません。保存したビルドはこのブラウザにだけ残ります。')}</p>
        )}
      </section>
    </>
  )
}
