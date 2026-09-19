import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "validate-templates.mjs");
const RUN_TIMEOUT_MS = 30_000;

type Diagnostic = {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning";
  rule: string;
  message: string;
};

type RunResult = { status: number; stdout: string; stderr: string };

type ExecError = { status?: number; stdout?: string; stderr?: string };

const isExecError = (value: unknown): value is ExecError =>
  typeof value === "object" && value !== null && "stdout" in value;

/**
 * Every scenario runs the built script as a subprocess: jest.config.cjs has
 * no transform for `.mjs`, so this is the only boundary that can exercise
 * it (see plan.md's `## Blockers in existing code`).
 * @param cwd
 * @param args
 */
const run = (cwd: string, args: string[] = []): RunResult => {
  try {
    const stdout = execFileSync(
      "node",
      [path.join(cwd, "scripts", "validate-templates.mjs"), ...args],
      {
        cwd,
        encoding: "utf8",
        timeout: RUN_TIMEOUT_MS,
      }
    );
    return { status: 0, stdout, stderr: "" };
  } catch (error: unknown) {
    if (!isExecError(error)) throw error;
    return {
      status: typeof error.status === "number" ? error.status : 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
};

const runJson = (cwd: string, args: string[] = []) => {
  const result = run(cwd, [...args, "--format", "json"]);
  return { ...result, diagnostics: JSON.parse(result.stdout) as Diagnostic[] };
};

type FixtureFiles = Record<string, string>;

const writeFixtureFiles = (dir: string, files: FixtureFiles): void => {
  Object.entries(files).forEach(([relativePath, content]) => {
    const full = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  });
};

/**
 * Builds a self-contained fixture "repo": a copy of the built script under
 * `scripts/`, plus whatever `src/templates`/`src/widgets` files the
 * scenario needs. `repoRoot` inside the copied script is derived from its
 * own location (see validate-templates.mjs), so running the copy here
 * exercises the same resolution path a `ceres-example` port would (NF1).
 * @param files
 */
const createFixtureRepo = (files: FixtureFiles): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ceres-validate-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.copyFileSync(
    scriptPath,
    path.join(dir, "scripts", "validate-templates.mjs")
  );
  // Node's ESM resolver walks up from the script's own path looking for
  // node_modules, ignoring NODE_PATH; a symlink is what lets the copied
  // script resolve the already-installed `handlebars` devDependency, the
  // same way a real `ceres-example` checkout's own node_modules would.
  fs.symlinkSync(
    path.join(repoRoot, "node_modules"),
    path.join(dir, "node_modules"),
    "dir"
  );
  writeFixtureFiles(dir, files);
  return dir;
};

const cleanup = (dir: string): void =>
  fs.rmSync(dir, { recursive: true, force: true });

const byRule = (diagnostics: Diagnostic[], rule: string) =>
  diagnostics.filter((d) => d.rule === rule);

/**
 * A fixture schema, not the committed one, so field-validation assertions
 * don't move when the real contract changes (plan.md's Test Matrix, R4).
 * `FlattenedInvoicePayload` is the validator's own hardcoded default root
 * name (`rootDefinitionFor`'s no-mapper case) — reusing it here is what
 * lets a fixture template with no `CeresTemplateDataMapper` assignment
 * pick the fixture root up at all.
 * @param definitions
 */
const fixtureSchema = (definitions: Record<string, unknown>): string =>
  JSON.stringify({
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "fixture://schema",
    definitions,
  });

describe("validate-templates.mjs", () => {
  it("S1: every template and widget partial in the repository is read, deterministically", () => {
    const dir = createFixtureRepo({
      "src/templates/alpha/index.ts": `export {};\n`,
      "src/templates/alpha/template.hbs": `{{alphaOnlyHelper x}}\n`,
      "src/templates/beta/index.ts": `export {};\n`,
      "src/templates/beta/template.hbs": `{{betaOnlyHelper x}}\n`,
      "src/widgets/gamma/index.ts": `export {};\n`,
      "src/widgets/gamma/Gamma.hbs": `{{gammaOnlyHelper x}}\n`,
    });
    try {
      const first = runJson(dir);
      const second = runJson(dir);

      expect(
        first.diagnostics.some((d) => d.message.includes("alphaOnlyHelper"))
      ).toBe(true);
      expect(
        first.diagnostics.some((d) => d.message.includes("betaOnlyHelper"))
      ).toBe(true);
      expect(
        first.diagnostics.some((d) => d.message.includes("gammaOnlyHelper"))
      ).toBe(true);

      // gamma is reached by no template, so its diagnostic is demoted (EC5).
      const gammaDiagnostic = first.diagnostics.find((d) =>
        d.message.includes("gammaOnlyHelper")
      );
      expect(gammaDiagnostic?.severity).toBe("warning");

      expect(second.stdout).toBe(first.stdout);
    } finally {
      cleanup(dir);
    }
  });

  it("S2: a template that cannot be parsed is reported at the line the parser names, and does not hide templates after it", () => {
    const unclosed = "<div>\n<div>\n{{#if a}}\n<p>unclosed\n";
    const expectedLine = unclosed.split("\n").length;
    const dir = createFixtureRepo({
      "src/templates/broken/index.ts": `export {};\n`,
      "src/templates/broken/template.hbs": unclosed,
      "src/templates/second/index.ts": `export {};\n`,
      "src/templates/second/template.hbs": `{{unregisteredHelper x}}\n`,
    });
    try {
      const { diagnostics, status } = runJson(dir);
      const parseError = diagnostics.find((d) => d.rule === "parse-error");

      expect(parseError).toBeDefined();
      expect(parseError?.file).toContain("broken/template.hbs");
      expect(parseError?.line).toBe(expectedLine);
      expect(parseError?.line).toBeGreaterThan(1);

      expect(
        diagnostics.some((d) => d.message.includes("unregisteredHelper"))
      ).toBe(true);
      expect(status).toBe(1);
    } finally {
      cleanup(dir);
    }
  });

  it("S3: an unregistered helper is reported; the same template is clean when the helper is registered", () => {
    const widgetWithHelper = `
      function getHB() { return (window as any).Handlebars; }
      const HB = getHB();
      if (HB) HB.registerHelper("fixtureHelper", (x: any) => x);
      export {};
    `;
    const widgetWithoutHelper = `export {};\n`;
    const files: FixtureFiles = {
      "src/widgets/widget-a/index.ts": widgetWithHelper,
      "src/templates/main/index.ts": `import "../../widgets/widget-a";\nexport {};\n`,
      "src/templates/main/template.hbs": `{{fixtureHelper x}}\n`,
    };
    const dir = createFixtureRepo(files);
    try {
      const clean = runJson(dir);
      expect(byRule(clean.diagnostics, "unknown-helper")).toHaveLength(0);
      expect(clean.status).toBe(0);

      writeFixtureFiles(dir, {
        "src/widgets/widget-a/index.ts": widgetWithoutHelper,
      });
      const broken = runJson(dir);
      const helperDiagnostic = byRule(broken.diagnostics, "unknown-helper")[0];
      expect(helperDiagnostic?.message).toContain("fixtureHelper");
      expect(helperDiagnostic?.file).toContain("main/template.hbs");
      expect(broken.status).toBe(1);
    } finally {
      cleanup(dir);
    }
  });

  it("S4: an unregistered partial is reported; the same template is clean when the partial is registered", () => {
    const widgetWithPartial = `
      function getHB() { return (window as any).Handlebars; }
      const HB = getHB();
      if (HB) HB.registerPartial("FixturePartial", "<span>fixture</span>");
      export {};
    `;
    const widgetWithoutPartial = `export {};\n`;
    const dir = createFixtureRepo({
      "src/widgets/widget-a/index.ts": widgetWithPartial,
      "src/templates/main/index.ts": `import "../../widgets/widget-a";\nexport {};\n`,
      "src/templates/main/template.hbs": `{{> FixturePartial }}\n`,
    });
    try {
      const clean = runJson(dir);
      expect(byRule(clean.diagnostics, "unknown-partial")).toHaveLength(0);
      expect(clean.status).toBe(0);

      writeFixtureFiles(dir, {
        "src/widgets/widget-a/index.ts": widgetWithoutPartial,
      });
      const broken = runJson(dir);
      const partialDiagnostic = byRule(
        broken.diagnostics,
        "unknown-partial"
      )[0];
      expect(partialDiagnostic?.message).toContain("FixturePartial");
      expect(broken.status).toBe(1);
    } finally {
      cleanup(dir);
    }
  });

  it("S5 (regression): a helper registered across a line break is recognised", () => {
    const dir = createFixtureRepo({
      "src/widgets/widget-a/index.ts": `
        function getHB() { return (window as any).Handlebars; }
        const HB = getHB();
        if (HB) {
          HB.registerHelper(
            "fixtureMultiline",
            function (x: any) { return x; }
          );
        }
        export {};
      `,
      "src/templates/main/index.ts": `import "../../widgets/widget-a";\nexport {};\n`,
      "src/templates/main/template.hbs": `{{fixtureMultiline x}}\n`,
    });
    try {
      const { diagnostics, status } = runJson(dir);
      expect(byRule(diagnostics, "unknown-helper")).toHaveLength(0);
      expect(status).toBe(0);
    } finally {
      cleanup(dir);
    }
  });

  it("S6 (regression): a helper registered by the template's own index.ts is recognised", () => {
    const dir = createFixtureRepo({
      "src/templates/main/index.ts": `
        function getHB() { return (window as any).Handlebars; }
        const hb = getHB();
        if (hb) hb.registerHelper("localOnly", (x: any) => x);
        export {};
      `,
      "src/templates/main/template.hbs": `{{localOnly x}}\n`,
    });
    try {
      const { diagnostics, status } = runJson(dir);
      expect(byRule(diagnostics, "unknown-helper")).toHaveLength(0);
      expect(status).toBe(0);
    } finally {
      cleanup(dir);
    }
  });

  it("S7 (regression): a helper reachable only through a transitive import is recognised", () => {
    const dir = createFixtureRepo({
      "src/widgets/widget-a/index.ts": `import "../shared/registerFixtureHelper";\nexport {};\n`,
      "src/widgets/shared/registerFixtureHelper.ts": `
        function getHB() { return (window as any).Handlebars; }
        const HB = getHB();
        if (HB) HB.registerHelper("deepHelper", (x: any) => x);
        export {};
      `,
      "src/templates/main/index.ts": `import "../../widgets/widget-a";\nexport {};\n`,
      "src/templates/main/template.hbs": `{{deepHelper x}}\n`,
    });
    try {
      const resolved = runJson(dir);
      expect(byRule(resolved.diagnostics, "unknown-helper")).toHaveLength(0);
      expect(resolved.status).toBe(0);

      // Breaking the middle link proves resolution actually walked all 3
      // modules rather than only the entry file.
      writeFixtureFiles(dir, {
        "src/widgets/widget-a/index.ts": `export {};\n`,
      });
      const broken = runJson(dir);
      expect(
        byRule(broken.diagnostics, "unknown-helper")[0]?.message
      ).toContain("deepHelper");
      expect(broken.status).toBe(1);
    } finally {
      cleanup(dir);
    }
  });

  it("S8: a partial named by a subexpression is left alone", () => {
    const dir = createFixtureRepo({
      "src/templates/main/index.ts": `export {};\n`,
      "src/templates/main/template.hbs": `{{> (lookup . 'dynamicName') }}\n{{> MissingOne }}\n`,
    });
    try {
      const { diagnostics } = runJson(dir);
      const partialDiagnostics = byRule(diagnostics, "unknown-partial");
      expect(partialDiagnostics).toHaveLength(1);
      expect(partialDiagnostics[0]?.message).toContain("MissingOne");
    } finally {
      cleanup(dir);
    }
  });

  it("S9: built-in block helpers are never reported as unknown", () => {
    const dir = createFixtureRepo({
      "src/templates/main/index.ts": `export {};\n`,
      "src/templates/main/template.hbs":
        `{{#if a}}x{{/if}}\n{{#unless a}}x{{/unless}}\n{{#each a}}x{{/each}}\n` +
        `{{#with a}}x{{/with}}\n{{lookup a 0}}\n{{log a}}\n`,
    });
    try {
      const { diagnostics, status } = runJson(dir);
      expect(byRule(diagnostics, "unknown-helper")).toHaveLength(0);
      expect(status).toBe(0);
    } finally {
      cleanup(dir);
    }
  });

  it("S10: a template directory with no index.ts is reported rather than crashing", () => {
    const dir = createFixtureRepo({
      "src/templates/incomplete/template.hbs": `<div>no entry file</div>\n`,
      "src/templates/complete/index.ts": `export {};\n`,
      "src/templates/complete/template.hbs": `<div>fine</div>\n`,
    });
    try {
      const { diagnostics, status, stderr } = runJson(dir);
      const missingEntry = byRule(diagnostics, "missing-entry");
      expect(missingEntry).toHaveLength(1);
      expect(missingEntry[0]?.message).toContain("incomplete");
      expect(status).toBe(1);
      expect(stderr).toBe("");
    } finally {
      cleanup(dir);
    }
  });

  it("S31: a template with no index.ts is still parsed, and its parse error survives the demotion", () => {
    // R1 requires *every* template to be parsed. S10 only proves the
    // missing-entry condition is reported; its fixture is syntactically
    // valid, so it cannot catch a body that is skipped rather than walked.
    // The unclosed block sits below line 1 for the same reason S2 does: a
    // fixture erroring on line 1 passes against a `1:0` default.
    const brokenBody = `line one\nline two\n{{#if a}}\nunclosed\n`;
    // An unclosed block is a lexer error, so Handlebars names the line it
    // reached EOF on rather than the one the block opened on. Computed from
    // the fixture text (as S2 does), never typed in.
    const expectedParseLine = brokenBody.split("\n").length;
    const dir = createFixtureRepo({
      "src/templates/broken/template.hbs": brokenBody,
      "src/templates/noentry/template.hbs": `{{someUnregisteredHelper x}}\n`,
    });
    try {
      const { diagnostics, status, stderr } = runJson(dir);

      // The body was actually walked, not skipped behind the entry filter.
      const parseErrors = byRule(diagnostics, "parse-error");
      expect(parseErrors).toHaveLength(1);
      expect(parseErrors[0]?.file).toContain("broken/template.hbs");
      expect(expectedParseLine).toBeGreaterThan(1);
      expect(parseErrors[0]?.line).toBe(expectedParseLine);

      // parse-error is exempt from the empty-registry demotion: a file that
      // will not compile is broken under any registry.
      expect(parseErrors[0]?.severity).toBe("error");

      // Registry-derived diagnostics ARE demoted — with no entry file we
      // cannot see what was registered, so calling them errors would be a
      // false positive stacked on the missing-entry error.
      const helperDiagnostics = byRule(diagnostics, "unknown-helper");
      expect(helperDiagnostics).toHaveLength(1);
      expect(helperDiagnostics[0]?.file).toContain("noentry/template.hbs");
      expect(helperDiagnostics[0]?.severity).toBe("warning");

      expect(byRule(diagnostics, "missing-entry")).toHaveLength(2);
      expect(status).toBe(1);
      expect(stderr).toBe("");
    } finally {
      cleanup(dir);
    }
  });

  it("S11: every diagnostic carries file, line, column, severity, rule and message", () => {
    const helperLine = `{{unknownHelperName x}}\n`;
    const partialLine = `{{> UnknownPartialName }}\n`;
    const templateSource = helperLine + partialLine;
    const dir = createFixtureRepo({
      "src/templates/main/index.ts": `export {};\n`,
      "src/templates/main/template.hbs": templateSource,
    });
    try {
      const { diagnostics } = runJson(dir);
      expect(diagnostics.length).toBeGreaterThanOrEqual(2);
      diagnostics.forEach((d) => {
        expect(typeof d.file).toBe("string");
        expect(typeof d.line).toBe("number");
        expect(typeof d.column).toBe("number");
        expect(["error", "warning"]).toContain(d.severity);
        expect(typeof d.rule).toBe("string");
        expect(typeof d.message).toBe("string");
      });

      // Positions are computed from the fixture text rather than typed in:
      // both diagnostics point at the name itself, past the opening braces.
      const helperDiagnostic = byRule(diagnostics, "unknown-helper")[0];
      expect(helperDiagnostic?.line).toBe(1);
      expect(helperDiagnostic?.column).toBe(
        helperLine.indexOf("unknownHelperName")
      );

      const partialDiagnostic = byRule(diagnostics, "unknown-partial")[0];
      expect(partialDiagnostic?.line).toBe(2);
      expect(partialDiagnostic?.column).toBe(
        partialLine.indexOf("UnknownPartialName")
      );
    } finally {
      cleanup(dir);
    }
  });

  it("S12: the exit code follows error-severity diagnostics only", () => {
    const cleanDir = createFixtureRepo({
      "src/templates/main/index.ts": `export {};\n`,
      "src/templates/main/template.hbs": `<div>{{#if a}}ok{{/if}}</div>\n`,
    });
    const brokenDir = createFixtureRepo({
      "src/templates/main/index.ts": `export {};\n`,
      "src/templates/main/template.hbs": `{{unregisteredHelper x}}\n`,
    });
    try {
      const clean = runJson(cleanDir);
      expect(clean.status).toBe(0);
      expect(clean.diagnostics).toHaveLength(0);

      const broken = runJson(brokenDir);
      expect(broken.status).toBe(1);
    } finally {
      cleanup(cleanDir);
      cleanup(brokenDir);
    }
  });

  it("S26: positional paths narrow the run to the templates they affect", () => {
    const dir = createFixtureRepo({
      "src/widgets/widget-a/index.ts": `export {};\n`,
      "src/templates/first/index.ts": `import "../../widgets/widget-a";\nexport {};\n`,
      "src/templates/first/template.hbs": `{{helperOne x}}\n`,
      "src/templates/second/index.ts": `export {};\n`,
      "src/templates/second/template.hbs": `{{helperTwo x}}\n`,
    });
    try {
      const all = runJson(dir);
      expect(all.diagnostics.some((d) => d.message.includes("helperOne"))).toBe(
        true
      );
      expect(all.diagnostics.some((d) => d.message.includes("helperTwo"))).toBe(
        true
      );

      const firstOnly = runJson(dir, [
        path.join(dir, "src/templates/first/template.hbs"),
      ]);
      expect(
        firstOnly.diagnostics.some((d) => d.message.includes("helperOne"))
      ).toBe(true);
      expect(
        firstOnly.diagnostics.some((d) => d.message.includes("helperTwo"))
      ).toBe(false);

      const viaWidget = runJson(dir, [
        path.join(dir, "src/widgets/widget-a/index.ts"),
      ]);
      expect(
        viaWidget.diagnostics.some((d) => d.message.includes("helperOne"))
      ).toBe(true);
      expect(
        viaWidget.diagnostics.some((d) => d.message.includes("helperTwo"))
      ).toBe(false);

      const unmatchedPath = path.join(dir, "src/nowhere.ts");
      fs.mkdirSync(path.dirname(unmatchedPath), { recursive: true });
      fs.writeFileSync(unmatchedPath, "");
      const noMatch = runJson(dir, [unmatchedPath]);
      expect(byRule(noMatch.diagnostics, "unmatched-path")).toHaveLength(1);
      expect(noMatch.diagnostics.every((d) => d.severity !== "error")).toBe(
        true
      );
      expect(noMatch.status).toBe(0);
    } finally {
      cleanup(dir);
    }
  });

  it("S27 (regression): a widget partial resolves a helper registered by a sibling widget", () => {
    const dir = createFixtureRepo({
      "src/widgets/widget-a/index.ts": `import template from "./A.hbs";\nexport {};\n`,
      "src/widgets/widget-a/A.hbs": `{{siblingHelper x}}\n`,
      "src/widgets/widget-b/index.ts": `
        function getHB() { return (window as any).Handlebars; }
        const HB = getHB();
        if (HB) HB.registerHelper("siblingHelper", (x: any) => x);
        export {};
      `,
      "src/templates/main/index.ts": `import "../../widgets/widget-a";\nimport "../../widgets/widget-b";\nexport {};\n`,
      "src/templates/main/template.hbs": `<div></div>\n`,
    });
    try {
      const clean = runJson(dir);
      expect(byRule(clean.diagnostics, "unknown-helper")).toHaveLength(0);
      expect(clean.status).toBe(0);

      writeFixtureFiles(dir, {
        "src/templates/main/index.ts": `import "../../widgets/widget-a";\nexport {};\n`,
      });
      const broken = runJson(dir);
      const helperDiagnostic = byRule(broken.diagnostics, "unknown-helper")[0];
      expect(helperDiagnostic?.message).toContain("siblingHelper");
      expect(helperDiagnostic?.file).toContain("widget-a/A.hbs");
    } finally {
      cleanup(dir);
    }
  });

  it("S28 (regression): a helper passed as a partial's context is checked", () => {
    const widgetSource = `
      function getHB() { return (window as any).Handlebars; }
      const HB = getHB();
      if (HB) HB.registerPartial("FixturePartial", "<span>fixture</span>");
      export {};
    `;
    const dir = createFixtureRepo({
      "src/widgets/widget-a/index.ts": widgetSource,
      "src/templates/main/index.ts": `import "../../widgets/widget-a";\nexport {};\n`,
      "src/templates/main/template.hbs": `{{> FixturePartial (fixtureHelper x) }}\n`,
    });
    try {
      const { diagnostics } = runJson(dir);
      const helperDiagnostics = byRule(diagnostics, "unknown-helper");
      expect(helperDiagnostics).toHaveLength(1);
      expect(helperDiagnostics[0]?.message).toContain("fixtureHelper");
      expect(helperDiagnostics[0]?.line).toBe(1);
      expect(helperDiagnostics[0]?.column).toBeGreaterThan(0);
      expect(byRule(diagnostics, "unknown-partial")).toHaveLength(0);

      writeFixtureFiles(dir, {
        "src/widgets/widget-a/index.ts": `
          function getHB() { return (window as any).Handlebars; }
          const HB = getHB();
          if (HB) {
            HB.registerPartial("FixturePartial", "<span>fixture</span>");
            HB.registerHelper("fixtureHelper", (x: any) => x);
          }
          export {};
        `,
      });
      const clean = runJson(dir);
      expect(byRule(clean.diagnostics, "unknown-helper")).toHaveLength(0);
      expect(clean.status).toBe(0);
    } finally {
      cleanup(dir);
    }
  });

  it("S29: staging a widget .hbs selects the templates that render it", () => {
    const dir = createFixtureRepo({
      "src/widgets/widget-a/index.ts": `import template from "./A.hbs";\nexport {};\n`,
      "src/widgets/widget-a/A.hbs": `{{unregisteredInA x}}\n`,
      "src/widgets/widget-c/index.ts": `import template from "./C.hbs";\nexport {};\n`,
      "src/widgets/widget-c/C.hbs": `{{orphanHelper x}}\n`,
      "src/templates/first/index.ts": `import "../../widgets/widget-a";\nexport {};\n`,
      "src/templates/first/template.hbs": `<div></div>\n`,
      "src/templates/second/index.ts": `export {};\n`,
      "src/templates/second/template.hbs": `{{helperTwo x}}\n`,
    });
    try {
      const run1 = runJson(dir, [path.join(dir, "src/widgets/widget-a/A.hbs")]);
      expect(
        run1.diagnostics.some((d) => d.message.includes("unregisteredInA"))
      ).toBe(true);
      expect(
        run1.diagnostics.some((d) => d.message.includes("helperTwo"))
      ).toBe(false);
      expect(run1.status).toBe(1);

      const run2 = runJson(dir, [path.join(dir, "src/widgets/widget-c/C.hbs")]);
      expect(byRule(run2.diagnostics, "unmatched-path")).toHaveLength(1);
      expect(run2.diagnostics.every((d) => d.severity !== "error")).toBe(true);
      expect(run2.status).toBe(0);
    } finally {
      cleanup(dir);
    }
  });

  it("S13: a field the contract does not declare is reported at the position it appears", () => {
    const line1 = "{{invoiceNumbr}}\n";
    const line2 = "{{invoiceNumber}}\n";
    const dir = createFixtureRepo({
      "schemas/fixture.schema.json": fixtureSchema({
        FlattenedInvoicePayload: {
          type: "object",
          properties: { invoiceNumber: { type: "string" } },
        },
      }),
      "src/templates/main/index.ts": `export {};\n`,
      "src/templates/main/template.hbs": line1 + line2,
    });
    try {
      const { diagnostics } = runJson(dir);
      const fieldDiagnostics = byRule(diagnostics, "unknown-field");
      expect(fieldDiagnostics).toHaveLength(1);
      expect(fieldDiagnostics[0]?.message).toContain("invoiceNumbr");
      expect(fieldDiagnostics[0]?.line).toBe(1);
      expect(fieldDiagnostics[0]?.column).toBe(line1.indexOf("invoiceNumbr"));
    } finally {
      cleanup(dir);
    }
  });

  it("S14: unknown-field is a warning by default and an error under --strict", () => {
    const dir = createFixtureRepo({
      "schemas/fixture.schema.json": fixtureSchema({
        FlattenedInvoicePayload: {
          type: "object",
          properties: { invoiceNumber: { type: "string" } },
        },
      }),
      "src/templates/main/index.ts": `export {};\n`,
      "src/templates/main/template.hbs": `{{invoiceNumbr}}\n`,
    });
    try {
      const loose = runJson(dir);
      const looseField = byRule(loose.diagnostics, "unknown-field")[0];
      expect(looseField?.severity).toBe("warning");
      expect(loose.status).toBe(0);

      const strict = runJson(dir, ["--strict"]);
      const strictField = byRule(strict.diagnostics, "unknown-field")[0];
      expect(strictField?.severity).toBe("error");
      expect(strict.status).toBe(1);

      expect(strictField?.file).toBe(looseField?.file);
      expect(strictField?.line).toBe(looseField?.line);
      expect(strictField?.column).toBe(looseField?.column);
      expect(strictField?.message).toBe(looseField?.message);
    } finally {
      cleanup(dir);
    }
  });

  it("S15: the same leaf name resolves differently inside #each than at the root", () => {
    const dir = createFixtureRepo({
      "schemas/fixture.schema.json": fixtureSchema({
        FlattenedInvoicePayload: {
          type: "object",
          properties: {
            name: { type: "string" },
            items: { type: "array", items: { $ref: "#/definitions/Item" } },
          },
        },
        Item: {
          type: "object",
          properties: { title: { type: "string" } },
        },
      }),
      "src/templates/main/index.ts": `export {};\n`,
      "src/templates/main/template.hbs": `{{name}}\n{{#each items}}{{title}}{{name}}{{/each}}\n`,
    });
    try {
      const { diagnostics } = runJson(dir);
      const fieldDiagnostics = byRule(diagnostics, "unknown-field");
      expect(fieldDiagnostics).toHaveLength(1);
      expect(fieldDiagnostics[0]?.message).toContain("name");
      expect(fieldDiagnostics[0]?.line).toBe(2);
    } finally {
      cleanup(dir);
    }
  });

  it("S16: ../ resolves to the enclosing context, and past a non-context block", () => {
    const dir = createFixtureRepo({
      "schemas/fixture.schema.json": fixtureSchema({
        FlattenedInvoicePayload: {
          type: "object",
          properties: {
            ownerOffset: { type: "number" },
            items: { type: "array", items: { $ref: "#/definitions/Item" } },
          },
        },
        Item: {
          type: "object",
          properties: { flag: { type: "boolean" } },
        },
      }),
      "src/templates/main/index.ts": `export {};\n`,
      "src/templates/main/template.hbs":
        `{{#each items}}\n` +
        `  {{#if flag}}{{../ownerOffset}}{{../../nothingHere}}{{/if}}\n` +
        `{{/each}}\n`,
    });
    try {
      const { diagnostics } = runJson(dir);
      const fieldDiagnostics = byRule(diagnostics, "unknown-field");
      expect(fieldDiagnostics).toHaveLength(0);
    } finally {
      cleanup(dir);
    }
  });

  it("S17: a block parameter is resolved against the node it is bound to", () => {
    const dir = createFixtureRepo({
      "schemas/fixture.schema.json": fixtureSchema({
        FlattenedInvoicePayload: {
          type: "object",
          properties: { billedBy: { $ref: "#/definitions/BilledBy" } },
        },
        BilledBy: {
          type: "object",
          properties: { name: { type: "string" } },
        },
      }),
      "src/templates/main/index.ts": `export {};\n`,
      "src/templates/main/template.hbs": `{{#with billedBy as |b|}}{{b.name}}{{b.nmae}}{{@index}}{{this}}{{/with}}\n`,
    });
    try {
      const { diagnostics } = runJson(dir);
      const fieldDiagnostics = byRule(diagnostics, "unknown-field");
      expect(fieldDiagnostics).toHaveLength(1);
      expect(fieldDiagnostics[0]?.message).toContain("nmae");
    } finally {
      cleanup(dir);
    }
  });

  it("S18: a scope produced by a helper suppresses field validation inside it (EC2)", () => {
    const dir = createFixtureRepo({
      "schemas/fixture.schema.json": fixtureSchema({
        FlattenedInvoicePayload: { type: "object", properties: {} },
      }),
      "src/widgets/status-widget/index.ts": `
        import template from "./Status.hbs";
        function getHB() { return (window as any).Handlebars; }
        const HB = getHB();
        if (HB) HB.registerHelper("computeFixtureThing", (x: any) => x);
        export {};
      `,
      "src/widgets/status-widget/Status.hbs":
        `{{#with (computeFixtureThing this) as |ctx|}}\n` +
        `  {{#each ctx.tags}}{{finalClass}}{{text}}{{/each}}\n` +
        `{{/with}}\n` +
        `{{missingHelperHere x}}\n`,
      "src/templates/main/index.ts": `import "../../widgets/status-widget";\nexport {};\n`,
      "src/templates/main/template.hbs": `<div></div>\n`,
    });
    try {
      const { diagnostics } = runJson(dir);
      expect(byRule(diagnostics, "unknown-field")).toHaveLength(0);
      const helperDiagnostics = byRule(diagnostics, "unknown-helper");
      expect(helperDiagnostics).toHaveLength(1);
      expect(helperDiagnostics[0]?.message).toContain("missingHelperHere");
    } finally {
      cleanup(dir);
    }
  });

  it("S19: a template whose data mapper is unrecognised degrades to structural checks (EC3)", () => {
    const cleanDir = createFixtureRepo({
      "schemas/fixture.schema.json": fixtureSchema({
        FlattenedInvoicePayload: { type: "object", properties: {} },
      }),
      "src/templates/main/index.ts": `window.CeresTemplateDataMapper = someUnknownMapper;\nexport {};\n`,
      "src/templates/main/template.hbs": `{{anyFieldAtAll}}\n`,
    });
    const brokenDir = createFixtureRepo({
      "schemas/fixture.schema.json": fixtureSchema({
        FlattenedInvoicePayload: { type: "object", properties: {} },
      }),
      "src/templates/main/index.ts": `window.CeresTemplateDataMapper = someUnknownMapper;\nexport {};\n`,
      "src/templates/main/template.hbs": `{{unregisteredHelperXYZ x}}\n`,
    });
    try {
      const clean = runJson(cleanDir);
      const rootContextDiagnostics = byRule(
        clean.diagnostics,
        "unknown-root-context"
      );
      expect(rootContextDiagnostics).toHaveLength(1);
      expect(rootContextDiagnostics[0]?.message).toContain("someUnknownMapper");
      expect(byRule(clean.diagnostics, "unknown-field")).toHaveLength(0);
      expect(clean.status).toBe(0);

      const broken = runJson(brokenDir);
      expect(byRule(broken.diagnostics, "unknown-root-context")).toHaveLength(
        1
      );
      const helperDiagnostics = byRule(broken.diagnostics, "unknown-helper");
      expect(helperDiagnostics).toHaveLength(1);
      expect(helperDiagnostics[0]?.message).toContain("unregisteredHelperXYZ");
    } finally {
      cleanup(cleanDir);
      cleanup(brokenDir);
    }
  });

  it("S22: a template using the wrapped root validates against the normalized contract", () => {
    const dir = createFixtureRepo({
      "schemas/fixture.schema.json": fixtureSchema({
        NormalizedInvoiceTemplateState: {
          type: "object",
          properties: {
            invoice: { $ref: "#/definitions/InvoiceX" },
            mapped: { $ref: "#/definitions/MappedX" },
          },
        },
        InvoiceX: {
          type: "object",
          properties: { invoiceNumber: { type: "string" } },
        },
        MappedX: {
          type: "object",
          properties: {
            qr: {
              type: "object",
              properties: { top: { type: "string" } },
            },
          },
        },
      }),
      "src/templates/main/index.ts": `window.CeresTemplateDataMapper = normalizeInvoiceTemplateState;\nexport {};\n`,
      "src/templates/main/template.hbs": `{{invoice.invoiceNumber}}\n{{mapped.qr.top}}\n{{invoiceNumber}}\n`,
    });
    try {
      const { diagnostics } = runJson(dir);
      const fieldDiagnostics = byRule(diagnostics, "unknown-field");
      expect(fieldDiagnostics).toHaveLength(1);
      expect(fieldDiagnostics[0]?.message).toContain("invoiceNumber");
      expect(fieldDiagnostics[0]?.line).toBe(3);
      expect(byRule(diagnostics, "unknown-root-context")).toHaveLength(0);
    } finally {
      cleanup(dir);
    }
  });

  it("S23: a path that runs into an untyped region is skipped rather than guessed at", () => {
    const dir = createFixtureRepo({
      "schemas/fixture.schema.json": fixtureSchema({
        FlattenedInvoicePayload: {
          type: "object",
          properties: { finalTotal: { type: "object" } },
        },
      }),
      "src/templates/main/index.ts": `export {};\n`,
      "src/templates/main/template.hbs": `{{finalTotal.anythingAtAll}}\n{{noSuchRootField.x}}\n`,
    });
    try {
      const { diagnostics } = runJson(dir);
      const fieldDiagnostics = byRule(diagnostics, "unknown-field");
      expect(fieldDiagnostics).toHaveLength(1);
      expect(fieldDiagnostics[0]?.message).toContain("noSuchRootField");
    } finally {
      cleanup(dir);
    }
  });

  it("S24: no package dependency is added", () => {
    const showAtOrigin = (relativePath: string): string =>
      execFileSync("git", ["show", `origin/master:${relativePath}`], {
        cwd: repoRoot,
        encoding: "utf8",
      });

    const originalPackageJson = JSON.parse(showAtOrigin("package.json"));
    const currentPackageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")
    );

    const expectedPackageJson = JSON.parse(JSON.stringify(originalPackageJson));
    expectedPackageJson.scripts["validate:templates"] =
      "node scripts/validate-templates.mjs";
    expectedPackageJson["lint-staged"] = {
      ...expectedPackageJson["lint-staged"],
      "src/{templates,widgets}/**/*.{hbs,ts}": [
        "npm run validate:templates --",
      ],
    };
    expect(currentPackageJson).toEqual(expectedPackageJson);

    const originalLockfile = showAtOrigin("package-lock.json");
    const currentLockfile = fs.readFileSync(
      path.join(repoRoot, "package-lock.json"),
      "utf8"
    );
    expect(currentLockfile).toBe(originalLockfile);
  });

  it("S25: committing a template with an unregistered helper is blocked", () => {
    const dir = createFixtureRepo({
      "src/templates/main/index.ts": `export {};\n`,
      "src/templates/main/template.hbs": `{{misspelledHelper x}}\n`,
    });
    try {
      // Simulates what `lint-staged`'s "src/{templates,widgets}/**/*.{hbs,ts}"
      // entry forwards: `npm run validate:templates -- <staged file>`.
      const { diagnostics, status } = runJson(dir, [
        path.join(dir, "src/templates/main/template.hbs"),
      ]);
      const helperDiagnostics = byRule(diagnostics, "unknown-helper");
      expect(helperDiagnostics).toHaveLength(1);
      expect(helperDiagnostics[0]?.file).toContain("main/template.hbs");
      expect(helperDiagnostics[0]?.line).toBe(1);
      expect(helperDiagnostics[0]?.message).toContain("misspelledHelper");
      expect(status).toBe(1);
    } finally {
      cleanup(dir);
    }
  });

  it("S30 (regression): --strict promotes undeclared fields and nothing else", () => {
    const withField = {
      "schemas/fixture.schema.json": fixtureSchema({
        FlattenedInvoicePayload: {
          type: "object",
          properties: { known: { type: "string" } },
        },
      }),
      "src/templates/main/index.ts": `export {};\n`,
      "src/templates/main/template.hbs": `{{known}}\n{{undeclaredField}}\n`,
      "src/widgets/orphan/index.ts": `import template from "./Orphan.hbs";\nexport {};\n`,
      "src/widgets/orphan/Orphan.hbs": `{{orphanHelperCall x}}\n`,
    };
    const dir = createFixtureRepo(withField);
    try {
      const unmatchedPath = path.join(dir, "src/nowhere.ts");
      fs.mkdirSync(path.dirname(unmatchedPath), { recursive: true });
      fs.writeFileSync(unmatchedPath, "");
      const args = [
        path.join(dir, "src/templates/main/template.hbs"),
        unmatchedPath,
      ];

      const run1 = runJson(dir, args);
      expect(byRule(run1.diagnostics, "unknown-field")).toHaveLength(1);
      expect(byRule(run1.diagnostics, "unmatched-path")).toHaveLength(1);
      const demotedHelper1 = byRule(run1.diagnostics, "unknown-helper");
      expect(demotedHelper1).toHaveLength(1);
      expect(run1.diagnostics.every((d) => d.severity !== "error")).toBe(true);
      expect(run1.status).toBe(0);

      const run2 = runJson(dir, [...args, "--strict"]);
      const strictField = byRule(run2.diagnostics, "unknown-field")[0];
      expect(strictField?.severity).toBe("error");
      const unmatchedStrict = byRule(run2.diagnostics, "unmatched-path")[0];
      expect(unmatchedStrict?.severity).toBe("warning");
      const demotedHelperStrict = byRule(run2.diagnostics, "unknown-helper")[0];
      expect(demotedHelperStrict?.severity).toBe("warning");
      expect(run2.status).toBe(1);

      writeFixtureFiles(dir, {
        "src/templates/main/template.hbs": `{{known}}\n`,
      });
      const run3 = runJson(dir, [...args, "--strict"]);
      expect(byRule(run3.diagnostics, "unknown-field")).toHaveLength(0);
      expect(byRule(run3.diagnostics, "unmatched-path")).toHaveLength(1);
      expect(byRule(run3.diagnostics, "unknown-helper")).toHaveLength(1);
      expect(run3.diagnostics.every((d) => d.severity !== "error")).toBe(true);
      expect(run3.status).toBe(0);
    } finally {
      cleanup(dir);
    }
  });
});

