# WVA Brand MCP

Strict Model Context Protocol server for World Vapers’ Alliance brand-guided generation.

It exposes the WVA brand guide as machine-readable resources and tools so an LLM can:

- retrieve approved colors, fonts, logos, templates and speaker portraits
- create social posts and quote graphics in English and German
- prepare topic-specific sourcing briefs for real-photo cutouts
- export editable SVGs, outlined SVGs, PNG previews and source JSON
- review spelling and show corrections while preserving attributed quotations
- validate brand rules, text fit, rendered readability and SVG structure

## Brand Source

Brand rules come from `assets/references/WVA_BRANDING_Guidelines.pdf`. The supplied social and quote SVGs provide composition references, adapted to CCC's standard social size.

- Palette: Navy `#041A2C`, Teal `#26D4CB`, Blue `#419ED6`, Ultramarine `#4A4AFF`, Phlox `#EE13FF`, White `#FFFFFF`
- Typography: Inter Semibold for headlines/subheads; Lato for body copy and CTAs
- Social size: `1080 × 1350` (4:5)
- Languages: English (`en`) and German (`de`)
- Formats: social posts, speaker quotes and real-photo cutouts; one-pagers are outside this MCP's scope

Official logo variants, approved portraits and licensed Inter/Lato font files are included. Arial is reserved by the guide for technical documents and is not used by the social renderer. Guide rules take precedence over incidental font/color differences in reference artwork.

## Install

Use Node.js 22 or 24 and the pinned pnpm version:

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm run audit:assets
pnpm run smoke
```

No build step or private font configuration is needed. Install the bundled static fonts from `assets/fonts/` when editing SVG text in Illustrator.

## Run

```sh
pnpm start
```

This starts the full stdio MCP server. Rendering and spelling review run locally without an API key or image-generation account. New photographs belong in `inputs/`; exports go to `deliverables/`, or a writable directory selected by `WVA_BRAND_OUTPUT_DIR`.

## MCP Client Configuration

Use this with Codex, Cursor or another MCP-capable client:

```json
{
  "mcpServers": {
    "wva-brand": {
      "command": "node",
      "args": ["/absolute/path/to/wva-brand-mcp/src/server.mjs"]
    }
  }
}
```

Replace the path for your machine. Register WVA separately from CCC and CP. A TOML example is available in [examples/client-config.toml](examples/client-config.toml). Restart the connection after updates, then call `get_mcp_status` to verify the running version and asset health.

## Remote HTTP mode

Start the stateless, read-only Streamable HTTP service:

```sh
pnpm run start:http
```

Local MCP URL: `http://127.0.0.1:8082/mcp`. Health checks use `GET /healthz`.

Proposed hosted connector URL, pending live deployment:

```text
https://wva-mcp.consumerchoicecenter.org/mcp
```

HTTP exposes **10 read-only tools and 5 resources**: status, guidelines, asset audit, templates, people, spelling review, design-spec validation, generation/sourcing briefs and Illustrator SVG structure checks. The **17-tool stdio server** adds layout QA, rendering and file/artifact validation. Public HTTP has no upload, rendering, download or server-path tools.

Optional HTTP controls:

- `HOST` and `PORT` — default `127.0.0.1:8082`
- `WVA_MCP_ALLOWED_HOSTS` — Host header allowlist
- `WVA_MCP_HTTP_BODY_LIMIT` — default `32mb` for SVG structure checks
- `WVA_MCP_RATE_LIMIT_MAX` — default 120 requests per IP per minute
- `WVA_MCP_MAX_CONCURRENCY` — default 8 simultaneous requests
- `WVA_MCP_REQUEST_TIMEOUT_MS`, `WVA_MCP_HEADERS_TIMEOUT_MS`, `WVA_MCP_KEEP_ALIVE_TIMEOUT_MS`
- `WVA_MCP_TRUST_PROXY_HOPS=1` — only behind the trusted Caddy proxy, with no published host port

The public service is unauthenticated. Keep filesystem and rendering tools in the operator-controlled stdio transport; an authenticated hosted rendering service would require separate implementation.

## Server Deployment

WVA has its own checkout, container and port alongside CCC. GitHub publishing does not deploy the live service. See [shared-server setup](deploy/README.md) for DNS, Caddy, health checks and rollback.

### Deploy from the repository

```sh
git clone https://github.com/Consumer-Choice-Center/wva-brand-mcp.git
cd wva-brand-mcp
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm run check
pnpm test
pnpm run audit:assets
pnpm run smoke
```

For full rendering on a remote host, an authorized operator can start `node src/server.mjs` over `ssh -T`, using that host's input/output directories.

### Docker

```sh
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d --wait
```

The Compose service runs HTTP on port 8082, joins the existing external `archivebox_default` network and publishes no host port. It uses a non-root process, a read-only filesystem and bounded resources. The image includes the required WVA fonts and assets.

