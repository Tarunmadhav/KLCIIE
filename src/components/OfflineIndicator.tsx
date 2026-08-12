import { useEffect, useState } from 'react'
import { CheckCircle2, Wifi, WifiOff } from 'lucide-react'

export default function OfflineIndicator() {
  const [offline, setOffline] = useState<boolean>(() => typeof navigator !== 'undefined' && !navigator.onLine)
  const [reconnected, setReconnected] = useState(false)

  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline = () => {
      setOffline(false)
      setReconnected(true)
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  useEffect(() => {
    if (!reconnected) return
    const t = window.setTimeout(() => setReconnected(false), 3000)
    return () => window.clearTimeout(t)
  }, [reconnected])

  return (
    <>
      {offline && (
        <div className="fixed inset-x-0 top-0 z-[70] animate-slide-down bg-gradient-to-r from-red-600 via-rose-600 to-orange-500 text-white shadow-lg shadow-red-600/20">
          <div className="container-page flex items-center gap-4 px-4 py-3 sm:px-6">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30">
              <WifiOff size={20} className="animate-pulse" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-bold">
                You're offline
                <span className="hidden h-1.5 w-1.5 rounded-full bg-white/70 sm:inline-block" />
                <span className="hidden text-xs font-medium text-white/80 sm:inline">No internet connection</span>
              </p>
              <p className="mt-0.5 text-xs text-white/85">
                Check your connection. Your changes may not be saved until you're back online.
              </p>
            </div>
            <Wifi size={18} className="hidden shrink-0 text-white/60 sm:block" />
          </div>
        </div>
      )}

      {reconnected && (
        <div className="fixed right-4 top-4 z-[70] flex animate-slide-in-right items-center gap-3 rounded-xl border border-green-200 bg-white px-4 py-3 shadow-xl shadow-green-600/10">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-green-600">
            <CheckCircle2 size={18} />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-900">Back online</p>
            <p className="text-xs text-slate-500">Your connection has been restored.</p>
          </div>
        </div>
      )}
    </>
  )
}
