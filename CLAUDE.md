# Ceres - Custom Document Renderer

Ceres renders custom document templates (invoices, quotations) inside an iframe in Lydia. It uses Handlebars for templating and plain CSS for styling.

## Project Structure

- `src/main/` - Main renderer (loads templates, fetches API data, renders)
- `src/templates/` - Custom templates (each folder is one template)
- `src/widgets/` - Reusable Handlebars partials (InvoiceStatus, DemoBadge, DateTime, MarkdownViewer)
- `webpack.config.js` - Build config with automatic entry discovery and semver versioning
- `index.html` - Entry page that bootstraps the renderer

## How it works

1. Browser loads `index.html` which fetches `main-manifest.json`
2. Renderer reads `?template=<name>&apiUrl=<base64>` from the URL
3. Loads template JS/CSS bundles
4. Template registers `window.CeresTemplate` (compiled Handlebars function)
5. Renderer fetches API data and calls `window.CeresTemplate(data)`
6. Result HTML goes into `<div id="documentOutput">`

## Lydia Integration

Ceres runs inside an iframe in Lydia. Communication via postMessage:
- Lydia sends: `lydia:print`, `lydia:height-request`, `lydia:template-update`
- Ceres sends: `ceres:content-height`

Key Lydia files: `iframeUtils.js` (URL builder), `useIframeHeight.js` (height sync), `IframeRenderer.jsx` (iframe component)

## Skills

For detailed instructions on specific tasks, read these files:

- **Scaffold a template**: `.agent/skills/scaffold-template/SKILL.md`
- **Debug build failures**: `.agent/skills/debug-build/SKILL.md`
- **Navigate the codebase**: `.agent/skills/navigate-codebase/SKILL.md`
- **Snapshot testing**: `.agent/skills/snapshot-testing/SKILL.md`
- **Convert design to template**: `.agent/skills/design-to-template/SKILL.md`

## Build Commands

```bash
npm run build                                    # Build everything
npm run build:template --template=my-template    # Build one template
npm run build:widget --widget=date-time          # Build one widget
npm run typecheck                                # TypeScript check
npm test                                         # Run Jest tests
```

## Static Hosting

Built files are uploaded to Azure Blob Storage and served through the lstatic CDN at `lstatic.refrens.com/ceres/`. JS/CSS are cached. JSON/HTML are not cached (so manifest updates take effect immediately).
