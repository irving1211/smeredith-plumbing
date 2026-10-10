import options from "../../src/service-options.json" with { type: "json" };
import heardAbout from "../../src/heard-about.json" with { type: "json" };
import { classifySource, cleanReferrer, cleanToken } from "../../src/lib/attribution.js";
import { detectTowns, townBySlug } from "../../src/lib/service-area.js";

interface Env {
  CONTACT_MAIL_PROVIDER?: string;
  CONTACT_TO_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_EMAIL_API_TOKEN?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  /** Optional. When set, every submission must carry a valid Cloudflare Turnstile token. */
  TURNSTILE_SECRET_KEY?: string;
}

type Attribution = {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  landingPage: string;
  referrer: string;
  latestUtmSource: string;
  latestUtmMedium: string;
  latestUtmCampaign: string;
};

type LeadPayload = Attribution & {
  name: string;
  phone: string;
  email: string;
  address: string;
  serviceId: string;
  message: string;
  heardAboutId: string;
};

type UploadedPhoto = {
  ext: string;
  content: string;
  contentType: string;
};

type EmailAttachment = {
  filename: string;
  content: string;
  contentType: string;
};

type OutgoingMessage = {
  to: string;
  from: string;
  subject: string;
  replyTo: string;
  html: string;
  text: string;
  attachment: EmailAttachment | null;
};

type FailureCode = "validation" | "delivery" | "rate" | "verification" | "blocked";

const DEFAULT_TO_EMAIL = "shane@smeredithplumbing.com";
const DEFAULT_FROM_EMAIL = "shane@smeredithplumbing.com";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT = 5;
const RATE_WINDOW_SECONDS = 10 * 60;
const MAX_LINKS_IN_MESSAGE = 2;

const SERVICE_LABELS = new Map<string, string>(options.map((o) => [o.id, o.label]));
const DEFAULT_SERVICE_ID = options.find((o) => (o as { default?: boolean }).default)?.id || "general-plumbing";

// Pages cached before the stable-ID rollout still post the old option text.
const LEGACY_SERVICE_VALUES: Record<string, string> = {
  Emergency: "emergency-plumbing",
  "Water heater": "water-heater-replacement",
  "Boiler / heating": "boiler-service",
  "General plumbing": "general-plumbing",
  "Remodel / new construction": "kitchen-bath-remodels",
  "Something else": "other",
};

