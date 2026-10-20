import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CookieDb, CookiesData, SynergyKey } from '../types'
import { SYNERGY, describeEffect } from './cookieLabels'
import { filterCookies } from '../features/info/CookieDexPage'

const root = join(__dirname, '..', '..')
const read = <T,>(path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
const db = read<CookieDb>('public/data/cookie-db.json')
const recommended = read<CookiesData>('public/data/cookies.json')
const byKo = new Map(db.cookies.map((c) => [c.name.ko, c]))

describe('쿠키 도감 데이터', () => {
  it('추천 슈가룬의 77종과 같은 쿠키·같은 국내 이름·같은 순서다', () => {
    expect(db.cookies.map((c) => c.name)).toEqual(recommended.cookies.map((c) => c.name))
  })

  it('모든 쿠키에 능력치·전투 수치·스킬·이미지가 있다', () => {
    for (const cookie of db.cookies) {
      expect(cookie.stats.atk).toBeGreaterThan(0)
      expect(cookie.stats.hp).toBeGreaterThan(0)
      expect(cookie.combat.range).toBeGreaterThan(0)
      expect(cookie.skill.cycleSeconds).toBeGreaterThan(0)
      expect(cookie.skill.parts.length).toBeGreaterThan(0)
      expect(existsSync(join(root, 'public', cookie.image))).toBe(true)
    }
  })

  // 국내 시너지 도감(설탕노움의 비밀창고, 2026-10-21 확인)과 대조. 샤르도네맛 쿠키는 그 도감에 아직 없다.
  it('주는·받는 시너지가 국내 시너지 도감과 같다', () => {
    const dictionary: Record<SynergyKey, { gives: string[]; receives: string[] }> = {
      pierce: { gives: ['락스타맛 쿠키', '딸기쇼트케이크맛 쿠키'], receives: ['치즈케이크맛 쿠키', '악마맛 쿠키', '라일락맛 쿠키', '에일리언 도넛', '바람궁수 쿠키', '위치베리맛 쿠키'] },
      chain: { gives: ['라임맛 쿠키', '피겨여왕맛 쿠키'], receives: ['닥터 뼈다귀 쿠키', '오븐방랑자 쿠키', '피노누아맛 쿠키', '보더맛 쿠키', '트위즐젤리맛 쿠키', '뱀파이어맛 쿠키'] },
      burst: { gives: ['치즈케이크맛 쿠키', '허브맛 쿠키', '정글전사 쿠키'], receives: ['블루베리 새', '체리콜라맛 쿠키', '쿨링민트맛 쿠키', '버블껌맛 쿠키', '이온맛 쿠키로봇', '감초맛 쿠키', '라임맛 쿠키', '닌자맛 쿠키', '석류맛 쿠키', '전갈맛 쿠키', '치약초코 쿠키'] },
      speed: { gives: ['연금술사맛 쿠키', '석류맛 쿠키'], receives: ['블랙베리맛 쿠키', '코코아맛 쿠키', '크림소다맛 쿠키', '레몬맛 쿠키', '마들렌맛 쿠키', '바삭튼튼 소아과 의사 우유맛 쿠키', '딸기쇼트케이크맛 쿠키', '좀비맛 쿠키'] },
      hit: { gives: ['포도넝쿨맛 쿠키', '오렌지맛 쿠키', '피노누아맛 쿠키'], receives: ['일꾼 곰젤리', '체리콜라맛 쿠키', '체리맛 쿠키', '커피맛 쿠키', '다크체리맛 쿠키', '닥터 와사비 쿠키', '허브맛 쿠키', '마카롱맛 쿠키', '메론소다맛 쿠키', '호밀맛 쿠키', '도넛행성 에일리언 도넛킹', '딸기크레페맛 쿠키', '마법사맛 쿠키'] },
      area: { gives: ['크림소다맛 쿠키', '용사맛 쿠키', '마카롱맛 쿠키', '치약초코 쿠키'], receives: ['연금술사맛 쿠키', '요거트베리맛 쿠키', '치어리더맛 쿠키', '에스프레소맛 쿠키', '용감한 쿠키', '포도넝쿨맛 쿠키', '용사맛 쿠키', '마들렌맛 쿠키', '밀키웨이맛 쿠키', '근육맛 쿠키', '이름 모를 케이크 들개', '양파맛 쿠키', '독버섯맛 쿠키', '바리공주맛 쿠키', '공주맛 쿠키', '홍고추맛 쿠키', '락스타맛 쿠키', '찰스', '설탕노움', '실론나이트 쿠키'] },
      dur: { gives: ['치어리더맛 쿠키', '커피맛 쿠키', '바삭튼튼 소아과 의사 우유맛 쿠키'], receives: ['탐험가맛 쿠키', '천사맛 쿠키', '브라이트시커 쿠키', '쿨링민트맛 쿠키', '슈크림맛 쿠키', '다크초코 쿠키', '명랑한 쿠키', '감감술래 놀이 달토끼맛 쿠키', '오렌지맛 쿠키', '팬케이크맛 쿠키', '복숭아맛 쿠키', '팝콘맛 쿠키', '전갈맛 쿠키', '피겨여왕맛 쿠키', '도넛행성 에일리언 도넛킹', '딸기맛 쿠키', '정글전사 쿠키'] },
    }
    const others = db.cookies.filter((c) => c.name.ko !== '샤르도네맛 쿠키')
    for (const [key, list] of Object.entries(dictionary) as [SynergyKey, { gives: string[]; receives: string[] }][]) {
      expect(others.filter((c) => c.synergy.gives.includes(key)).map((c) => c.name.ko).sort()).toEqual([...list.gives].sort())
      expect(others.filter((c) => c.synergy.receives.includes(key)).map((c) => c.name.ko).sort()).toEqual([...list.receives].sort())
    }
    expect(byKo.get('샤르도네맛 쿠키')!.synergy).toEqual({ gives: ['burst'], receives: ['speed'] })
  })

  it('모든 효과가 영어 키 없이 한국어 문장으로 바뀐다', () => {
    for (const cookie of db.cookies) {
      for (const effect of cookie.effects) {
        const view = describeEffect(effect, 'ko')
        const text = `${view.target} ${view.what} ${view.details.join(' ')}`
        expect(text, `${cookie.name.ko}: ${text}`).not.toMatch(/[A-Za-z]{3,}/)
      }
    }
  })

  it('대표 효과 문장', () => {
    const skating = byKo.get('피겨여왕맛 쿠키')!
    const views = skating.effects.map((e) => describeEffect(e, 'ko'))
    expect(views.map((v) => v.what)).toContain('치명피해 +65%')
    expect(views.map((v) => v.what)).toContain(`시너지 ${SYNERGY.chain.ko} +2`)
    expect(views[0]!.details).toContain('스킬증폭 적용')
  })

  it('검색·필터가 국내 이름과 시너지 방향을 따른다', () => {
    const none = { q: '', rarity: '', role: '', element: '', synergy: '', side: 'gives' as const }
    expect(filterCookies(db.cookies, { ...none, q: '피겨 여왕' }, 'ko').map((c) => c.name.ko)).toEqual(['피겨여왕맛 쿠키'])
    expect(filterCookies(db.cookies, { ...none, synergy: 'chain' }, 'ko').map((c) => c.name.ko).sort()).toEqual(['라임맛 쿠키', '피겨여왕맛 쿠키'])
    expect(filterCookies(db.cookies, { ...none, synergy: 'chain', side: 'receives' }, 'ko')).toHaveLength(6)
    expect(filterCookies(db.cookies, { ...none, role: 'tank', element: 'water' }, 'ko').every((c) => c.role === 'tank' && c.element === 'water')).toBe(true)
  })
})
