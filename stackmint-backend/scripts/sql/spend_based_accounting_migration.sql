-- =============================================================================
-- spend_based_accounting_migration.sql
--
-- Adds spend-based accounting columns to spend_transactions, creates the
-- USEEIO factor and mapping tables, and updates analytics views so that
-- spend-based emissions automatically appear alongside activity-based
-- emissions in Superset dashboards.
--
-- Prerequisites (already exist — DO NOT recreate):
--   emission_factors, activity_type_mappings, company_activities,
--   company_emissions, company_locations, company_departments,
--   company_suppliers, emission_categories, date_dimension,
--   spend_transactions (from enterprise_analytics_foundation_migration.sql)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. EXTEND spend_transactions WITH SPEND-BASED ACCOUNTING COLUMNS
-- =============================================================================

ALTER TABLE public.spend_transactions
    ADD COLUMN IF NOT EXISTS spend_category           text,
    ADD COLUMN IF NOT EXISTS spend_factor_id          uuid,
    ADD COLUMN IF NOT EXISTS calculation_method       text,
    ADD COLUMN IF NOT EXISTS classification_confidence numeric,
    ADD COLUMN IF NOT EXISTS emissions_factor_value   numeric,
    ADD COLUMN IF NOT EXISTS original_currency_amount numeric,
    ADD COLUMN IF NOT EXISTS usd_amount               numeric,
    ADD COLUMN IF NOT EXISTS exchange_rate_to_usd     numeric;

-- =============================================================================
-- 2. SPEND EMISSION FACTORS (USEEIO)
--    Each row is a USEEIO sector with a kgCO2e/USD factor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.spend_emission_factors (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    factor_code      text        NOT NULL,
    source_dataset   text        NOT NULL DEFAULT 'useeio',
    spend_category   text,
    sector_code      text        NOT NULL,
    sector_name      text,
    factor_value     numeric     NOT NULL,           -- kgCO2e per USD
    factor_unit      text        NOT NULL DEFAULT 'kgCO2e/USD',
    currency_code    text        NOT NULL DEFAULT 'USD',
    reporting_year   integer,
    scope            text        DEFAULT 'scope_3',
    factor_status    text        NOT NULL DEFAULT 'active',
    source_version   text,
    notes            text,
    created_at       timestamptz DEFAULT now(),
    UNIQUE (sector_code, source_dataset, reporting_year)
);

-- =============================================================================
-- 3. SPEND CATEGORY MAPPINGS
--    Maps raw supplier names / descriptions to spend categories.
--    Resolution priority: exact raw_supplier → procurement_category →
--    partial raw_description → partial raw_supplier.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.spend_category_mappings (
    id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_supplier         text,
    raw_description      text,
    procurement_category text,
    spend_category       text    NOT NULL,
    sector_code          text,
    matching_strategy    text,
    confidence           numeric DEFAULT 0.8,
    review_status        text    DEFAULT 'approved',
    created_at           timestamptz DEFAULT now()
);

-- =============================================================================
-- 4. USEEIO SECTOR MASTER DIMENSION
--    Master list of 402 USEEIO sectors.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.useeio_sectors (
    sector_code      text    PRIMARY KEY,
    sector_name      text    NOT NULL,
    spend_factor_id  uuid    REFERENCES public.spend_emission_factors(id) ON DELETE SET NULL,
    created_at       timestamptz DEFAULT now()
);

-- =============================================================================
-- 5. SPEND CATEGORY → USEEIO SECTOR MAPPINGS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.spend_category_to_sector_mappings (
    id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    spend_category   text    NOT NULL,
    sector_code      text    NOT NULL REFERENCES public.useeio_sectors(sector_code) ON DELETE CASCADE,
    confidence       numeric DEFAULT 0.8,
    mapping_method   text    DEFAULT 'manual',
    created_at       timestamptz DEFAULT now(),
    UNIQUE (spend_category, sector_code)
);

-- =============================================================================
-- 6. INDEXES — performance for high-volume lookups
-- =============================================================================

