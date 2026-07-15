#!/usr/bin/env node
/**
 * Generates JSON Schemas from the TypeScript contract definitions so that
 * template validation has a machine-readable source of truth.
 *
 * Usage:
 *   node scripts/generate-schemas.mjs                     # (re)write schemas/
 *   node scripts/generate-schemas.mjs --check             # fail if schemas/ is stale
 *   node scripts/generate-schemas.mjs --schemas-dir <dir> # write/check against <dir>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGenerator } from "ts-json-schema-generator";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SCHEMA_TARGETS = [
  {
    file: "payload.schema.json",
    id: "refrens://ceres/schemas/payload.schema.json",
    source: "src/main/invoicePayloadContract.ts",
    types: ["CeresTemplatePayload", "FlattenedInvoicePayload"],
  },
  {
    file: "normalized-state.schema.json",
    id: "refrens://ceres/schemas/normalized-state.schema.json",
    source: "src/main/invoiceTemplateNormalization.ts",
    types: ["NormalizedInvoiceTemplateState"],
  },
];

// Stable key order (objects only — array order is meaningful in JSON Schema)
// so regeneration is byte-for-byte deterministic and diffs stay readable.
const sortKeysDeep = (value) => {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeysDeep(value[key]);
        return acc;
      }, {});
  }
  return value;
};

const buildSchema = ({ id, source, types }) => {
  const definitions = {};

  // One generator per source file: booting the TypeScript program is the
  // expensive part, and createSchema can be called per type against it.
  const generator = createGenerator({
    path: path.join(repoRoot, source),
    tsconfig: path.join(repoRoot, "tsconfig.json"),
    expose: "export",
    topRef: true,
    additionalProperties: true,
    sortProps: true,
  });

  types.forEach((typeName) => {
    const { definitions: generated = {} } = generator.createSchema(typeName);

    Object.entries(generated).forEach(([name, definition]) => {
      const existing = definitions[name];
      if (existing && JSON.stringify(existing) !== JSON.stringify(definition)) {
        throw new Error(
          `Conflicting definitions for "${name}" while generating ${id} — split the types into separate schema files.`
        );
      }
      definitions[name] = definition;
    });
  });

  return sortKeysDeep({
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: id,
    definitions,
  });
};

const serialize = (schema) => `${JSON.stringify(schema, null, 2)}\n`;

const main = () => {
  const argv = process.argv.slice(2);
  const check = argv.includes("--check");
  const dirFlagIndex = argv.indexOf("--schemas-dir");
  const schemasDir =
    dirFlagIndex !== -1 && argv[dirFlagIndex + 1]
      ? path.resolve(argv[dirFlagIndex + 1])
      : path.join(repoRoot, "schemas");

  const stale = [];

  SCHEMA_TARGETS.forEach((target) => {
    const output = serialize(buildSchema(target));
    const outputPath = path.join(schemasDir, target.file);

    if (check) {
      const committed = fs.existsSync(outputPath)
        ? fs.readFileSync(outputPath, "utf8")
        : null;
      if (committed !== output) {
        stale.push(target.file);
      }
      return;
    }

    fs.mkdirSync(schemasDir, { recursive: true });
    fs.writeFileSync(outputPath, output);
    process.stdout.write(`wrote ${path.relative(repoRoot, outputPath)}\n`);
  });

  if (check && stale.length > 0) {
    process.stderr.write(
      `Stale schemas: ${stale.join(", ")}.\n` +
        "The TypeScript contracts changed without regenerating — run: npm run generate:schemas\n"
    );
    process.exit(1);
  }

  if (check) {
    process.stdout.write("Schemas are up to date.\n");
  }
};

main();
