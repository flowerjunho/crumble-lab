import { useState } from 'react'
import { writeStorage } from '../lib/storage'

type Theme = 'dark' | 'light'

const THEME_KEY = 'crumble.theme'

/** index.html의 인라인 스크립트가 첫 렌더 전에 정한 테마를 이어받는다. */
const currentTheme = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    writeStorage(THEME_KEY, next)
    setTheme(next)
  }

  const label = theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'
  return (
    <button type="button" className="icon-button theme-toggle" onClick={toggle} aria-label={label} title={label}>
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        </svg>
      )}
    </button>
  )
}
