import options from "../../src/service-options.json" with { type: "json" };
import heardAbout from "../../src/heard-about.json" with { type: "json" };
import { classifySource, cleanReferrer, cleanToken } from "../../src/lib/attribution.js";
import { detectTowns, townBySlug } from "../../src/lib/service-area.js";
import { ISSUE_SATISFIES_DESCRIPTION, isTiming, readAnswers, timingLabel } from "../../src/lib/request-questions.js";

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
  /** Optional street address; the required town stays in `address`. */
  street: string;
  /** now | soon | planning, or empty when the visitor did not say. */
  timing: string;
  /** Answers to the service-specific questions, already turned into labels. */
  answers: { question: string; answer: string }[];
  issueAnswered: boolean;
  /** Random id the page generates once per load; lets a double tap or a retried post be recognised. */
  requestId: string;
  /** True when the same form was sent again with different details after an earlier email already went out. */
  isUpdate: boolean;
};

type UploadedPhoto = {
  ext: string;
  bytes: ArrayBuffer;
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
// The page shrinks phone photos in the browser first, so real uploads are far smaller; this bounds the CPU/memory a single request can use.
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
// One plain address: no angle brackets, commas, quotes or control characters (they could add recipients or headers).
const EMAIL_REGEX = /^[^\s@<>,;:"()[\]\\]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const RATE_LIMIT = 5;
const RATE_WINDOW_SECONDS = 10 * 60;
const MAX_LINKS_IN_MESSAGE = 2;

const SERVICE_LABELS = new Map<string, string>(options.map((o) => [o.id, o.label]));
// A request that names no service is recorded as "not sure": defaulting it to general plumbing would invent a choice the visitor never made.
const DEFAULT_SERVICE_ID = options.find((o) => (o as { default?: boolean }).default)?.id || "not-sure";
const REQUEST_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REQUEST_MEMORY_SECONDS = 10 * 60;

// Pages cached before the stable-ID rollout still post the old option text.
const LEGACY_SERVICE_VALUES = new Map<string, string>([
  ["Emergency", "emergency-plumbing"],
  ["Water heater", "water-heater-replacement"],
  ["Boiler / heating", "boiler-service"],
  ["General plumbing", "general-plumbing"],
  ["Remodel / new construction", "kitchen-bath-remodels"],
  ["Something else", "other"],
]);

// Maps, not plain objects: visitor-supplied keys like "constructor" or "__proto__" must never resolve to inherited members.
const HEARD_ABOUT = new Map<string, string>(heardAbout.map((h) => [h.id, h.label]));
const LEGACY_HEARD_ABOUT = new Map<string, string>(heardAbout.map((h) => [h.label, h.id]));

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

  // Throttle before reading or parsing the body, so a flood costs as little as possible.
  if (await isRateLimited(request)) return fail("rate", 429);

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

  const serviceId = resolveServiceId(getString(formData, "service_type", 120));
  const { answers, issueAnswered } = serviceId ? readAnswers(serviceId, (name: string) => getString(formData, name, 80)) : { answers: [], issueAnswered: false };
  const timing = getString(formData, "timing", 20);
  const requestId = getString(formData, "request_id", 40).toLowerCase();
  const payload: LeadPayload | null = serviceId
    ? {
        // Single-line fields: line breaks are removed so a value can never forge extra lines in the email.
        name: oneLine(getString(formData, "name", 120)),
        phone: oneLine(getString(formData, "phone", 50)),
        email: oneLine(getString(formData, "email", 160)),
        address: oneLine(getString(formData, "address", 200)),
        serviceId,
        message: cleanMessage(getString(formData, "message", 4000)),
        heardAboutId: resolveHeardAbout(getString(formData, "heard_about", 80)),
        street: oneLine(getString(formData, "street", 200)),
        timing: isTiming(timing) ? timing : "",
        answers: answers.map((a: { question: string; answer: string }) => ({ question: a.question, answer: a.answer })),
        issueAnswered,
        requestId: REQUEST_ID_REGEX.test(requestId) ? requestId : "",
        isUpdate: false,
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

  // A double tap, a retried post or a back-and-resubmit carries the same request id AND the same content: answer with
  // the confirmation we already gave, without a second email. The same id with DIFFERENT content (the visitor fixed a
  // detail after a lost reply, or someone reused an id) is never swallowed: it is sent, as an update that keeps the
  // original lead id so it is still counted once. Best effort (edge cache, per data centre).
  const printed = payload.requestId ? await fingerprint(payload, formData.get("photo")) : "";
  const earlier = payload.requestId ? await recallRequest(payload.requestId) : null;
  if (earlier && earlier.fingerprint === printed) return respondConfirmed(earlier.leadId, payload);
  if (earlier) payload.isUpdate = true;

  const attachment = await readAttachment(formData.get("photo"));
  if (attachment instanceof Error) return fail("validation", 400);

  // The challenge token is single-use, so it is only spent once the form itself is valid: a visitor who
  // fixes a typo and resends is never told "verification failed".
  if (env.TURNSTILE_SECRET_KEY) {
    const verified = await verifyTurnstile(
      env.TURNSTILE_SECRET_KEY,
      getString(formData, "cf-turnstile-response", 2048),
      request.headers.get("cf-connecting-ip") || "",
      requestUrl.hostname,
    );
    if (!verified) return fail("verification", 403);
  }

  const leadId = earlier ? earlier.leadId : crypto.randomUUID();
  const source = classifySource(payload);
  const serviceLabel = SERVICE_LABELS.get(payload.serviceId) || payload.serviceId;
  const subject = `[Website form] ${payload.isUpdate ? "Updated" : "New"} service request - ${stripControl(serviceLabel)} - ${stripControl(payload.name)}`;
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
        ? { filename: `photo-${leadId.slice(0, 8)}.${attachment.ext}`, content: arrayBufferToBase64(attachment.bytes), contentType: attachment.contentType }
        : null,
    });
  } catch (error) {
    // Message only (no payload): provider errors never include the visitor's details.
    console.error("Contact form delivery failed", leadId, error instanceof Error ? error.message : String(error));
    return fail("delivery", 502);
  }

  if (payload.requestId) await rememberRequest(payload.requestId, leadId, printed);
  return respondConfirmed(leadId, payload);

  function respondConfirmed(confirmedLeadId: string, lead: LeadPayload): Response {
    // Analytics-safe confirmation: only enumerated ids and a random lead id travel in the URL.
    const confirmed = new URL(successUrl.toString());
    confirmed.searchParams.set("lead", confirmedLeadId);
    confirmed.searchParams.set("svc", lead.serviceId);
    confirmed.searchParams.set("src", classifySource(lead).id);
    if (lead.heardAboutId) confirmed.searchParams.set("ha", lead.heardAboutId);
    return wantsJson ? json({ ok: true, leadId: confirmedLeadId, redirect: confirmed.toString() }, 200) : redirect(confirmed);
  }
};

