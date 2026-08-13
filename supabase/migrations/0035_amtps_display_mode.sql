-- ============================================================================
-- KL CIIE Platform V2 — 0035: AMTPS display mode
--
-- amtps_mode controls where the AMTPS team cards are shown to the public:
--   * true  (default) — "popup mode": cards show on the /members page and
--     clicking a card opens the details in a popup.
--   * false — "page mode": cards are hidden from /members; instead the team
--     opens on its own dedicated page (/amtps) with a full-screen layout.
-- Super admins toggle this from the AMTPS admin page (/admin/amtps).
-- ============================================================================

alter table public.platform_settings
  add column if not exists amtps_mode boolean not null default true;
