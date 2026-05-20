-- company_locations geocoding migration
-- Fixes location_address column type (text[] → text) and adds latitude/longitude.
-- Safe to run multiple times.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Ensure location_address is stored as plain text (not text[])
--    If the column is currently text[] (array type), convert it.
--    Existing rows have their first element promoted to a plain string.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF (
    SELECT udt_name
    FROM   information_schema.columns
    WHERE  table_schema = 'public'
      AND  table_name   = 'company_locations'
      AND  column_name  = 'location_address'
  ) = '_text' THEN          -- _text is the internal name for text[]
    ALTER TABLE public.company_locations
      ALTER COLUMN location_address TYPE text
      USING CASE
        WHEN location_address IS NULL        THEN NULL
        WHEN array_length(location_address, 1) > 0
                                             THEN location_address[1]
        ELSE ''
      END;
    RAISE NOTICE 'location_address converted from text[] to text.';
  ELSE
    RAISE NOTICE 'location_address is already plain text — no type change needed.';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Add latitude and longitude columns for geocoding
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.company_locations
  ADD COLUMN IF NOT EXISTS latitude  float8,
  ADD COLUMN IF NOT EXISTS longitude float8;

-- Optional: index to support geo-proximity queries in the future
CREATE INDEX IF NOT EXISTS idx_company_locations_lat_lng
  ON public.company_locations (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

COMMIT;
