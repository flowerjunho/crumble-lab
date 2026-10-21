import type { Locale } from '../../../types'
import type { CurrencyKey, PackageCategory, ShopPackage, ValueAssumptions } from './systemsData'

/**
 * 패키지 가치 계산. 구성품을 모두 크리스탈로 바꾼 뒤 가격으로 나눈다.
 * 재화별 환산값은 게임이 공개한 값이 아니라 가정이므로 화면에서 바꿀 수 있게 한다.
 * 재화 이름은 국내 상점 표기(cc.team-hobby.com 상점·아이템 목록)를 쓴다.
 */
type Labels = Record<Locale, string>
const L = (ko: string, en: string, ja: string): Labels => ({ ko, en, ja })

export const CURRENCY: Record<CurrencyKey, Labels> = {
  diamonds: L('크리스탈', 'Crystals', 'クリスタル'),
  pickupCookie: L('픽업 쿠키커터', 'Pick-up Cookie Cutter', 'ピックアップクッキーカッター'),
  cookie: L('고급 쿠키커터', 'Premium Cookie Cutter', '高級クッキーカッター'),
  pickupPet: L('픽업 펫 뽑기권', 'Pick-up Pet Ticket', 'ピックアップペットチケット'),
  pet: L('고급 펫 뽑기권', 'Premium Pet Ticket', '高級ペットチケット'),
  flames: L('용기의 불꽃', 'Flame of Bravery', '勇気の炎'),
  ssrCookie: L('SSR 쿠키', 'SSR Cookie', 'SSRクッキー'),
  ssrPet: L('SSR 펫', 'SSR Pet', 'SSRペット'),
  srCookie: L('SR 쿠키', 'SR Cookie', 'SRクッキー'),
  tssrCookie: L('TSSR 쿠키', 'TSSR Cookie', 'TSSRクッキー'),
  luckyDough: L('행운반죽', 'Lucky Dough', 'ラッキー生地'),
  runeCrystal: L('룬결정', 'Rune Crystals', 'ルーン結晶'),
  stellarPoint: L('스텔라 포인트', 'Stellar Points', 'ステラポイント'),
}

export const CATEGORY: Record<PackageCategory, Labels> = {
  standing: L('상시', 'Standing', '常設'),
  hotDeal: L('특가', 'Hot deal', '特価'),
  pass: L('패스', 'Pass', 'パス'),
  weekly: L('주간', 'Weekly', '週間'),
  blessing: L('단계형(Lv.1~5)', 'Sweet Blessing', 'スイートブレッシング'),
  membership: L('멤버십·영구', 'Membership', 'メンバーシップ'),
  update: L('1.5 업데이트', 'v1.5 update', '1.5アップデート'),
}
export const CATEGORY_ORDER: PackageCategory[] = ['update', 'standing', 'weekly', 'hotDeal', 'pass', 'blessing', 'membership']

/** 재화 1개가 크리스탈 몇 개인지 */
export function crystalRates(a: ValueAssumptions): Record<CurrencyKey, number> {
  return {
    diamonds: 1,
    pickupCookie: a.cookieDraw,
    cookie: a.cookieDraw,
    pickupPet: a.petDraw,
    pet: a.petDraw,
    flames: a.flame,
    ssrCookie: a.ssrCookieDraws * a.cookieDraw,
    ssrPet: a.ssrPetDraws * a.petDraw,
    // SR 쿠키는 따로 값을 매길 근거가 없어 쿠키 뽑기 1회로 친다(실제보다 낮게 잡힌다).
    srCookie: a.cookieDraw,
    tssrCookie: a.tssrCookieFlames * a.flame,
    luckyDough: a.luckyDough,
    runeCrystal: a.runeCrystal,
    stellarPoint: a.stellarPoint,
  }
}

export interface ValueLine {
  key: CurrencyKey
  qty: number
  /** 1개당 크리스탈 */
  unit: number
  worth: number
  counted: boolean
}

export interface PackageValue {
  pack: ShopPackage
  lines: ValueLine[]
  /** 센 재화만 더한 크리스탈 */
  total: number
  /** 1,000원당 크리스탈 */
  per1000: number
}

/** counted에 없는 재화는 표에는 보여 주되 합계에서 뺀다. */
export function valuePackage(pack: ShopPackage, rates: Record<CurrencyKey, number>, counted: ReadonlySet<CurrencyKey>, order: CurrencyKey[]): PackageValue {
  const lines: ValueLine[] = []
  let total = 0
  for (const key of order) {
    const qty = pack.contents[key]
    if (!qty) continue
    const unit = rates[key]
    const worth = qty * unit
    const isCounted = counted.has(key)
    if (isCounted) total += worth
    lines.push({ key, qty, unit, worth, counted: isCounted })
  }
  return { pack, lines, total, per1000: pack.priceKRW > 0 ? (total / pack.priceKRW) * 1000 : 0 }
}

export type SortKey = 'per1000' | 'price' | 'total'

export function sortValues(values: PackageValue[], key: SortKey, desc: boolean): PackageValue[] {
  const get = (v: PackageValue) => (key === 'price' ? v.pack.priceKRW : key === 'total' ? v.total : v.per1000)
  return [...values].sort((a, b) => (desc ? get(b) - get(a) : get(a) - get(b)) || a.pack.priceKRW - b.pack.priceKRW)
}

export function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** 화면에 보여 줄 이름. 국내 이름이 없으면 영문 이름을 쓴다. */
export const packageName = (pack: ShopPackage, locale: Locale) => (locale === 'ko' && pack.nameKo) || pack.nameEn
