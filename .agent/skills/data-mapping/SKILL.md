---
name: data-mapping
description: Audit a real Ceres payload against an existing template and produce a field-by-field mapping (name, path, visibility, label variable, default label, value variable). Use when the user pastes an invoice/document JSON and asks what renders, which flag controls a section, where a label comes from, why a field is missing or blank, or wants a mapping/coverage report for a template.
---

# Data Mapping

Given a payload JSON and a template, produce a record per field that answers: **what is it, where does it come from, what makes it appear, what label prints, and what value prints for this document.**

## What this covers vs. other skills

- **This skill**: payload → audit. A template already exists; you are explaining or verifying what it does with real data.
- `ceres-template-data-contract`: design → template. Use that when the template does not exist yet and you are mapping a screenshot to contract fields.
- `data-binding-tests`: turning a confirmed mapping into Jest assertions. Use that after this skill when the user wants the mapping locked in.

## Read these, in this order

1. `src/templates/<name>/template.hbs` — the only authority on what renders. Never infer output from the payload alone.
2. `src/templates/<name>/helpers.ts` — template-local helpers that gate or transform values (`partyFields`, `itemTableColumns`, `computePrintStatus`, …).
3. `src/main/invoiceTemplateNormalization.ts` — resolves every `mapped.*` and `derived.*` value. A `mapped.visibility.x` in the markup is **never** a payload field; trace it to its expression here.
4. `src/main/invoicePayloadContract.ts` — only when a payload key's meaning is unclear.

## Resolving each key

### path

Report the path the **template** reads, not the nearest-looking payload key. When they differ, that is a finding — see Traps below. For normalized values, give both: `mapped.visibility.shippedTo` (= `shippedTo.name` non-empty).

### visibility

Visibility is layered. Walk outward from the field and report **every** gate, with the outermost first:

| Layer | Example |
|---|---|
| Section flag in `mapped.visibility.*` | `showBankUpiSection`, `shippedFrom`, `showHsnSummary` |
| Document-level opt-out | `invoice.hideTotals`, `invoice.hideTotalInWords`, `invoice.showTotalsRow` |
| Business-wide toggle | `owner.configuration.experimental.fieldVisibility.<key>.showInDocument` |
| Per-record opt-out | `billedTo.emailShowInInvoice`, `params.showInInvoice`, `showInInvoice` |
| Column rule | `column.isHidden` OR the key's `visible` rule in `normalizeInvoiceColumns` |
| Markup guard | `{{#if}}` / `{{#unless}}` on the value itself |

Resolve each gate against **this** payload and state the outcome (`shown` / `hidden` / which layer killed it). A field can be present in the JSON and still not print.

Two conventions that are easy to get backwards:

- **Opt-out flags** (`emailShowInInvoice`, `phoneShowInInvoice`, `params.showInInvoice`, `fieldVisibility.*.showInDocument`) hide **only** on an explicit `false`. Absent means shown.
- **Visibility never keys off a non-zero value.** A zero-rated tax row still prints if its flag says so. Do not report "hidden because the amount is 0" unless the code actually tests the amount.

### labelVariable vs defaultLabel

Report where the printed string comes from:

- `customLabels.<key>` — the account's own wording. Put the braced path in `labelVariable` and the fallback string in `defaultLabel`.
- `column.label` — item-table and totals headings, passed through `normalizeInvoiceColumns`.
- **hardcoded in markup** — a plain unbraced string in `labelVariable` with `defaultLabel: null`. This is a finding whenever a `customLabels` key for that row exists in the payload but goes unread.
- **forced by normalization** — `cgst` always prints `CGST`; `sgst` prints `UTGST` when `invoice.utgst` is true, otherwise `column.label`. The account's own `column.label` is deliberately ignored here, so flag it when the payload disagrees.

An empty-string `customLabels` value is not a fallback — `{{#if}}`-guarded headings vanish, unguarded ones print blank. Call both out.

### valueVariable

