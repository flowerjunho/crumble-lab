import { asset } from '../lib/asset'

export function Logo() {
  return (
    <span className="logo">
      <img className="logo-mark" src={asset('/brand/logo-128.png')} alt="" width="34" height="34" />
      <span className="logo-word">Crumble Lab</span>
    </span>
  )
}
