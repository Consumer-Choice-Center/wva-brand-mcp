# WVA HTTP alongside CCC

Repository: `Consumer-Choice-Center/wva-brand-mcp`. This is an independent checkout, Compose project and container. It does not modify or restart CCC.

| Service | Checkout | Docker upstream | HTTPS connector |
| --- | --- | --- | --- |
| Existing CCC | `/home/archive/ccc-brand-mcp` | `ccc-brand-mcp:8080` | `https://mcp.consumerchoicecenter.org/mcp` |
| WVA | `/home/archive/wva-brand-mcp` | `wva-brand-mcp:8082` | Proposed: `https://wva-mcp.consumerchoicecenter.org/mcp` |

Both services join the existing external `archivebox_default` network used by Caddy. Neither publishes a host port. Keep CCC's Compose project and Caddy site unchanged. The proposed WVA hostname is configuration, not a claim that DNS or the live endpoint has been deployed.

## Tool availability

Like CCC, public WVA HTTP is stateless and read-only. It exposes guidelines, assets audit, templates, people, spelling review, design-spec validation, generation/sourcing briefs, and Illustrator SVG structure checks: 10 tools and five resources. It has no upload, server-path, generation or download tools. Local stdio has the full 17-tool surface and renders PNG/SVG files. For full rendering on the server, an authorized operator can use stdio through SSH with their own input/output directories. An authenticated, isolated hosted rendering/download service would be a separate implementation.

## Bootstrap

1. On the CCC server, clone the separate repository using an account or deploy key with read access:

   ```sh
   cd /home/archive
   git clone https://github.com/Consumer-Choice-Center/wva-brand-mcp.git
   cd wva-brand-mcp
   docker network inspect archivebox_default
   docker compose -f deploy/docker-compose.yml config --quiet
   docker compose -f deploy/docker-compose.yml build
   docker compose -f deploy/docker-compose.yml up -d --wait
   ```

2. Add a DNS record for `wva-mcp.consumerchoicecenter.org` pointing to the same server as CCC. To use a different hostname, create `deploy/.env` from `.env.example`, change the WVA Caddy site to match, and supply `--env-file deploy/.env` to every Compose command.
3. Back up `/home/archive/archivebox/Caddyfile`. Append only the site in `deploy/Caddyfile.wva`; do not replace the file. In the existing Caddy deployment, identify its service with `docker compose ps`, validate the merged config, then reload it. For the service named `caddy`:

   ```sh
   cd /home/archive/archivebox
   docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   ```

4. Verify both services after the reload:

   ```sh
   docker inspect --format '{{.State.Health.Status}}' wva-brand-mcp
   curl --fail --silent --show-error https://wva-mcp.consumerchoicecenter.org/healthz
   curl --fail --silent --show-error https://mcp.consumerchoicecenter.org/healthz
   ```

   Then, from a checkout with Node and dependencies installed, verify real MCP discovery:

   ```sh
   node scripts/smoke-http.mjs https://wva-mcp.consumerchoicecenter.org/mcp
   ```

The health endpoint identifies WVA explicitly. Register the new WVA connector separately from CCC.

## Updates and rollback

GitHub Actions checks the repository and container, but does not access the live server or auto-deploy. In the WVA checkout only:

```sh
docker tag wva-brand-mcp:local wva-brand-mcp:previous
git pull --ff-only
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d --wait
```

Retain the previous commit SHA as well as the image. Roll back WVA without touching CCC:

```sh
WVA_BRAND_MCP_IMAGE=wva-brand-mcp:previous docker compose -f deploy/docker-compose.yml up -d --no-build --wait
```

The image runs as `node`, with a read-only filesystem, bounded CPU/memory/process count, rotating logs and no credentials or runtime inputs baked in. Caddy is the single trusted proxy hop; do not publish port 8082 to the host while proxy-header trust is enabled. Default local HTTP binds to loopback without proxy-header trust.
