import { useEffect, useState } from 'react'
import { ROLE, ELEMENT, SYNERGY, label as cookieLabel } from '../../../lib/cookieLabels'
import { localizedText } from '../../../lib/localize'
import { readStorage, writeStorage } from '../../../lib/storage'
import type { CookieEntry, PetEntry } from '../../../types'
import { cookieStats } from '../growth/growth'
import { CalcStatus, CookieSelect, GrowthFields, LoadoutFields, ModeToggle, PetSlots, TargetFields, fmt, sortCookies, useCalcData, useL, type CalcData } from './calcUi'
import { EMPTY_LOADOUT, PET_SLOTS, TRAINING_DUMMY, cookieDps, type DamageResult, type Loadout, type PetPick, type TargetSpec } from './damage'
import './calc.css'

const STORAGE_KEY = 'crumble.calc.compare'
const MIN_COOKIES = 2
const MAX_COOKIES = 4

interface CompareForm {
  eids: string[]
  level: number
  grade: number
  loadout: Loadout
  pets: ({ slug: string; star: number } | null)[]
  mode: string | null
  target: TargetSpec
}

const DEFAULT_FORM: CompareForm = {
  eids: [],
  level: 120,
  grade: 10,
  loadout: EMPTY_LOADOUT,
  pets: Array.from({ length: PET_SLOTS }, () => null),
  mode: null,
  target: { ...TRAINING_DUMMY, isBoss: true },
}

function readForm(): CompareForm {
  try {
    const saved = JSON.parse(readStorage(STORAGE_KEY) ?? 'null') as Partial<CompareForm> | null
    if (!saved || typeof saved !== 'object') return DEFAULT_FORM
    return {
      ...DEFAULT_FORM,
      ...saved,
      eids: Array.isArray(saved.eids) ? saved.eids.filter((e) => typeof e === 'string').slice(0, MAX_COOKIES) : [],
      loadout: { ...EMPTY_LOADOUT, ...saved.loadout },
      target: { ...DEFAULT_FORM.target, ...saved.target },
      pets: Array.from({ length: PET_SLOTS }, (_, i) => saved.pets?.[i] ?? null),
    }
  } catch {
    return DEFAULT_FORM
  }
}

const toPicks = (pets: PetEntry[], saved: CompareForm['pets']): (PetPick | null)[] =>
  saved.map((item) => {
    const pet = item && pets.find((p) => p.slug === item.slug)
    return pet ? { pet, star: item.star } : null
  })

export function StatComparePage() {
  const state = useCalcData()
  const { l } = useL()
  return (
    <div className="calc">
      <div className="section-intro">
        <div>
          <h2>{l('능력치 비교', 'Stat comparison', 'ステータス比較')}</h2>
          <p>{l('쿠키 2~4명을 같은 레벨·별·슈가룬·펫 조건에서 나란히 비교합니다.', 'Compare 2–4 Cookies side by side under the same level, stars, Sugar Runes and Pets.', 'クッキー2〜4体を同じレベル・星・シュガールーン・ペットの条件で並べて比較します。')}</p>
        </div>
      </div>
      <CalcStatus state={state} />
      {state.data && <Compare data={state.data} />}
    </div>
  )
}

interface Column {
  cookie: CookieEntry
  min: DamageResult
  max: DamageResult
}

