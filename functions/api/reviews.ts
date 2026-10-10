// GET /api/reviews — latest Google reviews for Shane's verified Business Profile, read through the
// official Business Profile API with an owner-granted OAuth refresh token (server side only).
//
// Policy-driven design (see _context/reviews-and-maps-api-research-2026-10-10.md):
//  * Fetched live and cached briefly at the edge (6 h fresh, up to 24 h stale on upstream failure);
//    review text is never baked into the static build, so stored content stays well under 30 days.
//  * No rating filter and no re-ordering: newest first, as returned. Aggregate numbers are Google's own.
//  * Reviewer name and date are shown as provided. Profile photos are not loaded (privacy, no hotlinking).
//  * Any problem — missing credentials, no API access yet, quota, revoked token — yields
//    {status:"unavailable"} and the page keeps its hand-picked testimonials. Never an error page.
//  * Nothing secret is ever returned or logged.

interface Env {
  GBP_CLIENT_ID?: string;
  GBP_CLIENT_SECRET?: string;
  GBP_REFRESH_TOKEN?: string;
  /** Numeric account id from accounts.list, e.g. "1234567890" */
  GBP_ACCOUNT_ID?: string;
  /** Numeric location id from accounts.locations.list, e.g. "9876543210" */
  GBP_LOCATION_ID?: string;
}

type PublicReview = { name: string; stars: number; text: string; date: string };
type ReviewsPayload = {
  status: "ok";
  source: "google-business-profile";
  fetchedAt: string;
  averageRating: number | null;
  totalReviewCount: number | null;
  reviews: PublicReview[];
};
type Unavailable = { status: "unavailable"; reason: string };

const FRESH_MS = 6 * 60 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;
const SHOW = 6;
const CACHE_KEY = "https://reviews.internal/gbp/v1";
const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

class UpstreamError extends Error {
  reason: string;
  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

let tokenCache: { value: string; expiresAt: number } | null = null;

export const onRequestGet = async ({ env }: { env: Env }): Promise<Response> => {
  if (!isConfigured(env)) return respond({ status: "unavailable", reason: "not_configured" }, 60);

  const cached = await readCache();
  if (cached && cached.ageMs < FRESH_MS) return respond(cached.body, 300);

  try {
    const fresh = await fetchReviews(env);
    await writeCache(fresh);
    return respond(fresh, 300);
  } catch (error) {
    const reason = error instanceof UpstreamError ? error.reason : "upstream";
    console.error("Reviews refresh failed:", reason);
    if (cached && cached.ageMs < STALE_MS) return respond(cached.body, 60);
    return respond({ status: "unavailable", reason }, 60);
  }
};

function isConfigured(env: Env): boolean {
  return Boolean(env.GBP_CLIENT_ID && env.GBP_CLIENT_SECRET && env.GBP_REFRESH_TOKEN && env.GBP_ACCOUNT_ID && env.GBP_LOCATION_ID);
}

async function accessToken(env: Env): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GBP_CLIENT_ID!,
        client_secret: env.GBP_CLIENT_SECRET!,
        refresh_token: env.GBP_REFRESH_TOKEN!,
        grant_type: "refresh_token",
      }),
    });
  } catch {
    throw new UpstreamError("upstream");
  }
  if (!response.ok) throw new UpstreamError("auth");
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new UpstreamError("auth");
  tokenCache = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3000) * 1000 };
  return data.access_token;
}

async function fetchReviews(env: Env): Promise<ReviewsPayload> {
  const token = await accessToken(env);
  const url = new URL(
    `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(env.GBP_ACCOUNT_ID!)}/locations/${encodeURIComponent(env.GBP_LOCATION_ID!)}/reviews`,
  );
  url.searchParams.set("pageSize", "50");
  url.searchParams.set("orderBy", "updateTime desc");

  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new UpstreamError("upstream");
  }
  if (response.status === 401) {
    tokenCache = null;
    throw new UpstreamError("auth");
  }
  if (response.status === 403) throw new UpstreamError("forbidden");
  if (response.status === 429) throw new UpstreamError("quota");
  if (!response.ok) throw new UpstreamError("upstream");

  const data = (await response.json()) as {
    reviews?: Array<{
      reviewer?: { displayName?: string; isAnonymous?: boolean };
      starRating?: string;
      comment?: string;
      createTime?: string;
    }>;
    averageRating?: number;
    totalReviewCount?: number;
  };

  const reviews: PublicReview[] = (data.reviews || [])
    .map((r) => ({
      name: r.reviewer?.isAnonymous ? "A Google user" : clean(r.reviewer?.displayName, 60) || "A Google user",
      stars: STARS[r.starRating || ""] || 0,
      text: clean(r.comment, 2000),
      date: (r.createTime || "").slice(0, 10),
    }))
    // Only reviews that have words can be shown as a quote. Ratings are never used to include or exclude.
    .filter((r) => r.stars > 0 && r.text)
    .slice(0, SHOW);

  return {
    status: "ok",
    source: "google-business-profile",
    fetchedAt: new Date().toISOString(),
    averageRating: typeof data.averageRating === "number" ? data.averageRating : null,
    totalReviewCount: typeof data.totalReviewCount === "number" ? data.totalReviewCount : null,
    reviews,
  };
}

// Google's reviewer text can contain a translation banner like "(Translated by Google)"; we pass the
// text through as provided, only removing control characters.
function clean(value: string | undefined, max: number): string {
  return (value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

async function readCache(): Promise<{ body: ReviewsPayload; ageMs: number } | null> {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  if (!cache) return null;
  try {
    const hit = await cache.match(new Request(CACHE_KEY));
    if (!hit) return null;
    const body = (await hit.json()) as ReviewsPayload;
    const fetchedAt = Date.parse(body.fetchedAt);
    if (!Number.isFinite(fetchedAt)) return null;
    return { body, ageMs: Date.now() - fetchedAt };
  } catch {
    return null;
  }
}

async function writeCache(body: ReviewsPayload): Promise<void> {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  if (!cache) return;
  try {
    await cache.put(
      new Request(CACHE_KEY),
      new Response(JSON.stringify(body), { headers: { "Cache-Control": `max-age=${STALE_MS / 1000}` } }),
    );
  } catch {
    // caching is an optimisation only
  }
}

function respond(body: ReviewsPayload | Unavailable, maxAge: number): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${maxAge}` },
  });
}

/** Test hook: forget the in-memory access token. */
export function __resetForTests(): void {
  tokenCache = null;
}
