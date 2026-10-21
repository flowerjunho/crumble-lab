/**
 * 스텔라 링크 계산.
 *
 * 별자리는 정12각형 판이고, 별조각 1→2→…→마지막→1 순서로 이은 링크가 감싼 넓이만큼 증폭이 붙는다.
 * 넓이는 판 바깥에서 링크를 넘지 않고는 닿을 수 없는 영역 전체이며(링크가 교차해 생긴 가운데 공간도 포함),
 * 정12각형 전체를 100%로 본다. 게임은 이 값을 서버가 계산하므로 여기 값은 같은 규칙으로 다시 계산한 추정치다.
 * 규칙 출처: crumblehelper.com 스텔라 링크 계산기 설명, cc.team-hobby.com 스텔라 링크 문서(적용 증폭 = 최대치 × 면적%).
 * 배치는 모든 경우가 같은 확률로 나온다(개발사 공지). 잠금 개수별 재설정 비용은 systems-data.json에 있다.
 */
export const SLOTS = 12

/** 슬롯 i의 단위원 위 좌표(12시 방향이 0번, 시계 방향으로 번호가 커진다). y는 위쪽이 +다. */
export const slotPoint = (i: number): [number, number] => {
  const angle = Math.PI / 2 - (2 * Math.PI * i) / SLOTS
  return [Math.cos(angle), Math.sin(angle)]
}

/** 정12각형 넓이(반지름 1) */
export const FULL_AREA = (SLOTS * Math.sin((2 * Math.PI) / SLOTS)) / 2

const EPS = 1e-9

export type Point = [number, number]

/** 순서대로 이은 닫힌 링크가 감싼 넓이(정12각형 대비 0~1) */
export function enclosedArea(order: number[]): number {
  const area = linkFaces(order).reduce((sum, face) => sum + face.area, 0)
  return Math.min(1, area / FULL_AREA)
}

/**
 * 닫힌 링크가 감싼 칸들(꼭짓점 목록과 넓이). 화면에 칠할 때와 넓이를 셀 때 같이 쓴다.
 * 선분이 만나는 점을 모두 꼭짓점으로 나눠 평면 그래프를 만들고, 유계 면(바깥과 이어지지 않은 칸)만 고른다.
 */
export function linkFaces(order: number[]): { points: Point[]; area: number }[] {
  if (order.length < 3) return []
  const pts = order.map(slotPoint)
  const segments: [Point, Point][] = pts.map((p, i) => [p, pts[(i + 1) % pts.length]!])

  const vertices: Point[] = []
  const vertexOf = (p: Point) => {
    const found = vertices.findIndex((v) => Math.abs(v[0] - p[0]) < EPS && Math.abs(v[1] - p[1]) < EPS)
    if (found >= 0) return found
    vertices.push(p)
    return vertices.length - 1
  }

  // 선분마다 위에 놓인 점(양 끝 + 다른 선분과 만나는 점)을 매개변수 t와 함께 모은다.
  const onSegment: { t: number; v: number }[][] = segments.map(([a, b]) => [
    { t: 0, v: vertexOf(a) },
    { t: 1, v: vertexOf(b) },
  ])
  for (let i = 0; i < segments.length; i++)
    for (let j = i + 1; j < segments.length; j++) {
      const [a, b] = segments[i]!
      const [c, d] = segments[j]!
      const rx = b[0] - a[0]
      const ry = b[1] - a[1]
      const sx = d[0] - c[0]
      const sy = d[1] - c[1]
      const cross = rx * sy - ry * sx
      if (Math.abs(cross) < 1e-12) continue
      const qx = c[0] - a[0]
      const qy = c[1] - a[1]
      const t = (qx * sy - qy * sx) / cross
      const u = (qx * ry - qy * rx) / cross
      if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) continue
      const v = vertexOf([a[0] + rx * t, a[1] + ry * t])
      onSegment[i]!.push({ t, v })
      onSegment[j]!.push({ t: u, v })
    }

  // 잘게 나눈 변을 중복 없이 모으고, 방향이 있는 반변 두 개로 만든다.
  const seen = new Set<string>()
  const from: number[] = []
  const to: number[] = []
  for (const list of onSegment) {
    list.sort((p, q) => p.t - q.t)
    for (let k = 0; k + 1 < list.length; k++) {
      const u = list[k]!.v
      const w = list[k + 1]!.v
      if (u === w) continue
      const key = u < w ? `${u}:${w}` : `${w}:${u}`
      if (seen.has(key)) continue
      seen.add(key)
      from.push(u, w)
      to.push(w, u)
    }
  }
  if (!from.length) return []
  const twin = (h: number) => h ^ 1
  const angle = from.map((u, h) => Math.atan2(vertices[to[h]!]![1] - vertices[u]![1], vertices[to[h]!]![0] - vertices[u]![0]))

  // 꼭짓점마다 나가는 반변을 각도 순으로 정렬한다.
  const outgoing = new Map<number, number[]>()
  from.forEach((u, h) => outgoing.set(u, [...(outgoing.get(u) ?? []), h]))
  const rank = new Array<number>(from.length)
  for (const list of outgoing.values()) {
    list.sort((p, q) => angle[p]! - angle[q]!)
    list.forEach((h, i) => (rank[h] = i))
  }
  // 도착한 꼭짓점에서 되돌아가는 반변 바로 앞(시계 방향 다음) 반변으로 이어 가면, 유계 면은 반시계 방향으로 돈다.
  const next = (h: number) => {
    const list = outgoing.get(to[h]!)!
    return list[(rank[twin(h)]! - 1 + list.length) % list.length]!
  }

  const visited = new Uint8Array(from.length)
  const faces: { points: Point[]; area: number }[] = []
  for (let start = 0; start < from.length; start++) {
    if (visited[start]) continue
    let h = start
    let signed = 0
    let guard = 0
    const points: Point[] = []
    do {
      visited[h] = 1
      const p = vertices[from[h]!]!
      const q = vertices[to[h]!]!
      points.push(p)
      signed += p[0] * q[1] - q[0] * p[1]
      h = next(h)
    } while (h !== start && ++guard <= from.length)
    // 바깥 면은 시계 방향이라 음수가 된다.
    if (signed > 1e-12) faces.push({ points, area: signed / 2 })
  }
  return faces
}