// Remembers which lead id a request id already produced (best-effort, edge cache). Fails open: a cache outage
// can at worst let a duplicate through, never block a real customer.
const requestKey = (requestId: string) => new Request(`https://request-ids.invalid/${requestId}`);
const REMEMBERED_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\|([0-9a-f]{32})$/;
async function recallRequest(requestId: string): Promise<{ leadId: string; fingerprint: string } | null> {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  if (!cache) return null;
  try {
    const hit = await cache.match(requestKey(requestId));
    const match = REMEMBERED_REGEX.exec(hit ? (await hit.text()).trim() : "");
    return match ? { leadId: match[1], fingerprint: match[2] } : null;
  } catch {
    return null;
  }
}
async function rememberRequest(requestId: string, leadId: string, printed: string): Promise<void> {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  if (!cache) return;
  try {
    await cache.put(requestKey(requestId), new Response(`${leadId}|${printed}`, { headers: { "Cache-Control": `max-age=${REQUEST_MEMORY_SECONDS}` } }));
  } catch {
    /* best effort */
  }
}
// A short fingerprint of what was sent (including the size of any photo), so a repeat is told apart from an edit.
async function fingerprint(p: LeadPayload, photo: FormDataEntryValue | null): Promise<string> {
  const photoSize = typeof photo === "object" && photo && "size" in photo ? (photo as File).size : 0;
  const bytes = new TextEncoder().encode(
    JSON.stringify([p.serviceId, p.name, p.phone, p.email, p.address, p.street, p.message, p.timing, p.heardAboutId, p.answers.map((a) => [a.question, a.answer]), photoSize]),
  );
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function getString(formData: FormData, key: string, maxLength = 0): string {
  const raw = formData.get(key);
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  return maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

// Control characters (including the C1 range), line/paragraph separators and text-direction overrides: none of them
// belong in a name, a subject line or an email body, and some mail clients turn them into line breaks or reorder text.
const HIDDEN_CHARS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]+/g;

function oneLine(value: string): string {
  return value.replace(HIDDEN_CHARS, " ").replace(/\s+/g, " ").trim();
}

function stripControl(value: string): string {
  return value.replace(HIDDEN_CHARS, " ").trim();
}

// The free-text message keeps its line breaks (every kind is normalised to \n) and its tabs, nothing else hidden.
function cleanMessage(value: string): string {
  return value
    .replace(/\r\n|\r|\u0085|\u2028|\u2029/g, "\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, "")
    .trim();
}

function resolveServiceId(raw: string): string | null {
  if (!raw) return DEFAULT_SERVICE_ID;
  if (SERVICE_LABELS.has(raw)) return raw;
  return LEGACY_SERVICE_VALUES.get(raw) || null;
}

function resolveHeardAbout(raw: string): string {
  if (!raw) return "";
  if (HEARD_ABOUT.has(raw)) return raw;
  return LEGACY_HEARD_ABOUT.get(raw) || "";
}

function cleanLandingPage(value: FormDataEntryValue | null): string {
  const path = cleanToken(value, 300);
  return path.startsWith("/") && !path.startsWith("//") ? path.split(/[?#]/)[0] : "";
}

function isInvalidPayload(payload: LeadPayload): boolean {
  // The written description is required unless the visitor picked what the problem is (and it was not "something else").
  const hasDescription = Boolean(payload.message) || (ISSUE_SATISFIES_DESCRIPTION && payload.issueAnswered);
  if (!payload.name || !payload.phone || !payload.address || !hasDescription) {
    return true;
  }

  if (payload.phone.replace(/[^\d]/g, "").length < 7) {
    return true;
  }

  if (payload.email && !EMAIL_REGEX.test(payload.email)) {
    return true;
  }

  // Link-stuffed requests are spam; a real service request rarely contains more than a link or two. Every free-text
  // field counts, because a request that is only a chosen problem has no message to hold the links.
  const freeText = [payload.message, payload.name, payload.address, payload.street].join(" ");
  if ((freeText.match(/https?:\/\/|www\./gi) || []).length > MAX_LINKS_IN_MESSAGE) {
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
    const key = new Request(`https://rate-limit.internal/contact/${encodeURIComponent(rateKeyFor(ip))}/${bucket}`);
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

// IPv4 addresses are keyed as-is; IPv6 addresses by their /64 prefix (one household/device can rotate through the whole /64).
function rateKeyFor(ip: string): string {
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = ip.includes("::") && tail ? tail.split(":") : [];
  const missing = Math.max(0, 8 - headGroups.length - tailGroups.length);
  const groups = [...headGroups, ...Array(ip.includes("::") ? missing : 0).fill("0"), ...tailGroups];
  return groups.slice(0, 4).map((g) => g.padStart(4, "0")).join(":");
}

async function verifyTurnstile(secret: string, token: string, ip: string, hostname: string): Promise<boolean> {
  if (!token) return false;
  try {
    const body = new FormData();
    body.set("secret", secret);
    body.set("response", token);
    if (ip) body.set("remoteip", ip);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    if (!response.ok) return false;
    const data = (await response.json()) as { success?: boolean; hostname?: string };
    // A token minted for another site must not pass here.
    if (data.hostname && data.hostname !== hostname) return false;
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

  return { ext: kind.ext, bytes: buffer, contentType: kind.type };
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
    ...(payload.isUpdate ? [["This is an update", "The same form was sent again with different details. It has the same Lead ID as the earlier email; use this version."] as [string, string]] : []),
    ["Received", receivedAt()],
    ["Service requested", `${serviceLabel} (${payload.serviceId})`],
    ["How soon", payload.timing ? timingLabel(payload.timing) : "Not answered"],
    ...payload.answers.map((a): [string, string] => [a.question, a.answer]),
    ["Name", payload.name],
    ["Phone", payload.phone],
    ["Email", payload.email || "Not provided"],
    ["Town / address", [payload.street, payload.address].filter(Boolean).join(", ")],
    ["Service area check", serviceAreaNote(payload.address)],
    ["Message", payload.message || "Not written (the customer answered the questions above)"],
    ["Customer said they heard about us", payload.heardAboutId ? HEARD_ABOUT.get(payload.heardAboutId) || "Not answered" : "Not answered"],
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
    if (label === "Message") lines.push("", "Message:", ...value.split(/\r?\n/).map((line) => `  ${line}`), "");
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
  return new Response(null, { status: 303, headers: { Location: url.toString(), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // Native encoder where the runtime has it (much less CPU than the loop below; Workers' free plan allows ~10 ms).
  const native = (bytes as unknown as { toBase64?: () => string }).toBase64;
  if (typeof native === "function") return native.call(bytes);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }

  return btoa(binary);
}
