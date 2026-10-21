import { useState } from 'react'
import { pick, useI18n } from '../../../i18n'
import { label } from '../../../lib/cookieLabels'
import type { Locale } from '../../../types'
import { CATEGORY, CATEGORY_ORDER, CURRENCY, crystalRates, median, packageName, sortValues, valuePackage, type SortKey } from './packages'
import { systemsData, type CurrencyKey, type PackageCategory, type ValueAssumptions } from './systemsData'
import './systems.css'

const { currencies, assumptions: DEFAULTS, list } = systemsData.packages
const won = (value: number) => `₩${value.toLocaleString('en-US')}`
const num = (value: number, digits = 0) => value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })

const ASSUMPTION_LABEL: Record<keyof ValueAssumptions, Record<Locale, string>> = {
  cookieDraw: { ko: '쿠키 뽑기 1회', en: 'One Cookie draw', ja: 'クッキーガチャ1回' },
  petDraw: { ko: '펫 뽑기 1회', en: 'One Pet draw', ja: 'ペットガチャ1回' },
  flame: { ko: '용기의 불꽃 1개', en: 'One Flame of Bravery', ja: '勇気の炎1個' },
  luckyDough: { ko: '행운반죽 1개', en: 'One Lucky Dough', ja: 'ラッキー生地1個' },
  runeCrystal: { ko: '룬결정 1개', en: 'One Rune Crystal', ja: 'ルーン結晶1個' },
  stellarPoint: { ko: '스텔라 포인트 1점', en: 'One Stellar Point', ja: 'ステラポイント1' },
  ssrCookieDraws: { ko: 'SSR 쿠키 1장 = 쿠키 뽑기 몇 회', en: 'SSR Cookie = Cookie draws', ja: 'SSRクッキー1体 = ガチャ回数' },
  ssrPetDraws: { ko: 'SSR 펫 1마리 = 펫 뽑기 몇 회', en: 'SSR Pet = Pet draws', ja: 'SSRペット1体 = ガチャ回数' },
  tssrCookieFlames: { ko: 'TSSR 쿠키 1장 = 용기의 불꽃 몇 개', en: 'TSSR Cookie = Flames', ja: 'TSSRクッキー1体 = 炎の個数' },
}
const ASSUMPTION_KEYS = Object.keys(ASSUMPTION_LABEL) as (keyof ValueAssumptions)[]

