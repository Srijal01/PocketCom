import { SignJWT, jwtVerify } from "jose";

const configuredSecret = process.env.JWT_SECRET;
if (process.env.NODE_ENV === "production" && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error("JWT_SECRET must be at least 32 characters in production");
}
const secret = new TextEncoder().encode(configuredSecret ?? "development-only-change-me");

export async function issueToken(subject: string, role: "dashboard" | "android"): Promise<string> {
  return new SignJWT({ role }).setProtectedHeader({ alg: "HS256" }).setSubject(subject).setIssuedAt().setExpirationTime("2h").sign(secret);
}

export async function verifyToken(token: string): Promise<{ subject: string; role: "dashboard" | "android" }> {
  const result = await jwtVerify(token, secret);
  const role = result.payload.role;
  if (typeof result.payload.sub !== "string" || (role !== "dashboard" && role !== "android")) throw new Error("Invalid token");
  return { subject: result.payload.sub, role };
}

export function isConfiguredSecret(value: string | undefined): value is string {
  return Boolean(value && value.length >= 32);
}
