BEGIN;

ALTER TABLE public.company_activities
ADD COLUMN IF NOT EXISTS activity_date_provenance text NOT NULL DEFAULT 'unknown';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'company_activities_date_provenance_check'
          AND conrelid = 'public.company_activities'::regclass
    ) THEN
        ALTER TABLE public.company_activities
        ADD CONSTRAINT company_activities_date_provenance_check
        CHECK (
            activity_date_provenance IN (
                'source_activity_date',
                'year_month',
                'explicit_reporting_period',
                'unknown'
            )
        );
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_company_activities_completeness
ON public.company_activities (
    organization_id,
    activity_type,
    activity_date_provenance,
    company_location_id
);

ALTER TABLE public.collection_activity_rules
ADD COLUMN IF NOT EXISTS collection_category text;

UPDATE public.collection_activity_rules
SET collection_category = CASE activity_type
    WHEN 'stationary_combustion' THEN 'stationary_combustion'
    WHEN 'stationary_combustion_liquid_fuels' THEN 'stationary_combustion'
    WHEN 'stationary_combustion_gaseous_fuels' THEN 'stationary_combustion'
    WHEN 'mobile_combustion' THEN 'mobile_combustion'
    WHEN 'managed_vehicle_hgv' THEN 'mobile_combustion'
    WHEN 'fugitive_emissions' THEN 'fugitive_emissions'
    WHEN 'fugitive_refrigerants_blends' THEN 'fugitive_emissions'
    WHEN 'purchased_electricity' THEN 'purchased_electricity'
    WHEN 'purchased_electricity_uk_grid' THEN 'purchased_electricity'
    WHEN 'purchased_steam' THEN 'purchased_steam'
    WHEN 'purchased_heating' THEN 'purchased_heating'
    WHEN 'purchased_cooling' THEN 'purchased_cooling'
    WHEN 'business_travel' THEN 'business_travel'
    WHEN 'business_travel_air' THEN 'business_travel'
    WHEN 'business_travel_rail' THEN 'business_travel'
    WHEN 'hotel_stays' THEN 'business_travel'
    WHEN 'employee_commuting' THEN 'employee_commuting'
    WHEN 'waste_generated' THEN 'waste_generated'
    WHEN 'waste_plastic' THEN 'waste_generated'
    WHEN 'waste_construction' THEN 'waste_generated'
    WHEN 'purchased_goods' THEN 'purchased_goods'
    WHEN 'materials_construction' THEN 'purchased_goods'
    WHEN 'upstream_transport' THEN 'upstream_transport'
    WHEN 'downstream_transport' THEN 'downstream_transport'
    ELSE NULL
END;

CREATE TABLE IF NOT EXISTS public.location_activity_applicability (
    organization_id uuid NOT NULL
        REFERENCES public.clerk_organisations(id) ON DELETE CASCADE,
    company_location_id uuid NOT NULL
        REFERENCES public.company_locations(id) ON DELETE CASCADE,
    activity_type text NOT NULL,
    is_applicable boolean NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, company_location_id, activity_type)
);

CREATE INDEX IF NOT EXISTS idx_location_activity_applicability_lookup
ON public.location_activity_applicability (
    organization_id,
    activity_type,
    company_location_id
);

ALTER TABLE public.location_activity_applicability ENABLE ROW LEVEL SECURITY;

COMMIT;
