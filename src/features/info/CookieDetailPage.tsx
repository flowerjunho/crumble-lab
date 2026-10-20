import { useEffect } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { cookieDbQuery } from '../../api/queries'
import { pick, useI18n } from '../../i18n'
import { asset } from '../../lib/asset'
import { ELEMENT, ROLE, SYNERGY, TARGETING, describeEffect, label, pct } from '../../lib/cookieLabels'
import { localizedText } from '../../lib/localize'
import { ROUTES } from '../../routes'
import type { CookieEntry, CookieSkillPart, Locale } from '../../types'

const fmt = (value: number, locale: Locale, digits = 2) => value.toLocaleString(locale, { maximumFractionDigits: digits })
/** [최소, 최대]가 같으면 하나만, 다르면 범위로 보여 준다. */
const range = ([min, max]: [number, number], show: (v: number) => string) => (min === max ? show(min) : `${show(min)} ~ ${show(max)}`)

/** 스킬 발동 조건. 자신에게 변신 효과가 있는 쿠키는 '특수 상태'를 변신으로 풀어 쓴다. */
function GateNote({ part, locale, transforms }: { part: CookieSkillPart; locale: Locale; transforms: boolean }) {
  if (!part.gate) return null
  const inState = part.gate.operator === 'Equal'
  const text =
    part.gate.kind === 'charge'
      ? pick(locale, `${part.gate.value}번째 발동마다`, `every ${part.gate.value}th trigger`, `${part.gate.value}回目の発動ごと`)
      : transforms
        ? inState
          ? pick(locale, '변신 중일 때만', 'only while transformed', '変身中のみ')
          : pick(locale, '변신 전', 'before transforming', '変身前')
        : inState
          ? pick(locale, '특수 상태일 때만', 'only in its special state', '特殊状態のときのみ')
          : pick(locale, '특수 상태가 아닐 때', 'outside its special state', '特殊状態でないとき')
  return <span className="skill-gate">{text}</span>
}

