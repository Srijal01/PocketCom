import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { Server } from "socket.io";
import { z } from "zod";
import { createPairingCode, consumePairingCode, newDeviceId } from "./pairing.js";
import { issueToken, verifyToken } from "./auth.js";
import { getIceServers } from "./turn.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" });
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
const io = new Server(app.server, { cors: { origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" } });
const devices = new Map<string, { ownerId: string; name: string; revokedAt?: string }>();
const sessions = new Map<string, { ownerId: string; deviceId: string; sockets: Set<string>; expiresAt: number }>();
const deviceSockets = new Map<string, Set<string>>();

const credentials = z.object({ username: z.string().min(1).max(128), password: z.string().min(8).max(256) });
app.get("/health", async () => ({ status: "ok", service: "pocketcam-signaling" }));
app.post("/auth/login", async (request, reply) => {
  const input = credentials.safeParse(request.body);
  if (!input.success) return reply.code(400).send({ error: "Invalid credentials format" });
  // The first implementation uses an explicitly configured demo account. Replace with a user store before production.
  if (input.data.username !== (process.env.DEMO_USERNAME ?? "owner") || input.data.password !== (process.env.DEMO_PASSWORD ?? "change-me-now")) {
    return reply.code(401).send({ error: "Invalid credentials" });
  }
  return { token: await issueToken(input.data.username, "dashboard") };
});

async function dashboard(request: { headers: { authorization?: string } }) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Authentication required");
  const identity = await verifyToken(token);
  if (identity.role !== "dashboard") throw new Error("Dashboard access required");
  return identity;
}

app.post("/pairing-codes", async (request, reply) => {
  try { const identity = await dashboard(request); return createPairingCode(identity.subject); }
  catch { return reply.code(401).send({ error: "Authentication required" }); }
});
app.get("/devices", async (request, reply) => {
  try {
    const identity = await dashboard(request);
    return [...devices.entries()].filter(([, device]) => device.ownerId === identity.subject && !device.revokedAt)
      .map(([id, device]) => ({ id, name: device.name, platform: "android" as const }));
  } catch { return reply.code(401).send({ error: "Authentication required" }); }
});
app.post("/devices/pair", async (request, reply) => {
  const body = z.object({ code: z.string().regex(/^\d{6}$/), name: z.string().min(1).max(80) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Invalid pairing request" });
  const ownerId = consumePairingCode(body.data.code);
  if (!ownerId) return reply.code(401).send({ error: "Pairing code is invalid or expired" });
  const deviceId = newDeviceId();
  devices.set(deviceId, { ownerId, name: body.data.name });
  return { deviceId, paired: true, token: await issueToken(deviceId, "android") };
});
app.delete("/devices/:deviceId", async (request, reply) => {
  try {
    const identity = await dashboard(request);
    const device = devices.get((request.params as { deviceId: string }).deviceId);
    if (!device || device.ownerId !== identity.subject) return reply.code(404).send({ error: "Device not found" });
    device.revokedAt = new Date().toISOString();
    return { revoked: true };
  } catch { return reply.code(401).send({ error: "Authentication required" }); }
});
app.get("/turn-credentials", async (request, reply) => {
  try {
    await dashboard(request);
    return { iceServers: getIceServers() };
  } catch { return reply.code(401).send({ error: "Authentication required" }); }
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    socket.data.identity = await verifyToken(String(token));
    next();
  } catch { next(new Error("Authentication required")); }
});
io.on("connection", socket => {
  const connectedIdentity = socket.data.identity as { subject: string; role: "dashboard" | "android" };
  if (connectedIdentity.role === "android") {
    deviceSockets.set(connectedIdentity.subject, new Set([
      ...(deviceSockets.get(connectedIdentity.subject) ?? []),
      socket.id,
    ]));
    for (const [sessionId, session] of sessions) {
      if (session.deviceId === connectedIdentity.subject && session.expiresAt > Date.now()) {
        socket.emit("session:invite", {
          sessionId,
          iceServers: getIceServers(),
        });
      }
    }
  }
  socket.on("session:join", (payload: unknown, callback?: (value: unknown) => void) => {
    const input = z.object({ sessionId: z.string().uuid() }).safeParse(payload);
    if (!input.success) return callback?.({ error: "Invalid session request" });
    const parsed = input.data;
    const session = sessions.get(parsed.sessionId);
    if (!session || session.expiresAt <= Date.now()) return callback?.({ error: "Session expired" });
    const identity = socket.data.identity as { subject: string; role: "dashboard" | "android" };
    const authorized = identity.role === "dashboard"
      ? session.ownerId === identity.subject
      : session.deviceId === identity.subject && devices.get(identity.subject)?.ownerId === session.ownerId;
    if (!authorized || devices.get(session.deviceId)?.revokedAt) return callback?.({ error: "Not authorized" });
    session.sockets.add(socket.id);
    if (identity.role === "android") deviceSockets.set(identity.subject, new Set([...(deviceSockets.get(identity.subject) ?? []), socket.id]));
    socket.join(parsed.sessionId);
    socket.to(parsed.sessionId).emit("session:peer-joined");
    callback?.({ ok: true });
  });
  socket.on("session:create", (payload: unknown, callback?: (value: unknown) => void) => {
    const input = z.object({ deviceId: z.string().uuid() }).safeParse(payload);
    if (!input.success || socket.data.identity.role !== "dashboard") return callback?.({ error: "Invalid session request" });
    const parsed = input.data;
    const sessionId = newDeviceId();
    const device = devices.get(parsed.deviceId);
    if (!device || device.ownerId !== socket.data.identity.subject || device.revokedAt) return callback?.({ error: "Device not found" });
    sessions.set(sessionId, { ownerId: socket.data.identity.subject, deviceId: parsed.deviceId, sockets: new Set([socket.id]), expiresAt: Date.now() + 10 * 60_000 });
    socket.join(sessionId);
    for (const deviceSocket of deviceSockets.get(parsed.deviceId) ?? []) io.to(deviceSocket).emit("session:invite", { sessionId, iceServers: getIceServers() });
    callback?.({ sessionId, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), iceServers: getIceServers() });
  });
  for (const event of ["session:offer", "session:answer", "session:ice", "session:state"]) {
    socket.on(event, (payload: unknown, callback?: (value: unknown) => void) => {
      const input = z.object({ sessionId: z.string().uuid(), payload: z.record(z.string(), z.unknown()) }).safeParse(payload);
      if (!input.success) return callback?.({ error: "Invalid signaling payload" });
      const parsed = input.data;
      const session = sessions.get(parsed.sessionId);
      if (!session || session.expiresAt <= Date.now()) return callback?.({ error: "Session expired" });
      const identity = socket.data.identity as { subject: string; role: "dashboard" | "android" };
      if ((identity.role === "dashboard" && session.ownerId !== identity.subject) || (identity.role === "android" && session.deviceId !== identity.subject)) {
        return callback?.({ error: "Not authorized" });
      }
      session.sockets.add(socket.id);
      socket.join(parsed.sessionId);
      socket.to(parsed.sessionId).emit(event, parsed.payload);
      callback?.({ ok: true });
    });
  }
  socket.on("disconnect", () => {
    for (const session of sessions.values()) session.sockets.delete(socket.id);
    const identity = socket.data.identity as { subject: string; role: "dashboard" | "android" };
    if (identity.role === "android") deviceSockets.get(identity.subject)?.delete(socket.id);
  });
});

setInterval(() => { for (const [id, session] of sessions) if (session.expiresAt <= Date.now()) sessions.delete(id); }, 30_000).unref();
const port = Number(process.env.PORT ?? 8080);
if (process.env.NODE_ENV !== "test") {
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info({ port }, "PocketCam signaling server started");
}
export { app, sessions };
