import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CookieDb, PetDb } from '../types'
import { filterPets } from '../features/info/PetDexPage'
import { PET_STAT, petAffectsCookie, petTargetLabel, petTierText } from './petLabels'

const root = join(__dirname, '..', '..')
const read = <T,>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
const db = read<PetDb>('public/data/pet-db.json')
const cookies = read<CookieDb>('public/data/cookie-db.json').cookies
const byKo = new Map(db.pets.map((p) => [p.name.ko, p]))
const pet = (ko: string) => byKo.get(ko) ?? (() => { throw new Error(ko) })()
const cookie = (ko: string) => cookies.find((c) => c.name.ko === ko) ?? (() => { throw new Error(ko) })()

describe('펫 도감 데이터', () => {
  it('57종, 등급별 수가 국내 펫 도감과 같다(SSR 26·SR 12·R 9·U 6·C 4)', () => {
    const count: Record<string, number> = {}
    for (const p of db.pets) count[p.rarity] = (count[p.rarity] ?? 0) + 1
    expect(db.pets).toHaveLength(57)
    expect(count).toEqual({ SSR: 26, SR: 12, R: 9, U: 6, C: 4 })
  })

  it('모든 펫에 국내 이름·별 5단계 문구·효과·이미지가 있다', () => {
    for (const p of db.pets) {
      expect(p.name.ko).toMatch(/[가-힣]/)
      expect(p.tiers).toHaveLength(5)
      for (const tier of p.tiers) {
        expect(tier.text).toMatch(/증가|\+/)
        expect(tier.effects.length + tier.synergy.length).toBeGreaterThan(0)
        for (const effect of tier.effects) expect(PET_STAT[effect.stat]).toBeDefined()
      }
      expect(existsSync(join(root, 'public', p.image))).toBe(true)
    }
  })

  // EOG 수치와 국내 인게임 문구가 같은 값을 말하는지 대조한다.
  it('효과 수치가 별 등급마다 국내 패시브 문구에 그대로 들어 있다', () => {
    for (const p of db.pets)
      for (const tier of p.tiers) {
        for (const effect of tier.effects) expect(tier.text, `${p.name.ko}: ${effect.stat}`).toContain(`${effect.value}${effect.how === 'flat' ? ' ' : '%'}`)
        for (const boost of tier.synergy) expect(tier.text, p.name.ko).toContain(`+${boost.value}${boost.unit === 'pct' ? '%' : ''}`)
      }
  })

  // 나무위키 크럼블 도감(2026-09-27 수정판)과 cc.team-hobby.com 펫 목록에서 확인한 국내 이름
  it('국내 공식 이름을 쓴다', () => {
    const names = ['초코방울', '황금방울', '치즈뭉치 고양이', '사바나나 사자', '와사비 문어', '털뭉치 멍뭉이', '약과 찹사리', '초코고양이 네로', '갓난갓방울', '근엄한 초코왕방울', '무한바퀴', '색동 주머니', '전지멜로우', '도토리 부엉이']
    for (const name of names) expect(byKo.has(name), name).toBe(true)
  })

  it('대표 펫의 효과가 인게임 수치와 같다', () => {
    expect(pet('초코방울').tiers.map((t) => t.effects[0]?.value)).toEqual([10, 20, 40, 65, 100])
    expect(pet('도토리 부엉이').target.elements).toEqual(['grass'])
    expect(pet('도토리 부엉이').tiers[4]!.effects).toEqual([{ stat: 'atk', how: 'pct', value: 24 }])
    expect(pet('치즈뭉치 고양이').tiers[4]!.synergy).toEqual([{ key: 'chain', unit: 'count', value: 2 }])
    expect(pet('사바나나 사자').tiers[0]!.synergy).toEqual([{ key: 'area', unit: 'pct', value: 20 }])
    expect(pet('색동 주머니').tiers[0]!.effects).toEqual(
      expect.arrayContaining([
        { stat: 'hp', how: 'pct', value: 5 },
        { stat: 'liftResist', how: 'rate', value: 22.5 },
      ]),
    )
    expect(pet('무한바퀴').modes).toEqual(['DIMENSION_STAGE'])
    expect(pet('초코고양이 네로').target.roles).toEqual(['support'])
  })
})

describe('펫 효과 대상과 문구', () => {
  it('대상 조건이 맞는 쿠키에게만 효과가 있다', () => {
    const owl = pet('도토리 부엉이')
    expect(petAffectsCookie(owl, cookie('바람궁수 쿠키'))).toBe(true)
    expect(petAffectsCookie(owl, cookie('용감한 쿠키'))).toBe(false)
    // 연쇄 시너지를 받는 쿠키(국내 시너지 도감)에게만 공격력 증가가 붙는다.
    expect(petAffectsCookie(pet('치즈뭉치 고양이'), cookie('오븐방랑자 쿠키'))).toBe(true)
    expect(petAffectsCookie(pet('치즈뭉치 고양이'), cookie('용감한 쿠키'))).toBe(false)
    expect(petAffectsCookie(pet('황금방울'), cookie('용감한 쿠키'))).toBe(true)
  })

  it('대상 이름이 인게임 문구와 같은 표기다', () => {
    expect(petTargetLabel(pet('도토리 부엉이'), 'ko')).toBe('풀속성 아군')
    expect(petTargetLabel(pet('화나구마'), 'ko')).toBe('돌격형 아군')
    expect(petTargetLabel(pet('황금방울'), 'ko')).toBe('아군 전체')
    expect(petTierText(pet('도토리 부엉이'), pet('도토리 부엉이').tiers[0]!, 'en')).toBe('ATK +12% (Grass allies)')
  })

  it('목록 필터가 효과 종류와 대상을 함께 거른다', () => {
    const atkGrass = filterPets(db.pets, { q: '', rarity: '', effect: 'atk', target: 'grass' }, 'ko').map((p) => p.name.ko)
    expect(atkGrass).toEqual(['도토리 부엉이'])
    const accuracy = filterPets(db.pets, { q: '', rarity: '', effect: 'accuracy', target: '' }, 'ko').map((p) => p.name.ko)
    expect(accuracy.sort()).toEqual(['앵앵베리버드', '인삼이라지', '초코방울'].sort())
    expect(filterPets(db.pets, { q: '방울', rarity: 'C', effect: '', target: '' }, 'ko')).toHaveLength(2)
  })
})
