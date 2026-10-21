import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CookieDb, PetDb } from '../../../types'
import { cookieStats, type GrowthData } from '../growth/growth'
import {
  CALC_KITS,
  SQUAD_SIZE,
  applyPets,
  battleStats,
  calcKitOf,
  cookieDps,
  critFactor,
  critStacks,
  defenseFactor,
  dotCoefPerCast,
  elementFactor,
  hastedCycle,
  leverFactor,
  synergyFor,
  teamDps,
  teamSynergy,
} from './damage'
import { decodeBuild, decodeEid, emptyBuild, encodeBuild, encodeEid, readSavedBuilds, saveBuild, deleteSavedBuild } from './buildCodec'

const root = join(__dirname, '..', '..', '..', '..')
const read = <T,>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
const cookies = read<CookieDb>('public/data/cookie-db.json').cookies
const pets = read<PetDb>('public/data/pet-db.json').pets
const growth = read<GrowthData>('public/data/growth.json')
const cookie = (slug: string) => cookies.find((c) => c.slug === slug) ?? (() => { throw new Error(slug) })()
const pet = (slug: string) => pets.find((p) => p.slug === slug) ?? (() => { throw new Error(slug) })()
const lv1 = (slug: string) => cookieStats(growth, cookie(slug), 1, 0)

describe('배율 하나하나 (EOG 번들 피해 계산식)', () => {
  it('방어 배율은 1 / (1 + ln(1 + 방어력/500))', () => {
    expect(defenseFactor(0)).toBe(1)
    expect(defenseFactor(500)).toBeCloseTo(1 / (1 + Math.LN2), 10)
    expect(defenseFactor(2000)).toBeCloseTo(1 / (1 + Math.log(5)), 10)
  })

  it('치명 배율: 100%를 넘는 치명확률은 여러 번 치명으로 센다', () => {
    expect(critStacks(10)).toBeCloseTo(0.1)
    expect(critStacks(150, 30)).toBeCloseTo(1.2)
    expect(critStacks(20, 50)).toBe(0)
    expect(critFactor(critStacks(150), 50)).toBeCloseTo(1.75)
  })

  it('속성 상성: 유리하면 +15% + 속성피해, 불리해도 깎이지 않는다', () => {
    expect(elementFactor('fire', 'grass')).toBeCloseTo(1.15)
    expect(elementFactor('water', 'fire', 10)).toBeCloseTo(1.25)
    expect(elementFactor('grass', 'fire', 10)).toBe(1)
    expect(elementFactor('light', 'dark')).toBeCloseTo(1.15)
    expect(elementFactor('dark', 'light')).toBeCloseTo(1.15)
    expect(elementFactor('fire', null)).toBe(1)
  })

  it('스킬가속: 주기 × 100 / (100 + 가속)', () => {
    expect(hastedCycle(4, 0)).toBe(4)
    expect(hastedCycle(4, 25)).toBeCloseTo(3.2)
    expect(hastedCycle(10, 100)).toBeCloseTo(5)
  })
})

describe('계산기 보조 데이터(calc-kits.json)', () => {
  it('77종 모두 있고 스킬 부분·피해 항목 수가 쿠키 도감과 같다', () => {
    expect(Object.keys(CALC_KITS)).toHaveLength(cookies.length)
    for (const c of cookies) {
      const kit = CALC_KITS[c.eid]!
      expect(kit.parts).toHaveLength(c.skill.parts.length)
      kit.parts.forEach((part, i) => expect(part.hits).toHaveLength(c.skill.parts[i]!.hits.length))
    }
  })

  it('시너지·가속 없이 더한 주기당 계수가 쿠키 도감의 skill.coefPerCycle과 같다(두 범위 모두)', () => {
    for (const c of cookies) {
      for (const bound of ['min', 'max'] as const) {
        const result = cookieDps({ cookie: c, stats: lv1(c.slug), bound })
        expect(result.coefPerCycle, `${c.name.ko} ${bound}`).toBeCloseTo(c.skill.coefPerCycle[bound === 'min' ? 0 : 1], 2)
      }
    }
  })

  it('레버는 한 대상 타수를 바꾸는 시너지(다발·연타·지속·연쇄)만 담는다', () => {
    for (const kit of Object.values(CALC_KITS))
      for (const part of kit.parts) for (const levers of part.hits) for (const lever of levers) expect(['burst', 'hit', 'dur', 'chain']).toContain(lever.key)
  })
})

