"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useOrganization, useSession } from "@clerk/nextjs";
import { toast } from "sonner";
import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClerkSupabaseClient } from "@/lib/supabase-client";

export const FREQUENCY_OPTIONS = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annually" },
] as const;

export type ActivityFrequency = (typeof FREQUENCY_OPTIONS)[number]["value"];

export type ActivitySettings = {
  required: boolean;
  frequency: ActivityFrequency;
};

export type ActivitySettingsMap = Record<string, ActivitySettings>;

type ActivityRule = {
  activity_type: string;
  collection_category: string | null;
  display_name: string;
  description: string | null;
  default_required: boolean;
  default_frequency: ActivityFrequency;
};

type Location = {
  id: string;
  location_name: string;
};

type ApplicabilityMap = Record<
  string,
  Record<string, boolean | undefined>
>;

type OverrideRow = {
  activity_type: string;
  is_required: boolean | null;
  frequency: ActivityFrequency | null;
};

const FALLBACK_SETTINGS: ActivitySettings = {
  required: true,
  frequency: "monthly",
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

// Clerk org ids are not UUIDs, so map them to clerk_organisations.id.
async function resolveOrganizationId(
  supabase: SupabaseClient,
  clerkOrgId: string,
): Promise<string> {
  if (isUuid(clerkOrgId)) return clerkOrgId;
  const { data, error } = await supabase
    .from("clerk_organisations")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .maybeSingle();
  if (error || !data?.id) {
    throw new Error("Could not resolve organisation.");
  }
  return data.id;
}

// Defaults come from collection_activity_rules; organisation overrides replace them field by field.
export async function loadActivityConfig(
  supabase: SupabaseClient,
  clerkOrgId: string,
): Promise<{
  organizationId: string;
  rules: ActivityRule[];
  settings: ActivitySettingsMap;
  locations: Location[];
  applicability: ApplicabilityMap;
}> {
  const organizationId = await resolveOrganizationId(supabase, clerkOrgId);

  const [rulesRes, overridesRes, applicabilityResponse] = await Promise.all([
    supabase
      .from("collection_activity_rules")
      .select(
        "activity_type, collection_category, display_name, description, default_frequency, default_required",
      )
      .order("display_name"),
    supabase
      .from("organisation_activity_settings")
      .select("activity_type, is_required, frequency")
      .eq("organization_id", organizationId),
    fetch("/api/collection/applicability", { cache: "no-store" }),
  ]);

  if (rulesRes.error) throw rulesRes.error;
  if (overridesRes.error) throw overridesRes.error;
  if (!applicabilityResponse.ok) {
    throw new Error("Could not load location applicability.");
  }

  const rules = ((rulesRes.data ?? []) as ActivityRule[]).filter(
    (rule) => rule.collection_category === rule.activity_type,
  );
  const overrides = new Map(
    ((overridesRes.data ?? []) as OverrideRow[]).map((o) => [
      o.activity_type,
      o,
    ]),
  );
  const applicabilityData = (await applicabilityResponse.json()) as {
    locations: Location[];
    applicability: Array<{
      activity_type: string;
      company_location_id: string;
      is_applicable: boolean;
    }>;
  };
  const applicability: ApplicabilityMap = {};
  for (const row of applicabilityData.applicability) {
    applicability[row.activity_type] ??= {};
    applicability[row.activity_type][row.company_location_id] =
      row.is_applicable;
  }

  const settings: ActivitySettingsMap = {};
  for (const rule of rules) {
    const override = overrides.get(rule.activity_type);
    settings[rule.activity_type] = {
      required: override?.is_required ?? rule.default_required,
      frequency: override?.frequency ?? rule.default_frequency,
    };
  }

  return {
    organizationId,
    rules,
    settings,
    locations: applicabilityData.locations,
    applicability,
  };
}

async function saveLocationApplicability(
  changes: Array<{
    activity_type: string;
    company_location_id: string;
    is_applicable: boolean | null;
  }>,
): Promise<void> {
  if (changes.length === 0) return;
  const response = await fetch("/api/collection/applicability", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: changes }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "Could not save location applicability.");
  }
}

