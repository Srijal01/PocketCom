import { randomInt, randomUUID } from "node:crypto";

interface PairingCode { code: string; ownerId: string; expiresAt: number; used: boolean; }
const codes = new Map<string, PairingCode>();
const ttl = () => Number(process.env.PAIRING_CODE_TTL_SECONDS ?? 300) * 1000;

export function createPairingCode(ownerId: string) {
  const code = randomInt(100000, 999999).toString();
  codes.set(code, { code, ownerId, expiresAt: Date.now() + ttl(), used: false });
  return { code, expiresAt: new Date(Date.now() + ttl()).toISOString() };
}

export function consumePairingCode(code: string) {
  const record = codes.get(code);
  if (!record || record.used || record.expiresAt <= Date.now()) return undefined;
  record.used = true;
  return record.ownerId;
}

export function newDeviceId() { return randomUUID(); }
