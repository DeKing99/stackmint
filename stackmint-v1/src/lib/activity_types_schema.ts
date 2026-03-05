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
];
