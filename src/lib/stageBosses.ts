import type { BossEntry, StageBossesData, StagesData } from '../types'

/**
 * 스테이지 수치(전투력·명중·집중)는 stages.json 그대로 두고, 스테이지별 보스만
 * stage-bosses.json(게임 클라이언트 기준) 값으로 바꾼다.
 * 결과의 bosses는 [이름, 마리 수] 쌍이고, 각 행의 보스 인덱스는 이 목록을 가리킨다.
 */
export function mergeStageBosses(stages: StagesData, stageBosses: StageBossesData): StagesData {
  if (stageBosses.rows.length !== stages.rows.length) {
    throw new Error(`스테이지 보스 데이터 개수(${stageBosses.rows.length})가 스테이지 수(${stages.rows.length})와 다릅니다.`)
  }
  const bosses: BossEntry[] = []
  const indexOf = new Map<string, number>()
  const rows = stages.rows.map((row) => {
    const [bossIndex, count] = stageBosses.rows[(row[0] - 1) * 30 + (row[1] - 1)]!
    const key = `${bossIndex}:${count}`
    let index = indexOf.get(key)
    if (index === undefined) {
      index = bosses.push([stageBosses.bosses[bossIndex]!, count]) - 1
      indexOf.set(key, index)
    }
    const next: typeof row = [...row]
    next[5] = index
    return next
  })
  return { ...stages, bosses, rows }
}
