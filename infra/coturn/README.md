# Coturn deployment

Set `TURN_EXTERNAL_IP` to the public IPv4 address of the TURN host and set
`TURN_SECRET` to the same value used by the signaling service. Open the TURN
ports shown in `docker-compose.yml` in the cloud firewall/security group.

Use a DNS name such as `turn.example.com` and configure:

```text
TURN_URLS=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp
```

For production, also provision a trusted certificate and advertise
`turns:turn.example.com:5349?transport=tcp`.
