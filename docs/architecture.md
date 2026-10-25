# Architecture

WebRTC carries media directly between the Android phone and browser, with TURN fallback. The Node service authenticates users, issues short-lived pairing codes, authorizes sessions, and relays offer/answer/ICE messages through WSS. It does not receive camera media.

The Android client will use CameraX and a foreground service. The browser uses `RTCPeerConnection`, `MediaRecorder`, and Canvas. Server state is intentionally small and can move from in-memory development storage to PostgreSQL for production.
