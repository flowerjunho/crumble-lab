import { useEffect } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { cookieDbQuery, petDbQuery } from '../../api/queries'
import { pick, useI18n } from '../../i18n'
import { asset } from '../../lib/asset'
import { RARITY_ORDER, label } from '../../lib/cookieLabels'
import { localizedText } from '../../lib/localize'
import { PET_MODE, isTargetedPet, petAffectsCookie, petTargetLabel, petTierText } from '../../lib/petLabels'
import { ROUTES } from '../../routes'
import type { PetEntry } from '../../types'

/** 목록과 같은 순서(등급 높은 순)로 이전·다음 펫을 고른다. */
const ordered = (pets: PetEntry[]) => [...pets].sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity))

export function PetDetailPage() {
  const { slug } = useParams()
  const { state } = useLocation() as { state: { from?: string } | null }
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const { data, isPending } = useQuery(petDbQuery)
  const { data: cookieDb } = useQuery(cookieDbQuery)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [slug])

  const pets = ordered(data?.pets ?? [])
  const index = pets.findIndex((p) => p.slug === slug)
  const pet = pets[index]
  const prev = index > 0 ? pets[index - 1] : undefined
  const next = index >= 0 ? pets[index + 1] : undefined
  const backTo = `${ROUTES.pets}${state?.from ? `?${state.from}` : ''}`

  if (isPending) return <p className="result-placeholder">{l('펫 정보를 불러오고 있습니다.', 'Loading…', '読み込み中…')}</p>
  if (!pet)
    return (
      <div className="no-results">
        <p>{l('해당 펫을 찾지 못했습니다.', 'Pet not found.', 'ペットが見つかりません。')}</p>
        <Link className="text-button" to={ROUTES.pets}>
          {l('펫 도감으로', 'Back to the index', '図鑑へ戻る')}
        </Link>
      </div>
    )

  const name = localizedText(pet.name, locale)
  const groupMates = pets.filter((p) => p.group === pet.group && p.slug !== pet.slug)
  const targeted = isTargetedPet(pet)
  const affected = targeted ? (cookieDb?.cookies ?? []).filter((cookie) => petAffectsCookie(pet, cookie)) : []

  return (
    <article className="cookie-detail pet-detail">
      <Link className="text-button back-link" to={backTo}>
        ← {l('펫 도감', 'Pet index', 'ペット図鑑')}
      </Link>

      <header className="panel detail-hero">
        <img src={asset(pet.image)} alt="" width="96" height="96" />
        <div>
          <h2>{name}</h2>
          <p className="detail-tags">
            <span className={`rarity-badge rarity-${pet.rarity.toLowerCase()}`}>{pet.rarity}</span>
            <span>{petTargetLabel(pet, locale)}</span>
            {pet.modes.map((mode) => (
              <span key={mode} className="mode-badge">
                {l(`${label(PET_MODE, mode, locale)} 전용`, `${label(PET_MODE, mode, locale)} only`, `${label(PET_MODE, mode, locale)}専用`)}
              </span>
            ))}
          </p>
          {locale === 'ko' && pet.flavor && <p className="pet-flavor">{pet.flavor}</p>}
        </div>
      </header>

      <section className="panel detail-section" aria-labelledby="passive-title">
        <h3 id="passive-title">{l('배틀 패시브', 'Battle passive', 'バトルパッシブ')}</h3>
        <ol className="pet-tiers">
          {pet.tiers.map((tier, i) => (
            <li key={i}>
              <span className="pet-star" aria-label={l(`별 ${i + 1}개`, `${i + 1} stars`, `星${i + 1}`)}>
                ★{i + 1}
              </span>
              <span>{petTierText(pet, tier, locale)}</span>
            </li>
          ))}
        </ol>
        <p className="field-note">
          {l(
            '펫은 레벨 없이 별 등급으로만 성장하며, 편성하면 전투 내내 효과가 적용됩니다.',
            'Pets grow by stars only. A Pet in the lineup applies its effect for the whole fight.',
            'ペットはレベルがなく星だけで成長し、編成すると戦闘中ずっと効果が適用されます。',
          )}
        </p>
      </section>

      <section className="panel detail-section" aria-labelledby="stack-title">
        <h3 id="stack-title">{l('효과 중첩', 'Stacking', '効果の重複')}</h3>
        {groupMates.length ? (
          <>
            <p>
              {l(
                '아래 펫과 같은 효과 묶음입니다. 함께 편성하면 쿠키마다 받을 수 있는 효과 중 가장 강한 하나만 적용됩니다.',
                'Shares an effect group with the Pets below. Fielded together, each Cookie gets only the strongest effect it qualifies for.',
                '下のペットと同じ効果グループです。一緒に編成すると、クッキーごとに受けられる効果のうち最も強い1つだけが適用されます。',
              )}
            </p>
            <ul className="pet-mates">
              {groupMates.map((mate) => (
                <li key={mate.slug}>
                  <Link to={`${ROUTES.pets}/${mate.slug}`} state={state}>
                    <img src={asset(mate.image)} alt="" width="36" height="36" loading="lazy" />
                    <span>{localizedText(mate.name, locale)}</span>
                    <span className={`rarity-badge rarity-${mate.rarity.toLowerCase()}`}>{mate.rarity}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>{l('같은 효과 묶음의 다른 펫이 없어서 어떤 펫과 함께 편성해도 효과가 더해집니다.', 'No other Pet shares its effect group, so it adds to any other Pet.', '同じ効果グループの他のペットがいないため、どのペットと編成しても効果が加算されます。')}</p>
        )}
      </section>

      <section className="panel detail-section" aria-labelledby="cookies-title">
        <h3 id="cookies-title">{l('효과를 받는 쿠키', 'Cookies it affects', '効果を受けるクッキー')}</h3>
        {targeted ? (
          affected.length ? (
            <>
              <p className="subtle">{l(`${petTargetLabel(pet, locale)} ${affected.length}종`, `${affected.length} Cookies`, `${affected.length}種`)}</p>
              <ul className="pet-cookies">
                {affected.map((cookie) => (
                  <li key={cookie.slug}>
                    <Link to={`${ROUTES.cookies}/${cookie.slug}`}>
                      <img src={asset(cookie.image)} alt="" width="40" height="44" loading="lazy" />
                      <span>{localizedText(cookie.name, locale)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="subtle">{l('쿠키 정보를 불러오고 있습니다.', 'Loading…', '読み込み中…')}</p>
          )
        ) : (
          <p>{l('아군 전체에 적용되어 어떤 쿠키를 편성해도 효과를 받습니다.', 'Applies to every ally, whatever the lineup.', '味方全体に適用され、どのクッキーを編成しても効果を受けます。')}</p>
        )}
      </section>

      <nav className="detail-pager" aria-label={l('다른 펫', 'Other Pets', '他のペット')}>
        {prev ? (
          <Link to={`${ROUTES.pets}/${prev.slug}`} state={state}>
            ← {localizedText(prev.name, locale)}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={`${ROUTES.pets}/${next.slug}`} state={state}>
            {localizedText(next.name, locale)} →
          </Link>
        )}
      </nav>
    </article>
  )
}
