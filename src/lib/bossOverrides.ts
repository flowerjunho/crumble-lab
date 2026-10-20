import type { BossEntry, StagesData } from '../types'

export interface BossOverride {
  /** 한 스테이지만 고칠 때: '챕터-스테이지' 형식, 예: '326-10' */
  stage?: string
  /** 여러 스테이지를 같은 보스로 고칠 때 */
  stages?: string[]
  /** stages.json bosses 목록의 한국어 이름과 정확히 같아야 한다(영어·일본어 이름은 그 목록에서 가져온다). */
  boss: string
  /** 보스 마리 수. 생략하면 같은 이름의 보스 목록 항목 중 첫 번째의 마리 수를 쓴다. */
  count?: number
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
 * 보스 목록은 [이름, 마리 수] 쌍이라서, 지정한 마리 수의 항목이 없으면 같은 이름으로 새 항목을 덧붙인다.
 * 적용하지 못한 항목은 problems로 알려 준다. 계산에 쓰는 전투력·명중·집중은 바꾸지 않는다.
 */
export function applyBossOverrides(
  data: StagesData,
  file: BossOverrideFile,
): { data: StagesData; problems: BossOverrideProblem[] } {
  const problems: BossOverrideProblem[] = []
  const bosses: BossEntry[] = [...data.bosses]

  const findBoss = (name: string, count: number | undefined): number | undefined => {
    const sameName = bosses.map((entry, index) => [entry, index] as const).filter(([entry]) => entry[0].ko === name)
    if (sameName.length === 0) return undefined
    if (count === undefined) return sameName[0]![1]
    const exact = sameName.find(([entry]) => entry[1] === count)
    if (exact) return exact[1]
    bosses.push([sameName[0]![0][0], count])
    return bosses.length - 1
  }

  const replacements = new Map<string, number>()
  for (const override of file.overrides) {
    const stages = [...(override.stage ? [override.stage] : []), ...(override.stages ?? [])]
    if (stages.length === 0) {
      problems.push({ stage: '(없음)', reason: `${override.boss}: stage 또는 stages가 필요합니다.` })
      continue
    }
    if (override.count !== undefined && (!Number.isInteger(override.count) || override.count < 1)) {
      problems.push({ stage: stages.join(', '), reason: 'count는 1 이상의 정수여야 합니다.' })
      continue
    }
    const bossIndex = findBoss(override.boss.trim(), override.count)
    if (bossIndex === undefined) {
      problems.push({ stage: stages.join(', '), reason: `보스 목록에 없는 이름입니다: ${override.boss}` })
      continue
    }
    for (const stage of stages) {
      const match = STAGE_PATTERN.exec(stage.trim())
      if (!match) {
        problems.push({ stage, reason: "stage는 '챕터-스테이지' 형식이어야 합니다." })
        continue
      }
      const key = `${Number(match[1])}-${Number(match[2])}`
      if (replacements.has(key)) problems.push({ stage, reason: '같은 스테이지가 두 번 들어 있습니다.' })
      replacements.set(key, bossIndex)
    }
  }

  const seen = new Set<string>()
  const rows = data.rows.map((row) => {
    const key = `${row[0]}-${row[1]}`
    const bossIndex = replacements.get(key)
    if (bossIndex === undefined) return row
    seen.add(key)
    const next: typeof row = [...row]
    next[5] = bossIndex
    return next
  })

  for (const key of replacements.keys()) {
    if (!seen.has(key)) problems.push({ stage: key, reason: '데이터에 없는 스테이지입니다.' })
  }

  return { data: { ...data, bosses, rows }, problems }
}
