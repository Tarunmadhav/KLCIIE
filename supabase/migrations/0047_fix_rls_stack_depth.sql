-- ============================================================================
-- KL CIIE Platform V2 — 0047: fix "stack depth limit exceeded" on profiles
--
-- Migration 0042 introduced public.is_mfa_required_role() as SECURITY INVOKER.
-- It reads public.profiles, and the RESTRICTIVE RLS policies on profiles call
-- it back — so every authenticated SELECT/UPDATE on profiles recursed:
--
--   select profiles → restrictive policy → is_mfa_required_role()
--     → select profiles → restrictive policy → … 💥 stack depth limit exceeded
--
-- Result: HTTP 500 + "Profile not found" for EVERY logged-in user, while anon
-- visitors kept working (restrictive policies only target `authenticated`).
--
-- Fix: mark the function SECURITY DEFINER so its internal profiles read runs
-- as the table owner and bypasses RLS, terminating the recursion. It only
-- returns a boolean about the caller's own role, so no data is exposed.
-- ============================================================================

create or replace function public.is_mfa_required_role()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
      and status = 'active'
  )
$$;

grant execute on function public.is_mfa_required_role() to anon, authenticated;
