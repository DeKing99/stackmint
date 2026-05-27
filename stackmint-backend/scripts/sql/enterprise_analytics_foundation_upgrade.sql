-- Enterprise analytics foundation upgrade
-- Safe to run multiple times.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Expand locations into a richer analytics dimension.
ALTER TABLE public.company_locations
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS postcode text,
  ADD COLUMN IF NOT EXISTS employee_count integer,
  ADD COLUMN IF NOT EXISTS floor_area_m2 numeric,
  ADD COLUMN IF NOT EXISTS annual_revenue numeric,
  ADD COLUMN IF NOT EXISTS operational_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS construction_phase text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Departments dimension.
CREATE TABLE IF NOT EXISTS public.company_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  department_name text NOT NULL,
  department_code text,
  cost_center text,
  manager_name text,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, department_name)
);

-- Suppliers dimension.
CREATE TABLE IF NOT EXISTS public.company_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  supplier_name text NOT NULL,
  supplier_code text,
  supplier_tier text,
  country text,
  industry text,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, supplier_name)
);

-- Hierarchical categories for analytics rollups.
CREATE TABLE IF NOT EXISTS public.emission_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  parent_id uuid REFERENCES public.emission_categories(id) ON DELETE SET NULL,
  category_code text,
  category_name text NOT NULL,
  scope text,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, category_code)
);

