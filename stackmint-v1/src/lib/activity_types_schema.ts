// src/lib/activity_types_schema.ts

/**
 * Represents a selectable activity type with a human-friendly label and
 * accompanying description. Useful for populating dropdowns and showing
 * contextual help to users.
 */
export type ActivityType = {
  value: string;
  label: string;
  description: string;
};

/**
 * Ordered list of all activity types defined in the backend schema.  This
 * structure makes it easy to map into `<select>` options and to render
 * the corresponding description when an item is selected.
 */
export const activityTypes: ActivityType[] = [
  // scope-1
  {
    value: "stationary_combustion",
    label: "Stationary Combustion",
    description: "On-site fuel combustion (boilers, generators, furnaces)",
  },
  {
    value: "mobile_combustion",
    label: "Mobile Combustion",
    description: "Fuel used in company-owned vehicles",
  },
  {
    value: "fugitive_emissions",
    label: "Fugitive Emissions",
    description: "Refrigerant and other fugitive gas leakage",
  },

  // scope-2
  {
    value: "purchased_electricity",
    label: "Purchased Electricity",
    description: "Electricity purchased from grid",
  },
  {
    value: "purchased_steam",
    label: "Purchased Steam",
    description: "Purchased steam",
  },
  {
    value: "purchased_heating",
    label: "Purchased Heating",
    description: "Purchased district heating",
  },
  {
    value: "purchased_cooling",
    label: "Purchased Cooling",
    description: "Purchased cooling",
  },

  // scope-3
  {
    value: "business_travel",
    label: "Business Travel",
    description: "Employee business travel",
  },
  {
    value: "employee_commuting",
    label: "Employee Commuting",
    description: "Employee commuting emissions",
  },
  {
    value: "waste_generated",
    label: "Waste Generated",
    description: "Waste generated in operations",
  },
  {
    value: "purchased_goods",
    label: "Purchased Goods",
    description: "Purchased goods and services",
  },
  {
    value: "upstream_transport",
    label: "Upstream Transport",
    description: "Upstream transportation and distribution",
  },
  {
    value: "downstream_transport",
    label: "Downstream Transport",
    description: "Downstream transportation and distribution",
  },

  // canonical factor activity types (mapped to schema activity groups in backend pipeline)
  {
    value: "stationary_combustion_liquid_fuels",
    label: "Stationary Combustion (Liquid Fuels)",
    description: "Canonical factor mapping for stationary liquid fuels",
  },
  {
    value: "stationary_combustion_gaseous_fuels",
    label: "Stationary Combustion (Gaseous Fuels)",
    description: "Canonical factor mapping for stationary gaseous fuels",
  },
  {
    value: "purchased_electricity_uk_grid",
    label: "Purchased Electricity (UK Grid)",
    description: "Canonical factor mapping for UK grid electricity",
  },
  {
    value: "electricity_for_evs",
    label: "Electricity for EVs",
    description: "Canonical factor mapping for EV electricity",
  },
  {
    value: "freight_hgv",
    label: "Freight (HGV)",
    description: "Canonical factor mapping for HGV freight",
  },
  {
    value: "freight_air",
    label: "Freight (Air)",
    description: "Canonical factor mapping for air freight",
  },
  {
    value: "freight_cargo_ship",
    label: "Freight (Cargo Ship)",
    description: "Canonical factor mapping for cargo ship freight",
  },
  {
    value: "business_travel_air",
    label: "Business Travel (Air)",
    description: "Canonical factor mapping for business air travel",
  },
  {
    value: "business_travel_rail",
    label: "Business Travel (Rail)",
    description: "Canonical factor mapping for business rail travel",
  },
  {
    value: "hotel_stays",
    label: "Hotel Stays",
    description: "Canonical factor mapping for hotel stays",
  },
  {
    value: "waste_plastic",
    label: "Waste (Plastic)",
    description: "Canonical factor mapping for plastic waste",
  },
  {
    value: "waste_construction",
    label: "Waste (Construction)",
    description: "Canonical factor mapping for construction waste",
  },
  {
    value: "materials_construction",
    label: "Materials (Construction)",
    description: "Canonical factor mapping for construction materials",
  },
  {
    value: "fugitive_refrigerants_blends",
    label: "Fugitive Refrigerants (Blends)",
    description: "Canonical factor mapping for refrigerant blends",
  },
  {
    value: "water_supply",
    label: "Water Supply",
    description: "Canonical factor mapping for water supply",
  },
  {
    value: "homeworking_heating",
    label: "Homeworking (Heating)",
    description: "Canonical factor mapping for homeworking heating",
  },
  {
    value: "managed_vehicle_hgv",
    label: "Managed Vehicle (HGV)",
    description: "Canonical factor mapping for managed HGV vehicles",
  },
  {
    value: "well_to_tank_liquid_fuels",
    label: "Well-to-Tank (Liquid Fuels)",
    description: "Canonical factor mapping for WTT liquid fuels",
  },
  {
    value: "secr_transport",
    label: "SECR Transport",
    description: "Canonical factor mapping for SECR transport",
  },
];
