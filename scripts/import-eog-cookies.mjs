#!/usr/bin/env node
/**
 * 쿠키 도감 데이터(public/data/cookie-db.json)를 만든다.
 *
 * 수치(능력치·전투 수치·시너지·스킬 피해 모델·효과)는 EOG.GG가 게임 클라이언트에서 읽어 공개한 값을 쓰고,
 * 쿠키 이름(국내 공식 한국어)·이미지·추천 슈가룬은 public/data/cookies.json을 그대로 쓴다.
 * EOG가 직접 쓴 설명문·평가(스킬 설명, 코멘트, 티어 등급)는 가져오지 않는다.
 * 받아 온 JS는 실행하지 않고, 데이터 리터럴만 scripts/js-literal.mjs로 읽는다.
 *
 * 사용법
 *   node scripts/import-eog-cookies.mjs            # EOG 페이지에서 최신 번들을 받아 만든다
 *   node scripts/import-eog-cookies.mjs <crc.js>   # 이미 받아 둔 크럼블 번들로 만든다
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
const findLiteral = (pattern, label) => {
  const m = new RegExp(`[,;{\\s]([A-Za-z_$][\\w$]*)=(?=${pattern})`).exec(text)
  if (!m) fail(`${label} 데이터를 찾지 못했습니다.`)
  return readNamedLiteral(text, m[1], pattern)
}
const basics = findLiteral('\\[\\{id:0,name:"', '쿠키 기본 정보')
const units = findLiteral('\\[\\{eid:"cookie', '쿠키 전투 수치')
const skills = findLiteral('\\{cookie\\d{4}:\\{eid:"cookie\\d{4}",name:"[^"]+",cycleSeconds:', '스킬 피해 모델')
const effects = findLiteral('\\{cookie\\d{4}:\\[(?:\\]|\\{id:\\d+,effectIndex:)', '스킬 효과')

const ours = JSON.parse(await readFile(join(ROOT, 'public/data/cookies.json'), 'utf8')).cookies
// 국내 스킬 이름(scripts/import-skill-names-ko.mjs로 만든다)
const skillNamesKo = JSON.parse(await readFile(join(ROOT, 'src/data/cookie-skill-names-ko.json'), 'utf8')).names
const oursByKo = new Map(ours.map((cookie) => [cookie.name.ko, cookie]))
const unitBySlug = new Map(units.map((unit) => [unit.slug, unit]))

const ROLE = { Charge: 'charge', Tank: 'tank', Support: 'support', Ranged: 'ranged' }
const ELEMENT = { Water: 'water', Fire: 'fire', Grass: 'grass', Light: 'light', Dark: 'dark' }

const problems = []
const cookies = basics.map((basic) => {
  const our = oursByKo.get(basic.ko)
  const unit = unitBySlug.get(basic.slug)
  if (!our) problems.push(`cookies.json에 없는 쿠키: ${basic.ko}`)
  if (!unit) problems.push(`전투 수치가 없는 쿠키: ${basic.ko}`)
  if (!ROLE[basic.klass] || !ELEMENT[basic.element]) problems.push(`알 수 없는 직업/속성: ${basic.ko} ${basic.klass} ${basic.element}`)
  const skill = skills[unit?.eid]
  if (!skill) problems.push(`스킬 모델이 없는 쿠키: ${basic.ko}`)
  if (!skillNamesKo[basic.ko]) problems.push(`국내 스킬 이름이 없는 쿠키: ${basic.ko}`)

  return {
    eid: unit?.eid ?? null,
    slug: basic.slug,
    id: our?.id ?? null,
    // 이름은 국내 공식 표기를 쓰는 cookies.json(한·영·일)을 그대로 쓴다.
    name: our?.name ?? { ko: basic.ko, en: basic.name, ja: basic.name },
    image: our?.image ?? null,
    rarity: basic.rarity,
    role: ROLE[basic.klass],
    element: ELEMENT[basic.element],
    stats: {
      power: basic.stats?.power ?? null,
      atk: unit?.atk ?? null,
      def: unit?.def ?? null,
      hp: unit?.hp ?? null,
    },
    combat: unit && {
      range: unit.range,
      moveSpeed: unit.speed,
      hitRadius: unit.hitRadius,
      targeting: unit.searchType,
      startCooldownReduction: unit.startCooldownReduction,
      knockbackResistance: unit.knockbackResistance,
      airborneResistance: unit.airborneResistance,
    },
    synergy: { gives: unit?.grants ?? basic.gives, receives: unit?.synergy ?? basic.receives },
    skill: skill && {
      nameKo: skillNamesKo[basic.ko] ?? null,
      nameEn: basic.skill?.name ?? null,
      cycleSeconds: skill.cycleSeconds,
      coefPerCycle: [skill.coefPerCycle, skill.coefPerCycleMax],
      atkPerSecond: [skill.xAtkPerSecond, skill.xAtkPerSecondMax],
      parts: skill.roots.map((root) => ({
        cooldown: root.cooldown,
        effectiveCooldown: root.effectiveCooldown,
        gate: root.gate ? { kind: root.gate.kind, operator: root.gate.operator, value: root.gate.value } : null,
        coefPerCycle: [root.coefPerCycleMin, root.coefPerCycleMax],
        support: !!root.support,
        hits: (root.damage ?? []).map((part) => ({
          perHit: part.perHit ?? part.dmg ?? 0,
          hits: part.hits ?? 1,
          instances: [part.instancesMin ?? 1, part.instancesMax ?? 1],
          applications: [part.applicationsMin ?? 1, part.applicationsMax ?? 1],
          coef: [part.coefMin ?? 0, part.coefMax ?? 0],
          radius: part.radius ?? null,
          unlimitedTargets: !!part.unlimited,
        })),
      })),
    },
    effects: (effects[unit?.eid] ?? []).map((effect) => ({
      kind: effect.kind,
      property: effect.property,
      calcType: effect.calcType,
      valueBase: effect.valueBase,
      value: effect.value,
      unit: effect.unit,
      duration: effect.duration,
      lifetime: effect.lifetime,
      maxStack: effect.maxStack,
      applyRate: effect.applyRate,
      target: effect.target,
      maxTargets: effect.maxTargets,
      excludeCaster: effect.excludeCaster,
      tickSeconds: effect.tickSeconds ?? null,
      scalesWithSkillAmp: effect.scalesWithSkillAmp,
      durationScalesWithDurationSynergy: effect.durationScalesWithDurationSynergy,
      onlyIn: effect.allowed ?? null,
      category: effect.category,
    })),
    runes: our?.options ?? [],
  }
})

if (problems.length) fail(`쿠키 데이터를 맞추지 못했습니다:\n- ${problems.join('\n- ')}`)
if (cookies.length !== ours.length) fail(`쿠키 수가 다릅니다: EOG ${cookies.length}, cookies.json ${ours.length}`)

// 추천 슈가룬 탭과 같은 순서(신규 쿠키 우선)로 둔다.
const order = new Map(ours.map((cookie, index) => [cookie.name.ko, index]))
cookies.sort((a, b) => order.get(a.name.ko) - order.get(b.name.ko))

const out = {
  _meta: {
    source: EOG_PAGE,
    sourceFile: url,
    fetchedAt: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
    note: '수치는 EOG.GG가 게임 클라이언트에서 읽은 값(개발사 공식 아님). 이름·이미지·추천 슈가룬은 cookies.json. 스킬 계수는 공격력 배율(1 = 공격력 100%), fraction 단위는 1 = 100%.',
  },
  cookies,
}
await writeFile(join(ROOT, 'public/data/cookie-db.json'), `${JSON.stringify(out)}\n`)
console.log(`저장: public/data/cookie-db.json (쿠키 ${cookies.length}종)`)
