---
name: data-mapping
description: Audit a real Ceres payload against an existing template and produce a record per rendered element (name, path, visibility, label variable, default label, value variable). Use when the user pastes an invoice/document JSON and asks what renders, which flag controls a section, where a label comes from, why a field is missing or blank, or wants a mapping/coverage report for a template.
---

# Data Mapping

Given a payload JSON and a template, produce a record per rendered element that answers: **what is it, where does it come from, what makes it appear, and what text prints for this document.**

## What this covers vs. other skills

- **This skill**: payload → audit. A template already exists; you are explaining or verifying what it does with real data.
- `ceres-template-data-contract`: design → template. Use that when the template does not exist yet and you are mapping a screenshot to contract fields.
- `architect-template`: deciding what each block must be able to render *before* markup exists, so rows the reference document does not show still render when their data arrives. Run that first; run this skill afterwards to verify the built template against the spec it produced.
- `data-binding-tests`: turning a confirmed mapping into Jest assertions. Use that after this skill when the user wants the mapping locked in.

## Read these, in this order

1. `src/templates/<name>/template.hbs` — the only authority on what renders. Never infer output from the payload alone.
2. `src/templates/<name>/helpers.ts` — template-local helpers that gate or transform values (`partyFields`, `itemTableColumns`, `computePrintStatus`, …).
3. `src/main/invoiceTemplateNormalization.ts` — resolves every `mapped.*` and `derived.*` value. A `mapped.visibility.x` in the markup is **never** a payload field; trace it to its expression here.
4. `src/main/invoicePayloadContract.ts` — only when a payload key's meaning is unclear.

## One record per rendered element

A label and its value are two separate elements on the page, each with its own source. Split them:

- **A label sourced from a variable gets its own record**, named `<Field> Label Text`. Its `path` is the label's own path (`customLabels.invoiceNumber`, `columns[amount].label`, `terms[g].label`), its `valueVariable` is that variable, and its `defaultLabel` is the fallback. The value record follows it immediately.
- **A label hardcoded in the markup does not get its own record.** It has no path and cannot vary, so it stays on the value record as `labelVariable`, a plain unbraced string, with `defaultLabel: null`.
- **A label-only element** (a section heading with no adjacent value) is a single record in the Label Text shape.

This is why `labelVariable` is null on most records: whenever a label can vary, it is a record of its own.

## Resolving each key

### path

Report the path the **template** reads, not the nearest-looking payload key. When they differ, that is a finding — see Traps below. For normalized values, give both: `mapped.visibility.shippedTo` (= `shippedTo.name` non-empty).

### visibility

Visibility is layered. Walk outward from the element and report **every** gate, with the outermost first:

| Layer | Example |
|---|---|
| Section flag in `mapped.visibility.*` | `showBankUpiSection`, `shippedFrom`, `showHsnSummary` |
| Document-level opt-out | `invoice.hideTotals`, `invoice.hideTotalInWords`, `invoice.showTotalsRow` |
| Business-wide toggle | `owner.configuration.experimental.fieldVisibility.<key>.showInDocument` |
| Per-record opt-out | `billedTo.emailShowInInvoice`, `params.showInInvoice`, `showInInvoice` |
| Column rule | `column.isHidden` OR the key's `visible` rule in `normalizeInvoiceColumns` |
| Markup guard | `{{#if}}` / `{{#unless}}` on the value itself |

Resolve each gate against **this** payload and state the outcome (`shown` / `hidden` / which layer killed it). A field can be present in the JSON and still not print. A Label Text record carries the same visibility as its value record — they appear and disappear together — unless the markup guards the label separately.

Two conventions that are easy to get backwards:

- **Opt-out flags** (`emailShowInInvoice`, `phoneShowInInvoice`, `params.showInInvoice`, `fieldVisibility.*.showInDocument`) hide **only** on an explicit `false`. Absent means shown.
- **Visibility never keys off a non-zero value.** A zero-rated tax row still prints if its flag says so. Do not report "hidden because the amount is 0" unless the code actually tests the amount.

### defaultLabel

The fallback printed when this record's own variable resolves empty — but only where the markup actually supplies one. An empty-string `customLabels` value is not automatically a fallback: a `{{#if}}`-guarded heading with an empty override renders *nothing*, an unguarded one renders *blank*. Say which.

Two label sources are **forced by normalization** and cannot be overridden: `columns[cgst].label` always prints `CGST`, and `columns[sgst].label` prints `UTGST` when `invoice.utgst` is true. The account's own column label is deliberately ignored there, so flag it when the payload disagrees.

### valueVariable

The text **as printed**, not the raw JSON: dates through `formateShortDateWithOffset` (apply `ownerOffset` — a UTC timestamp near midnight shifts the day), currency through `formatCurrency`, phones through `formatPhone`, quantities through `formatQty` (`100 (BAG)`). For repeating blocks give the per-row values or a count. Write `absent → hidden` when the path has no value.

## Traps that produce silent blanks

Check each of these before reporting; they were all real in production payloads:

- **Key-name mismatch.** The template reads `bankAccount.bankName` / `accountHolderName`; payloads often carry `bank` / `name`. The row renders as nothing. Grep the payload for a near-miss key before writing "absent".
- **Empty `customLabels`.** `total`, `billedTo`, `shippedFrom` commonly arrive as `""`. Guarded headings disappear; the grand-total label prints blank.
- **`hsnView: "MERGE"`** hides the whole `hsn` column (`showHsnColumn` needs `SPLIT`, or `DEFAULT` on an allow-listed template) and routes HSN inline instead.
- **`invoiceType !== "INVOICE"`** hides every tax column, `gstRate`, and `total` via `isTaxInvoice`. Quotations lose them all.
- **`discount` column** is gated on `finalTotal.discount` being non-zero, not on per-item discounts.
- **Payload data the template never reads.** Sweep for top-level arrays/objects with no `{{ }}` reference — `extraTotalFields`, `billedBy`, item `thumbnail` when `advanceOptions.showThumbnailAsColumn` is true. List these; they are usually the actual bug.

## Taxation paths

The tax keys are India-named but not India-only. Resolve which path the document is on **before** reading any per-key rule — most tax mistakes are a correct rule applied from the wrong path.

| Path | Selected by | Tax columns / rows | HSN & classification |
|---|---|---|---|
| **India, intra-state** | `taxType: "INDIA"`, `taxName: "GST"`, `igst` false | `cgst` + `sgst`; `showCgstSgst` true | `hsn` available |
| **India, inter-state** | `taxType: "INDIA"`, `taxName: "GST"`, `igst` **true** | `igst`; `showIgst` true, `cgst`/`sgst` hidden | `hsn` available |
| **Global** | `taxType: "GLOBAL"`, or **any** `taxName` other than `"GST"` | `igst` only — the generic single-tax slot | both unreachable |
| **Malaysia** | owner country `MY` | follows one of the above | `classification` available, `hsn` still needs INDIA |

The rules that decide it, from `invoiceTemplateNormalization.ts`:

