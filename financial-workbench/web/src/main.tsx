import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary message="화면을 그리다 문제가 생겼습니다.">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
