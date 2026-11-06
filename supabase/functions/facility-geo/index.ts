/**
 * facility-geo — server-side proxy for the map's geocoding and routing needs.
 *
 * The browser cannot call these services directly (they are not CORS-enabled for
 * arbitrary origins), so every request goes through here. Two actions:
 *
 *   GET  ?action=search&q=<text>   → address / landmark lookups, bounded to Bacolod
 *   POST ?action=route  { from, to, profile } → a real driving/walking route
 *
 * Only OpenStreetMap endpoints are ever contacted, so this cannot be abused as an
 * open proxy. No user data is stored or logged.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PHOTON = "https://photon.komoot.io/api";

/** Per-mode routing servers, so walking and cycling get real travel times. */
const ROUTE_SERVERS: Record<string, string> = {
  driving: "https://routing.openstreetmap.de/routed-car/route/v1/driving",
  walking: "https://routing.openstreetmap.de/routed-foot/route/v1/foot",
  cycling: "https://routing.openstreetmap.de/routed-bike/route/v1/bike",
};
const USER_AGENT = "BiteCare/1.0 (animal bite management and monitoring system)";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidLatLng(lat: unknown, lng: unknown): boolean {
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && a >= -90 && a <= 90 && b >= -180 && b <= 180;
}

async function handleSearch(query: string): Promise<Response> {
  const q = query.trim().slice(0, 120);
  if (q.length < 3) return json({ results: [] });

  const url = new URL(PHOTON);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "8");
  url.searchParams.set("lang", "en");
  // Hard-bound to Bacolod City and its immediate surroundings.
  url.searchParams.set("bbox", "122.86,10.57,123.08,10.75");

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) return json({ error: "The address lookup service is unavailable right now." }, 502);

  const raw = await res.json();
  const features: Record<string, unknown>[] = Array.isArray(raw?.features) ? raw.features : [];

  const mapped = features
    .map((f) => {
      const coords = (f.geometry as { coordinates?: number[] } | undefined)?.coordinates ?? [];
      const p = (f.properties ?? {}) as Record<string, string | undefined>;
      const parts = [p.name, p.street, p.district, p.city].filter(
        (part): part is string => Boolean(part),
      );
      return {
        label: Array.from(new Set(parts)).join(", ") || p.name || "",
        lat: Number(coords[1]),
        lng: Number(coords[0]),
        city: p.city ?? "",
      };
    })
    .filter((r) => isValidLatLng(r.lat, r.lng) && r.label);

  // Prefer places inside Bacolod; fall back to whatever the box returned so a
  // user near the city edge is not left without any result.
  const inCity = mapped.filter((r) => r.city.toLowerCase().includes("bacolod"));
  const results = (inCity.length > 0 ? inCity : mapped)
    .slice(0, 5)
    .map(({ label, lat, lng }) => ({ label, lat, lng }));

  return json({ results });
}

async function handleRoute(body: Record<string, unknown> | null): Promise<Response> {
  const from = body?.from as { lat?: unknown; lng?: unknown } | undefined;
  const to = body?.to as { lat?: unknown; lng?: unknown } | undefined;
  if (!from || !to || !isValidLatLng(from.lat, from.lng) || !isValidLatLng(to.lat, to.lng)) {
    return json({ error: "A valid start and destination are required." }, 400);
  }

  const profile = String(body?.profile ?? "driving");
  const base = ROUTE_SERVERS[profile] ?? ROUTE_SERVERS.driving;
  const url =
    `${base}/` +
    `${Number(from.lng)},${Number(from.lat)};${Number(to.lng)},${Number(to.lat)}` +
    `?overview=full&geometries=geojson&alternatives=false&steps=false`;

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return json({ error: "The routing service is unavailable right now." }, 502);

  const data = await res.json();
  const route = data?.routes?.[0];
  if (data?.code !== "Ok" || !route) {
    return json({ error: "No route could be found between those points." }, 404);
  }

  // OSRM returns [lng, lat]; Leaflet wants [lat, lng].
  const geometry = (route.geometry?.coordinates ?? []).map(
    (pair: number[]) => [pair[1], pair[0]],
  );

  return json({
    distance: Number(route.distance) || 0,
    duration: Number(route.duration) || 0,
    geometry,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "search") {
      return await handleSearch(url.searchParams.get("q") ?? "");
    }

    if (action === "route") {
      if (req.method !== "POST") return json({ error: "Use POST for route requests." }, 405);
      const body = await req.json().catch(() => null);
      return await handleRoute(body);
    }

    return json({ error: "Unknown action." }, 400);
  } catch {
    return json({ error: "The mapping service could not be reached. Please try again." }, 500);
  }
});
