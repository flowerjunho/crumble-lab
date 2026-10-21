import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pick, useI18n } from '../../../i18n'
import type { Locale } from '../../../types'
import { gearQuery } from './gearQuery'
import {
  GEAR_GROUP,
  GEAR_GROUP_ORDER,
  GEAR_RARITY,
  GEAR_SLOT,
  GEAR_STAT,
  RUNE_STAT,
  RUNE_STAT_ORDER,
  gearValue,
  label,
  num,
  ratio,
} from './gearLabels'
import type { GearData, GearGroup } from './gearTypes'
import { PLATE_CRUSH_TO, expectedPlateCost, platedValues, runeRarityTotals, type PlateOptions } from './plateMath'
import './gear.css'

type Pick = <T>(ko: T, en: T, ja: T) => T

export function GearPage() {
  const { locale } = useI18n()
  const l: Pick = (ko, en, ja) => pick(locale, ko, en, ja)
  const { data, isPending, isError, refetch } = useQuery(gearQuery)

  if (isPending) return <p className="result-placeholder">{l('장비 정보를 불러오고 있습니다.', 'Loading gear…', '装備情報を読み込み中…')}</p>
  if (isError)
    return (
      <div className="no-results">
        <p>{l('장비 정보를 불러오지 못했습니다.', 'Unable to load gear.', '装備情報を読み込めませんでした。')}</p>
        <button type="button" className="text-button" onClick={() => refetch()}>
          {l('다시 시도', 'Retry', '再試行')}
        </button>
      </div>
    )

  return (
    <div className="gear-page">
      <div className="section-intro">
        <div>
          <h2>{l('장비', 'Gear', '装備')}</h2>
          <p>
            {l(
              '오븐에서 나오는 장비의 등급 확률과 옵션, 플레이트 강화 확률, 슈가룬 수치를 한곳에 모았습니다.',
              'Oven odds, gear options, Plate enhancement rates and Sugar Rune values in one place.',
              'オーブンで出る装備の等級確率とオプション、プレート強化確率、シュガールーンの数値をまとめました。',
            )}
          </p>
        </div>
      </div>
      <OvenPanel data={data} locale={locale} l={l} />
      <SlotPanel data={data} locale={locale} l={l} />
      <RarityPanel data={data} locale={locale} l={l} />
      <SubRangePanel data={data} locale={locale} l={l} />
      <PlatePanel data={data} locale={locale} l={l} />
      <RunePanel data={data} locale={locale} l={l} />
    </div>
  )
}

interface PanelProps {
  data: GearData
  locale: Locale
  l: Pick
}