- **`showIgst = Boolean(invoice.igst) || taxName !== "GST"`.** The second clause is the whole non-India story: a VAT document with `igst: false` still routes through the `igst` slot, because its `taxName` is not `"GST"`.
- **`showCgstSgst = !showIgst && taxName === "GST"`** — India-GST-only by construction. It can never be true on a global document.
- **`gstRate` has no taxType gate**, only `isTaxInvoice`. An India-named key therefore renders on non-India documents, where the account relabels it (`"VAT Rate"`).
- **`hsn` needs `isTaxInvoice` AND owner country `IN` AND `taxType === "INDIA"` AND the `hsnView` rule**; `showInlineHsn` needs `isTaxInvoice` AND `taxType === "INDIA"`. On a global document **both** are false, so a populated `item.hsn` prints nowhere at all — not as a column, not inline.
- **`classification` keys off owner country `MY` alone**, independent of `taxType`.
- **Only `cgst`/`sgst` labels are forced** (`CGST`, and `UTGST` when `invoice.utgst`). `igst`, `gstRate` and `total` keep `column.label` — that is precisely the mechanism by which local tax naming works, so never report the `igst` header as "should be IGST".
- **`taxName` drives visibility; `customLabels.taxName` does not.** Totals rows take their labels from `mapped.columns`. A `customLabels.taxName` that disagrees with `invoice.taxName` is a stale-config defect with no render consequence — say so rather than reporting it as a broken label.
- **`finalTotal` carries `igst`, `cgst` and `sgst` on every document regardless of path.** A global document routinely ships `cgst`/`sgst` splitting the single tax figure. Read the visibility flag, never the presence of a total.

**Tax columns can render unformatted — check this whenever they are visible.** A template whose item-cell `switch` only cases `name`/`hsn`/`quantity`/`rate`/`amount`/`discount` sends `gstRate`/`igst`/`cgst`/`sgst`/`total` to the generic fallback, which stringifies the raw number. On an India document whose tax columns are all hidden the defect is invisible; on a global document the tax columns are exactly the visible ones, so money prints as bare integers (`2160`) beside a correctly formatted `Amount` (`AED 12,000.00`), and `gstRate` prints `18` instead of `18%`. Confirm the switch has a case for every column key the document actually shows.

Two payload-level checks worth making on any non-India document: `locale` against `currency` (an `en-IN` locale on an `AED` document applies Indian digit grouping), and whether `taxSummary`/`hsnSummary` are absent entirely — on a global document they usually are, which double-gates the summary tables off alongside their config flags.

## Output

Emit one JSON object per document-section group, in template order (header/meta → parties → logistics → item table → totals → footer blocks), using the schema in the reference below. Drop groups the template does not render. Use a markdown table instead only if the user asks for one.

Mark any record that depends on data missing from the supplied payload with `"missing": "<key>"` and say which key is missing — a truncated paste is common, and a guess presented as a value is worse than a gap.

Close with a short **findings** list: blank labels, hardcoded labels that should read `customLabels`, key mismatches, and unread payload data. Do not fix anything unless asked; offer.

## Verification

The mapping is a claim about rendered output — confirm it when cheap:

- `npm test -- --findRelatedTests src/templates/<name>/template.hbs` if binding tests exist.
- Render the payload through the template and grep the HTML for a value you claimed prints (and one you claimed does not). Prefer this over re-reading the markup when a finding is surprising.
- `npm run build:template --template=<name>` only if you changed template files.

If nothing was executed, say the mapping was derived by reading the markup and normalization, not by rendering.

---

# Field inventory reference

The standard grouping and the resolved rules for a Ceres invoice/document payload. Use it as the skeleton for an audit: keep the groups and their order, drop records the template does not render, add template-local records.

## Schema

```json
{
  "group": "2. Invoice details",
  "fields": [
    {
      "name": "Invoice Number Label Text",
      "path": "customLabels.invoiceNumber",
      "visibility": "Always",
      "labelVariable": null,
      "defaultLabel": "Invoice No",
      "valueVariable": "{customLabels.invoiceNumber}"
    },
    {
      "name": "Invoice Number",
      "path": "invoiceNumber",
      "visibility": "Always",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{invoiceNumber} — # per {hideHashInDocumentNumber}"
    }
  ]
}
```

- Each record is **one rendered element**. `name` is a documentation identifier for locating it — it is never rendered.
- `valueVariable` is the variable whose resolved text prints. Values written as `{path}` name a variable to resolve at render time and must never be printed literally.
- A path containing `[n]` is an array: iterate it and render every entry in array order, never a fixed number of entries. `[g]` is an outer group loop.
- `labelVariable` is non-null **only** for a hardcoded constant in the markup. A label that can vary is its own `<Field> Label Text` record.
- `defaultLabel` is the fallback for this record's own variable, and is null on value records.
- **A Label Text record is visible only when its own variable resolves non-empty** wherever the markup guards it — which section headings almost always are. Never write `Always` for a guarded heading: an empty `customLabels` override hides it outright rather than falling back. Only an unguarded label is `Always`, and that one prints blank.
- `visibility` names the resolved gate, not the field's presence. `mapped.*` values are computed in `invoiceTemplateNormalization.ts` and never exist in the payload.
- `null` means not applicable. `"unverified": true` marks a path observed in payloads but not declared in `invoicePayloadContract.ts` — verify before relying on it.

## 1. Document chrome

```json
{
  "group": "1. Document chrome",
  "fields": [
    {
      "name": "Logo",
      "path": "logo",
      "visibility": "Non-empty URL",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{logo}"
    },
    {
      "name": "Letterhead header",
      "path": "letterHead",
      "visibility": "assetUrl resolves non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{letterHead}"
    },
    {
      "name": "Letterhead footer",
      "path": "letterHeadFooter",
      "visibility": "assetUrl resolves non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{letterHeadFooter}"
    },
    {
      "name": "Watermark",
      "path": "template.watermark",
      "visibility": "{template.watermark.isEnabled} true",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{template.watermark.logo}, {.opacity}, {.rotation}, {.scale}",
      "unverified": true
    },
    {
      "name": "Invoice Title",
      "path": "invoiceTitle",
      "visibility": "Always — template supplies fallback",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{invoiceTitle}"
    },
    {
      "name": "Invoice Subtitle",
      "path": "invoiceSubTitle",
      "visibility": "Non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{invoiceSubTitle}"
    },
    {
      "name": "Document QR",
      "path": "mapped.qr.top",
      "visibility": "Resolved string non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "precedence: {qrCode} / {irn.qrCode} (suppressed when {irn.CancelDate} set) → {zatcaQrCode} → {lhdnQrCode} → {documentQr}"
    },
    {
      "name": "Branding",
      "path": "showBranding",
      "visibility": "{showBranding} truthy",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "shared widget under src/widgets/"
    },
    {
      "name": "IRN block",
      "path": "irn",
      "visibility": "{irn.Irn} present; cancelled state = mapped.irn.isCancelled ({irn.CancelDate} present)",
      "labelVariable": "IRN",
      "defaultLabel": null,
      "valueVariable": "{irn.Irn}, {.AckNo}, {.AckDt}, {.EwbNo} — placed per {irnPosition}"
    }
  ]
}
```

`useOriginalLogo`, `letterHeadOnFirstPage`, `footerOnLastPage`, `hideFooter` control asset variant and placement, not visibility.

## 2. Invoice details