/**
 * A dotted-path mustache with no arguments and no `#`, `/`, `>`, `!`, `{` or
 * `&` sigil — the dot is what makes this unambiguously a field reference
 * rather than a zero-argument helper call (a bare `{{formatDate}}` would
 * match `{{ ident }}` and produce `unknown-helper`, testing the wrong rule).
 * Captures the full mustache text (group 0) alongside the dotted path
 * (group 1) so a mutation can be spliced back in at the exact match
 * position, whitespace and all, rather than a blind string replace that
 * could hit an earlier occurrence of the same path.
 */
const DOTTED_FIELD_PATTERN =
  /\{\{\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)\s*\}\}/g;

type AcceptanceTarget = {
  templatePath: string;
  original: string;
  mutated: string;
  typo: string;
};

/**
 * Finds a `template.hbs` field reference to mutate into a typo, by
 * confirmation rather than by shape: a candidate is accepted only once
 * mutating it and running the validator actually yields an `unknown-field`
 * diagnostic naming the typo. Trying the first dotted path and stopping
 * there would be wrong the moment that path sits inside an EC2-suppressed
 * scope (e.g. `{{#with (helper ...)}}`) — there the diagnostic never
 * appears, and taking the first candidate on faith would produce a test
 * that silently asserts an empty set. See plan.md's `## Implementation`
 * step 1 and its "Trap".
 * @param fromRoot
 */
