import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { isAdminRole } from '@/lib/types'
import { PageLoader } from '@/components/ui'

/**
 * Returns the MFA route an admin must visit before the Admin Console,
 * or null when they are clear to proceed. Every admin role is MFA-gated;
 * non-admin roles sign in with just email + password.
 */
export function useMfaRedirect(): string | null {
  const { profile, mfa } = useAuth()
  if (!profile || !isAdminRole(profile.role)) return null
  if (profile.mfa_setup_required) return '/auth/mfa-setup'
  if (!mfa) return null
  if (!mfa.hasVerifiedFactor) return '/auth/mfa-setup'
  if (mfa.aal !== 'aal2') return '/auth/mfa-verify'
  return null
}

export function RequireAuth({ children }: { children?: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return <>{children ?? <Outlet />}</>
}

export function RequireAdmin({ children }: { children?: ReactNode }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()
  const mfaPath = useMfaRedirect()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (!profile || !isAdminRole(profile.role)) return <Navigate to="/dashboard" replace />
  if (mfaPath) return <Navigate to={mfaPath} replace />
  return <>{children ?? <Outlet />}</>
}

export function RequireSuperAdmin({ children }: { children?: ReactNode }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()
  const mfaPath = useMfaRedirect()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (!profile || (profile.role !== 'super_admin' && profile.role !== 'main_admin')) return <Navigate to="/dashboard" replace />
  if (mfaPath) return <Navigate to={mfaPath} replace />
  return <>{children ?? <Outlet />}</>
}

export function RequireCiiieMember({ children }: { children?: ReactNode }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (!profile || profile.role !== 'member_ciie') return <Navigate to="/dashboard" replace />
  return <>{children ?? <Outlet />}</>
}
