import { useMemo, useState } from 'react'
import { pick, useI18n } from '../../../i18n'
import { CONSTELLATION_MAX_AMP, SLOTS, averageArea, ceiling, ceilingChance, enclosedArea, linkFaces, placements, reshuffle, slotPoint } from './stellar'
import { systemsData } from './systemsData'
import './systems.css'

const { resetCost, maxLocks } = systemsData.stellar
const MIN_SHARDS = 3
const R = 100

/** 단위원 좌표를 SVG 좌표로(SVG는 y가 아래로 커진다) */
const toSvg = ([x, y]: [number, number], r = R) => [x * r, -y * r] as const
const pct = (fraction: number, digits = 1) => `${(fraction * 100).toFixed(digits)}%`
const int = (value: number) => Math.round(value).toLocaleString('en-US')

type Mode = 'place' | 'lock'

export function StellarLinkPage() {
  const { locale } = useI18n()
  const l = <T,>(ko: T, en: T, ja: T) => pick(locale, ko, en, ja)

  const [count, setCount] = useState(12)
  /** order[별조각 번호] = 슬롯. 아직 놓지 않은 조각은 없다. */
  const [order, setOrder] = useState<number[]>([])
  const [locked, setLocked] = useState<Set<number>>(new Set())
  const [mode, setMode] = useState<Mode>('place')
  const [constellation, setConstellation] = useState(1)
  const [spent, setSpent] = useState({ resets: 0, points: 0 })

  // 무작위 평균은 같은 씨앗으로 한 번만 계산한다.
  const reference = useMemo(
    () =>
      Array.from({ length: SLOTS - MIN_SHARDS + 1 }, (_, i) => {
        const n = i + MIN_SHARDS
        const c = ceiling(n)
        const total = placements(SLOTS, n)
        return { n, ceiling: c.area, best: c.layouts.length, total, oneIn: total / c.layouts.length, mean: averageArea(n, 2000) }
      }),
    [],
  )

  const complete = order.length === count
  const area = complete ? enclosedArea(order) : null
  const top = ceiling(count)
  const maxAmp = CONSTELLATION_MAX_AMP[constellation - 1] ?? 0
  const lockMap = new Map([...locked].map((shard) => [shard, order[shard]!] as const))
  const odds = complete ? ceilingChance(count, lockMap) : null
  const cost = resetCost[Math.min(locked.size, maxLocks)] ?? 0
  const atCeiling = area !== null && area >= top.area - 1e-9
  const faces = complete ? linkFaces(order) : []

  const reset = (n = count) => {
    setOrder([])
    setLocked(new Set())
    setSpent({ resets: 0, points: 0 })
    setMode('place')
    setCount(n)
  }
  const tapSlot = (slot: number) => {
    const shard = order.indexOf(slot)
    if (mode === 'lock') {
      if (shard < 0) return
      const next = new Set(locked)
      if (next.has(shard)) next.delete(shard)
      else if (next.size < maxLocks) next.add(shard)
      setLocked(next)
      return
    }
    if (shard < 0 && order.length < count) setOrder([...order, slot])
    // 마지막에 놓은 조각을 다시 누르면 되돌린다.
    else if (shard === order.length - 1 && !locked.has(shard)) setOrder(order.slice(0, -1))
  }
  const deal = () => {
    // 아직 다 놓지 않았으면 처음부터 무작위로 놓고, 다 놓았으면 잠근 조각만 두고 재설정 한 번을 흉내 낸다.
    const base = complete ? order : Array.from({ length: count }, (_, i) => i)
    const keep = complete ? locked : new Set<number>()
    setOrder(reshuffle(base, keep))
    if (complete) setSpent({ resets: spent.resets + 1, points: spent.points + cost })
  }

  const linkPath = order.length >= 2 ? order.map((slot, i) => `${i ? 'L' : 'M'}${toSvg(slotPoint(slot)).join(' ')}`).join(' ') + (complete ? ' Z' : '') : ''

  return (
    <div className="systems-page">
      <div className="section-intro">
        <div>
          <h2>{l('스텔라 링크', 'Stellar Link', 'ステラリンク')}</h2>
          <p>
            {l(
              '별조각이 놓인 순서대로 판을 눌러 면적과 별자리별 증폭을 계산하고, 잠금에 따른 재설정 비용과 상한 배치 확률을 봅니다.',
              'Tap the board in the order your Star Shards landed to get the area, the amplification for each constellation, and the reset odds for your locks.',
              '星のかけらが置かれた順に盤面をタップすると、面積と星座ごとの増幅、ロックに応じたリセット費用と上限配置の確率を表示します。',
            )}
          </p>
        </div>
      </div>

      <section className="panel">
        <div className="systems-fields">
          <label>
            {l('별조각 수', 'Star Shards', '星のかけら数')}
            <select value={count} onChange={(e) => reset(Number(e.target.value))}>
              {Array.from({ length: SLOTS - MIN_SHARDS + 1 }, (_, i) => i + MIN_SHARDS).map((n) => (
                <option key={n} value={n}>
                  {l(`${n}개`, `${n}`, `${n}個`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {l('별자리', 'Constellation', '星座')}
            <select value={constellation} onChange={(e) => setConstellation(Number(e.target.value))}>
              {CONSTELLATION_MAX_AMP.map((amp, i) => (
                <option key={i} value={i + 1}>
                  {l(`제${i + 1} 별자리 (최대 +${amp}%)`, `Constellation ${i + 1} (max +${amp}%)`, `第${i + 1}星座(最大+${amp}%)`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className="systems-stellar">
        <section className="panel">
          <svg className="systems-board" viewBox="-130 -130 260 260" role="group" aria-label={l('스텔라 링크 판', 'Stellar Link board', 'ステラリンク盤面')}>
            <circle className="ring" r={R} />
            {faces.map((face, i) => (
              <polygon key={i} className="face" points={face.points.map((p) => toSvg(p).join(',')).join(' ')} />
            ))}
            {linkPath && <path className="link" d={linkPath} strokeDasharray={complete ? undefined : '5 5'} />}
            {Array.from({ length: SLOTS }, (_, slot) => {
              const [x, y] = toSvg(slotPoint(slot))
              const shard = order.indexOf(slot)
              const isLocked = shard >= 0 && locked.has(shard)
              const text =
                shard >= 0
                  ? l(`${shard + 1}번 별조각${isLocked ? ', 잠금' : ''}`, `Shard ${shard + 1}${isLocked ? ', locked' : ''}`, `星のかけら${shard + 1}${isLocked ? '、ロック' : ''}`)
                  : l(`빈 슬롯 ${slot + 1}`, `Empty slot ${slot + 1}`, `空きスロット${slot + 1}`)
              return (
                <g
                  key={slot}
                  className={`slot${shard >= 0 ? ' is-on' : ''}${isLocked ? ' is-locked' : ''}`}
                  transform={`translate(${x} ${y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={text}
                  onClick={() => tapSlot(slot)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      tapSlot(slot)
                    }
                  }}
                >
                  <circle r={16} />
                  <text>{shard >= 0 ? shard + 1 : ''}</text>
                </g>
              )
            })}
          </svg>
          <div className="systems-actions">
            <button type="button" aria-pressed={mode === 'place'} onClick={() => setMode('place')}>
              {l('배치 입력', 'Place', '配置入力')}
            </button>
            <button type="button" aria-pressed={mode === 'lock'} onClick={() => setMode('lock')} disabled={!complete}>
              {l(`잠금 ${locked.size}/${maxLocks}`, `Lock ${locked.size}/${maxLocks}`, `ロック ${locked.size}/${maxLocks}`)}
            </button>
            <button type="button" onClick={deal}>
              {complete ? l(`재설정 (${cost} SP)`, `Reset (${cost} SP)`, `リセット(${cost} SP)`) : l('무작위 배치', 'Random deal', 'ランダム配置')}
            </button>
            <button type="button" onClick={() => reset()}>
              {l('초기화', 'Clear', '初期化')}
            </button>
          </div>
          <p className="field-note">
            {mode === 'lock'
              ? l('잠글 별조각을 누르세요. 다시 누르면 풀립니다.', 'Tap shards to lock or unlock them.', 'ロックする星のかけらをタップしてください。')
              : order.length < count
                ? l(`${order.length + 1}번 별조각이 놓인 슬롯을 누르세요.`, `Tap the slot where shard ${order.length + 1} landed.`, `星のかけら${order.length + 1}が置かれたスロットをタップしてください。`)
                : l('모든 별조각을 놓았습니다. 마지막 조각을 다시 누르면 되돌립니다.', 'All shards placed. Tap the last one to undo it.', 'すべて配置しました。最後のかけらをもう一度タップすると戻せます。')}
          </p>
        </section>

        <section className="panel">
          <dl className="detail-stats">
            <div>
              <dt>{l('현재 면적', 'Area', '現在の面積')}</dt>
              <dd>{area === null ? '–' : pct(area)}</dd>
            </div>
            <div>
              <dt>{l(`${count}개 상한`, `Ceiling for ${count}`, `${count}個の上限`)}</dt>
              <dd>{pct(top.area)}</dd>
            </div>
            <div>
              <dt>{l('적용 증폭', 'Applied amplification', '適用増幅')}</dt>
              <dd>{area === null ? '–' : `+${(maxAmp * area).toFixed(1)}%`}</dd>
            </div>
            <div>
              <dt>{l('다음 재설정 비용', 'Next reset', '次のリセット費用')}</dt>
              <dd>{cost} SP</dd>
            </div>
          </dl>
          {area !== null && (
            <span className="systems-meter" aria-hidden="true">
              <span style={{ width: `${(area / Math.max(top.area, 1e-9)) * 100}%` }} />
            </span>
          )}
          <p className="field-note">
            {l(
              `적용 증폭은 공격력·방어력·체력에 같이 붙고, 제${constellation} 별자리 최대치 +${maxAmp}%에 면적을 곱한 값입니다.`,
              `Amplification applies to ATK, DEF and HP alike: constellation ${constellation}'s max +${maxAmp}% times the area.`,
              `適用増幅は攻撃力・防御力・HPに同じくかかり、第${constellation}星座の最大+${maxAmp}%に面積を掛けた値です。`,
            )}
          </p>
          {odds && (
            <dl className="detail-stats" style={{ marginTop: 12 }}>
              <div>
                <dt>{l('다음 재설정에서 상한이 나올 확률', 'Chance the next reset hits the ceiling', '次のリセットで上限が出る確率')}</dt>
                <dd className="text-value">
                  {atCeiling
                    ? l('이미 상한입니다', 'Already at the ceiling', 'すでに上限です')
                    : odds.ways
                      ? l(`${int(odds.total / odds.ways)}번에 1번`, `1 in ${int(odds.total / odds.ways)}`, `${int(odds.total / odds.ways)}回に1回`)
                      : l('지금 잠금으로는 불가능', 'Impossible with these locks', '今のロックでは不可能')}
                </dd>
              </div>
              <div>
                <dt>{l('상한까지 평균 SP', 'Average SP to the ceiling', '上限までの平均SP')}</dt>
                <dd>{!atCeiling && odds.ways ? int(cost / odds.chance) : '–'}</dd>
              </div>
              <div>
                <dt>{l('지금까지 재설정', 'Resets so far', 'これまでのリセット')}</dt>
                <dd className="text-value">{l(`${spent.resets}번 · ${int(spent.points)} SP`, `${spent.resets} · ${int(spent.points)} SP`, `${spent.resets}回・${int(spent.points)} SP`)}</dd>
              </div>
            </dl>
          )}
          <p className="field-note">
            {l(
              '잠근 별조각은 자리와 번호가 그대로 남고, 나머지는 빈 슬롯에 같은 확률로 다시 놓입니다. 판은 어느 방향에서 봐도 같아서 1개만 잠그면 잠그지 않은 것과 확률이 같습니다.',
              'Locked shards keep their slot and number; the rest land in empty slots with equal odds. The ring is symmetric, so locking just one shard changes nothing.',
              'ロックしたかけらは位置と番号がそのまま残り、残りは空きスロットに同じ確率で置き直されます。盤面は回転対称なので、1つだけロックしても確率は変わりません。',
            )}
          </p>
        </section>
      </div>

      <section className="panel">
        <h3>{l('별조각 수별 상한과 확률', 'Ceiling and odds by shard count', 'かけら数ごとの上限と確率')}</h3>
        <div className="table-scroll">
          <table className="detail-table">
            <thead>
              <tr>
                <th>{l('별조각', 'Shards', 'かけら')}</th>
                <th>{l('가능한 배치', 'Placements', '配置数')}</th>
                <th>{l('상한', 'Ceiling', '上限')}</th>
                <th>{l('상한 배치', 'Ceiling layouts', '上限配置')}</th>
                <th>{l('상한 확률', 'Ceiling odds', '上限確率')}</th>
                <th>{l('무작위 평균', 'Random mean', 'ランダム平均')}</th>
              </tr>
            </thead>
            <tbody>
              {reference.map((row) => (
                <tr key={row.n}>
                  <th>{row.n}</th>
                  <td>{int(row.total)}</td>
                  <td>{pct(row.ceiling)}</td>
                  <td>{int(row.best)}</td>
                  <td>{l(`${int(row.oneIn)}번에 1번`, `1 in ${int(row.oneIn)}`, `${int(row.oneIn)}回に1回`)}</td>
                  <td>{pct(row.mean)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="field-note">
          {l(
            '가능한 배치 수는 12칸에 별조각을 순서대로 놓는 경우의 수로, 모든 배치가 같은 확률로 나옵니다. 상한·상한 확률은 이 사이트가 직접 계산했고, 무작위 평균은 무작위 배치 2,000번의 평균입니다.',
            'Placements count ordered layouts on 12 slots, all equally likely. Ceilings and odds are computed here; the random mean averages 2,000 random deals.',
            '配置数は12スロットに順番付きで置く場合の数で、すべて同じ確率です。上限と確率は当サイトで計算し、ランダム平均は2,000回の平均です。',
          )}
        </p>
      </section>

      <section className="panel">
        <h3>{l('잠금 개수별 재설정 비용', 'Reset cost by locks', 'ロック数ごとのリセット費用')}</h3>
        <div className="table-scroll">
          <table className="detail-table">
            <thead>
              <tr>
                <th>{l('잠금', 'Locks', 'ロック')}</th>
                {resetCost.map((_, i) => (
                  <th key={i}>{i}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>{l('스텔라 포인트', 'Stellar Points', 'ステラポイント')}</th>
                {resetCost.map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="field-note">
          {l(
            '면적은 판 바깥에서 링크를 넘지 않고는 닿을 수 없는 영역 전체(교차로 생긴 가운데 공간 포함)를 정12각형 대비로 잰 값입니다. 게임은 서버에서 면적을 계산하므로 소수점 아래는 다를 수 있습니다.',
            'Area is everything the link closes off from the outside (including pockets made by crossings), as a share of the full 12-gon. The game computes it server-side, so decimals may differ.',
            '面積は盤面の外側からリンクを越えずに届かない領域全体(交差でできた中央も含む)を正十二角形に対する割合で表したものです。',
          )}
        </p>
      </section>
    </div>
  )
}