-- spend_category_mappings — category resolution
CREATE INDEX IF NOT EXISTS idx_spend_cat_map_supplier
    ON public.spend_category_mappings (lower(raw_supplier));

CREATE INDEX IF NOT EXISTS idx_spend_cat_map_procurement
    ON public.spend_category_mappings (lower(procurement_category));

CREATE INDEX IF NOT EXISTS idx_spend_cat_map_status
    ON public.spend_category_mappings (review_status);

-- spend_emission_factors — factor lookups
CREATE INDEX IF NOT EXISTS idx_spend_ef_sector_code
    ON public.spend_emission_factors (sector_code);

CREATE INDEX IF NOT EXISTS idx_spend_ef_status
    ON public.spend_emission_factors (factor_status);

CREATE INDEX IF NOT EXISTS idx_spend_ef_category
    ON public.spend_emission_factors (spend_category);

-- spend_category_to_sector_mappings — sector resolution
CREATE INDEX IF NOT EXISTS idx_spend_cat_sector_category
    ON public.spend_category_to_sector_mappings (spend_category);

-- spend_transactions — emission lookups and analytics
CREATE INDEX IF NOT EXISTS idx_spend_tx_spend_category
    ON public.spend_transactions (spend_category);

CREATE INDEX IF NOT EXISTS idx_spend_tx_org_date
    ON public.spend_transactions (organization_id, transaction_date);

-- company_emissions — spend-based path filtering
CREATE INDEX IF NOT EXISTS idx_company_emissions_calc_method
    ON public.company_emissions (calculation_method);

CREATE INDEX IF NOT EXISTS idx_company_emissions_source_system
    ON public.company_emissions (source_system);

-- =============================================================================
-- 7. UPDATE ANALYTICS VIEWS
--    spend-based emissions must appear in the same views as activity-based.
--    All three views read from company_emissions — no separate pipeline.
-- =============================================================================

-- v_location_emissions_summary — unchanged (already reads from company_emissions)
-- Nothing to change: the LEFT JOIN on company_location_id covers both paths.

-- v_monthly_emissions_trend — unchanged (reads from company_emissions, no path filter)

-- v_supplier_emissions_hotspots — update to use company_emissions for spend-based
-- instead of only estimated_emissions_kgco2e from spend_transactions.
CREATE OR REPLACE VIEW public.v_supplier_emissions_hotspots AS
SELECT
    s.id                                                        AS supplier_id,
    s.supplier_name,
    s.supplier_category,
    COALESCE(st.total_spend, 0)                                 AS total_spend,
    COALESCE(e.total_emissions_kgco2e, 0)                       AS total_emissions_kgco2e,
    COALESCE(e.total_emissions_tco2e,  0)                       AS total_emissions_tco2e,
    COALESCE(st.transaction_count, 0)                           AS transaction_count,
    COALESCE(e.emission_record_count, 0)                        AS emission_record_count,
    CASE
        WHEN COALESCE(st.total_spend, 0) > 0
        THEN COALESCE(e.total_emissions_kgco2e, 0) / st.total_spend
        ELSE NULL
    END                                                         AS emissions_intensity_per_currency_unit
FROM public.company_suppliers s
LEFT JOIN (
    SELECT supplier_id, SUM(amount) AS total_spend, COUNT(DISTINCT id) AS transaction_count
    FROM public.spend_transactions
    GROUP BY supplier_id
) st ON st.supplier_id = s.id
LEFT JOIN (
    SELECT supplier_id,
           SUM(emissions_kgco2e) AS total_emissions_kgco2e,
           SUM(emissions_tco2e) AS total_emissions_tco2e,
           COUNT(DISTINCT id) AS emission_record_count
    FROM public.company_emissions
    WHERE calculation_method = 'spend_based'
    GROUP BY supplier_id
) e ON e.supplier_id = s.id;

-- =============================================================================
-- 8. SEED: COMMON SPEND CATEGORY MAPPINGS
--    Deterministic rules for the most common enterprise suppliers.
--    No AI — these are hard-coded, reviewable mappings.
-- =============================================================================

INSERT INTO public.spend_category_mappings
    (raw_supplier, procurement_category, spend_category, sector_code, matching_strategy, confidence, review_status)
