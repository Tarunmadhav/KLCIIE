# KL CIIE Platform V2

KL CIIE member portal + admin console (Super Admin MFA-protected).
Built with Vite + React 18 + TypeScript + Tailwind CSS v4, backed by Supabase (Postgres + Auth + RLS).

## Prerequisites

- Node.js 18+
- A Supabase project (cloud or local `supabase start`)

## Setup

```bash
npm install
cp .env.example .env
```

Set the two values in `.env`:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon key>
```

## Database Setup

Apply the migrations in order against your Supabase project (SQL Editor, or
`supabase db push` with the CLI). Order matters:

| File | Purpose |
| --- | --- |
| `0001_schema.sql` | Tables, enums, indexes, views (`profiles`, `events`, `event_registrations`, `event_team_members`, `attendance`, `point_rules`, `member_points_transactions`, `member_achievements`, `event_roles`, `gallery_items`, `announcements`, `posts`, `branding_settings`, `admin_audit_logs`, `admin_recovery_codes`, `member_qr_codes`, views) |
| `0002_functions.sql` | RPC functions: `is_admin`, `is_super_admin`, `admin_aal2`, `mark_attendance`, `award_points`, `get_points_stats`, `get_member_rank`, `fetch_leaderboard`, `reset_admin_mfa`, `get_public_member`, MFA helpers, etc. |
| `0003_triggers.sql` | Auto `profiles` row + CIIE id on signup (new signups become `pending` recruits with an alternating interview batch), admin role restrictions, audit logging |
| `0004_policies.sql` | RLS policies (all tables). Restrictive MFA policies gate only `super_admin`; other admins need no MFA |
| `0005_seed.sql` | Default point rules, event roles, branding row, optional starter events |
| `0006_helpers.sql` | Client-facing helpers: `log_failed_admin_login`, `log_admin_login`, `log_admin_event`, ticket lookup, `get_admin_audit_logs` |
| `0007_recruitment_and_settings.sql` | `platform_settings` (single row), recruitment statuses + `interview_batch`, `event_team_members.hours_worked`, super-admin-only `admin_aal2()` |

> Existing databases that already ran `0004_policies.sql` before this change: after
> applying `0007`, re-run the updated `0004_policies.sql` — it is idempotent and
> rewrites the MFA-restrictive policies so only Super Admin is MFA-gated.

Then promote your admin account (run in SQL Editor after registering). New signups
are `pending` by default, so set `status` too:

```sql
update public.profiles
set role = 'super_admin', status = 'active', mfa_setup_required = true
where email = 'you@example.com';
```

The next login for that account will force MFA setup before the Admin Console is reachable.

## Registration & Recruitment

- The **Register** button only appears when `allow_public_signup` is ON (Admin →
  System → Settings, Super Admin only). When OFF, signups are blocked site-wide.
- With domain restriction ON, only the configured domains (default
  `@kluniversity.in`) can register; when OFF, every domain is allowed.
- New registrations become **pending** applicants. The Super Admin sets two
  GD/Interview dates in Settings; applicants are split by registration order —
  batch 1 attends on the first date, batch 2 on the second. The assigned date is
  shown right after registration and on the member dashboard.
- Approve applicants in Admin → People → Recruits: **Recruit to CIIE** (assigns a
  role, e.g. QR Code Scanner / `attendance_coordinator`) or **Now a member**
  (regular active member).

## Running

```bash
npm run dev       # local dev server
npm run build     # typecheck (tsc -b) + production build
npm run typecheck # typecheck only
```

## Notes

- **MFA** is required only for `super_admin`, enforced at the database layer via
  `admin_aal2()` (super admin + `aal2` JWT claim from a verified TOTP factor).
  Every other role signs in with just email + password.
- Attendance is keyed off the `attendance` table; certificates are generated for
  present members with linked registrations.
- The scanner distinguishes ticket QR codes (`ticket`) from attendance/member QR
  codes (`member`). Scanning a ticket only verifies the registration (shows the
  details, never marks attendance); scanning a member/attendance QR marks the
  round attendance.
- Members show their attendance QR under Dashboard → **Attendance**.
- Event team assignments (role + hours worked) appear in Dashboard → **My Events**.
- `Event.form_fields` is an opaque JSON array; cast to your form schema when editing.
