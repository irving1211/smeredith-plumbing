interface Env {
  CONTACT_MAIL_PROVIDER?: string;
  CONTACT_TO_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_EMAIL_API_TOKEN?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
}

type EmailAttachment = {
  filename: string;
  content: string;
  contentType: string;
};

const DEFAULT_TO_EMAIL = "shane@smeredithplumbing.com";
const DEFAULT_FROM_EMAIL = "forms@smeredithplumbing.com";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  const formData = await request.formData();

  const successUrl = normalizeRedirectUrl(
    formData.get("success_url"),
    new URL("/contact/thanks/", request.url),
  );
  const errorUrl = normalizeRedirectUrl(
    formData.get("error_url"),
    new URL("/contact/", request.url),
  );

  if (getString(formData, "_honey")) {
    return redirect(successUrl);
  }

  const payload = {
    name: getString(formData, "name", 120),
    phone: getString(formData, "phone", 50),
    email: getString(formData, "email", 160),
    address: getString(formData, "address", 200),
    serviceType: getString(formData, "service_type", 120) || "General plumbing service",
    message: getString(formData, "message", 4000),
  };

  if (isInvalidPayload(payload)) {
    return redirect(withStatus(errorUrl, "validation"));
  }

  const attachment = await readAttachment(formData.get("photo"));
  if (attachment instanceof Error) {
    return redirect(withStatus(errorUrl, "validation"));
  }

  const subject = `New service request - ${payload.serviceType} - ${payload.name}`;
  const replyTo = payload.email || DEFAULT_TO_EMAIL;

  try {
    await sendMessage(env, {
      to: env.CONTACT_TO_EMAIL || DEFAULT_TO_EMAIL,
      from: env.CONTACT_FROM_EMAIL || env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL,
      subject,
      replyTo,
      html: buildHtmlEmail(payload),
      text: buildTextEmail(payload),
      attachment,
    });
  } catch (error) {
    console.error("Contact form delivery failed", error);
    return redirect(withStatus(errorUrl, "delivery"));
  }

  return redirect(successUrl);
};

function getString(formData: FormData, key: string, maxLength = 0): string {
  const raw = formData.get(key);
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  return maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function isInvalidPayload(payload: {
  name: string;
  phone: string;
  email: string;
  address: string;
  serviceType: string;
  message: string;
}): boolean {
  if (!payload.name || !payload.phone || !payload.address || !payload.message) {
    return true;
  }

  if (payload.phone.replace(/[^\d]/g, "").length < 7) {
    return true;
  }

  if (payload.email && !EMAIL_REGEX.test(payload.email)) {
    return true;
  }

  return false;
}

async function readAttachment(value: FormDataEntryValue | null): Promise<EmailAttachment | null | Error> {
  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  if (!ALLOWED_FILE_TYPES.has(value.type)) {
    return new Error("unsupported-file-type");
  }

  if (value.size > MAX_FILE_BYTES) {
    return new Error("file-too-large");
  }

  return {
    filename: value.name || "photo-upload",
    content: arrayBufferToBase64(await value.arrayBuffer()),
    contentType: value.type,
  };
}

async function sendMessage(
  env: Env,
  message: {
    to: string;
    from: string;
    subject: string;
    replyTo: string;
    html: string;
    text: string;
    attachment: EmailAttachment | null;
  },
): Promise<void> {
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

async function sendViaCloudflare(
  env: Env,
  message: {
    to: string;
    from: string;
    subject: string;
    replyTo: string;
    html: string;
    text: string;
    attachment: EmailAttachment | null;
  },
): Promise<void> {
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
    throw new Error(`Cloudflare Email Service failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { success?: boolean; errors?: Array<{ message?: string }> };
  if (!data.success) {
    throw new Error(
      data.errors?.map((item) => item.message).filter(Boolean).join("; ") ||
        "Cloudflare Email Service rejected the email",
    );
  }
}

async function sendViaResend(
  env: Env,
  message: {
    to: string;
    from: string;
    subject: string;
    replyTo: string;
    html: string;
    text: string;
    attachment: EmailAttachment | null;
  },
): Promise<void> {
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
    throw new Error(`Resend failed: ${response.status} ${await response.text()}`);
  }
}

function buildHtmlEmail(payload: {
  name: string;
  phone: string;
  email: string;
  address: string;
  serviceType: string;
  message: string;
}): string {
  const rows = [
    ["Name", payload.name],
    ["Phone", payload.phone],
    ["Email", payload.email || "Not provided"],
    ["Town / address", payload.address],
    ["Service type", payload.serviceType],
    ["Message", payload.message],
  ]
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
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">A homeowner submitted the S. Meredith Plumbing & Heating contact form.</p>
      <table style="width:100%;border-collapse:collapse;font-size:15px;line-height:1.5;">${rows}</table>
    </div>
  </body>
</html>`;
}

function buildTextEmail(payload: {
  name: string;
  phone: string;
  email: string;
  address: string;
  serviceType: string;
  message: string;
}): string {
  return [
    "New website service request",
    "",
    `Name: ${payload.name}`,
    `Phone: ${payload.phone}`,
    `Email: ${payload.email || "Not provided"}`,
    `Town / address: ${payload.address}`,
    `Service type: ${payload.serviceType}`,
    "",
    "Message:",
    payload.message,
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeRedirectUrl(value: FormDataEntryValue | null, fallback: URL): URL {
  if (typeof value === "string" && value.trim()) {
    try {
      return new URL(value, fallback);
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
  return Response.redirect(url.toString(), 303);
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
