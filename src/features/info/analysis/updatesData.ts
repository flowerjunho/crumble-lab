import type { Locale } from '../../../types'
import updatesJson from '../../../data/updates.json'

/**
 * 업데이트 일정·쿠폰(src/data/updates.json, scripts/import-eog-updates.mjs).
 * 데이터에는 날짜·시각·시즌 번호·코드·수량만 있고, 이름과 설명은 여기서 우리 말로 붙인다.
 * 국내 표기 확인: cc.team-hobby.com(?p=patchnotes 패치노트, ?p=schedule 뽑기 일정, 메뉴의 콘텐츠 이름),
 * 재화 이름은 상점 패키지 구성품 표기(스텔라 포인트·행운반죽·룬결정·용기의 불꽃·크리스탈·'코인 N시간 자동 사냥 보상')와 같다.
 */

export type ScheduleKind = 'update' | 'rift' | 'rumble' | 'arena' | 'guild'

export interface ScheduleEntry {
  key: string
  kind: ScheduleKind
  version?: string
  season?: number
  /** ISO 시각 */
  start: string
  end: string | null
}

export interface RiftSeason {
  season: number
  start: string
  end: string
  /** 단계 구성 묶음 번호 */
  pool: number
}

export interface Coupon {
  code: string
  /** 공개된 날(YYYY-MM-DD, KST) */
  added: string
  /** 만료 시각(ISO, +09:00) */
  expires: string
  rewards: { item: string; qty: number }[]
}

export interface UpdatesData {
  schedule: ScheduleEntry[]
  riftSeasons: RiftSeason[]
  coupons: Coupon[]
}

export const updates = updatesJson as unknown as UpdatesData

type Labels = Record<Locale, string>
const L = (ko: string, en: string, ja: string): Labels => ({ ko, en, ja })

/** 쿠폰 보상 아이템 이름(국내 인게임 표기) */
export const REWARD_ITEM: Record<string, Labels> = {
  crystal: L('크리스탈', 'Crystals', 'クリスタル'),
  flameOfBravery: L('용기의 불꽃', 'Flame of Bravery', '勇気の炎'),
  stellarPoint: L('스텔라 포인트', 'Stellar Points', 'ステラポイント'),
  luckyDough: L('행운반죽', 'Lucky Dough', 'ラッキー生地'),
  runeCrystal: L('룬결정', 'Rune Crystals', 'ルーン結晶'),
  autoHuntCoin1h: L('코인 1시간 자동 사냥 보상', '1-hour Auto Hunt reward (Coins)', 'コイン1時間自動狩り報酬'),
}

const days = (entry: { start: string; end: string | null }) => (entry.end ? Math.round((Date.parse(entry.end) - Date.parse(entry.start)) / 86_400_000) : null)

/** 일정 이름 */
export function scheduleName(entry: ScheduleEntry, locale: Locale): string {
  const t = (ko: string, en: string, ja: string) => (locale === 'ko' ? ko : locale === 'ja' ? ja : en)
  const n = entry.season ?? 0
  switch (entry.kind) {
    case 'update':
      return t(`${entry.version} 업데이트`, `v${entry.version} update`, `${entry.version}アップデート`)
    case 'rift':
      return t(`차원의 이면 시즌 ${n}`, `Dimension Season ${n}`, `次元の裏側 シーズン${n}`)
    case 'rumble':
      return t(`와글와글 아레나 시즌 ${n}`, `Rumble Arena Season ${n}`, `わいわいアリーナ シーズン${n}`)
    case 'arena':
      return t(`아레나 시즌 ${n}`, `Arena Season ${n}`, `アリーナ シーズン${n}`)
    case 'guild':
      return t('길드 토벌전 새 시즌', 'Guild Raid, new season', 'ギルド討伐戦 新シーズン')
  }
}

/** 업데이트별 주요 변경(국내 패치노트에서 확인한 사실을 우리 말로 정리) */
const UPDATE_NOTES: Record<string, Labels> = {
  '1.5': L(
    '샤르도네맛 쿠키가 추가되고 메인 스테이지가 새 지역 그레이프 디바인즈 수도원과 함께 364-30까지 늘어났습니다. 쿠키 최대 레벨은 120으로 오르고 노움 연구소에 111~130단 연구가 추가되었습니다.',
    'Adds Chardonnay Cookie and extends the main campaign to 364-30 with a new region. The Cookie level cap rises to 120 and the Gnome Lab gains research tiers 111–130.',
    'シャルドネ味クッキーが追加され、メインステージが新地域とともに364-30まで拡張されました。クッキーの最大レベルは120に上がり、ノーム研究所に111〜130段の研究が追加されました。',
  ),
}

