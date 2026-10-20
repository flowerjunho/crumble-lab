import { pick, useI18n } from '../../i18n'
import { formatBossCount, formatCeil, formatMillions, formatPercent } from '../../lib/format'
import { CHAPTER_BAND_MULTIPLIERS, type ChapterStage } from '../../lib/normalStage'

interface ChapterOverviewProps {
  ch: number
  stages: ChapterStage[]
  selectedSt: number | null
  /** 팀 전투력(원). 있으면 이미 들어가는 구간과 내 피해 배율을 표시한다. */
  cp: number | null
  debuffRateBp: number
  onSelect: (st: number) => void
}

/** 한 챕터 30개 스테이지의 구간별 필요 전투력·명중·집중 표. 스테이지를 누르면 목표로 고른다. */
export function ChapterOverview({ ch, stages, selectedSt, cp, debuffRateBp, onSelect }: ChapterOverviewProps) {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)

  // 초반 챕터(약 1~28)는 필요 전투력이 1M보다 작아 0.01M 단위로는 모두 같은 숫자가 된다.
  // 챕터에서 가장 작은 값이 1M 미만이면 챕터 전체를 원래 숫자로 보여 준다.
  const useMillions = stages.length > 0 && Math.min(...stages.map((s) => s.power)) >= 1e6
  const fmt = (value: number) => (useMillions ? formatMillions(value, locale) : Math.ceil(value).toLocaleString(locale))

  return (
    <div className="chapter-overview">
      <div className="chapter-overview-head">
        <h4>
          {l(`${ch}챕터 1~30 스테이지`, `Chapter ${ch}, stages 1–30`, `第${ch}章 1〜30ステージ`)}
          <small className="subtle"> ({useMillions ? l('전투력 단위 M', 'Power in M', '戦闘力の単位 M') : l('전투력 실제 수치', 'actual Power', '戦闘力は実数')})</small>
        </h4>
        <span className="subtle">
          {l('스테이지를 누르면 목표로 선택됩니다.', 'Tap a stage to set it as your target.', 'ステージをタップすると目標になります。')}
        </span>
      </div>

      {/* 제목 행은 스크롤해도 보이도록 고정한다. 넓은 화면은 페이지 스크롤에, 좁은 화면은 표 영역 스크롤에 붙는다. */}
      <div className="chapter-table-wrap">
        <table className="chapter-table">
          <thead>
            <tr>
              <th scope="col">{l('스테이지', 'Stage', 'ステージ')}</th>
              <th scope="col">{l('보스', 'Boss', 'ボス')}</th>
              {CHAPTER_BAND_MULTIPLIERS.map((m) => (
                <th key={m} scope="col">
                  {l('피해', 'Dmg', 'ダメージ')} {formatPercent(m)}
                </th>
              ))}
              <th scope="col">{l('명중', 'Accuracy', '命中')}</th>
              <th scope="col">
                {l('집중', 'Focus', '集中')} <small>{formatPercent(debuffRateBp / 1e4)}</small>
              </th>
              {cp !== null && <th scope="col">{l('내 피해', 'My damage', '自分のダメージ')}</th>}
            </tr>
          </thead>
          <tbody>
            {stages.map((s) => (
              <tr key={s.st} className={s.st === selectedSt ? 'is-selected' : undefined} aria-current={s.st === selectedSt ? 'true' : undefined}>
                <th scope="row">
                  <button type="button" className="chapter-stage-button" onClick={() => onSelect(s.st)}>
                    {ch}–{s.st}
                  </button>
                </th>
                <td className="chapter-boss">
                  {s.boss}
                  {s.bossCount !== null && <span className="boss-count">{formatBossCount(s.bossCount, locale)}</span>}
                </td>
                {s.bands.map((band) => (
                  // 팀 전투력을 넣었으면 이미 들어가는 구간을 표시한다.
                  <td key={band.multiplier} className={cp !== null && cp >= band.power ? 'is-met' : undefined}>
                    {fmt(band.power)}
                  </td>
                ))}
                <td>{formatCeil(s.accuracyNeeded, locale)}</td>
                <td>{formatCeil(s.focusNeeded, locale)}</td>
                {cp !== null && s.multiplier !== null && (
                  <td className={s.multiplier >= 1 ? 'good' : 'warning'}>{formatPercent(s.multiplier)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