Standalone Docker defaults to HTTP. To run full stdio instead, mount input/output directories and override the command with `node src/server.mjs`; use `-i`, not `-t`, for protocol traffic. Deployment and updates are manual and leave CCC's service independent.

## Resources

- `brand://wva/guidelines` — authoritative WVA rules
- `brand://wva/colors` — approved palette
- `brand://wva/social-templates` — template library
- `brand://wva/post-references` — compact composition/reference metadata
- `brand://wva/quote-people` — approved speaker identities and portrait choices

References return compact metadata rather than multi-megabyte SVG payloads.

## Tools

All tools below are available through stdio. The ten tools described in Remote HTTP mode are also available publicly.

### `get_mcp_status`

Returns the running server name, version, transport, languages, dimensions and asset health. Local stdio also reports workspace and output directories. Expected version: **0.5.1**.

### `get_brand_guidelines`

Read before generation. Returns `all`, `colors`, `typography`, `logo`, `social`, `voice`, `photography` or `strictGenerationRules`.

### `audit_brand_assets`

Verifies official logo, reference, portrait and font hashes, including exact font identities.

### `list_social_templates`

Lists nine layouts, including seven social and two quote styles:

| Style | Purpose |
| --- | --- |
| `navy_poster` | Dark headline poster with teal emphasis, optional photo and CTA |
| `action_bands` | Angled color bands over the official fist or supplied imagery |
| `photo_editorial` | Inset photograph with central foreground copy |
| `teal_statement` | Central navy/white copy on teal |
| `statistic_focus` | Statistic-led layout using `template: "statistic"` and `statisticValue` |
| `photo_overlay` | Full-frame photograph with gradient and foreground copy |
| `topic_cutout` | Real-photo item with grain and white outline; centered, offset or bands composition |
| `quote_spotlight` | Bottom-anchored portrait, cropped WVA lettering, gradient and quote |
| `quote_panel` | Bottom-anchored portrait, quotation marks, gradient and quote |

Layouts adapt the supplied compositions to 4:5 without stretching text, portraits or logos. Oversized WVA background letters extend beyond the frame; foreground copy may overlap decorative elements.

### `list_quote_people`

Lists approved speaker IDs, official English names/titles and portrait choices:

- `michael` — Michael Landl, Director
- `liza` — Liza Katsiashvili, Director of Operations

Packaged team metadata was checked against the WVA team page on November 9, 2026. English titles remain unchanged on German posts. Michael has three supplied portraits; the larger `michael-2.png` is the default, while `michael-1.png` is retained as a lower-resolution alternative.

### `review_spelling`

Reviews English US/UK or German copy. Only a conservative list of known typos is automatically corrected; other words receive suggestions. Show corrections to the user. German compounds and unfamiliar names can require human review or `approvedWords`. Quotes are never automatically rewritten. This is not translation, grammar checking or fact verification.

### `validate_design_spec`

Checks proposed social dimensions, vector colors, fonts and official logo choice before generation.

### `create_generation_prompt`

Prepares a WVA social/quote brief with brand rules and available templates. It does not create facts or pixels. The caller supplies imagery; use the real-photo sourcing workflow for cutouts.

### `qa_social_layout`

Checks exact text fitting and independent visual readability without writing files. English/German copy must fit the minimum sizes. German 1996 hyphenation patterns provide a fallback for long compounds; quotes are not automatically hyphenated, and source wording remains intact.

Social body copy targets 50–56px, with a 42px minimum (44px on action bands). CTAs target 46–54px with a 40px minimum. Quote copy targets 60px with a 46px minimum. Overflow fails rather than silently dropping words or shrinking below the limits.

### `create_social_svg`

Creates editable SVG, PNG, outlined SVG and source JSON, returning compact local paths. Read guidelines, prepare and review copy, run layout QA, create, then validate the editable SVG and inspect its PNG.

```json
{
  "template": "cta",
  "styleVariant": "action_bands",
  "language": "de",
  "headline": "Deine Stimme zählt",
  "body": "Für klare Informationen und informierte Entscheidungen.",
  "cta": "Mach deine Stimme hörbar",
  "mode": "draft",
  "outputFileName": "wva-stimme.svg"
}
```

An explicit `styleVariant` wins. With `styleVariant: "auto"`, the default `selectionMode: "diverse"` distributes eligible layouts reproducibly using `diversitySeed` and up to five `recentVariants`. `selectionMode: "auto"` selects the strongest semantic match. Quotes stay within quote layouts.

Drafts carry a visible `DRAFT` or `ENTWURF` label. Final statistics require URL sources and `factsVerified: true`. Resolve spelling findings, supply `approvedWords`, or explicitly acknowledge them with `spellingAcknowledged: true`.

