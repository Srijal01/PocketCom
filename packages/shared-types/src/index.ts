export type Role = "dashboard" | "android";
export type ConnectionState = "offline" | "connecting" | "connected" | "reconnecting" | "disconnected";

export interface Device {
  id: string;
  name: string;
  platform: "android";
  pairedAt: string;
  revokedAt?: string;
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface Session {
  id: string;
  deviceId: string;
  createdAt: string;
  expiresAt: string;
}

export interface SignalingEnvelope {
  sessionId: string;
  payload: Record<string, unknown>;
}

export const protocolEvents = [
  "session:offer",
  "session:answer",
  "session:ice",
  "session:state",
  "session:error",
] as const;
