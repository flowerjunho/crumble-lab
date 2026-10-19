import { readStorage, writeStorage } from './storage'

/**
 * 일반 스테이지와 차원의 이면이 함께 쓰는 팀 전투력(M 단위 입력 문자열).
 * 두 화면은 동시에 그려지지 않으므로, 화면이 열릴 때 읽고 값이 바뀔 때 쓰는 것으로 충분하다.
 */
const TEAM_POWER_KEY = 'crumble.team-power'

/** 저장된 값이 없으면 null. 빈 문자열은 "지운 상태"로 저장된 값이다. */
export function readTeamPower(): string | null {
  const value = readStorage(TEAM_POWER_KEY)
  return value !== null && value.length <= 32 ? value : null
}

export function writeTeamPower(value: string): void {
  writeStorage(TEAM_POWER_KEY, value)
}
