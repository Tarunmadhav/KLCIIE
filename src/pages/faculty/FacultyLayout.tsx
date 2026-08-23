import { NavLink, Outlet } from 'react-router-dom'
import { CalendarDays, ClipboardList, QrCode, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { to: '/faculty', label: 'Faculty Events', icon: CalendarDays, end: true },
  { to: '/faculty/forms', label: 'Forms', icon: ClipboardList },
  { to: '/faculty/qr', label: 'QR Attendance', icon: QrCode },
  { to: '/faculty/profile', label: 'Profile', icon: User },
]

export default function FacultyLayout() {
  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="text-xl font-extrabold text-slate-900">Faculty Panel</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          CIIE events for faculty — you're registered automatically, just show your QR during each attendance round.
        </p>
      </div>
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
