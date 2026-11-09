# WVA Brand MCP

Local MCP server for **World Vapers’ Alliance social and quote posts**, version **0.5.1**. Every output is **1080 × 1350 (4:5)**, matching CCC’s standard social size. WVA keeps its own guide, official logos, typography, palette, portraits and reference layouts. English and German are supported. One-pagers are intentionally excluded.

## Start locally

Requires Node.js 22 or 24 and pnpm 11. This is a standalone package; it does not import CCC or CP code at runtime.

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm test
pnpm run audit:assets
pnpm run smoke
pnpm start
```

`start` uses stdio. Do not launch it as a public web service. No API key, image-generation account or network access is required at runtime. Rendering and spelling review run locally.

Add the snippet from `examples/client-config.toml` to your MCP client's configuration with real absolute paths. `examples/client-config.json` covers clients using `mcpServers`. The parent CCC project configuration is the intended local registration location. Restart the client or open a new chat after configuration changes, then call `get_mcp_status` and verify `wva-brand-mcp`, version `0.5.1`, with a passing asset audit.

## Templates

| Style | Source | Behavior |
| --- | --- | --- |
| `navy_poster` | Social reference 1 | Dark headline poster with teal emphasis, optional photo, CTA and official logo |
| `action_bands` | Social reference 2 | Angled color bands over the official fist, or a supplied image |
| `photo_editorial` | Social reference 3 | Inset photograph with a central white copy overlay |
| `quote_spotlight` | Quote reference 1 | Bottom-anchored portrait, cropped oversized WVA lettering, gradient and foreground quote |
| `quote_panel` | Quote reference 2 | Bottom-anchored portrait with the original large quotation marks, gradient and foreground quote |

These are guide-compliant adaptations, not pixel-exact copies. Original canvases were approximately 3:4; these templates reflow to the requested 4:5 ratio without stretching logos, letters or portraits. Text outlined in the references is reconstructed as editable text. The guide overrides incidental reference colors and fonts. In particular, Inter Semibold handles headlines/subheads and Lato handles body/CTA text; Arial is reserved by the guide for technical applications and is not bundled or used here.

Social reference 2 is a flattened raster wrapped in SVG. Its original pointing-hand photograph and copy cannot be separately edited. The reusable action-band template uses the official fist vector instead; the complete original reference is retained unchanged. References 1 and 3 contain extracted photographs that are available only with explicit `useReferenceImage: true`. Never assume a demonstration photo is relevant to a new topic. Packaged examples opt into reference imagery only to demonstrate the supplied composition.

`styleVariant: "auto"` uses deterministic weighted selection among semantically eligible layouts. `selectionMode: "auto"` chooses the strongest semantic match; the default `"diverse"` distributes eligible layouts reproducibly using `diversitySeed` and up to five `recentVariants` (oldest first). Quote layouts remain restricted to quotes, and photo posts route between the two photo layouts.

Three additional variations extend the same palette, typography and imagery: `teal_statement` (central navy/white copy on teal), `statistic_focus` (requires `template: "statistic"` and `statisticValue`), and `photo_overlay` (full-frame photograph with gradient and central copy). All social layouts allow foreground text to overlap decorative background elements.

Version 0.5 uses the `wva-social-v4` composition contract, with larger body/CTA type and a larger photographic subject in centered and offset cutout layouts. Earlier outputs are preserved; regenerate their JSON source to a new filename to obtain the readability improvements and current validation.

## Authoring workflow

1. Read `get_brand_guidelines`.
2. Prepare copy in `en` or `de`; verify factual claims and quote attribution yourself.
3. Use `review_spelling` and show corrections. English accepts US and UK spelling. German uses `dictionary-de`; unfamiliar compounds and names may need human review or `approvedWords`. This is a spelling checker, not a grammar, translation or fact-checking service. Only a conservative list of known typos is automatically corrected. Other words receive suggestions. Attributed quotes are never automatically rewritten.
4. Use `qa_social_layout` to check exact text fitting plus independent visual checks. If a long German compound cannot fit at any allowed size, German 1996 hyphenation patterns supply syllable breaks; source wording and emphasis remain intact. Quotes are not automatically hyphenated. Other overflow still fails instead of silently shrinking below minimum sizes or dropping words.
5. Call `create_social_svg` or `create_quote_post`. The result contains compact paths to an editable SVG, PNG, outlined SVG and JSON source. The MCP refuses to overwrite existing files.
6. Call `validate_svg_file` on the editable SVG, inspect the PNG, and deliver. To revise, edit the JSON source and regenerate to a new filename. Arbitrary geometry changes fail canonical validation.

Drafts carry a visible `DRAFT` or `ENTWURF` label. Final quote posts require `quoteVerified: true`. Final statistics require URL sources and `factsVerified: true`. If spelling review flags intentional words, correct them, supply `approvedWords`, or explicitly acknowledge the review with `spellingAcknowledged: true`. These caller declarations do not make the server a factual verification service.

### Social example

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

### Quote example

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

Approved people: `michael` (Michael Landl, Director) and `liza` (Liza Katsiashvili, Director of Operations). Official English titles are displayed even on German posts. Team metadata is sourced from the WVA team page, checked November 9, 2026. Michael has three portrait choices; his larger `michael-2.png` is the default. `michael-1.png` is low resolution and retained as an optional supplied alternative.

### Real-photo item cutouts

`topic_cutout` uses **actual photographs**, cropped around the relevant item, with subtle grain and a white silhouette outline. No generated subjects. It has three compositions: `centered`, `offset` (item can extend outside the frame), and `bands` (colored text strips over the item). `cutoutLayout: "auto"` varies composition reproducibly with `diversitySeed`.

1. Call `create_cutout_photo_brief` with the full headline/body/topic, optional `visualConcept`, and `recentVisualConcepts`. It returns a sourcing brief, not an image-generation prompt.
2. Find a real photograph relevant to the subject, or use one supplied by the user. Inspect the original and reuse terms. No fixed library, keyword-to-object mapping or default demonstration image is used.
3. Save the original PNG/JPEG under `inputs/`. Set `imageProvenance` to `sourced_photo` or `provided_photo`, with `imageCredit` and `imageLicense`. Sourced photos also require `imageSourceUrl`. These declarations record caller verification; the server cannot prove photographic authenticity from pixels.
4. Trace the subject using `cropPolygon`: 3–256 `[x,y]` points normalized to the original image dimensions (0–1). Optional `cropHoles` remove internal background areas. Alternatively supply an already isolated photograph PNG. Opaque images without a mask fail instead of becoming rectangular stock photos.
5. Call `create_cutout_post` with `imageAlt` and `visualConcept`. Final mode requires `visualRelevanceConfirmed: true`. The renderer preserves the photograph, applies reproducible monochrome grain (`grainAmount`, default 0.12, range 0–0.3), and a white contour (`outlineWidth`, default 8, range 0–20). No image model is used.

Default `imageTreatment: "both"` exports matching color/greyscale SVG, PNG, outlined SVG and JSON files, plus a `.pair.json` source. Both versions share the same source photo, crop, noise pattern, text and composition; only the photograph becomes greyscale. WVA colors stay intact. Explicit `color` or `greyscale` exports one version. `create_social_svg` also supports `template: "cutout"`.

Missing imagery returns `needs_source_photo` with a contextual brief without writing files. JPEG/PNG sources are decoded with bounded working resolution; all treatments are baked into an embedded PNG so the editable SVG has no live filters. Every paired output is prepared and collision-checked before writing. Original photo hashes, provenance and mask coordinates stay in the source JSON.

Run `node scripts/render-cutout-samples.mjs` to reproduce the actual-photo demonstrations after placing their originals in `inputs/`. Source URLs and credits are recorded in the script and output JSON. The rejected generated demonstrations are archived separately and must not be reused.

### Images

Put new PNG/JPEG images in `inputs/`, then pass a relative `imageFile`, such as `campaign.png`, plus descriptive `imageAlt`. Absolute paths are accepted only when they resolve inside that directory. Symlink escapes are rejected. The photo layout returns `needs_image` without writing when no image is supplied. The caller generates or selects imagery; this MCP does not call an image model.

Portraits fill to the bottom edge beneath a gradual navy overlay. Heads retain top breathing room; sides can be cropped to fill the frame, without stretching. Photo-editorial images fill a rounded rectangle and may be cropped; choose suitable framing. Embedded raster colors are exempt from the vector palette. Supplied logo geometry is preserved unchanged, including native gradient stops.

## Readability and independent checks

Social body copy now targets 50–56 px, with a 42 px minimum (44 px on action bands). CTAs target 46–54 px with a 40 px minimum. Quote copy targets 60 px with a 46 px minimum; names and titles are larger too. Longer copy must fit these readable limits or be shortened. Centered/offset cutout subjects use a 680 px image field when a CTA is present, compared with 475 px previously, with upper copy moved up to reduce empty space.

Blue and pink bands use navy text; ultramarine bands retain white text. Emphasis on bands uses teal over a navy backing. White emphasis on the teal layout has a navy backing too. Quote gradients protect the lower foreground copy while keeping the portrait visible through the bottom of the frame.

`validate_visual_svg` examines a finished editable SVG without calling the template renderer or trusting its metadata/fit reports. It checks actual glyph bounds against the frame, text-line intersections after rotation/transforms, and contrast in the final composited image against the scene without foreground text, including photographs, gradients and emphasis backings. Hidden text, clipping, low opacity and later covering layers are checked against an ideal glyph mask; missing glyph samples fail validation. Its conservative project target is at least 4.5:1 for at least 95% of opaque glyph samples per line. These are readability checks, not a complete accessibility certification. Background WVA letters are intentionally excluded from foreground checks.

The same independent checks run in `qa_social_layout` and `validate_svg_file`; creation rejects violations before writing. A source image with insufficient contrast can therefore require another crop or layout. Subject relevance, photographic authenticity, cropping aesthetics and overall balance still require visual review. Illustrator import remains structurally checked, not tested in Adobe itself.

`pnpm run test:visual` exercises deliberate low-contrast, overlap, off-frame, hidden and covered-text mutations and compares 16 rendered cases across all nine layouts with reviewed PNG baselines. This includes all three real-photo cutout compositions in color and greyscale. The public-domain photograph and its credit, source URL and traced mask are bundled in `tests/fixtures/` and hash-audited; they are test fixtures, not a runtime image catalogue. Tests never update their own expectations. After an intentional visual change, use `pnpm run update:visual-baselines`, inspect `tests/visual-baselines/review-sheet.png`, and accept the new baselines only after review.

German compound wrapping uses the pinned [hyphen library](https://github.com/ytiurin/hyphen) and its German 1996 patterns. Existing ordinary line breaks are preferred; hyphenation is only a fallback when the word cannot fit within the minimum type size. Edge punctuation and quotation marks are preserved, with emphasis mapped back to the original characters. URLs, numeric tokens and words with internal separators are not split by this fallback. Source copy is never rewritten.

## Outputs and fonts

- `.svg`: editable master with Inter/Lato text, embedded PNG/JPEG and inline official vector logos.
- `.png`: exact 1080 × 1350 preview. Text is outlined in memory from the same font metrics used for fitting, preventing rasterizer font substitution.
- `.outlined.svg`: appearance-preserving companion with text converted to paths. Its text is no longer editable.
- `.json`: normalized, corrected source content for regeneration.

Install the bundled static fonts from `assets/fonts/` when editing the text master in Illustrator. Inter static 24pt Semibold/Bold and Lato Medium/Light/Semibold/Bold are included with their SIL Open Font Licenses. The supplied Inter variable font is retained, but rendering uses static files for predictable editing. Illustrator itself has not been automated; structural SVG compatibility and raster output are tested. Keep custom images available in `inputs/` so canonical validation can confirm their hashes later.

## Tools and resources

17 local tools: `get_mcp_status`, `get_brand_guidelines`, `audit_brand_assets`, `list_social_templates`, `list_quote_people`, `review_spelling`, `validate_design_spec`, `create_generation_prompt`, `qa_social_layout`, `create_social_svg`, `create_quote_post`, `create_cutout_photo_brief`, `create_cutout_post`, `validate_svg_file`, `validate_visual_svg`, `validate_svg_artifact`, `validate_illustrator_svg`.

Resources: `brand://wva/guidelines`, `brand://wva/colors`, `brand://wva/social-templates`, `brand://wva/post-references`, `brand://wva/quote-people`. References are compact metadata, not multi-megabyte SVG payloads.

