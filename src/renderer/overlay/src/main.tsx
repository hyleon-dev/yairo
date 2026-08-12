import React from 'react'
import ReactDOM from 'react-dom/client'
// Must be imported before App, so per-overlay CSS overrides (e.g. idle states)
// come later in the cascade than the shared .card defaults and can win.
import '../../../shared/theme.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
