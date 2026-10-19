import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { BrowserRouter } from 'react-router'
import { I18nProvider } from './i18n'
import { App } from './App'
import './styles.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, refetchOnWindowFocus: false },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        {/* GitHub Pages 같은 하위 경로 배포에서도 /stage 등이 base 뒤에 붙도록 한다. */}
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <App />
        </BrowserRouter>
      </I18nProvider>
      <ReactQueryDevtools buttonPosition="bottom-right" />
    </QueryClientProvider>
  </StrictMode>,
)
