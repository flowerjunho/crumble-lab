#!/usr/bin/env node
/**
 * 용병단·스텔라 링크·패키지 가치 화면의 데이터(src/features/info/systems/systems-data.json)를 만든다.
 *
 * - 용병단: 레벨별 특전 슬롯·펫 슬롯·리더 효과, 특전의 발동 조건·대상·효과 수치(EOG.GG가 게임 클라이언트에서 읽은 값)
 * - 스텔라 링크: 잠금 개수별 재설정 비용(EOG 기록값, crumblehelper.com 표와 같은지 확인함)
 * - 패키지: 가격과 구성품(EOG가 인게임 상점에서 기록한 목록). 국내 이름과 구성품 보정은 아래 표(cc.team-hobby.com 상점 목록 대조)를 쓴다.
 * EOG가 직접 쓴 설명문·추천·평가와 영어 특전 설명 문구는 가져오지 않는다. 받아 온 JS는 실행하지 않는다.
 *
 * 사용법
 *   node scripts/import-eog-systems.mjs            # EOG 페이지에서 최신 번들을 받아 만든다
 *   node scripts/import-eog-systems.mjs <crc.js>   # 이미 받아 둔 크럼블 번들로 만든다
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readLiteralAt, readNamedLiteral } from './js-literal.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EOG_PAGE = 'https://eog.gg/games/cookierun-crumble/'
const OUT = 'src/features/info/systems/systems-data.json'

const fail = (message) => {
  throw new Error(message)
}

async function loadMainBundle(path) {
  if (path) return { url: path, text: await readFile(path, 'utf8') }
  const page = await (await fetch(EOG_PAGE)).text()
  const url = new URL(page.match(/\/assets\/cookierunCrumble-[\w-]+\.js/)?.[0] ?? fail('크럼블 번들을 찾지 못했습니다.'), EOG_PAGE).href
  return { url, text: await (await fetch(url)).text() }
}

const { url, text } = await loadMainBundle(process.argv[2])

/** 변수 이름은 빌드마다 바뀌므로 내용의 시작 모양으로 찾는다. */
function literalByPattern(pattern, what) {
  const m = new RegExp(`[,;{\\s]([A-Za-z_$][\\w$]*)=(?=${pattern})`).exec(text) ?? fail(`${what}를 찾지 못했습니다.`)
  return readNamedLiteral(text, m[1], pattern)
}

// ── 용병단 ─────────────────────────────────────────────
const levelsRaw = literalByPattern('\\[\\{level:0,name:"[^"]+",perkSlots:', '용병단 레벨 표')
const perksRaw = literalByPattern('\\[\\{id:\\d+,name:"[^"]+",description:"[^"]*",unlockedAt:', '용병단 특전 목록')

const ROLE = { ATTACKER: 'charge', TANKER: 'tank', SUPPORTER: 'support', SHOOTER: 'ranged' }
// EOG 효과 → 우리 키. how: pct(능력치의 %), rate(%p 더하기), flat(수치 더하기), screen(받는 피해를 걸러 냄)
const STAT = {
  'atk:pct': ['atk', 'pct'],
  'def:pct': ['def', 'pct'],
  'hp:pct': ['hp', 'pct'],
  'elementDamage:rate': ['elementDamage', 'rate'],
  'haste:flat': ['haste', 'flat'],
  'damageReduction:screen': ['damageReduction', 'screen'],
  'speed:flat': ['moveSpeed', 'flat'],
}
const SELECT = new Set(['NONE', 'COMBAT_POWER_TOP', 'COMBAT_PROPERTY_TOP', 'COMBAT_PROPERTY_BOTTOM'])
const PROPERTY = { NONE: null, ATTACK_POINT: 'atk', HEALTH_POINT: 'hp' }
const effectOf = (owner) => (effect) => {
  const mapped = STAT[`${effect.stat}:${effect.how}`] ?? fail(`${owner}: 모르는 효과 ${effect.stat}:${effect.how}`)
  return { stat: mapped[0], how: mapped[1], value: effect.value }
}

