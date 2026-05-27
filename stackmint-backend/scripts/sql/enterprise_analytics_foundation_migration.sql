BEGIN;

-- =====================================================
-- COMPANY LOCATIONS ENRICHMENT
-- =====================================================
ALTER TABLE public.company_locations
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS region text,
ADD COLUMN IF NOT EXISTS country text,
ADD COLUMN IF NOT EXISTS postcode text,
ADD COLUMN IF NOT EXISTS square_meters numeric,
ADD COLUMN IF NOT EXISTS employee_count integer,
ADD COLUMN IF NOT EXISTS annual_revenue numeric,
ADD COLUMN IF NOT EXISTS operational_status text DEFAULT 'active',
ADD COLUMN IF NOT EXISTS location_type text,
ADD COLUMN IF NOT EXISTS construction_phase text,
ADD COLUMN IF NOT EXISTS start_date date,
ADD COLUMN IF NOT EXISTS end_date date,
ADD COLUMN IF NOT EXISTS timezone text,
ADD COLUMN IF NOT EXISTS climate_zone text,
ADD COLUMN IF NOT EXISTS site_code text,
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- =====================================================
-- ORGANISATIONAL DIMENSIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.company_departments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.clerk_organisations(id) ON DELETE CASCADE,
    department_name text NOT NULL,
    department_code text,
    manager_name text,
    cost_center text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_suppliers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.clerk_organisations(id) ON DELETE CASCADE,
    supplier_name text NOT NULL,
    supplier_category text,
    supplier_country text,
    supplier_region text,
    supplier_contact_email text,
    supplier_status text DEFAULT 'active',
    annual_spend numeric,
    supplier_rating numeric,
    created_at timestamptz DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.emission_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scope integer,
    category_name text NOT NULL,
    parent_category_id uuid REFERENCES public.emission_categories(id) ON DELETE SET NULL,
    category_level integer DEFAULT 1,
    category_code text,
    description text,
    created_at timestamptz DEFAULT now()
);

-- =====================================================
-- SPEND BASED ACCOUNTING TABLES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.spend_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.clerk_organisations(id) ON DELETE CASCADE,
    company_location_id uuid REFERENCES public.company_locations(id) ON DELETE SET NULL,
    department_id uuid REFERENCES public.company_departments(id) ON DELETE SET NULL,
    supplier_id uuid REFERENCES public.company_suppliers(id) ON DELETE SET NULL,
    transaction_date date NOT NULL,
    invoice_number text,
    procurement_category text,
    accounting_code text,
    spend_description text,
    amount numeric NOT NULL,
    currency text DEFAULT 'GBP',
    quantity numeric,
    unit text,
    estimated_emissions_kgco2e numeric,
    source_upload_id uuid REFERENCES public.company_raw_uploads(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb
);

