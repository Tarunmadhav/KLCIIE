import { NavLink, Outlet } from 'react-router-dom'
import { Award, CalendarCheck, ClipboardList, LayoutDashboard, QrCode, ScanLine, Trophy, User } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

export default function MemberLayout() {
  const { profile } = useAuth()

  const tabs = [
    { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/dashboard/events', label: 'My Events', icon: CalendarCheck },
    { to: '/dashboard/points', label: 'My Points', icon: Award },
    { to: '/dashboard/leaderboard', label: 'Leaderboard', icon: Trophy },
    ...(profile?.role === 'member_ciie'
      ? [
          { to: '/dashboard/duties', label: 'Assigned Work', icon: ClipboardList },
          { to: '/dashboard/scan-qr', label: 'Scan QR', icon: ScanLine },
        ]
      : []),
    { to: '/dashboard/qr', label: 'QR Attendance', icon: QrCode },
    { to: '/dashboard/profile', label: 'Profile', icon: User },
  ]

  return (
    <div className="container-page py-8">
      <nav className="mb-6 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1.5">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100',
                isActive && 'bg-primary-600 text-white hover:bg-primary-600',
              )
            }
          >
            <t.icon size={16} />
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
