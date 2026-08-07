---
name: snapshot-testing
description: Manage visual regression tests for Ceres templates. Required as the last step of creating a new template, and whenever a change touches template.hbs or styles.css.
---

# Snapshot Testing

## When to run this — required, not optional

**Every new template gets snapshot baselines before it is handed over.** A template with binding
tests but no baselines is unverified visually: `data-binding-tests` proves a value reached the DOM,
never that the page it landed on is laid out correctly. Nothing else in the workflow looks at the
rendered document.

Also run it on **any** change to `template.hbs` or `styles.css` — that is what a regression test is
for. Review the diff image before updating a baseline; `npm run test:snapshots:update` on an
unexamined diff silently blesses the regression it was meant to catch.

At least two samples per template, per Tips below.

> **Harness status: not yet wired up.** As of this writing the repo has no `test:snapshots` /
> `test:snapshots:update` scripts, no Playwright dependency, no `playwright.config.*`, and no
> `__snapshots__/` directory — the commands below describe the intended setup, not a working one.
> Build the harness before relying on this step, and delete this note once it runs.

## What snapshots do

Snapshots catch visual regressions. They take a screenshot of a rendered template and compare it to a saved baseline. If the screenshots differ, the test fails and shows you a diff.

## How it works

1. Each template has a `samples.json` file with named live API URLs (base64-encoded)
2. The test runner (Playwright) starts a local server with the built Ceres files
3. For each template and each sample URL, it opens the page and waits for rendering to finish
4. It takes a full-page screenshot and compares it to the saved baseline in `__snapshots__/`

## Running tests

```bash
# Run all snapshot tests (compares against baselines)
npm run test:snapshots

# Update baselines (saves new screenshots as the baselines)
npm run test:snapshots:update
```

## Adding a new test sample

Open your template's `samples.json` and add a new named entry:

```json
{
  "simple-invoice": "aHR0cHM6Ly8...",
  "invoice-with-many-items": "aHR0cHM6Ly8..."
}
```

Each key becomes a snapshot name. Use descriptive names so you know what case they test.

To base64-encode a URL:
```javascript
btoa("https://api.refrens.com/invoices/YOUR_ID?_at=YOUR_TOKEN&populateBusiness=true")
```

After adding a new sample, run `npm run test:snapshots:update` to create the initial baseline.

## When a test fails

You will see output like:

```
FAIL: basic-invoice-example/simple-invoice
  Screenshot differs from baseline.
  Expected: __snapshots__/basic-invoice-example/simple-invoice.png
  Actual:   test-results/basic-invoice-example/simple-invoice-actual.png
  Diff:     test-results/basic-invoice-example/simple-invoice-diff.png
```

Look at the diff image. Changed pixels are highlighted.

**If the change is intentional**: Run `npm run test:snapshots:update`.
**If the change is a bug**: Fix your template and run tests again.

## File structure

```
__snapshots__/           # Committed to git (baselines)
  basic-invoice-example/
    simple-invoice.png
    invoice-with-gst.png
test-results/            # NOT committed (generated on failures)
  basic-invoice-example/
    simple-invoice-actual.png
    simple-invoice-diff.png
```

## Tips

- **Always commit `__snapshots__/`**. These are your baselines.
- **Never commit `test-results/`**. This is generated on test failures.
- **Use at least 2 samples per template**: one simple case and one edge case.
- **API data can change**: If the live API data changes (someone edits the invoice), baselines may break. Update them with `npm run test:snapshots:update` after verifying the rendered output looks correct.
