import { Component } from 'react'

// Catches any uncaught render/lifecycle error anywhere in the tree below it
// and shows a friendly fallback instead of a blank white screen. This only
// ever activates on an actual crash — it renders its children untouched the
// rest of the time, so it has no effect on normal styling or behavior.
//
// Note: error boundaries must be class components — React has no hook
// equivalent for getDerivedStateFromError / componentDidCatch.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo)
  }

  handleReload = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={wrapStyle}>
          <div style={cardStyle}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Something went wrong</h2>
            <p style={{ margin: '0 0 16px', opacity: 0.75, fontSize: 14, lineHeight: 1.5 }}>
              An unexpected error occurred. Try reloading the page — if it keeps happening, please let us know.
            </p>
            <button onClick={this.handleReload} style={buttonStyle}>
              Reload
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

const wrapStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#0a0a0f',
  padding: 24,
}

const cardStyle = {
  maxWidth: 420,
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: 28,
  color: '#e5e5f0',
  textAlign: 'center',
}

const buttonStyle = {
  background: '#7c3aed',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}