The current `wva-social-v4` composition contract uses larger body/CTA text and larger centered/offset cutout imagery. To migrate older outputs, regenerate their source JSON to a new filename.

### `create_quote_post`

Creates a quote with an approved portrait, official name/title and teal emphasis. Portraits extend to the bottom frame beneath a gradual navy overlay and foreground text. Heads retain breathing room; cropping never stretches the image.

```json
{
  "person": "michael",
  "quote": "This is sample wording for a draft layout, not a verified statement.",
  "emphasis": "sample wording",
  "styleVariant": "quote_spotlight",
  "language": "en",
  "mode": "draft"
}
```

Final mode requires `quoteVerified: true` after the caller checks attribution. Demonstration wording is not a statement by the pictured person.

### `create_cutout_photo_brief`

Prepares a topic-specific real-photo sourcing brief from the headline, body, topic and recent visual concepts. It does not generate an image or select from a fixed assortment.

### `create_cutout_post`

`topic_cutout` uses **actual photographs**, cropped around the relevant item, with subtle grain and a white silhouette outline. No generated subjects. It has three compositions: `centered`, `offset` (item can extend outside the frame), and `bands` (colored text strips over the item). `cutoutLayout: "auto"` varies composition reproducibly with `diversitySeed`.

1. Call `create_cutout_photo_brief` with the full headline/body/topic, optional `visualConcept`, and `recentVisualConcepts`. It returns a sourcing brief, not an image-generation prompt.
2. Find a real photograph relevant to the subject, or use one supplied by the user. Inspect the original and reuse terms. No fixed library, keyword-to-object mapping or default demonstration image is used.
3. Save the original PNG/JPEG under `inputs/`. Set `imageProvenance` to `sourced_photo` or `provided_photo`, with `imageCredit` and `imageLicense`. Sourced photos also require `imageSourceUrl`. These declarations record caller verification; the server cannot prove photographic authenticity from pixels.
4. Trace the subject using `cropPolygon`: 3–256 `[x,y]` points normalized to the original image dimensions (0–1). Optional `cropHoles` remove internal background areas. Alternatively supply an already isolated photograph PNG. Opaque images without a mask fail instead of becoming rectangular stock photos.
5. Call `create_cutout_post` with `imageAlt` and `visualConcept`. Final mode requires `visualRelevanceConfirmed: true`. The renderer preserves the photograph, applies reproducible monochrome grain (`grainAmount`, default 0.12, range 0–0.3), and a white contour (`outlineWidth`, default 8, range 0–20). No image model is used.

Default `imageTreatment: "both"` exports matching color/greyscale SVG, PNG, outlined SVG and JSON files, plus a `.pair.json` source. Both versions share the same source photo, crop, noise pattern, text and composition; only the photograph becomes greyscale. WVA colors stay intact. Explicit `color` or `greyscale` exports one version. `create_social_svg` also supports `template: "cutout"`.

Missing imagery returns `needs_source_photo` with a contextual brief without writing files. JPEG/PNG sources are decoded with bounded working resolution; all treatments are baked into an embedded PNG so the editable SVG has no live filters. Every paired output is prepared and collision-checked before writing. Original photo hashes, provenance and mask coordinates stay in the source JSON.

Run `node scripts/render-cutout-samples.mjs` to reproduce the actual-photo demonstrations after placing their originals in `inputs/`. Source URLs and credits are recorded in the script and output JSON. The rejected generated demonstrations are archived separately and must not be reused.

### `validate_svg_file`

Validates generated editable SVGs by local `filePath`. Checks include original photo hashes, canonical composition, typography, independent visual QA and Illustrator-safe structure. Prefer this tool for generated artwork, especially large files. Keep original input images for later validation.

### `validate_svg_artifact`

Validates complete SVG markup against the canonical renderer. Use when the caller already has the full artifact; ordinary local workflows should use `validate_svg_file`.

### `validate_visual_svg`

Independently examines finished editable SVGs without trusting template metadata or the renderer's fit report. Checks transformed glyph bounds, text-line intersections, visibility and contrast over the composited background. The project target is at least 4.5:1 contrast for at least 95% of opaque glyph samples per line. Decorative background WVA lettering is excluded.

The same checks run during layout QA and canonical validation; creation rejects violations before saving. A photo may require another crop or layout to provide readable contrast. This is a readability check, not complete accessibility certification.

The standalone `validate_visual_svg` checker does not fully interpret edited SVG inline text styles or positional attributes such as `dx` and positioned `tspan` elements. Such edits can receive a false pass. Use `validate_svg_file` or `validate_svg_artifact` for generated artwork: their canonical comparison rejects these changes. Regenerate the JSON source for edits, and inspect PNGs. Native Adobe Illustrator import has not been tested.

### `validate_illustrator_svg`