-- Spend-based accounting fact table.
CREATE TABLE IF NOT EXISTS public.spend_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  source_activity_id uuid REFERENCES public.company_activities(id) ON DELETE SET NULL,
  company_location_id uuid REFERENCES public.company_locations(id) ON DELETE SET NULL,
  company_department_id uuid REFERENCES public.company_departments(id) ON DELETE SET NULL,
  company_supplier_id uuid REFERENCES public.company_suppliers(id) ON DELETE SET NULL,
  emission_category_id uuid REFERENCES public.emission_categories(id) ON DELETE SET NULL,
  transaction_date date NOT NULL,
  reporting_period_start date,
  reporting_period_end date,
  invoice_reference text,
  description text,
  amount numeric(18, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'GBP',
  quantity numeric,
  unit text,
  emission_factor_id uuid REFERENCES public.emission_factors(id) ON DELETE SET NULL,
  estimated_co2e numeric,
  data_quality_score numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enterprise date dimension.
CREATE TABLE IF NOT EXISTS public.date_dimension (
  date_day date PRIMARY KEY,
  date_key integer GENERATED ALWAYS AS (
    (EXTRACT(YEAR FROM date_day)::int * 10000)
    + (EXTRACT(MONTH FROM date_day)::int * 100)
    + EXTRACT(DAY FROM date_day)::int
  ) STORED,
  year integer NOT NULL,
  quarter integer NOT NULL,
  month integer NOT NULL,
  month_name text NOT NULL,
  week integer NOT NULL,
  day integer NOT NULL,
  day_name text NOT NULL,
  is_month_start boolean NOT NULL,
  is_month_end boolean NOT NULL
);

INSERT INTO public.date_dimension (
  date_day, year, quarter, month, month_name, week, day, day_name, is_month_start, is_month_end
)
SELECT
  d::date,
  EXTRACT(YEAR FROM d)::int,
  EXTRACT(QUARTER FROM d)::int,
  EXTRACT(MONTH FROM d)::int,
  TO_CHAR(d, 'Month'),
  EXTRACT(WEEK FROM d)::int,
  EXTRACT(DAY FROM d)::int,
  TO_CHAR(d, 'Day'),
  (DATE_TRUNC('month', d) = d),
  (DATE_TRUNC('month', d) + INTERVAL '1 month - 1 day')::date = d::date
FROM generate_series('2018-01-01'::date, '2035-12-31'::date, '1 day') d
ON CONFLICT (date_day) DO NOTHING;

-- Enrich activities with dimensions + QA/workflow + reporting period.
ALTER TABLE public.company_activities
  ADD COLUMN IF NOT EXISTS reporting_period_start date,
  ADD COLUMN IF NOT EXISTS reporting_period_end date,
  ADD COLUMN IF NOT EXISTS company_department_id uuid REFERENCES public.company_departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_supplier_id uuid REFERENCES public.company_suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_reference text,
  ADD COLUMN IF NOT EXISTS verification_status text,
  ADD COLUMN IF NOT EXISTS data_quality_score numeric,
  ADD COLUMN IF NOT EXISTS calculation_method text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Enrich emissions for enterprise analytics.
ALTER TABLE public.company_emissions
  ADD COLUMN IF NOT EXISTS reporting_period_start date,
  ADD COLUMN IF NOT EXISTS reporting_period_end date,
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS company_location_id uuid REFERENCES public.company_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_department_id uuid REFERENCES public.company_departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_supplier_id uuid REFERENCES public.company_suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activity_quantity numeric,
  ADD COLUMN IF NOT EXISTS activity_unit text,
  ADD COLUMN IF NOT EXISTS co2e_per_employee numeric,
  ADD COLUMN IF NOT EXISTS co2e_per_m2 numeric,
  ADD COLUMN IF NOT EXISTS verification_status text,
  ADD COLUMN IF NOT EXISTS calculation_method text,
  ADD COLUMN IF NOT EXISTS calculation_confidence numeric,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Analytics views for BI tools (Superset).
CREATE OR REPLACE VIEW public.v_location_emissions_summary AS
SELECT
  l.id AS company_location_id,
  l.organization_id,
  l.location_name,
  l.city,
  l.region,
  l.country,
  l.postcode,
  l.latitude,
  l.longitude,
  l.employee_count,
  l.floor_area_m2,
  COALESCE(SUM(e.co2e), 0) AS total_co2e,
  COALESCE(SUM(e.co2e) FILTER (WHERE a.scope = 'scope_1'), 0) AS scope_1_co2e,
  COALESCE(SUM(e.co2e) FILTER (WHERE a.scope = 'scope_2'), 0) AS scope_2_co2e,
  COALESCE(SUM(e.co2e) FILTER (WHERE a.scope = 'scope_3'), 0) AS scope_3_co2e,
  CASE
    WHEN COALESCE(l.employee_count, 0) > 0 THEN COALESCE(SUM(e.co2e), 0) / l.employee_count
    ELSE NULL
  END AS emissions_per_employee,
  CASE
    WHEN COALESCE(l.floor_area_m2, 0) > 0 THEN COALESCE(SUM(e.co2e), 0) / l.floor_area_m2
    ELSE NULL
  END AS emissions_per_m2
FROM public.company_locations l
LEFT JOIN public.company_activities a ON a.company_location_id = l.id
LEFT JOIN public.company_emissions e ON e.activity_id = a.id
GROUP BY l.id;

CREATE OR REPLACE VIEW public.v_monthly_emissions_trend AS
SELECT
  DATE_TRUNC(
    'month',
    COALESCE(
      a.reporting_period_start::timestamp,
      e.reporting_period_start::timestamp,
      e.calculated_at::timestamp
    )
  )::date AS month_start,
  a.organization_id,
  a.scope,
  a.category,
  COUNT(DISTINCT a.id) AS activity_count,
  COALESCE(SUM(e.co2e), 0) AS total_co2e
FROM public.company_activities a
LEFT JOIN public.company_emissions e ON e.activity_id = a.id
GROUP BY 1, 2, 3, 4;

CREATE OR REPLACE VIEW public.v_supplier_emissions_hotspots AS
SELECT
  s.id AS company_supplier_id,
  s.organization_id,
  s.supplier_name,
  COUNT(DISTINCT a.id) AS activity_count,
  COUNT(DISTINCT st.id) AS spend_transaction_count,
  COALESCE(SUM(st.amount), 0) AS total_spend,
  COALESCE(SUM(e.co2e), 0) AS total_co2e,
  CASE
    WHEN COALESCE(SUM(st.amount), 0) > 0 THEN COALESCE(SUM(e.co2e), 0) / SUM(st.amount)
    ELSE NULL
  END AS co2e_per_spend_unit
FROM public.company_suppliers s
LEFT JOIN public.company_activities a ON a.company_supplier_id = s.id
LEFT JOIN public.company_emissions e ON e.activity_id = a.id
LEFT JOIN public.spend_transactions st ON st.company_supplier_id = s.id
GROUP BY s.id;

-- BI-oriented indexes.
CREATE INDEX IF NOT EXISTS idx_company_activities_org_period
  ON public.company_activities (organization_id, reporting_period_start, reporting_period_end);
CREATE INDEX IF NOT EXISTS idx_company_activities_supplier
  ON public.company_activities (company_supplier_id);
CREATE INDEX IF NOT EXISTS idx_company_activities_department
  ON public.company_activities (company_department_id);
CREATE INDEX IF NOT EXISTS idx_company_emissions_activity
  ON public.company_emissions (activity_id);
CREATE INDEX IF NOT EXISTS idx_company_emissions_org_period
  ON public.company_emissions (organization_id, reporting_period_start, reporting_period_end);
CREATE INDEX IF NOT EXISTS idx_spend_transactions_org_date
  ON public.spend_transactions (organization_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_spend_transactions_supplier
  ON public.spend_transactions (company_supplier_id);

COMMIT;
