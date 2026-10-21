import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { pick, useI18n } from '../../../i18n'
import { formatCompact, formatFull, type ChapterPoint } from './stageInfoData'

interface Props {
  points: ChapterPoint[]
  selected: number
  onSelect: (chapter: number) => void
  /** 저장된 팀 전투력(원 단위). 없으면 기준선을 그리지 않는다. */
  teamPower: number | null
}

const HEIGHT = 240
const MARGIN = { top: 14, right: 14, bottom: 40, left: 52 }

/** log10 눈금: 10의 거듭제곱마다 하나씩 */
function logTicks(min: number, max: number): number[] {
  const ticks: number[] = []
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) ticks.push(10 ** e)
  return ticks
}

/**
 * 챕터별 권장 전투력 그래프. 값이 1천대에서 수백억까지 퍼져 있어서 세로축은 로그 눈금이다.
 * 차트 라이브러리 없이 SVG로 그리고, 그릴 때의 실제 폭을 재서 글자 크기가 줄어들지 않게 한다.
 * 마우스를 올리거나 화살표 키로 옮기면 위의 안내 줄에 값이 나오고, 누르면 그 챕터를 고른다.
 */
export function PowerChart({ points, selected, onSelect, teamPower }: Props) {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [hover, setHover] = useState<number | null>(null)
  const readoutId = useId()

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setWidth(Math.max(280, Math.round(el.clientWidth)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const count = points.length
  if (!count) return null
  const values = points.flatMap((p) => [p.first, p.max])
  const ticks = logTicks(Math.min(...values), Math.max(...values, teamPower ?? 0))
  const yMin = Math.log10(ticks[0] ?? 1)
  const yMax = Math.log10(ticks[ticks.length - 1] ?? 10)
  const plotW = width - MARGIN.left - MARGIN.right
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom
  const x = (chapter: number) => MARGIN.left + (count === 1 ? 0 : ((chapter - 1) / (count - 1)) * plotW)
  const y = (value: number) => MARGIN.top + plotH - ((Math.log10(Math.max(value, 1)) - yMin) / (yMax - yMin || 1)) * plotH
  const line = (key: 'first' | 'max') => points.map((p, i) => `${i ? 'L' : 'M'}${x(p.chapter).toFixed(1)},${y(p[key]).toFixed(1)}`).join('')

  // 좁은 화면에서는 가로 눈금을 덜 찍는다.
  const xStep = plotW < 360 ? 100 : 50
  const xTicks = [1, ...Array.from({ length: Math.floor(count / xStep) }, (_, i) => (i + 1) * xStep)].filter((c) => c <= count)
  // 세로 눈금이 너무 촘촘하면 하나 걸러 이름을 붙인다.
  const labelEvery = plotH / Math.max(1, ticks.length - 1) < 18 ? 2 : 1

  const clamp = (chapter: number) => Math.min(count, Math.max(1, chapter))
  const active = hover ?? selected
  const point = points[clamp(active) - 1]

  const chapterAt = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const px = ((event.clientX - rect.left) / rect.width) * width
    return clamp(Math.round(((px - MARGIN.left) / plotW) * (count - 1)) + 1)
  }

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }
    let next: number | null = null
    if (event.key in step) next = clamp(active + (step[event.key] ?? 0))
    else if (event.key === 'Home') next = 1
    else if (event.key === 'End') next = count
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(active)
      return
    }
    if (next === null) return
    event.preventDefault()
    setHover(next)
  }

  return (
    <div className="stages-chart" ref={wrapRef}>
      <p className="stages-chart-readout" id={readoutId} aria-live="polite">
        {point && (
          <>
            <strong>{l(`${point.chapter}챕터`, `Chapter ${point.chapter}`, `${point.chapter}章`)}</strong>{' '}
            {l('최고', 'Peak', '最高')} <b>{formatCompact(point.max, locale, 4)}</b>
            <span className="subtle">
              {' · '}
              {l('1스테이지', 'Stage 1', 'ステージ1')} {formatCompact(point.first, locale, 4)}
            </span>
            {hover !== null && hover !== selected && (
              <span className="subtle">{l(' · 누르면 이 챕터를 엽니다', ' · Tap to open', ' · タップで開きます')}</span>
            )}
          </>
        )}
      </p>
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        tabIndex={0}
        role="img"
        aria-label={l(
          '챕터별 권장 전투력 그래프(로그 눈금). 좌우 화살표로 챕터를 옮기고 Enter로 고릅니다.',
          'Recommended Power by chapter (log scale). Use the arrow keys to move and Enter to pick.',
          '章ごとの推奨戦闘力グラフ(対数目盛)。左右キーで移動し、Enterで選びます。',
        )}
        aria-describedby={readoutId}
        onPointerMove={(e) => setHover(chapterAt(e))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => onSelect(chapterAt(e))}
        onKeyDown={onKeyDown}
        onBlur={() => setHover(null)}
      >
        {ticks.map((t, i) => (
          <g key={t}>
            <line className="stages-chart-grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} />
            {i % labelEvery === 0 && (
              <text className="stages-chart-tick" x={MARGIN.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle">
                {formatCompact(t, locale)}
              </text>
            )}
          </g>
        ))}
        {xTicks.map((c) => (
          <text key={c} className="stages-chart-tick" x={x(c)} y={MARGIN.top + plotH + 16} textAnchor="middle">
            {c}
          </text>
        ))}
        <text className="stages-chart-axis" x={MARGIN.left + plotW / 2} y={HEIGHT - 4} textAnchor="middle">
          {l('챕터', 'Chapter', '章')}
        </text>
        <text className="stages-chart-axis" transform={`translate(12 ${MARGIN.top + plotH / 2}) rotate(-90)`} textAnchor="middle">
          {l('권장 전투력(로그)', 'Rec. Power (log)', '推奨戦闘力(対数)')}
        </text>

        {teamPower !== null && teamPower > 0 && (
          <g>
            <line className="stages-chart-team" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(teamPower)} y2={y(teamPower)} />
            <text className="stages-chart-team-label" x={width - MARGIN.right - 4} y={y(teamPower) - 5} textAnchor="end">
              {l('내 팀 전투력', 'My team Power', '自分のチーム戦闘力')} {formatCompact(teamPower, locale)}
            </text>
          </g>
        )}

        <path className="stages-chart-line stages-chart-line-first" d={line('first')} />
        <path className="stages-chart-line" d={line('max')} />

        {point && (
          <g className="stages-chart-marker">
            <line x1={x(point.chapter)} x2={x(point.chapter)} y1={MARGIN.top} y2={MARGIN.top + plotH} />
            <circle cx={x(point.chapter)} cy={y(point.max)} r={4.5} />
          </g>
        )}
        {/* 포인터를 어디에 올려도 이벤트를 받도록 그림 영역 전체를 덮는다. */}
        <rect x={MARGIN.left} y={MARGIN.top} width={plotW} height={plotH} fill="transparent" />
      </svg>
      <ul className="stages-chart-legend">
        <li>
          <span className="stages-chart-swatch" aria-hidden="true" />
          {l('챕터 최고 권장 전투력', 'Chapter peak', '章内の最高値')}
        </li>
        <li>
          <span className="stages-chart-swatch stages-chart-swatch-first" aria-hidden="true" />
          {l('챕터 1스테이지', 'Stage 1 of the chapter', '章のステージ1')}
        </li>
        {teamPower !== null && teamPower > 0 && (
          <li>
            <span className="stages-chart-swatch stages-chart-swatch-team" aria-hidden="true" />
            {l('내 팀 전투력', 'My team Power', '自分のチーム戦闘力')}
          </li>
        )}
      </ul>
      <p className="field-note">
        {l(
          `그래프를 가리키면 위에 그 챕터의 값이 나오고, 누르면 아래 표가 그 챕터로 바뀝니다. 마지막 스테이지의 권장 전투력은 ${formatFull(points[points.length - 1]?.max ?? 0, locale)}입니다.`,
          `Point at the chart to read a chapter above it; tap to load that chapter into the table below. The final stage asks for ${formatFull(points[points.length - 1]?.max ?? 0, locale)}.`,
          `グラフを指すと上にその章の値が出て、タップすると下の表がその章に切り替わります。最終ステージの推奨戦闘力は${formatFull(points[points.length - 1]?.max ?? 0, locale)}です。`,
        )}
      </p>
    </div>
  )
}
