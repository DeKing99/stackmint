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

const MAX_SUGGESTIONS = 7;

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

  try {
    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
    );
    url.searchParams.set("access_token", mapboxToken);
    url.searchParams.set("autocomplete", "true");
    url.searchParams.set("limit", String(MAX_SUGGESTIONS));
    url.searchParams.set("types", "address,place,locality,postcode,region,country");
    url.searchParams.set("language", "en");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
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