```json
{
  "group": "2. Invoice details",
  "fields": [
    {
      "name": "Invoice Number Label Text",
      "path": "customLabels.invoiceNumber",
      "visibility": "Always",
      "labelVariable": null,
      "defaultLabel": "Invoice No",
      "valueVariable": "{customLabels.invoiceNumber}"
    },
    {
      "name": "Invoice Number",
      "path": "invoiceNumber",
      "visibility": "Always",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{invoiceNumber} — # per {hideHashInDocumentNumber}"
    },
    {
      "name": "Invoice Date Label Text",
      "path": "customLabels.invoiceDate",
      "visibility": "Always",
      "labelVariable": null,
      "defaultLabel": "Invoice Date",
      "valueVariable": "{customLabels.invoiceDate}"
    },
    {
      "name": "Invoice Date",
      "path": "invoiceDate",
      "visibility": "Always",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{invoiceDateUserInput}, fallback {invoiceDate} shifted by {ownerOffset}"
    },
    {
      "name": "Due Date Label Text",
      "path": "customLabels.dueDate",
      "visibility": "Present — follows {dueDate}",
      "labelVariable": null,
      "defaultLabel": "Due Date",
      "valueVariable": "{customLabels.dueDate}"
    },
    {
      "name": "Due Date",
      "path": "dueDate",
      "visibility": "Present",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{dueDate}, {dueInDays}"
    },
    {
      "name": "Status badge",
      "path": "status + billType",
      "visibility": "Template-local rule — see computePrintStatus in the template's helpers.ts; most web-app badge states never print",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "resolved badge text"
    },
    {
      "name": "Custom headers Label Text",
      "path": "customHeaders[n].label",
      "visibility": "Array non-empty, per-entry {value} non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{customHeaders[n].label} — every entry in array order"
    },
    {
      "name": "Custom headers",
      "path": "customHeaders[n].value",
      "visibility": "Array non-empty, per-entry {value} non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{customHeaders[n].value} — every entry in array order"
    },
    {
      "name": "Document custom fields Label Text",
      "path": "customFields[n].label",
      "visibility": "Array non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{customFields[n].label} — every entry in array order"
    },
    {
      "name": "Document custom fields",
      "path": "customFields[n].value",
      "visibility": "Array non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{customFields[n].value} — every entry in array order"
    },
    {
      "name": "Place of Supply",
      "path": "placeOfSupply",
      "visibility": "advanceOptions.hideCountryOfSupply false",
      "labelVariable": "Place of Supply",
      "defaultLabel": null,
      "valueVariable": "{placeOfSupply}"
    },
    {
      "name": "Country of Supply",
      "path": "billedBy.country",
      "visibility": "advanceOptions.hideCountryOfSupply false",
      "labelVariable": "Country of Supply",
      "defaultLabel": null,
      "valueVariable": "{billedBy.country}"
    },
    {
      "name": "Supply type",
      "path": "supplyType",
      "visibility": "Not printed",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{supplyType}",
      "unverified": true
    },
    {
      "name": "Reverse charge",
      "path": "reverseCharge / advanceOptions.reverseCharge",
      "visibility": "truthy",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{reverseCharge}"
    },
    {
      "name": "Currency",
      "path": "currency",
      "visibility": "advanceOptions.hideCurrencyCode gates the code",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{currency}, {subUnitLength}, {customCurrencySymbol}"
    }
  ]
}
```

## 3. Billed By

Party records apply identically to `billedBy`, `billedTo`, `shippedFrom`, `shippedTo` — only the visibility of the *block* differs (§5).

```json
{
  "group": "3. Billed By",
  "fields": [
    {
      "name": "Section header",
      "path": "customLabels.billedBy",
      "visibility": "{customLabels.billedBy} non-empty — guarded heading, hidden outright when the override is empty",
      "labelVariable": null,
      "defaultLabel": "Billed By",
      "valueVariable": "{customLabels.billedBy}"
    },
    {
      "name": "Name",
      "path": "billedBy.name",
      "visibility": "Always",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{billedBy.name}"
    },
    {
      "name": "Address",
      "path": "billedBy.street etc.",
      "visibility": "{street} or {city} present",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{billedBy.street}, {.city}, {.state}, {.pincode}, {.country}"
    },
    {
      "name": "GSTIN",
      "path": "billedBy.gstin",
      "visibility": "owner.configuration.experimental.fieldVisibility.gst.showInDocument — opt-out, hides only on explicit false",
      "labelVariable": "GSTIN",
      "defaultLabel": null,
      "valueVariable": "{billedBy.gstin}"
    },
    {
      "name": "PAN",
      "path": "billedBy.panNumber",
      "visibility": "owner.configuration.experimental.fieldVisibility.pan.showInDocument — opt-out",
      "labelVariable": "PAN",
      "defaultLabel": null,
      "valueVariable": "{billedBy.panNumber}"
    },
    {
      "name": "VAT Number Label Text",
      "path": "billedBy.vatLabel",
      "visibility": "Non-empty — follows {billedBy.vatNumber}",
      "labelVariable": null,
      "defaultLabel": "VAT Number",
      "valueVariable": "{billedBy.vatLabel}"
    },
    {
      "name": "VAT Number",
      "path": "billedBy.vatNumber",
      "visibility": "Non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{billedBy.vatNumber}"
    },
    {
      "name": "Email",
      "path": "billedBy.email",
      "visibility": "{billedBy.emailShowInInvoice} — opt-out",
      "labelVariable": "Email",
      "defaultLabel": null,
      "valueVariable": "{billedBy.email}"
    },
    {
      "name": "Phone",
      "path": "billedBy.phone",
      "visibility": "{billedBy.phoneShowInInvoice} — opt-out",
      "labelVariable": "Phone",
      "defaultLabel": null,
      "valueVariable": "{billedBy.phone}"
    },
    {
      "name": "Custom fields Label Text",
      "path": "billedBy.customFields[n].label",
      "visibility": "{params.showInInvoice} per entry — opt-out",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{billedBy.customFields[n].label}, fallback {.name} — every entry in array order"
    },
    {
      "name": "Custom fields",
      "path": "billedBy.customFields[n].value",
      "visibility": "{params.showInInvoice} per entry — opt-out",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{billedBy.customFields[n].value} — every entry in array order"
    },
    {
      "name": "Additional IDs Label Text",
      "path": "billedBy.additionalIds[n].label",
      "visibility": "{showInInvoice} per entry — opt-out",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{billedBy.additionalIds[n].label} — every entry in array order"
    },
    {
      "name": "Additional IDs",
      "path": "billedBy.additionalIds[n].value",
      "visibility": "{showInInvoice} per entry — opt-out",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{billedBy.additionalIds[n].value} — every entry in array order"
    },
    {
      "name": "Party custom headers Label Text",
      "path": "billedBy.customHeaders[n].label",
      "visibility": "{showInInvoice} per entry — opt-out",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{billedBy.customHeaders[n].label} — every entry in array order"
    },
    {
      "name": "Party custom headers",
      "path": "billedBy.customHeaders[n].value",
      "visibility": "{showInInvoice} per entry — opt-out",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{billedBy.customHeaders[n].value} — every entry in array order"
    }
  ]
}
```

The three extras buckets are normally flattened to one `{label, value}` list by a template-local `partyFields` helper; audit them as one loop if so.

## 4. Billed To

Same records as §3 against `billedTo.*`, plus:

```json
{
  "group": "4. Billed To",
  "fields": [
    {
      "name": "Section header",
      "path": "customLabels.billedTo",
      "visibility": "{customLabels.billedTo} non-empty — guarded heading, hidden outright when the override is empty",
      "labelVariable": null,
      "defaultLabel": "Billed To",
      "valueVariable": "{customLabels.billedTo}"
    },
    {
      "name": "Contact person Label Text",
      "path": "customLabels.contactPersonLabel",
      "visibility": "Non-empty — follows {billedTo.contactPerson.name}",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{customLabels.contactPersonLabel}"
    },
    {
      "name": "Contact person",
      "path": "billedTo.contactPerson.name",
      "visibility": "Non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{billedTo.contactPerson.name}"
    }
  ]
}
```

## 5. Shipping