describe('시너지 레버', () => {
  it('닌자맛 쿠키 다발: 부채꼴이라 한 대상 기준은 그대로, 모두 맞으면 (3+2)/3배', () => {
    const lever = calcKitOf(cookie('ninja')).parts[0]!.hits[0]![0]!
    expect(lever).toMatchObject({ key: 'burst', kind: 'spawn', base: 3, fan: true })
    expect(leverFactor(lever, 2, 'min')).toBe(1)
    expect(leverFactor(lever, 2, 'max')).toBeCloseTo(5 / 3)
    // 개수형은 정수 부분만 더한다.
    expect(leverFactor(lever, 1.9, 'max')).toBeCloseTo(4 / 3)
  })

  it('딸기맛 쿠키 회전 공격 지속: 1.5초/0.33초 4회 → 지속 +50%면 6회', () => {
    const lever = calcKitOf(cookie('strawberry')).parts[0]!.hits[0]![0]!
    expect(lever).toMatchObject({ key: 'dur', kind: 'ticks', life: 1.5, period: 0.33 })
    expect(leverFactor(lever, 0.5, 'min')).toBeCloseTo(6 / 4)
  })

  it('연쇄는 모두 맞을 때만 늘어난다(1 + 3 → 1 + 5)', () => {
    const lever = calcKitOf(cookie('twizzly-gummy')).parts[0]!.hits[0]![0]!
    expect(leverFactor(lever, 2, 'min')).toBe(1)
    expect(leverFactor(lever, 2, 'max')).toBeCloseTo(6 / 4)
  })

  it('연타 반복 횟수는 상위 공격 수명 안의 최대 횟수를 넘지 않는다', () => {
    const lever = calcKitOf(cookie('strawberry-crepe')).parts[0]!.hits[0]![0]!
    expect(lever).toMatchObject({ key: 'hit', kind: 'repeat', base: 1, cap: 9 })
    expect(leverFactor(lever, 2, 'min')).toBe(3)
    expect(leverFactor(lever, 20, 'min')).toBe(9)
  })

  it('받지 않는 시너지는 무시한다', () => {
    const ninja = cookie('ninja')
    const a = cookieDps({ cookie: ninja, stats: lv1('ninja'), bound: 'max', synergy: { hit: 3 } })
    const b = cookieDps({ cookie: ninja, stats: lv1('ninja'), bound: 'max' })
    expect(a.dps).toBe(b.dps)
    const c = cookieDps({ cookie: ninja, stats: lv1('ninja'), bound: 'max', synergy: { burst: 2 } })
    expect(c.dps / b.dps).toBeCloseTo(5 / 3)
  })
})

describe('지속 피해', () => {
  it('가속이 없으면 쿠키 도감의 계수와 같다(전갈맛 쿠키 20중첩 × 12틱 × 0.1)', () => {
    const dot = CALC_KITS[cookie('scorpion').eid]!.dots[0]!
    expect(dotCoefPerCast(dot, 0, 'min')).toBeCloseTo(24)
    // 가속 25: 시전 간격 3.4초 → 틱 10회, 중첩은 계속 최대(지속 5초 > 3.4초)
    expect(dotCoefPerCast(dot, 25, 'min')).toBeCloseTo(0.1 * 20 * 10)
  })
})

describe('펫 적용', () => {
  const chardonnay = cookie('chardonnay')

  it('같은 묶음은 가장 강한 하나만 적용된다(황금방울 치명확률 14% > 모카 딜라이트 8%)', () => {
    const gold = pet('gold-drop')
    const mocha = pet('mocha-delight')
    expect(gold.group).toBe(mocha.group)
    const applied = applyPets([{ pet: mocha, star: 5 }, { pet: gold, star: 5 }], chardonnay)
    expect(applied.list.map((p) => p.status)).toEqual(['weaker', 'active'])
    expect(applied.effects).toEqual([{ stat: 'critRate', how: 'rate', value: 14 }])
  })

  it('대상 조건과 모드 제한을 따른다', () => {
    const fireAtk = pet('apple-rabbit')
    const grassAtk = pet('owlcorn')
    const cog = pet('continuum-cog')
    const applied = applyPets([{ pet: fireAtk, star: 5 }, { pet: cog, star: 5 }], chardonnay)
    expect(applied.list.map((p) => p.status)).toEqual(['target', 'mode'])
    expect(applyPets([{ pet: cog, star: 5 }], chardonnay, 'DIMENSION_STAGE').list[0]!.status).toBe('active')
    expect(applyPets([{ pet: grassAtk, star: 5 }], chardonnay).effects).toEqual([{ stat: 'atk', how: 'pct', value: 24 }])
  })

  it('시너지 강화는 그 시너지를 받는 쿠키에게만 더해진다(탄속 +50% → 0.5)', () => {
    const pup = pet('furball-pup')
    expect(applyPets([{ pet: pup, star: 5 }], chardonnay).synergy).toEqual({ speed: 0.5 })
    expect(applyPets([{ pet: pup, star: 5 }], cookie('ninja')).list[0]!.status).toBe('target')
  })
})

