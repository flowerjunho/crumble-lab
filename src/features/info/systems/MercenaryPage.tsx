import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cookieDbQuery } from '../../../api/queries'
import { pick, useI18n } from '../../../i18n'
import { ELEMENT, ROLE, label } from '../../../lib/cookieLabels'
import { localizedText } from '../../../lib/localize'
import type { CookieEntry } from '../../../types'
import { LINEUP_MAX, conditionText, effectText, evaluateBand, perksAvailable, targetText } from './mercenary'
import { systemsData, type SystemEffect } from './systemsData'
import './systems.css'

const { levels, perks } = systemsData.band

/** 표에서 공격력·방어력·최대체력은 칸을 따로 두고, 나머지 효과는 한 칸에 모은다. */
const MAIN_STATS = ['atk', 'def', 'hp'] as const

export function MercenaryPage() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const { data, isPending, isError, refetch } = useQuery(cookieDbQuery)

  const [levelNo, setLevelNo] = useState(levels.length - 1)
  const [chosen, setChosen] = useState<number[]>([])
  const [lineupIds, setLineupIds] = useState<string[]>([])
  const [leader, setLeader] = useState<string | null>(null)
  const [adding, setAdding] = useState('')

  const cookies = useMemo(() => [...(data?.cookies ?? [])].sort((a, b) => a.name.ko.localeCompare(b.name.ko, 'ko')), [data])
  const byEid = useMemo(() => new Map(cookies.map((c) => [c.eid, c])), [cookies])
  const lineup = lineupIds.map((eid) => byEid.get(eid)).filter((c): c is CookieEntry => Boolean(c))

  const level = levels[levelNo] ?? levels[0]!
  const available = perksAvailable(perks, level.level)
  // 레벨을 내리면 더 이상 고를 수 없는 특전과 넘치는 슬롯은 계산에서 빠진다.
  const active = chosen.filter((id) => available.some((p) => p.id === id)).slice(0, level.perkSlots)
  const result = evaluateBand(level, perks, active, lineup, leader)

  if (isPending) return <p className="result-placeholder">{l('쿠키 정보를 불러오고 있습니다.', 'Loading Cookies…', 'クッキー情報を読み込み中…')}</p>
  if (isError)
    return (
      <div className="no-results">
        <p>{l('쿠키 정보를 불러오지 못했습니다.', 'Unable to load Cookies.', 'クッキー情報を読み込めませんでした。')}</p>
        <button type="button" className="text-button" onClick={() => refetch()}>
          {l('다시 시도', 'Retry', '再試行')}
        </button>
      </div>
    )

  const togglePerk = (id: number) => {
    if (active.includes(id)) setChosen(active.filter((x) => x !== id))
    // 슬롯이 가득 차면 가장 먼저 고른 특전을 빼고 새로 고른 특전을 넣는다.
    else setChosen([...active, id].slice(-Math.max(1, level.perkSlots)))
  }
  const addCookie = (eid: string) => {
    if (!eid || lineupIds.includes(eid) || lineupIds.length >= LINEUP_MAX) return
    setLineupIds([...lineupIds, eid])
    setAdding('')
  }
  const removeCookie = (eid: string) => {
    setLineupIds(lineupIds.filter((x) => x !== eid))
    if (leader === eid) setLeader(null)
  }
  const name = (c: CookieEntry) => localizedText(c.name, locale)
  const effectList = (effects: SystemEffect[]) => effects.map((e) => effectText(e, locale)).join(', ')
  const statCell = (effects: SystemEffect[], stat: (typeof MAIN_STATS)[number]) => {
    const e = effects.find((x) => x.stat === stat && x.how === 'pct')
    return e ? `${e.value >= 0 ? '+' : '−'}${Number(Math.abs(e.value).toFixed(2))}%` : '–'
  }

  return (
    <div className="systems-page">
      <div className="section-intro">
        <div>
          <h2>{l('용병단', 'Mercenary Band', '傭兵団')}</h2>
          <p>
            {l(
              '용병단 레벨마다 열리는 특전과 리더 효과를 고르고, 편성한 쿠키가 각각 어떤 효과를 받는지 계산합니다.',
              'Pick the perks and leader bonus each band level unlocks, then see what every Cookie in your lineup receives.',
              '傭兵団レベルごとに解放される特典とリーダー効果を選び、編成したクッキーごとに受ける効果を計算します。',
            )}
          </p>
        </div>
      </div>

      <section className="panel">
        <h3>{l('용병단 레벨', 'Band level', '傭兵団レベル')}</h3>
        <div className="filter-chips systems-levels">
          {levels.map((lv, index) => (
            <button key={lv.level} type="button" aria-pressed={index === levelNo} onClick={() => setLevelNo(index)}>
              Lv.{lv.level}
            </button>
          ))}
        </div>
        <dl className="detail-stats" style={{ marginTop: 12 }}>
          <div>
            <dt>{l('특전 슬롯', 'Perk slots', '特典スロット')}</dt>
            <dd>{level.perkSlots}</dd>
          </div>
          <div>
            <dt>{l('펫 슬롯', 'Pet slots', 'ペットスロット')}</dt>
            <dd>{level.petSlots}</dd>
          </div>
          <div>
            <dt>{l('리더 효과', 'Leader bonus', 'リーダー効果')}</dt>
            <dd className="text-value">{level.leader.length ? effectList(level.leader) : l('없음', 'None', 'なし')}</dd>
          </div>
        </dl>
        {locale !== 'ko' && <p className="field-note">{level.nameEn}</p>}
      </section>

      <section className="panel">
        <h3>{l('특전 고르기', 'Choose perks', '特典を選ぶ')}</h3>
        <p className="subtle">
          {level.perkSlots
            ? l(`이 레벨에서는 특전을 ${level.perkSlots}개까지 고를 수 있습니다.`, `This level has ${level.perkSlots} perk slot(s).`, `このレベルでは特典を${level.perkSlots}つまで選べます。`)
            : l('0레벨에서는 특전을 고를 수 없습니다.', 'No perk slots at level 0.', 'レベル0では特典を選べません。')}
        </p>
        <ul className="systems-perks">
          {perks.map((perk) => {
            const locked = perk.unlockedAt > level.level
            const picked = active.includes(perk.id)
            const state = result.perks.find((r) => r.perk.id === perk.id)
            const condition = conditionText(perk, locale)
            return (
              <li key={perk.id} className={`systems-perk${picked ? ' is-picked' : ''}`}>
                <input
                  type="checkbox"
                  id={`systems-perk-${perk.id}`}
                  checked={picked}
                  disabled={locked || level.perkSlots === 0}
                  onChange={() => togglePerk(perk.id)}
                />
                <label className="systems-perk-text" htmlFor={`systems-perk-${perk.id}`}>
                  <span>
                    {condition && <>{condition}, </>}
                    <b>{targetText(perk.target, locale)}</b>: {effectList(perk.effects)}
                  </span>
                  <span className="systems-perk-meta">
                    <span className="systems-badge">{l(`Lv.${perk.unlockedAt} 해금`, `Unlocks at Lv.${perk.unlockedAt}`, `Lv.${perk.unlockedAt}で解放`)}</span>
                    <span>{locale === 'ko' ? `영문 이름 ${perk.nameEn}` : perk.nameEn}</span>
                    {state && lineup.length > 0 && (
                      <span className={`systems-badge ${state.active ? 'is-on' : 'is-off'}`}>
                        {state.active
                          ? l(`발동 · ${state.targets.length}명`, `Active · ${state.targets.length}`, `発動・${state.targets.length}体`)
                          : l('조건 미달', 'Condition not met', '条件未達')}
                      </span>
                    )}
                    {state?.roleCount != null && perk.condition.type === 'roleCount' && (
                      <span>{l(`지금 ${state.roleCount}명`, `Now ${state.roleCount}`, `現在${state.roleCount}体`)}</span>
                    )}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="panel">
        <h3>{l('편성', 'Lineup', '編成')}</h3>
        <p className="subtle">
          {l(
            `쿠키를 최대 ${LINEUP_MAX}명까지 넣을 수 있습니다. 쿠키를 다시 누르면 편성에서 빠집니다.`,
            `Add up to ${LINEUP_MAX} Cookies. Tap a Cookie again to remove it.`,
            `クッキーを最大${LINEUP_MAX}体まで追加できます。もう一度タップすると外れます。`,
          )}
        </p>
        <div className="systems-add">
          <select value={adding} onChange={(e) => addCookie(e.target.value)} aria-label={l('쿠키 추가', 'Add a Cookie', 'クッキーを追加')} disabled={lineupIds.length >= LINEUP_MAX}>
            <option value="">{l('쿠키 추가…', 'Add a Cookie…', 'クッキーを追加…')}</option>
            {cookies
              .filter((c) => !lineupIds.includes(c.eid))
              .map((c) => (
                <option key={c.eid} value={c.eid}>
                  {name(c)} · {label(ROLE, c.role, locale)} · {label(ELEMENT, c.element, locale)}
                </option>
              ))}
          </select>
          <button type="button" className="text-button" onClick={() => (setLineupIds([]), setLeader(null))} disabled={!lineupIds.length}>
            {l('비우기', 'Clear', 'クリア')}
          </button>
        </div>
        {lineup.length > 0 && (
          <div className="systems-lineup">
            {lineup.map((c) => (
              <button key={c.eid} type="button" onClick={() => removeCookie(c.eid)} aria-label={l(`${name(c)} 빼기`, `Remove ${name(c)}`, `${name(c)}を外す`)}>
                {name(c)} <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}
        {level.leader.length > 0 && (
          <div className="systems-fields" style={{ marginTop: 12 }}>
            <label>
              {l('리더', 'Leader', 'リーダー')}
              <select value={leader ?? ''} onChange={(e) => setLeader(e.target.value || null)}>
                <option value="">{l('정하지 않음', 'None', '未設定')}</option>
                {lineup.map((c) => (
                  <option key={c.eid} value={c.eid}>
                    {name(c)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </section>

      <section className="panel">
        <h3>{l('쿠키별 효과', 'Effects per Cookie', 'クッキー別の効果')}</h3>
        {lineup.length === 0 ? (
          <p className="subtle">{l('편성에 쿠키를 넣으면 쿠키마다 받는 효과를 보여 줍니다.', 'Add Cookies to see what each one receives.', 'クッキーを編成すると、それぞれが受ける効果を表示します。')}</p>
        ) : (
          <div className="table-scroll">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>{l('쿠키', 'Cookie', 'クッキー')}</th>
                  <th>{l('공격력', 'ATK', '攻撃力')}</th>
                  <th>{l('방어력', 'DEF', '防御力')}</th>
                  <th>{l('최대체력', 'Max HP', '最大HP')}</th>
                  <th>{l('그 외', 'Other', 'その他')}</th>
                </tr>
              </thead>
              <tbody>
                {lineup.map((c) => {
                  const totals = result.cookies.find((x) => x.eid === c.eid)?.totals ?? []
                  const others = totals.filter((e) => !(MAIN_STATS as readonly string[]).includes(e.stat) || e.how !== 'pct')
                  return (
                    <tr key={c.eid}>
                      <th>
                        {name(c)} {result.leader === c.eid && <span className="systems-badge is-accent">{l('리더', 'Leader', 'リーダー')}</span>}
                      </th>
                      {MAIN_STATS.map((stat) => (
                        <td key={stat}>{statCell(totals, stat)}</td>
                      ))}
                      <td>{others.length ? effectList(others) : '–'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="field-note">
          {l(
            '전투력·능력치 순위로 대상을 고르는 특전은 실제 성장 상태를 알 수 없어서, 모든 쿠키의 레벨과 장비가 같다고 보고 쿠키 도감의 기본 공격력·최대체력으로 순위를 매깁니다. 공격력·방어력·최대체력의 %는 기본 능력치에 곱하는 증가량입니다.',
            'Perks that pick targets by CP or stat rank use base ATK and Max HP from the Cookie index, as if every Cookie had the same level and gear. ATK/DEF/Max HP percentages scale base stats.',
            '戦闘力や能力値の順位で対象を選ぶ特典は、実際の育成状態が分からないため、全クッキーのレベルと装備が同じとみなし、図鑑の基本攻撃力・最大HPで順位を決めます。',
          )}
        </p>
        <p className="field-note">
          {l(
            '특전 이름과 설명의 국내 표기는 아직 확인하지 못해서, 게임 데이터의 조건·대상·수치로 직접 풀어 썼습니다.',
            'Perk wording is built from the game data (condition, target, values); official Korean names are not yet confirmed.',
            '特典の国内表記は未確認のため、ゲームデータの条件・対象・数値から説明を作成しています。',
          )}
        </p>
      </section>
    </div>
  )
}
