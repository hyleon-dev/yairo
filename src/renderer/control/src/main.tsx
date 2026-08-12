import React from 'react'
import ReactDOM from 'react-dom/client'
// Must be imported before App, so component-level CSS overrides come later
// in the cascade than these shared defaults and can win.
import '../../../shared/theme.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
