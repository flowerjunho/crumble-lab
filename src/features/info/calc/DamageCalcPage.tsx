import { useEffect, useState } from 'react'
import { SYNERGY, label as cookieLabel } from '../../../lib/cookieLabels'
import { readStorage, writeStorage } from '../../../lib/storage'
import { localizedText } from '../../../lib/localize'
import type { PetEntry, SynergyKey } from '../../../types'
import { cookieStats } from '../growth/growth'
import { BOUND_LABEL, FACTOR_LABEL, FACTOR_NOTE, PET_STATUS_LABEL, label } from './calcLabels'
import {
  CalcStatus,
  CookieSelect,
  GrowthFields,
  LoadoutFields,
  ModeToggle,
  PetSlots,
  SynergyFields,
  TargetFields,
  fmt,
  fmtTimes,
  synergyAmount,
  useCalcData,
  useL,
  sortCookies,
  type CalcData,
} from './calcUi'
import { EMPTY_LOADOUT, PET_SLOTS, TRAINING_DUMMY, cookieDps, type Bound, type Loadout, type PetPick, type SynergySteps, type TargetSpec } from './damage'
import './calc.css'

const STORAGE_KEY = 'crumble.calc.damage'

/** 화면 입력값. 펫은 slug로 저장해 두었다가 펫 도감에서 다시 찾는다. */
interface DamageForm {
  eid: string | null
  level: number
  grade: number
  loadout: Loadout
  pets: ({ slug: string; star: number } | null)[]
  mode: string | null
  synergy: SynergySteps
  target: TargetSpec
  bound: Bound
}

const DEFAULT_FORM: DamageForm = {
  eid: null,
  level: 120,
  grade: 10,
  loadout: EMPTY_LOADOUT,
  pets: Array.from({ length: PET_SLOTS }, () => null),
  mode: null,
  synergy: {},
  target: { ...TRAINING_DUMMY, isBoss: true },
  bound: 'min',
}

/** 저장된 입력값을 읽는다. 모양이 어긋나면 기본값으로 채운다. */
function readForm(): DamageForm {
  try {
    const saved = JSON.parse(readStorage(STORAGE_KEY) ?? 'null') as Partial<DamageForm> | null
    if (!saved || typeof saved !== 'object') return DEFAULT_FORM
    return {
      ...DEFAULT_FORM,
      ...saved,
      loadout: { ...EMPTY_LOADOUT, ...saved.loadout },
      target: { ...DEFAULT_FORM.target, ...saved.target },
      pets: Array.from({ length: PET_SLOTS }, (_, i) => saved.pets?.[i] ?? null),
    }
  } catch {
    return DEFAULT_FORM
  }
}

const toPicks = (pets: PetEntry[], saved: DamageForm['pets']): (PetPick | null)[] =>
  saved.map((item) => {
    const pet = item && pets.find((p) => p.slug === item.slug)
    return pet ? { pet, star: item.star } : null
  })

export function DamageCalcPage() {
  const state = useCalcData()
  const { l } = useL()
  return (
    <div className="calc">
      <div className="section-intro">
        <div>
          <h2>{l('피해 계산기', 'Damage calculator', 'ダメージ計算機')}</h2>
          <p>{l('쿠키 한 명이 스킬 주기마다 대상에게 주는 피해와 초당 피해(DPS)를 계산합니다.', "One Cookie's damage per skill cycle and DPS against a target.", 'クッキー1体がスキル周期ごとに対象へ与えるダメージと秒間ダメージ(DPS)を計算します。')}</p>
        </div>
      </div>
      <CalcStatus state={state} />
      {state.data && <DamageCalc data={state.data} />}
    </div>
  )
}