```json
{
  "group": "5. Shipping",
  "fields": [
    {
      "name": "Shipped From header",
      "path": "customLabels.shippedFrom",
      "visibility": "mapped.visibility.shippedFrom = {shippedFrom.name} non-empty (NOT object presence) AND {customLabels.shippedFrom} non-empty — guarded heading, hidden outright when the override is empty",
      "labelVariable": null,
      "defaultLabel": "Shipped From",
      "valueVariable": "{customLabels.shippedFrom}"
    },
    {
      "name": "Shipped From address",
      "path": "shippedFrom.*",
      "visibility": "inherits block",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{shippedFrom.name}, {.street}, {.city}, {.pincode}, {.gstin}"
    },
    {
      "name": "From custom headers Label Text",
      "path": "shippedFrom.customHeaders[n].label",
      "visibility": "Array non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{shippedFrom.customHeaders[n].label} — every entry in array order"
    },
    {
      "name": "From custom headers",
      "path": "shippedFrom.customHeaders[n].value",
      "visibility": "Array non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{shippedFrom.customHeaders[n].value} — every entry in array order"
    },
    {
      "name": "Shipped To header",
      "path": "customLabels.shippedTo",
      "visibility": "mapped.visibility.shippedTo = {shippedTo.name} non-empty AND {customLabels.shippedTo} non-empty — guarded heading, hidden outright when the override is empty",
      "labelVariable": null,
      "defaultLabel": "Shipped To",
      "valueVariable": "{customLabels.shippedTo}"
    },
    {
      "name": "Shipped To address",
      "path": "shippedTo.*",
      "visibility": "inherits block",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{shippedTo.name}, {.street}, {.city}, {.pincode}, {.gstin}"
    },
    {
      "name": "To custom headers Label Text",
      "path": "shippedTo.customHeaders[n].label",
      "visibility": "Array non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{shippedTo.customHeaders[n].label} — every entry in array order"
    },
    {
      "name": "To custom headers",
      "path": "shippedTo.customHeaders[n].value",
      "visibility": "Array non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{shippedTo.customHeaders[n].value} — every entry in array order"
    }
  ]
}
```

Party GSTIN/PAN on shipping blocks is often rendered **without** the `fieldVisibility` gate that §3/§4 apply. Check, and report the inconsistency if present.

## 6. Transport

The whole block is gated by `mapped.visibility.transport` = `hasTransportData()`, which is true if **any** of `transport`, `challanDate`, `challanNumber`, `extraInformation`, `distance`, `vehicleNumber`, `vehicleType`, `transportMode`, `transactionType`, `subSupplyType`, `transporter.name`/`transporterName`, `transporter.transporterId`/`transporterId` has a value. Individual records then guard on their own value.

```json
{
  "group": "6. Transport",
  "fields": [
    {
      "name": "Section header",
      "path": "customLabels.transport",
      "visibility": "mapped.visibility.transport AND {customLabels.transport} non-empty — guarded heading, hidden outright when the override is empty",
      "labelVariable": null,
      "defaultLabel": "Transport Details",
      "valueVariable": "{customLabels.transport}"
    },
    {
      "name": "Transporter Label Text",
      "path": "customLabels.transportName",
      "visibility": "Present — follows the transporter name",
      "labelVariable": null,
      "defaultLabel": "Transport",
      "valueVariable": "{customLabels.transportName}"
    },
    {
      "name": "Transporter",
      "path": "transportDetails.transporter.name, fallback .transporterName",
      "visibility": "Present",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{transportDetails.transporter.name}"
    },
    {
      "name": "Transporter ID",
      "path": "transportDetails.transporter.transporterId, fallback .transporterId",
      "visibility": "Present",
      "labelVariable": "Transporter ID",
      "defaultLabel": null,
      "valueVariable": "{transportDetails.transporter.transporterId}"
    },
    {
      "name": "Challan Number Label Text",
      "path": "customLabels.challanNumber",
      "visibility": "Present — follows {transportDetails.challanNumber}",
      "labelVariable": null,
      "defaultLabel": "Challan Number",
      "valueVariable": "{customLabels.challanNumber}"
    },
    {
      "name": "Challan Number",
      "path": "transportDetails.challanNumber",
      "visibility": "Present",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{transportDetails.challanNumber}"
    },
    {
      "name": "Challan Date Label Text",
      "path": "customLabels.challanDate",
      "visibility": "Present — follows {transportDetails.challanDate}",
      "labelVariable": null,
      "defaultLabel": "Challan Date",
      "valueVariable": "{customLabels.challanDate}"
    },
    {
      "name": "Challan Date",
      "path": "transportDetails.challanDate",
      "visibility": "Present",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{transportDetails.challanDate} shifted by {ownerOffset}"
    },
    {
      "name": "Mode",
      "path": "transportDetails.transportMode",
      "visibility": "Present",
      "labelVariable": "Mode",
      "defaultLabel": null,
      "valueVariable": "{transportDetails.transportMode}"
    },
    {
      "name": "Vehicle Number",
      "path": "transportDetails.vehicleNumber",
      "visibility": "Present",
      "labelVariable": "Vehicle No",
      "defaultLabel": null,
      "valueVariable": "{transportDetails.vehicleNumber}"
    },
    {
      "name": "Vehicle Type",
      "path": "transportDetails.vehicleType",
      "visibility": "Present",
      "labelVariable": "Vehicle Type",
      "defaultLabel": null,
      "valueVariable": "{transportDetails.vehicleType}"
    },
    {
      "name": "Distance",
      "path": "transportDetails.distance",
      "visibility": "Present",
      "labelVariable": "Distance",
      "defaultLabel": null,
      "valueVariable": "{transportDetails.distance}"
    },
    {
      "name": "Transaction Type",
      "path": "transportDetails.transactionType",
      "visibility": "Present",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{transportDetails.transactionType}"
    },
    {
      "name": "Sub Supply Type",
      "path": "transportDetails.subSupplyType",
      "visibility": "Present",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{transportDetails.subSupplyType}"
    },
    {
      "name": "Extra info Label Text",
      "path": "customLabels.transportExtraInfo",
      "visibility": "Present — follows {transportDetails.extraInformation}",
      "labelVariable": null,
      "defaultLabel": "Extra Information",
      "valueVariable": "{customLabels.transportExtraInfo}"
    },
    {
      "name": "Extra info",
      "path": "transportDetails.extraInformation",
      "visibility": "Present",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{transportDetails.extraInformation}"
    }
  ]
}
```

## 7. Line item columns

Columns render in the account's own `columns[]` order. A column is hidden when `column.isHidden` **or** its key-specific rule fails — the rules below are from `normalizeInvoiceColumns`, where `isTaxInvoice` = `invoiceType === "INVOICE"`. Each column is two elements: a header printed once, and a cell printed per item.

