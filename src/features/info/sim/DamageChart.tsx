import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { pick, useI18n } from '../../../i18n'
import { formatCompact } from '../stages/stageInfoData'
import type { SimResult } from './engine'

export interface ChartSeries {
  name: string
  /** 결과의 쿠키 순서(rows) 가운데 이 줄에 더하는 쿠키 */
  indexes: number[]
  /** 색 순서(1~6). 0이면 '나머지' 회색 */
  color: number
}

/** 최종 피해가 큰 쿠키 6명은 따로, 나머지는 한 줄로 묶는다(색이 너무 많으면 구분이 안 된다). */
export const TOP_SERIES = 6

export function chartSeries(result: SimResult, nameOf: (index: number) => string, othersName: string): ChartSeries[] {
  const order = result.rows.map((row, i) => ({ i, damage: row.damage })).sort((a, b) => b.damage - a.damage)
  const top = order.slice(0, TOP_SERIES).filter((o) => o.damage > 0)
  const rest = order.filter((o) => !top.includes(o) && o.damage > 0)
  const series: ChartSeries[] = top.map((o, k) => ({ name: nameOf(o.i), indexes: [o.i], color: k + 1 }))
  if (rest.length) series.push({ name: othersName, indexes: rest.map((o) => o.i), color: 0 })
  return series
}

const HEIGHT = 260
const MARGIN = { top: 14, right: 14, bottom: 36, left: 56 }

interface Props {
  result: SimResult
  series: ChartSeries[]
  /** 세로 눈금 옆에 표시할 단계 경계(초) */
  markers?: { t: number; label: string }[]
}

/**
 * 쿠키별 누적 피해를 쌓은 면적 그래프. 맨 위 선이 팀 전체 누적 피해이고, 띠 두께가 그 쿠키의 몫이다.
 * 보스 체력이 있으면 그 높이에 가로 점선을 긋는다. 맨 윗선이 점선에 닿는 시각이 처치 시각이다.
 * 차트 라이브러리 없이 SVG로 그리고, 실제 폭을 재서 글자가 줄어들지 않게 한다.
 */
