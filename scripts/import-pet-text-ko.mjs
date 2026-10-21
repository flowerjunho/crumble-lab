#!/usr/bin/env node
/**
 * 펫의 국내 표기(이름·소개 문구·별 등급별 배틀 패시브 문구)를 src/data/pet-text-ko.json으로 저장하고,
 * 펫 이미지를 public/images/pets/<slug>.webp로 받는다.
 * 출처는 cookieruncrumble.net의 한국어 펫 페이지(인게임 표기). 사이트가 직접 쓴 사용법·분석·추천 쿠키는 가져오지 않는다.
 *
 * 사용법: node scripts/import-pet-text-ko.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SITE = 'https://cookieruncrumble.net'
const HEADERS = { 'user-agent': 'Mozilla/5.0' }
const decode = (s) =>
  s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
const fail = (message) => {
  throw new Error(message)
}
const get = async (url) => {
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) fail(`${url}: HTTP ${res.status}`)
  return res
}

// 목록 페이지의 카드마다 펫 주소와 이미지가 함께 들어 있다.
const list = await (await get(`${SITE}/ko/pets`)).text()
const cards = [...list.matchAll(/href="\/ko\/pets\/([a-z0-9-]+)"[^>]*>[\s\S]{0,500}?<img src="(\/assets\/pets\/[^"]+\.webp)"/g)]
const imageBySlug = new Map(cards.map((m) => [m[1], m[2]]))
if (imageBySlug.size === 0) fail('목록 페이지에서 펫을 찾지 못했습니다.')

await mkdir(join(ROOT, 'public/images/pets'), { recursive: true })

const pets = {}
for (const [slug, image] of imageBySlug) {
  const html = await (await get(`${SITE}/ko/pets/${slug}`)).text()
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
    .split(/<[^>]+>/)
    .map(decode)
    .filter(Boolean)
  // 본문 순서: '펫 도감으로' → 이름 → 등급 → 소개 문구 → '배틀 패시브' → (★, 별 번호, 효과 문구) × 5
  const top = text.indexOf('펫 도감으로')
  const passive = text.indexOf('배틀 패시브')
  if (top < 0 || passive < 0) fail(`${slug}: 본문 구조가 예상과 다릅니다.`)
  const stars = []
  let i = passive + 1
  while (text[i] === '★') {
    if (Number(text[i + 1]) !== stars.length + 1) fail(`${slug}: 별 번호가 순서대로가 아닙니다.`)
    i += 2
    const lines = []
    while (text[i] !== '★' && !text[i].endsWith('사용법')) lines.push(text[i++])
    stars.push(lines.join(' '))
  }
  if (stars.length !== 5) fail(`${slug}: 별 등급 효과가 ${stars.length}개입니다.`)
  pets[slug] = { name: text[top + 1], rarity: text[top + 2], flavor: text.slice(top + 3, passive).join(' '), stars, image: `/images/pets/${slug}.webp` }

  const img = await get(new URL(image, SITE).href)
  await writeFile(join(ROOT, 'public/images/pets', `${slug}.webp`), Buffer.from(await img.arrayBuffer()))
}

const out = {
  _meta: {
    source: `${SITE}/ko/pets`,
    fetchedAt: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
    note: '펫 국내 이름·소개 문구·별 등급별 배틀 패시브 문구(인게임 표기). 사이트가 쓴 분석·추천 문구는 저장하지 않는다.',
  },
  pets,
}
await writeFile(join(ROOT, 'src/data/pet-text-ko.json'), `${JSON.stringify(out, null, 2)}\n`)
console.log(`저장: src/data/pet-text-ko.json, public/images/pets (${Object.keys(pets).length}종)`)