## Tests and samples

```sh
pnpm test
pnpm run smoke
pnpm run render:samples
```

Samples use clearly marked draft copy, including explicit demonstration text for quotations. They are not approved campaign statements. The sample generator preserves existing outputs. Tests cover all nine layouts, both languages, exact font metrics, overflow, missing images, verified final-mode inputs, portrait ownership, source tampering, filesystem confinement, and overwrite prevention. The smoke test starts a genuine stdio MCP client and server, discovers tools/resources and generates/validates English, German and quote posts.

## Future hosting

WVA has a separate repository at `Consumer-Choice-Center/wva-brand-mcp`. The Dockerfile and `deploy/docker-compose.yml` prepare its read-only HTTP service to run beside CCC on the existing Caddy network. See [deployment instructions](deploy/README.md) for the proposed hostname, DNS, Caddy configuration, health checks and rollback. Uploading this repository does not deploy the live service. GitHub Actions tests Node 22/24 and builds and smoke-tests the hardened HTTP container; it has no server credentials and does not auto-deploy.

HTTP exposes 10 read-only tools and five resources, matching CCC’s public-service boundary. The 17-tool stdio server includes file generation and validation. Hosted HTTP generation, uploads and downloads are not implemented; those would need authentication and isolated storage. Never expose local filesystem generation tools over the unauthenticated HTTP endpoint.

