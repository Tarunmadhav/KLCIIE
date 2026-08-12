import { useBranding } from '@/hooks/useBranding'
import { cn } from '@/lib/utils'

interface LogoProps {
  variant?: 'default' | 'dark' | 'light'
  className?: string
}

export default function Logo({ variant = 'default', className }: LogoProps) {
  const branding = useBranding()
  const localLogo = '/logo.jpg'
  const url =
    variant === 'light'
      ? (branding.light_logo_url ?? localLogo)
      : variant === 'dark'
        ? (branding.dark_logo_url ?? localLogo)
        : (branding.ciie_logo_url ?? localLogo)

  if (url) {
    return <img src={url} alt="CIIE Logo" className={cn('h-10 w-auto object-contain', className)} />
  }
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-xl text-white',
          variant === 'light' ? 'bg-white/90 text-primary-700' : 'bg-primary-600',
        )}
      >
        <span className="text-lg font-black">C</span>
      </div>
      <div className="leading-tight">
        <div
          className={cn(
            'text-sm font-extrabold tracking-tight',
            variant === 'light' ? 'text-white' : 'text-slate-900',
          )}
        >
          KL CIIE
        </div>
        <div
          className={cn(
            'text-[10px] font-medium uppercase tracking-widest',
            variant === 'light' ? 'text-white/70' : 'text-slate-500',
          )}
        >
          Innovation & Entrepreneurship
        </div>
      </div>
    </div>
  )
}
