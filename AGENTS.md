# WVA Brand MCP

- Scope: local English/German social and quote posts, always 1080×1350. No one-pagers.
- Keep WVA branding independent from CCC and CP. The supplied WVA guide controls palette and typography; the SVGs supply composition references.
- Call get_brand_guidelines before creating. Use create_social_svg or create_quote_post, then validate_svg_file and inspect the PNG.
- Show spelling corrections. Never auto-rewrite attributed quote wording or fabricate verification.
- Reference imagery is opt-in. For new photo posts, request a relevant caller-supplied PNG/JPEG in inputs or generate it through an available image tool outside this MCP.
- Preserve official logo files and portrait ownership. Do not redraw logos or swap a person's portrait silently.
- Revise content JSON and regenerate to a new filename. Do not edit SVG geometry to evade validation.
- Preserve source assets and their hashes; record intentional additions in assets/manifest.json.
- Run check, test, audit:assets and smoke after changing rendering or server behavior. Visually inspect affected sample PNGs. Never use a system-font fallback renderer.
- Keep WVA in its separate Consumer-Choice-Center/wva-brand-mcp repository. Publishing is authorized for this handoff; live deployment remains a separate operation. Do not change CCC or CP services when deploying WVA.

- Quote portraits must fill to the bottom frame beneath a gradual gradient and foreground copy. Crop background WVA letters beyond the frame. Center social copy and permit it to overlay background graphics.

- Topic cutouts must use actual photographs chosen for each topic, never generated subjects or a fixed image assortment. Use create_cutout_photo_brief, record source/license and credit, trace cropPolygon/cropHoles (or supply a transparent photo cutout), then create_cutout_post. Apply subtle grain and a white silhouette outline. Default to matching color/greyscale exports; keep WVA colors intact.

- Run independent visual QA before saving: foreground glyph bounds, text collisions and raster contrast. Use navy on blue/pink bands and navy-backed emphasis. Preserve prior outputs when migrating to wva-social-v4. Never auto-update visual baselines in tests; inspect the review sheet after intentional updates.