describe('전투 능력치', () => {
  it('공격력 증폭 → 펫 % → 펫 수치 순서로 쌓고 단계마다 내림한다', () => {
    const base = lv1('chardonnay')
    expect(base.atk).toBe(133)
    const stats = battleStats(base, { atkPct: 10, critRate: 5 }, [
      { stat: 'atk', how: 'pct', value: 24 },
      { stat: 'atk', how: 'flat', value: 100 },
      { stat: 'damageReduction', how: 'rate', value: 20 },
      { stat: 'damageReduction', how: 'rate', value: 10 },
    ])
    // ⌊133 × 1.1⌋ = 146, ⌊146 × 1.24⌋ = 181, + 100
    expect(stats.atk).toBe(281)
    expect(stats.critRate).toBe(15)
    expect(stats.critDamage).toBe(50)
    expect(stats.damageReduction).toBeCloseTo(1 - 0.8 * 0.9)
  })
})

describe('DPS (손으로 계산한 값)', () => {
  it('샤르도네맛 쿠키 1레벨 0성, 허수아비: 133 × 2.5 × 1.05 / 4초', () => {
    const result = cookieDps({ cookie: cookie('chardonnay'), stats: lv1('chardonnay') })
    expect(result.attack).toBe(133)
    expect(result.cycle).toBe(4)
    expect(result.perCycle).toBeCloseTo(133 * 2.5 * 1.05)
    expect(result.dps).toBeCloseTo((133 * 2.5 * 1.05) / 4)
    expect(result.breakdown[0]!.damagePerHit).toBe(Math.floor(133 * 2.5 * 1.05))
  })

  it('보스·방어력·속성·피해감소·적중률·가속이 모두 곱해진다', () => {
    const c = cookie('chardonnay')
    const result = cookieDps({
      cookie: c,
      stats: lv1('chardonnay'),
      loadout: { skillAmp: 20, bossDamage: 30, haste: 25 },
      target: { def: 500, element: 'water', isBoss: true, damageReduction: 10, avoidance: 200 },
    })
    const product = 1.2 * 1.05 * 1.3 * (1 / (1 + Math.LN2)) * 1.15 * 0.9 * 0.5
    expect(result.hitChance).toBeCloseTo(0.5)
    expect(result.product).toBeCloseTo(product)
    expect(result.cycle).toBeCloseTo(3.2)
    expect(result.dps).toBeCloseTo((133 * 2.5 * product) / 3.2)
  })

  it('보스가 아니면 보스피해가 들어가지 않는다', () => {
    const c = cookie('chardonnay')
    const a = cookieDps({ cookie: c, stats: lv1('chardonnay'), loadout: { bossDamage: 50 } })
    const b = cookieDps({ cookie: c, stats: lv1('chardonnay') })
    expect(a.dps).toBe(b.dps)
  })

  it('레벨·별이 오르면 공격력만큼 DPS가 오른다', () => {
    const c = cookie('ninja')
    const low = cookieDps({ cookie: c, stats: cookieStats(growth, c, 1, 0) })
    const high = cookieDps({ cookie: c, stats: cookieStats(growth, c, 120, 10) })
    expect(high.attack).toBeGreaterThan(low.attack)
    expect(high.dps / low.dps).toBeGreaterThan(high.attack / low.attack)
  })
})