VALUES
    -- Cloud / Software
    ('microsoft',    'software',           'software',             '511200/US', 'exact_supplier', 0.95, 'approved'),
    ('aws',          'cloud_services',     'cloud_services',       '518200/US', 'exact_supplier', 0.95, 'approved'),
    ('amazon web services', 'cloud_services', 'cloud_services',   '518200/US', 'exact_supplier', 0.95, 'approved'),
    ('google cloud', 'cloud_services',     'cloud_services',       '518200/US', 'exact_supplier', 0.95, 'approved'),
    ('azure',        'cloud_services',     'cloud_services',       '518200/US', 'exact_supplier', 0.90, 'approved'),
    ('salesforce',   'software',           'software',             '511200/US', 'exact_supplier', 0.90, 'approved'),
    ('oracle',       'software',           'software',             '511200/US', 'exact_supplier', 0.90, 'approved'),
    ('sap',          'software',           'software',             '511200/US', 'exact_supplier', 0.90, 'approved'),

    -- Construction / Materials
    ('screwfix',     'construction_materials', 'construction_materials', '327000/US', 'exact_supplier', 0.92, 'approved'),
    ('travis perkins', 'construction_materials', 'construction_materials', '327000/US', 'exact_supplier', 0.92, 'approved'),
    ('jewson',       'construction_materials', 'construction_materials', '327000/US', 'exact_supplier', 0.90, 'approved'),
    ('wickes',       'construction_materials', 'construction_materials', '327000/US', 'exact_supplier', 0.88, 'approved'),

    -- Fuel / Energy
    ('bp',           'fuel',               'fuel_petroleum',       '324110/US', 'exact_supplier', 0.93, 'approved'),
    ('shell',        'fuel',               'fuel_petroleum',       '324110/US', 'exact_supplier', 0.93, 'approved'),
    ('total',        'fuel',               'fuel_petroleum',       '324110/US', 'exact_supplier', 0.90, 'approved'),
    ('esso',         'fuel',               'fuel_petroleum',       '324110/US', 'exact_supplier', 0.90, 'approved'),

    -- Transport / Logistics
    ('dhl',          'logistics',          'freight_transport',    '484000/US', 'exact_supplier', 0.92, 'approved'),
    ('ups',          'logistics',          'freight_transport',    '484000/US', 'exact_supplier', 0.92, 'approved'),
    ('fedex',        'logistics',          'freight_transport',    '484000/US', 'exact_supplier', 0.92, 'approved'),
    ('royal mail',   'postal_services',    'freight_transport',    '484000/US', 'exact_supplier', 0.88, 'approved'),
    ('hermes',       'logistics',          'freight_transport',    '484000/US', 'exact_supplier', 0.85, 'approved'),

    -- Catering / Food
    ('brakes',       'catering',           'food_services',        '722000/US', 'exact_supplier', 0.88, 'approved'),
    ('sysco',        'catering',           'food_services',        '722000/US', 'exact_supplier', 0.88, 'approved'),

    -- Office / Facilities
    ('staples',      'office_supplies',    'paper_office_supplies','322000/US', 'exact_supplier', 0.85, 'approved'),
    ('office depot', 'office_supplies',    'paper_office_supplies','322000/US', 'exact_supplier', 0.85, 'approved'),

    -- Professional Services
    ('deloitte',     'professional_services', 'professional_services', '541000/US', 'exact_supplier', 0.88, 'approved'),
    ('pwc',          'professional_services', 'professional_services', '541000/US', 'exact_supplier', 0.88, 'approved'),
    ('kpmg',         'professional_services', 'professional_services', '541000/US', 'exact_supplier', 0.88, 'approved'),
    ('ey',           'professional_services', 'professional_services', '541000/US', 'exact_supplier', 0.85, 'approved'),

    -- Procurement category fallbacks (no specific supplier).
    (NULL, 'electricity',          'purchased_electricity',        '221100/US', 'procurement_category', 0.80, 'approved'),
    (NULL, 'natural_gas',          'fuel_natural_gas',             '211000/US', 'procurement_category', 0.80, 'approved'),
    (NULL, 'office_supplies',      'paper_office_supplies',        '322000/US', 'procurement_category', 0.75, 'approved'),
    (NULL, 'it_hardware',          'electronic_equipment',         '334000/US', 'procurement_category', 0.78, 'approved'),
    (NULL, 'marketing',            'advertising_services',         '541800/US', 'procurement_category', 0.72, 'approved'),
    (NULL, 'waste_management',     'waste_collection',             '562000/US', 'procurement_category', 0.78, 'approved'),
    (NULL, 'cleaning_services',    'cleaning_services',            '561700/US', 'procurement_category', 0.75, 'approved'),
    (NULL, 'security_services',    'investigation_security',       '561600/US', 'procurement_category', 0.75, 'approved'),
    (NULL, 'hr_services',          'human_resources_services',     '541600/US', 'procurement_category', 0.72, 'approved'),
    (NULL, 'legal_services',       'legal_services',               '541100/US', 'procurement_category', 0.75, 'approved'),
    (NULL, 'insurance',            'insurance_carriers',           '524100/US', 'procurement_category', 0.72, 'approved'),
    (NULL, 'banking_finance',      'financial_services',           '522000/US', 'procurement_category', 0.72, 'approved'),
    (NULL, 'telecommunications',   'telecommunications',           '517000/US', 'procurement_category', 0.80, 'approved'),
    (NULL, 'medical_supplies',     'medical_equipment',            '339100/US', 'procurement_category', 0.75, 'approved'),
    (NULL, 'food_beverages',       'food_manufacturing',           '311000/US', 'procurement_category', 0.75, 'approved'),
    (NULL, 'clothing_uniforms',    'apparel_manufacturing',        '315000/US', 'procurement_category', 0.72, 'approved'),
    (NULL, 'furniture',            'furniture_manufacturing',      '337000/US', 'procurement_category', 0.75, 'approved'),
    (NULL, 'machinery',            'industrial_machinery',         '333000/US', 'procurement_category', 0.75, 'approved'),
    (NULL, 'chemicals',            'chemical_manufacturing',       '325000/US', 'procurement_category', 0.78, 'approved'),
    (NULL, 'printing',             'printing_services',            '323000/US', 'procurement_category', 0.72, 'approved'),
    (NULL, 'vehicle_fleet',        'vehicle_manufacturing',        '336000/US', 'procurement_category', 0.72, 'approved'),
    (NULL, 'accommodation',        'accommodation_services',       '721000/US', 'procurement_category', 0.75, 'approved'),
    (NULL, 'air_travel',           'air_transportation',           '481000/US', 'procurement_category', 0.82, 'approved'),
    (NULL, 'rail_travel',          'rail_transportation',          '482000/US', 'procurement_category', 0.80, 'approved'),
    (NULL, 'road_transport',       'freight_transport',            '484000/US', 'procurement_category', 0.78, 'approved'),
    (NULL, 'water_supply',         'water_sewage',                 '221300/US', 'procurement_category', 0.78, 'approved'),
    (NULL, 'healthcare',           'healthcare_services',          '621000/US', 'procurement_category', 0.72, 'approved'),
    (NULL, 'education_training',   'educational_services',         '611000/US', 'procurement_category', 0.72, 'approved'),
    (NULL, 'real_estate',          'real_estate_services',         '531000/US', 'procurement_category', 0.72, 'approved'),
    (NULL, 'agriculture',          'agriculture',                  '111000/US', 'procurement_category', 0.72, 'approved'),
    (NULL, 'metals',               'primary_metals',               '331000/US', 'procurement_category', 0.78, 'approved'),
    (NULL, 'plastics',             'plastics_manufacturing',       '326000/US', 'procurement_category', 0.78, 'approved'),
    (NULL, 'paper',                'paper_manufacturing',          '322000/US', 'procurement_category', 0.75, 'approved'),
    (NULL, 'glass',                'glass_manufacturing',          '327200/US', 'procurement_category', 0.75, 'approved'),
    (NULL, 'concrete_cement',      'cement_concrete',              '327300/US', 'procurement_category', 0.78, 'approved'),
    (NULL, 'electronics',          'electronic_equipment',         '334000/US', 'procurement_category', 0.78, 'approved'),
    (NULL, 'software',             'software',                     '511200/US', 'procurement_category', 0.80, 'approved'),
    (NULL, 'cloud_services',       'cloud_services',               '518200/US', 'procurement_category', 0.80, 'approved'),
    (NULL, 'research_development', 'r_and_d_services',             '541700/US', 'procurement_category', 0.70, 'approved')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 9. SEED: COMMON SPEND CATEGORY → USEEIO SECTOR MAPPINGS