// Stores only the fields that differ from the default (others NULL); a row matching defaults is removed.
async function saveActivityOverrides(
  supabase: SupabaseClient,
  organizationId: string,
  rules: ActivityRule[],
  changes: ActivitySettingsMap,
): Promise<void> {
  const rulesByType = new Map(rules.map((r) => [r.activity_type, r]));
  const upserts: Array<{
    organization_id: string;
    activity_type: string;
    is_required: boolean | null;
    frequency: ActivityFrequency | null;
    updated_at: string;
  }> = [];
  const resets: string[] = [];

  for (const [activityType, next] of Object.entries(changes)) {
    const rule = rulesByType.get(activityType);
    if (!rule) continue;

    const is_required =
      next.required !== rule.default_required ? next.required : null;
    const frequency =
      next.frequency !== rule.default_frequency ? next.frequency : null;

    if (is_required === null && frequency === null) {
      resets.push(activityType);
    } else {
      upserts.push({
        organization_id: organizationId,
        activity_type: activityType,
        is_required,
        frequency,
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (upserts.length > 0) {
    const { error } = await supabase
      .from("organisation_activity_settings")
      .upsert(upserts, { onConflict: "organization_id,activity_type" });
    if (error) throw error;
  }

  if (resets.length > 0) {
    const { error } = await supabase
      .from("organisation_activity_settings")
      .delete()
      .eq("organization_id", organizationId)
      .in("activity_type", resets);
    if (error) throw error;
  }
}

const getSettings = (map: ActivitySettingsMap, value: string) =>
  map[value] ?? FALLBACK_SETTINGS;

type Props = {
  open: boolean;
  setOpen: (open: boolean) => void;
  onSaved?: (settings: ActivitySettingsMap) => void;
};

export default function ActivityConfigurationModal({
  open,
  setOpen,
  onSaved,
}: Props) {
  const { session } = useSession();
  const { organization } = useOrganization();
  const [rules, setRules] = useState<ActivityRule[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [savedApplicability, setSavedApplicability] =
    useState<ApplicabilityMap>({});
  const [draftApplicability, setDraftApplicability] =
    useState<ApplicabilityMap>({});
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [saved, setSaved] = useState<ActivitySettingsMap>({});
  const [draft, setDraft] = useState<ActivitySettingsMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const supabase = useMemo(
    () =>
      createClerkSupabaseClient(
        () => session?.getToken?.() ?? Promise.resolve(null),
      ),
    [session],
  );

  useEffect(() => {
    if (!organization?.id) return;
    let cancelled = false;

    loadActivityConfig(supabase, organization.id)
      .then((config) => {
        if (cancelled) return;
        setOrganizationId(config.organizationId);
        setRules(config.rules);
        setLocations(config.locations);
        setSavedApplicability(config.applicability);
        setDraftApplicability(config.applicability);
        setSaved(config.settings);
        setDraft(config.settings);
        setSelected((prev) => prev || config.rules[0]?.activity_type || "");
      })
      .catch((err) => {
        console.error("Error loading activity configuration:", err);
        toast.error("Could not load activity settings.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [supabase, organization?.id]);

  const isDirty = (value: string) =>
    JSON.stringify(getSettings(draft, value)) !==
    JSON.stringify(getSettings(saved, value));
  const isApplicabilityDirty = (activityType: string) =>
    locations.some(
      (location) =>
        savedApplicability[activityType]?.[location.id] !==
        draftApplicability[activityType]?.[location.id],
    );
  const dirtyCount = rules.filter(
    (r) => isDirty(r.activity_type) || isApplicabilityDirty(r.activity_type),
  ).length;

  const current = rules.find((r) => r.activity_type === selected);
  const currentSettings = getSettings(draft, selected);
  const currentApplicability = draftApplicability[selected] ?? {};

  const update = (patch: Partial<ActivitySettings>) =>
    setDraft((prev) => ({
      ...prev,
      [selected]: { ...getSettings(prev, selected), ...patch },
    }));

  const updateApplicability = (
    locationId: string,
    value: boolean | undefined,
  ) =>
    setDraftApplicability((previous) => ({
      ...previous,
      [selected]: {
        ...previous[selected],
        [locationId]: value,
      },
    }));

  const handleSave = async () => {
    if (!organizationId) return;
    setIsSaving(true);
    try {
      const changes: ActivitySettingsMap = {};
      for (const r of rules) {
        if (isDirty(r.activity_type)) {
          changes[r.activity_type] = getSettings(draft, r.activity_type);
        }
      }
      const applicabilityChanges = rules.flatMap((rule) =>
        locations
          .filter(
            (location) =>
              savedApplicability[rule.activity_type]?.[location.id] !==
              draftApplicability[rule.activity_type]?.[location.id],
          )
          .map((location) => ({
            activity_type: rule.activity_type,
            company_location_id: location.id,
            is_applicable:
              draftApplicability[rule.activity_type]?.[location.id] ?? null,
          })),
      );
      await saveActivityOverrides(supabase, organizationId, rules, changes);
      await saveLocationApplicability(applicabilityChanges);
      setSaved(draft);
      setSavedApplicability(draftApplicability);
      onSaved?.(draft);
      toast.success("Activity settings saved.");
      setOpen(false);
    } catch (err) {
      console.error("Error saving activity configuration:", err);
      toast.error("Could not save activity settings.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-[min(640px,90vh)] w-full max-w-4xl flex-col gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="border-b p-6 pr-16">
          <DialogTitle>Configure activity data</DialogTitle>
          <DialogDescription>
            Choose which activity types apply to your business and how often
            data is expected.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[16rem_1fr]">
          <nav
            aria-label="Activity types"
            className="overflow-y-auto border-r bg-muted/30"
          >
            <ul>
              {rules.map((a) => {
                const s = getSettings(draft, a.activity_type);
                const active = a.activity_type === selected;
                return (
                  <li key={a.activity_type}>
                    <button
                      type="button"
                      onClick={() => setSelected(a.activity_type)}
                      aria-current={active ? "true" : undefined}
                      className={`flex w-full items-center justify-between gap-2 border-l-2 px-4 py-3 text-left text-sm transition-colors hover:bg-muted ${
                        active
                          ? "border-primary bg-muted font-semibold"
                          : "border-transparent"
                      }`}
                    >
                      <span className="truncate">{a.display_name}</span>
                      <span
                        className={`shrink-0 text-xs ${
                          s.required
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {isDirty(a.activity_type) ||
                        isApplicabilityDirty(a.activity_type)
                          ? "● "
                          : ""}
                        {s.required ? "Required" : "Optional"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <section className="flex min-h-0 flex-col">
            {!current && (
              <p className="flex-1 p-6 text-sm text-muted-foreground">
                {isLoading ? "Loading activity types..." : "No activity types found."}
              </p>
            )}
            {current && (
              <div className="flex-1 space-y-6 overflow-y-auto p-6">
                <div>
                  <h3 className="font-heading text-lg font-semibold tracking-wider uppercase">
                    {current.display_name}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {current.description}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide uppercase">
                    Required for reporting
                  </p>
                  <div className="inline-flex border" role="group">
                    <Button
                      type="button"
                      variant={currentSettings.required ? "default" : "ghost"}
                      onClick={() => update({ required: true })}
                    >
                      Required
                    </Button>
                    <Button
                      type="button"
                      variant={!currentSettings.required ? "default" : "ghost"}
                      onClick={() => update({ required: false })}
                    >
                      Not required
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide uppercase">
                    Data frequency
                  </p>
                  <Select
                    value={currentSettings.frequency}
                    onValueChange={(v) =>
                      update({ frequency: v as ActivityFrequency })
                    }
                    disabled={!currentSettings.required}
                  >
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCY_OPTIONS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!currentSettings.required && (
                    <p className="text-xs text-muted-foreground">
                      Frequency is not used while this activity is not required.
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold tracking-wide uppercase">
                      Location applicability
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Choose whether this activity is expected at each location.
                      Unset locations prevent a completeness calculation.
                    </p>
                  </div>
                  {locations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Add a location before configuring applicability.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {locations.map((location) => {
                        const value = currentApplicability[location.id];
                        return (
                          <label
                            key={location.id}
                            className="flex items-center justify-between gap-4 border p-3 text-sm"
                          >
                            <span>{location.location_name}</span>
                            <select
                              aria-label={`${current.display_name} applicability at ${location.location_name}`}
                              value={
                                value === undefined
                                  ? ""
                                  : value
                                    ? "applicable"
                                    : "not-applicable"
                              }
                              onChange={(event) =>
                                updateApplicability(
                                  location.id,
                                  event.target.value === ""
                                    ? undefined
                                    : event.target.value === "applicable",
                                )
                              }
                              className="rounded-md border bg-background px-2 py-1"
                            >
                              <option value="">Choose...</option>
                              <option value="applicable">Applies</option>
                              <option value="not-applicable">
                                Not applicable
                              </option>
                            </select>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3 border-t p-4">
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                Marking an activity as not required does not delete any data. It
                is only excluded from completion progress and calculations.
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {dirtyCount > 0
                    ? `${dirtyCount} unsaved ${dirtyCount === 1 ? "change" : "changes"}`
                    : "No changes"}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={dirtyCount === 0 || isSaving}
                  >
                    {isSaving ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