describe('팀 시너지', () => {
  it('샤르도네맛 쿠키가 다발 +2를 5초 동안(주기 4초) 줘서 다발을 받는 쿠키는 2를 받는다', () => {
    const team = [cookie('chardonnay'), cookie('ninja'), cookie('herb')]
    const rows = teamSynergy(team)
    const burst = rows.find((row) => row.key === 'burst')!
    expect(burst.givers.map((g) => g.from.slug).sort()).toEqual(['chardonnay', 'herb'])
    expect(burst.steps).toBe(2)
    expect(burst.receivers.map((c) => c.slug)).toContain('ninja')
    expect(synergyFor(cookie('ninja'), rows)).toEqual({ burst: 2 })
    expect(synergyFor(cookie('chardonnay'), rows)).toEqual({})
  })

  it('인원 제한이 있으면 받는 쿠키 수로 나눈다(용사맛 쿠키 범위 50%, 아군 1명)', () => {
    const team = [cookie('knight'), ...cookies.filter((c) => c.synergy.receives.includes('area')).slice(0, 4)]
    const area = teamSynergy(team).find((row) => row.key === 'area')!
    const grant = area.givers.find((g) => g.from.slug === 'knight')!
    expect(grant.maxTargets).toBe(1)
    expect(area.steps).toBeCloseTo((0.5 * grant.uptime) / area.receivers.length)
  })

  it('teamDps는 쿠키별 DPS를 더한다', () => {
    const members = ['chardonnay', 'ninja', 'herb'].map((slug) => ({ cookie: cookie(slug), stats: lv1(slug) }))
    const team = teamDps(members, { bound: 'max' })
    expect(team.dps).toBeCloseTo(team.members.reduce((s, m) => s + m.result.dps, 0))
    const ninja = team.members.find((m) => m.cookie.slug === 'ninja')!
    expect(ninja.result.synergy).toEqual({ burst: 2 })
  })
})

describe('빌드 주소', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('eid를 36진수로 줄이고 되돌린다', () => {
    expect(encodeEid('cookie4011')).toBe((4011).toString(36))
    expect(decodeEid(encodeEid('cookie0007'))).toBe('cookie0007')
    expect(decodeEid('!!')).toBeNull()
  })

  it('빌드를 주소로 바꿨다가 되돌리면 같다', () => {
    const build = emptyBuild()
    build.cookies[0] = 'cookie4011'
    build.cookies[5] = 'cookie0007'
    build.pets[1] = { id: pet('gold-drop').id, star: 4 }
    build.level = 100
    build.grade = 7
    build.loadouts[5] = { atkPct: 12.5, haste: 20 }
    build.loadouts[3] = { atkPct: 10 } // 빈칸의 슈가룬은 버린다
    const code = encodeBuild(build)
    expect(code.get('c')).toBe(`${(4011).toString(36)}.....7`)
    const back = decodeBuild(new URLSearchParams(code.toString()))
    expect(back.cookies).toHaveLength(SQUAD_SIZE)
    expect(back.cookies[0]).toBe('cookie4011')
    expect(back.cookies[5]).toBe('cookie0007')
    expect(back.pets).toEqual([null, { id: pet('gold-drop').id, star: 4 }, null])
    expect(back.level).toBe(100)
    expect(back.grade).toBe(7)
    expect(back.loadouts).toEqual({ 5: { atkPct: 12.5, haste: 20 } })
  })

  it('기본 빌드는 빈 주소가 되고, 망가진 주소는 기본값으로 읽는다', () => {
    expect(encodeBuild(emptyBuild()).toString()).toBe('')
    const back = decodeBuild(new URLSearchParams('c=%%.zz&lv=abc&st=99&r=99~1_x'))
    expect(back.level).toBe(120)
    expect(back.grade).toBe(10)
    expect(back.loadouts).toEqual({})
  })

  it('저장소가 없으면 빈 목록, 있으면 같은 이름을 덮어쓴다', () => {
    expect(readSavedBuilds()).toEqual([])
    const memory = new Map<string, string>()
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v) } })
    const build = emptyBuild()
    build.cookies[0] = 'cookie4011'
    saveBuild('보스용', build)
    saveBuild('보스용', build)
    saveBuild('차원', emptyBuild())
    expect(readSavedBuilds().map((b) => b.name)).toEqual(['차원', '보스용'])
    expect(deleteSavedBuild('차원').map((b) => b.name)).toEqual(['보스용'])
  })
})
