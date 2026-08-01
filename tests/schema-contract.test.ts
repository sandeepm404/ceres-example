import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import payloadSchema from "../schemas/payload.schema.json";
import normalizedStateSchema from "../schemas/normalized-state.schema.json";
import sample from "../src/types/sample.json";
import type { CeresTemplatePayload } from "../src/types/contract";
import { normalizeInvoicePayload } from "../src/types/contract";
import { normalizeInvoiceTemplateState } from "../src/types/normalization";

const repoRoot = path.resolve(__dirname, "..");
const generatorScript = path.join(repoRoot, "scripts", "generate-schemas.mjs");
const GENERATION_TIMEOUT_MS = 120_000;

const wrappedSample: CeresTemplatePayload = sample;

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(payloadSchema);
ajv.addSchema(normalizedStateSchema);

const validateAgainst = (
  schemaId: string,
  definition: string,
  data: unknown
) => {
  const validate = ajv.getSchema(`${schemaId}#/definitions/${definition}`);
  if (!validate) {
    throw new Error(`Definition ${definition} missing from ${schemaId}`);
  }
  const valid = validate(data);
  return { valid, errors: validate.errors };
};

const runGenerator = (args: string[]) =>
  execFileSync("node", [generatorScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: GENERATION_TIMEOUT_MS,
  });

describe("generated schemas validate the contract payload shapes", () => {
  it("accepts the wrapped sample payload (CeresTemplatePayload)", () => {
    const { valid, errors } = validateAgainst(
      payloadSchema.$id,
      "CeresTemplatePayload",
      wrappedSample
    );
    expect(errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });

  it("accepts the flattened sample payload (FlattenedInvoicePayload)", () => {
    const { valid, errors } = validateAgainst(
      payloadSchema.$id,
      "FlattenedInvoicePayload",
      normalizeInvoicePayload(wrappedSample)
    );
    expect(errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });

  it("accepts the normalized template state (NormalizedInvoiceTemplateState)", () => {
    const { valid, errors } = validateAgainst(
      normalizedStateSchema.$id,
      "NormalizedInvoiceTemplateState",
      normalizeInvoiceTemplateState(wrappedSample)
    );
    expect(errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });

  it("rejects a payload that violates the contract", () => {
    const broken = { ...wrappedSample, invoice: "not-an-object" };
    const { valid } = validateAgainst(
      payloadSchema.$id,
      "CeresTemplatePayload",
      broken
    );
    expect(valid).toBe(false);
  });
});

describe("schema generation tooling", () => {
  it(
    "produces deterministic output",
    () => {
      const runA = fs.mkdtempSync(path.join(os.tmpdir(), "ceres-schemas-a-"));
      const runB = fs.mkdtempSync(path.join(os.tmpdir(), "ceres-schemas-b-"));
      try {
        runGenerator(["--schemas-dir", runA]);
        runGenerator(["--schemas-dir", runB]);

        const files = fs.readdirSync(runA).sort();
        expect(files).toEqual(fs.readdirSync(runB).sort());
        expect(files.length).toBeGreaterThan(0);
        files.forEach((file) => {
          expect(fs.readFileSync(path.join(runA, file), "utf8")).toBe(
            fs.readFileSync(path.join(runB, file), "utf8")
          );
        });
      } finally {
        fs.rmSync(runA, { recursive: true, force: true });
        fs.rmSync(runB, { recursive: true, force: true });
      }
    },
    GENERATION_TIMEOUT_MS * 2 + 10_000
  );

  it(
    "--check passes on the committed schemas and fails once they drift from the contracts",
    () => {
      expect(() => runGenerator(["--check"])).not.toThrow();

      // Simulate a contract change without regeneration: the committed schema
      // no longer matches what the TypeScript types produce.
      const driftedDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "ceres-schemas-drift-")
      );
      try {
        fs.readdirSync(path.join(repoRoot, "schemas")).forEach((file) => {
          fs.copyFileSync(
            path.join(repoRoot, "schemas", file),
            path.join(driftedDir, file)
          );
        });
        const driftedFile = path.join(driftedDir, "payload.schema.json");
        const drifted = JSON.parse(fs.readFileSync(driftedFile, "utf8"));
        delete drifted.definitions.CeresTemplatePayload.properties.invoice;
        fs.writeFileSync(driftedFile, `${JSON.stringify(drifted, null, 2)}\n`);

        expect(() =>
          runGenerator(["--check", "--schemas-dir", driftedDir])
        ).toThrow(/Stale schemas/);
      } finally {
        fs.rmSync(driftedDir, { recursive: true, force: true });
      }
    },
    GENERATION_TIMEOUT_MS * 2 + 10_000
  );
});