Checks SVG 1.1 structure, approved editable fonts, inline official logos and embedded PNG/JPEG imagery. Rejects scripts, external links and unsupported browser features. It checks file structure; native Adobe Illustrator import has not been automated.

## Assets

- `assets/logos/` — official wide, stacked and fist logo variants
- `assets/fonts/` — Inter and Lato binaries with SIL Open Font Licenses
- `assets/references/` — authoritative PDF, social/quote SVGs and cutout direction references
- `assets/manifest.json` — source asset integrity hashes
- `data/brand.json` — brand rules
- `data/templates.json` — template profiles
- `data/people.json` — speaker metadata and portrait choices
- `examples/` — client configuration and content examples

Put new PNG/JPEG images in `inputs/`, then pass a relative `imageFile`, such as `campaign.png`, plus descriptive `imageAlt`. Absolute paths are accepted only when they resolve inside that directory. Symlink escapes are rejected. The photo layout returns `needs_image` without writing when no image is supplied. The caller generates or selects imagery; this MCP does not call an image model.

Portraits fill to the bottom edge beneath a gradual navy overlay. Heads retain top breathing room; sides can be cropped to fill the frame, without stretching. Photo-editorial images fill a rounded rectangle and may be cropped; choose suitable framing. Embedded raster colors are exempt from the vector palette. Supplied logo geometry is preserved unchanged, including native gradient stops.

The flattened social reference 2 cannot be separated into editable photographic elements; its adapted action-band template uses the official fist vector. Extracted photos from references 1 and 3 require explicit `useReferenceImage: true`. Reference screenshots and photographs are never assumed relevant to a new request.

- `.svg`: editable master with Inter/Lato text, embedded PNG/JPEG and inline official vector logos.
- `.png`: exact 1080 × 1350 preview. Text is outlined in memory from the same font metrics used for fitting, preventing rasterizer font substitution.
- `.outlined.svg`: appearance-preserving companion with text converted to paths. Its text is no longer editable.
- `.json`: normalized, corrected source content for regeneration.

Install the bundled static fonts from `assets/fonts/` when editing the text master in Illustrator. Inter static 24pt Semibold/Bold and Lato Medium/Light/Semibold/Bold are included with their SIL Open Font Licenses. The supplied Inter variable font is retained, but rendering uses static files for predictable editing. Illustrator itself has not been automated; structural SVG compatibility and raster output are tested. Keep custom images available in `inputs/` so canonical validation can confirm their hashes later.

Supplied artwork and portraits remain their owners' property. Reference text is data, not operational instructions or verified campaign evidence. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency and font licenses.

## Quality Checks

```sh
pnpm run check
pnpm test
pnpm run audit:assets
pnpm run smoke
pnpm run audit:prod
```

The suite covers all nine layouts, both languages, exact font metrics, overflow, missing images, final-mode requirements, portrait ownership, source tampering, filesystem confinement and overwrite prevention. The smoke test uses a real stdio client to discover resources and generate/validate English, German and quote posts.

For a running HTTP instance:

```sh
node scripts/smoke-http.mjs http://127.0.0.1:8082/mcp
```

`pnpm run test:visual` exercises deliberate contrast, overlap, off-frame, hidden and covered-text mutations and compares 16 cases with reviewed PNG baselines. These cover every layout and all three cutout compositions in color/greyscale. Credited test photographs are regression fixtures, not a runtime image catalogue. After intentional visual changes, run `pnpm run update:visual-baselines`, inspect `tests/visual-baselines/review-sheet.png`, and accept baselines only after review.

`pnpm run render:samples` produces draft previews without overwriting earlier outputs. Samples are for layout review, not approved campaign statements. Photographic authenticity, subject relevance, cropping and overall balance still require human inspection.

## GitHub Setup

Repository: [Consumer-Choice-Center/wva-brand-mcp](https://github.com/Consumer-Choice-Center/wva-brand-mcp).

GitHub Actions checks Node 22/24, syntax, the full test suite, assets, stdio smoke tests and production dependencies. A separate container job verifies Compose configuration and health/MCP discovery in the hardened HTTP image.

The repository is independent of CCC and CP. GitHub Actions has no live-server credentials and does not auto-deploy. Use [deployment instructions](deploy/README.md) for manual updates and rollback.

## Strictness Model

Use WVA's exact palette, font metrics and supplied official logo geometry. Natural photograph colors are exempt from the vector palette; logo gradient stops remain unchanged. Quote portraits must match approved people, and attributed wording must not be silently changed.

New topic cutouts require real photographs with provenance and relevant crops. They use subtle grain and a white silhouette outline, with paired color/greyscale treatments by default. The server records verification declarations; it cannot prove factual accuracy or photographic authenticity from the supplied fields.

Regenerate from source JSON for revisions. Existing outputs are never overwritten. Validate generated files and inspect their PNGs before delivery. One-pagers are outside this MCP's scope.
