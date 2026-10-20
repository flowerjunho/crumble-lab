import type { StagesData } from '../types'

export interface BossOverride {
  /** '챕터-스테이지' 형식, 예: '326-10' */
  stage: string
  /** stages.json bosses 목록의 한국어 이름과 정확히 같아야 한다. */
  boss: string
  /** 언제·어떻게 확인했는지 남기는 메모(화면에는 쓰지 않는다) */
  memo?: string
}

export interface BossOverrideFile {
  overrides: BossOverride[]
}

export interface BossOverrideProblem {
  stage: string
  reason: string
}

const STAGE_PATTERN = /^(\d+)-(\d+)$/

/**
 * 원본 데이터의 스테이지별 보스를 보정 파일대로 바꾼 새 데이터를 돌려준다(원본은 건드리지 않는다).
 * 적용하지 못한 항목은 problems로 알려 준다. 계산에 쓰는 전투력·명중·집중은 바꾸지 않는다.
 */
export function applyBossOverrides(
  data: StagesData,
  file: BossOverrideFile,
): { data: StagesData; problems: BossOverrideProblem[] } {
  const problems: BossOverrideProblem[] = []
  const bossIndexByName = new Map<string, number>()
  data.bosses.forEach(([name], index) => {
    if (!bossIndexByName.has(name.ko)) bossIndexByName.set(name.ko, index)
  })

  const replacements = new Map<string, number>()
  for (const override of file.overrides) {
    const match = STAGE_PATTERN.exec(override.stage.trim())
    if (!match) {
      problems.push({ stage: override.stage, reason: "stage는 '챕터-스테이지' 형식이어야 합니다." })
      continue
    }
    const bossIndex = bossIndexByName.get(override.boss.trim())
    if (bossIndex === undefined) {
      problems.push({ stage: override.stage, reason: `보스 목록에 없는 이름입니다: ${override.boss}` })
      continue
    }
    replacements.set(`${Number(match[1])}-${Number(match[2])}`, bossIndex)
  }

  let applied = 0
  const rows = data.rows.map((row) => {
    const bossIndex = replacements.get(`${row[0]}-${row[1]}`)
    if (bossIndex === undefined) return row
    applied += 1
    const next: typeof row = [...row]
    next[5] = bossIndex
    return next
  })

  if (applied < replacements.size) {
    for (const key of replacements.keys()) {
      const [ch, st] = key.split('-').map(Number)
      if (!data.rows.some((row) => row[0] === ch && row[1] === st)) {
        problems.push({ stage: key, reason: '데이터에 없는 스테이지입니다.' })
      }
    }
  }

  return { data: { ...data, rows }, problems }
}
