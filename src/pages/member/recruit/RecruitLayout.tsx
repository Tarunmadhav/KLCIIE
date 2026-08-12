import { NavLink, Outlet } from 'react-router-dom'
import { ClipboardCheck, MessageSquareText, UserCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { to: '/recruit/gd', label: 'GD Round', icon: MessageSquareText },
  { to: '/recruit/interview', label: 'Interview', icon: ClipboardCheck },
  { to: '/recruit/final', label: 'Final Selection', icon: UserCheck },
]

export default function RecruitLayout() {
  return (
    <div className="container-page py-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Recruitments</h1>
      <p className="mt-1 text-sm text-slate-500">
        Evaluate applicants live across the GD, Interview and Final Selection rounds.
      </p>

      <nav className="mt-6 mb-6 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1.5">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
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
