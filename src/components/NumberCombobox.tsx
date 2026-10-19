import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

export interface ComboOption {
  value: number
  /** 목록에서 숫자 옆에 흐리게 붙는 설명(예: 보스 이름) */
  hint?: string
}

interface NumberComboboxProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: ComboOption[]
  placeholder?: string
  /** 목록을 입력 칸의 어느 쪽 끝에 맞출지. 화면 오른쪽에 있는 칸은 end로 둬야 잘리지 않는다. */
  align?: 'start' | 'end'
}

/**
 * 숫자를 직접 입력하거나 목록에서 고를 수 있는 입력 칸.
 * 입력값은 그대로 반영하고, 목록은 입력 칸을 누르거나 화살표 버튼을 누르면 열린다.
 * 화살표 버튼은 입력 칸에 포커스를 주지 않아서 모바일에서 키보드가 올라오지 않는다.
 */
export function NumberCombobox({ id, label, value, onChange, options, placeholder, align = 'start' }: NumberComboboxProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()

  const selectedIndex = options.findIndex((option) => String(option.value) === value.trim())

  const openList = () => {
    setActive(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }

  // 목록 밖을 누르면 닫는다.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // 선택된 항목이 보이도록 목록 안에서만 스크롤한다. scrollIntoView는 페이지까지 움직여서 쓰지 않는다.
  useEffect(() => {
    const list = listRef.current
    if (!open || active < 0 || !list) return
    const item = list.children[active] as HTMLElement | undefined
    if (!item) return
    if (item.offsetTop < list.scrollTop) {
      list.scrollTop = item.offsetTop
    } else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight
    }
  }, [open, active])

  const select = (option: ComboOption) => {
    onChange(String(option.value))
    setActive(options.indexOf(option))
    setOpen(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        openList()
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => Math.min(options.length - 1, Math.max(0, current + step)))
    } else if (event.key === 'Enter') {
      if (open && options[active]) {
        event.preventDefault()
        select(options[active])
      }
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div className="combobox" ref={rootRef}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        placeholder={placeholder}
        value={value}
        onClick={() => (open ? setOpen(false) : openList())}
        onChange={(event) => {
          // 숫자만 받는다. 입력한 값은 바로 반영하고, 목록이 열려 있으면 같은 번호로 옮긴다.
          const next = event.target.value.replace(/[^\d]/g, '')
          onChange(next)
          const index = options.findIndex((option) => String(option.value) === next)
          if (index >= 0) setActive(index)
        }}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="combobox-toggle"
        tabIndex={-1}
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? setOpen(false) : openList())}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul id={listId} ref={listRef} role="listbox" aria-label={label} className={`combobox-list align-${align}`}>
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === selectedIndex}
              className={index === active ? 'is-active' : undefined}
              // 입력 칸의 포커스를 빼앗지 않도록 mousedown 기본 동작을 막는다.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => select(option)}
            >
              <b>{option.value}</b>
              {option.hint && <span>{option.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
