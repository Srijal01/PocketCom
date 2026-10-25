# Security checklist and known limitations

- Use HTTPS/WSS only in deployment.
- Replace the development login with a real user store and password hashing.
- Set a random `JWT_SECRET`; never commit it.
- Persist device ownership, pairing consumption, revocation, and session records.
- Issue TURN credentials server-side with a short expiry; never ship the TURN secret to clients.
- Keep pairing codes single-use and short-lived.
- Add CSRF protection if cookie authentication is introduced.
- Restrict Socket.IO origins to the exact dashboard origin.
- Do not log tokens, pairing codes, SDP, ICE credentials, or media.
- Require explicit Android camera permission and Start Streaming action.
- Keep a visible Android foreground notification during background streaming.
- Revoke devices and expire sessions.

The initial foundation uses in-memory device/session state and a development login. It is not production-ready until those limitations are replaced.

For internet deployment, use a real domain with HTTPS/WSS, restrict CORS to the
dashboard domain, keep the TURN shared secret only on the signaling server and
Coturn host, and configure cloud firewall rules to expose only the documented
ports. Do not expose the development credentials.
