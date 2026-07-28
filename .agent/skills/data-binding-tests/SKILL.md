---
name: data-binding-tests
description: Write and maintain Jest tests that verify a Ceres template's Handlebars markup binds the correct contract field to the correct rendered output. Use when asked to test, verify, or add coverage for field mapping/data binding on a template, after adding or changing template.hbs fields, columns, or visibility conditions, or when the user wants confidence that a field renders correctly without manually walking through the mapping each time.
---

# Data Binding Tests

## What this covers vs. other skills

- This skill: fast Jest tests that render `template.hbs` with a controlled payload and assert the right value/section shows up in the right place. Catches "field X doesn't reach the DOM", "field X shows even when empty", "column order is wrong", "visibility flag ignored".
- `ceres-template-data-contract`: mapping *new* visible fields to contract fields while building a template. Use that first if the field isn't mapped yet.
- `snapshot-testing`: pixel-level visual regression via Playwright screenshots. Does not tell you *which* field broke, only that pixels changed.

Prefer this skill's approach for anything expressible as "does value V end up under label L / row R / column C". Reach for snapshot tests only for pure visual layout concerns.

## The render harness

Every existing binding test in `tests/*.test.ts` follows the same shape:

```ts
import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import { registerFitkingHelpers } from "./support/fitkingHelpers"; // per-template helper registration
import template from "../src/templates/<name>/template.hbs";

const render = (payload: Record<string, unknown>) =>
  template(normalizeInvoiceTemplateState(payload as any));

beforeAll(registerFitkingHelpers);
```

`template.hbs` is precompiled by `tests/hbsTransform.js` into a plain function; calling it with the normalized state returns the final HTML string. Payloads are the raw (pre-normalization) invoice shape — pass only the fields the test cares about plus whatever `normalizeInvoiceTemplateState` requires to not throw.

### Registering helpers/partials

Handlebars helpers/partials owned by widgets (`InvoiceStatus`, `DemoBadge`, `MarkdownViewer`, date-time helpers) register themselves against `window.Handlebars` at import time, which doesn't exist under Jest. Every template needs a `tests/support/<template>Helpers.ts` that stubs those out, modeled on `tests/support/fitkingHelpers.ts`:

- Register the template's **own** helpers module for real (e.g. `registerFitkingTemplateHelpers` from `src/templates/<name>/helpers.ts`) — tests should exercise real logic, not a stub that only agrees with itself.
- Stub widget-owned partials/helpers with the simplest thing that lets assertions work (e.g. `MarkdownViewer` → `` `<span>${ctx?.markdown ?? ""}</span>` ``, date helpers → `String(v ?? "")`).
- If the template has no local `helpers.ts`, a support file may not be needed — check `src/templates/<name>/index.ts` for what it imports before writing one.

If `tests/support/<template>Helpers.ts` doesn't exist yet, create it before writing the actual test.

## Workflow: adding binding tests for a template/field

1. **Read `src/templates/<name>/template.hbs`.** List every `{{ field }}`, `{{#if flag}}`, `{{#each list}}`, and partial invocation relevant to the feature being tested.
2. **Resolve each reference against the contract**, not by guessing: `src/main/invoiceTemplateNormalization.ts` for the normalized shape templates actually receive (`invoice.*`, `mapped.*`, `derived.*`, `advanceOptions`, `pdfOptions`), and `src/main/invoicePayloadContract.ts` for the raw payload fields that produce them. If a reference doesn't resolve to either, it's template-local (from `src/templates/<name>/helpers.ts`) — read that instead of assuming.
3. **Pick the smallest payload that isolates the feature.** Reuse the `basePayload(extra)` pattern (see existing `fitking-*.test.ts` files) — a minimal valid invoice plus the one field under test, not a full sample payload. Full sample payloads make it unclear which field the assertion is actually pinned to.
4. **Extract a scoped fragment before asserting**, don't grep the whole HTML string. Whitespace/formatting in `template.hbs` is free to change; pin to structure instead:
   ```ts
   const thead = /<thead>([\s\S]*?)<\/thead>/.exec(html)?.[1] ?? "";
   const rows = [...html.matchAll(/<div class="fk-info-kv-custom">.../g)];
   ```
   A full-string `toContain` is fine only for simple singular values (titles, numbers) that can't collide with other output.
5. **One `describe` per feature/section**, one file per cohesive feature (follow the existing `fitking-item-table.test.ts` / `fitking-summary-visibility.test.ts` / `fitking-party-custom-fields.test.ts` split) rather than one giant template test file.
6. **Run the narrow test file**, then the coverage-gated full suite before calling it done (`jest.config.cjs` enforces 100% branch/function/line coverage globally):
   ```bash
   npx jest tests/<file>.test.ts
   npm test
   ```

## Cases to cover per field

For a plain value field (`{{ invoice.someField }}`):
- Renders the value when present.
- Does not render the label/row/element at all when absent (check the container/row is gone, not just that the value is empty — a stray empty `<span>` or bare label is a common bug).

For a value gated by both a config flag and data presence (the recurring Ceres pattern — see `fitking-summary-visibility.test.ts`), test all four combinations, not just the happy path:
- flag on + rows/data present → shown
- flag on + no rows/data → hidden
- flag off + rows/data present → hidden
- flag absent entirely → hidden (don't assume opt-in fields default to visible)

For `showInInvoice`-style per-row visibility (custom fields, additional IDs): treat it as opt-out, not opt-in — a field with no `showInInvoice` key must still render; only an explicit `false` hides it. See `fitking-party-custom-fields.test.ts` for the reference cases (blank/null/nested-object/empty-label/falsy-but-valid `0`/array values).

For an `{{#each}}` loop or dynamic column set:
- Order matches the declared order in the payload (`columns[]`, `terms[]`, etc.), not insertion order of some other structure.
- Header cell count (accounting for `colspan`) matches the number of `<col>`/data cells actually rendered — a mismatch silently steals table width. See the `headerCount`/`colCount` helpers in `fitking-custom-columns.test.ts` and `fitking-item-table.test.ts`.
- No column is duplicated or invented for keys the template doesn't recognize.
- Empty array renders the container as empty/hidden, not a broken loop artifact.

For values that look falsy but are valid data — `0`, `""` used intentionally, `false` as a real value — assert they still render distinctly from "field missing." Don't let a helper collapse `0` into "no value."

## Verification

- `npx jest <changed test files>` for the fast loop.
- `npm test` before finishing — the global coverage thresholds in `jest.config.cjs` are 100% branches/functions/lines/statements, so an untested conditional branch fails the suite even if the assertions you wrote pass.
- `npm run typecheck` if you touched a `helpers.ts` or the normalization/contract types.
- If a binding bug is found and fixed, add the failing case as a permanent test rather than just re-running manually — that's the point of this skill.
