import { createHmac } from "node:crypto";
import type { IceServer } from "@pocketcam/shared-types";

export function getIceServers(): IceServer[] {
  const urls = (process.env.TURN_URLS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  const secret = process.env.TURN_SECRET;
  if (!urls.length || !secret) {
    return [{ urls: ["stun:stun.l.google.com:19302"] }];
  }
  const expiresAt = Math.floor(Date.now() / 1000) + Number(process.env.TURN_USERNAME_TTL_SECONDS ?? 3600);
  const username = `${expiresAt}:pocketcam`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return [{ urls, username, credential }];
}