const HEARD_ABOUT: Record<string, string> = Object.fromEntries(heardAbout.map((h) => [h.id, h.label]));
const LEGACY_HEARD_ABOUT = new Map(Object.entries(HEARD_ABOUT).map(([id, label]) => [label, id]));

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  const wantsJson = (request.headers.get("accept") || "").includes("application/json");
  const requestUrl = new URL(request.url);
  const thanksUrl = new URL("/contact/thanks/", requestUrl);
  const formUrl = new URL("/contact/", requestUrl);

  // Browser form posts: honour same-origin success/error targets. JSON posts always use the defaults.
  let successUrl = thanksUrl;
  let errorUrl = formUrl;

  const fail = (code: FailureCode, status: number): Response => {
    if (wantsJson) return json({ ok: false, error: code }, status);
    return redirect(withStatus(errorUrl, code));
  };

  // Cross-site form posts are never legitimate here (the form is same-origin).
  const origin = request.headers.get("origin");
  if (origin && origin !== requestUrl.origin) return fail("blocked", 403);

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_REQUEST_BYTES) return fail("validation", 413);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail("validation", 400);
  }

  if (!wantsJson) {
    successUrl = normalizeRedirectUrl(formData.get("success_url"), thanksUrl);
    errorUrl = normalizeRedirectUrl(formData.get("error_url"), formUrl);
  }

  // Honeypot: pretend success so bots learn nothing. No email, no lead ID, so no conversion is ever counted.
  if (getString(formData, "_honey")) {
    return wantsJson ? json({ ok: true, redirect: successUrl.toString() }, 200) : redirect(successUrl);
  }

  if (await isRateLimited(request)) return fail("rate", 429);

  if (env.TURNSTILE_SECRET_KEY) {
    const verified = await verifyTurnstile(
      env.TURNSTILE_SECRET_KEY,
      getString(formData, "cf-turnstile-response", 2048),
      request.headers.get("cf-connecting-ip") || "",
    );
    if (!verified) return fail("verification", 403);
  }

  const serviceId = resolveServiceId(getString(formData, "service_type", 120));
  const payload: LeadPayload | null = serviceId
    ? {
        name: getString(formData, "name", 120),
        phone: getString(formData, "phone", 50),
        email: getString(formData, "email", 160),
        address: getString(formData, "address", 200),
        serviceId,
        message: getString(formData, "message", 4000),
        heardAboutId: resolveHeardAbout(getString(formData, "heard_about", 80)),
        utmSource: cleanToken(formData.get("utm_source"), 100),
        utmMedium: cleanToken(formData.get("utm_medium"), 100),
        utmCampaign: cleanToken(formData.get("utm_campaign"), 100),
        landingPage: cleanLandingPage(formData.get("landing_page")),
        referrer: cleanReferrer(formData.get("referrer")),
        latestUtmSource: cleanToken(formData.get("latest_utm_source"), 100),
        latestUtmMedium: cleanToken(formData.get("latest_utm_medium"), 100),
        latestUtmCampaign: cleanToken(formData.get("latest_utm_campaign"), 100),
      }
    : null;

  if (!payload || isInvalidPayload(payload)) return fail("validation", 400);

  const attachment = await readAttachment(formData.get("photo"));
  if (attachment instanceof Error) return fail("validation", 400);

  const leadId = crypto.randomUUID();
  const source = classifySource(payload);
  const serviceLabel = SERVICE_LABELS.get(payload.serviceId) || payload.serviceId;
  const subject = `New service request - ${stripControl(serviceLabel)} - ${stripControl(payload.name)}`;
  const replyTo = payload.email || DEFAULT_TO_EMAIL;

  try {
    await sendMessage(env, {
      to: env.CONTACT_TO_EMAIL || DEFAULT_TO_EMAIL,
      from: env.CONTACT_FROM_EMAIL || env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL,
      subject,
      replyTo,
      html: buildHtmlEmail(payload, leadId, source.label, serviceLabel),
      text: buildTextEmail(payload, leadId, source.label, serviceLabel),
      // Never reuse the visitor's file name (it can carry a person's name or path): random id + sniffed extension.
      attachment: attachment
        ? { filename: `photo-${leadId.slice(0, 8)}.${attachment.ext}`, content: attachment.content, contentType: attachment.contentType }
        : null,
    });
  } catch (error) {
    // Message only (no payload): provider errors never include the visitor's details.
    console.error("Contact form delivery failed", leadId, error instanceof Error ? error.message : String(error));
    return fail("delivery", 502);
  }

  // Analytics-safe confirmation: only enumerated ids and a random lead id travel in the URL.
  const confirmed = new URL(successUrl.toString());
  confirmed.searchParams.set("lead", leadId);
  confirmed.searchParams.set("svc", payload.serviceId);
  confirmed.searchParams.set("src", source.id);
  if (payload.heardAboutId) confirmed.searchParams.set("ha", payload.heardAboutId);

  return wantsJson ? json({ ok: true, leadId, redirect: confirmed.toString() }, 200) : redirect(confirmed);
};

function getString(formData: FormData, key: string, maxLength = 0): string {
  const raw = formData.get(key);
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  return maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function stripControl(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]+/g, " ").trim();
}

function resolveServiceId(raw: string): string | null {
  if (!raw) return DEFAULT_SERVICE_ID;
  if (SERVICE_LABELS.has(raw)) return raw;
  return LEGACY_SERVICE_VALUES[raw] || null;
}

function resolveHeardAbout(raw: string): string {
  if (!raw) return "";
  if (raw in HEARD_ABOUT) return raw;
  return LEGACY_HEARD_ABOUT.get(raw) || "";
}

