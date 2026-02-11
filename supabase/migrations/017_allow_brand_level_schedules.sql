-- ===========================================
-- Migration: Allow brand-level scheduled analyses
-- ===========================================
-- Previously, scheduled_analyses required prompt_id OR prompt_set_id (via CHECK constraint).
-- We now support brand-level schedules (both NULL) so auto-analysis can stay ON even when a brand has zero prompts.

ALTER TABLE public.scheduled_analyses
  DROP CONSTRAINT IF EXISTS scheduled_analyses_target_check;

-- New constraint: schedule can target:
-- - a single prompt (prompt_id)
-- - a prompt set (prompt_set_id)
-- - the entire brand (both NULL)
-- But it cannot target BOTH a prompt and a set at the same time.
ALTER TABLE public.scheduled_analyses
  ADD CONSTRAINT scheduled_analyses_target_exclusive_check
  CHECK (NOT (prompt_id IS NOT NULL AND prompt_set_id IS NOT NULL));