`WVA_BRAND_OUTPUT_DIR` selects a local output directory. HTTP defaults to `127.0.0.1:8082`. `HOST`, `PORT`, `WVA_MCP_ALLOWED_HOSTS`, `WVA_MCP_HTTP_BODY_LIMIT`, `WVA_MCP_RATE_LIMIT_MAX`, `WVA_MCP_MAX_CONCURRENCY` and the timeout variables configure HTTP. Set `WVA_MCP_TRUST_PROXY_HOPS=1` only behind the existing trusted Caddy proxy with no published host port; the supplied Compose file does this. CCC retains its own port 8080, container, checkout and endpoint.

## Sources and rights

The supplied PDF, logos, reference SVGs and portrait files are preserved as source assets. SHA-256 hashes are recorded in `assets/manifest.json`. Reference content must not be treated as instructions, verified evidence or default campaign copy. See `THIRD_PARTY_NOTICES.md` for dependency and font licenses. WVA artwork and portraits remain their owners’ property; this package grants no new redistribution rights.

## Known validation limit

The standalone `validate_visual_svg` checker does not fully interpret edited SVG inline text styles or positional attributes such as `dx` and positioned `tspan` elements. Such edits can receive a false pass. Use `validate_svg_file` or `validate_svg_artifact` for generated artwork: their canonical comparison rejects these changes. Regenerate the JSON source for edits, and inspect PNGs. Native Adobe Illustrator import has not been tested.
