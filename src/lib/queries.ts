import { supabase } from '@/lib/supabase'
import type { Event, EventTeamMember, LeaderboardRow, Profile } from '@/lib/types'
import { isEventEnded } from '@/lib/utils'

/**
 * Loose type for a `profiles` query builder used by the pagination helper.
 * Kept opaque because supabase-js builder generics are deep/unstable to restate.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ProfileQuery = any

export interface LeaderboardFilters {
  academic_year?: string
  department?: string
  year?: string
  team?: string
  period?: 'all' | 'current'
}

/** Public-safe event registration counts (anon cannot read registrations directly). */
export async function fetchEventCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('get_event_counts')
  if (error || !data) return {}
  const map: Record<string, number> = {}
  for (const row of data as Array<{ event_id: string; registrations: number }>) {
    map[row.event_id] = row.registrations
  }
  return map
}

/** Event coordinator display names keyed by event id (public data only). */
export async function fetchCoordinators(eventIds: string[]): Promise<Record<string, string[]>> {
  if (eventIds.length === 0) return {}
  const { data } = await supabase
    .from('event_team_members')
    .select('event_id, member:profiles!inner(full_name), role:event_roles!inner(name, category)')
    .in('event_id', eventIds)
    .eq('is_public', true)
    .eq('role.category', 'coordinator')
  const map: Record<string, string[]> = {}
  for (const row of (data ?? []) as unknown as EventTeamMember[]) {
    const name = row.member?.full_name
    if (name) {
      map[row.event_id] = [...(map[row.event_id] ?? []), name]
    }
  }
  return map
}

export async function fetchPublishedEvents({
  status = 'published',
  upcomingOnly = false,
  category,
}: { status?: 'published' | 'completed'; upcomingOnly?: boolean; category?: string } = {}): Promise<Event[]> {
  let query = supabase.from('events').select('*').eq('status', status).neq('audience', 'faculty')
  if (category && category !== 'all') query = query.eq('category', category)
  if (upcomingOnly) query = query.gte('start_date', new Date().toISOString().slice(0, 10))
  query = query.order('start_date', { ascending: true })
  const { data, error } = await query
  if (error) return []
  let events = (data ?? []) as Event[]
  // Drop events whose end date/time has already passed so finished events stop
  // showing in "Upcoming Events".
  if (upcomingOnly) events = events.filter((e) => !isEventEnded(e))
  return events
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function fetchEvent(idOrSlug: string): Promise<Event | null> {
  const byUuid = UUID_RE.test(idOrSlug)
  let query = supabase.from('events').select('*')
  if (byUuid) query = query.eq('id', idOrSlug)
  else query = query.eq('slug', idOrSlug)
  const { data, error } = await query.maybeSingle()
  if (error) return null
  return (data ?? null) as Event | null
}

export async function fetchLeaderboard(filters: LeaderboardFilters = {}): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase.rpc('get_leaderboard', {
    p_academic_year: filters.academic_year || null,
    p_department: filters.department || null,
    p_year: filters.year || null,
    p_team: filters.team || null,
    p_period: filters.period || 'all',
  })
  if (error) return []
  return (data ?? []) as LeaderboardRow[]
}

export async function fetchAcademicYears(): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('academic_year')
    .not('academic_year', 'is', null)
    .order('academic_year')
  return Array.from(new Set((data ?? []).map((r) => r.academic_year as string)))
}

export async function fetchDepartments(): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('department')
    .not('department', 'is', null)
    .order('department')
  return Array.from(new Set((data ?? []).map((r) => r.department as string)))
}

export async function fetchTeams(): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('team')
    .not('team', 'is', null)
    .order('team')
  return Array.from(new Set((data ?? []).map((r) => r.team as string)))
}

/**
 * Fetch EVERY row of a query, paginating past Supabase's 1000-row default cap
 * so admin pages show the full dataset instead of only the first ~998 rows.
 * `configure` lets callers add filters/ordering to the underlying query.
 */
export async function fetchAllRows<T = unknown>(
  table: string,
  select = '*',
  configure?: (q: ProfileQuery) => ProfileQuery,
): Promise<T[]> {
  const pageSize = 1000
  const all: T[] = []
  let from = 0
  for (;;) {
    let q: ProfileQuery = supabase.from(table).select(select) as unknown as ProfileQuery
    if (configure) q = configure(q)
    q = q.range(from, from + pageSize - 1) as ProfileQuery
    const { data, error } = await q
    if (error) throw error
    const chunk = (data ?? []) as T[]
    all.push(...chunk)
    if (chunk.length < pageSize) break
    from += pageSize
  }
  return all
}

/** Convenience wrapper for paginated `profiles` reads. */
export async function fetchAllProfiles<T = Profile>(
  select: string,
  configure?: (q: ProfileQuery) => ProfileQuery,
): Promise<T[]> {
  return fetchAllRows<T>('profiles', select, configure)
}
