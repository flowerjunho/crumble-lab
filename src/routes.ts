export const ROUTES = {
  stage: '/stage',
  dimension: '/stage/dimension',
  info: '/info',
  cookies: '/info/cookies',
  recommend: '/recommend',
  guide: '/guide',
} as const

/** 마지막으로 본 스테이지 화면(normal | dimension) */
export const STAGE_MODE_KEY = 'crumble.stage-mode'

/** 예전 주소로 들어와도 새 주소로 보낸다. */
export const LEGACY_REDIRECTS: Record<string, string> = {
  '/stage-check': ROUTES.stage,
  '/option-consult': ROUTES.recommend,
}
