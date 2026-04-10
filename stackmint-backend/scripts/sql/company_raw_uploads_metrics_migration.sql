-- company_raw_uploads metrics + timestamp compatibility migration
-- Safe to run multiple times.

BEGIN;

ALTER TABLE public.company_raw_uploads
  ADD COLUMN IF NOT EXISTS quality_score numeric,
  ADD COLUMN IF NOT EXISTS validated_rows integer,
  ADD COLUMN IF NOT EXISTS error_rows integer,
  ADD COLUMN IF NOT EXISTS total_rows integer,
  ADD COLUMN IF NOT EXISTS emissions_calculated_rows integer,
  ADD COLUMN IF NOT EXISTS emissions_skipped_rows integer,
  ADD COLUMN IF NOT EXISTS parsing_stage_summary jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Backfill created_at from uploaded_at if present.
UPDATE public.company_raw_uploads
SET created_at = COALESCE(created_at, uploaded_at)
WHERE created_at IS NULL;

-- Ensure updated_at is at least populated.
UPDATE public.company_raw_uploads
SET updated_at = COALESCE(updated_at, created_at, uploaded_at, now())
WHERE updated_at IS NULL;

-- Keep updated_at fresh on every update.
CREATE OR REPLACE FUNCTION public.set_company_raw_uploads_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_raw_uploads_updated_at ON public.company_raw_uploads;
CREATE TRIGGER trg_company_raw_uploads_updated_at
BEFORE UPDATE ON public.company_raw_uploads
FOR EACH ROW
EXECUTE FUNCTION public.set_company_raw_uploads_updated_at();

-- Helpful optional indexes for worker polling and debugging.
CREATE INDEX IF NOT EXISTS idx_company_raw_uploads_parsing_status
  ON public.company_raw_uploads (parsing_status);

CREATE INDEX IF NOT EXISTS idx_company_raw_uploads_org_status
  ON public.company_raw_uploads (organization_id, parsing_status);

COMMIT;
