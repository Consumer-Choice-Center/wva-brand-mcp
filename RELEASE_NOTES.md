# WVA Brand MCP 0.6.0

HTTP now exposes `create_quote_post`, returning a native PNG preview and expiring PNG, editable SVG, outlined SVG and source JSON downloads. WVA uses its approved packaged portraits.

Rendering runs in a bounded worker without writing server files. Download links use random tokens, expire after one hour and are lost on restart. Public quote schemas expose no filesystem paths. Existing stdio generation remains available.

Rebuild the deployed service, configure its public base URL and refresh the Claude connector to discover the quote tool. Publishing the repository does not deploy the live service.