The value **as printed**, not the raw JSON: dates through `formateShortDateWithOffset` (apply `ownerOffset` — a UTC timestamp near midnight shifts the day), currency through `formatCurrency`, phones through `formatPhone`, quantities through `formatQty` (`100 (BAG)`). For repeating blocks give the per-row values or a count. Write `absent → hidden` when the path has no value.

## Traps that produce silent blanks

Check each of these before reporting; they were all real in production payloads:

- **Key-name mismatch.** The template reads `bankAccount.bankName` / `accountHolderName`; payloads often carry `bank` / `name`. The row renders as nothing. Grep the payload for a near-miss key before writing "absent".
- **Empty `customLabels`.** `total`, `billedTo`, `shippedFrom` commonly arrive as `""`. Guarded headings disappear; the grand-total label prints blank.
- **`hsnView: "MERGE"`** hides the whole `hsn` column (`showHsnColumn` needs `SPLIT`, or `DEFAULT` on an allow-listed template) and routes HSN inline instead.
- **`invoiceType !== "INVOICE"`** hides every tax column, `gstRate`, and `total` via `isTaxInvoice`. Quotations lose them all.
- **`discount` column** is gated on `finalTotal.discount` being non-zero, not on per-item discounts.
- **Payload data the template never reads.** Sweep for top-level arrays/objects with no `{{ }}` reference — `extraTotalFields`, `billedBy`, item `thumbnail` when `advanceOptions.showThumbnailAsColumn` is true. List these; they are usually the actual bug.

## Output

