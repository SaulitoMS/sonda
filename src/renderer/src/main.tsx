import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { restoreSession, startSessionPersistence } from './lib/session'

// Antes de renderizar, para que no se vea un instante la pestaña por defecto
restoreSession()
startSessionPersistence()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
