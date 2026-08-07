---
name: scaffold-template
description: Create a new Ceres template from scratch with all required files
---

# Scaffold a New Ceres Template

## What you need to know

Ceres is a document renderer that runs inside an iframe in Lydia (the main React app). It uses Handlebars for templates and plain CSS for styling.

When a user has a custom template, Lydia creates an iframe pointing to Ceres. Ceres loads the template, fetches data from an API, and renders the document.

## Required files

Every template needs exactly 5 files. Create them all in `src/templates/<template-name>/`.

### 1. index.ts

This file wires everything together. Here is the boilerplate:

```typescript
// @ts-ignore
import template from "./template.hbs";
import "./styles.css";

// Import only the widgets you actually use in template.hbs
// Available widgets:
//   ../../widgets/invoice-status  -> provides {{> InvoiceStatus}} partial
//   ../../widgets/demo-badge      -> provides {{> DemoBadge}} partial
//   ../../widgets/date-time       -> provides date formatting helpers
//   ../../widgets/markdown-viewer  -> provides {{> MarkdownViewer}} partial

import "../../widgets/invoice-status";
import "../../widgets/demo-badge";
import "../../widgets/date-time";
import "../../widgets/markdown-viewer";

// This line is the contract with the main renderer.
// Without it, the renderer has no way to call your template.
window.CeresTemplate = template;
```

### 2. template.hbs

The HTML layout using Handlebars syntax. Key patterns:

```handlebars
{{!-- Print a value --}}
{{ invoiceNumber }}

{{!-- Print a nested value --}}
{{ billedBy.name }}

{{!-- Conditional --}}
{{#if notes}}
  <div>{{ notes }}</div>
{{/if}}

{{!-- Loop --}}
{{#each items}}
  <tr>
    <td>{{ name }}</td>
    <td>{{ amount }}</td>
  </tr>
{{/each}}

{{!-- Widget partial --}}
{{> InvoiceStatus}}

{{!-- Widget helper --}}
{{formateShortDateWithOffset invoiceDateUserInput ownerOffset}}

{{!-- Markdown rendering --}}
{{> MarkdownViewer (prepareMarkdownViewerData notes) }}
```

### 3. styles.css

Plain CSS. Use `--ceres-*` custom properties for user-customizable values:

```css
.my-template {
  font-family: var(--ceres-font-family, 'Helvetica Neue', Arial, sans-serif);
  color: var(--ceres-primary-color, #333);
}

/* Always include print styles */
@media print {
  .my-template {
    padding: 0;
    max-width: none;
  }
}
```

Available custom properties:
- `--ceres-primary-color`
- `--ceres-secondary-color`
- `--ceres-primary-background`
- `--ceres-secondary-background`
- `--ceres-font-family`

### 4. version.json

```json
{
  "version": "1.0.0"
}
```

Do not edit this by hand. The build system updates it automatically.

### 5. samples.json

Base64-encoded live API URLs for testing:

```json
{
  "example": "aHR0cHM6Ly9hcGkucmVmcmVucy5jb20vaW52b2ljZXMvNjg4OWU1MmU3MGI1MjQwMDE5NzRkZDJkP19hdD0zcXdtVlp4OEZVV3hnMzdCNG0mY29weSZwb3B1bGF0ZUJ1c2luZXNzPXRydWU="
}
```

To encode a URL: `btoa("https://api.refrens.com/invoices/ID?_at=TOKEN&populateBusiness=true")`

## Common API data fields

The API response has these fields you can use in your template:

| Field | Type | Example |
|-------|------|---------|
| `invoiceNumber` | string | `"INV-001"` |
| `invoiceDateUserInput` | string | `"01 Sep 2025"` |
| `formattedDueDate` | string | `"15 Sep 2025"` |
| `billedBy.name` | string | `"Acme Corp"` |
| `billedBy.street` | string | `"123 Baker Street"` |
| `billedBy.city` | string | `"Mumbai"` |
| `billedTo.name` | string | `"Alice Pvt Ltd"` |
| `items` | array | Line items with `name`, `quantity`, `rate`, `amount` |
| `totals.subTotal` | string | `"₹10,000.00"` |
| `totals.total` | string | `"₹11,800.00"` |
| `notes` | string | Free text, may contain markdown |
| `terms` | array | Array of term groups |
| `customLabels` | object | User-configured labels for fields |
| `status` | string | `"received"`, `"payment_pending"`, `"overdue"`, etc. |

## After creating

1. Build: `npm run build:template --template=my-cool-invoice`
2. Test: Open `dist/index.html?template=my-cool-invoice&apiUrl=YOUR_BASE64_URL`
3. Baseline the visuals — required, not conditional: `npm run test:snapshots:update`, then review the
   generated PNGs before committing them. See `.agent/skills/snapshot-testing/SKILL.md`, including
   its note on the harness not being wired up yet.

## Reference

Look at `src/templates/basic-invoice-example/` for a complete working example.
