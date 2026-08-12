import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ListingTemplatePreviewBridge } from './components/ListingTemplatePreviewBridge'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <ListingTemplatePreviewBridge />
  </StrictMode>,
)