/** 일정 한 줄 설명. 데이터에서 바로 나오는 기간과, 업데이트는 위의 정리를 쓴다. */
export function scheduleSummary(entry: ScheduleEntry, locale: Locale): string {
  const t = (ko: string, en: string, ja: string) => (locale === 'ko' ? ko : locale === 'ja' ? ja : en)
  const d = days(entry)
  const span = d ? t(`기간은 ${d}일입니다.`, `Runs ${d} days.`, `期間は${d}日です。`) : ''
  switch (entry.kind) {
    case 'update':
      return UPDATE_NOTES[entry.version ?? '']?.[locale] ?? t('정기 업데이트입니다.', 'Scheduled update.', '定期アップデートです。')
    case 'rift':
      return `${t('차원의 이면의 새 시즌이 시작됩니다.', 'A new Dimension season begins.', '次元の裏側の新シーズンが始まります。')} ${span}`.trim()
    case 'rumble':
      return `${t(`와글와글 아레나의 ${entry.season}번째 시즌입니다.`, `Rumble Arena season ${entry.season}.`, `わいわいアリーナの第${entry.season}シーズンです。`)} ${span}`.trim()
    case 'arena':
      return `${t(`아레나의 ${entry.season}번째 시즌입니다.`, `Arena season ${entry.season}.`, `アリーナの第${entry.season}シーズンです。`)} ${span}`.trim()
    case 'guild':
      return `${t('매주 돌아오는 길드 토벌전의 다음 시즌입니다.', 'The next weekly Guild Raid season.', '毎週のギルド討伐戦の次のシーズンです。')} ${span}`.trim()
  }
}

export type Phase = 'upcoming' | 'ongoing' | 'past'

/** 시작 전이면 예정, 끝나기 전이면 진행 중, 끝 시각이 없으면 시작 뒤 바로 지난 일정으로 본다. */
export function phaseOf(entry: { start: string; end: string | null }, now: number): Phase {
  if (now < Date.parse(entry.start)) return 'upcoming'
  if (entry.end && now < Date.parse(entry.end)) return 'ongoing'
  return 'past'
}

export interface ScheduleItem {
  key: string
  start: string
  end: string | null
  name: (locale: Locale) => string
  summary: (locale: Locale) => string
}

/**
 * 화면에 보여 줄 일정 목록. 업데이트 일정에 더해, 차원의 이면 시즌 표에서 지금 시즌과 다음 시즌 2개를 붙인다
 * (업데이트 일정에 이미 있는 시즌은 겹치지 않게 뺀다).
 */
export function scheduleItems(data: UpdatesData, now: number): ScheduleItem[] {
  const items: ScheduleItem[] = data.schedule.map((e) => ({ key: e.key, start: e.start, end: e.end, name: (l) => scheduleName(e, l), summary: (l) => scheduleSummary(e, l) }))
  const listed = new Set(data.schedule.filter((e) => e.kind === 'rift').map((e) => e.season))
  const currentIndex = data.riftSeasons.findIndex((s) => now < Date.parse(s.end))
  if (currentIndex >= 0) {
    for (const s of data.riftSeasons.slice(currentIndex, currentIndex + 3)) {
      if (listed.has(s.season)) continue
      const entry: ScheduleEntry = { key: `rift-s${s.season}`, kind: 'rift', season: s.season, start: s.start, end: s.end }
      items.push({ key: entry.key, start: entry.start, end: entry.end, name: (l) => scheduleName(entry, l), summary: (l) => scheduleSummary(entry, l) })
    }
  }
  return items.sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
}

/** 예정·진행 중·지난 일정으로 나눈다. 예정은 가까운 순, 지난 일정은 최근 순이다. */
export function splitSchedule<T extends { start: string; end: string | null }>(items: T[], now: number): Record<Phase, T[]> {
  const out: Record<Phase, T[]> = { upcoming: [], ongoing: [], past: [] }
  for (const item of items) out[phaseOf(item, now)].push(item)
  out.upcoming.sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  out.ongoing.sort((a, b) => Date.parse(a.end ?? a.start) - Date.parse(b.end ?? b.start))
  out.past.sort((a, b) => Date.parse(b.start) - Date.parse(a.start))
  return out
}

export const couponActive = (coupon: Coupon, now: number) => now < Date.parse(coupon.expires)

/** ISO 시각을 한국 시간으로: "2026-10-08 13:30" */
export function formatKst(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}