function DamageCalc({ data }: { data: CalcData }) {
  const { l, locale } = useL()
  const [form, setForm] = useState<DamageForm>(readForm)
  useEffect(() => writeStorage(STORAGE_KEY, JSON.stringify(form)), [form])
  const set = <K extends keyof DamageForm>(key: K, value: DamageForm[K]) => setForm((f) => ({ ...f, [key]: value }))

  const cookie = data.cookies.find((c) => c.eid === form.eid) ?? sortCookies(data.cookies, locale)[0]!
  const picks = toPicks(data.pets, form.pets)
  const stats = cookieStats(data.growth, cookie, form.level, form.grade)
  // 계산이 가벼워서 입력이 바뀔 때마다 다시 계산한다.
  const result = cookieDps({
    cookie,
    stats,
    loadout: form.loadout,
    pets: picks.filter((p): p is PetPick => p !== null),
    mode: form.mode,
    synergy: form.synergy,
    target: form.target,
    bound: form.bound,
  })
  const partCount = new Set(result.breakdown.map((row) => row.part)).size

  return (
    <>
      <section className="panel" aria-labelledby="calc-cookie-title">
        <h3 id="calc-cookie-title">{l('쿠키', 'Cookie', 'クッキー')}</h3>
        <div className="calc-pick">
          <CookieSelect cookies={data.cookies} value={cookie.eid} onChange={(eid) => set('eid', eid)} ariaLabel={l('쿠키 고르기', 'Choose a Cookie', 'クッキーを選ぶ')} />
        </div>
        <GrowthFields growth={data.growth} level={form.level} grade={form.grade} onLevel={(v) => set('level', v)} onGrade={(v) => set('grade', v)} />
        <div className="filter-row">
          <span className="filter-label">{l('타수 기준', 'Hits counted', '命中数の基準')}</span>
          <div className="filter-chips">
            {(['min', 'max'] as const).map((b) => (
              <button type="button" key={b} aria-pressed={form.bound === b} onClick={() => set('bound', b)}>
                {label(BOUND_LABEL, b, locale)}
              </button>
            ))}
          </div>
        </div>
        <p className="field-note">
          {l(
            '부채꼴로 퍼지는 투사체나 튕기는 공격은 한 대상이 전부 맞는다고 보기 어렵습니다. "한 대상만 맞을 때"는 그중 하나만, "모두 같은 대상에 맞을 때"는 전부 맞는다고 보고 계산합니다.',
            'Spread projectiles and bouncing attacks rarely all land on one target. "Single target" counts one of them, "Everything lands" counts them all.',
            '扇状に広がる投射物や跳ねる攻撃が1体にすべて当たるとは限りません。「単体のみ」はそのうち1つだけ、「すべて命中」は全部当たるとして計算します。',
          )}
        </p>
      </section>

      <section className="panel" aria-labelledby="calc-rune-title">
        <h3 id="calc-rune-title">{l('슈가룬·추가 능력치', 'Sugar Runes and extra stats', 'シュガールーン・追加ステータス')}</h3>
        <p className="subtle">{l('장착한 슈가룬 등으로 더해지는 값을 입력합니다. 레벨·별 능력치에 더해서 계산합니다.', 'Enter what your Sugar Runes and other sources add on top of level and star stats.', 'シュガールーンなどで加算される値を入力します。レベル・星のステータスに加えて計算します。')}</p>
        <LoadoutFields value={form.loadout} onChange={(v) => set('loadout', v)} />
      </section>

      <section className="panel" aria-labelledby="calc-pet-title">
        <h3 id="calc-pet-title">{l('펫', 'Pets', 'ペット')}</h3>
        <p className="subtle">
          {l(
            '펫은 세 마리까지 고를 수 있습니다. 같은 종류의 효과를 주는 펫끼리는 겹치지 않고 가장 강한 하나만 적용됩니다.',
            'Pick up to three Pets. Pets with the same kind of effect do not stack: only the strongest applies.',
            'ペットは3体まで選べます。同じ系統の効果は重ならず、最も強い1体だけが適用されます。',
          )}
        </p>
        <PetSlots pets={data.pets} value={picks} onChange={(next) => set('pets', next.map((p) => (p ? { slug: p.pet.slug, star: p.star } : null)))} />
        <ModeToggle mode={form.mode} onChange={(m) => set('mode', m)} />
        {result.pets.list.length > 0 && (
          <ul className="calc-pet-status">
            {result.pets.list.map((p, i) => (
              <li key={i} className={p.status === 'active' ? 'is-active' : undefined}>
                <strong>{`${localizedText(p.pet.name, locale)} ★${p.star}`}</strong>
                <span>{label(PET_STATUS_LABEL, p.status, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="calc-synergy-title">
        <h3 id="calc-synergy-title">{l('받는 시너지', 'Synergy received', '受けるシナジー')}</h3>
        <p className="subtle">
          {l(
            '아군에게 받는 시너지 값을 입력합니다(펫이 주는 시너지는 위의 펫에서 자동으로 더합니다). 다발·연타·지속·연쇄 시너지는 한 대상이 맞는 횟수를 늘립니다. 범위·탄속·관통 시너지는 한 대상이 받는 피해를 바꾸지 않습니다.',
            'Enter the Synergy allies give this Cookie (Pet Synergy is added automatically). Volley, Rapid Fire, Duration and Chain add hits on one target; Range, Projectile Speed and Pierce do not change single-target damage.',
            '味方から受けるシナジー値を入力します(ペットのシナジーは自動で加算)。多発・連打・持続・連鎖は1体への命中数を増やし、範囲・弾速・貫通は1体へのダメージを変えません。',
          )}
        </p>
        <SynergyFields cookie={cookie} value={form.synergy} onChange={(v) => set('synergy', v)} />
        {Object.keys(result.synergy).length > 0 && (
          <p className="field-note">
            {l('계산에 쓴 시너지', 'Synergy used', '計算に使ったシナジー')}
            {': '}
            {(Object.entries(result.synergy) as [SynergyKey, number][]).map(([key, steps]) => `${cookieLabel(SYNERGY, key, locale)} ${synergyAmount(key, steps)}`).join(', ')}
          </p>
        )}
      </section>

      <section className="panel" aria-labelledby="calc-target-title">
        <h3 id="calc-target-title">{l('대상', 'Target', '対象')}</h3>
        <TargetFields value={form.target} onChange={(v) => set('target', v)} />
        <p className="field-note">{l('회피를 0으로 두면 항상 적중하는 것으로 계산합니다.', 'Avoidance 0 means every hit lands.', '回避を0にすると常に命中するとして計算します。')}</p>
      </section>

      <section className="panel calc-result" aria-labelledby="calc-result-title">
        <h3 id="calc-result-title">{l('결과', 'Result', '結果')}</h3>
        <dl className="detail-stats">
          <div className="calc-headline">
            <dt>DPS</dt>
            <dd>{fmt(result.dps, locale, 0)}</dd>
          </div>
          <div>
            <dt>{l('주기당 피해', 'Damage per cycle', '周期あたりダメージ')}</dt>
            <dd>{fmt(result.perCycle, locale, 0)}</dd>
          </div>
          <div>
            <dt>{l('스킬 주기', 'Skill cycle', 'スキル周期')}</dt>
            <dd>{l(`${fmt(result.cycle, locale)}초`, `${fmt(result.cycle, locale)}s`, `${fmt(result.cycle, locale)}秒`)}</dd>
          </div>
          <div>
            <dt>{l('공격력', 'ATK', '攻撃力')}</dt>
            <dd>{fmt(result.attack, locale, 0)}</dd>
          </div>
          <div>
            <dt>{l('치명확률', 'CRIT Rate', '会心率')}</dt>
            <dd>{`${fmt(result.stats.critRate, locale)}%`}</dd>
          </div>
          <div>
            <dt>{l('치명피해', 'CRIT DMG', '会心ダメージ')}</dt>
            <dd>{`${fmt(result.stats.critDamage, locale)}%`}</dd>
          </div>
          <div>
            <dt>{l('스킬증폭', 'Skill AMP', 'スキル増幅')}</dt>
            <dd>{`${fmt(result.stats.skillAmp, locale)}%`}</dd>
          </div>
          <div>
            <dt>{l('주기당 계수', 'Coefficient per cycle', '周期あたり係数')}</dt>
            <dd>{fmt(result.coefPerCycle, locale, 3)}</dd>
          </div>
        </dl>
        {result.support && (
          <p className="field-note">{l('이 쿠키는 스킬로 피해를 주지 않아서 DPS가 0입니다.', 'This Cookie deals no skill damage, so its DPS is 0.', 'このクッキーはスキルでダメージを与えないためDPSは0です。')}</p>
        )}
        <p className="field-note">
          {l(
            `스킬 주기는 기본 ${fmt(result.baseCycle, locale)}초에 스킬가속 ${fmt(result.stats.haste, locale)}을 반영한 값입니다(주기 × 100 ÷ (100 + 스킬가속)).`,
            `Skill cycle: base ${fmt(result.baseCycle, locale)}s with Skill Haste ${fmt(result.stats.haste, locale)} (cycle × 100 ÷ (100 + haste)).`,
            `スキル周期は基本${fmt(result.baseCycle, locale)}秒にスキル加速${fmt(result.stats.haste, locale)}を反映した値です(周期 × 100 ÷ (100 + スキル加速))。`,
          )}
        </p>

        <h4 className="calc-subhead">{l('피해 배율', 'Damage multipliers', 'ダメージ倍率')}</h4>
        <div className="table-scroll">
          <table className="detail-table calc-factor-table">
            <thead>
              <tr>
                <th scope="col">{l('항목', 'Factor', '項目')}</th>
                <th scope="col">{l('배율', 'Multiplier', '倍率')}</th>
                <th scope="col">{l('계산 방법', 'How', '計算方法')}</th>
              </tr>
            </thead>
            <tbody>
              {result.factors
                .filter((f) => f.key !== 'power')
                .map((f) => (
                  <tr key={f.key}>
                    <th scope="row">{label(FACTOR_LABEL, f.key, locale)}</th>
                    <td>{fmtTimes(f.value, locale)}</td>
                    <td className="calc-note-cell">{label(FACTOR_NOTE, f.key, locale)}</td>
                  </tr>
                ))}
              <tr className="calc-total-row">
                <th scope="row">{l('모두 곱한 값', 'Product', 'すべての積')}</th>
                <td>{fmtTimes(result.product, locale)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        {result.critStacks > 1 && (
          <p className="field-note">
            {l(
              `치명확률이 100%를 넘어 한 대에 평균 ${fmt(result.critStacks, locale)}번 치명이 터지는 것으로 계산했습니다.`,
              `CRIT Rate is above 100%, so each hit averages ${fmt(result.critStacks, locale)} crits.`,
              `会心率が100%を超えているため、1回あたり平均${fmt(result.critStacks, locale)}回の会心として計算しました。`,
            )}
          </p>
        )}

        <h4 className="calc-subhead">{l('피해 항목별 내역', 'Hit-by-hit breakdown', 'ダメージ項目別の内訳')}</h4>
        {result.breakdown.length ? (
          <div className="table-scroll">
            <table className="detail-table">
              <thead>
                <tr>
                  <th scope="col">{l('항목', 'Hit', '項目')}</th>
                  <th scope="col">{l('한 대 계수', 'Coef per hit', '1回の係数')}</th>
                  <th scope="col">{l('시전당 타수', 'Hits per cast', '発動あたり命中数')}</th>
                  <th scope="col">{l('주기당 시전', 'Casts per cycle', '周期あたり発動')}</th>
                  <th scope="col">{l('주기당 계수', 'Coef per cycle', '周期あたり係数')}</th>
                  <th scope="col">{l('한 대 피해', 'Damage per hit', '1回のダメージ')}</th>
                  <th scope="col">{l('주기당 피해', 'Damage per cycle', '周期あたりダメージ')}</th>
                </tr>
              </thead>
              <tbody>
                {result.breakdown.map((row) => (
                  <tr key={`${row.part}-${row.hit}`}>
                    <th scope="row">
                      {partCount > 1 ? `${row.part + 1}-${row.hit + 1}` : `${row.hit + 1}`}
                      {row.dot && <small>{l(' 지속 피해 포함', ' incl. DoT', ' 継続ダメージ込み')}</small>}
                      {row.synergyFactor !== 1 && <small>{` ${l('시너지', 'Synergy', 'シナジー')} ${fmtTimes(row.synergyFactor, locale)}`}</small>}
                    </th>
                    <td>{fmt(row.perHit, locale, 3)}</td>
                    <td>{fmt(row.hitsPerCast, locale)}</td>
                    <td>{fmt(row.castsPerCycle, locale)}</td>
                    <td>{fmt(row.coefPerCycle, locale, 3)}</td>
                    <td>{fmt(row.damagePerHit, locale, 0)}</td>
                    <td>{fmt(row.damagePerCycle, locale, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="field-note">{l('피해를 주는 항목이 없습니다.', 'No damaging hits.', 'ダメージを与える項目がありません。')}</p>
        )}
        <p className="field-note">
          {l(
            '한 대 피해는 치명 기대값까지 넣은 값이고 주기당 피해에는 적중률까지 곱했습니다. 항목 번호는 "스킬 부분-피해 항목" 순서입니다. 주기당 시전은 기본 주기 동안 그 부분이 몇 번 발동하는지를 나타냅니다.',
            'Damage per hit includes expected crits; damage per cycle also includes hit chance. Hits are numbered "skill part-hit", and casts per cycle is how often that part fires during one base cycle.',
            '1回のダメージは会心の期待値込み、周期あたりダメージは命中確率まで掛けた値です。項目番号は「スキル部分-ダメージ項目」の順で、周期あたり発動は基本周期の間にその部分が何回発動するかです。',
          )}
        </p>
      </section>
    </>
  )
}