function cleanLandingPage(value: FormDataEntryValue | null): string {
  const path = cleanToken(value, 300);
  return path.startsWith("/") && !path.startsWith("//") ? path.split(/[?#]/)[0] : "";
}

function isInvalidPayload(payload: LeadPayload): boolean {
  if (!payload.name || !payload.phone || !payload.address || !payload.message) {
    return true;
  }

  if (payload.phone.replace(/[^\d]/g, "").length < 7) {
    return true;
  }

  if (payload.email && !EMAIL_REGEX.test(payload.email)) {
    return true;
  }

  // Link-stuffed messages are spam; a real service request rarely contains more than a link or two.
  if ((payload.message.match(/https?:\/\/|www\./gi) || []).length > MAX_LINKS_IN_MESSAGE) {
    return true;
  }

  return false;
}

// Best-effort per-IP throttle using the edge Cache API. It is per data centre and not atomic, so it
// slows floods rather than guaranteeing a cap; a Cloudflare WAF rate-limit rule or Turnstile is the
// hard control (see the activation notes). Fails open so a cache outage never blocks a real customer.
async function isRateLimited(request: Request): Promise<boolean> {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const ip = request.headers.get("cf-connecting-ip");
  if (!cache || !ip) return false;

  try {
    const bucket = Math.floor(Date.now() / (RATE_WINDOW_SECONDS * 1000));
    const key = new Request(`https://rate-limit.internal/contact/${encodeURIComponent(ip)}/${bucket}`);
    const hit = await cache.match(key);
    const count = hit ? Number(await hit.text()) || 0 : 0;
    if (count >= RATE_LIMIT) return true;
    await cache.put(
      key,
      new Response(String(count + 1), { headers: { "Cache-Control": `max-age=${RATE_WINDOW_SECONDS + 60}` } }),
    );
  } catch {
    return false;
  }
  return false;
}

async function verifyTurnstile(secret: string, token: string, ip: string): Promise<boolean> {
  if (!token) return false;
  try {
    const body = new FormData();
    body.set("secret", secret);
    body.set("response", token);
    if (ip) body.set("remoteip", ip);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    if (!response.ok) return false;
    const data = (await response.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

// Decide the file type from its bytes, never from the browser-supplied name or MIME type.
function sniffFileType(bytes: Uint8Array): { ext: string; type: string } | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a) return { ext: "png", type: "image/png" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { ext: "webp", type: "image/webp" };
  if (ascii(0, 5) === "%PDF-") return { ext: "pdf", type: "application/pdf" };
  if (ascii(4, 8) === "ftyp" && ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(ascii(8, 12))) {
    return { ext: "heic", type: "image/heic" };
  }
  return null;
}

async function readAttachment(value: FormDataEntryValue | null): Promise<UploadedPhoto | null | Error> {
  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  if (value.size > MAX_FILE_BYTES) {
    return new Error("file-too-large");
  }

  const buffer = await value.arrayBuffer();
  const kind = sniffFileType(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 16)));
  if (!kind) {
    return new Error("unsupported-file-type");
  }

  return { ext: kind.ext, content: arrayBufferToBase64(buffer), contentType: kind.type };
}

async function sendMessage(env: Env, message: OutgoingMessage): Promise<void> {
  const provider = (env.CONTACT_MAIL_PROVIDER || "auto").toLowerCase();

  if (provider === "cloudflare" || provider === "auto") {
    try {
      await sendViaCloudflare(env, message);
      return;
    } catch (error) {
      if (provider === "cloudflare") throw error;
    }
  }

  if (provider === "resend" || provider === "auto") {
    await sendViaResend(env, message);
    return;
  }

  throw new Error("No configured mail provider");
}

async function sendViaCloudflare(env: Env, message: OutgoingMessage): Promise<void> {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_EMAIL_API_TOKEN) {
    throw new Error("Missing Cloudflare Email Service credentials");
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/email/sending/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_EMAIL_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: message.to,
        from: message.from,
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: {
          "Reply-To": message.replyTo,
        },
        attachments: message.attachment
          ? [
              {
                filename: message.attachment.filename,
                content: message.attachment.content,
                contentType: message.attachment.contentType,
                disposition: "attachment",
              },
            ]
          : undefined,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Cloudflare Email Service failed: ${response.status}`);
  }

  const data = (await response.json()) as { success?: boolean; errors?: Array<{ message?: string }> };
  if (!data.success) {
    throw new Error(
      data.errors?.map((item) => item.message).filter(Boolean).join("; ") ||
        "Cloudflare Email Service rejected the email",
    );
  }
}

async function sendViaResend(env: Env, message: OutgoingMessage): Promise<void> {
  if (!env.RESEND_API_KEY) {
    throw new Error("Missing Resend API key");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL || message.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      reply_to: message.replyTo,
      attachments: message.attachment
        ? [
            {
              filename: message.attachment.filename,
              content: message.attachment.content,
            },
          ]
        : undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend failed: ${response.status}`);
  }
}

