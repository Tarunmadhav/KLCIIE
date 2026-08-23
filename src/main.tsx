import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import { installDevtoolsGuard } from '@/lib/devtoolsGuard'
import '@/index.css'

installDevtoolsGuard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