function OvenPanel({ data, locale, l }: PanelProps) {
  const [level, setLevel] = useState(1)
  const row = data.oven[level - 1] ?? data.oven[0]!
  const slotCount = data.slots.filter((s) => s.unlockAt <= row.level).length
  const best = [...data.rarities].reverse().find((_, i) => (row.odds[data.rarities.length - 1 - i] ?? 0) > 0)
  const peak = Math.max(...row.odds)
  const newSlots = (lv: number) => data.slots.filter((s) => s.unlockAt === lv).map((s) => label(GEAR_SLOT, s.key, locale))

  return (
    <section className="panel detail-section gear-panel" aria-labelledby="gear-oven-title">
      <h3 id="gear-oven-title">{l('오븐 레벨별 등장 확률', 'Oven odds by level', 'オーブンレベル別の出現確率')}</h3>
      <p className="field-note">
        {l(
          '오븐 레벨이 오르면 새 장비 종류가 열리고 높은 등급이 나올 확률이 커집니다. 장비 레벨도 오븐 레벨에 따라 정해진 범위 안에서 나옵니다.',
          'Each Oven level opens more gear types and shifts the odds toward higher rarities. Item level is drawn from a range set by the Oven level.',
          'オーブンレベルが上がると新しい装備の種類が解放され、高い等級が出る確率が上がります。装備レベルもオーブンレベルで決まる範囲から出ます。',
        )}
      </p>

      <label className="gear-range">
        <span className="filter-label">{l('오븐 레벨', 'Oven level', 'オーブンレベル')}</span>
        <input type="range" min={1} max={data.oven.length} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
        <strong>Lv.{row.level}</strong>
      </label>

      <dl className="detail-stats gear-summary">
        <div>
          <dt>{l('장비 레벨', 'Item level', '装備レベル')}</dt>
          <dd>
            {row.itemLevel[0]}~{row.itemLevel[1]}
          </dd>
        </div>
        <div>
          <dt>{l('한 번에 여는 개수', 'Opened at once', '一度に開く数')}</dt>
          <dd>{row.autoOpen}</dd>
        </div>
        <div>
          <dt>{l('나오는 장비 종류', 'Gear types', '出る装備の種類')}</dt>
          <dd>
            {slotCount}
            <small> / {data.slots.length}</small>
          </dd>
        </div>
        <div>
          <dt>{l('최고 등급', 'Best rarity', '最高等級')}</dt>
          <dd className="text-value">{best ? label(GEAR_RARITY, best.key, locale) : '-'}</dd>
        </div>
      </dl>

      <ul className="gear-odds" aria-label={l(`Lv.${row.level} 등급별 확률`, `Lv.${row.level} odds by rarity`, `Lv.${row.level} 等級別確率`)}>
        {data.rarities.map((rarity, i) => {
          const p = row.odds[i] ?? 0
          return (
            <li key={rarity.key} className={p === 0 ? 'is-off' : undefined}>
              <span>{label(GEAR_RARITY, rarity.key, locale)}</span>
              <span className="gear-odds-track">
                <span style={{ width: `${peak > 0 ? (p / peak) * 100 : 0}%` }} />
              </span>
              <span className="gear-num">{p ? `${num(p, locale, 3)}%` : '-'}</span>
            </li>
          )
        })}
      </ul>

      <details className="gear-details">
        <summary>{l('Lv.1~50 전체 표 보기', 'Show the full Lv.1–50 table', 'Lv.1〜50の全表を見る')}</summary>
        <div className="table-scroll">
          <table className="detail-table gear-table">
            <thead>
              <tr>
                <th scope="col">{l('오븐', 'Oven', 'オーブン')}</th>
                <th scope="col">{l('장비 레벨', 'Item Lv', '装備Lv')}</th>
                <th scope="col">{l('여는 개수', 'At once', '開く数')}</th>
                {data.rarities.map((r) => (
                  <th scope="col" key={r.key}>
                    {label(GEAR_RARITY, r.key, locale)}
                  </th>
                ))}
                <th scope="col">{l('새 장비 종류', 'New types', '新しい種類')}</th>
              </tr>
            </thead>
            <tbody>
              {data.oven.map((o) => (
                <tr key={o.level} className={o.level === row.level ? 'is-current' : undefined}>
                  <th scope="row">Lv.{o.level}</th>
                  <td>
                    {o.itemLevel[0]}~{o.itemLevel[1]}
                  </td>
                  <td>{o.autoOpen}</td>
                  {o.odds.map((p, i) => (
                    <td key={i}>{p ? `${num(p, locale, 3)}%` : <small>-</small>}</td>
                  ))}
                  <td className="gear-text">{newSlots(o.level).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}

function SlotPanel({ data, locale, l }: PanelProps) {
  return (
    <section className="panel detail-section gear-panel" aria-labelledby="gear-slot-title">
      <h3 id="gear-slot-title">{l('장비 종류와 옵션', 'Gear types and options', '装備の種類とオプション')}</h3>
      <p className="field-note">
        {l(
          '메인 옵션은 장비 종류마다 정해져 있습니다. 보조 옵션은 아래 후보 중에서 같은 확률로 뽑히고, 한 장비에 같은 옵션이 두 번 붙지 않습니다.',
          'Each gear type has a fixed main option. Sub options are drawn evenly from the listed pool, and one piece never repeats an option.',
          'メインオプションは装備の種類ごとに決まっています。サブオプションは下の候補から同じ確率で選ばれ、1つの装備に同じオプションは付きません。',
        )}
      </p>
      <div className="table-scroll">
        <table className="detail-table gear-table">
          <thead>
            <tr>
              <th scope="col">{l('장비', 'Gear', '装備')}</th>
              <th scope="col">{l('메인 옵션', 'Main option', 'メインオプション')}</th>
              <th scope="col">{l('보조 옵션 후보', 'Sub option pool', 'サブオプション候補')}</th>
              <th scope="col">{l('등장 오븐 레벨', 'From Oven Lv', '出現オーブンLv')}</th>
            </tr>
          </thead>
          <tbody>
            {data.slots.map((slot) => {
              const pool = data.subPools[slot.group]
              return (
                <tr key={slot.key}>
                  <th scope="row">
                    {label(GEAR_SLOT, slot.key, locale)} <small>{label(GEAR_GROUP, slot.group, locale)}</small>
                  </th>
                  <td>{label(GEAR_STAT, slot.main, locale)}</td>
                  <td className="gear-text">
                    {pool.map((s) => label(GEAR_STAT, s, locale)).join(', ')} <small>({l('각', 'each', '各')} {num(100 / pool.length, locale)}%)</small>
                  </td>
                  <td>Lv.{slot.unlockAt}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function RarityPanel({ data, locale, l }: PanelProps) {
  return (
    <section className="panel detail-section gear-panel" aria-labelledby="gear-rarity-title">
      <h3 id="gear-rarity-title">{l('장비 등급', 'Gear rarity', '装備の等級')}</h3>
      <p className="field-note">
        {l(
          '장비 옵션은 장비 레벨에 따른 기본값에 등급 배율을 곱한 값입니다. 공격력·방어력·체력은 다른 스탯보다 등급에 따라 훨씬 크게 오릅니다.',
          'Gear options are the level base value times the rarity multiplier. ATK, DEF and HP scale with rarity much faster than other stats.',
          '装備オプションは装備レベルの基本値に等級倍率を掛けた値です。攻撃力・防御力・HPはほかの能力値より等級で大きく伸びます。',
        )}
      </p>
      <div className="table-scroll">
        <table className="detail-table gear-table">
          <thead>
            <tr>
              <th scope="col">{l('등급', 'Rarity', '等級')}</th>
              <th scope="col">{l('공격력·방어력·체력 배율', 'ATK/DEF/HP ×', '攻撃力・防御力・HP倍率')}</th>
              <th scope="col">{l('그 외 스탯 배율', 'Other stats ×', 'その他倍率')}</th>
              <th scope="col">{l('보조 옵션 개수', 'Sub options', 'サブオプション数')}</th>
            </tr>
          </thead>
          <tbody>
            {data.rarities.map((r) => (
              <tr key={r.key}>
                <th scope="row">{label(GEAR_RARITY, r.key, locale)}</th>
                <td>{num(r.primaryScale, locale)}%</td>
                <td>{num(r.otherScale, locale)}%</td>
                <td>{r.subCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SubRangePanel({ data, locale, l }: PanelProps) {
  const [group, setGroup] = useState<GearGroup>('weapon')
  const first = data.rarities.findIndex((r) => r.key === data.subRange.from)
  const rarities = data.rarities.slice(first)
  return (
    <section className="panel detail-section gear-panel" aria-labelledby="gear-sub-title">
      <h3 id="gear-sub-title">{l('보조 옵션 수치 범위', 'Sub option ranges', 'サブオプションの数値範囲')}</h3>
      <p className="field-note">
        {l(
          '플레이트 강화 전(+0) 기준입니다. 보조 옵션은 마법 등급부터 붙고, 수치는 등급별 범위 안에서 정해집니다.',
          'Before Plate enhancement (+0). Sub options start at Magic, and each value is rolled within the range for its rarity.',
          'プレート強化前(+0)の値です。サブオプションは魔法等級から付き、数値は等級ごとの範囲内で決まります。',
        )}
      </p>
      <div className="filter-row">
        <span className="filter-label">{l('장비', 'Gear', '装備')}</span>
        <div className="filter-chips">
          {GEAR_GROUP_ORDER.map((g) => (
            <button type="button" key={g} aria-pressed={group === g} onClick={() => setGroup(g)}>
              {label(GEAR_GROUP, g, locale)}
            </button>
          ))}
        </div>
      </div>
      <p className="subtle gear-group-slots">
        {data.slots
          .filter((s) => s.group === group)
          .map((s) => label(GEAR_SLOT, s.key, locale))
          .join(' · ')}
      </p>
      <div className="table-scroll">
        <table className="detail-table gear-table">
          <thead>
            <tr>
              <th scope="col">{l('옵션', 'Option', 'オプション')}</th>
              {rarities.map((r) => (
                <th scope="col" key={r.key}>
                  {label(GEAR_RARITY, r.key, locale)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.subPools[group].map((stat) => (
              <tr key={stat}>
                <th scope="row">{label(GEAR_STAT, stat, locale)}</th>
                {data.subRange.stats[stat].map(([min, max], i) => (
                  <td key={i}>{min === max ? gearValue(stat, min, locale) : `${gearValue(stat, min, locale)}~${gearValue(stat, max, locale)}`}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PlatePanel({ data, locale, l }: PanelProps) {
  const { boost, steps } = data.plate
  const maxGrade = boost.length - 1
  const subSteps = boost.filter((b, i) => i > 0 && b.sub !== boost[i - 1]?.sub).map((b) => `+${b.grade}`)
  const grades = boost.map((b) => b.grade)

  const [main, setMain] = useState('1695')
  const [sub, setSub] = useState('131')
  const [grade, setGrade] = useState(12)
  const plated = platedValues(boost, grade, Number(main) || 0, Number(sub) || 0)
  const gradeRow = boost[grade]

  const [from, setFrom] = useState(0)
  const [to, setTo] = useState(15)
  const [options, setOptions] = useState<PlateOptions>({ guard: false, ease: false, restore: false })
  const expected = from < to ? expectedPlateCost(steps, from, to, options) : null
  const toggle = (key: keyof PlateOptions) => setOptions((o) => ({ ...o, [key]: !o[key] }))
  const firstDown = steps.find((s) => s.down > 0)?.from
  const firstCrush = steps.find((s) => s.crush > 0)?.from
  const pctCell = (v: number) => (v ? ratio(v, locale) : <small>-</small>)
  const costCell = (v: number | null) => (v == null ? <small>-</small> : num(v, locale))

  return (
    <section className="panel detail-section gear-panel" aria-labelledby="gear-plate-title">
      <h3 id="gear-plate-title">{l('플레이트 강화', 'Plate enhancement', 'プレート強化')}</h3>
      <p className="field-note">
        {l(
          `플레이트 강화 단계가 오르면 메인 옵션과 보조 옵션이 함께 커집니다. 메인 옵션은 단계마다 오르고, 보조 옵션은 ${subSteps.join(', ')}에서만 오릅니다.`,
          `Each Plate grade raises the main option; sub options only rise at ${subSteps.join(', ')}.`,
          `プレート強化の段階が上がるとメインオプションとサブオプションが一緒に伸びます。サブオプションが伸びるのは${subSteps.join('、')}だけです。`,
        )}
      </p>

      <div className="gear-calc">
        <h4>{l('강화 후 수치 계산', 'Plated value', '強化後の数値')}</h4>
        <div className="gear-fields">
          <label>
            <span className="filter-label">{l('메인 옵션(+0)', 'Main option (+0)', 'メイン(+0)')}</span>
            <input type="number" inputMode="decimal" min={0} value={main} onChange={(e) => setMain(e.target.value)} />
          </label>
          <label>
            <span className="filter-label">{l('보조 옵션(+0)', 'Sub option (+0)', 'サブ(+0)')}</span>
            <input type="number" inputMode="decimal" min={0} value={sub} onChange={(e) => setSub(e.target.value)} />
          </label>
          <label>
            <span className="filter-label">{l('강화 단계', 'Plate grade', '強化段階')}</span>
            <select value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
              {grades.map((g) => (
                <option key={g} value={g}>
                  +{g}
                </option>
              ))}
            </select>
          </label>
        </div>
        <dl className="detail-stats">
          <div>
            <dt>
              {l('메인 옵션', 'Main option', 'メイン')} <small>×{num(1 + (gradeRow?.main ?? 0), locale)}</small>
            </dt>
            <dd>{num(plated.main, locale)}</dd>
          </div>
          <div>
            <dt>
              {l('보조 옵션', 'Sub option', 'サブ')} <small>×{num(1 + (gradeRow?.sub ?? 0), locale)}</small>
            </dt>
            <dd>{num(plated.sub, locale)}</dd>
          </div>
        </dl>
        <p className="field-note">
          {l(
            '장비 정보에 보이는 강화 전 수치를 넣으세요. 예시 값은 레전더리 Lv.75 검의 공격력입니다.',
            'Enter the values shown before plating. The defaults are a Legendary Lv.75 Sword’s ATK.',
            '強化前の数値を入力してください。初期値はレジェンダリーLv.75の剣の攻撃力です。',
          )}
        </p>
      </div>

      <div className="gear-calc">
        <h4>{l('목표 단계까지 평균 비용', 'Average cost to a target grade', '目標段階までの平均コスト')}</h4>
        <div className="gear-fields">
          <label>
            <span className="filter-label">{l('현재', 'Current', '現在')}</span>
            <select value={from} onChange={(e) => setFrom(Number(e.target.value))}>
              {grades.slice(0, -1).map((g) => (
                <option key={g} value={g}>
                  +{g}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="filter-label">{l('목표', 'Target', '目標')}</span>
            <select value={to} onChange={(e) => setTo(Number(e.target.value))}>
              {grades.slice(1).map((g) => (
                <option key={g} value={g}>
                  +{g}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="filter-chips gear-toggles">
          <button type="button" aria-pressed={options.guard} onClick={() => toggle('guard')}>
            {l('하락 방지', 'Downgrade guard', '下落防止')}
          </button>
          <button type="button" aria-pressed={options.ease} onClick={() => toggle('ease')}>
            {l('박살 완화', 'Break ease', '破壊緩和')}
          </button>
          <button type="button" aria-pressed={options.restore} onClick={() => toggle('restore')}>
            {l('복구', 'Restore', '復旧')}
          </button>
        </div>
        {expected ? (
          <dl className="detail-stats">
            <div>
              <dt>{l('평균 시도 횟수', 'Average tries', '平均試行回数')}</dt>
              <dd>{num(expected.tries, locale, 1)}</dd>
            </div>
            <div>
              <dt>{l('평균 초코강', 'Average Choco Steel', '平均チョコ鋼')}</dt>
              <dd>{num(expected.material, locale, 0)}</dd>
            </div>
            <div>
              <dt>{l('평균 시럽쇳물', 'Average Syrup Iron', '平均シロップ鉄')}</dt>
              <dd>{num(expected.syrup, locale, 0)}</dd>
            </div>
          </dl>
        ) : (
          <p className="result-placeholder">{l('목표 단계를 현재 단계보다 높게 골라 주세요.', 'Pick a target above the current grade.', '目標を現在より高く選んでください。')}</p>
        )}
        <p className="field-note">
          {l(
            `공시된 확률로 끝까지 강화했을 때의 평균입니다. 하락 방지는 하락을 유지로 바꾸고, 박살 완화는 박살 확률을 절반으로 줄이며, 복구는 박살나도 단계를 지킵니다. 복구를 쓰지 않으면 박살 때 +${PLATE_CRUSH_TO}으로 내려갑니다. 대성공 때 돌려받는 초코강은 빼고 계산했습니다.`,
            `Average over many runs at the published rates. Guard turns a downgrade into no change, Ease halves the break chance, and Restore keeps the grade after a break. Without Restore a break drops the Plate to +${PLATE_CRUSH_TO}. The Choco Steel refunded on a great success is not counted.`,
            `公開確率で強化し続けたときの平均です。下落防止は下落を維持に、破壊緩和は破壊確率を半分に、復旧は破壊されても段階を保ちます。復旧を使わないと破壊時に+${PLATE_CRUSH_TO}に戻ります。大成功時に返ってくるチョコ鋼は含めていません。`,
          )}
        </p>
      </div>

      <h4>{l('단계별 강화 확률과 비용', 'Rates and cost per attempt', '段階別の確率とコスト')}</h4>
      <p className="field-note">
        {l(
          `대성공은 2단계, 성공은 1단계 오르고 하락은 1단계 내려갑니다. 하락은 +${firstDown}부터, 박살은 +${firstCrush}부터 생깁니다. 하락 방지·박살 완화·복구 비용은 시럽쇳물입니다.`,
          `A great success climbs two grades, a success one, and a downgrade drops one. Downgrades start at +${firstDown} and breaks at +${firstCrush}. Guard, Ease and Restore cost Syrup Iron.`,
          `大成功は2段階、成功は1段階上がり、下落は1段階下がります。下落は+${firstDown}から、破壊は+${firstCrush}から起こります。下落防止・破壊緩和・復旧はシロップ鉄を使います。`,
        )}
      </p>
      <div className="table-scroll">
        <table className="detail-table gear-table">
          <thead>
            <tr>
              <th scope="col">{l('단계', 'Grade', '段階')}</th>
              <th scope="col">{l('메인 증폭', 'Main', 'メイン')}</th>
              <th scope="col">{l('보조 증폭', 'Sub', 'サブ')}</th>
              <th scope="col">{l('대성공', 'Great', '大成功')}</th>
              <th scope="col">{l('성공', 'Success', '成功')}</th>
              <th scope="col">{l('유지', 'No change', '維持')}</th>
              <th scope="col">{l('하락', 'Down', '下落')}</th>
              <th scope="col">{l('박살', 'Break', '破壊')}</th>
              <th scope="col">{l('초코강', 'Choco Steel', 'チョコ鋼')}</th>
              <th scope="col">{l('하락 방지', 'Guard', '下落防止')}</th>
              <th scope="col">{l('박살 완화', 'Ease', '破壊緩和')}</th>
              <th scope="col">{l('복구', 'Restore', '復旧')}</th>
              <th scope="col">{l('대성공 환급', 'Great refund', '大成功返還')}</th>
            </tr>
          </thead>
          <tbody>
            {boost.map((b) => {
              const step = steps[b.grade]
              const subRise = b.grade > 0 && b.sub !== boost[b.grade - 1]?.sub
              return (
                <tr key={b.grade} className={subRise ? 'is-current' : undefined}>
                  <th scope="row">+{b.grade}</th>
                  <td>+{num(b.main * 100, locale)}%</td>
                  <td>{b.sub ? `+${num(b.sub * 100, locale)}%` : <small>-</small>}</td>
                  {step ? (
                    <>
                      <td>{pctCell(step.great)}</td>
                      <td>{pctCell(step.success)}</td>
                      <td>{pctCell(step.keep)}</td>
                      <td>{pctCell(step.down)}</td>
                      <td>{pctCell(step.crush)}</td>
                      <td>{num(step.material, locale)}</td>
                      <td>{costCell(step.guard)}</td>
                      <td>{costCell(step.ease)}</td>
                      <td>{costCell(step.restore)}</td>
                      <td>{ratio(step.refund, locale)}</td>
                    </>
                  ) : (
                    <td colSpan={10}>
                      <small>{l(`최고 단계(+${maxGrade})`, `Max grade (+${maxGrade})`, `最高段階(+${maxGrade})`)}</small>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="field-note">
        {l(
          '확률은 각 단계에서 다음 단계로 강화를 시도할 때의 값이고, 강조한 줄은 보조 옵션 증폭이 오르는 단계입니다.',
          'Rates are for an attempt from that grade to the next. Highlighted rows are where the sub option boost rises.',
          '確率はその段階から次へ強化を試みるときの値です。強調した行はサブオプションの増幅が上がる段階です。',
        )}
      </p>
    </section>
  )
}

function RunePanel({ data, locale, l }: PanelProps) {
  const { tiers, craftCost } = data.rune
  const totals = runeRarityTotals(tiers)
  const unit = (stat: string) => (stat === 'moveSpeed' ? '' : '%')
  return (
    <section className="panel detail-section gear-panel" aria-labelledby="gear-rune-title">
      <h3 id="gear-rune-title">{l('슈가룬', 'Sugar Runes', 'シュガールーン')}</h3>
      <p className="field-note">
        {l(
          '슈가룬을 한 번 세공하면 등급·티어·효과가 한 조합으로 정해집니다. 이동속도 증가와 스킬가속 증가는 고정 수치로, 나머지 효과는 %로 붙습니다.',
          'Each Sugar Rune craft rolls one rarity, tier and effect together. Movement Speed and Skill Haste are flat values; every other effect is a percentage.',
          'シュガールーンを1回細工すると等級・ティア・効果が1つの組み合わせで決まります。移動速度増加とスキル加速増加は固定値、ほかの効果は%で付きます。',
        )}
      </p>
      <div className="table-scroll">
        <table className="detail-table gear-table">
          <thead>
            <tr>
              <th scope="col">{l('등급·티어', 'Rarity · tier', '等級・ティア')}</th>
              <th scope="col">{l('효과 하나당 확률', 'Chance per effect', '効果1つあたりの確率')}</th>
              {RUNE_STAT_ORDER.map((s) => (
                <th scope="col" key={s}>
                  {label(RUNE_STAT, s, locale)}
                </th>
              ))}
              <th scope="col">{label(RUNE_STAT, 'haste', locale)}</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={`${t.rarity}-${t.tier}`}>
                <th scope="row">
                  <span className={`rarity-badge rarity-${t.rarity.toLowerCase()}`}>{t.rarity}</span> {String(t.tier).padStart(2, '0')}
                </th>
                <td>{num(t.chance, locale, 6)}%</td>
                {RUNE_STAT_ORDER.map((s) => (
                  <td key={s}>
                    {num(t.values[s], locale, 3)}
                    {unit(s)}
                  </td>
                ))}
                <td>
                  {t.haste ? (
                    <>
                      {t.haste.value} <small>({num(t.haste.chance, locale, 6)}%)</small>
                    </>
                  ) : (
                    <small>-</small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="field-note">
        {l(
          '스킬가속 증가는 다른 효과와 확률이 따로 정해져 있고, SSR·SR의 01·02티어에서만 나옵니다.',
          'Skill Haste has its own chance and only appears on SSR and SR tiers 01 and 02.',
          'スキル加速増加はほかの効果と別に確率が決まっていて、SSR・SRの01・02ティアにだけ出ます。',
        )}
      </p>

      <div className="gear-rune-grid">
        <div>
          <h4>{l('등급별 확률', 'Chance by rarity', '等級別の確率')}</h4>
          <table className="detail-table gear-table">
            <thead>
              <tr>
                <th scope="col">{l('등급', 'Rarity', '等級')}</th>
                <th scope="col">{l('세공 1회', 'Per craft', '細工1回')}</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((t) => (
                <tr key={t.rarity}>
                  <th scope="row">
                    <span className={`rarity-badge rarity-${t.rarity.toLowerCase()}`}>{t.rarity}</span>
                  </th>
                  <td>{num(t.chance, locale, 2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h4>{l('세공 1회 비용', 'Cost per craft', '細工1回のコスト')}</h4>
          <table className="detail-table gear-table">
            <thead>
              <tr>
                <th scope="col">{l('잠근 슬롯', 'Locked slots', 'ロック数')}</th>
                <th scope="col">{l('룬결정', 'Rune Crystals', 'ルーン結晶')}</th>
              </tr>
            </thead>
            <tbody>
              {craftCost.map((cost, locks) => (
                <tr key={locks}>
                  <th scope="row">{locks}</th>
                  <td>{num(cost, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
