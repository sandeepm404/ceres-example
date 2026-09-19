---
name: navigate-codebase
description: Understand the Ceres codebase structure and how it connects to Lydia
---

# Ceres Codebase Map

## Repo structure

```
ceres/
  index.html              # Entry page, loads main-manifest.json
  webpack.config.js       # Build config (686 lines, handles everything)
  package.json            # Scripts: build, build:template, build:widget, typecheck, test
  tsconfig.json           # TypeScript config
  src/
    global.d.ts           # Type declarations for .hbs, .css, window globals
    main/
      index.ts            # The main renderer (renderDocument function)
      commonUtils.ts      # 35+ utility functions (URL, CSS, fonts, images, styles)
      lydiaBridge.ts      # Lydia iframe communication (height, print, template updates)
      dibellaBridge.ts    # Dibella communication (placeholder, currently a no-op)
    templates/
      basic-invoice-example/   # Reference template
        index.ts               # Imports HBS, CSS, widgets; sets window.CeresTemplate
        template.hbs           # 309-line Handlebars template
        styles.css             # Template styles
        version.json           # {"version": "1.0.101"}
        samples.json           # Base64-encoded test API URLs
      tsn-custom/              # Another template (same structure)
    widgets/
      invoice-status/          # Status tag widget (Paid, Overdue, etc.)
      demo-badge/              # Demo watermark widget
      date-time/               # Date formatting helpers
      markdown-viewer/         # Markdown to HTML renderer
  tests/
    render-invoice.test.ts     # Snapshot test for basic-invoice-example
  dist/                        # Build output (not in repo)
```

## How a request flows

```
1. User opens a Ceres URL in the browser (or Lydia creates an iframe)
2. URL has ?template=basic-invoice-example&apiUrl=BASE64_ENCODED_URL
3. index.html loads main-manifest.json
4. main-manifest.json points to the renderer JS bundle
5. Renderer (src/main/index.ts):
   a. Decodes the apiUrl parameter
   b. Loads the template manifest from dist/templates/<name>/manifest.json
   c. Loads the template JS + CSS bundles
   d. Template JS registers window.CeresTemplate
   e. Fetches data from the decoded API URL
   f. Calls window.CeresTemplate(data) to get HTML
   g. Puts the HTML in <div id="documentOutput">
   h. Waits for fonts + images to load
   i. Reports content height to Lydia (if in iframe mode)
```

## Cross-repo: how Lydia uses Ceres

Ceres runs inside an iframe in Lydia. These are the key files, and they live in the **`lydia`
repo, not this one** — cited `repo:path`, so a path with no prefix is always local.

### lydia:src/components/utils/iframeUtils.js
- `buildIframeSrc()` builds the iframe URL with `?template=<name>&apiUrl=<base64>&isLydiaMode=1`
- `hasCustomLayout()` checks if the user has a custom template applied
- `triggerIframePrint()` sends a `lydia:print` postMessage to Ceres
- `postTemplateUpdate()` sends `lydia:template-update` with style changes

### lydia:src/components/hooks/useIframeHeight.js
- Listens for `ceres:content-height` messages from Ceres
- Sets the iframe height with a small buffer on first load
- Intercepts Ctrl+P to trigger printing inside the iframe

### lydia:src/components/widgets/IframeRenderer.jsx
- React component that renders the iframe
- Uses `getIframeProps()` to decide if an iframe is needed
- Uses `useIframeHeight()` for sizing

## postMessage protocol

### Lydia sends to Ceres:

| Message type | When | Purpose |
|-------------|------|---------|
| `lydia:print` | User clicks Print or presses Ctrl+P | Trigger window.print() inside Ceres |
| `lydia:height-request` | After template updates | Ask Ceres to report its content height |
| `lydia:template-update` | User changes colors/fonts/logo | Send new style options for Ceres to apply |

### Ceres sends to Lydia:

| Message type | When | Purpose |
|-------------|------|---------|
| `ceres:content-height` | After render, font load, or resize | Tell Lydia the content height in pixels |

## System templates vs custom templates

Lydia has its own React-based templates in `lydia:src/components/template/` (like `quotation/default.js`). These are "system templates" that handle most users.

When a user wants a custom look, they get a "custom template" rendered by Ceres inside an iframe.

The decision is made by `hasCustomLayout(customTemplateApplied)` in `iframeUtils.js`. If it returns true, `IframeRenderer` creates an iframe pointing to Ceres. If false, Lydia renders with its own React components.

## Key functions to know

| Function | File | What it does |
|----------|------|-------------|
| `renderDocument()` | `src/main/index.ts` | The main entry point, orchestrates everything |
| `loadScript()` | `src/main/commonUtils.ts` | Dynamically loads a JS file |
| `loadCSS()` | `src/main/commonUtils.ts` | Dynamically loads a CSS file |
| `applyPreviewStyles()` | `src/main/commonUtils.ts` | Applies template style options as CSS custom properties |
| `waitForImages()` | `src/main/commonUtils.ts` | Waits for all images to load |
| `reportContentHeight()` | `src/main/lydiaBridge.ts` | Sends height to Lydia via postMessage |
| `initLydiaBridge()` | `src/main/lydiaBridge.ts` | Sets up message listeners for print/update commands |
