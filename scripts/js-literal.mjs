/**
 * 자바스크립트 번들 안의 데이터 리터럴({...}, [...])을 실행하지 않고 읽는 작은 파서.
 * 지원: 객체(따옴표 없는 키 포함), 배열, 문자열("..."), 숫자(.5, 1e3, -2), true/false/null, !0/!1, void 0.
 */
export function readLiteralAt(text, start) {
  let i = start
  const ws = () => {
    while (i < text.length && /\s/.test(text[i])) i++
  }
  const fail = (msg) => {
    throw new Error(`${msg} @${i}: ${text.slice(i, i + 40)}`)
  }
  function value() {
    ws()
    const ch = text[i]
    if (ch === '{') return object()
    if (ch === '[') return array()
    if (ch === '"' || ch === "'") return string()
    if (ch === '!') {
      const v = text[i + 1]
      i += 2
      return v === '0'
    }
    if (text.startsWith('true', i)) return (i += 4), true
    if (text.startsWith('false', i)) return (i += 5), false
    if (text.startsWith('null', i)) return (i += 4), null
    if (text.startsWith('void 0', i)) return (i += 6), null
    const num = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(text.slice(i, i + 40))
    if (num) return (i += num[0].length), Number(num[0])
    return fail('알 수 없는 값')
  }
  function string() {
    const quote = text[i++]
    let out = ''
    while (text[i] !== quote) {
      if (text[i] === '\\') {
        const next = text[i + 1]
        if (next === 'u') {
          out += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16))
          i += 6
          continue
        }
        out += { n: '\n', t: '\t', r: '\r' }[next] ?? next
        i += 2
        continue
      }
      out += text[i++]
    }
    i++
    return out
  }
  function key() {
    ws()
    if (text[i] === '"' || text[i] === "'") return string()
    const m = /^[A-Za-z_$0-9][\w$]*/.exec(text.slice(i, i + 80))
    if (!m) fail('키를 읽지 못했습니다')
    i += m[0].length
    return m[0]
  }
  function object() {
    i++
    const out = {}
    ws()
    while (text[i] !== '}') {
      const k = key()
      ws()
      if (text[i] !== ':') fail("':'가 필요합니다")
      i++
      out[k] = value()
      ws()
      if (text[i] === ',') i++
      ws()
    }
    i++
    return out
  }
  function array() {
    i++
    const out = []
    ws()
    while (text[i] !== ']') {
      out.push(value())
      ws()
      if (text[i] === ',') i++
      ws()
    }
    i++
    return out
  }
  const result = value()
  return { value: result, end: i }
}

/** `이름=` 바로 뒤의 리터럴을 읽는다. 같은 이름이 여러 번 나오면 pattern으로 좁힌다. */
export function readNamedLiteral(text, name, pattern = '') {
  const re = new RegExp(`[,;{\\s]${name.replace(/\$/g, '\\$')}=(?=${pattern || '[\\[{]'})`)
  const m = re.exec(text)
  if (!m) throw new Error(`${name} 리터럴을 찾지 못했습니다.`)
  return readLiteralAt(text, m.index + m[0].length).value
}
