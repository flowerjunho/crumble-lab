/**
 * 빌드(라인업 12칸 + 펫 3마리 + 레벨·별 + 칸별 슈가룬)를 주소에 담을 짧은 문자열로 바꾸고 되돌린다.
 *
 * 쿠키는 eid의 숫자(cookie4011 → 4011)를, 펫은 게임 ID를 36진수로 줄여 적는다.
 * 쿠키 도감의 정렬 순서는 새 쿠키가 나올 때마다 바뀌어서 순번 대신 바뀌지 않는 ID를 쓴다.
 */
import { readStorage, writeStorage } from '../../../lib/storage'
import { EMPTY_LOADOUT, LOADOUT_KEYS, PET_SLOTS, SQUAD_SIZE, type Loadout } from './damage'

export interface BuildPet {
  id: number
  star: number
}

export interface BuildState {
  /** 칸 순서대로 쿠키 eid. 빈칸은 null. 길이는 항상 SQUAD_SIZE */
  cookies: (string | null)[]
  /** 길이는 항상 PET_SLOTS */
  pets: (BuildPet | null)[]
  level: number
  grade: number
  /** 칸 번호(0부터) → 슈가룬 */
  loadouts: Record<number, Partial<Loadout>>
}

export const emptyBuild = (): BuildState => ({
  cookies: Array.from({ length: SQUAD_SIZE }, () => null),
  pets: Array.from({ length: PET_SLOTS }, () => null),
  level: 120,
  grade: 10,
  loadouts: {},
})

const clampInt = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)))
const toNumber = (text: string | undefined) => {
  const value = Number(text)
  return text !== undefined && text !== '' && Number.isFinite(value) ? value : null
}

/** 쿠키 eid → 주소 조각. 'cookie4011' → '33n' */
export const encodeEid = (eid: string) => {
  const n = Number(/^cookie(\d+)$/.exec(eid)?.[1])
  return Number.isFinite(n) ? n.toString(36) : ''
}
/** 주소 조각 → 쿠키 eid. 숫자를 네 자리로 맞춘다('a' → cookie0010). */
export const decodeEid = (text: string) => {
  const n = parseInt(text, 36)
  return /^[0-9a-z]+$/.test(text) && Number.isFinite(n) && n >= 0 ? `cookie${String(n).padStart(4, '0')}` : null
}

/** 슈가룬 값 목록. 뒤쪽의 0은 지운다. 음수는 받지 않는다. */
function encodeLoadout(loadout: Partial<Loadout>): string {
  const values = LOADOUT_KEYS.map((key) => {
    const v = loadout[key]
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Number(v.toFixed(2)) : 0
  })
  while (values.length && values[values.length - 1] === 0) values.pop()
  return values.join('-')
}
function decodeLoadout(text: string): Partial<Loadout> {
  const out: Partial<Loadout> = {}
  text.split('-').forEach((part, i) => {
    const key = LOADOUT_KEYS[i]
    const value = toNumber(part)
    if (key && value !== null && value > 0) out[key] = value
  })
  return out
}

/** 빌드 → 주소 쿼리(URLSearchParams). 기본값과 같은 항목은 넣지 않는다. */
export function encodeBuild(build: BuildState): URLSearchParams {
  const params = new URLSearchParams()
  const slots = build.cookies.map((eid) => (eid ? encodeEid(eid) : ''))
  while (slots.length && !slots[slots.length - 1]) slots.pop()
  if (slots.length) params.set('c', slots.join('.'))
  const pets = build.pets.map((pet) => (pet ? `${pet.id.toString(36)}*${pet.star}` : ''))
  while (pets.length && !pets[pets.length - 1]) pets.pop()
  if (pets.length) params.set('p', pets.join('.'))
  if (build.level !== 120) params.set('lv', String(build.level))
  if (build.grade !== 10) params.set('st', String(build.grade))
  const runes = Object.entries(build.loadouts)
    .filter(([slot]) => build.cookies[Number(slot)])
    .map(([slot, loadout]) => [slot, encodeLoadout(loadout)] as const)
    .filter(([, text]) => text)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([slot, text]) => `${slot}~${text}`)
  if (runes.length) params.set('r', runes.join('_'))
  return params
}

/** 주소 쿼리 → 빌드. 망가진 조각은 빈칸으로 두고 나머지는 살린다. */
export function decodeBuild(params: URLSearchParams): BuildState {
  const build = emptyBuild()
  ;(params.get('c') ?? '')
    .split('.')
    .slice(0, SQUAD_SIZE)
    .forEach((text, i) => {
      build.cookies[i] = text ? decodeEid(text) : null
    })
  ;(params.get('p') ?? '')
    .split('.')
    .slice(0, PET_SLOTS)
    .forEach((text, i) => {
      const [id36, star] = text.split('*')
      const id = id36 && /^[0-9a-z]+$/.test(id36) ? parseInt(id36, 36) : NaN
      build.pets[i] = Number.isFinite(id) ? { id, star: clampInt(toNumber(star) ?? 5, 1, 5) } : null
    })
  const level = toNumber(params.get('lv') ?? undefined)
  const grade = toNumber(params.get('st') ?? undefined)
  if (level !== null) build.level = clampInt(level, 1, 120)
  if (grade !== null) build.grade = clampInt(grade, 0, 10)
  for (const chunk of (params.get('r') ?? '').split('_')) {
    const [slotText, values] = chunk.split('~')
    const slot = toNumber(slotText)
    if (slot === null || !Number.isInteger(slot) || slot < 0 || slot >= SQUAD_SIZE || !values) continue
    const loadout = decodeLoadout(values)
    if (Object.keys(loadout).length) build.loadouts[slot] = loadout
  }
  return build
}

/** 칸의 슈가룬(없으면 빈 값) */
export const loadoutAt = (build: BuildState, slot: number): Loadout => ({ ...EMPTY_LOADOUT, ...build.loadouts[slot] })

// ---------------------------------------------------------------------------
// 저장(브라우저 localStorage)
// ---------------------------------------------------------------------------

export const SAVED_BUILDS_KEY = 'crumble.calc.builds'
export const MAX_SAVED_BUILDS = 30

export interface SavedBuild {
  name: string
  /** encodeBuild 결과 문자열 */
  code: string
  savedAt: string
}

/** 저장된 빌드 목록. 형식이 어긋난 항목은 버린다. */
export function readSavedBuilds(): SavedBuild[] {
  try {
    const parsed: unknown = JSON.parse(readStorage(SAVED_BUILDS_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is SavedBuild => Boolean(item) && typeof item.name === 'string' && typeof item.code === 'string' && typeof item.savedAt === 'string',
    )
  } catch {
    return []
  }
}

/** 같은 이름이면 덮어쓰고, 최신 저장이 맨 앞에 오게 한다. */
export function saveBuild(name: string, build: BuildState, now = new Date()): SavedBuild[] {
  const entry: SavedBuild = { name: name.trim() || now.toLocaleString(), code: encodeBuild(build).toString(), savedAt: now.toISOString() }
  const next = [entry, ...readSavedBuilds().filter((item) => item.name !== entry.name)].slice(0, MAX_SAVED_BUILDS)
  writeStorage(SAVED_BUILDS_KEY, JSON.stringify(next))
  return next
}

export function deleteSavedBuild(name: string): SavedBuild[] {
  const next = readSavedBuilds().filter((item) => item.name !== name)
  writeStorage(SAVED_BUILDS_KEY, JSON.stringify(next))
  return next
}
