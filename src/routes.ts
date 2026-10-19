export const ROUTES = {
  stage: '/stage',
  recommend: '/recommend',
  guide: '/guide',
} as const

/** 예전 주소로 들어와도 새 주소로 보낸다. */
export const LEGACY_REDIRECTS: Record<string, string> = {
  '/stage-check': ROUTES.stage,
  '/option-consult': ROUTES.recommend,
}
