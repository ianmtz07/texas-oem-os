import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import PhotoLab from './components/PhotoLab'

const isPhotoLab =
  window.location.pathname === '/photo-test'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPhotoLab ? <PhotoLab /> : <App />}
  </StrictMode>,
)
