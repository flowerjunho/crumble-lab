#!/usr/bin/env node
/**
 * 쿠키별 국내 스킬 이름(예: 피겨여왕맛 쿠키 → 완벽한 연기)을 src/data/cookie-skill-names-ko.json으로 저장한다.
 * 출처는 cookieruncrumble.net의 한국어 쿠키 페이지(인게임 표기). 스킬 이름만 가져오고 스킬 설명 문구는 가져오지 않는다.
 *
 * 사용법: node scripts/import-skill-names-ko.mjs
 */
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SITE = 'https://cookieruncrumble.net'
const decode = (s) =>
  s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, '').trim()

const sitemap = await (await fetch(`${SITE}/sitemap.xml`)).text()
const slugs = [...new Set([...sitemap.matchAll(/cookieruncrumble\.net\/ko\/cookies\/([a-z0-9-]+)</g)].map((m) => m[1]))]
if (slugs.length === 0) throw new Error('사이트맵에서 쿠키 페이지를 찾지 못했습니다.')

const names = {}
for (const slug of slugs) {
  const html = await (await fetch(`${SITE}/ko/cookies/${slug}`, { headers: { 'user-agent': 'Mozilla/5.0' } })).text()
  const cookie = decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '')
  // 본문의 '스킬' 제목 바로 다음 텍스트가 스킬 이름이다.
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').split(/<[^>]+>/).map(decode).filter(Boolean)
  const at = text.indexOf('스킬')
  const skill = at >= 0 ? text[at + 1] : null
  if (!cookie || !skill) throw new Error(`${slug}: 쿠키 이름이나 스킬 이름을 찾지 못했습니다.`)
  names[cookie] = skill
}

const out = {
  _meta: {
    source: `${SITE}/ko/cookies`,
    fetchedAt: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
    note: '쿠키 국내 이름 → 국내 스킬 이름. 스킬 설명 문구는 저장하지 않는다.',
  },
  names,
}
await writeFile(join(ROOT, 'src/data/cookie-skill-names-ko.json'), `${JSON.stringify(out, null, 2)}\n`)
console.log(`저장: src/data/cookie-skill-names-ko.json (${Object.keys(names).length}종)`)
