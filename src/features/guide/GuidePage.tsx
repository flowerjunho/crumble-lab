import { Fragment, useState } from 'react'
import { Link } from 'react-router'
import { pick, useI18n } from '../../i18n'
import { DAMAGE_BANDS } from '../../lib/formulas'
import { localizedText } from '../../lib/localize'
import { ROUTES } from '../../routes'
import { GUIDE_GROUPS, type GuideNote } from './guideContent'

/** "**굵게**" 표시만 <b>로 바꾼다. 본문은 코드에 있는 고정 문자열이라 HTML로 해석하지 않는다. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.+?)\*\*/g).map((part, index) =>
        index % 2 === 1 ? <b key={index}>{part}</b> : <Fragment key={index}>{part}</Fragment>,
      )}
    </>
  )
}

function NoteItem({ note, open, onToggle }: { note: GuideNote; open: boolean; onToggle: () => void }) {
  const { locale } = useI18n()
  const bodyId = `guide-${note.id}`
  return (
    <div className={`guide-note ${open ? 'is-open' : ''}`}>
      <button type="button" className="guide-note-trigger" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span>{localizedText(note.title, locale)}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div id={bodyId} className="guide-note-body" hidden={!open}>
        <p className="guide-why">
          <RichText text={localizedText(note.why, locale)} />
        </p>
        <p className="guide-rule">
          <span className="guide-rule-label">{pick(locale, '세팅 기준', 'How to set up', 'セッティングの目安')}</span>
          <RichText text={localizedText(note.rule, locale)} />
        </p>
        {note.link && (
          <Link className="text-button guide-note-link" to={note.link.to}>
            {localizedText(note.link.label, locale)}
          </Link>
        )}
      </div>
    </div>
  )
}

const percent = (value: number) => `${Math.round(100 * value)}%`

export function GuidePage() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set())

  const allIds = GUIDE_GROUPS.flatMap((group) => group.notes.map((note) => note.id))
  const allOpen = openIds.size === allIds.length

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <section className="guide" aria-label={l('크럼블 가이드', 'Crumble guide', 'クランブルガイド')}>
      <div className="section-intro">
        <div>
          <h2>{l('알아두면 편한 전투 원리', 'Combat rules worth knowing', '知っておくと便利な戦闘の仕組み')}</h2>
          <p>
            {l(
              '옵션을 고를 때 헷갈리기 쉬운 계산 방식과 계산기가 쓰는 기준을 정리했습니다.',
              'How the game calculates the stats that are easy to misjudge, and the rules our calculators follow.',
              'オプション選びで迷いやすい計算方式と、計算機が使う基準をまとめました。',
            )}
          </p>
        </div>
        <button type="button" className="text-button" onClick={() => setOpenIds(allOpen ? new Set() : new Set(allIds))}>
          {allOpen ? l('모두 접기', 'Collapse all', 'すべて閉じる') : l('모두 펼치기', 'Expand all', 'すべて開く')}
        </button>
      </div>

      <nav className="guide-jump" aria-label={l('가이드 목차', 'Guide contents', 'ガイド目次')}>
        {GUIDE_GROUPS.map((group, index) => (
          <a key={group.id} href={`#guide-group-${group.id}`}>
            <span>{index + 1}</span>
            {localizedText(group.eyebrow, locale)}
          </a>
        ))}
        <a href="#guide-bands">
          <span>{GUIDE_GROUPS.length + 1}</span>
          {l('피해 배율 표', 'Damage table', 'ダメージ倍率表')}
        </a>
      </nav>

      {GUIDE_GROUPS.map((group, index) => (
        <section key={group.id} id={`guide-group-${group.id}`} className="panel guide-group">
          <header className="guide-group-head">
            <span className="guide-group-index">{index + 1}</span>
            <div>
              <span className="eyebrow">{localizedText(group.eyebrow, locale)}</span>
              <h3>{localizedText(group.title, locale)}</h3>
            </div>
          </header>
          <div className="guide-notes">
            {group.notes.map((note) => (
              <NoteItem key={note.id} note={note} open={openIds.has(note.id)} onToggle={() => toggle(note.id)} />
            ))}
          </div>
        </section>
      ))}

      <section id="guide-bands" className="panel guide-group">
        <header className="guide-group-head">
          <span className="guide-group-index">{GUIDE_GROUPS.length + 1}</span>
          <div>
            <span className="eyebrow">{l('계산 기준', 'Calculator basis', '計算基準')}</span>
            <h3>{l('권장 전투력 대비 피해 배율', 'Damage multiplier by Power ratio', '推奨戦闘力に対するダメージ倍率')}</h3>
          </div>
        </header>
        <p className="guide-why">
          {l(
            '내 팀 전투력 ÷ 목표 스테이지 권장 전투력으로 구간이 정해지고, 그 구간의 배율이 내가 주는 피해에 곱해집니다. 일반 스테이지와 차원의 이면 모두 같은 표를 씁니다.',
            'Your band is your team Power ÷ the stage’s recommended Power, and that band’s multiplier is applied to the damage you deal. Normal stages and Dimension use the same table.',
            'チーム戦闘力 ÷ 目標ステージの推奨戦闘力で区分が決まり、その区分の倍率が与えるダメージに掛かります。通常ステージと次元の裏側で同じ表を使います。',
          )}
        </p>
        <div className="table-scroll">
          <table className="band-table">
            <thead>
              <tr>
                <th scope="col">{l('권장 전투력 대비', 'Power ratio', '推奨値との比率')}</th>
                <th scope="col">{l('주는 피해', 'Damage dealt', '与えるダメージ')}</th>
              </tr>
            </thead>
            <tbody>
              {DAMAGE_BANDS.map((band) => (
                <tr key={band.min} className={band.multiplier === 1 ? 'is-current' : undefined}>
                  <td>
                    {band.max === null
                      ? `${percent(band.min)} ${l('이상', 'or more', '以上')}`
                      : `${percent(band.min)} ~ ${percent(band.max)} ${l('미만', '(exclusive)', '未満')}`}
                  </td>
                  <td>
                    <b>{percent(band.multiplier)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Link className="text-button guide-note-link" to={ROUTES.stage}>
          {l('내 전투력으로 구간 확인하기', 'Find your band', '自分の区分を確認する')}
        </Link>
      </section>

      <aside className="guide-footnote">
        <p>
          {l(
            '게임 데이터와 공개된 분석을 바탕으로 정리한 비공식 자료입니다. 일부 해석은 업데이트에 따라 달라질 수 있으니 참고용으로 활용해 주세요.',
            'Unofficial notes based on game data and public analysis. Some interpretations may change with updates, so use them as a reference.',
            'ゲームデータと公開されている分析をもとにまとめた非公式資料です。一部の解釈はアップデートで変わる可能性があるため、参考としてご利用ください。',
          )}
        </p>
      </aside>
    </section>
  )
}