```json
{
  "group": "7. Line item columns",
  "fields": [
    {
      "name": "Description Label Text",
      "path": "columns[name].label",
      "visibility": "isHidden false",
      "labelVariable": null,
      "defaultLabel": "Item",
      "valueVariable": "{columns[name].label}"
    },
    {
      "name": "Description",
      "path": "items[n].name",
      "visibility": "isHidden false",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].name}"
    },
    {
      "name": "HSN/SAC Label Text",
      "path": "columns[hsn].label",
      "visibility": "isHidden false AND isTaxInvoice AND owner country IN AND taxType INDIA AND hsnView SPLIT (or DEFAULT on an allow-listed template)",
      "labelVariable": null,
      "defaultLabel": "HSN/SAC",
      "valueVariable": "{columns[hsn].label}"
    },
    {
      "name": "HSN/SAC",
      "path": "items[n].hsn",
      "visibility": "inherits the HSN/SAC column rule",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].hsn}"
    },
    {
      "name": "Classification Label Text",
      "path": "columns[classification].label",
      "visibility": "owner country MY AND same hsnView rule",
      "labelVariable": null,
      "defaultLabel": "Classification",
      "valueVariable": "{columns[classification].label}"
    },
    {
      "name": "Classification",
      "path": "items[n].classification",
      "visibility": "inherits the Classification column rule",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].classification}"
    },
    {
      "name": "MSIC",
      "path": "columns[msic]",
      "visibility": "ALWAYS HIDDEN",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": null
    },
    {
      "name": "GST Rate Label Text",
      "path": "columns[gstRate].label",
      "visibility": "isHidden false AND isTaxInvoice",
      "labelVariable": null,
      "defaultLabel": "GST Rate",
      "valueVariable": "{columns[gstRate].label}"
    },
    {
      "name": "GST Rate",
      "path": "items[n].gstRate",
      "visibility": "inherits the GST Rate column rule",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].gstRate}"
    },
    {
      "name": "Quantity Label Text",
      "path": "columns[quantity].label",
      "visibility": "isHidden false",
      "labelVariable": null,
      "defaultLabel": "Quantity",
      "valueVariable": "{columns[quantity].label}"
    },
    {
      "name": "Quantity",
      "path": "items[n].quantity",
      "visibility": "isHidden false",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].quantity} — unit inline when unitColumn = MERGE_NAME"
    },
    {
      "name": "Rate Label Text",
      "path": "columns[rate].label",
      "visibility": "isHidden false",
      "labelVariable": null,
      "defaultLabel": "Rate",
      "valueVariable": "{columns[rate].label}"
    },
    {
      "name": "Rate",
      "path": "items[n].rate",
      "visibility": "isHidden false",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].rate}"
    },
    {
      "name": "Discount Label Text",
      "path": "columns[discount].label",
      "visibility": "isHidden false AND discountEnabled = {finalTotal.discount}/{finalTotal.totalDiscount} non-zero — NOT per-item discount",
      "labelVariable": null,
      "defaultLabel": "Discount",
      "valueVariable": "{columns[discount].label}"
    },
    {
      "name": "Discount",
      "path": "items[n].discount.amount",
      "visibility": "inherits the Discount column rule",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].discount.amount}, type {items[n].discount.discountType}"
    },
    {
      "name": "Amount Label Text",
      "path": "columns[amount].label",
      "visibility": "isHidden false",
      "labelVariable": null,
      "defaultLabel": "Amount",
      "valueVariable": "{columns[amount].label}"
    },
    {
      "name": "Amount",
      "path": "items[n].amount",
      "visibility": "isHidden false",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].amount} — {columns[amount].formula} is display metadata, the renderer does not compute it"
    },
    {
      "name": "IGST Label Text",
      "path": "columns[igst].label",
      "visibility": "isHidden false AND isTaxInvoice AND ({igst} true OR taxType GLOBAL)",
      "labelVariable": null,
      "defaultLabel": "IGST",
      "valueVariable": "{columns[igst].label}"
    },
    {
      "name": "IGST",
      "path": "items[n].igst",
      "visibility": "inherits the IGST column rule",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].igst}"
    },
    {
      "name": "CGST",
      "path": "items[n].cgst",
      "visibility": "isHidden false AND isTaxInvoice AND {igst} false AND taxType INDIA",
      "labelVariable": "CGST — forced by normalization, {columns[cgst].label} is deliberately ignored because accounts mislabel it",
      "defaultLabel": null,
      "valueVariable": "{items[n].cgst}"
    },
    {
      "name": "SGST / UTGST Label Text",
      "path": "columns[sgst].label",
      "visibility": "same as CGST",
      "labelVariable": null,
      "defaultLabel": "SGST",
      "valueVariable": "UTGST when {utgst} true, otherwise {columns[sgst].label}"
    },
    {
      "name": "SGST / UTGST",
      "path": "items[n].sgst",
      "visibility": "same as CGST",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].sgst}"
    },
    {
      "name": "Total Label Text",
      "path": "columns[total].label",
      "visibility": "isHidden false AND isTaxInvoice",
      "labelVariable": null,
      "defaultLabel": "Total",
      "valueVariable": "{columns[total].label}"
    },
    {
      "name": "Total",
      "path": "items[n].total",
      "visibility": "inherits the Total column rule",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].total}"
    },
    {
      "name": "Thumbnail col",
      "path": "items[n].thumbnail",
      "visibility": "advanceOptions.showThumbnailAsColumn",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].thumbnail}"
    },
    {
      "name": "Item images",
      "path": "items[n].images",
      "visibility": "inline with item",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].images[]}"
    },
    {
      "name": "SKU",
      "path": "items[n].sku",
      "visibility": "advanceOptions.showSkuInInvoice (= mapped.visibility.showSkuInName) AND {items[n].showSku}",
      "labelVariable": "SKU",
      "defaultLabel": null,
      "valueVariable": "{items[n].sku}"
    },
    {
      "name": "Unit",
      "path": "items[n].unit",
      "visibility": "unitColumn MERGE_NAME → mapped.visibility.showUnitInName",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].unit} — resolved via {owner.configuration.units}"
    },
    {
      "name": "Description body",
      "path": "items[n].description",
      "visibility": "showDescriptionFullWidth, legacy alias isDescriptionFullWidth",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].description} — may contain markdown, needs a markdown partial"
    },
    {
      "name": "Inline HSN",
      "path": "items[n].hsn",
      "visibility": "mapped.visibility.showInlineHsn — hsnView MERGE routes HSN into the description cell instead of a column",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].hsn}"
    },
    {
      "name": "Serial numbers",
      "path": "items[n].allocations[].serials",
      "visibility": "advanceOptions.showSerialNumbersInDescription",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].allocations[].serials[]}",
      "unverified": true
    },
    {
      "name": "Batch allocation",
      "path": "items[n].allocations",
      "visibility": "advanceOptions.isBatchRequired AND trackingMethod BATCH",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].allocations[].batch}, {.quantity}",
      "unverified": true
    },
    {
      "name": "Group subtotal",
      "path": "items[n].group",
      "visibility": "advanceOptions.hideGroupSubTotal false",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].group}"
    }
  ]
}
```

## 8. Summarised totals (item-table footer)

The `<tfoot>` summary row **inside** the item table — the one that sits under the last line item and shares its columns. It is not the totals area (§9), and the two are gated by different flags: this row by `showTotalsRow`, the totals area by `hideTotals`. A document can show either, both, or neither.

It summarises only quantity and amount. Every other visible column emits an empty `<td>` purely to keep the columns aligned.

```json
{
  "group": "8. Summarised totals (item-table footer)",
  "fields": [
    {
      "name": "Summary row",
      "path": null,
      "visibility": "showTotalsRow — an opt-in of its own, INDEPENDENT of hideTotals, which gates only the totals area (§9)",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": null
    },
    {
      "name": "Summary row label",
      "path": null,
      "visibility": "showTotalsRow — sits in the description column",
      "labelVariable": "Total",
      "defaultLabel": null,
      "valueVariable": null
    },
    {
      "name": "Quantity total",
      "path": "items[].quantity",
      "visibility": "showTotalsRow AND the quantity column visible",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "sum of {items[n].quantity}, computed in the template — the payload aggregates carry money only, never a unit count"
    },
    {
      "name": "Amount total",
      "path": "finalTotal.subTotal",
      "visibility": "showTotalsRow AND the amount column visible",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{finalTotal.subTotal}"
    },
    {
      "name": "Remaining columns",
      "path": null,
      "visibility": "showTotalsRow",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "empty cell — one blank <td> per remaining visible column, to preserve alignment"
    }
  ]
}
```