const discoverAcceptanceTarget = (fromRoot: string): AcceptanceTarget => {
  const templatesDir = path.join(fromRoot, "src/templates");
  const templatePaths = fs
    .readdirSync(templatesDir)
    .filter((name) => fs.statSync(path.join(templatesDir, name)).isDirectory())
    .sort()
    .map((name) => path.join(templatesDir, name, "template.hbs"))
    .filter((candidatePath) => fs.existsSync(candidatePath));

  const searched: string[] = [];

  // eslint-disable-next-line no-restricted-syntax
  for (const templatePath of templatePaths) {
    const original = fs.readFileSync(templatePath, "utf8");
    const matches = Array.from(original.matchAll(DOTTED_FIELD_PATTERN));

    // eslint-disable-next-line no-restricted-syntax
    for (const match of matches) {
      const fieldPath = match[1] as string;
      const segments = fieldPath.split(".");
      const lastIndex = segments.length - 1;
      const typo = `${segments[lastIndex]}X`;
      const mutatedPath = [...segments.slice(0, lastIndex), typo].join(".");
      searched.push(`${templatePath}:${fieldPath}`);

      const matchStart = match.index as number;
      const matchEnd = matchStart + match[0].length;
      const mutatedMatch = match[0].replace(fieldPath, mutatedPath);
      const mutated =
        original.slice(0, matchStart) + mutatedMatch + original.slice(matchEnd);

      fs.writeFileSync(templatePath, mutated);
      try {
        const { diagnostics } = runJson(fromRoot, ["--strict"]);
        const confirmed = diagnostics.find(
          (d) => d.rule === "unknown-field" && d.message.includes(typo)
        );
        if (confirmed) {
          return { templatePath, original, mutated, typo };
        }
      } finally {
        fs.writeFileSync(templatePath, original);
      }
    }
  }

  throw new Error(
    `discoverAcceptanceTarget: no dotted field reference in any template.hbs ` +
      `yielded a confirmed unknown-field diagnostic when typo'd. Searched: ` +
      `${searched.length === 0 ? "(no candidates found)" : searched.join(", ")}`
  );
};

