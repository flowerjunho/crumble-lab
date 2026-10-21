import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react'
import { pick, useI18n } from '../../../i18n'
import { asset } from '../../../lib/asset'
import { ELEMENT, ROLE, label } from '../../../lib/cookieLabels'
import { localizedText } from '../../../lib/localize'
import { readStorage, writeStorage } from '../../../lib/storage'
import type { CookieEntry, PetEntry } from '../../../types'
import { LOADOUT_LABEL } from '../calc/calcLabels'
import { EMPTY_LOADOUT, type Loadout, type PetPick } from '../calc/damage'
import type { BuildSettings } from './build'

/** 화면에 저장하는 설정. 펫은 slug로 저장해서 데이터가 바뀌어도 읽을 수 있게 한다. */
export interface StoredSettings {
  level: number
  grade: number
  loadout: Partial<Loadout>
  survival: BuildSettings['survival']
  pets: { slug: string; star: number }[]
  seed: number
  hits: BuildSettings['hits']
}

export const DEFAULT_SETTINGS: StoredSettings = {
  level: 100,
  grade: 10,
  loadout: { ...EMPTY_LOADOUT },
  survival: { hpPct: 0, defPct: 0, damageReduction: 0 },
  pets: [],
  seed: 42,
  hits: 'average',
}

const finiteOr = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