**The summary row label is hardcoded and has no key in the payload.** Do not reach for `{customLabels.total}` here: that is the grand-total label of the **totals area** (§9), the row beside the final payable figure. Both happen to read "Total" on a default account, which is exactly why the mix-up survives review — an account that renames its grand total to "Net Payable" would print "Net Payable" under the description column of the item table. When auditing, confirm which of the two elements a `customLabels.total` reference is feeding.

## 9. Totals

The totals area **below** the item table — subtotal, tax rows, round-off, grand total, amount in words. `finalTotal` is the required aggregate; `totals` is optional and may be absent. Prefer `finalTotal.*` and say so if the template reads `totals.*`.

```json
{
  "group": "9. Totals",
  "fields": [
    {
      "name": "Totals breakdown block",
      "path": null,
      "visibility": "hideTotals false (root; advanceOptions.hideTotals also declared — check which the template reads)",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": null
    },
    {
      "name": "Sub Total Label Text",
      "path": "columns[amount].label, or customLabels.subTotal",
      "visibility": "Always",
      "labelVariable": null,
      "defaultLabel": "Sub Total",
      "valueVariable": "{columns[amount].label}, or {customLabels.subTotal}"
    },
    {
      "name": "Sub Total",
      "path": "finalTotal.subTotal",
      "visibility": "Always",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{finalTotal.subTotal}"
    },
    {
      "name": "Discount Label Text",
      "path": "columns[discount].label",
      "visibility": "column discount not hidden (discountEnabled)",
      "labelVariable": null,
      "defaultLabel": "Discount",
      "valueVariable": "{columns[discount].label}"
    },
    {
      "name": "Discount",
      "path": "finalTotal.discount",
      "visibility": "column discount not hidden (discountEnabled)",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{finalTotal.discount}"
    },
    {
      "name": "IGST Label Text",
      "path": "columns[igst].label",
      "visibility": "mapped.visibility.showIgst = {igst} true OR {taxName} != GST",
      "labelVariable": null,
      "defaultLabel": "IGST",
      "valueVariable": "{columns[igst].label}"
    },
    {
      "name": "IGST",
      "path": "finalTotal.igst",
      "visibility": "mapped.visibility.showIgst",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{finalTotal.igst}"
    },
    {
      "name": "CGST Label Text",
      "path": "columns[cgst].label",
      "visibility": "mapped.visibility.showCgstSgst = !showIgst AND {taxName} = GST",
      "labelVariable": null,
      "defaultLabel": "CGST — forced by normalization",
      "valueVariable": "CGST"
    },
    {
      "name": "CGST",
      "path": "finalTotal.cgst",
      "visibility": "mapped.visibility.showCgstSgst",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{finalTotal.cgst}"
    },
    {
      "name": "SGST / UTGST Label Text",
      "path": "columns[sgst].label",
      "visibility": "mapped.visibility.showCgstSgst",
      "labelVariable": null,
      "defaultLabel": "SGST",
      "valueVariable": "UTGST when {utgst} true, otherwise {columns[sgst].label}"
    },
    {
      "name": "SGST / UTGST",
      "path": "finalTotal.sgst",
      "visibility": "mapped.visibility.showCgstSgst",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{finalTotal.sgst}"
    },
    {
      "name": "Cess Label Text",
      "path": "cesses[n].label",
      "visibility": "mapped.visibility.showSummaryCess = some {isApplied} AND a non-zero cess total",
      "labelVariable": null,
      "defaultLabel": "Cess",
      "valueVariable": "{cesses[n].label}"
    },
    {
      "name": "Cess",
      "path": "cesses[n].amount",
      "visibility": "mapped.visibility.showSummaryCess",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{cesses[n].amount}"
    },
    {
      "name": "Additional charges Label Text",
      "path": "additionalCharges[n].label",
      "visibility": "Array non-empty — sits ABOVE the grand total, after the tax rows",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{additionalCharges[n].label} — every entry in array order"
    },
    {
      "name": "Additional charges",
      "path": "additionalCharges[n].amount",
      "visibility": "Array non-empty — sits ABOVE the grand total, after the tax rows",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{additionalCharges[n].amount} × {additionalCharges[n].multiplier} — the amount is stored UNSIGNED, the multiplier carries the sign (-1 = deduction, rendered in parentheses). {amountType} FIXED_AMOUNT vs a percentage variant. Every entry in array order"
    },
    {
      "name": "Round off",
      "path": "finalTotal.totalRoundOff",
      "visibility": "Non-zero",
      "labelVariable": "Round Off",
      "defaultLabel": null,
      "valueVariable": "{finalTotal.totalRoundOff}, {finalTotal.amountRoundOff}"
    },
    {
      "name": "Total Label Text",
      "path": "customLabels.total",
      "visibility": "Always",
      "labelVariable": null,
      "defaultLabel": "Total",
      "valueVariable": "{customLabels.total} ({currency}) — the currency code is appended in parentheses"
    },
    {
      "name": "Total",
      "path": "finalTotal.total",
      "visibility": "Always",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{finalTotal.total}"
    },
    {
      "name": "Total in words Label Text",
      "path": "customLabels.totalInWords",
      "visibility": "hideTotalInWords false AND {customLabels.totalInWordsValue} non-empty AND {customLabels.totalInWords} non-empty — guarded, hidden outright when the override is empty",
      "labelVariable": null,
      "defaultLabel": "IN WORDS",
      "valueVariable": "{customLabels.totalInWords}"
    },
    {
      "name": "Total in words",
      "path": "customLabels.totalInWordsValue",
      "visibility": "hideTotalInWords false AND value non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{customLabels.totalInWordsValue}"
    },
    {
      "name": "Extra total fields Label Text",
      "path": "extraTotalFields[n].label",
      "visibility": "Array non-empty — sits BELOW the grand total, above the settlement rows",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{extraTotalFields[n].label} — bold; every entry in array order"
    },
    {
      "name": "Extra total fields",
      "path": "extraTotalFields[n].value",
      "visibility": "Array non-empty — sits BELOW the grand total, above the settlement rows",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{extraTotalFields[n].value} — FREE TEXT, not a money figure: do NOT pass it through formatCurrency. Every entry in array order"
    },
    {
      "name": "Late payment fee",
      "path": "latePaymentFee.finalAmount",
      "visibility": "{latePaymentFee.enabled} AND {.showInInvoice} AND {.isApplied}",
      "labelVariable": "Late Payment Fee",
      "defaultLabel": null,
      "valueVariable": "{latePaymentFee.finalAmount}"
    },
    {
      "name": "TDS Amount Withheld",
      "path": "balance.tds",
      "visibility": "{balance.tds} exists — settlement row, sits BELOW the grand total",
      "labelVariable": "TDS Amount Withheld",
      "defaultLabel": null,
      "valueVariable": "{balance.tds} — rendered as a deduction: ($1,000.0000)"
    },
    {
      "name": "Amount Paid",
      "path": "DERIVED: balance.paid + balance.transactionCharge",
      "visibility": "{balance.paid} exists — settlement row, sits BELOW the grand total",
      "labelVariable": "Amount Paid",
      "defaultLabel": null,
      "valueVariable": "sum of {balance.paid} + {balance.transactionCharge} — NOT a payload field; rendered as a deduction: ($205.0000)"
    },
    {
      "name": "Amount Received",
      "path": "balance.paid",
      "visibility": "{balance.paid} exists — indented child row, smaller and lighter",
      "labelVariable": "Amount Received",
      "defaultLabel": null,
      "valueVariable": "{balance.paid} — positive, not parenthesised"
    },
    {
      "name": "Transaction Charge",
      "path": "balance.transactionCharge",
      "visibility": "{balance.transactionCharge} exists — indented child row, smaller and lighter",
      "labelVariable": "Transaction Charge",
      "defaultLabel": null,
      "valueVariable": "{balance.transactionCharge} — positive, not parenthesised"
    },
    {
      "name": "Due amount Label Text",
      "path": "customLabels.dueAmount",
      "visibility": "{balance.due} > 0 — settlement row, absent when fully settled",
      "labelVariable": null,
      "defaultLabel": "Due Amount",
      "valueVariable": "{customLabels.dueAmount}"
    },
    {
      "name": "Due amount",
      "path": "balance.due",
      "visibility": "{balance.due} > 0",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{balance.due}"
    },
    {
      "name": "Credit",
      "path": "balance.credit",
      "visibility": "Non-zero — settlement row",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{balance.credit}"
    }
  ]
}
```