export function DamageChart({ result, series, markers = [] }: Props) {
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

  const samples = result.samples
  if (samples.length < 2) return null
  const duration = Math.max(result.timeLimit, samples[samples.length - 1]!.t)
  const stackAt = (s: (typeof samples)[number]) => {
    let acc = 0
    return series.map((line) => {
      const lo = acc
      acc += line.indexes.reduce((sum, i) => sum + (s.cum[i] ?? 0), 0)
      return [lo, acc] as const
    })
  }
  const stacks = samples.map(stackAt)
  const total = samples[samples.length - 1]!.cum.reduce((a, b) => a + b, 0)
  const yStep = niceStep(Math.max(total, result.bossMaxHp ?? 0, 1) / 4)
  const yTop = yStep * Math.max(1, Math.ceil(Math.max(total, result.bossMaxHp ?? 0, 1) / yStep - 1e-9))
  const plotW = width - MARGIN.left - MARGIN.right
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom
  const x = (t: number) => MARGIN.left + (t / duration) * plotW
  const y = (v: number) => MARGIN.top + plotH - (v / yTop) * plotH

  const area = (k: number) => {
    const upper = samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)},${y(stacks[i]![k]![1]).toFixed(1)}`).join('')
    const lower = samples
      .map((s, i) => [s, i] as const)
      .reverse()
      .map(([s, i]) => `L${x(s.t).toFixed(1)},${y(stacks[i]![k]![0]).toFixed(1)}`)
      .join('')
    return `${upper}${lower}Z`
  }

  const yTicks = Array.from({ length: Math.round(yTop / yStep) + 1 }, (_, i) => i * yStep)
  const xStep = duration <= 30 ? 5 : plotW < 360 ? 20 : 10
  const xTicks = Array.from({ length: Math.floor(duration / xStep) + 1 }, (_, i) => i * xStep)

  const clamp = (i: number) => Math.min(samples.length - 1, Math.max(0, i))
  const active = hover ?? samples.length - 1
  const sample = samples[clamp(active)]!
  const activeStack = stacks[clamp(active)]!

  const indexAt = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const px = ((event.clientX - rect.left) / rect.width) * width
    const t = ((px - MARGIN.left) / plotW) * duration
    let best = 0
    samples.forEach((s, i) => {
      if (Math.abs(s.t - t) < Math.abs((samples[best]?.t ?? 0) - t)) best = i
    })
    return best
  }

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, PageUp: 20, PageDown: -20 }
    if (!(event.key in step) && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    if (event.key === 'Home') setHover(0)
    else if (event.key === 'End') setHover(samples.length - 1)
    else setHover(clamp(active + (step[event.key] ?? 0)))
  }

  const fmt = (v: number) => formatCompact(v, locale)
  const sampleTotal = activeStack[activeStack.length - 1]?.[1] ?? 0

  return (
    <div className="sim-chart" ref={wrapRef}>
      <div className="sim-chart-readout" id={readoutId} aria-live="polite">
        <strong>{l(`${sample.t.toFixed(2)}초`, `${sample.t.toFixed(2)} s`, `${sample.t.toFixed(2)}秒`)}</strong>{' '}
        {l('누적 피해', 'Total', '累計')} <b>{fmt(sampleTotal)}</b>
        {sample.bossHp !== null && (
          <span className="subtle">
            {' · '}
            {l('보스 남은 체력', 'Boss HP left', 'ボス残りHP')} {(sample.bossHp * 100).toFixed(1)}%
          </span>
        )}
        <span className="subtle">
          {' · '}
          {l(`살아 있는 쿠키 ${sample.alive}명`, `${sample.alive} Cookies standing`, `生存クッキー${sample.alive}人`)}
        </span>
      </div>
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        tabIndex={0}
        role="img"
        aria-label={l(
          '쿠키별 누적 피해를 시간에 따라 쌓은 그래프. 좌우 화살표로 시각을 옮깁니다. 같은 내용이 아래 표에 있습니다.',
          'Cumulative damage per Cookie over time, stacked. Use the arrow keys to move in time. The table below has the same numbers.',
          'クッキーごとの累計ダメージを時間で積み上げたグラフ。左右キーで時刻を移動します。同じ内容が下の表にあります。',
        )}
        aria-describedby={readoutId}
        onPointerMove={(e) => setHover(indexAt(e))}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
        onBlur={() => setHover(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line className="sim-chart-grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(v)} y2={y(v)} />
            <text className="sim-chart-tick" x={MARGIN.left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle">
              {fmt(v)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} className="sim-chart-tick" x={x(t)} y={MARGIN.top + plotH + 16} textAnchor="middle">
            {t}
          </text>
        ))}
        <text className="sim-chart-axis" x={MARGIN.left + plotW / 2} y={HEIGHT - 4} textAnchor="middle">
          {l('전투 시간(초)', 'Battle time (s)', '戦闘時間(秒)')}
        </text>
        {markers.map((m) => (
          <g key={m.t} className="sim-chart-marker">
            <line x1={x(m.t)} x2={x(m.t)} y1={MARGIN.top} y2={MARGIN.top + plotH} />
            <text x={x(m.t) + 3} y={MARGIN.top + 10}>
              {m.label}
            </text>
          </g>
        ))}

        {series.map((line, k) => (
          <path key={line.name} className={`sim-chart-area sim-c${line.color}`} d={area(k)} />
        ))}

        {result.bossMaxHp !== null && (
          <g>
            <line className="sim-chart-hp" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(result.bossMaxHp)} y2={y(result.bossMaxHp)} />
            <text className="sim-chart-hp-label" x={MARGIN.left + 4} y={y(result.bossMaxHp) - 5}>
              {l('보스 체력', 'Boss HP', 'ボスHP')} {fmt(result.bossMaxHp)}
            </text>
          </g>
        )}
        {result.killTime !== null && (
          <g className="sim-chart-kill">
            <line x1={x(result.killTime)} x2={x(result.killTime)} y1={MARGIN.top} y2={MARGIN.top + plotH} />
          </g>
        )}

        <g className="sim-chart-cross">
          <line x1={x(sample.t)} x2={x(sample.t)} y1={MARGIN.top} y2={MARGIN.top + plotH} />
          <circle cx={x(sample.t)} cy={y(sampleTotal)} r={4} />
        </g>
        <rect x={MARGIN.left} y={MARGIN.top} width={plotW} height={plotH} fill="transparent" />
      </svg>
      <ul className="sim-chart-legend">
        {series.map((line, k) => {
          const [lo, hi] = activeStack[k] ?? [0, 0]
          const value = hi - lo
          return (
            <li key={line.name}>
              <span className={`sim-swatch sim-c${line.color}`} aria-hidden="true" />
              <span className="sim-legend-name">{line.name}</span>
              <span className="sim-legend-value">
                {fmt(value)}
                <span className="subtle"> {sampleTotal > 0 ? `${((value / sampleTotal) * 100).toFixed(1)}%` : '0%'}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** 눈금 간격: 1·2·2.5·5 × 10ⁿ 가운데 값보다 크거나 같은 가장 작은 수 */
function niceStep(value: number): number {
  const exp = Math.pow(10, Math.floor(Math.log10(value)))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * exp >= value) return m * exp
  return 10 * exp
}