--    These link spend_category values to USEEIO sector codes.
-- =============================================================================

-- Ensure referenced sector codes exist in useeio_sectors before inserting.
INSERT INTO public.useeio_sectors (sector_code, sector_name)
VALUES
    ('511200/US', 'Software Publishers'),
    ('518200/US', 'Data Processing, Hosting, and Related Services'),
    ('327000/US', 'Nonmetallic Mineral Products'),
    ('324110/US', 'Petroleum Refineries'),
    ('484000/US', 'Truck Transportation'),
    ('722000/US', 'Food Services and Drinking Places'),
    ('322000/US', 'Paper Manufacturing'),
    ('541000/US', 'Professional, Scientific, and Technical Services'),
    ('221100/US', 'Electric Power Generation, Transmission, and Distribution'),
    ('211000/US', 'Oil and Gas Extraction'),
    ('334000/US', 'Computer and Electronic Product Manufacturing'),
    ('541800/US', 'Advertising, Public Relations, and Related Services'),
    ('562000/US', 'Waste Management and Remediation Services'),
    ('561700/US', 'Services to Buildings and Dwellings'),
    ('561600/US', 'Investigation and Security Services'),
    ('541600/US', 'Management, Scientific, and Technical Consulting Services'),
    ('541100/US', 'Legal Services'),
    ('524100/US', 'Insurance Carriers'),
    ('522000/US', 'Nondepository Credit Intermediation'),
    ('517000/US', 'Telecommunications'),
    ('339100/US', 'Medical Equipment and Supplies Manufacturing'),
    ('311000/US', 'Food Manufacturing'),
    ('315000/US', 'Apparel Manufacturing'),
    ('337000/US', 'Furniture and Related Product Manufacturing'),
    ('333000/US', 'Machinery Manufacturing'),
    ('325000/US', 'Chemical Manufacturing'),
    ('323000/US', 'Printing and Related Support Activities'),
    ('336000/US', 'Transportation Equipment Manufacturing'),
    ('721000/US', 'Accommodation'),
    ('481000/US', 'Air Transportation'),
    ('482000/US', 'Rail Transportation'),
    ('221300/US', 'Water, Sewage, and Other Systems'),
    ('621000/US', 'Ambulatory Health Care Services'),
    ('611000/US', 'Educational Services'),
    ('531000/US', 'Real Estate'),
    ('111000/US', 'Farms'),
    ('331000/US', 'Primary Metal Manufacturing'),
    ('326000/US', 'Plastics and Rubber Products Manufacturing'),
    ('327200/US', 'Glass and Glass Product Manufacturing'),
    ('327300/US', 'Cement and Concrete Product Manufacturing'),
    ('541700/US', 'Scientific Research and Development Services')
