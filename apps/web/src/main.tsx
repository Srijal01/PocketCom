import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, Socket } from "socket.io-client";
import "./style.css";

type Device = { id: string; name: string; platform: "android" };
const api = import.meta.env.VITE_SIGNALING_URL ?? "http://localhost:8080";

function App() {
  const video = useRef<HTMLVideoElement>(null);
  const peer = useRef<RTCPeerConnection | undefined>(undefined);
  const socket = useRef<Socket | undefined>(undefined);
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("owner");
  const [password, setPassword] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [status, setStatus] = useState("offline");
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState("Sign in, pair an Android device, and connect.");

  async function login(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch(`${api}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
    const body = await response.json() as { token?: string; error?: string };
    if (!response.ok || !body.token) return setMessage(body.error ?? "Sign-in failed.");
    setToken(body.token); setMessage("Signed in. Generate a pairing code or select a device.");
    const list = await fetch(`${api}/devices`, { headers: { authorization: `Bearer ${body.token}` } });
    setDevices(await list.json() as Device[]);
  }
  async function generateCode() {
    const response = await fetch(`${api}/pairing-codes`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    const body = await response.json() as { code?: string; error?: string };
    if (!response.ok) return setMessage(body.error ?? "Could not generate code.");
    setPairingCode(body.code ?? ""); setMessage("Enter this short-lived code in the Android app."); 
  }
  async function connect() {
    if (!token || !deviceId) return setMessage("Sign in and select a paired device first.");
    setStatus("connecting"); const currentSocket = io(api, { auth: { token } }); socket.current = currentSocket;
    currentSocket.on("connect_error", error => { setStatus("disconnected"); setMessage(error.message); });
    currentSocket.on("session:answer", async payload => { await peer.current?.setRemoteDescription(payload as RTCSessionDescriptionInit); });
    currentSocket.on("session:ice", async payload => { await peer.current?.addIceCandidate(payload as RTCIceCandidateInit); });
    currentSocket.emit("session:create", { deviceId }, async (result: { sessionId?: string; iceServers?: RTCIceServer[]; error?: string }) => {
      if (!result.sessionId) return setMessage(result.error ?? "Could not create session.");
      peer.current = new RTCPeerConnection({ iceServers: result.iceServers });
      peer.current.ontrack = event => { if (video.current) video.current.srcObject = event.streams[0]; };
      peer.current.onconnectionstatechange = () => setStatus(peer.current?.connectionState === "connected" ? "connected" : peer.current?.connectionState ?? "connecting");
      peer.current.onicecandidate = event => { if (event.candidate) socket.current?.emit("session:ice", { sessionId: result.sessionId, payload: event.candidate.toJSON() }); };
      const makeOffer = async () => { const offer = await peer.current?.createOffer({ offerToReceiveVideo: true }); if (offer && peer.current) { await peer.current.setLocalDescription(offer); currentSocket.emit("session:offer", { sessionId: result.sessionId, payload: offer }); } };
      currentSocket.on("session:peer-joined", makeOffer);
      currentSocket.emit("session:join", { sessionId: result.sessionId }, async (joined: { error?: string }) => {
        if (joined.error) return setMessage(joined.error);
      });
    });
  }
  function disconnect() { peer.current?.close(); socket.current?.disconnect(); if (video.current) video.current.srcObject = null; setStatus("offline"); }
  function snapshot() {
    if (!video.current?.videoWidth) return setMessage("No live video is available.");
    const canvas = document.createElement("canvas"); canvas.width = video.current.videoWidth; canvas.height = video.current.videoHeight;
    canvas.getContext("2d")?.drawImage(video.current, 0, 0); const link = document.createElement("a"); link.download = `pocketcam-${Date.now()}.png`; link.href = canvas.toDataURL("image/png"); link.click();
  }
  function toggleRecording() {
    if (recording) { recorder.current?.stop(); setRecording(false); return; }
    if (!video.current?.srcObject || !("MediaRecorder" in window)) return setMessage("Recording is unavailable until a supported live stream is connected.");
    const chunks: BlobPart[] = []; const current = new MediaRecorder(video.current.srcObject as MediaStream); recorder.current = current;
    current.ondataavailable = event => chunks.push(event.data); current.onstop = () => { const link = document.createElement("a"); link.download = `pocketcam-${Date.now()}.webm`; link.href = URL.createObjectURL(new Blob(chunks, { type: current.mimeType })); link.click(); };
    current.start(); setRecording(true);
  }
  useEffect(() => () => disconnect(), []);
  return <main><header><div><span className="eyebrow">POCKETCAM</span><h1>Remote camera monitor</h1></div><span className={`status ${status}`}>{status}</span></header>
    <section className="layout"><article className="panel preview"><div className="panel-title"><h2>Live preview</h2>{recording && <span className="recording">● Recording</span>}</div><div className="video-wrap"><video ref={video} autoPlay playsInline muted /><div className="empty">{message}</div></div><div className="controls"><button onClick={status === "offline" || status === "disconnected" ? connect : disconnect}>{status === "connected" ? "Disconnect" : "Connect"}</button><button onClick={snapshot}>Snapshot</button><button onClick={toggleRecording}>{recording ? "Stop recording" : "Record video"}</button></div></article>
      <aside className="panel"><h2>Account</h2><form onSubmit={login} className="form"><input value={username} onChange={event => setUsername(event.target.value)} placeholder="Username" /><input value={password} onChange={event => setPassword(event.target.value)} placeholder="Password" type="password" /><button type="submit">Sign in</button></form><hr /><h2>Device</h2><select value={deviceId} onChange={event => setDeviceId(event.target.value)}><option value="">Select paired device</option>{devices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select><button className="secondary" onClick={generateCode} disabled={!token}>Generate pairing code</button>{pairingCode && <strong className="pair-code">{pairingCode}</strong>}<hr /><dl><dt>Connection</dt><dd>{status}</dd><dt>Resolution</dt><dd>{video.current?.videoWidth ? `${video.current.videoWidth}×${video.current.videoHeight}` : "—"}</dd></dl></aside></section></main>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