function Compare({ data }: { data: CalcData }) {
  const { l, locale } = useL()
  const [form, setForm] = useState<CompareForm>(readForm)
  useEffect(() => writeStorage(STORAGE_KEY, JSON.stringify(form)), [form])
  const set = <K extends keyof CompareForm>(key: K, value: CompareForm[K]) => setForm((f) => ({ ...f, [key]: value }))

  // 처음 열었을 때는 등급이 높은 쿠키 두 명으로 시작한다.
  const sorted = sortCookies(data.cookies, locale)
  const known = form.eids.filter((eid) => data.cookies.some((c) => c.eid === eid))
  const eids = known.length >= MIN_COOKIES ? known : [...known, ...sorted.map((c) => c.eid).filter((eid) => !known.includes(eid))].slice(0, MIN_COOKIES)
  const picks = toPicks(data.pets, form.pets).filter((p): p is PetPick => p !== null)

  const columns: Column[] = eids.map((eid) => {
    const cookie = data.cookies.find((c) => c.eid === eid)!
    const stats = cookieStats(data.growth, cookie, form.level, form.grade)
    const common = { cookie, stats, loadout: form.loadout, pets: picks, mode: form.mode, target: form.target }
    return { cookie, min: cookieDps({ ...common, bound: 'min' }), max: cookieDps({ ...common, bound: 'max' }) }
  })

  const setEid = (i: number, eid: string | null) => {
    if (!eid) return
    set('eids', eids.map((e, j) => (j === i ? eid : e)))
  }
  const remove = (i: number) => set('eids', eids.filter((_, j) => j !== i))
  const add = () => {
    const next = sorted.find((c) => !eids.includes(c.eid))
    if (next) set('eids', [...eids, next.eid])
  }

  /** 막대 그래프가 있는 행. 값이 가장 큰 쿠키를 100%로 놓는다. */
  const rows: { key: string; name: string; value: (c: Column) => number; text: (c: Column) => string }[] = [
    { key: 'dpsMin', name: l('DPS(한 대상)', 'DPS (single target)', 'DPS(単体)'), value: (c) => c.min.dps, text: (c) => fmt(c.min.dps, locale, 0) },
    { key: 'dpsMax', name: l('DPS(모두 맞을 때)', 'DPS (everything lands)', 'DPS(すべて命中)'), value: (c) => c.max.dps, text: (c) => fmt(c.max.dps, locale, 0) },
    { key: 'atk', name: l('공격력', 'ATK', '攻撃力'), value: (c) => c.min.stats.atk, text: (c) => fmt(c.min.stats.atk, locale, 0) },
    { key: 'def', name: l('방어력', 'DEF', '防御力'), value: (c) => c.min.stats.def, text: (c) => fmt(c.min.stats.def, locale, 0) },
    { key: 'hp', name: l('체력', 'HP', 'HP'), value: (c) => c.min.stats.hp, text: (c) => fmt(c.min.stats.hp, locale, 0) },
    { key: 'critRate', name: l('치명확률', 'CRIT Rate', '会心率'), value: (c) => c.min.stats.critRate, text: (c) => `${fmt(c.min.stats.critRate, locale)}%` },
    { key: 'critDamage', name: l('치명피해', 'CRIT DMG', '会心ダメージ'), value: (c) => c.min.stats.critDamage, text: (c) => `${fmt(c.min.stats.critDamage, locale)}%` },
    { key: 'cycle', name: l('스킬 주기', 'Skill cycle', 'スキル周期'), value: (c) => c.min.cycle, text: (c) => l(`${fmt(c.min.cycle, locale)}초`, `${fmt(c.min.cycle, locale)}s`, `${fmt(c.min.cycle, locale)}秒`) },
    { key: 'range', name: l('사거리', 'Range', '射程'), value: (c) => c.cookie.combat.range, text: (c) => fmt(c.cookie.combat.range, locale) },
    {
      key: 'speed',
      name: l('이동 속도', 'Move Speed', '移動速度'),
      value: (c) => c.cookie.combat.moveSpeed * (1 + c.min.stats.moveSpeedPct / 100),
      text: (c) => fmt(c.cookie.combat.moveSpeed * (1 + c.min.stats.moveSpeedPct / 100), locale),
    },
  ]

  return (
    <>
      <section className="panel" aria-labelledby="compare-pick-title">
        <h3 id="compare-pick-title">{l('비교할 쿠키', 'Cookies to compare', '比較するクッキー')}</h3>
        <div className="calc-compare-picks">
          {eids.map((eid, i) => (
            <div className="calc-compare-pick" key={i}>
              <CookieSelect cookies={data.cookies} value={eid} onChange={(next) => setEid(i, next)} ariaLabel={l(`${i + 1}번째 쿠키`, `Cookie ${i + 1}`, `${i + 1}体目のクッキー`)} />
              {eids.length > MIN_COOKIES && (
                <button type="button" className="text-button" onClick={() => remove(i)}>
                  {l('빼기', 'Remove', '外す')}
                </button>
              )}
            </div>
          ))}
        </div>
        {eids.length < MAX_COOKIES && (
          <button type="button" className="text-button" onClick={add}>
            {l('+ 쿠키 추가', '+ Add Cookie', '+ クッキー追加')}
          </button>
        )}
        <GrowthFields growth={data.growth} level={form.level} grade={form.grade} onLevel={(v) => set('level', v)} onGrade={(v) => set('grade', v)} />
      </section>

      <section className="panel calc-result" aria-labelledby="compare-table-title">
        <h3 id="compare-table-title">{l('비교 결과', 'Comparison', '比較結果')}</h3>
        <div className="table-scroll">
          <table className="detail-table calc-compare-table">
            <thead>
              <tr>
                <th scope="col">{l('항목', 'Stat', '項目')}</th>
                {columns.map((c) => (
                  <th scope="col" key={c.cookie.eid}>
                    {localizedText(c.cookie.name, locale)}
                    <small>{`${c.cookie.rarity} · ${cookieLabel(ELEMENT, c.cookie.element, locale)} · ${cookieLabel(ROLE, c.cookie.role, locale)}`}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const top = Math.max(0, ...columns.map(row.value))
                return (
                  <tr key={row.key}>
                    <th scope="row">{row.name}</th>
                    {columns.map((c) => {
                      const v = row.value(c)
                      const best = v > 0 && v === top
                      return (
                        <td key={c.cookie.eid} className={best ? 'is-best' : undefined}>
                          <span className="calc-bar-value">{row.text(c)}</span>
                          <span className="calc-bar" aria-hidden="true">
                            <span style={{ width: `${top > 0 ? (v / top) * 100 : 0}%` }} />
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              <tr>
                <th scope="row">{l('주는 시너지', 'Gives Synergy', '与えるシナジー')}</th>
                {columns.map((c) => (
                  <td key={c.cookie.eid} className="calc-synergy-cell">
                    {c.cookie.synergy.gives.length ? c.cookie.synergy.gives.map((k) => cookieLabel(SYNERGY, k, locale)).join(', ') : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">{l('받는 시너지', 'Receives Synergy', '受けるシナジー')}</th>
                {columns.map((c) => (
                  <td key={c.cookie.eid} className="calc-synergy-cell">
                    {c.cookie.synergy.receives.length ? c.cookie.synergy.receives.map((k) => cookieLabel(SYNERGY, k, locale)).join(', ') : '—'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="field-note">
          {l(
            '막대는 그 행에서 가장 큰 값을 기준으로 그립니다. DPS는 아래 대상 설정에 대한 값이며 아군 시너지는 넣지 않았습니다(펫이 주는 시너지는 포함). 스킬 주기는 짧을수록 스킬을 자주 씁니다.',
            'Bars are scaled to the largest value in each row. DPS is against the target below, without Synergy from allies (Pet Synergy included). A shorter skill cycle means more frequent casts.',
            'バーは各行の最大値を基準に描きます。DPSは下の対象設定に対する値で、味方のシナジーは含みません(ペットのシナジーは含む)。スキル周期は短いほどスキルを頻繁に使います。',
          )}
        </p>
      </section>

      <section className="panel" aria-labelledby="compare-rune-title">
        <h3 id="compare-rune-title">{l('공통 슈가룬·펫', 'Shared Sugar Runes and Pets', '共通のシュガールーン・ペット')}</h3>
        <p className="subtle">{l('여기서 넣은 값은 모든 쿠키에게 똑같이 적용합니다. 펫은 쿠키마다 대상 조건을 따로 따집니다.', 'These apply to every Cookie alike. Pet targeting is checked per Cookie.', 'ここで入れた値はすべてのクッキーに同じく適用します。ペットはクッキーごとに対象条件を判定します。')}</p>
        <LoadoutFields value={form.loadout} onChange={(v) => set('loadout', v)} />
        <h4 className="calc-subhead">{l('펫', 'Pets', 'ペット')}</h4>
        <PetSlots pets={data.pets} value={toPicks(data.pets, form.pets)} onChange={(next) => set('pets', next.map((p) => (p ? { slug: p.pet.slug, star: p.star } : null)))} />
        <ModeToggle mode={form.mode} onChange={(m) => set('mode', m)} />
      </section>

      <section className="panel" aria-labelledby="compare-target-title">
        <h3 id="compare-target-title">{l('대상', 'Target', '対象')}</h3>
        <TargetFields value={form.target} onChange={(v) => set('target', v)} />
      </section>
    </>
  )
}