const perks = perksRaw.map((perk) => {
  const { condition: c, filter: f } = perk
  if (!['NONE', 'ROLE_COUNT', 'ELEMENT_MAX_COUNT'].includes(c.type)) fail(`${perk.name}: 모르는 조건 ${c.type}`)
  if (c.type === 'ROLE_COUNT' && c.operator !== 'GREATER') fail(`${perk.name}: 모르는 비교 ${c.operator}`)
  if (!SELECT.has(f.select)) fail(`${perk.name}: 모르는 대상 선택 ${f.select}`)
  if (!(f.property in PROPERTY)) fail(`${perk.name}: 모르는 기준 능력치 ${f.property}`)
  if (f.elements.length) fail(`${perk.name}: 속성 대상 조건은 아직 다루지 않습니다.`)
  if (perk.notModelled?.length) fail(`${perk.name}: 수치가 없는 효과가 있습니다.`)
  return {
    id: perk.id,
    nameEn: perk.name,
    unlockedAt: perk.unlockedAt,
    condition:
      c.type === 'ROLE_COUNT'
        ? // GREATER 4는 '5명 이상'이다(게임 데이터의 비교는 초과).
          { type: 'roleCount', role: ROLE[c.role] ?? fail(`${perk.name}: 모르는 직업 ${c.role}`), min: c.value + 1 }
        : c.type === 'ELEMENT_MAX_COUNT'
          ? { type: 'elementMaxCount' }
          : { type: 'none' },
    target: {
      select: { NONE: 'all', COMBAT_POWER_TOP: 'powerTop', COMBAT_PROPERTY_TOP: 'statTop', COMBAT_PROPERTY_BOTTOM: 'statBottom' }[f.select],
      stat: PROPERTY[f.property],
      count: f.count ?? null,
      roles: f.roles.map((role) => ROLE[role] ?? fail(`${perk.name}: 모르는 직업 ${role}`)),
    },
    effects: perk.effects.map(effectOf(perk.name)),
  }
})

const perkIds = new Set(perks.map((p) => p.id))
const levels = levelsRaw.map((level, index) => {
  if (level.level !== index) fail('용병단 레벨이 0부터 차례대로가 아닙니다.')
  for (const id of level.perks) {
    if (!perkIds.has(id)) fail(`레벨 ${level.level}: 없는 특전 ${id}`)
    if (perks.find((p) => p.id === id).unlockedAt !== level.level) fail(`레벨 ${level.level}: 특전 ${id}의 해금 레벨이 다릅니다.`)
  }
  return {
    level: level.level,
    nameEn: level.name,
    perkSlots: level.perkSlots,
    petSlots: level.petSlots,
    leader: level.leader.map(effectOf(`레벨 ${level.level} 리더`)),
  }
})

