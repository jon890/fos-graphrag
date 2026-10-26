import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary message="화면을 그리다 문제가 생겼습니다.">
      {/* 주소 갱신을 startTransition 으로 감싸면 같은 콜백에서 바꾼 일반 상태가 옛 주소로 먼저 그려진다 */}
      <BrowserRouter useTransitions={false}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
