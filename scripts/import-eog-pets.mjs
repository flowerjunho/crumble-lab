#!/usr/bin/env node
/**
 * 펫 도감 데이터(public/data/pet-db.json)를 만든다.
 *
 * 효과 수치·대상 조건·효과 묶음·적용 모드는 EOG.GG가 게임 클라이언트에서 읽어 공개한 값을 쓴다.
 * EOG가 수치를 싣지 않은 효과(명중·회피·집중·저항 계열)는 국내 배틀 패시브 문구에서 수치를 읽는다.
 * 국내 이름·소개 문구·패시브 문구·이미지는 src/data/pet-text-ko.json(scripts/import-pet-text-ko.mjs)을 쓴다.
 * EOG가 직접 쓴 설명문·평가(펫 티어, 사용 팁)는 가져오지 않는다. 받아 온 JS는 실행하지 않는다.
 *
 * 사용법
 *   node scripts/import-eog-pets.mjs            # EOG 페이지에서 최신 번들을 받아 만든다
 *   node scripts/import-eog-pets.mjs <crc.js>   # 이미 받아 둔 크럼블 번들로 만든다
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readNamedLiteral } from './js-literal.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EOG_PAGE = 'https://eog.gg/games/cookierun-crumble/'

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

// 변수 이름은 빌드마다 바뀔 수 있어서, 이름 대신 내용의 시작 모양으로 찾는다.
const pattern = '\\[\\{id:\\d+,name:"[^"]+",rarity:"[A-Z]+",live:'
const m = new RegExp(`[,;{\\s]([A-Za-z_$][\\w$]*)=(?=${pattern})`).exec(text) ?? fail('펫 데이터를 찾지 못했습니다.')
const source = readNamedLiteral(text, m[1], pattern)
const ko = JSON.parse(await readFile(join(ROOT, 'src/data/pet-text-ko.json'), 'utf8')).pets

const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const ROLE = { ATTACKER: 'charge', TANKER: 'tank', SUPPORTER: 'support', SHOOTER: 'ranged' }
// EOG 효과 → 우리 키. how: flat(수치 더하기), pct(기본 능력치의 %), rate(%p 더하기)
const STAT = {
  'atk:flat': ['atk', 'flat'],
  'atk:pct': ['atk', 'pct'],
  'def:flat': ['def', 'flat'],
  'def:pct': ['def', 'pct'],
  'hp:flat': ['hp', 'flat'],
  'hp:pct': ['hp', 'pct'],
  'speed:pct': ['moveSpeed', 'pct'],
  'critRate:rate': ['critRate', 'rate'],
  'critDamage:rate': ['critDamage', 'rate'],
  'skillAmp:rate': ['skillAmp', 'rate'],
  'bossDamage:rate': ['bossDamage', 'rate'],
  'damageReduction:screen': ['damageReduction', 'rate'],
}
// EOG가 수치를 싣지 않은 효과: 국내 문구에서 '<표기> <수치>'를 읽는다.
const NOT_MODELLED = {
  ACCURACY_ADDITION: ['accuracy', 'flat', /(?<![가-힣])명중 ([\d.]+)(?!%)/],
  AVOIDANCE_ADDITION: ['avoidance', 'flat', /(?<![가-힣])회피 ([\d.]+)(?!%)/],
  FOCUS_ADDITION: ['focus', 'flat', /(?<![가-힣])집중 ([\d.]+)(?!%)/],
  RESIST_ADDITION: ['resist', 'flat', /(?<!(?:띄우기|밀치기) )저항 ([\d.]+)(?!%)/],
  ACCURACY_PERCENT_ADDITION: ['accuracyRate', 'rate', /명중률 ([\d.]+)%/],
  AVOIDANCE_PERCENT_ADDITION: ['avoidanceRate', 'rate', /회피율 ([\d.]+)%/],
  FOCUS_PERCENT_ADDITION: ['focusRate', 'rate', /집중확률 ([\d.]+)%/],
  RESIST_PERCENT_ADDITION: ['resistRate', 'rate', /저항확률 ([\d.]+)%/],
  CRITICAL_RESIST_ADDITION: ['critResist', 'rate', /치명저항 ([\d.]+)%/],
  AIRBORNE_RESISTANCE: ['liftResist', 'rate', /띄우기 저항 ([\d.]+)%/],
  KNOCK_BACK_RESISTANCE: ['pushResist', 'rate', /밀치기 저항 ([\d.]+)%/],
}
// 시너지 강화량: 개수로 더하는 시너지와 %로 더하는 시너지가 있다.
const COUNT_SYNERGY = new Set(['burst', 'hit', 'chain', 'pierce'])

const problems = []
const pets = source.map((pet) => {
  const slug = slugOf(pet.name)
  const text = ko[slug]
  if (!text) {
    problems.push(`국내 문구가 없는 펫: ${pet.name}`)
    return null
  }
  if (text.rarity !== pet.rarity) problems.push(`${pet.name}: 등급이 다릅니다(EOG ${pet.rarity}, 국내 ${text.rarity}).`)
  if (pet.tiers.length !== text.stars.length) problems.push(`${pet.name}: 별 등급 수가 다릅니다.`)

  const first = pet.tiers[0]
  const tiers = pet.tiers.map((tier, index) => {
    const line = text.stars[index] ?? ''
    const effects = tier.effects.map((effect) => {
      const mapped = STAT[`${effect.stat}:${effect.how}`] ?? fail(`${pet.name}: 모르는 효과 ${effect.stat}:${effect.how}`)
      return { stat: mapped[0], how: mapped[1], value: effect.value }
    })
    for (const key of new Set(tier.notModelled ?? [])) {
      const [stat, how, re] = NOT_MODELLED[key] ?? fail(`${pet.name}: 모르는 효과 ${key}`)
      const found = re.exec(line)
      if (!found) problems.push(`${pet.name} ★${index + 1}: '${line}'에서 ${key} 수치를 찾지 못했습니다.`)
      else effects.push({ stat, how, value: Number(found[1]) })
    }
    const synergy = (tier.synergy ?? []).map((s) =>
      COUNT_SYNERGY.has(s.key) ? { key: s.key, unit: 'count', value: s.value } : { key: s.key, unit: 'pct', value: Math.round(s.value * 100) },
    )
    // 대상 조건과 묶음은 별 등급마다 같아야 한다(다르면 데이터 구조가 바뀐 것이다).
    if (JSON.stringify(tier.filter) !== JSON.stringify(first.filter) || tier.group !== first.group) problems.push(`${pet.name}: 별 등급마다 대상 조건이 다릅니다.`)
    return { text: line, effects, synergy }
  })

  const synergyKey = tiers[0].synergy[0]?.key ?? null
  return {
    id: pet.id,
    slug,
    name: { ko: text.name, en: pet.name, ja: '' },
    rarity: pet.rarity,
    image: text.image,
    flavor: text.flavor,
    target: {
      roles: first.filter.roles.map((role) => ROLE[role] ?? fail(`${pet.name}: 모르는 직업 ${role}`)),
      elements: first.filter.elements.map((element) => element.toLowerCase()),
      // 시너지 펫의 공격력 증가는 그 시너지를 받는 아군에게만 붙는다(국내 문구: '~ 시너지를 받는 아군').
      receivesSynergy: synergyKey && tiers[0].text.includes('시너지를 받는 아군') ? synergyKey : null,
    },
    modes: first.allowed,
    group: first.group,
    tiers,
  }
})

for (const slug of Object.keys(ko)) if (!pets.some((pet) => pet?.slug === slug)) problems.push(`EOG에 없는 펫: ${ko[slug].name}`)
if (problems.length) fail(`확인이 필요합니다:\n${problems.join('\n')}`)

const out = {
  _meta: {
    source: EOG_PAGE,
    sourceFile: url.startsWith('http') ? url : 'local bundle',
    fetchedAt: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
    note: '효과 수치는 EOG.GG 공개 클라이언트 값, 이름·문구·이미지는 국내 인게임 표기(cookieruncrumble.net 한국어 페이지). EOG 평가·설명문은 포함하지 않는다.',
  },
  pets,
}
await writeFile(join(ROOT, 'public/data/pet-db.json'), `${JSON.stringify(out)}\n`)
console.log(`저장: public/data/pet-db.json (${pets.length}종)`)
