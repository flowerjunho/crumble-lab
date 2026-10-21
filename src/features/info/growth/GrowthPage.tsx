import { useDeferredValue, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cookieDbQuery } from '../../../api/queries'
import { pick, useI18n } from '../../../i18n'
import { RARITY_ORDER, pct } from '../../../lib/cookieLabels'
import { localizedText } from '../../../lib/localize'
import type { CookieEntry, Locale } from '../../../types'
import { GROWTH_RARITIES, cookieStats, cumulativeExp, gradeBonus, levelBoost, levelCost, type GrowthData, type StatFold } from './growth'
import { growthQuery } from './growthData'
import './growth.css'

const fmt = (value: number, locale: Locale) => value.toLocaleString(locale, { maximumFractionDigits: 2 })
/** 만분율 → "+6.91%" */
const boostPct = (bp: number) => `+${Number((bp / 100).toFixed(2))}%`
const normalize = (text: string) => text.replace(/\s/g, '').toLocaleLowerCase()

/** 입력 중에는 빈 칸·범위 밖 값도 그대로 두고, 확정할 때(포커스 해제·Enter) 범위로 맞춘다. */
function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null && draft.trim() !== '' && Number.isFinite(Number(draft))) onChange(Math.min(max, Math.max(min, Math.round(Number(draft)))))
    setDraft(null)
  }
  return (
    <label className="growth-field">
      <span className="filter-label">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
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

interface Range {
  from: number
  to: number
  setFrom: (v: number) => void
  setTo: (v: number) => void
}

function Calculator({ data, cookies, locale, range }: { data: GrowthData; cookies: CookieEntry[]; locale: Locale; range: Range }) {
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [eid, setEid] = useState(cookies[0]?.eid ?? '')
  const [level, setLevel] = useState(data.maxLevel)
  const [grade, setGrade] = useState(data.maxGrade)
  const [fold, setFold] = useState<StatFold>('compound')
  const { from, to, setFrom, setTo } = range

  const matches = cookies.filter((c) => !deferredQuery || normalize(localizedText(c.name, locale)).includes(normalize(deferredQuery)) || normalize(c.name.ko).includes(normalize(deferredQuery)))
  const cookie = cookies.find((c) => c.eid === eid) ?? cookies[0]
  // 검색 결과에 지금 고른 쿠키가 없으면 목록 맨 앞에 남겨 두어 선택이 바뀌지 않게 한다.
  const options = cookie && !matches.includes(cookie) ? [cookie, ...matches] : matches
  if (!cookie) return null

  const stats = cookieStats(data, cookie, level, grade, fold)
  const bonus = gradeBonus(data, cookie.rarity, grade)
  const cost = levelCost(data, from, to)
  const stat = (key: string, name: string, value: string) => (
    <div key={key}>
      <dt>{name}</dt>
      <dd>{value}</dd>
    </div>
  )

  return (
    <section className="panel growth-calc" aria-labelledby="growth-calc-title">
      <h3 id="growth-calc-title">{l('능력치 계산기', 'Stat calculator', 'ステータス計算機')}</h3>
      <p className="subtle">{l('쿠키와 레벨, 별 개수를 고르면 장비·펫·슈가룬을 빼고 쿠키 자체의 능력치를 보여 줍니다.', 'Pick a Cookie, level and stars to see its own stats, without gear, Pets or Sugar Runes.', 'クッキー・レベル・星の数を選ぶと、装備・ペット・シュガールーンを除いたクッキー自身のステータスを表示します。')}</p>

      <div className="growth-pick">
        <div className="search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 5 5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              // 검색 결과가 하나뿐이면 바로 고른다.
              const only = cookies.filter((c) => normalize(localizedText(c.name, locale)).includes(normalize(e.target.value)) || normalize(c.name.ko).includes(normalize(e.target.value)))
              if (e.target.value && only.length === 1 && only[0]) setEid(only[0].eid)
            }}
            placeholder={l('쿠키 이름 검색', 'Search Cookies', 'クッキー名で検索')}
            aria-label={l('쿠키 이름 검색', 'Search Cookies', 'クッキー名で検索')}
          />
        </div>
        <select value={cookie.eid} onChange={(e) => setEid(e.target.value)} aria-label={l('쿠키', 'Cookie', 'クッキー')}>
          {options.map((c) => (
            <option key={c.eid} value={c.eid}>
              {`${c.rarity} · ${localizedText(c.name, locale)}`}
            </option>
          ))}
        </select>
      </div>

      <div className="growth-controls">
        <div className="growth-level">
          <NumberField label={l('레벨', 'Level', 'レベル')} value={level} min={1} max={data.maxLevel} onChange={setLevel} />
          <input type="range" min={1} max={data.maxLevel} value={level} onChange={(e) => setLevel(Number(e.target.value))} aria-label={l('레벨', 'Level', 'レベル')} />
        </div>
        <div className="filter-row">
          <span className="filter-label">{l('별', 'Stars', '星')}</span>
          <div className="filter-chips growth-stars">
            {Array.from({ length: data.maxGrade + 1 }, (_, g) => (
              <button type="button" key={g} aria-pressed={grade === g} onClick={() => setGrade(g)}>
                {g}★
              </button>
            ))}
          </div>
        </div>
      </div>

      <dl className="detail-stats growth-stats">
        {stat('atk', l('공격력', 'ATK', '攻撃力'), fmt(stats.atk, locale))}
        {stat('def', l('방어력', 'DEF', '防御力'), fmt(stats.def, locale))}
        {stat('hp', l('체력', 'HP', 'HP'), fmt(stats.hp, locale))}
        {stat('critRate', l('치명확률', 'CRIT Rate', '会心率'), pct(stats.critRate))}
        {stat('critDamage', l('치명피해', 'CRIT DMG', '会心ダメージ'), pct(stats.critDamage))}
        {stat('accuracy', l('명중', 'Accuracy', '命中'), fmt(stats.accuracy, locale))}
        {stat('avoidance', l('회피', 'Avoidance', '回避'), fmt(stats.avoidance, locale))}
        {stat('focus', l('집중', 'Focus', '集中'), fmt(stats.focus, locale))}
        {stat('resist', l('저항', 'Resist', '抵抗'), fmt(stats.resist, locale))}
      </dl>
      <p className="field-note">
        {l(
          `기본 능력치는 공격력 ${fmt(cookie.stats.atk, locale)}, 방어력 ${fmt(cookie.stats.def, locale)}, 체력 ${fmt(cookie.stats.hp, locale)}입니다. ${stats.level}레벨에서는 세 능력치가 ${pct(levelBoost(data, stats.level))} 늘고, ${cookie.rarity} 등급 ${stats.grade}성에서는 공격력·체력이 ${pct(bonus.atk)}, 방어력이 ${pct(bonus.def)} 늘어납니다.`,
          `Base stats: ATK ${fmt(cookie.stats.atk, locale)}, DEF ${fmt(cookie.stats.def, locale)}, HP ${fmt(cookie.stats.hp, locale)}. Level ${stats.level} adds ${pct(levelBoost(data, stats.level))} to all three; ${stats.grade} stars on a ${cookie.rarity} Cookie add ${pct(bonus.atk)} ATK and HP and ${pct(bonus.def)} DEF.`,
          `基本ステータスは攻撃力${fmt(cookie.stats.atk, locale)}、防御力${fmt(cookie.stats.def, locale)}、HP${fmt(cookie.stats.hp, locale)}です。${stats.level}レベルでは3つとも${pct(levelBoost(data, stats.level))}増え、${cookie.rarity}の星${stats.grade}では攻撃力・HPが${pct(bonus.atk)}、防御力が${pct(bonus.def)}増えます。`,
        )}
      </p>

      <div className="filter-row growth-fold">
        <span className="filter-label">{l('계산 방식', 'Formula', '計算方式')}</span>
        <div className="filter-chips">
          <button type="button" aria-pressed={fold === 'compound'} onClick={() => setFold('compound')}>
            {l('곱하기', 'Multiply', '乗算')}
          </button>
          <button type="button" aria-pressed={fold === 'pooled'} onClick={() => setFold('pooled')}>
            {l('더하기', 'Add', '加算')}
          </button>
        </div>
      </div>
      <p className="field-note">
        {l(
          '곱하기는 별로 오른 능력치에 레벨 증가율을 다시 곱하는 방식이고, 더하기는 두 증가율을 더해 기본 능력치에 한 번만 곱하는 방식입니다. 게임 데이터만으로는 어느 쪽인지 확정할 수 없어서, 국내 데이터 위키와 같은 곱하기를 기본으로 둡니다.',
          'Multiply applies the level boost on top of the star-boosted stats; Add sums both boosts and applies them to the base once. Game data alone does not settle which is right, so Multiply, which a Korean data wiki also uses, is the default.',
          '乗算は星で上がったステータスにレベル増加率をさらに掛ける方式、加算は2つの増加率を足して基本ステータスに1回だけ掛ける方式です。ゲームデータだけではどちらか確定できないため、韓国のデータwikiと同じ乗算を既定にしています。',
        )}
      </p>

      <h4 className="growth-subhead">{l('레벨업 비용', 'Level-up cost', 'レベルアップ費用')}</h4>
      <div className="growth-range">
        <NumberField label={l('현재 레벨', 'From', '現在')} value={from} min={1} max={data.maxLevel} onChange={setFrom} />
        <NumberField label={l('목표 레벨', 'To', '目標')} value={to} min={1} max={data.maxLevel} onChange={setTo} />
      </div>
      <dl className="detail-stats">
        {stat('exp', l('필요한 쿠키 경험치', 'Cookie EXP needed', '必要なクッキー経験値'), fmt(cost.exp, locale))}
        {stat('crumble', l('필요 크럼블 레벨', 'Crumble Level needed', '必要クランブルレベル'), fmt(cost.crumbleLevel, locale))}
        {stat('gain', l('공격력·방어력·체력 증가', 'ATK/DEF/HP gain', '攻撃力・防御力・HP増加'), `+${pct(cost.statGain)}`)}
      </dl>
      <p className="field-note">
        {cost.from === cost.to
          ? l('목표 레벨을 현재 레벨보다 높게 입력해 주세요.', 'Enter a target level above the current one.', '目標レベルを現在のレベルより高く入力してください。')
          : l(
              `${cost.from}레벨에서 ${cost.to}레벨까지 올리는 비용입니다. 크럼블 레벨이 ${cost.crumbleLevel} 이상이어야 ${cost.to}레벨로 올릴 수 있습니다.`,
              `Cost from level ${cost.from} to ${cost.to}. Your Crumble Level must be at least ${cost.crumbleLevel} to reach level ${cost.to}.`,
              `${cost.from}レベルから${cost.to}レベルまで上げる費用です。${cost.to}レベルに上げるにはクランブルレベル${cost.crumbleLevel}以上が必要です。`,
            )}
      </p>
    </section>
  )
}