/** 저장된 값이 깨져 있어도 화면이 뜨도록 하나씩 확인해서 읽는다. */
function readSettings(key: string): StoredSettings {
  try {
    const raw = JSON.parse(readStorage(key) ?? 'null') as Partial<StoredSettings> | null
    if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS
    return {
      level: finiteOr(raw.level, DEFAULT_SETTINGS.level),
      grade: finiteOr(raw.grade, DEFAULT_SETTINGS.grade),
      loadout: Object.fromEntries(Object.keys(EMPTY_LOADOUT).map((k) => [k, finiteOr(raw.loadout?.[k as keyof Loadout], 0)])),
      survival: {
        hpPct: finiteOr(raw.survival?.hpPct, 0),
        defPct: finiteOr(raw.survival?.defPct, 0),
        damageReduction: finiteOr(raw.survival?.damageReduction, 0),
      },
      pets: Array.isArray(raw.pets) ? raw.pets.filter((p) => p && typeof p.slug === 'string').slice(0, 3).map((p) => ({ slug: p.slug, star: finiteOr(p.star, 5) })) : [],
      seed: finiteOr(raw.seed, DEFAULT_SETTINGS.seed),
      hits: raw.hits === 'roll' ? 'roll' : 'average',
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

/** 설정과 출전 쿠키를 이 기기에만 저장한다(다시 열면 이어서 쓸 수 있게). */
export function useStored<T>(key: string, read: () => T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(read)
  useEffect(() => writeStorage(key, JSON.stringify(value)), [key, value])
  return [value, setValue]
}

export function useSimSettings(key: string) {
  return useStored<StoredSettings>(key, () => readSettings(key))
}

export function readLineup(key: string): string[] {
  try {
    const raw = JSON.parse(readStorage(key) ?? '[]') as unknown
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/** 저장된 설정 + 펫 도감 → 엔진 설정 */
export function toBuildSettings(stored: StoredSettings, pets: PetEntry[]): BuildSettings {
  const picks: PetPick[] = stored.pets.flatMap(({ slug, star }) => {
    const pet = pets.find((p) => p.slug === slug)
    return pet ? [{ pet, star }] : []
  })
  return { level: stored.level, grade: stored.grade, loadout: stored.loadout, survival: stored.survival, pets: picks, seed: stored.seed, hits: stored.hits }
}

export function NumberField({
  label: text,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null && draft.trim() !== '' && Number.isFinite(Number(draft))) onChange(Math.min(max, Math.max(min, Number(draft))))
    setDraft(null)
  }
  return (
    <label className="sim-field">
      <span className="filter-label">{text}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
    </label>
  )
}

// ---------------------------------------------------------------------------
// 성장·펫 설정
// ---------------------------------------------------------------------------

const LOADOUT_FIELDS: (keyof Loadout)[] = ['atkPct', 'critRate', 'critDamage', 'skillAmp', 'haste', 'bossDamage', 'elementDamage']

export function BuildPanel({
  settings,
  onChange,
  pets,
  maxLevel,
  maxGrade,
}: {
  settings: StoredSettings
  onChange: (next: StoredSettings) => void
  pets: PetEntry[]
  maxLevel: number
  maxGrade: number
}) {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const set = <K extends keyof StoredSettings>(key: K, value: StoredSettings[K]) => onChange({ ...settings, [key]: value })
  const sortedPets = useMemo(() => [...pets].sort((a, b) => a.name.ko.localeCompare(b.name.ko, 'ko')), [pets])
  const petSlot = (i: number) => settings.pets[i] ?? { slug: '', star: 5 }
  const setPet = (i: number, slug: string, star: number) => {
    const next = [0, 1, 2].map((j) => (j === i ? { slug, star } : petSlot(j))).filter((p) => p.slug)
    set('pets', next)
  }

  return (
    <section className="panel sim-panel">
      <h3>{l('성장과 펫', 'Growth and Pets', '育成とペット')}</h3>
      <p className="subtle">
        {l(
          '모든 출전 쿠키에 같은 레벨·별·추가 능력치를 넣습니다. 추가 능력치는 장비·슈가룬·연구처럼 성장 화면 밖에서 오르는 값을 한 번에 적는 칸입니다.',
          'Every Cookie in the lineup gets the same level, stars and extra stats. Extra stats stand in for gear, Sugar Runes and research.',
          '出撃クッキー全員に同じレベル・星・追加能力値を入れます。追加能力値は装備・シュガールーン・研究などの分です。',
        )}
      </p>
      <div className="sim-fields">
        <NumberField label={l('레벨', 'Level', 'レベル')} value={settings.level} min={1} max={maxLevel} onChange={(v) => set('level', Math.round(v))} />
        <NumberField label={l('별', 'Stars', '星')} value={settings.grade} min={0} max={maxGrade} onChange={(v) => set('grade', Math.round(v))} />
        {LOADOUT_FIELDS.map((key) => (
          <NumberField
            key={key}
            label={label(LOADOUT_LABEL, key, locale)}
            value={settings.loadout[key] ?? 0}
            min={0}
            max={key === 'haste' ? 1000 : 10000}
            step={0.1}
            onChange={(v) => set('loadout', { ...settings.loadout, [key]: v })}
          />
        ))}
        <NumberField
          label={l('최대체력 증가(%)', 'Max HP up (%)', '最大HP増加(%)')}
          value={settings.survival.hpPct}
          min={0}
          max={100000}
          onChange={(v) => set('survival', { ...settings.survival, hpPct: v })}
        />
        <NumberField
          label={l('방어력 증가(%)', 'DEF up (%)', '防御力増加(%)')}
          value={settings.survival.defPct}
          min={0}
          max={100000}
          onChange={(v) => set('survival', { ...settings.survival, defPct: v })}
        />
        <NumberField
          label={l('피해감소(%)', 'DMG reduction (%)', 'ダメージ減少(%)')}
          value={settings.survival.damageReduction}
          min={0}
          max={95}
          step={0.1}
          onChange={(v) => set('survival', { ...settings.survival, damageReduction: v })}
        />
      </div>

      <h4 className="sim-subhead">{l('펫(최대 3마리)', 'Pets (up to 3)', 'ペット(最大3匹)')}</h4>
      <div className="sim-pets">
        {[0, 1, 2].map((i) => {
          const slot = petSlot(i)
          return (
            <div className="sim-pet" key={i}>
              <select
                value={slot.slug}
                onChange={(e) => setPet(i, e.target.value, slot.star)}
                aria-label={l(`펫 ${i + 1}`, `Pet ${i + 1}`, `ペット${i + 1}`)}
              >
                <option value="">{l('펫 없음', 'No Pet', 'ペットなし')}</option>
                {sortedPets.map((pet) => (
                  <option key={pet.slug} value={pet.slug}>
                    {localizedText(pet.name, locale)} ({pet.rarity})
                  </option>
                ))}
              </select>
              <select
                value={slot.star}
                disabled={!slot.slug}
                onChange={(e) => setPet(i, slot.slug, Number(e.target.value))}
                aria-label={l(`펫 ${i + 1} 별`, `Pet ${i + 1} stars`, `ペット${i + 1}の星`)}
              >
                {[1, 2, 3, 4, 5].map((s) => (
                  <option key={s} value={s}>
                    {l(`★${s}`, `★${s}`, `★${s}`)}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>

      <h4 className="sim-subhead">{l('치명과 적중', 'Crits and hits', '会心と命中')}</h4>
      <div className="filter-chips">
        <button type="button" aria-pressed={settings.hits === 'average'} onClick={() => set('hits', 'average')}>
          {l('기댓값으로 계산', 'Use expected values', '期待値で計算')}
        </button>
        <button type="button" aria-pressed={settings.hits === 'roll'} onClick={() => set('hits', 'roll')}>
          {l('확률대로 굴리기', 'Roll the dice', '確率で抽選')}
        </button>
      </div>
      <div className="sim-fields">
        <NumberField label={l('시드', 'Seed', 'シード')} value={settings.seed} min={1} max={2 ** 31 - 1} onChange={(v) => set('seed', Math.round(v))} />
      </div>
      <p className="field-note">
        {l(
          '시드는 무작위로 정해지는 것(번개가 떨어질 쿠키, 적이 나타나는 자리, 효과 발동)의 순서를 정합니다. 시드가 같으면 결과도 늘 같습니다.',
          'The seed fixes every random pick (lightning targets, spawn spots, effect procs). The same seed always gives the same result.',
          'シードはランダムな要素(落雷の対象、出現位置、効果の発動)の順番を決めます。同じシードなら結果も同じです。',
        )}
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 출전 쿠키 고르기
// ---------------------------------------------------------------------------

const normalize = (text: string) => text.replace(/\s/g, '').toLocaleLowerCase()

export function LineupPicker({
  cookies,
  selected,
  onChange,
  max,
  title,
  note,
  extra,
}: {
  cookies: CookieEntry[]
  selected: string[]
  onChange: (next: string[]) => void
  max: number
  title: string
  note: string
  extra?: ReactNode
}) {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const byEid = useMemo(() => new Map(cookies.map((c) => [c.eid, c])), [cookies])
  const sorted = useMemo(() => [...cookies].sort((a, b) => a.name.ko.localeCompare(b.name.ko, 'ko')), [cookies])
  const shown = sorted.filter((c) => !deferred || normalize(localizedText(c.name, locale)).includes(normalize(deferred)) || normalize(c.name.ko).includes(normalize(deferred)))
  const full = selected.length >= max
  const toggle = (eid: string) => onChange(selected.includes(eid) ? selected.filter((e) => e !== eid) : full ? selected : [...selected, eid])
  const move = (i: number, by: number) => {
    const j = i + by
    if (j < 0 || j >= selected.length) return
    const next = [...selected]
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    onChange(next)
  }

  return (
    <section className="panel sim-panel">
      <h3>
        {title} <span className="list-meta">{l(`${selected.length}/${max}명`, `${selected.length}/${max}`, `${selected.length}/${max}人`)}</span>
      </h3>
      <p className="subtle">{note}</p>
      {extra}
      {selected.length > 0 && (
        <ol className="sim-lineup">
          {selected.map((eid, i) => {
            const cookie = byEid.get(eid)
            if (!cookie) return null
            return (
              <li key={eid}>
                <img src={asset(cookie.image)} alt="" loading="lazy" width={28} height={28} />
                <span className="sim-lineup-name">{localizedText(cookie.name, locale)}</span>
                <span className="sim-lineup-actions">
                  <button type="button" className="text-button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={l('앞으로', 'Move up', '前へ')}>
                    ↑
                  </button>
                  <button type="button" className="text-button" onClick={() => move(i, 1)} disabled={i === selected.length - 1} aria-label={l('뒤로', 'Move down', '後ろへ')}>
                    ↓
                  </button>
                  <button type="button" className="text-button" onClick={() => toggle(eid)} aria-label={l('빼기', 'Remove', '外す')}>
                    ✕
                  </button>
                </span>
              </li>
            )
          })}
        </ol>
      )}
      <div className="sim-search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={l('쿠키 이름 검색', 'Search Cookies', 'クッキー名で検索')}
          aria-label={l('쿠키 이름 검색', 'Search Cookies', 'クッキー名で検索')}
        />
        {selected.length > 0 && (
          <button type="button" className="text-button" onClick={() => onChange([])}>
            {l('모두 빼기', 'Clear all', 'すべて外す')}
          </button>
        )}
      </div>
      <div className="sim-roster" role="group" aria-label={title}>
        {shown.map((cookie) => {
          const on = selected.includes(cookie.eid)
          return (
            <button
              type="button"
              key={cookie.eid}
              className="sim-roster-item"
              aria-pressed={on}
              disabled={!on && full}
              onClick={() => toggle(cookie.eid)}
              title={`${label(ROLE, cookie.role, locale)} · ${label(ELEMENT, cookie.element, locale)}`}
            >
              <img src={asset(cookie.image)} alt="" loading="lazy" width={32} height={32} />
              <span>{localizedText(cookie.name, locale)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
