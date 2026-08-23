import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Catches render / lazy-chunk failures anywhere below the router and shows a
 * recovery screen instead of a blank white page.
 */
export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(_error: unknown, _info: ErrorInfo) {
    // Intentionally silent — no console noise.
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-bold text-slate-900">Something went wrong loading this page.</p>
        <p className="max-w-md text-sm text-slate-500">
          This usually fixes itself. Reload the page — if a new version was just deployed this will fetch it.
        </p>
        <div className="flex items-center gap-3">
          <Button onClick={() => window.location.reload()}>
            <RefreshCw size={15} /> Reload page
          </Button>
          <Link to="/" className="text-sm font-medium text-primary-600 hover:underline">
            Go to home
          </Link>
        </div>
      </div>
    )
  }
}