ON CONFLICT (sector_code) DO NOTHING;

INSERT INTO public.spend_category_to_sector_mappings
    (spend_category, sector_code, confidence, mapping_method)
VALUES
    ('software',                '511200/US', 0.95, 'manual'),
    ('cloud_services',          '518200/US', 0.95, 'manual'),
    ('construction_materials',  '327000/US', 0.90, 'manual'),
    ('fuel_petroleum',          '324110/US', 0.93, 'manual'),
    ('fuel_natural_gas',        '211000/US', 0.90, 'manual'),
    ('freight_transport',       '484000/US', 0.90, 'manual'),
    ('food_services',           '722000/US', 0.88, 'manual'),
    ('paper_office_supplies',   '322000/US', 0.85, 'manual'),
    ('professional_services',   '541000/US', 0.88, 'manual'),
    ('purchased_electricity',   '221100/US', 0.90, 'manual'),
    ('electronic_equipment',    '334000/US', 0.85, 'manual'),
    ('advertising_services',    '541800/US', 0.82, 'manual'),
    ('waste_collection',        '562000/US', 0.85, 'manual'),
    ('cleaning_services',       '561700/US', 0.82, 'manual'),
    ('investigation_security',  '561600/US', 0.82, 'manual'),
    ('human_resources_services','541600/US', 0.80, 'manual'),
    ('legal_services',          '541100/US', 0.85, 'manual'),
    ('insurance_carriers',      '524100/US', 0.80, 'manual'),
    ('financial_services',      '522000/US', 0.80, 'manual'),
    ('telecommunications',      '517000/US', 0.88, 'manual'),
    ('medical_equipment',       '339100/US', 0.82, 'manual'),
    ('food_manufacturing',      '311000/US', 0.82, 'manual'),
    ('apparel_manufacturing',   '315000/US', 0.80, 'manual'),
    ('furniture_manufacturing', '337000/US', 0.82, 'manual'),
    ('industrial_machinery',    '333000/US', 0.82, 'manual'),
    ('chemical_manufacturing',  '325000/US', 0.85, 'manual'),
    ('printing_services',       '323000/US', 0.80, 'manual'),
    ('vehicle_manufacturing',   '336000/US', 0.80, 'manual'),
    ('accommodation_services',  '721000/US', 0.82, 'manual'),
    ('air_transportation',      '481000/US', 0.90, 'manual'),
    ('rail_transportation',     '482000/US', 0.88, 'manual'),
    ('water_sewage',            '221300/US', 0.85, 'manual'),
    ('healthcare_services',     '621000/US', 0.80, 'manual'),
    ('educational_services',    '611000/US', 0.80, 'manual'),
    ('real_estate_services',    '531000/US', 0.80, 'manual'),
    ('agriculture',             '111000/US', 0.80, 'manual'),
    ('primary_metals',          '331000/US', 0.85, 'manual'),
    ('plastics_manufacturing',  '326000/US', 0.85, 'manual'),
    ('glass_manufacturing',     '327200/US', 0.82, 'manual'),
    ('cement_concrete',         '327300/US', 0.85, 'manual'),
    ('r_and_d_services',        '541700/US', 0.78, 'manual')
