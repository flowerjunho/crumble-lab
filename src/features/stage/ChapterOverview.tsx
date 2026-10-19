import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { pick, useI18n } from '../../i18n'
import { formatCeil, formatMillions, formatPercent } from '../../lib/format'
import { CHAPTER_BAND_MULTIPLIERS, type ChapterStage } from '../../lib/normalStage'

interface ChapterOverviewProps {
  ch: number
  stages: ChapterStage[]
  selectedSt: number | null
  /** 팀 전투력(원). 없으면 기준선을 그리지 않는다. */
  cp: number | null
  debuffRateBp: number
  onSelect: (st: number) => void
}

const HEIGHT = 240
const MARGIN = { top: 18, right: 16, bottom: 30, left: 62 }

/** 컨테이너 너비를 따라 SVG 좌표계를 맞춘다(글자가 늘어나지 않도록 viewBox를 늘리지 않는다). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** 보기 좋은 눈금 간격(1·2·5 × 10ⁿ)으로 4~6개 눈금을 만든다. */
function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || max || 1
  const raw = span / count
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => span / s <= count + 1)!
  const start = Math.floor(min / step) * step
  const ticks: number[] = []
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(v)
  return ticks
}

export function ChapterOverview({ ch, stages, selectedSt, cp, debuffRateBp, onSelect }: ChapterOverviewProps) {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const [boxRef, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const chart = useMemo(() => {
    if (!width || stages.length === 0) return null
    const powers = stages.map((s) => s.power)
    let lo = Math.min(...powers)
    let hi = Math.max(...powers)
    // 내 전투력이 이 챕터 근처에 있을 때만 축에 넣는다. 너무 멀면 선이 납작해지므로 가장자리에 안내만 한다.
    const cpInRange = cp !== null && cp >= lo * 0.85 && cp <= hi * 1.15
    if (cpInRange) {
      lo = Math.min(lo, cp)
      hi = Math.max(hi, cp)
    }
    const pad = (hi - lo) * 0.12 || hi * 0.02
    const ticks = niceTicks(lo - pad, hi + pad)
    const y0 = ticks[0]!
    const y1 = ticks[ticks.length - 1]!
    const innerW = width - MARGIN.left - MARGIN.right
    const innerH = HEIGHT - MARGIN.top - MARGIN.bottom
    const x = (st: number) => MARGIN.left + ((st - 1) / Math.max(1, stages.length - 1)) * innerW
    const y = (v: number) => MARGIN.top + (1 - (v - y0) / (y1 - y0)) * innerH
    const path = stages.map((s, i) => `${i ? 'L' : 'M'}${x(s.st).toFixed(1)},${y(s.power).toFixed(1)}`).join('')
    return { ticks, x, y, path, cpInRange, innerW }
  }, [width, stages, cp])

  const onPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!chart) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left - MARGIN.left) / chart.innerW
    const index = Math.round(ratio * (stages.length - 1))
    setHover(Math.min(stages.length - 1, Math.max(0, index)))
  }

  // 초반 챕터(약 1~28)는 필요 전투력이 1M보다 작아 0.01M 단위로는 모두 같은 숫자가 된다.
  // 챕터에서 가장 작은 값이 1M 미만이면 챕터 전체를 원래 숫자로 보여 준다.
  const useMillions = stages.length > 0 && Math.min(...stages.map((s) => s.power)) >= 1e6
  const fmt = (value: number) => (useMillions ? formatMillions(value, locale) : Math.ceil(value).toLocaleString(locale))
  const fmtUnit = (value: number) => (useMillions ? `${fmt(value)} M` : fmt(value))
  const hovered = hover === null ? null : stages[hover]
  const cpLabel = cp === null ? '' : `${l('내 전투력', 'My Power', '自分の戦闘力')} ${fmtUnit(cp)}`
  const xLabelEvery = width < 520 ? 5 : 1

  return (
    <div className="chapter-overview">
      <div className="chapter-overview-head">
        <h4>
          {l(`${ch}챕터 · 피해 100%에 필요한 팀 전투력`, `Chapter ${ch} · Power for 100% damage`, `第${ch}章・ダメージ100%に必要なチーム戦闘力`)}
          <small className="subtle"> ({useMillions ? l('단위 M', 'in M', '単位 M') : l('실제 수치', 'actual value', '実数')})</small>
        </h4>
        {cp !== null && chart && !chart.cpInRange && (
          <span className="subtle">
            {cpLabel} ·{' '}
            {cp < stages[0]!.power
              ? l('이 챕터보다 한참 낮음', 'far below this chapter', 'この章よりかなり低い')
              : l('이 챕터보다 한참 높음', 'far above this chapter', 'この章よりかなり高い')}
          </span>
        )}
      </div>

      <div className="chapter-chart" ref={boxRef}>
        {chart && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={l(
              `${ch}챕터 1~30 스테이지의 필요 전투력 그래프. 같은 값은 아래 표에 있습니다.`,
              `Chart of required Power for stages 1–30 of chapter ${ch}. The table below has the same values.`,
              `第${ch}章1〜30ステージの必要戦闘力グラフ。同じ値は下の表にあります。`,
            )}
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={() => setHover(null)}
            onClick={() => hovered && onSelect(hovered.st)}
          >
            {chart.ticks.map((tick) => (
              <g key={tick}>
                <line className="chart-grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={chart.y(tick)} y2={chart.y(tick)} />
                <text className="chart-axis" x={MARGIN.left - 8} y={chart.y(tick)} dy="0.32em" textAnchor="end">
                  {fmt(tick)}
                </text>
              </g>
            ))}
            {stages.map((s) =>
              s.st === 1 || s.st % xLabelEvery === 0 ? (
                <text key={s.st} className="chart-axis" x={chart.x(s.st)} y={HEIGHT - 10} textAnchor="middle">
                  {s.st}
                </text>
              ) : null,
            )}

            {selectedSt !== null && (
              <line className="chart-selected-rule" x1={chart.x(selectedSt)} x2={chart.x(selectedSt)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} />
            )}

            {cp !== null && chart.cpInRange && (
              <g>
                <line className="chart-reference" x1={MARGIN.left} x2={width - MARGIN.right} y1={chart.y(cp)} y2={chart.y(cp)} />
                <text className="chart-reference-label" x={width - MARGIN.right} y={chart.y(cp) - 6} textAnchor="end">
                  {cpLabel}
                </text>
              </g>
            )}

            <path className="chart-line" d={chart.path} />

            {hovered && (
              <line className="chart-crosshair" x1={chart.x(hovered.st)} x2={chart.x(hovered.st)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} />
            )}
            {stages
              .filter((s) => s.st === selectedSt || s.st === hovered?.st)
              .map((s) => (
                <circle
                  key={s.st}
                  className={s.st === selectedSt ? 'chart-dot is-selected' : 'chart-dot'}
                  cx={chart.x(s.st)}
                  cy={chart.y(s.power)}
                  r={s.st === selectedSt ? 5.5 : 4.5}
                />
              ))}
          </svg>
        )}

        {chart && hovered && (
          <div
            className="chart-tooltip"
            // 그래프 위쪽에 고정하고 십자선 옆에 붙인다. 오른쪽 절반에서는 왼쪽으로 뒤집어 잘리지 않게 한다.
            style={
              chart.x(hovered.st) > width / 2
                ? { right: width - chart.x(hovered.st) + 10, top: MARGIN.top }
                : { left: chart.x(hovered.st) + 10, top: MARGIN.top }
            }
            role="presentation"
          >
            <b>
              {ch}–{hovered.st}
            </b>
            {hovered.boss && <span className="subtle"> {hovered.boss}</span>}
            <dl>
              <dt>{l('피해 100%', '100% damage', 'ダメージ100%')}</dt>
              <dd>{fmtUnit(hovered.power)}</dd>
              <dt>{l('명중', 'Accuracy', '命中')}</dt>
              <dd>{formatCeil(hovered.accuracyNeeded, locale)}</dd>
              <dt>{l('집중', 'Focus', '集中')}</dt>
              <dd>{formatCeil(hovered.focusNeeded, locale)}</dd>
              {hovered.multiplier !== null && (
                <>
                  <dt>{l('내 피해', 'My damage', '自分のダメージ')}</dt>
                  <dd>{formatPercent(hovered.multiplier)}</dd>
                </>
              )}
            </dl>
          </div>
        )}
      </div>
      <p className="field-hint">
        {l(
          '그래프를 누르면 해당 스테이지가 목표로 선택됩니다.',
          'Tap the chart to set that stage as your target.',
          'グラフをタップするとそのステージが目標になります。',
        )}
      </p>

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
                <td className="chapter-boss">{s.boss}</td>
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