-- =====================================================
-- ENRICH EXISTING ACTIVITY TABLE
-- =====================================================
ALTER TABLE public.company_activities
ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.company_departments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.company_suppliers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS emission_category_id uuid REFERENCES public.emission_categories(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS source_system text,
ADD COLUMN IF NOT EXISTS invoice_number text,
ADD COLUMN IF NOT EXISTS reference_code text,
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS notes text,
ADD COLUMN IF NOT EXISTS data_quality_score numeric,
ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'unverified',
ADD COLUMN IF NOT EXISTS calculation_method text,
ADD COLUMN IF NOT EXISTS reporting_period text,
ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- =====================================================
-- ENRICH EXISTING EMISSIONS TABLE
-- =====================================================
ALTER TABLE public.company_emissions
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.clerk_organisations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.company_departments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.company_suppliers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS emission_category_id uuid REFERENCES public.emission_categories(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS reporting_year integer,
ADD COLUMN IF NOT EXISTS reporting_month integer,
ADD COLUMN IF NOT EXISTS reporting_quarter integer,
ADD COLUMN IF NOT EXISTS reporting_period text,
ADD COLUMN IF NOT EXISTS emissions_kgco2e numeric,
ADD COLUMN IF NOT EXISTS emissions_tco2e numeric,
ADD COLUMN IF NOT EXISTS activity_quantity numeric,
ADD COLUMN IF NOT EXISTS activity_unit text,
ADD COLUMN IF NOT EXISTS calculation_method text,
ADD COLUMN IF NOT EXISTS calculation_confidence numeric,
ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'unverified',
ADD COLUMN IF NOT EXISTS source_system text,
ADD COLUMN IF NOT EXISTS intensity_per_employee numeric,
ADD COLUMN IF NOT EXISTS intensity_per_square_meter numeric,
ADD COLUMN IF NOT EXISTS intensity_per_revenue numeric,
ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- =====================================================
-- DATE DIMENSION
-- =====================================================
CREATE TABLE IF NOT EXISTS public.date_dimension (
    full_date date PRIMARY KEY,
    day integer,
    week integer,
    month integer,
    month_name text,
    quarter integer,
    year integer,
    fiscal_year integer,
    weekday integer,
    weekday_name text,
    is_weekend boolean
);

INSERT INTO public.date_dimension (
    full_date,
    day,
    week,
    month,
    month_name,
    quarter,
    year,
    fiscal_year,
    weekday,
    weekday_name,
    is_weekend
)
SELECT
    d::date,
    EXTRACT(DAY FROM d),
    EXTRACT(WEEK FROM d),
    EXTRACT(MONTH FROM d),
    TO_CHAR(d, 'Month'),
    EXTRACT(QUARTER FROM d),
    EXTRACT(YEAR FROM d),
    EXTRACT(YEAR FROM d),
    EXTRACT(ISODOW FROM d),
    TO_CHAR(d, 'Day'),
    CASE WHEN EXTRACT(ISODOW FROM d) IN (6,7) THEN true ELSE false END
FROM generate_series('2020-01-01'::date, '2035-12-31'::date, interval '1 day') d
ON CONFLICT (full_date) DO NOTHING;

-- =====================================================
-- ANALYTICS VIEWS FOR SUPERSET
-- =====================================================
CREATE OR REPLACE VIEW public.v_location_emissions_summary AS
SELECT
    l.id AS location_id,
    l.location_name,
    l.city,
    l.region,
    l.country,
    l.latitude,
    l.longitude,
    l.employee_count,
    l.square_meters,
    COALESCE(SUM(e.emissions_kgco2e), 0) AS total_emissions_kgco2e,
    COALESCE(SUM(e.emissions_tco2e), 0) AS total_emissions_tco2e,
    CASE
        WHEN l.employee_count IS NOT NULL AND l.employee_count > 0
        THEN COALESCE(SUM(e.emissions_kgco2e), 0) / l.employee_count
        ELSE NULL
    END AS emissions_per_employee,
    CASE
        WHEN l.square_meters IS NOT NULL AND l.square_meters > 0
        THEN COALESCE(SUM(e.emissions_kgco2e), 0) / l.square_meters
        ELSE NULL
    END AS emissions_per_square_meter
FROM public.company_locations l
LEFT JOIN public.company_emissions e
    ON e.company_location_id = l.id
GROUP BY
    l.id,
    l.location_name,
    l.city,
    l.region,
    l.country,
    l.latitude,
    l.longitude,
    l.employee_count,
    l.square_meters;

CREATE OR REPLACE VIEW public.v_monthly_emissions_trend AS
SELECT
    reporting_year,
    reporting_month,
    scope,
    category,
    organization_id,
    SUM(COALESCE(emissions_kgco2e, 0)) AS total_emissions_kgco2e,
    SUM(COALESCE(emissions_tco2e, 0)) AS total_emissions_tco2e,
    COUNT(*) AS record_count
FROM public.company_emissions
GROUP BY
    reporting_year,
    reporting_month,
    scope,
    category,
    organization_id;

CREATE OR REPLACE VIEW public.v_supplier_emissions_hotspots AS
SELECT
    s.id AS supplier_id,
    s.supplier_name,
    s.supplier_category,
    COALESCE(SUM(st.amount), 0) AS total_spend,
    COALESCE(SUM(st.estimated_emissions_kgco2e), 0) AS estimated_emissions_kgco2e,
    COUNT(st.id) AS transaction_count
FROM public.company_suppliers s
LEFT JOIN public.spend_transactions st
    ON st.supplier_id = s.id
GROUP BY
    s.id,
    s.supplier_name,
    s.supplier_category;

-- =====================================================
-- INDEXES FOR ANALYTICS PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_company_emissions_location
ON public.company_emissions(company_location_id);

CREATE INDEX IF NOT EXISTS idx_company_emissions_org
ON public.company_emissions(organization_id);

CREATE INDEX IF NOT EXISTS idx_company_emissions_reporting_period
ON public.company_emissions(reporting_year, reporting_month);

CREATE INDEX IF NOT EXISTS idx_company_activities_org
ON public.company_activities(organization_id);

CREATE INDEX IF NOT EXISTS idx_company_activities_location
ON public.company_activities(company_location_id);

CREATE INDEX IF NOT EXISTS idx_spend_transactions_org
ON public.spend_transactions(organization_id);

CREATE INDEX IF NOT EXISTS idx_spend_transactions_supplier
ON public.spend_transactions(supplier_id);

CREATE INDEX IF NOT EXISTS idx_company_locations_coordinates
ON public.company_locations(latitude, longitude);

COMMIT;
