/**
 * public 폴더 파일의 주소. GitHub Pages처럼 하위 경로(/crumble-lab/)에 배포해도 맞는 주소가 되도록
 * Vite의 base를 앞에 붙인다. 인자는 '/data/x.json'처럼 슬래시로 시작해도 된다.
 */
export const asset = (path: string): string => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
