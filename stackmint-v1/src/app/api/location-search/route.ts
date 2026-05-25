import { NextRequest, NextResponse } from "next/server";

type MapboxFeature = {
  id: string;
  place_name?: string;
  center?: [number, number];
  geometry?: {
    coordinates?: [number, number];
  };
  text?: string;
};

type MapboxResponse = {
  features?: MapboxFeature[];
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function getRateLimitKey(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";
  return `location-search:${ip}`;
}

export async function GET(request: NextRequest) {
  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!mapboxToken) {
    return NextResponse.json(
      { error: "Location search is not configured" },
      { status: 503 },
    );
  }

  const query = request.nextUrl.searchParams.get("query")?.trim() ?? "";
  if (query.length < 3) {
    return NextResponse.json(
      { suggestions: [] },
      {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
        },
      },
    );
  }

  const now = Date.now();
  const rateLimitKey = getRateLimitKey(request);
  const currentEntry = rateLimitStore.get(rateLimitKey);
  if (!currentEntry || currentEntry.resetAt <= now) {
    rateLimitStore.set(rateLimitKey, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
  } else if (currentEntry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return NextResponse.json(
      { error: "Too many address search requests. Please retry shortly." },
      { status: 429 },
    );
  } else {
    currentEntry.count += 1;
    rateLimitStore.set(rateLimitKey, currentEntry);
  }

  try {
    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
    );
    url.searchParams.set("access_token", mapboxToken);
    url.searchParams.set("autocomplete", "true");
    url.searchParams.set("limit", "7");
    url.searchParams.set("types", "address,place,locality,postcode,region,country");
    url.searchParams.set("language", "en");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      const status = response.status;
      return NextResponse.json(
        { error: "Address provider request failed" },
        { status: status >= 500 ? 502 : status },
      );
    }

    const data = (await response.json()) as MapboxResponse;

    const suggestions = (data.features ?? [])
      .map((feature) => {
        const coordinates =
          feature.center ?? feature.geometry?.coordinates ?? undefined;
        if (!coordinates || coordinates.length < 2) return null;

        const [longitude, latitude] = coordinates;
        if (typeof latitude !== "number" || typeof longitude !== "number") {
          return null;
        }

        return {
          id: feature.id,
          formattedAddress: feature.place_name ?? "",
          displayName: feature.text ?? feature.place_name ?? "",
          latitude,
          longitude,
        };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value));

    return NextResponse.json(
      { suggestions },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("Location search API error:", error);
    return NextResponse.json(
      { error: "Address lookup failed. Please try again." },
      { status: 502 },
    );
  }
}