// ── 스텔라 링크 재설정 비용 ───────────────────────────────
// 슬롯 12칸·잠금 최대 6개 다음에 잠금 0~6개의 재설정 비용 배열이 온다.
const resetMatch = /[,;{\s][\w$]+=12,[\w$]+=6,[\w$]+=(?=\[10,)/.exec(text) ?? fail('스텔라 링크 재설정 비용을 찾지 못했습니다.')
const resetCost = readLiteralAt(text, resetMatch.index + resetMatch[0].length).value
if (resetCost.length !== 7 || resetCost.some((v) => typeof v !== 'number')) fail('재설정 비용 배열 모양이 다릅니다.')

// ── 패키지 ──────────────────────────────────────────────
const packagesRaw = literalByPattern('\\[\\{id:"package-\\d+",name:"[^"]+",category:"[^"]+",priceKRW:', '패키지 목록')
const currencyKeys = literalByPattern('\\[\\{key:"diamonds",label:', '재화 목록').map((c) => c.key)
const v15Raw = literalByPattern('\\[\\{group:"Regular",name:"[^"]+",priceKrw:', '1.5 패키지 목록')

// EOG가 쓴 환산 가정값. 게임이 공개한 값이 아니라 화면에서 '가정'으로 보여 주고 바꿀 수 있게 한다.
const draw = /[,;{\s][\w$]+=(?=\{cookieDraw:)/.exec(text) ?? fail('환산 가정값을 찾지 못했습니다.')
const base = readLiteralAt(text, draw.index + draw[0].length).value
const guarantee = /[,;{\s][\w$]+=(?=\{ssrCookieDraws:)/.exec(text) ?? fail('확정 쿠키 환산값을 찾지 못했습니다.')
const pity = readLiteralAt(text, guarantee.index + guarantee[0].length).value
for (const key of ['cookieDraw', 'petDraw', 'flame', 'luckyDough', 'runeCrystal', 'stellarPoint']) if (typeof base[key] !== 'number') fail(`환산값 ${key}가 없습니다.`)
for (const key of ['ssrCookieDraws', 'ssrPetDraws', 'tssrCookieFlames']) if (typeof pity[key] !== 'number') fail(`확정 환산값 ${key}가 없습니다.`)
const rates = {
  diamonds: 1,
  pickupCookie: base.cookieDraw,
  cookie: base.cookieDraw,
  pickupPet: base.petDraw,
  pet: base.petDraw,
  flames: base.flame,
  ssrCookie: pity.ssrCookieDraws * base.cookieDraw,
  ssrPet: pity.ssrPetDraws * base.petDraw,
  srCookie: base.cookieDraw,
  tssrCookie: pity.tssrCookieFlames * base.flame,
  luckyDough: base.luckyDough,
  runeCrystal: base.runeCrystal,
  stellarPoint: base.stellarPoint,
}
for (const key of currencyKeys) if (!(key in rates)) fail(`환산값이 없는 재화: ${key}`)

/**
 * 국내 상점 이름(cc.team-hobby.com/?p=shop 전체 목록, 2026-10-21 확인)과 구성품 보정.
 * contents가 있으면 국내 목록에서 센 값으로 EOG 구성품을 바꾼다(EOG 목록이 빠뜨린 구성품이 있던 패키지).
 * 이름이 없는 패키지는 국내 이름을 확인하지 못한 것이다.
 */
const KO = {
  'package-17': { ko: '크럼블 용병단도 놀랄 초초초 가성비 패키지 Vol.1', contents: { diamonds: 3000, cookie: 60, srCookie: 1 } },
  'package-10': { ko: '바삭, 박살, 크럼블! 크럼블 스타터 패키지', contents: { pickupCookie: 60, cookie: 60, srCookie: 1, luckyDough: 50 } },
  'package-07': { ko: '차원문 너머에서 찾아온 쿠키 등장! 오븐방랑자 쿠키 출시 기념 패키지' },
  'package-02': { ko: '월간 보상 슈가코팅 멤버십' },
  'package-08': { ko: '쿠키와 펫이 와글와글! 런칭 기념 대량 획득 패키지 Vol.1' },
  'package-26': { ko: '모두에게 지원! 길드 골든벨 패키지 Vol.1' },
  'package-56': { ko: '광고 영구 제거권', contents: { diamonds: 2000, cookie: 90, pet: 90 } },
  'package-03': { ko: '밀키웨이맛 쿠키 등장 기념! 픽업 뽑기 패키지' },
  'package-16': { ko: '5일 출석 패키지', contents: { diamonds: 8000, pickupCookie: 120, cookie: 60, luckyDough: 100, runeCrystal: 1000 } },
  'package-05': { ko: '오븐방랑자 쿠키 러쉬 패키지 Vol.1' },
  'package-18': { ko: '크럼블 용병단도 놀랄 초초초 가성비 패키지 Vol.2' },
  'package-27': { ko: '모두에게 지원! 길드 골든벨 패키지 Vol.2' },
  'package-01': { ko: '월간 뽑기 지원 슈가코팅 멤버십' },
  'package-12': { ko: '픽업 펫 뽑기 패키지' },
  'package-06': { ko: '오븐방랑자 쿠키 러쉬 패키지 Vol.2' },
  'package-09': { ko: 'SSR 쿠키 확정! 런칭 기념 대량 획득 패키지 Vol.2' },
  'package-22': { ko: '펫 모두 모여! 펫 뽑기 패키지' },
  'package-04': { ko: '크럼블 출시 축하 7일 출석 패키지', contents: { diamonds: 27000, pickupCookie: 60, pet: 60, flames: 3000, luckyDough: 200 } },
  'package-13': { ko: '밀키웨이맛 쿠키 등장 기념! 픽업 뽑기 플러스 패키지' },
  'package-23': { ko: '쿠키 모두 모여! 쿠키 뽑기 패키지' },
  'package-28': { ko: '모두에게 지원! 길드 골든벨 패키지 Vol.3' },
  'package-20': { ko: 'SSR 쿠키&펫 랜덤 패키지 Vol.1', contents: { diamonds: 9000, ssrCookie: 1, ssrPet: 1 } },
  'package-24': { ko: '우주 설탕노움 추천! 스텔라 링크 패키지 Vol.1' },
  'package-11': { ko: '파랗게 불태웠어… 크리스탈 대박 패키지' },
  'package-57': { ko: '평생 성장 지원 슈가코팅 멤버십' },
  'package-14': { ko: '용기의 불꽃 대량 지원 패키지 Vol.1', contents: { diamonds: 9000, pickupCookie: 60, flames: 18000, luckyDough: 200 } },
  'package-19': { ko: '크리스탈 초대박 패키지' },
  'package-31': { ko: '돌려돌려 룬결정 패키지 Vol.1' },
  'package-15': { ko: '용기의 불꽃 대량 지원 패키지 Vol.2', contents: { diamonds: 12000, pickupCookie: 120, flames: 24000, runeCrystal: 500 } },
  'package-21': { ko: 'SSR 쿠키&펫 랜덤 패키지 Vol.2', contents: { diamonds: 18000, ssrCookie: 2, ssrPet: 2 } },
  'package-30': { ko: '초코왕방울의 특별 지원 종합 패키지' },
  'package-58': { ko: '평생 스페셜 슈가코팅 멤버십' },
  'package-29': { ko: '황금갓방울의 찬란한 축복 패키지', contents: { diamonds: 30000, pickupCookie: 240, runeCrystal: 15000, stellarPoint: 1000 } },
  'package-32': { ko: '돌려돌려 룬결정 패키지 Vol.2' },
  'package-25': { ko: '우주 설탕노움 추천! 스텔라 링크 패키지 Vol.2' },
}
const CATEGORY = { Standing: 'standing', 'Hot deal': 'hotDeal', Pass: 'pass', Weekly: 'weekly', Blessing: 'blessing', 'One-off': 'membership' }

const checkContents = (owner, contents) => {
  for (const [key, qty] of Object.entries(contents)) if (!currencyKeys.includes(key) || typeof qty !== 'number') fail(`${owner}: 모르는 구성품 ${key}`)
  return contents
}
const packages = packagesRaw.map((p) => {
  const ko = KO[p.id]
  if (!(p.category in CATEGORY)) fail(`${p.name}: 모르는 분류 ${p.category}`)
  return {
    id: p.id,
    nameEn: p.name,
    nameKo: ko?.ko ?? null,
    category: CATEGORY[p.category],
    priceKRW: p.priceKRW,
    contents: checkContents(p.name, ko?.contents ?? p.contents),
    corrected: Boolean(ko?.contents),
    recurring: Boolean(p.recurring),
  }
})
for (const id of Object.keys(KO)) if (!packages.some((p) => p.id === id)) fail(`EOG 목록에 없는 패키지: ${id}`)

// 1.5 업데이트 패키지: 구성품이 이름으로 적혀 있어 재화 키와 국내 이름으로 바꾼다.
const V15_KO = {
  'Chardonnay Cookie Welcome Package': '샤르도네맛 쿠키 웰컴 패키지',
  'Chardonnay Cookie Pick-up Celebration Package Vol.1': '샤르도네맛 쿠키 픽업 기념 패키지 Vol.1',
  'Chardonnay Cookie Pick-up Celebration Package Vol.2': '샤르도네맛 쿠키 픽업 기념 패키지 Vol.2',
  'Princess Bari Cookie’s Endless Guidance Package': '바리공주맛 쿠키의 끝나지 않는 인도 패키지',
  'One More Time! Stage Support Package': '다시 한 번 더! 스테이지 지원 패키지',
  'On to New Stages! Update Celebration Package Vol.1': '새로운 스테이지로! 업데이트 기념 패키지 Vol.1',
  'On to New Stages! Update Celebration Package Vol.2': '새로운 스테이지로! 업데이트 기념 패키지 Vol.2',
  'Rune Crystals and Stellar Point Bundle': '룬결정&스텔라 포인트 종합 패키지',
  'Rumble Arena Season 2 Support Package': '와글와글 아레나 시즌 2 지원 패키지',
  'Special Thanks! Plating Pack': '플레이트 강화 특별 감사 패키지',
}
const ITEM_KEY = {
  Crystals: 'diamonds',
  'Pick-up Cookie Cutter': 'pickupCookie',
  'Premium Cookie Cutter': 'cookie',
  'Pick-up Pet Ticket': 'pickupPet',
  'Premium Pet Ticket': 'pet',
  'Stellar Point': 'stellarPoint',
  'Rune Crystals': 'runeCrystal',
}
// 환산하지 않는 구성품의 국내 이름(cc.team-hobby.com 상점·아이템 목록)
const ITEM_KO = { 'Wisp of Guidance': '인도의 혼불', 'Metal Syrup': '시럽쇳물', Chocosteel: '초코강', 'Rumble Arena Ticket': '와글와글 아레나 입장권' }
const AUTO_HUNT = { 'Cookie EXP': '쿠키 경험치', Coins: '코인', 'Rune Crystals': '룬결정', 'Lucky Dough': '행운반죽' }
const itemKo = (name) => {
  const hunt = /^(\d+)-Hour Auto Hunt (.+)$/.exec(name)
  if (hunt) return `${AUTO_HUNT[hunt[2]] ?? fail(`모르는 자동 사냥 보상: ${name}`)} ${hunt[1]}시간 자동 사냥 보상`
  return ITEM_KO[name] ?? fail(`모르는 구성품: ${name}`)
}

const update15 = v15Raw
  .filter((p) => typeof p.priceKrw === 'number' && p.items.length)
  .map((p, index) => {
    const contents = {}
    const others = []
    for (const [qty, name] of p.items) {
      const key = ITEM_KEY[name]
      if (key) contents[key] = (contents[key] ?? 0) + qty
      else others.push({ name: itemKo(name), qty })
    }
    return {
      id: `v15-${String(index + 1).padStart(2, '0')}`,
      nameEn: p.name,
      nameKo: V15_KO[p.name] ?? fail(`국내 이름이 없는 1.5 패키지: ${p.name}`),
      category: 'update',
      priceKRW: p.priceKrw,
      contents,
      corrected: false,
      recurring: false,
      limit: p.limit ?? null,
      others,
    }
  })

const out = {
  _meta: {
    source: EOG_PAGE,
    sourceFile: url.startsWith('http') ? url : 'local bundle',
    fetchedAt: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
    note: '수치는 EOG.GG 공개 데이터, 패키지 국내 이름·구성품 보정은 cc.team-hobby.com 상점 목록. EOG 설명문·추천은 포함하지 않는다.',
  },
  band: { levels, perks },
  stellar: { slots: 12, maxLocks: resetCost.length - 1, resetCost },
  packages: {
    currencies: currencyKeys,
    // 화면에서 바꿀 수 있는 기본 가정값. 재화별 크리스탈 환산은 src/features/info/systems/packages.ts가 이 값으로 계산한다.
    assumptions: { ...base, ...pity },
    list: [...packages, ...update15] },
}
await writeFile(join(ROOT, OUT), `${JSON.stringify(out)}\n`)
console.log(`저장: ${OUT} (특전 ${perks.length}개, 패키지 ${packages.length + update15.length}개)`)
