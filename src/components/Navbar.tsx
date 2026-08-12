import { useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Camera, ChevronDown, ClipboardCheck, Home, Info, LayoutDashboard, LogOut, Mail, Menu, MessageSquareText, Shield, User, UserCheck, X, Zap } from 'lucide-react'
import Logo from '@/components/Logo'
import { useAuth } from '@/hooks/useAuth'
import { useSettings } from '@/hooks/useSettings'
import { cn, initials } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/events', label: 'Events' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/members', label: 'Members' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
]

const recruitLinks = [
  { to: '/recruit/gd', label: 'GD Round', icon: MessageSquareText },
  { to: '/recruit/interview', label: 'Interview', icon: ClipboardCheck },
  { to: '/recruit/final', label: 'Final Selection', icon: UserCheck },
]

export default function Navbar() {
  const { user, profile, isAdmin, signOut } = useAuth()
  const settings = useSettings()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [recruitOpen, setRecruitOpen] = useState(false)

  const showRecruit = profile?.role === 'member_ciie'
  const recruitActive = location.pathname.startsWith('/recruit')

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/70 backdrop-blur-xl">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link to="/" className="shrink-0" onClick={() => setOpen(false)}>
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900',
                  isActive && 'bg-slate-100 text-slate-900',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
          {user && (
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900',
                  isActive && 'bg-slate-100 text-slate-900',
                )
              }
            >
              Dashboard
            </NavLink>
          )}
          {showRecruit && (
            <div
              className="relative"
              onMouseEnter={() => setRecruitOpen(true)}
              onMouseLeave={() => setRecruitOpen(false)}
            >
              <button
                className={cn(
                  'flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900',
                  (recruitActive || recruitOpen) && 'bg-slate-100 text-slate-900',
                )}
                onClick={() => setRecruitOpen((v) => !v)}
                aria-expanded={recruitOpen}
              >
                Recruitments
                <ChevronDown size={14} className={cn('transition', recruitOpen && 'rotate-180')} />
              </button>
              {recruitOpen && (
                <div className="absolute left-0 top-full z-50 w-48">
                  <div className="mt-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                    {recruitLinks.map((l) => (
                      <NavLink
                        key={l.to}
                        to={l.to}
                        onClick={() => setRecruitOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900',
                            isActive && 'bg-slate-100 text-slate-900',
                          )
                        }
                      >
                        <l.icon size={15} /> {l.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              {isAdmin && (
                <Link to="/admin" className="btn-secondary !px-3 !py-1.5">
                  <Shield size={15} /> Admin
                </Link>
              )}
              <Link
                to="/dashboard/profile"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
                  {initials(profile?.full_name)}
                </span>
                <span className="hidden lg:inline">{profile?.full_name ?? user.email}</span>
              </Link>
              <button
                className="btn-ghost !px-2.5 !py-1.5"
                onClick={async () => {
                  await signOut()
                  navigate('/')
                }}
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">
                Log in
              </Link>
              <Link to="/register" className="btn-secondary">
                Register
              </Link>
              {settings.allow_public_signup && (
                <Link to="/signup" className="btn-primary">
                  Join CIIE
                </Link>
              )}
            </>
          )}
        </div>

        <button
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {item.to === '/' && <Home size={16} />}
                {item.to === '/members' && <User size={16} />}
                {item.to === '/events' && <Zap size={16} />}
                {item.to === '/gallery' && <Camera size={16} />}
                {item.to === '/about' && <Info size={16} />}
                {item.to === '/contact' && <Mail size={16} />}
                {item.label}
              </Link>
            ))}
            {user && (
              <Link
                to="/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <LayoutDashboard size={16} /> Dashboard
              </Link>
            )}
            {showRecruit && (
              <>
                <p className="mt-2 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Recruitments</p>
                {recruitLinks.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <l.icon size={16} /> {l.label}
                  </Link>
                ))}
              </>
            )}
            <div className="mt-2 border-t border-slate-200 pt-2">
              {user ? (
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                  onClick={async () => {
                    setOpen(false)
                    await signOut()
                    navigate('/')
                  }}
                >
                  <LogOut size={16} /> Sign out
                </button>
              ) : (
                <div className="flex gap-2">
                  <Link to="/login" className="btn-secondary flex-1" onClick={() => setOpen(false)}>
                    Log in
                  </Link>
                  <Link to="/register" className="btn-secondary flex-1" onClick={() => setOpen(false)}>
                    Register
                  </Link>
                  {settings.allow_public_signup && (
                    <Link to="/signup" className="btn-primary flex-1" onClick={() => setOpen(false)}>
                      Join CIIE
                    </Link>
                  )}
                </div>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