function SkillSection({ cookie, locale }: { cookie: CookieEntry; locale: Locale }) {
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const { skill } = cookie
  const atkPct = (v: number) => l(`공격력의 ${pct(v)}`, `${pct(v)} of ATK`, `攻撃力の${pct(v)}`)
  const transforms = cookie.effects.some((e) => e.kind === 'transform' && e.target === 'self')
  return (
    <section className="panel detail-section" aria-labelledby="skill-title">
      <h3 id="skill-title">
        {l('스킬', 'Skill', 'スキル')}
        {/* 국내 스킬 이름. 다른 언어에서는 영어 이름을 쓴다. */}
        {(locale === 'ko' ? skill.nameKo : skill.nameEn) && <span className="skill-name">{locale === 'ko' ? skill.nameKo : skill.nameEn}</span>}
      </h3>
      <dl className="detail-stats">
        <div>
          <dt>{l('스킬 주기', 'Skill cycle', 'スキル周期')}</dt>
          <dd>{l(`${skill.cycleSeconds}초`, `${skill.cycleSeconds}s`, `${skill.cycleSeconds}秒`)}</dd>
        </div>
        <div>
          <dt>{l('주기당 피해 계수', 'Damage per cycle', '周期あたりのダメージ係数')}</dt>
          <dd>{skill.coefPerCycle[1] > 0 ? range(skill.coefPerCycle, atkPct) : l('피해 없음', 'No damage', 'ダメージなし')}</dd>
        </div>
        <div>
          <dt>{l('초당 피해 계수', 'Damage per second', '秒あたりのダメージ係数')}</dt>
          <dd>{skill.atkPerSecond[1] > 0 ? range(skill.atkPerSecond, atkPct) : '—'}</dd>
        </div>
        <div>
          <dt>{l('시작 쿨타임 감소', 'Opening cooldown cut', '開始クールタイム短縮')}</dt>
          <dd>{cookie.combat.startCooldownReduction > 0 ? pct(cookie.combat.startCooldownReduction) : '—'}</dd>
        </div>
      </dl>

      {skill.parts.map((part, index) => (
        <div className="skill-part" key={index}>
          <div className="skill-part-head">
            <b>{l(`발동 ${index + 1}`, `Cast ${index + 1}`, `発動${index + 1}`)}</b>
            <span>{l(`쿨타임 ${part.effectiveCooldown}초`, `${part.effectiveCooldown}s cooldown`, `クールタイム${part.effectiveCooldown}秒`)}</span>
            <GateNote part={part} locale={locale} transforms={transforms} />
            {part.coefPerCycle[1] > 0 && <span className="subtle">{l('합계', 'Total', '合計')} {range(part.coefPerCycle, atkPct)}</span>}
          </div>
          {part.hits.length > 0 ? (
            <div className="table-scroll">
              <table className="detail-table">
                <thead>
                  <tr>
                    <th scope="col">{l('타격', 'Hit', 'ヒット')}</th>
                    <th scope="col">{l('1타 계수', 'Per hit', '1ヒット係数')}</th>
                    <th scope="col">{l('타수', 'Hits', 'ヒット数')}</th>
                    <th scope="col">{l('적용 횟수', 'Applications', '適用回数')}</th>
                    <th scope="col">{l('합계 계수', 'Total', '合計係数')}</th>
                    <th scope="col">{l('범위', 'Radius', '範囲')}</th>
                  </tr>
                </thead>
                <tbody>
                  {part.hits.map((hit, i) => (
                    <tr key={i}>
                      <th scope="row">{i + 1}</th>
                      <td>{pct(hit.perHit)}</td>
                      <td>{hit.hits}</td>
                      <td>{range(hit.applications, String)}</td>
                      <td>{range(hit.coef, pct)}</td>
                      <td>
                        {hit.radius ?? '—'}
                        {hit.unlimitedTargets && <small> {l('대상 제한 없음', 'unlimited', '対象無制限')}</small>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="subtle">{l('직접 피해를 주지 않는 발동입니다.', 'This cast deals no direct damage.', '直接ダメージを与えない発動です。')}</p>
          )}
        </div>
      ))}
      <p className="field-note">
        {l(
          '계수는 공격력 대비 배율입니다(100% = 공격력만큼). 범위로 표시된 값은 맞는 적 수나 조건에 따라 달라지는 최소~최대입니다.',
          'Coefficients are multiples of ATK (100% = ATK). Ranges depend on how many enemies are hit or on conditions.',
          '係数は攻撃力に対する倍率です(100% = 攻撃力分)。範囲表示は当たる敵の数や条件による最小〜最大です。',
        )}
      </p>
    </section>
  )
}

export function CookieDetailPage() {
  const { slug } = useParams()
  const { state } = useLocation() as { state: { from?: string } | null }
  const { locale, t } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const { data, isPending } = useQuery(cookieDbQuery)
  const index = data?.cookies.findIndex((c) => c.slug === slug) ?? -1
  const cookie = index >= 0 ? data!.cookies[index] : undefined
  const prev = index > 0 ? data!.cookies[index - 1] : undefined
  const next = data && index >= 0 && index < data.cookies.length - 1 ? data.cookies[index + 1] : undefined
  const backTo = `${ROUTES.cookies}${state?.from ? `?${state.from}` : ''}`

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [slug])

  if (isPending) return <p className="result-placeholder">{l('쿠키 정보를 불러오고 있습니다.', 'Loading…', '読み込み中…')}</p>
  if (!cookie)
    return (
      <div className="no-results">
        <p>{l('해당 쿠키를 찾지 못했습니다.', 'Cookie not found.', 'クッキーが見つかりません。')}</p>
        <Link className="text-button" to={ROUTES.cookies}>
          {l('쿠키 도감으로', 'Back to the index', '図鑑へ戻る')}
        </Link>
      </div>
    )

  const name = localizedText(cookie.name, locale)
  const synergyLink = (key: string, side: 'gives' | 'receives') => `${ROUTES.cookies}?synergy=${key}&side=${side}`

  return (
    <article className="cookie-detail">
      <Link className="text-button back-link" to={backTo}>
        ← {l('쿠키 도감', 'Cookie index', 'クッキー図鑑')}
      </Link>

      <header className={`panel detail-hero element-${cookie.element}`}>
        <img src={asset(cookie.image)} alt="" width="96" height="106" />
        <div>
          <h2>{name}</h2>
          <p className="detail-tags">
            <span className={`rarity-badge rarity-${cookie.rarity.toLowerCase()}`}>{cookie.rarity}</span>
            <span>{label(ROLE, cookie.role, locale)}</span>
            <span>{label(ELEMENT, cookie.element, locale)}</span>
          </p>
        </div>
      </header>

      <div className="detail-grid">
        <section className="panel detail-section" aria-labelledby="stats-title">
          <h3 id="stats-title">{l('기본 능력치', 'Base stats', '基本能力値')}</h3>
          <dl className="detail-stats">
            {cookie.stats.power !== null && (
              <div>
                <dt>{l('전투력', 'Power', '戦闘力')}</dt>
                <dd>{fmt(cookie.stats.power, locale)}</dd>
              </div>
            )}
            <div>
              <dt>{l('공격력', 'ATK', '攻撃力')}</dt>
              <dd>{fmt(cookie.stats.atk, locale)}</dd>
            </div>
            <div>
              <dt>{l('방어력', 'DEF', '防御力')}</dt>
              <dd>{fmt(cookie.stats.def, locale)}</dd>
            </div>
            <div>
              <dt>{l('체력', 'HP', 'HP')}</dt>
              <dd>{fmt(cookie.stats.hp, locale)}</dd>
            </div>
          </dl>
          <p className="field-note">{l('성장 전 기본 수치입니다.', 'Base values before growth.', '育成前の基本値です。')}</p>
        </section>

        <section className="panel detail-section" aria-labelledby="combat-title">
          <h3 id="combat-title">{l('전투 정보', 'Combat', '戦闘情報')}</h3>
          <dl className="detail-stats">
            <div>
              <dt>{l('공격 대상', 'Targets', '攻撃対象')}</dt>
              <dd className="text-value">{label(TARGETING, cookie.combat.targeting, locale)}</dd>
            </div>
            <div>
              <dt>{l('사거리', 'Range', '射程')}</dt>
              <dd>{cookie.combat.range}</dd>
            </div>
            <div>
              <dt>{l('이동속도', 'Move speed', '移動速度')}</dt>
              <dd>{cookie.combat.moveSpeed}</dd>
            </div>
            <div>
              <dt>{l('밀어내기 저항', 'Push RES', '押し出し耐性')}</dt>
              <dd>{pct(cookie.combat.knockbackResistance)}</dd>
            </div>
            <div>
              <dt>{l('띄우기 저항', 'Lift RES', '浮かし耐性')}</dt>
              <dd>{pct(cookie.combat.airborneResistance)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="panel detail-section" aria-labelledby="synergy-title">
        <h3 id="synergy-title">{l('시너지', 'Synergy', 'シナジー')}</h3>
        <div className="synergy-rows">
          {(['gives', 'receives'] as const).map((side) => (
            <div key={side} className="synergy-row">
              <span className="filter-label">{side === 'gives' ? l('주는 시너지', 'Gives', '付与') : l('받는 시너지', 'Receives', '受ける')}</span>
              <div className="filter-chips">
                {cookie.synergy[side].length ? (
                  cookie.synergy[side].map((key) => (
                    <Link key={key} className={`synergy-chip ${side}`} to={synergyLink(key, side)}>
                      {label(SYNERGY, key, locale)}
                    </Link>
                  ))
                ) : (
                  <span className="subtle">{l('없음', 'None', 'なし')}</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="field-note">{l('시너지를 누르면 같은 시너지를 주거나 받는 쿠키를 모아 봅니다.', 'Tap a Synergy to list Cookies that share it.', 'シナジーをタップすると同じシナジーのクッキーを一覧表示します。')}</p>
      </section>

      <SkillSection cookie={cookie} locale={locale} />

      <section className="panel detail-section" aria-labelledby="effects-title">
        <h3 id="effects-title">{l('스킬 효과', 'Skill effects', 'スキル効果')}</h3>
        {cookie.effects.length ? (
          <ul className="effect-list">
            {cookie.effects.map((effect, i) => {
              const view = describeEffect(effect, locale)
              return (
                <li key={i} className={`effect effect-${view.category.toLowerCase()}`}>
                  <span className="effect-kind">
                    {view.category === 'Buff' ? l('버프', 'Buff', 'バフ') : view.category === 'Debuff' ? l('디버프', 'Debuff', 'デバフ') : l('행동 제어', 'Control', '行動制御')}
                  </span>
                  <span className="effect-target">{view.target}</span>
                  <b className="effect-what">{view.what}</b>
                  {view.details.length > 0 && <span className="effect-details">{view.details.join(' · ')}</span>}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="subtle">{l('버프·디버프 없이 피해만 주는 스킬입니다.', 'Damage only, no buffs or debuffs.', 'バフ・デバフなしでダメージのみのスキルです。')}</p>
        )}
      </section>

      <section className="panel detail-section" aria-labelledby="runes-title">
        <h3 id="runes-title">{l('추천 슈가룬', 'Recommended Sugar Runes', 'おすすめシュガールーン')}</h3>
        {cookie.runes.length ? (
          <ol className="rune-list">
            {cookie.runes.map((rune, i) => (
              <li key={`${rune.key}-${i}`} className={rune.bold ? 'first' : undefined}>
                <span className="option-num">{i + 1}</span>
                {rune.bold ? <strong>{t(rune.label)}</strong> : <span>{t(rune.label)}</span>}
                {rune.badge && <span className={`priority-badge ${rune.badge}`}>{rune.badge === 'core' ? l('핵심', 'Core', 'コア') : l('토벌', 'Raid', '討伐')}</span>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="subtle">{l('추천 준비 중', 'Coming soon', '準備中')}</p>
        )}
        <Link className="text-button" to={ROUTES.recommend}>
          {l('추천 슈가룬 전체 보기', 'All recommendations', 'おすすめ一覧')}
        </Link>
      </section>

      <nav className="detail-pager" aria-label={l('다른 쿠키', 'Other Cookies', '他のクッキー')}>
        {prev ? (
          <Link to={`${ROUTES.cookies}/${prev.slug}`} state={state}>
            ← {localizedText(prev.name, locale)}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={`${ROUTES.cookies}/${next.slug}`} state={state}>
            {localizedText(next.name, locale)} →
          </Link>
        )}
      </nav>
    </article>
  )
}