### Row order

The block is three bands separated by the grand total. Audit them in this order — a record in the wrong band is a real defect, not a cosmetic one:

```
  Amount                          columns[amount].label + finalTotal.subTotal
  IGST (18%)                      tax rows — showIgst / showCgstSgst
  Discounts            ($20.00)   additionalCharges[] — signed by multiplier
  Extra Charges         $10.00
  Shipping Fee          $50.00
  Round Off                       finalTotal.totalRoundOff
  ──────────────────────────────
  Total (USD)        $1,220.00    customLabels.total + (currency)
  ──────────────────────────────
  Company's DL NO.   Custom …     extraTotalFields[] — free text, bold label
  TDS Amount Withheld  ($1,000)   ┐
  Amount Paid           ($205)    │ settlement — balance.*
     Amount Received     $200     │
     Transaction Charge    $5     │
  Due Amount             $15      ┘
```

`Total in words` is not in this box at all — it is a sibling element rendered to its left.

**`additionalCharges` sit above the grand total and are part of the arithmetic.** `subTotal + tax + Σ(amount × multiplier) = finalTotal.total`. Omitting them leaves the printed total underivable from the printed rows — on the reference document, `1000 + 180 = 1180` against a stated total of `1220`.

**`extraTotalFields` sit below the grand total and are not arithmetic at all** — arbitrary label/value text pairs (`"Company's DL NO." = "Custom Field Value"`), bold label, plain value. Never format them as currency.

### The settlement rows

`balance.*` renders as a distinct group **below** the grand total, visually separated from the rows above it. Do not audit these as ordinary total lines:

- **The deductions are drawn in accounting parentheses** — `TDS Amount Withheld` and `Amount Paid` print as `($1,000.0000)` and `($205.0000)`. **`Due Amount` is not a deduction**: it prints positive and unparenthesised (`$15.0000`), as do both child rows. A record whose `valueVariable` is a `balance.*` figure is not simply "the number formatted".
- **`Amount Paid` is derived, not a field.** It is `balance.paid + balance.transactionCharge`, with the two components repeated beneath it as indented child rows (`Amount Received`, `Transaction Charge`) in smaller, lighter type. There is no payload key holding 205.
- **Their labels are hardcoded, not `customLabels`.** `TDS Amount Withheld`, `Amount Paid`, `Amount Received` and `Transaction Charge` are all fixed strings in the markup. A payload carrying `customLabels.paidAmount: "Paid Amount"` still renders `Amount Paid`, and `TDS Amount Withheld` has no `customLabels` key at all. Only `Due Amount` reads its override (`customLabels.dueAmount`).
- **Every row gates independently on its own `balance.*` key existing** — not on `paymentOptions.meta.allowTDS`, not on the derived sum, and the child rows do not inherit from `Amount Paid`:

| Row | Gate |
|---|---|
| TDS Amount Withheld | `balance.tds` exists |
| Amount Paid | `balance.paid` exists |
| Amount Received | `balance.paid` exists |
| Transaction Charge | `balance.transactionCharge` exists |
| Due Amount | `balance.due` > 0 |

  So a payment recorded with no transaction charge shows `Amount Paid` and `Amount Received` but drops `Transaction Charge`, and a fully-settled document drops the Due row.

### Composed labels

Two rows in this block build their label from more than one source — an audit that reports only the base key is incomplete:

| Row | Renders | Composed from |
|---|---|---|
| Tax row | `IGST (18%)` | `{columns[igst].label}` + the tax rate in parentheses |
| Grand total | `Total (USD)` | `{customLabels.total}` + `{currency}` in parentheses |

### Decimal places

`{subUnitLength}` sets the fraction digits and is frequently **not** 2 — a document with `subUnitLength: 4` prints `$1,000.0000` throughout. Read it from the payload rather than assuming currency defaults, and pass it to `formatCurrency` positionally.

## 10. Summary blocks

Each summary needs **both** a configuration opt-in and rows to put in it — configuration alone renders a bare header strip.

```json
{
  "group": "10. Summary blocks",
  "fields": [
    {
      "name": "Tax Summary",
      "path": "taxSummary.taxList",
      "visibility": "mapped.visibility.showTaxTable = advanceOptions.taxSummaryView in TABLE/BOTH AND list non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{taxSummary.taxList[n].taxableValue}, {.cgst}, {.sgst}, {.igst}, {.utgst}, {.cessAmount}"
    },
    {
      "name": "HSN Summary",
      "path": "hsnSummary.hsnList",
      "visibility": "mapped.visibility.showHsnSummary = advanceOptions.showHSNSummaryInInvoice (bridge alias showHsnSummary) AND list non-empty",
      "labelVariable": "HSN Summary",
      "defaultLabel": null,
      "valueVariable": "{hsnSummary.hsnList[n].hsn} + the TaxSummary fields, grouped per {hsnView}"
    },
    {
      "name": "Stock Summary",
      "path": "batchSummary[]",
      "visibility": "advanceOptions.showStockSummary AND array non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{batchSummary[n]} — columns per {defaultBatchColumns}"
    },
    {
      "name": "Payments table Label Text",
      "path": "customLabels.paymentRecord",
      "visibility": "mapped.visibility.showPaymentsTable = showPaymentsTable AND allPayments non-empty",
      "labelVariable": null,
      "defaultLabel": "Payment Record",
      "valueVariable": "{customLabels.paymentRecord}"
    },
    {
      "name": "Payments table",
      "path": "allPayments[], fallback payments[]",
      "visibility": "mapped.visibility.showPaymentsTable",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{allPayments[n].paymentDate}, {.paymentMethod}, {.amount}"
    },
    {
      "name": "Details block heading",
      "path": "customLabels.invoiceDetails",
      "visibility": "{customLabels.invoiceDetails} non-empty — guarded heading, hidden outright when the override is empty",
      "labelVariable": null,
      "defaultLabel": "Invoice Details",
      "valueVariable": "{customLabels.invoiceDetails}"
    }
  ]
}
```

`taxSummary`/`hsnSummary` arrive either as a flat array or nested under `taxList`/`hsnList`; normalization handles both, so audit the nested form.

## 11. Payment info