function receivedAt(): string {
  return `${new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  })} ET`;
}

// Triage hint for Shane. Auto-detected from the typed town/address; never shown to the customer.
function serviceAreaNote(address: string): string {
  const detected = detectTowns(address);
  if (detected.primary) {
    const town = townBySlug(detected.primary);
    return `${town?.name ?? detected.primary} - on Shane's confirmed list${town?.note ? ` (${town.note.replace(/\.$/, "")})` : ""}`;
  }
  if (detected.matches.length) {
    const names = detected.matches.map((slug) => townBySlug(slug)?.name ?? slug).join(", ");
    return `Mentions ${names} - verify the actual town`;
  }
  return "Not on the confirmed list - confirm availability before quoting";
}

function leadRows(payload: LeadPayload, leadId: string, sourceLabel: string, serviceLabel: string): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["Lead ID", leadId],
    ["Received", receivedAt()],
    ["Service requested", `${serviceLabel} (${payload.serviceId})`],
    ["Name", payload.name],
    ["Phone", payload.phone],
    ["Email", payload.email || "Not provided"],
    ["Town / address", payload.address],
    ["Service area check", serviceAreaNote(payload.address)],
    ["Message", payload.message],
    ["Customer said they heard about us", payload.heardAboutId ? HEARD_ABOUT[payload.heardAboutId] : "Not answered"],
    ["Captured source", sourceLabel],
  ];

  const firstTag = [payload.utmSource, payload.utmMedium, payload.utmCampaign].filter(Boolean).join(" / ");
  if (firstTag) rows.push(["First-touch tag (source / medium / campaign)", firstTag]);
  if (payload.landingPage) rows.push(["Landing page (first visit)", payload.landingPage]);
  if (payload.referrer) rows.push(["Referrer (first visit)", payload.referrer]);

  // A later campaign tag is kept separately and only shown when it differs from first touch.
  const latestTag = [payload.latestUtmSource, payload.latestUtmMedium, payload.latestUtmCampaign].filter(Boolean).join(" / ");
  if (latestTag && latestTag !== firstTag) rows.push(["Later campaign tag in the same visit", latestTag]);

  return rows;
}

function buildHtmlEmail(payload: LeadPayload, leadId: string, sourceLabel: string, serviceLabel: string): string {
  const rows = leadRows(payload, leadId, sourceLabel, serviceLabel)
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 12px;border:1px solid #d1d5db;font-weight:700;background:#f5f5f5;">${escapeHtml(
          label,
        )}</td><td style="padding:10px 12px;border:1px solid #d1d5db;">${escapeHtml(value).replace(/\n/g, "<br>")}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#faf9f6;color:#111111;font-family:Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <h1 style="margin:0 0 12px;font-size:26px;line-height:1.1;">New website service request</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">A homeowner submitted the S. Meredith Plumbing & Heating contact form. Record it in the lead tracker with the Lead ID below.</p>
      <table style="width:100%;border-collapse:collapse;font-size:15px;line-height:1.5;">${rows}</table>
    </div>
  </body>
</html>`;
}

function buildTextEmail(payload: LeadPayload, leadId: string, sourceLabel: string, serviceLabel: string): string {
  const lines = ["New website service request", "Record it in the lead tracker with the Lead ID below.", ""];
  for (const [label, value] of leadRows(payload, leadId, sourceLabel, serviceLabel)) {
    if (label === "Message") lines.push("", "Message:", value, "");
    else if (label.startsWith("Customer said")) lines.push("Lead source:", `${label}: ${value}`);
    else lines.push(`${label}: ${value}`);
  }
  return lines.join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Only same-origin redirect targets are honored; anything else falls back (prevents open redirects).
function normalizeRedirectUrl(value: FormDataEntryValue | null, fallback: URL): URL {
  if (typeof value === "string" && value.trim()) {
    try {
      const candidate = new URL(value, fallback);
      if (candidate.origin === fallback.origin) return candidate;
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function withStatus(url: URL, status: string): URL {
  const next = new URL(url.toString());
  next.searchParams.set("status", status);
  return next;
}

function redirect(url: URL): Response {
  return new Response(null, { status: 303, headers: { Location: url.toString(), "Cache-Control": "no-store" } });
}

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}