function LevelTable({ data, locale, from, to }: { data: GrowthData; locale: Locale; from: number; to: number }) {
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const cumulative = useMemo(() => cumulativeExp(data), [data])
  return (
    <section className="panel" aria-labelledby="growth-level-title">
      <h3 id="growth-level-title">{l('레벨 표', 'Level table', 'レベル表')}</h3>
      <p className="subtle">
        {l(
          '쿠키 경험치는 바로 앞 레벨에서 그 레벨로 올리는 데 드는 양입니다. 능력치 증가는 1레벨과 비교해 공격력·방어력·체력이 늘어나는 비율이며, 세 능력치가 같습니다. 계산기에서 고른 레벨업 구간을 색으로 표시합니다.',
          'Cookie EXP is the cost to reach that level from the one before. Stat boost is how much ATK, DEF and HP grow over level 1, the same for all three. The range picked above is highlighted.',
          'クッキー経験値は前のレベルからそのレベルに上げる量です。ステータス増加は1レベルと比べた攻撃力・防御力・HPの増加率で、3つとも同じです。上で選んだレベル区間を色で示します。',
        )}
      </p>
      <div className="table-scroll growth-table-scroll">
        <table className="detail-table growth-table" aria-labelledby="growth-level-title">
          <thead>
            <tr>
              <th scope="col">{l('레벨', 'Level', 'レベル')}</th>
              <th scope="col">{l('쿠키 경험치', 'Cookie EXP', 'クッキー経験値')}</th>
              <th scope="col">{l('누적 경험치', 'Total EXP', '累計経験値')}</th>
              <th scope="col">{l('크럼블 레벨', 'Crumble Lv', 'クランブルLv')}</th>
              <th scope="col">{l('능력치 증가', 'Stat boost', 'ステータス増加')}</th>
            </tr>
          </thead>
          <tbody>
            {data.levels.map(([lv, exp, crumble, bp], i) => (
              <tr key={lv} className={lv > from && lv <= to ? 'growth-in' : lv % 10 === 0 ? 'growth-mark' : undefined}>
                <th scope="row">{l(`${lv}레벨`, `Lv ${lv}`, `Lv${lv}`)}</th>
                <td>{i ? fmt(exp, locale) : '—'}</td>
                <td>{fmt(cumulative[i] ?? 0, locale)}</td>
                <td>{crumble}</td>
                <td>{boostPct(bp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function GradeTable({ data, locale }: { data: GrowthData; locale: Locale }) {
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const rarities = RARITY_ORDER.filter((r) => (GROWTH_RARITIES as readonly string[]).includes(r))
  return (
    <section className="panel" aria-labelledby="growth-grade-title">
      <h3 id="growth-grade-title">{l('승급 효과', 'Star bonuses', '昇級効果')}</h3>
      <p className="subtle">
        {l(
          '별 개수마다 쌓이는 효과입니다. 공격력과 체력은 등급마다 늘어나는 비율이 다르고, 방어력과 나머지 능력치는 모든 등급이 같습니다. 치명확률·치명피해는 기본값(10%·50%)에 더해지고, 명중·회피·집중·저항은 기본값 100에 더해집니다.',
          'Bonuses accumulated at each star count. ATK and HP grow at a different rate per rarity; DEF and the other stats are the same for every rarity. CRIT Rate and CRIT DMG add to the base 10% and 50%; Accuracy, Avoidance, Focus and Resist add to a base of 100.',
          '星の数ごとに積み上がる効果です。攻撃力とHPはレア度ごとに増加率が異なり、防御力とその他のステータスは全レア度共通です。会心率・会心ダメージは基本値(10%・50%)に、命中・回避・集中・抵抗は基本値100に加算されます。',
        )}
      </p>
      <div className="table-scroll">
        <table className="detail-table growth-table">
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>
                {l('별', 'Stars', '星')}
              </th>
              <th scope="colgroup" colSpan={rarities.length} className="growth-group">
                {l('공격력·체력', 'ATK / HP', '攻撃力・HP')}
              </th>
              <th scope="col" rowSpan={2}>
                {l('방어력', 'DEF', '防御力')}
              </th>
              <th scope="col" rowSpan={2}>
                {l('치명확률', 'CRIT Rate', '会心率')}
              </th>
              <th scope="col" rowSpan={2}>
                {l('치명피해', 'CRIT DMG', '会心ダメージ')}
              </th>
              <th scope="col" rowSpan={2}>
                {l('명중·회피·집중·저항', 'ACC / AVO / FOC / RES', '命中・回避・集中・抵抗')}
              </th>
            </tr>
            <tr>
              {rarities.map((r) => (
                <th scope="col" key={r}>
                  <span className={`rarity-badge rarity-${r.toLowerCase()}`}>{r}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: data.maxGrade }, (_, i) => {
              const g = i + 1
              const shared = gradeBonus(data, 'C', g)
              return (
                <tr key={g}>
                  <th scope="row">{g}★</th>
                  {rarities.map((r) => (
                    <td key={r}>+{pct(gradeBonus(data, r, g).atk)}</td>
                  ))}
                  <td>+{pct(shared.def)}</td>
                  <td>+{pct(shared.critRate)}</td>
                  <td>+{pct(shared.critDamage)}</td>
                  <td>+{shared.accuracy}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** 쿠키 성장: 능력치 계산기, 레벨 표, 승급 효과 표 */
export function GrowthPage() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const growth = useQuery(growthQuery)
  const cookieDb = useQuery(cookieDbQuery)
  // 레벨업 비용 구간은 계산기와 레벨 표가 함께 쓴다(표에서 구간을 색으로 표시).
  const [from, setFrom] = useState(100)
  const [to, setTo] = useState(120)

  if (growth.isPending || cookieDb.isPending) return <p className="result-placeholder">{l('성장 정보를 불러오고 있습니다.', 'Loading growth data…', '育成情報を読み込み中…')}</p>
  if (growth.isError || cookieDb.isError)
    return (
      <div className="no-results">
        <p>{l('성장 정보를 불러오지 못했습니다.', 'Unable to load growth data.', '育成情報を読み込めませんでした。')}</p>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            void growth.refetch()
            void cookieDb.refetch()
          }}
        >
          {l('다시 시도', 'Retry', '再試行')}
        </button>
      </div>
    )

  // 높은 등급부터, 같은 등급 안에서는 지금 언어의 이름 순서로 보여 준다.
  const cookies = [...cookieDb.data.cookies].sort(
    (a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || localizedText(a.name, locale).localeCompare(localizedText(b.name, locale), locale),
  )

  return (
    <div className="growth">
      <div className="section-intro">
        <div>
          <h2>{l('쿠키 성장', 'Cookie growth', 'クッキー育成')}</h2>
          <p>{l('레벨업과 승급으로 쿠키 능력치가 얼마나 오르는지, 레벨업에 쿠키 경험치가 얼마나 드는지 확인할 수 있습니다.', 'See how leveling and stars raise a Cookie’s stats, and how much Cookie EXP each level costs.', 'レベルアップと昇級でクッキーのステータスがどれだけ上がるか、レベルアップに必要なクッキー経験値を確認できます。')}</p>
        </div>
      </div>
      <Calculator data={growth.data} cookies={cookies} locale={locale} range={{ from, to, setFrom, setTo }} />
      <LevelTable data={growth.data} locale={locale} from={Math.min(from, to)} to={to} />
      <GradeTable data={growth.data} locale={locale} />
      <p className="field-note">
        {l(
          `수치는 게임 클라이언트 ${growth.data._meta.gameBuild} 기준입니다(EOG.GG 공개 데이터).`,
          `Values from game client ${growth.data._meta.gameBuild} (EOG.GG public data).`,
          `数値はゲームクライアント${growth.data._meta.gameBuild}基準です(EOG.GG公開データ)。`,
        )}
      </p>
    </div>
  )
}
