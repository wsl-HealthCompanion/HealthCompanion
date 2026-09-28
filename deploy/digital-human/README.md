# Isolated digital-human deployment

This deployment keeps user control and media authorization in NestJS. The
browser never calls LiveTalking directly and never chooses a user, avatar,
stream key, RTMP URL, or UDP audio port.

## Mandatory network boundary

- Expose dynamic `/live/dh_*.flv` only through the Nginx `auth_request` block.
- Use the sample's longest-prefix `location ^~ /live/dh_`; do not convert it
  to a regular-expression location. Before reload, inspect the complete
  server block and remove any exact or longer `/live/dh_` location that could
  override it. A generic `location ^~ /live/` is safe only when this more
  specific location is present in the same server block.
- Keep SRS HTTP-FLV ports (commonly 8080/8180) private to the host/network.
- Keep RTMP publish port 1935 private to LiveTalking/SRS publishers as needed.
- Never expose LiveTalking `/api/internal/` or `/api/admin/`; the public
  `/dh/` proxy must return 404 for both prefixes.
- Do not deploy the H5 before these rules are active. Otherwise a guessed raw
  SRS URL could bypass NestJS media authorization.

Run `verify-isolation.sh` after merging the configuration. It exits non-zero
unless `nginx -t` succeeds, backend health is 200, an unauthenticated dynamic
FLV is denied with 401/403/404, and the public internal-control path is 404.

The example does not alter SRS GOP, queue, cache, or latency parameters.
Staging uses HTTP and therefore `DIGITAL_HUMAN_COOKIE_SECURE=false`. Set it to
`true` when the public site is switched to HTTPS.