export function PackageValuePage() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)

  const [assume, setAssume] = useState<ValueAssumptions>(DEFAULTS)
  const [counted, setCounted] = useState<Set<CurrencyKey>>(() => new Set(currencies))
  const [categories, setCategories] = useState<Set<PackageCategory>>(() => new Set())
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'per1000', desc: true })
  const [open, setOpen] = useState<string | null>(null)

  const rates = crystalRates(assume)
  const shown = list.filter((p) => !categories.size || categories.has(p.category))
  const values = sortValues(
    shown.map((p) => valuePackage(p, rates, counted, currencies)),
    sort.key,
    sort.desc,
  )
  const mid = median(values.map((v) => v.per1000))
  const changed = ASSUMPTION_KEYS.some((k) => assume[k] !== DEFAULTS[k])

  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  }
  const sortButton = (key: SortKey, text: string) => (
    <button
      type="button"
      className="systems-sort"
      aria-pressed={sort.key === key}
      onClick={() => setSort(sort.key === key ? { key, desc: !sort.desc } : { key, desc: true })}
    >
      {text}
      {sort.key === key ? (sort.desc ? ' ▼' : ' ▲') : ''}
    </button>
  )

  return (
    <div className="systems-page">
      <div className="section-intro">
        <div>
          <h2>{l('패키지 가치', 'Package value', 'パッケージ価値')}</h2>
          <p>
            {l(
              '상점 패키지의 구성품을 모두 크리스탈로 바꿔서, 1,000원당 크리스탈이 얼마나 들어 있는지 비교합니다.',
              'Every shop package converted to Crystals, compared by Crystals per ₩1,000.',
              'ショップのパッケージの中身をすべてクリスタルに換算し、1,000ウォンあたりのクリスタル量で比較します。',
            )}
          </p>
        </div>
      </div>

      <section className="panel">
        <h3>{l('환산 기준(가정)', 'Conversion (assumptions)', '換算基準(仮定)')}</h3>
        <p className="subtle">
          {l(
            '아래 값은 게임이 공개한 환율이 아니라 비교를 위해 정한 가정입니다. 숫자는 모두 크리스탈 기준이며, 내 기준에 맞게 고치면 표가 바로 다시 계산됩니다.',
            'These are assumptions for comparison, not published exchange rates. All values are in Crystals; edit them and the table updates.',
            '以下はゲームが公開したレートではなく、比較のための仮定です。値を変えると表がすぐ再計算されます。',
          )}
        </p>
        <div className="systems-fields">
          {ASSUMPTION_KEYS.map((key) => (
            <label key={key}>
              {label(ASSUMPTION_LABEL, key, locale)}
              <input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={assume[key]}
                onChange={(e) => {
                  const value = Number(e.target.value)
                  if (Number.isFinite(value) && value >= 0) setAssume({ ...assume, [key]: value })
                }}
              />
            </label>
          ))}
        </div>
        {changed && (
          <button type="button" className="text-button" style={{ marginTop: 10 }} onClick={() => setAssume(DEFAULTS)}>
            {l('기본 가정으로 되돌리기', 'Restore defaults', '既定値に戻す')}
          </button>
        )}
        <p className="field-note">
          {l(
            'SSR·TSSR 쿠키와 SSR 펫은 확정으로 얻는 데 드는 뽑기 횟수(또는 용기의 불꽃)로 값을 매깁니다. SR 쿠키는 따로 값을 매길 근거가 없어 쿠키 뽑기 1회로 쳤으므로 실제보다 낮게 잡힙니다.',
            'SSR/TSSR Cookies and SSR Pets are priced at the draws (or Flames) a guaranteed copy takes. SR Cookies count as one draw, which understates them.',
            'SSR・TSSRクッキーとSSRペットは確定入手に必要なガチャ回数(または勇気の炎)で評価します。SRクッキーはガチャ1回として数えるため、実際より低く出ます。',
          )}
        </p>
      </section>

      <section className="panel dex-filters">
        <div className="filter-row">
          <span className="filter-label">{l('셀 재화', 'Count', '数える')}</span>
          <div className="filter-chips">
            {currencies.map((key) => (
              <button key={key} type="button" aria-pressed={counted.has(key)} onClick={() => setCounted(toggle(counted, key))}>
                {label(CURRENCY, key, locale)}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-row">
          <span className="filter-label">{l('분류', 'Type', '分類')}</span>
          <div className="filter-chips">
            {CATEGORY_ORDER.filter((c) => list.some((p) => p.category === c)).map((c) => (
              <button key={c} type="button" aria-pressed={categories.has(c)} onClick={() => setCategories(toggle(categories, c))}>
                {label(CATEGORY, c, locale)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <p className="subtle">
          {l(
            `패키지 ${values.length}개, 1,000원당 크리스탈 중앙값은 ${num(mid)}개입니다. 패키지 이름을 누르면 구성품별 환산을 볼 수 있습니다.`,
            `${values.length} packages; median ${num(mid)} Crystals per ₩1,000. Tap a name for the breakdown.`,
            `パッケージ${values.length}個、1,000ウォンあたりクリスタルの中央値は${num(mid)}個です。名前をタップすると内訳を表示します。`,
          )}
        </p>
        <div className="table-scroll">
          <table className="detail-table systems-packages">
            <thead>
              <tr>
                <th>{l('패키지', 'Package', 'パッケージ')}</th>
                <th>{sortButton('price', l('가격', 'Price', '価格'))}</th>
                <th>{sortButton('total', l('크리스탈 환산', 'In Crystals', 'クリスタル換算'))}</th>
                <th>{sortButton('per1000', l('1,000원당', 'Per ₩1,000', '1,000ウォンあたり'))}</th>
              </tr>
            </thead>
            <tbody>
              {values.map((v) => {
                const isOpen = open === v.pack.id
                return (
                  <tr key={v.pack.id} className={isOpen ? 'is-open' : undefined}>
                    <td>
                      <button type="button" className="row-button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : v.pack.id)}>
                        {packageName(v.pack, locale)}
                      </button>{' '}
                      <span className="systems-badge">{label(CATEGORY, v.pack.category, locale)}</span>{' '}
                      {locale === 'ko' && !v.pack.nameKo && <span className="systems-badge is-off">국내 이름 미확인</span>}{' '}
                      {v.pack.recurring && <span className="systems-badge is-accent">{l('기간 지급 합계', 'Paid over time', '期間中の合計')}</span>}
                      {isOpen && (
                        <ul className="systems-lines">
                          {v.lines.map((line) => (
                            <li key={line.key} className={line.counted ? undefined : 'is-skipped'}>
                              {label(CURRENCY, line.key, locale)} {num(line.qty)} × {num(line.unit, line.unit % 1 ? 2 : 0)} = {num(line.worth)}
                            </li>
                          ))}
                          {v.pack.others?.map((item) => (
                            <li key={item.name} className="is-skipped">
                              {item.name} {num(item.qty)} · {l('환산 안 함', 'not valued', '換算なし')}
                            </li>
                          ))}
                          {v.pack.corrected && <li>{l('구성품은 국내 상점 목록 기준으로 고친 값입니다.', 'Contents corrected from the Korean shop list.', '中身は国内ショップ一覧で補正済みです。')}</li>}
                          {locale === 'ko' && <li>{v.pack.nameEn}</li>}
                        </ul>
                      )}
                    </td>
                    <td>{won(v.pack.priceKRW)}</td>
                    <td>{num(v.total)}</td>
                    <td className={v.per1000 >= mid ? 'good' : undefined}>{num(v.per1000)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="field-note">
          {l(
            '멤버십과 패스는 기간 동안 나눠 받는 양을 모두 더해서 비교하므로, 바로 받는 패키지보다 유리하게 보입니다. 쿠키 경험치·코인 자동 사냥 보상, 초코강, 시럽쇳물 같은 구성품은 크리스탈로 바꾸지 않습니다. 가격은 국내 상점 원화 기준입니다.',
            'Memberships and passes are totalled over their full duration, which flatters them. Auto-hunt rewards, Chocosteel, Metal Syrup and similar items are not valued. Prices are the Korean store in won.',
            'メンバーシップとパスは期間中の受取量を合計して比較するため、即時受取のパッケージより有利に見えます。自動狩り報酬などはクリスタルに換算しません。価格は国内ストアのウォン基準です。',
          )}
        </p>
        <p className="field-note">
          {l(
            '국내 이름과 일부 구성품은 국내 데이터 위키(cc.team-hobby.com) 상점 목록과 대조했습니다. 국내 이름을 찾지 못한 패키지는 영문 이름으로 보여 줍니다.',
            'Korean names and some contents were checked against the cc.team-hobby.com shop list; unmatched packages keep their English name.',
            '国内名と一部の中身はcc.team-hobby.comのショップ一覧と照合しました。',
          )}
        </p>
      </section>
    </div>
  )
}
