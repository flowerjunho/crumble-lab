/** 사생활 보호 모드처럼 저장소 접근이 막힌 환경에서도 화면이 깨지지 않도록 감싼다. */
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 저장에 실패해도 계산은 계속 동작한다.
  }
}
