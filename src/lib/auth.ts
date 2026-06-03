const SESSION_COOKIE = "crm_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

type AdminUser = {
  login: string;
  label: string;
};

type SessionPayload = AdminUser & {
  exp: number;
};

function getEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function getConfiguredAdmins(): AdminUser[] {
  return [
    { login: getEnv("CRM_ADMIN_1_LOGIN"), label: "Admin 1" },
    { login: getEnv("CRM_ADMIN_2_LOGIN"), label: "Admin 2" },
  ].filter((admin) => admin.login.length > 0);
}

export function hasConfiguredAdmins(): boolean {
  return getConfiguredAdmins().length > 0;
}

function getAdminPassword(index: 1 | 2): string {
  return getEnv(`CRM_ADMIN_${index}_PASSWORD`);
}

function getSessionSecret(): string {
  const explicitSecret = getEnv("CRM_AUTH_SECRET");
  if (explicitSecret) return explicitSecret;

  return [
    getEnv("CRM_ADMIN_1_LOGIN"),
    getAdminPassword(1),
    getEnv("CRM_ADMIN_2_LOGIN"),
    getAdminPassword(2),
  ].join(":");
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};

  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const separatorIndex = cookie.indexOf("=");
        if (separatorIndex === -1) return [cookie, ""];

        return [
          cookie.slice(0, separatorIndex),
          decodeURIComponent(cookie.slice(separatorIndex + 1)),
        ];
      }),
  );
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlEncodeText(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlDecodeText(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

async function sign(payload: string): Promise<string> {
  const secret = getSessionSecret();
  if (!secret) throw new Error("CRM admin credentials are not configured");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));

  return base64UrlEncodeBytes(new Uint8Array(signature));
}

async function verifySignedValue(value: string): Promise<SessionPayload | null> {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expectedSignature = await sign(payload);
  if (signature !== expectedSignature) return null;

  try {
    const parsed = JSON.parse(base64UrlDecodeText(payload)) as SessionPayload;
    if (!parsed.login || !parsed.exp || parsed.exp <= Date.now()) return null;

    return parsed;
  } catch {
    return null;
  }
}

export async function createSessionCookie(admin: AdminUser, request: Request): Promise<string> {
  const payload: SessionPayload = {
    login: admin.login,
    label: admin.label,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };
  const encodedPayload = base64UrlEncodeText(JSON.stringify(payload));
  const encodedSignature = await sign(encodedPayload);
  const isSecure =
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";

  return [
    `${SESSION_COOKIE}=${encodeURIComponent(`${encodedPayload}.${encodedSignature}`)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    isSecure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function createLogoutCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function getCurrentAdmin(request: Request): Promise<AdminUser | null> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const session = cookies[SESSION_COOKIE];
  if (!session) return null;

  const payload = await verifySignedValue(session);
  if (!payload) return null;

  const admin = getConfiguredAdmins().find((item) => item.login === payload.login);
  if (!admin) return null;

  return admin;
}

export function verifyAdminCredentials(login: string, password: string): AdminUser | null {
  const normalizedLogin = login.trim();
  const admins = getConfiguredAdmins();

  if (admins[0]?.login === normalizedLogin && getAdminPassword(1) === password) {
    return admins[0];
  }

  if (admins[1]?.login === normalizedLogin && getAdminPassword(2) === password) {
    return admins[1];
  }

  return null;
}
