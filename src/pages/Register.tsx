import { Link, Navigate } from 'react-router-dom'
import { ArrowRight, KeyRound, Ticket, UserPlus } from 'lucide-react'
import { useSettings } from '@/hooks/useSettings'

export default function Register() {
  const settings = useSettings()

  if (!settings.allow_public_signup) {
    return <Navigate to="/register/user" replace />
  }

  return (
    <div className="container-page max-w-3xl py-12">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary-700">
          <KeyRound size={13} /> KL CIIE Registration
        </span>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900">Create your account</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
          Create a user account to register for events, or apply to join CIIE through recruitment.
        </p>
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        <Link
          to="/register/user"
          className="card group flex flex-col p-6 transition hover:-translate-y-1 hover:border-primary-300 hover:shadow-lg"
        >
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-600 transition group-hover:bg-primary-600 group-hover:text-white">
            <Ticket size={22} />
          </span>
          <h2 className="text-lg font-extrabold text-slate-900">Create user account</h2>
          <p className="mt-1 flex-1 text-sm text-slate-500">
            Register and sign in to book event seats, tickets and attendance QR. No key needed.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary-600">
            Sign up now <ArrowRight size={14} />
          </span>
        </Link>

        <Link
          to="/signup"
          className="card group flex flex-col p-6 transition hover:-translate-y-1 hover:border-primary-300 hover:shadow-lg"
        >
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 transition group-hover:bg-primary-600 group-hover:text-white">
            <UserPlus size={22} />
          </span>
          <h2 className="text-lg font-extrabold text-slate-900">Join CIIE</h2>
          <p className="mt-1 flex-1 text-sm text-slate-500">
            General recruitment. Apply as a CIIE member through the GD &amp; interview process.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary-600">
            Get started <ArrowRight size={14} />
          </span>
        </Link>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        Role-specific registrations (members, admins) are by invitation link only and are not listed here.
      </p>

      <p className="mt-4 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-primary-600 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  )
}