describe("validate-templates.mjs — acceptance (S32/S32b, real repository)", () => {
  it("S32: the acceptance test finds its own mutation target rather than naming one", () => {
    const target = discoverAcceptanceTarget(repoRoot);
    try {
      expect(fs.existsSync(target.templatePath)).toBe(true);
      expect(
        target.templatePath.startsWith(path.join(repoRoot, "src/templates"))
      ).toBe(true);
      expect(target.mutated).not.toBe(target.original);

      fs.writeFileSync(target.templatePath, target.mutated);
      const { diagnostics } = runJson(repoRoot, ["--strict"]);
      const typoDiagnostic = diagnostics.find(
        (d) => d.rule === "unknown-field" && d.message.includes(target.typo)
      );
      expect(typoDiagnostic).toBeDefined();
      expect(typoDiagnostic?.file).toBe(
        path.relative(repoRoot, target.templatePath)
      );
    } finally {
      fs.writeFileSync(target.templatePath, target.original);
    }

    expect(fs.readFileSync(target.templatePath, "utf8")).toBe(target.original);
  });

  it("S32b (regression): S20 still proves what it proved before — clean repo, single-typo break, restore", () => {
    const { templatePath, original, mutated, typo } =
      discoverAcceptanceTarget(repoRoot);

    try {
      const first = runJson(repoRoot);
      expect(
        first.diagnostics.filter((d) => d.severity === "error")
      ).toHaveLength(0);
      expect(first.status).toBe(0);

      fs.writeFileSync(templatePath, mutated);

      const second = runJson(repoRoot, ["--strict"]);
      expect(second.status).toBe(1);
      const typoDiagnostic = second.diagnostics.find((d) =>
        d.message.includes(typo)
      );
      expect(typoDiagnostic).toBeDefined();
      expect(typoDiagnostic?.file).toBe(path.relative(repoRoot, templatePath));
      expect(typoDiagnostic?.severity).toBe("error");

      fs.writeFileSync(templatePath, original);
      const third = runJson(repoRoot);
      expect(
        third.diagnostics.filter((d) => d.severity === "error")
      ).toHaveLength(0);
      expect(third.status).toBe(0);
    } finally {
      fs.writeFileSync(templatePath, original);
    }
  });
});