Emit one JSON array per document-section group, in template order (header/meta → parties → logistics → item table → totals → footer blocks), using the schema in the reference below. Drop groups the template does not render. Use a markdown table instead only if the user asks for one.

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
  "group": "3. Billed By",
  "fields": [
    {
      "name": "GSTIN",
      "path": "billedBy.gstin",
      "visibility": "owner.configuration.experimental.fieldVisibility.gst.showInDocument — opt-out, hides only on explicit false",
      "labelVariable": "GSTIN",
      "defaultLabel": null,
      "valueVariable": "{billedBy.gstin}"
    }
  ]
}
```

- Every field renders as two elements, a label and a value, and both are variables. `name` is a documentation identifier for locating the record — it is never rendered.
- Values written as `{path}` name a variable to resolve at render time and must never be printed literally.
- A path containing `[n]` is an array: iterate it and render every entry in array order, never a fixed number of entries.
- A **plain unbraced string** in `labelVariable` is a hardcoded constant in the markup; its `defaultLabel` is `null`. Whenever a `customLabels` key exists for that record, a hardcoded label is a finding.
- `defaultLabel` is what prints when the override resolves empty — but only where the markup actually supplies a fallback. A `{{#if}}`-guarded heading with an empty override renders *nothing*, and an unguarded one renders *blank*. Say which.
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
      "name": "Invoice Number",
      "path": "invoiceNumber",
      "visibility": "Always",
      "labelVariable": "{customLabels.invoiceNumber}",
      "defaultLabel": "Invoice No",
      "valueVariable": "{invoiceNumber} — # per {hideHashInDocumentNumber}"
    },
    {
      "name": "Invoice Date",
      "path": "invoiceDate",
      "visibility": "Always",
      "labelVariable": "{customLabels.invoiceDate}",
      "defaultLabel": "Invoice Date",
      "valueVariable": "{invoiceDateUserInput}, fallback {invoiceDate} shifted by {ownerOffset}"
    },
    {
      "name": "Due Date",
      "path": "dueDate",
      "visibility": "Present",
      "labelVariable": "{customLabels.dueDate}",
      "defaultLabel": "Due Date",
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
      "name": "Custom headers",
      "path": "customHeaders[]",
      "visibility": "Array non-empty, per-entry {value} non-empty",
      "labelVariable": "{customHeaders[n].label}",
      "defaultLabel": null,
      "valueVariable": "{customHeaders[n].value} — every entry in array order"
    },
    {
      "name": "Document custom fields",
      "path": "customFields[]",
      "visibility": "Array non-empty",
      "labelVariable": "{customFields[n].label}",
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
      "path": null,
      "visibility": "Always",
      "labelVariable": "{customLabels.billedBy}",
      "defaultLabel": "Billed By",
      "valueVariable": null
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
      "name": "VAT Number",
      "path": "billedBy.vatNumber",
      "visibility": "Non-empty",
      "labelVariable": "{billedBy.vatLabel}",
      "defaultLabel": "VAT Number",
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
      "name": "Custom fields",
      "path": "billedBy.customFields[]",
      "visibility": "{params.showInInvoice} per entry — opt-out",
      "labelVariable": "{billedBy.customFields[n].label}, fallback {.name}",
      "defaultLabel": null,
      "valueVariable": "{billedBy.customFields[n].value} — every entry in array order"
    },
    {
      "name": "Additional IDs",
      "path": "billedBy.additionalIds[]",
      "visibility": "{showInInvoice} per entry — opt-out",
      "labelVariable": "{billedBy.additionalIds[n].label}",
      "defaultLabel": null,
      "valueVariable": "{billedBy.additionalIds[n].value} — every entry in array order"
    },
    {
      "name": "Party custom headers",
      "path": "billedBy.customHeaders[]",
      "visibility": "{showInInvoice} per entry — opt-out",
      "labelVariable": "{billedBy.customHeaders[n].label}",
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
      "path": null,
      "visibility": "Always",
      "labelVariable": "{customLabels.billedTo}",
      "defaultLabel": "Billed To",
      "valueVariable": null
    },
    {
      "name": "Contact person",
      "path": "billedTo.contactPerson.name",
      "visibility": "Non-empty",
      "labelVariable": "{customLabels.contactPersonLabel}",
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
      "name": "Shipped From block",
      "path": "shippedFrom",
      "visibility": "mapped.visibility.shippedFrom = {shippedFrom.name} non-empty — NOT object presence",
      "labelVariable": "{customLabels.shippedFrom}",
      "defaultLabel": "Shipped From",
      "valueVariable": null
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
      "name": "From custom headers",
      "path": "shippedFrom.customHeaders[]",
      "visibility": "Array non-empty",
      "labelVariable": "{shippedFrom.customHeaders[n].label}",
      "defaultLabel": null,
      "valueVariable": "{shippedFrom.customHeaders[n].value} — every entry in array order"
    },
    {
      "name": "Shipped To block",
      "path": "shippedTo",
      "visibility": "mapped.visibility.shippedTo = {shippedTo.name} non-empty",
      "labelVariable": "{customLabels.shippedTo}",
      "defaultLabel": "Shipped To",
      "valueVariable": null
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
      "name": "To custom headers",
      "path": "shippedTo.customHeaders[]",
      "visibility": "Array non-empty",
      "labelVariable": "{shippedTo.customHeaders[n].label}",
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
      "path": "transportDetails",
      "visibility": "mapped.visibility.transport",
      "labelVariable": "{customLabels.transport}",
      "defaultLabel": "Transport Details",
      "valueVariable": null
    },
    {
      "name": "Transporter",
      "path": "transportDetails.transporter.name, fallback .transporterName",
      "visibility": "Present",
      "labelVariable": "{customLabels.transportName}",
      "defaultLabel": "Transport",
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
      "name": "Challan Number",
      "path": "transportDetails.challanNumber",
      "visibility": "Present",
      "labelVariable": "{customLabels.challanNumber}",
      "defaultLabel": "Challan Number",
      "valueVariable": "{transportDetails.challanNumber}"
    },
    {
      "name": "Challan Date",
      "path": "transportDetails.challanDate",
      "visibility": "Present",
      "labelVariable": "{customLabels.challanDate}",
      "defaultLabel": "Challan Date",
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
      "name": "Extra info",
      "path": "transportDetails.extraInformation",
      "visibility": "Present",
      "labelVariable": "{customLabels.transportExtraInfo}",
      "defaultLabel": "Extra Information",
      "valueVariable": "{transportDetails.extraInformation}"
    }
  ]
}
```

## 7. Line item columns

Columns render in the account's own `columns[]` order. A column is hidden when `column.isHidden` **or** its key-specific rule fails — the rules below are from `normalizeInvoiceColumns`, where `isTaxInvoice` = `invoiceType === "INVOICE"`.

```json
{
  "group": "7. Line item columns",
  "fields": [
    {
      "name": "Description",
      "path": "columns[name]",
      "visibility": "isHidden false",
      "labelVariable": "{columns[name].label}",
      "defaultLabel": "Item",
      "valueVariable": "{items[n].name}"
    },
    {
      "name": "HSN/SAC",
      "path": "columns[hsn]",
      "visibility": "isHidden false AND isTaxInvoice AND owner country IN AND taxType INDIA AND hsnView SPLIT (or DEFAULT on an allow-listed template)",
      "labelVariable": "{columns[hsn].label}",
      "defaultLabel": "HSN/SAC",
      "valueVariable": "{items[n].hsn}"
    },
    {
      "name": "Classification",
      "path": "columns[classification]",
      "visibility": "owner country MY AND same hsnView rule",
      "labelVariable": "{columns[classification].label}",
      "defaultLabel": "Classification",
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
      "name": "GST Rate",
      "path": "columns[gstRate]",
      "visibility": "isHidden false AND isTaxInvoice",
      "labelVariable": "{columns[gstRate].label}",
      "defaultLabel": "GST Rate",
      "valueVariable": "{items[n].gstRate}"
    },
    {
      "name": "Quantity",
      "path": "columns[quantity]",
      "visibility": "isHidden false",
      "labelVariable": "{columns[quantity].label}",
      "defaultLabel": "Quantity",
      "valueVariable": "{items[n].quantity} — unit inline when unitColumn = MERGE_NAME"
    },
    {
      "name": "Rate",
      "path": "columns[rate]",
      "visibility": "isHidden false",
      "labelVariable": "{columns[rate].label}",
      "defaultLabel": "Rate",
      "valueVariable": "{items[n].rate}"
    },
    {
      "name": "Discount",
      "path": "columns[discount]",
      "visibility": "isHidden false AND discountEnabled = {finalTotal.discount}/{finalTotal.totalDiscount} non-zero — NOT per-item discount",
      "labelVariable": "{columns[discount].label}",
      "defaultLabel": "Discount",
      "valueVariable": "{items[n].discount.amount}, type {items[n].discount.discountType}"
    },
    {
      "name": "Amount",
      "path": "columns[amount]",
      "visibility": "isHidden false",
      "labelVariable": "{columns[amount].label}",
      "defaultLabel": "Amount",
      "valueVariable": "{items[n].amount} — {columns[amount].formula} is display metadata, the renderer does not compute it"
    },
    {
      "name": "IGST",
      "path": "columns[igst]",
      "visibility": "isHidden false AND isTaxInvoice AND ({igst} true OR taxType GLOBAL)",
      "labelVariable": "{columns[igst].label}",
      "defaultLabel": "IGST",
      "valueVariable": "{items[n].igst}"
    },
    {
      "name": "CGST",
      "path": "columns[cgst]",
      "visibility": "isHidden false AND isTaxInvoice AND {igst} false AND taxType INDIA",
      "labelVariable": "CGST — forced by normalization, {columns[cgst].label} is deliberately ignored because accounts mislabel it",
      "defaultLabel": null,
      "valueVariable": "{items[n].cgst}"
    },
    {
      "name": "SGST / UTGST",
      "path": "columns[sgst]",
      "visibility": "same as CGST",
      "labelVariable": "UTGST when {utgst} true, otherwise {columns[sgst].label}",
      "defaultLabel": "SGST",
      "valueVariable": "{items[n].sgst}"
    },
    {
      "name": "Total",
      "path": "columns[total]",
      "visibility": "isHidden false AND isTaxInvoice",
      "labelVariable": "{columns[total].label}",
      "defaultLabel": "Total",
      "valueVariable": "{items[n].total}"
    },
    {
      "name": "Thumbnail col",
      "path": "items[].thumbnail",
      "visibility": "advanceOptions.showThumbnailAsColumn",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].thumbnail}"
    },
    {
      "name": "Item images",
      "path": "items[].images",
      "visibility": "inline with item",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].images[]}"
    },
    {
      "name": "SKU",
      "path": "items[].sku",
      "visibility": "advanceOptions.showSkuInInvoice (= mapped.visibility.showSkuInName) AND {items[n].showSku}",
      "labelVariable": "SKU",
      "defaultLabel": null,
      "valueVariable": "{items[n].sku}"
    },
    {
      "name": "Unit",
      "path": "items[].unit",
      "visibility": "unitColumn MERGE_NAME → mapped.visibility.showUnitInName",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].unit} — resolved via {owner.configuration.units}"
    },
    {
      "name": "Description body",
      "path": "items[].description",
      "visibility": "showDescriptionFullWidth, legacy alias isDescriptionFullWidth",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].description} — may contain markdown, needs a markdown partial"
    },
    {
      "name": "Inline HSN",
      "path": "items[].hsn",
      "visibility": "mapped.visibility.showInlineHsn — hsnView MERGE routes HSN into the description cell instead of a column",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].hsn}"
    },
    {
      "name": "Serial numbers",
      "path": "items[].allocations[].serials",
      "visibility": "advanceOptions.showSerialNumbersInDescription",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].allocations[].serials[]}",
      "unverified": true
    },
    {
      "name": "Batch allocation",
      "path": "items[].allocations",
      "visibility": "advanceOptions.isBatchRequired AND trackingMethod BATCH",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].allocations[].batch}, {.quantity}",
      "unverified": true
    },
    {
      "name": "Group subtotal",
      "path": "items[].group",
      "visibility": "advanceOptions.hideGroupSubTotal false",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{items[n].group}"
    }
  ]
}
```

## 8. Totals

`finalTotal` is the required aggregate; `totals` is optional and may be absent. Prefer `finalTotal.*` and say so if the template reads `totals.*`.

```json
{
  "group": "8. Totals",
  "fields": [
    {
      "name": "Item-table totals row",
      "path": null,
      "visibility": "showTotalsRow — INDEPENDENT of hideTotals, which gates only the breakdown below",
      "labelVariable": "{customLabels.total}",
      "defaultLabel": "Total",
      "valueVariable": "{finalTotal.subTotal} — quantity summed from {items[].quantity}, aggregates carry no unit count"
    },
    {
      "name": "Totals breakdown block",
      "path": null,
      "visibility": "hideTotals false (root; advanceOptions.hideTotals also declared — check which the template reads)",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": null
    },
    {
      "name": "Sub Total",
      "path": "finalTotal.subTotal",
      "visibility": "Always",
      "labelVariable": "{columns[amount].label}, or {customLabels.subTotal}",
      "defaultLabel": "Sub Total",
      "valueVariable": "{finalTotal.subTotal}"
    },
    {
      "name": "Discount",
      "path": "finalTotal.discount",
      "visibility": "column discount not hidden (discountEnabled)",
      "labelVariable": "{columns[discount].label}",
      "defaultLabel": "Discount",
      "valueVariable": "{finalTotal.discount}"
    },
    {
      "name": "IGST",
      "path": "finalTotal.igst",
      "visibility": "mapped.visibility.showIgst = {igst} true OR {taxName} != GST",
      "labelVariable": "{columns[igst].label}",
      "defaultLabel": "IGST",
      "valueVariable": "{finalTotal.igst}"
    },
    {
      "name": "CGST",
      "path": "finalTotal.cgst",
      "visibility": "mapped.visibility.showCgstSgst = !showIgst AND {taxName} = GST",
      "labelVariable": "{columns[cgst].label} — forced CGST",
      "defaultLabel": "CGST",
      "valueVariable": "{finalTotal.cgst}"
    },
    {
      "name": "SGST / UTGST",
      "path": "finalTotal.sgst",
      "visibility": "same as CGST",
      "labelVariable": "{columns[sgst].label} — UTGST when {utgst}",
      "defaultLabel": "SGST",
      "valueVariable": "{finalTotal.sgst}"
    },
    {
      "name": "Cess",
      "path": "cesses[]",
      "visibility": "mapped.visibility.showSummaryCess = some {isApplied} AND a non-zero cess total",
      "labelVariable": "{cesses[n].label}",
      "defaultLabel": "Cess",
      "valueVariable": "{cesses[n].amount}"
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
      "name": "Total",
      "path": "finalTotal.total",
      "visibility": "Always",
      "labelVariable": "{customLabels.total}",
      "defaultLabel": "Total",
      "valueVariable": "{finalTotal.total}"
    },
    {
      "name": "Total in words",
      "path": "customLabels.totalInWordsValue",
      "visibility": "hideTotalInWords false AND value non-empty",
      "labelVariable": "{customLabels.totalInWords}",
      "defaultLabel": "IN WORDS",
      "valueVariable": "{customLabels.totalInWordsValue}"
    },
    {
      "name": "Extra total fields",
      "path": "extraTotalFields[]",
      "visibility": "Array non-empty",
      "labelVariable": "{extraTotalFields[n].label}",
      "defaultLabel": null,
      "valueVariable": "{extraTotalFields[n].value} — every entry in array order",
      "unverified": true
    },
    {
      "name": "Additional charges",
      "path": "additionalCharges[]",
      "visibility": "Array non-empty",
      "labelVariable": "{additionalCharges[n].label}",
      "defaultLabel": null,
      "valueVariable": "{additionalCharges[n].amount}"
    },
    {
      "name": "Late payment fee",
      "path": "latePaymentFee",
      "visibility": "{.enabled} AND {.showInInvoice} AND {.isApplied}",
      "labelVariable": "Late Payment Fee",
      "defaultLabel": null,
      "valueVariable": "{latePaymentFee.finalAmount}"
    },
    {
      "name": "Paid amount",
      "path": "balance.paid",
      "visibility": "Payment exists",
      "labelVariable": "{customLabels.paidAmount}",
      "defaultLabel": "Paid Amount",
      "valueVariable": "{balance.paid}"
    },
    {
      "name": "Due amount",
      "path": "balance.due",
      "visibility": "Due > 0",
      "labelVariable": "{customLabels.dueAmount}",
      "defaultLabel": "Due Amount",
      "valueVariable": "{balance.due}"
    },
    {
      "name": "TDS",
      "path": "balance.tds",
      "visibility": "paymentOptions.meta.allowTDS",
      "labelVariable": "TDS",
      "defaultLabel": null,
      "valueVariable": "{balance.tds}",
      "unverified": true
    },
    {
      "name": "Credit",
      "path": "balance.credit",
      "visibility": "Non-zero",
      "labelVariable": null,
      "defaultLabel": null,
      "valueVariable": "{balance.credit}"
    }
  ]
}
```

## 9. Summary blocks

Each summary needs **both** a configuration opt-in and rows to put in it — configuration alone renders a bare header strip.

```json
{
  "group": "9. Summary blocks",
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
      "name": "Payments table",
      "path": "allPayments[], fallback payments[]",
      "visibility": "mapped.visibility.showPaymentsTable = showPaymentsTable AND allPayments non-empty",
      "labelVariable": "{customLabels.paymentRecord}",
      "defaultLabel": "Payment Record",
      "valueVariable": "{allPayments[n].paymentDate}, {.paymentMethod}, {.amount}"
    },
    {
      "name": "Details block heading",
      "path": null,
      "visibility": "Always",
      "labelVariable": "{customLabels.invoiceDetails}",
      "defaultLabel": "Invoice Details",
      "valueVariable": null
    }
  ]
}
```

`taxSummary`/`hsnSummary` arrive either as a flat array or nested under `taxList`/`hsnList`; normalization handles both, so audit the nested form.

## 10. Payment info

```json
{
  "group": "10. Payment info",
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

## 11. Footer

```json
{
  "group": "11. Footer",
  "fields": [
    {
      "name": "Terms",
      "path": "terms[]",
      "visibility": "per group, {terms[g].terms} non-empty",
      "labelVariable": "{terms[g].label}, else {customLabels.terms}",
      "defaultLabel": "Terms and Conditions",
      "valueVariable": "{terms[g].terms[n]} — every group and every clause in array order"
    },
    {
      "name": "Notes",
      "path": "notes",
      "visibility": "Non-empty",
      "labelVariable": "{customLabels.notes}",
      "defaultLabel": "Notes",
      "valueVariable": "{notes} — may contain markdown"
    },
    {
      "name": "Attachments",
      "path": "attachments[]",
      "visibility": "Array non-empty",
      "labelVariable": "{customLabels.attachment}",
      "defaultLabel": "Attachments",
      "valueVariable": "{attachments[n]} — display name derived from the URL filename"
    },
    {
      "name": "Signature",
      "path": "signature, fallback billedBy.signature",
      "visibility": "Non-empty",
      "labelVariable": "{customLabels.signature}",
      "defaultLabel": "Authorized Signatory",
      "valueVariable": "{signature}"
    },
    {
      "name": "Contact line",
      "path": "contact.*",
      "visibility": "mapped.visibility.contactStrip = {contact.email} or {contact.phone} present",
      "labelVariable": "{customLabels.contact}, {.contactEmail}, {.contactPhone}",
      "defaultLabel": "For any enquiry, reach out via",
      "valueVariable": "{contact.email}, {contact.phone}"
    },
    {
      "name": "Custom footers",
      "path": "customFooters[]",
      "visibility": "Array non-empty, per-entry {value} non-empty",
      "labelVariable": "{customFooters[n].label}",
      "defaultLabel": "{customFooters[n].defaultValue}",
      "valueVariable": "{customFooters[n].value} — every entry in array order"
    },
    {
      "name": "Footers",
      "path": "footers[]",
      "visibility": "Array non-empty",
      "labelVariable": "{footers[n].label}",
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

Keep defects in the audited *data* separate from render rules — a field record describes what the template does, a defect describes what this document happens to contain. Put them in a closing section and say whether the renderer neutralises each one. Recurring kinds:

- **A column label that contradicts its key** (`columns[cgst].label` = "IGST"). The renderer forces `CGST`/`UTGST`, so this does **not** reach the page — report it as bad stored config, not a render bug.
- **A total populated against its own flag** (`finalTotal.igst` non-zero while `igst` is false and the HSN summary shows zero IGST). Read `mapped.visibility.showIgst`, never the presence of a total.
- **Identifier inconsistencies** — a GSTIN state prefix disagreeing with `gstState`, a short `pincode`. These surface as IRN/e-invoice errors, not render errors.
- **Markdown inside a value** (an item `description` holding a table). Renders as raw pipes unless the template pipes it through the markdown partial.
- **Unresolvable lookup keys** — a custom `unit` key that must resolve through `owner.configuration.units`; the raw key prints if the resolver misses.
- **Secrets in the payload** (`owner.einvoice.password` in plain text). Report, do not echo the value.
- **A missing flag is not `false`.** If `owner.configuration.experimental` carries no `fieldVisibility`, GSTIN/PAN have no stored value — the opt-out convention means they show. Say "not set → default" rather than "hidden".
- **Empty `customLabels` overrides.** List them separately — "falls back to default" is only true where the markup supplies one:

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