ON CONFLICT (spend_category, sector_code) DO NOTHING;

-- =============================================================================
-- 10. SEED: REFERENCE USEEIO EMISSION FACTORS
--     Representative USEEIO v2.0 factors (kgCO2e/USD, USD 2021 purchasers' prices).
--     Source: US EPA USEEIO v2.0.1-411
--     These are reference values; load full 402-sector dataset separately.
-- =============================================================================

INSERT INTO public.spend_emission_factors
    (factor_code, source_dataset, spend_category, sector_code, sector_name,
     factor_value, factor_unit, currency_code, reporting_year, scope, factor_status, source_version)
VALUES
    ('USEEIO-511200', 'useeio', 'software',               '511200/US', 'Software Publishers',                              0.1034, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-518200', 'useeio', 'cloud_services',         '518200/US', 'Data Processing and Hosting',                      0.1920, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-327000', 'useeio', 'construction_materials', '327000/US', 'Nonmetallic Mineral Products',                     0.5840, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-324110', 'useeio', 'fuel_petroleum',         '324110/US', 'Petroleum Refineries',                             0.4200, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-484000', 'useeio', 'freight_transport',      '484000/US', 'Truck Transportation',                             0.2760, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-722000', 'useeio', 'food_services',          '722000/US', 'Food Services and Drinking Places',                0.3240, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-322000', 'useeio', 'paper_office_supplies',  '322000/US', 'Paper Manufacturing',                              0.4560, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-541000', 'useeio', 'professional_services',  '541000/US', 'Professional and Technical Services',              0.1920, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-221100', 'useeio', 'purchased_electricity',  '221100/US', 'Electric Power Generation',                        0.3840, 'kgCO2e/USD', 'USD', 2021, 'scope_2', 'active', 'v2.0.1'),
    ('USEEIO-211000', 'useeio', 'fuel_natural_gas',       '211000/US', 'Oil and Gas Extraction',                           0.5760, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-334000', 'useeio', 'electronic_equipment',   '334000/US', 'Computer and Electronic Products',                 0.3120, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-541800', 'useeio', 'advertising_services',   '541800/US', 'Advertising and Public Relations',                 0.1680, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-562000', 'useeio', 'waste_collection',       '562000/US', 'Waste Management and Remediation',                 0.2400, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-561700', 'useeio', 'cleaning_services',      '561700/US', 'Services to Buildings and Dwellings',              0.1560, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-561600', 'useeio', 'investigation_security', '561600/US', 'Investigation and Security Services',               0.1320, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-541600', 'useeio', 'human_resources_services','541600/US','Management Consulting Services',                   0.1680, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-541100', 'useeio', 'legal_services',         '541100/US', 'Legal Services',                                   0.1560, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-524100', 'useeio', 'insurance_carriers',     '524100/US', 'Insurance Carriers',                               0.1200, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-522000', 'useeio', 'financial_services',     '522000/US', 'Nondepository Credit Intermediation',              0.1080, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-517000', 'useeio', 'telecommunications',     '517000/US', 'Telecommunications',                               0.2040, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-339100', 'useeio', 'medical_equipment',      '339100/US', 'Medical Equipment and Supplies',                   0.3000, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-311000', 'useeio', 'food_manufacturing',     '311000/US', 'Food Manufacturing',                               0.4080, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-315000', 'useeio', 'apparel_manufacturing',  '315000/US', 'Apparel Manufacturing',                            0.3480, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-337000', 'useeio', 'furniture_manufacturing','337000/US', 'Furniture and Related Products',                   0.3720, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-333000', 'useeio', 'industrial_machinery',   '333000/US', 'Machinery Manufacturing',                          0.3360, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-325000', 'useeio', 'chemical_manufacturing', '325000/US', 'Chemical Manufacturing',                           0.5040, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-323000', 'useeio', 'printing_services',      '323000/US', 'Printing and Related Activities',                  0.3600, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-336000', 'useeio', 'vehicle_manufacturing',  '336000/US', 'Transportation Equipment',                         0.3960, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-721000', 'useeio', 'accommodation_services', '721000/US', 'Accommodation',                                    0.2640, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-481000', 'useeio', 'air_transportation',     '481000/US', 'Air Transportation',                               0.6720, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-482000', 'useeio', 'rail_transportation',    '482000/US', 'Rail Transportation',                              0.1920, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-221300', 'useeio', 'water_sewage',           '221300/US', 'Water, Sewage, and Other Systems',                 0.3480, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-621000', 'useeio', 'healthcare_services',    '621000/US', 'Ambulatory Health Care Services',                  0.2160, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-611000', 'useeio', 'educational_services',   '611000/US', 'Educational Services',                             0.1680, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-531000', 'useeio', 'real_estate_services',   '531000/US', 'Real Estate',                                      0.1440, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-111000', 'useeio', 'agriculture',            '111000/US', 'Farms',                                            0.5520, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-331000', 'useeio', 'primary_metals',         '331000/US', 'Primary Metal Manufacturing',                      0.6240, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-326000', 'useeio', 'plastics_manufacturing', '326000/US', 'Plastics and Rubber Products',                     0.4320, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-327200', 'useeio', 'glass_manufacturing',    '327200/US', 'Glass and Glass Products',                         0.4680, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-327300', 'useeio', 'cement_concrete',        '327300/US', 'Cement and Concrete Products',                     0.6960, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1'),
    ('USEEIO-541700', 'useeio', 'r_and_d_services',       '541700/US', 'Scientific Research and Development',              0.2280, 'kgCO2e/USD', 'USD', 2021, 'scope_3', 'active', 'v2.0.1')
ON CONFLICT (sector_code, source_dataset, reporting_year) DO NOTHING;

COMMIT;