/** 순서 없는 슬롯 묶음을 둘레 순서로 이은 볼록 다각형의 넓이(정12각형 대비) */
function convexArea(slots: number[]): number {
  const sorted = [...slots].sort((a, b) => a - b)
  let twice = 0
  for (let i = 0; i < sorted.length; i++) {
    const [x1, y1] = slotPoint(sorted[i]!)
    const [x2, y2] = slotPoint(sorted[(i + 1) % sorted.length]!)
    twice += x1 * y2 - x2 * y1
  }
  return Math.abs(twice) / 2 / FULL_AREA
}

function combinations(n: number, k: number): number[][] {
  const out: number[][] = []
  const pick: number[] = []
  const walk = (start: number) => {
    if (pick.length === k) return void out.push([...pick])
    for (let i = start; i < n; i++) {
      pick.push(i)
      walk(i + 1)
      pick.pop()
    }
  }
  walk(0)
  return out
}

/** nPk: 12칸에 별조각 k개를 순서 있게 놓는 경우의 수(개발사가 공개한 배치 경우의 수와 같다) */
export function placements(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let out = 1
  for (let i = 0; i < k; i++) out *= n - i
  return out
}

export interface Ceiling {
  /** 이 별조각 수로 낼 수 있는 최대 면적(0~1) */
  area: number
  /** 최대 면적을 내는 순서 있는 배치 전부 */
  layouts: number[][]
}

const ceilingCache = new Map<number, Ceiling>()

/**
 * 별조각 n개의 상한. 넓이가 가장 큰 배치는 언제나 꼬이지 않은 볼록 다각형이므로,
 * 최대 넓이 슬롯 묶음마다 시작점(n가지)과 방향(2가지)을 바꾼 배치가 모두 상한 배치다.
 */
export function ceiling(n: number): Ceiling {
  const cached = ceilingCache.get(n)
  if (cached) return cached
  if (n < 3) return { area: 0, layouts: [] }
  let best = -1
  let sets: number[][] = []
  for (const set of combinations(SLOTS, n)) {
    const area = convexArea(set)
    if (area > best + EPS) {
      best = area
      sets = [set]
    } else if (Math.abs(area - best) <= EPS) sets.push(set)
  }
  const layouts: number[][] = []
  for (const set of sets)
    for (let start = 0; start < n; start++)
      for (const dir of [1, -1]) layouts.push(Array.from({ length: n }, (_, i) => set[(((start + dir * i) % n) + n) % n]!))
  const result = { area: Math.min(1, best), layouts }
  ceilingCache.set(n, result)
  return result
}

/**
 * 잠근 별조각(번호 → 슬롯)은 그대로 두고 나머지를 다시 뿌렸을 때 상한 배치가 나올 확률.
 * 나머지 조각은 빈 슬롯에 순서 있게 무작위로 들어가므로 전체 경우의 수는 (12−잠금)P(n−잠금)이다.
 */
export function ceilingChance(n: number, locked: Map<number, number>): { ways: number; total: number; chance: number } {
  const { layouts } = ceiling(n)
  let ways = 0
  for (const layout of layouts) if ([...locked].every(([shard, slot]) => layout[shard] === slot)) ways++
  const total = placements(SLOTS - locked.size, n - locked.size)
  return { ways, total, chance: total ? ways / total : 0 }
}

/** 잠근 조각은 두고 나머지 조각을 빈 슬롯에 무작위로 다시 놓는다(재설정 한 번). */
export function reshuffle(order: number[], locked: Set<number>, random: () => number = Math.random): number[] {
  const taken = new Set(order.filter((_, i) => locked.has(i)))
  const free = Array.from({ length: SLOTS }, (_, i) => i).filter((i) => !taken.has(i))
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[free[i], free[j]] = [free[j]!, free[i]!]
  }
  let k = 0
  return order.map((slot, i) => (locked.has(i) ? slot : free[k++]!))
}

/** 같은 결과를 다시 볼 수 있게 씨앗값을 받는 난수(mulberry32) */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 무작위 배치 samples번의 평균 면적(같은 씨앗이면 같은 값) */
export function averageArea(n: number, samples = 4000, seed = 12): number {
  if (n < 3) return 0
  const random = seededRandom(seed + n)
  const base = Array.from({ length: n }, (_, i) => i)
  let sum = 0
  for (let i = 0; i < samples; i++) sum += enclosedArea(reshuffle(base, new Set(), random))
  return sum / samples
}

/**
 * 별자리별 공격력·방어력·체력 증폭 최대치(면적 100% 기준, %). 실제 적용값 = 최대치 × 면적.
 * 출처: cc.team-hobby.com/?p=stellar (2026-10-21 확인). 별자리마다 별조각은 최대 12개다.
 */
export const CONSTELLATION_MAX_AMP = [20, 30, 40, 50, 60, 80, 100, 130, 160, 200] as const
