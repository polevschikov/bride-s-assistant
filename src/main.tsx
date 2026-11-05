import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import '@fontsource/noto-serif/latin-300.css'
import '@fontsource/noto-serif/cyrillic-300.css'
import '@fontsource/noto-serif/latin-400.css'
import '@fontsource/noto-serif/cyrillic-400.css'
import '@fontsource/noto-sans/latin-400.css'
import '@fontsource/noto-sans/cyrillic-400.css'
import '@fontsource/noto-sans/latin-500.css'
import '@fontsource/noto-sans/cyrillic-500.css'
import '@fontsource/noto-sans/latin-600.css'
import '@fontsource/noto-sans/cyrillic-600.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
