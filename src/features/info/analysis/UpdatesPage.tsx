import { useState } from 'react'
import { Link } from 'react-router'
import { pick, useI18n } from '../../../i18n'
import { ROUTES } from '../../../routes'
import type { Locale } from '../../../types'
import { Intro } from './common'
import { REWARD_ITEM, couponActive, formatKst, scheduleItems, splitSchedule, updates, type Phase, type ScheduleItem } from './updatesData'
import './analysis.css'

/** 데브시스터즈 공식 쿠폰 등록 페이지(한국어). 쿠폰은 계정당 1회만 등록된다고 이 페이지에 적혀 있다. */
const COUPON_PAGE = 'https://coupon.devplay.com/coupon/cc/ko'

export function UpdatesPage() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  // 화면을 연 순간을 기준으로 나눈다(열어 둔 채로 시간이 지나도 목록이 흔들리지 않게).
  const [now] = useState(() => Date.now())
  const groups = splitSchedule(scheduleItems(updates, now), now)
  const coupons = [...updates.coupons].sort((a, b) => Date.parse(b.expires) - Date.parse(a.expires))
  const live = coupons.filter((c) => couponActive(c, now))
  const expired = coupons.filter((c) => !couponActive(c, now))

  const phaseTitle: Record<Phase, string> = {
    ongoing: l('진행 중', 'Ongoing', '開催中'),
    upcoming: l('예정', 'Upcoming', '予定'),
    past: l('지난 일정', 'Past', '終了'),
  }

  return (
    <div className="analysis">
      <Intro title={l('업데이트 일정', 'Update schedule', 'アップデート日程')}>
        {l(
          '업데이트·시즌 일정과 쿠폰 코드를 한국 시간(KST) 기준으로 정리했습니다. 오늘을 기준으로 진행 중·예정·지난 일정을 나눕니다.',
          'Updates, season dates and coupon codes in Korea time (KST), split into ongoing, upcoming and past as of today.',
          'アップデート・シーズン日程とクーポンコードを韓国時間(KST)でまとめました。今日を基準に開催中・予定・終了に分けています。',
        )}
      </Intro>

      {(['ongoing', 'upcoming', 'past'] as Phase[]).map((phase) => (
        <section className="panel" key={phase}>
          <h3>{phaseTitle[phase]}</h3>
          {groups[phase].length ? (
            <ul className="analysis-schedule">
              {groups[phase].map((item) => (
                <ScheduleRow key={item.key} item={item} locale={locale} />
              ))}
            </ul>
          ) : (
            <p className="subtle">{l('해당하는 일정이 없습니다.', 'Nothing here.', '該当する日程はありません。')}</p>
          )}
        </section>
      ))}

      <section className="panel">
        <h3>{l('차원의 이면 시즌', 'Dimension seasons', '次元の裏側シーズン')}</h3>
        <p className="subtle">
          {l(
            `차원의 이면은 2주마다 시즌이 바뀌며 지금까지 ${updates.riftSeasons.length}개 시즌의 기간이 정해져 있습니다. 시즌별 단계 구성과 보스는 차원의 이면 탭에서 볼 수 있습니다.`,
            `Dimension seasons change every two weeks; ${updates.riftSeasons.length} seasons are scheduled so far. Stages and bosses per season are on the Dimension tab.`,
            `次元の裏側は2週間ごとにシーズンが変わり、現在${updates.riftSeasons.length}シーズン分の期間が決まっています。シーズンごとの構成とボスは次元の裏側タブで確認できます。`,
          )}{' '}
          <Link to={`${ROUTES.info}/dimension`}>{l('차원의 이면 탭으로', 'Open the Dimension tab', '次元の裏側タブへ')}</Link>
        </p>
      </section>

      <section className="panel">
        <h3>{l('쿠폰 코드', 'Coupon codes', 'クーポンコード')}</h3>
        <p className="subtle">
          {l(
            '쿠폰은 게임 안이 아니라 공식 쿠폰 등록 페이지에서 입력하고 코드 하나는 계정마다 한 번만 쓸 수 있습니다. 입력한 뒤 게임을 다시 실행해야 보상이 들어옵니다.',
            'Codes are redeemed on the official coupon web page, not in game, once per account. Restart the game afterwards to receive the reward.',
            'クーポンはゲーム内ではなく公式クーポン登録ページで入力し、1つのコードはアカウントごとに1回だけ使えます。入力後にゲームを再起動すると報酬が届きます。',
          )}{' '}
          <a href={COUPON_PAGE} target="_blank" rel="noreferrer">
            {l('공식 쿠폰 등록 페이지', 'Official coupon page', '公式クーポン登録ページ')}
          </a>
        </p>
        {live.length === 0 && <p className="field-note">{l('지금 쓸 수 있는 쿠폰은 없습니다.', 'No codes are live right now.', '現在使えるクーポンはありません。')}</p>}
        <ul className="analysis-coupons">
          {[...live, ...expired].map((c) => {
            const active = couponActive(c, now)
            return (
              <li key={c.code} className={active ? undefined : 'analysis-expired'}>
                <div className="analysis-coupon-head">
                  <code>{c.code}</code>
                  <span className={active ? 'analysis-live' : 'analysis-dead'}>{active ? l('사용 가능', 'Live', '使用可') : l('만료', 'Expired', '期限切れ')}</span>
                </div>
                <p className="subtle">
                  {l(`${formatKst(c.expires)}(KST)까지`, `Until ${formatKst(c.expires)} KST`, `${formatKst(c.expires)}(KST)まで`)}
                </p>
                <ul className="analysis-rewards">
                  {c.rewards.map((r) => (
                    <li key={r.item}>
                      {REWARD_ITEM[r.item]?.[locale] ?? r.item} ×{r.qty.toLocaleString(locale)}
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function ScheduleRow({ item, locale }: { item: ScheduleItem; locale: Locale }) {
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  return (
    <li>
      <p className="analysis-when">
        {formatKst(item.start)}
        {item.end ? ` ~ ${formatKst(item.end)}` : ''} {l('(KST)', 'KST', '(KST)')}
      </p>
      <p className="analysis-what">{item.name(locale)}</p>
      <p className="subtle">{item.summary(locale)}</p>
    </li>
  )
}