```json
{
  "group": "11. Payment info",
  "fields": [
    {
      "name": "Bank + UPI section",
      "path": null,
      "visibility": "mapped.visibility.showBankUpiSection = billType not in CREDITNOTE/DEBITNOTE AND status != CANCELED AND (bank or UPI shown)",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": null
    },
    {
      "name": "Bank account",
      "path": "bankAccount",
      "visibility": "mapped.visibility.showBankAccount = (not expenditure, or invoiceAccepted ACCEPTED) AND paymentOptions.accountTransfer AND {accountNo} present",
      "labelVariable": "Bank Details",
      "defaultLabel": null,
      "valueVariable": "{bankAccount.bankName}, {.accountHolderName}, {.accountNo}, {.ifsc}, {.accountType}"
    },
    {
      "name": "UPI",
      "path": "mapped.upi.id",
      "visibility": "mapped.visibility.showUpi = same expenditure gate AND paymentOptions.upi AND id present",
      "labelVariable": "UPI",
      "defaultLabel": null,
      "valueVariable": "{upi.upi} / {upi.vpa} / {upi.upiId} — QR from {upi.qr}/{upi.qrCode}/{bankAccount.qrCode}, else built from the id"
    },
    {
      "name": "Online payment CTA",
      "path": null,
      "visibility": "onlinePaymentsEnabled AND domesticPaymentDisabled",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{paymentOptions}",
      "unverified": true
    },
    {
      "name": "Partial payment",
      "path": null,
      "visibility": "paymentOptions.meta.allowPartialPayment",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": null,
      "unverified": true
    }
  ]
}
```

`bankName` and `accountHolderName` are the contract keys. Payloads frequently carry `bank` and `name` instead — templates reading the contract names then render blank rows. Always check both. `template.upiShrink` is layout, not visibility.

## 12. Footer

```json
{
  "group": "12. Footer",
  "fields": [
    {
      "name": "Terms Label Text",
      "path": "terms[g].label, else customLabels.terms",
      "visibility": "per group, {terms[g].terms} non-empty",
      "labelVariable": null,
      "defaultLabel": "Terms and Conditions",
      "valueVariable": "{terms[g].label}, else {customLabels.terms}"
    },
    {
      "name": "Terms",
      "path": "terms[g].terms[n]",
      "visibility": "per group, {terms[g].terms} non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{terms[g].terms[n]} — every group and every clause in array order"
    },
    {
      "name": "Notes Label Text",
      "path": "customLabels.notes",
      "visibility": "{notes} non-empty AND {customLabels.notes} non-empty — guarded heading, hidden outright when the override is empty",
      "labelVariable": null,
      "defaultLabel": "Notes",
      "valueVariable": "{customLabels.notes}"
    },
    {
      "name": "Notes",
      "path": "notes",
      "visibility": "Non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{notes} — may contain markdown"
    },
    {
      "name": "Attachments Label Text",
      "path": "customLabels.attachment",
      "visibility": "Array non-empty AND {customLabels.attachment} non-empty — guarded heading, hidden outright when the override is empty",
      "labelVariable": null,
      "defaultLabel": "Attachments",
      "valueVariable": "{customLabels.attachment}"
    },
    {
      "name": "Attachments",
      "path": "attachments[n]",
      "visibility": "Array non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{attachments[n]} — display name derived from the URL filename"
    },
    {
      "name": "Signature Label Text",
      "path": "customLabels.signature",
      "visibility": "signature image present AND {customLabels.signature} non-empty — guarded heading, hidden outright when the override is empty",
      "labelVariable": null,
      "defaultLabel": "Authorized Signatory",
      "valueVariable": "{customLabels.signature}"
    },
    {
      "name": "Signature",
      "path": "signature, fallback billedBy.signature",
      "visibility": "Non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{signature}"
    },
    {
      "name": "Contact line Label Text",
      "path": "customLabels.contact, .contactEmail, .contactPhone",
      "visibility": "mapped.visibility.contactStrip",
      "labelVariable": null,
      "defaultLabel": "For any enquiry, reach out via",
      "valueVariable": "{customLabels.contact}, {customLabels.contactEmail}, {customLabels.contactPhone}"
    },
    {
      "name": "Contact line",
      "path": "contact.*",
      "visibility": "mapped.visibility.contactStrip = {contact.email} or {contact.phone} present",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{contact.email}, {contact.phone}"
    },
    {
      "name": "Custom footers Label Text",
      "path": "customFooters[n].label",
      "visibility": "Array non-empty, per-entry {value} non-empty",
      "labelVariable": null,
      "defaultLabel": "{customFooters[n].defaultValue}",
      "valueVariable": "{customFooters[n].label} — every entry in array order"
    },
    {
      "name": "Custom footers",
      "path": "customFooters[n].value",
      "visibility": "Array non-empty, per-entry {value} non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{customFooters[n].value} — every entry in array order"
    },
    {
      "name": "Footers Label Text",
      "path": "footers[n].label",
      "visibility": "Array non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{footers[n].label} — every entry in array order"
    },
    {
      "name": "Footers",
      "path": "footers[n].value",
      "visibility": "Array non-empty",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{footers[n].value} — every entry in array order"
    },
    {
      "name": "Created by",
      "path": "creator.name",
      "visibility": "advanceOptions.showCreatorInInvoice",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{creator.name}",
      "unverified": true
    }
  ]
}
```

## Reporting payload defects

Keep defects in the audited *data* separate from render rules — a record describes what the template does, a defect describes what this document happens to contain. Put them in a closing section and say whether the renderer neutralises each one. Recurring kinds:

- **A column label that contradicts its key** (`columns[cgst].label` = "IGST"). The renderer forces `CGST`/`UTGST`, so this does **not** reach the page — report it as bad stored config, not a render bug.
- **A total populated against its own flag** (`finalTotal.igst` non-zero while `igst` is false and the HSN summary shows zero IGST; or `finalTotal.cgst`/`sgst` populated on a `GLOBAL` document). Read `mapped.visibility.showIgst` / `showCgstSgst`, never the presence of a total.
- **A stale `customLabels.taxName`** disagreeing with `invoice.taxName` (`"GST"` stored against a `"VAT"` document). No render consequence — totals rows label from `mapped.columns` — so report it as config drift, not a broken label.
- **Identifier inconsistencies** — a GSTIN state prefix disagreeing with `gstState`, a short `pincode`. These surface as IRN/e-invoice errors, not render errors.
- **Markdown inside a value** (an item `description` holding a table). Renders as raw pipes unless the template pipes it through the markdown partial.
- **Unresolvable lookup keys** — a custom `unit` key that must resolve through `owner.configuration.units`; the raw key prints if the resolver misses.
- **Secrets in the payload** (`owner.einvoice.password` in plain text). Report, do not echo the value.
- **A missing flag is not `false`.** If `owner.configuration.experimental` carries no `fieldVisibility`, GSTIN/PAN have no stored value — the opt-out convention means they show. Say "not set → default" rather than "hidden".
- **Template-side, not payload: unformatted tax columns.** When `gstRate`/`igst`/`cgst`/`sgst`/`total` are visible but the item-cell `switch` has no case for them, they fall to the generic fallback and print as raw numbers with no currency or `%`. See *Taxation paths* — it only surfaces on documents where the tax columns are actually shown, which in practice means the global path. Report it separately from data defects: this one is a template bug and the payload is correct.
- **Empty `customLabels` overrides.** These are Label Text records whose variable resolves to `""`. List them separately — "falls back to default" is only true where the markup supplies one:

```json
{
  "group": "Empty label overrides",
  "fields": [
    {
      "key": "billedTo",
      "field": "Billed To header",
      "rendered": "guarded heading → nothing renders"
    },
    {
      "key": "shippedFrom",
      "field": "Shipped From header",
      "rendered": "guarded heading → nothing renders"
    },
    {
      "key": "total",
      "field": "Grand total row",
      "rendered": "unguarded → blank label"
    }
  ]
}
```
