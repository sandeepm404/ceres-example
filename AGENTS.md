# Ceres - Custom Document Renderer

Ceres renders custom document templates (invoices, quotations) inside an iframe in Lydia. It uses Handlebars for templating and plain CSS for styling.

## Project Structure

- `src/main/` - Main renderer (loads templates, fetches API data, renders)
- `src/templates/` - Custom templates (each folder is one template)
- `src/widgets/` - Reusable Handlebars partials (InvoiceStatus, DemoBadge, DateTime, MarkdownViewer)
- `webpack.config.js` - Build config with automatic entry discovery and semver versioning

## How it works

1. Browser loads `index.html` which fetches `main-manifest.json`
2. Renderer reads `?template=<name>&apiUrl=<base64>` from the URL
3. Loads template JS/CSS bundles, template registers `window.CeresTemplate`
4. Renderer fetches API data and calls `window.CeresTemplate(data)`
5. Result HTML goes into `<div id="documentOutput">`

## Lydia Integration

Runs inside an iframe. Communication via postMessage:
- Lydia sends: `lydia:print`, `lydia:height-request`, `lydia:template-update`
- Ceres sends: `ceres:content-height`

## Skills (read .agent/skills/*/SKILL.md for detailed instructions)

- `scaffold-template` - Create a new template with all required files
- `debug-build` - Diagnose and fix build failures
- `navigate-codebase` - Understand repo structure and Lydia integration
- `snapshot-testing` - Manage visual regression tests
- `design-to-template` - Convert Figma/screenshot into a Ceres template
- `ceres-template-data-contract` - Map template designs to the normalized invoice data contract and ask for missing data from provided images

## Local Preview

```bash
npm run dev                                      # webpack --watch + server on :4000
npm run dev:template --template=fitking          # watch a single template
npm run serve                                    # serve dist/ only (PORT=5000 to change)
```

Open the URL the server prints (`/?devMode=1&template=<name>`). It loads the first sample from
the template's `samples.json`; the bottom-right modal switches template or sample. `dist/` must
be built at least once. `file://` does not work — the renderer fetches its manifests over http.

Saving a source file reloads the open page: the server watches `dist/`, pushes a reload over
SSE, and redirects requests for a stale template version to the newest build (the dev bridge
pins the URL to a versioned manifest path, and old version folders are never deleted). Escape
hatches: `CERES_PIN_VERSION=1`, `CERES_NO_RELOAD=1`.

## Build Commands

```bash
npm run build                                    # Build everything
npm run build:template --template=my-template    # Build one template
npm run build:widget --widget=date-time          # Build one widget
npm run typecheck                                # TypeScript check
npm test                                         # Run tests
```
