#!/usr/bin/env node
/**
 * Statically validates every Handlebars template and widget partial in the
 * repository: resolves each helper and partial reference against the
 * registry its module graph actually reaches, and reports compiler-style
 * diagnostics without rendering anything.
 *
 * Usage:
 *   node scripts/validate-templates.mjs [paths...]
 *   node scripts/validate-templates.mjs --format json
 *   node scripts/validate-templates.mjs --strict
 *
 * `--strict` is parsed here and acted on by the field-validation phase that
 * extends this walker; on its own this phase only ever emits error-severity
 * rules that `--strict` cannot change (see plan.md's `## Global constraints`).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

// Read off the running Handlebars build rather than a hardcoded list, so a
// version upgrade can add a builtin without this script going stale (NF1).
const BUILTIN_HELPERS = new Set(Object.keys(Handlebars.helpers));

const EMPTY_REGISTRY = {
  helpers: new Set(),
  partials: new Set(),
  modules: new Set(),
};

const MODULE_RESOLUTION_EXTENSIONS = [".ts", ".js", ".hbs"];

// Tolerates a newline between `(` and the string literal — a naive regex
// without `\s*` misses every multi-line registration in this repo (see
// plan.md's `## Blockers in existing code`).
const REGISTRATION_PATTERN = () =>
  /register(Helper|Partial)\(\s*["']([A-Za-z0-9_]+)["']/g;

// Matches every import form used in this repo: `import x from "./y"`,
// `import { x } from "./y"`, and side-effect `import "./y"`.
const IMPORT_SPECIFIER_PATTERN = () =>
  /import\s+(?:[\w*{}\s,]+\s+from\s+)?["']([^"']+)["']/g;

const PARSE_ERROR_LINE_PATTERN = /Parse error on line (\d+)/;

// The mapper→root table is the single permitted piece of repo-specific
// knowledge under NF1 (see plan.md's `## Implementation` step 2): the
// mapping from a normalization function to the schema definition it
// produces exists nowhere machine-readable, so it is named once, here.
const MAPPER_ROOTS = {
  normalizeInvoiceTemplateState: "NormalizedInvoiceTemplateState",
  normalizeInvoicePayload: "FlattenedInvoicePayload",
};

// No mapper assignment means `src/main/index.ts` hands the template the raw
// payload, so its root is the same definition `normalizeInvoicePayload`
// produces. Derived from the table rather than repeated as a literal: NF1
// allows this identifier to exist in exactly one place, and that place is
// MAPPER_ROOTS.
const DEFAULT_ROOT_DEFINITION = MAPPER_ROOTS.normalizeInvoicePayload;

const MAPPER_ASSIGNMENT_PATTERN =
  /CeresTemplateDataMapper\s*=\s*([A-Za-z0-9_]+)/;

const MAX_REF_DEPTH = 20;
const NUMERIC_PART_PATTERN = /^\d+$/;

/**
 * Directories under `src/templates` holding a `template.hbs`, sorted by
 * name (NF3). A directory without `template.hbs` is not a template and is
 * skipped silently.
 * @param {string} root
 */
const discoverTemplates = (root) => {
  const templatesDir = path.join(root, "src/templates");
  if (!fs.existsSync(templatesDir)) return [];

  return fs
    .readdirSync(templatesDir)
    .filter((name) => fs.statSync(path.join(templatesDir, name)).isDirectory())
    .sort()
    .map((name) => {
      const dir = path.join(templatesDir, name);
      const templatePath = path.join(dir, "template.hbs");
      const entryPath = path.join(dir, "index.ts");
      return { name, dir, templatePath, entry: null, entryPath };
    })
    .filter((template) => fs.existsSync(template.templatePath))
    .map(({ entryPath, ...template }) => ({
      ...template,
      entry: fs.existsSync(entryPath) ? entryPath : null,
    }));
};

/**
 * Every `.hbs` under `src/widgets`, discovered recursively so a widget's
 * partial can live directly in its directory. Sorted for NF3.
 * @param {string} root
 */
const discoverWidgetPartials = (root) => {
  const widgetsDir = path.join(root, "src/widgets");
  if (!fs.existsSync(widgetsDir)) return [];

  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith(".hbs") ? [full] : [];
    });

  return walk(widgetsDir).sort();
};

/**
 * Resolves a relative import specifier against the tried extensions, in
 * order. `.hbs` is included for module-graph membership (so a widget's own
 * template is reachable for positional selection) but is never scanned for
 * registrations or further imports — see `collectRegistrations`.
 * @param {string} fromDir
 * @param {string} specifier
 */
const resolveModule = (fromDir, specifier) => {
  const base = path.resolve(fromDir, specifier);
  const candidates = [
    base, // specifier may already carry its extension, e.g. "./Widget.hbs"
    ...MODULE_RESOLUTION_EXTENSIONS.map((ext) => `${base}${ext}`),
    ...MODULE_RESOLUTION_EXTENSIONS.filter((ext) => ext !== ".hbs").map((ext) =>
      path.join(base, `index${ext}`)
    ),
  ];
  return (
    candidates.find(
      (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ) ?? null
  );
};

/**
 * Walks the import graph from a template's `index.ts`, collecting every
 * `registerHelper`/`registerPartial` name reached transitively and every
 * module visited. A worklist over module text, not a TypeScript parse — NF2
 * forbids a new dependency, and a regex scan is self-diagnosing (a computed
 * registration name is reported as a false `unknown-helper` naming the
 * exact line, not silently swallowed).
 * @param {string} entryFile
 */
const collectRegistrations = (entryFile) => {
  const helpers = new Set();
  const partials = new Set();
  const modules = new Set();
  const worklist = [entryFile];

  while (worklist.length > 0) {
    const file = worklist.pop();
    const isNewModule = !modules.has(file) && fs.existsSync(file);
    if (isNewModule) modules.add(file);

    // `.hbs` files register nothing and import nothing themselves — they
    // are recorded in `modules` (so a widget's own template is reachable
    // for positional selection) and never scanned further.
    if (isNewModule && !file.endsWith(".hbs")) {
      const text = fs.readFileSync(file, "utf8");

      Array.from(text.matchAll(REGISTRATION_PATTERN())).forEach(
        ([, kind, name]) => (kind === "Helper" ? helpers : partials).add(name)
      );

      Array.from(text.matchAll(IMPORT_SPECIFIER_PATTERN())).forEach(
        ([, specifier]) => {
          if (!specifier.startsWith(".")) return; // package import, ignored
          const resolved = resolveModule(path.dirname(file), specifier);
          if (resolved) worklist.push(resolved);
        }
      );
    }
  }

  return { helpers, partials, modules };
};

/**
 * Merges the `definitions` object of every `*.schema.json` under
 * `schemas/` into one flat table (step 1; see plan.md's
 * `## Implementation`). Reading the directory rather than naming the two
 * files keeps NF1: a third schema in `ceres-example` is picked up without
 * an edit. A repo with no `schemas/` directory (a phase 1 fixture) yields
 * an empty table rather than throwing — field validation then degrades to
 * every reference resolving `skip`.
 * @param {string} root
 */
function loadSchemas(root) {
  const schemasDir = path.join(root, "schemas");
  const defs = {};
  const byId = {};
  if (!fs.existsSync(schemasDir)) return { defs, byId };

  fs.readdirSync(schemasDir)
    .filter((name) => name.endsWith(".schema.json"))
    .sort()
    .forEach((name) => {
      const parsed = JSON.parse(
        fs.readFileSync(path.join(schemasDir, name), "utf8")
      );
      byId[parsed.$id ?? name] = Object.keys(parsed.definitions ?? {});
      Object.assign(defs, parsed.definitions ?? {});
    });

  return { defs, byId };
}

/**
 * Which schema definition a template's root context renders against (step
 * 2; see plan.md's `## Design corrections` item 1). `src/main/index.ts`
 * passes the payload straight through when no mapper is assigned, so the
 * template sees the flat API shape by default.
 * @param {string} entryFile
 */
function rootDefinitionFor(entryFile) {
  const text = fs.readFileSync(entryFile, "utf8");
  const match = MAPPER_ASSIGNMENT_PATTERN.exec(text);
  if (!match) return { definition: DEFAULT_ROOT_DEFINITION, mapper: null };

  const mapper = match[1];
  const definition = MAPPER_ROOTS[mapper] ?? null;
  return { definition, mapper };
}

/**
 * Builds the field-resolution engine for one run's schema table —
 * `deref`, `propertyOf`, `itemsOf`, `isOpaque`, and the two functions the
 * walker consumes (`resolveFieldPath`, `enterBlock`). Closed over `defs`
 * rather than threading it through every call (steps 3-5).
 * @param {Record<string, object>} defs
 */
function createSchemaEngine(defs) {
  /** Follows `$ref` (`#/definitions/<Name>`) to a concrete node, capped
   * against a cyclic schema hanging the run. */
  const deref = (rawNode) => {
    let current = rawNode;
    let depth = 0;
    while (
      current &&
      typeof current === "object" &&
      typeof current.$ref === "string" &&
      depth < MAX_REF_DEPTH
    ) {
      const match = /^#\/definitions\/(.+)$/.exec(current.$ref);
      current = match ? defs[match[1]] ?? null : null;
      depth += 1;
    }
    return current && typeof current === "object" ? current : null;
  };

  /** The node itself, then each `anyOf`/`allOf`/`oneOf` arm — the first
   * branch that matches wins (step 3). */
  const branchesOf = (node) => [
    node,
    ...(node.anyOf ?? []),
    ...(node.allOf ?? []),
    ...(node.oneOf ?? []),
  ];

  /**
   * Looks up `key` on `node`, seeing through `anyOf`/`allOf`/`oneOf` — a
   * `ts-json-schema-generator` union for every optional-with-alternatives
   * field, so a resolver reading only `properties` fails on real schema
   * nodes.
   */
  const propertyOf = (rawNode, key) => {
    const node = deref(rawNode);
    if (!node) return null;
    const branch = branchesOf(node)
      .map((candidate) => deref(candidate))
      .find((candidate) => candidate?.properties?.[key] !== undefined);
    return branch ? deref(branch.properties[key]) : null;
  };

  /** The element node of an array-typed node, seeing through combinators. */
  const itemsOf = (rawNode) => {
    const node = deref(rawNode);
    if (!node) return null;
    const branch = branchesOf(node)
      .map((candidate) => deref(candidate))
      .find((candidate) => candidate?.items !== undefined);
    return branch ? deref(branch.items) : null;
  };

  /**
   * True for a node with no declared shape — `Record<string, any>` and
   * friends (`ceres-example`'s `finalTotal` is one live example).
   * Resolution stops there and returns `skip`: the contract has stopped
   * describing the shape, so nothing below can be judged.
   */
  const isOpaque = (rawNode) => {
    const node = deref(rawNode);
    if (!node || node.type !== "object") return false;
    return !node.properties && !node.anyOf && !node.allOf && !node.oneOf;
  };

  /**
   * @param {Scope} scope
   * @param {object} pathExpression
   */
  const resolveFieldPath = (scope, pathExpression) => {
    if (pathExpression.data) return { status: "skip" }; // @index, @key, ...

    let currentScope = scope;
    for (let depth = 0; depth < pathExpression.depth; depth += 1) {
      if (!currentScope?.parent) return { status: "skip" };
      currentScope = currentScope.parent;
    }

    const parts = pathExpression.parts ?? [];
    if (parts.length === 0) return { status: "skip" }; // {{this}}

    let current;
    let steps;
    if (currentScope?.params?.has(parts[0])) {
      const bound = currentScope.params.get(parts[0]);
      if (bound === null) return { status: "skip" };
      current = bound;
      steps = parts.slice(1);
    } else if (!currentScope || currentScope.node === null) {
      return { status: "skip" };
    } else {
      current = currentScope.node;
      steps = parts;
    }

    // eslint-disable-next-line no-restricted-syntax
    for (const part of steps) {
      if (isOpaque(current)) return { status: "skip" };
      if (NUMERIC_PART_PATTERN.test(part)) {
        current = itemsOf(current);
        // eslint-disable-next-line no-continue
        continue;
      }
      if (part === "length" && deref(current)?.type === "array") {
        return { status: "ok", node: current };
      }
      const next =
        propertyOf(current, part) ?? propertyOf(itemsOf(current), part);
      if (next === null) return { status: "unknown", failedAt: part };
      current = next;
    }

    return { status: "ok", node: current };
  };

  /** Resolves a block helper's argument path, failing open (`null`) on
   * anything not statically a field reference — a helper call as the
   * argument (`{{#with (computeX this) as |ctx|}}`) is EC2's mechanism. */
  const resolveArgumentNode = (scope, argPath) => {
    if (!argPath || argPath.type !== "PathExpression") return null;
    const resolved = resolveFieldPath(scope, argPath);
    return resolved.status === "ok" ? resolved.node : null;
  };

  /**
   * @param {Scope} scope
   * @param {object} node - the `BlockStatement`
   * @param {object | undefined} program
   */
  const enterBlock = (scope, node, program) => {
    const helperName =
      node.path?.type === "PathExpression" ? node.path.original : null;
    const blockParams = program?.blockParams ?? [];

    if (helperName === "each") {
      const itemNode = itemsOf(resolveArgumentNode(scope, node.params[0]));
      const params = new Map();
      if (blockParams[0]) params.set(blockParams[0], itemNode);
      if (blockParams[1]) params.set(blockParams[1], null); // @index: a number, not an object
      return { node: itemNode, params, parent: scope };
    }

    if (helperName === "with") {
      const withNode = resolveArgumentNode(scope, node.params[0]);
      const params = new Map();
      if (blockParams[0]) params.set(blockParams[0], withNode);
      return { node: withNode, params, parent: scope };
    }

    // Any other block (#if, #unless, a custom helper) does not change
    // context — `../` inside it must skip past it exactly as Handlebars
    // does, so the inner scope's parent is the outer scope's *parent*.
    return { node: scope.node, params: new Map(), parent: scope.parent };
  };

  return { resolveFieldPath, enterBlock };
}

/**
 * Position comes from a three-step fallback, not `lineNumber`/`column`
 * alone: the installed handlebars@4.7.8 leaves both `undefined` for lexer
 * errors (unclosed block, unterminated mustache) and only populates them
 * for the semantic "if doesn't match each" class. The line is still named
 * in the thrown message for the common case, so parsing it out is the
 * common path, not defensive padding (EC6; see plan.md's `## Blockers`).
 * @param {string} absPath
 * @param {Error} error
 */
function buildParseErrorDiagnostic(absPath, error) {
  const message = error instanceof Error ? error.message : String(error);
  const hasPosition =
    typeof error.lineNumber === "number" && typeof error.column === "number";
  const messageMatch = PARSE_ERROR_LINE_PATTERN.exec(message);

  const line = hasPosition ? error.lineNumber : Number(messageMatch?.[1] ?? 1);
  const column = hasPosition ? error.column : 0;

  return {
    file: absPath,
    line,
    column,
    severity: "error",
    rule: "parse-error",
    message: message.split("\n")[0],
  };
}

/**
 * Parses one `.hbs` file, converting a thrown parse error into a
 * `parse-error` diagnostic instead of propagating it — a broken template
 * must not hide the ones after it (R1).
 * @param {string} absPath
 */
function parseTemplate(absPath) {
  const text = fs.readFileSync(absPath, "utf8");
  try {
    return { ast: Handlebars.parse(text) };
  } catch (error) {
    return { diagnostic: buildParseErrorDiagnostic(absPath, error) };
  }
}

function isKnownHelper(name, registry) {
  return BUILTIN_HELPERS.has(name) || registry.helpers.has(name);
}

// walkCallable, walkBlock, walkPartial, checkHelperName, walkChildren and
// walkTemplate recurse into one another by AST shape — mutually recursive,
// so no declaration order avoids a forward reference in the cycle.
/* eslint-disable no-use-before-define */

/**
 * A `MustacheStatement`/`SubExpression` is a call when it carries params or
 * hash pairs; a bare single-part path is ambiguous with a field reference
 * and is left alone here — this phase does not validate fields, and the
 * ambiguity is what phase 2's scope tracker resolves.
 * @param {object} node
 * @param {WalkContext} ctx
 */
function walkCallable(node, ctx) {
  const isCall = node.params.length > 0 || node.hash?.pairs.length > 0;
  if (isCall) {
    checkHelperName(node.path, ctx);
  } else {
    // A bare reference (`{{foo}}`) — phase 2 resolves it as a field.
    walkTemplate(node.path, ctx);
  }

  node.params.forEach((param) => walkTemplate(param, ctx));
  node.hash?.pairs.forEach((pair) => walkTemplate(pair.value, ctx));
}

/**
 * A block's path is always a helper — `{{#foo}}` has no field-reference
 * reading. Params walk against the outer context; program/inverse are the
 * seam phase 2 uses to bind block parameters to schema nodes.
 * @param {object} node
 * @param {WalkContext} ctx
 */
function walkBlock(node, ctx) {
  checkHelperName(node.path, ctx);
  node.params.forEach((param) => walkTemplate(param, ctx));
  node.hash?.pairs.forEach((pair) => walkTemplate(pair.value, ctx));

  // The inverse (`{{else}}`) branch runs in the *outer* context even for
  // `#each`/`#with` — only `node.program` gets the narrowed scope.
  if (node.program) {
    const innerScope = ctx.enterBlock(ctx.scope, node, node.program);
    walkTemplate(node.program, { ...ctx, scope: innerScope });
  }
  if (node.inverse) walkTemplate(node.inverse, ctx);
}

/**
 * `PartialStatement`/`PartialBlockStatement`. A `SubExpression` name
 * (`{{> (lookup . 'x')}}`) is not statically resolvable and is skipped
 * (EC1). Either way, params and hash are still walked afterwards — the
 * committed template passes helper calls as partial context five times,
 * and stopping at the name check would leave those helper calls unchecked
 * (see plan.md's `## Blockers`; S28).
 * @param {object} node
 * @param {WalkContext} ctx
 */
function walkPartial(node, ctx) {
  if (node.name.type === "PathExpression") {
    const name = node.name.original;
    if (!ctx.registry.partials.has(name)) {
      ctx.report({
        file: ctx.file,
        line: node.name.loc?.start.line ?? node.loc?.start.line ?? 1,
        column: node.name.loc?.start.column ?? 0,
        severity: "error",
        rule: "unknown-partial",
        message: `Unknown partial '${name}'`,
      });
    }
  }

  node.params.forEach((param) => walkTemplate(param, ctx));
  node.hash?.pairs.forEach((pair) => walkTemplate(pair.value, ctx));
  if (node.program) walkTemplate(node.program, ctx);
}

/**
 * @param {object | undefined} pathNode
 * @param {WalkContext} ctx
 */
function checkHelperName(pathNode, ctx) {
  if (!pathNode || pathNode.type !== "PathExpression") return; // dynamic, unresolvable
  const name = pathNode.original;
  if (isKnownHelper(name, ctx.registry)) return;

  ctx.report({
    file: ctx.file,
    line: pathNode.loc?.start.line ?? 1,
    column: pathNode.loc?.start.column ?? 0,
    severity: "error",
    rule: "unknown-helper",
    message: `Unknown helper '${name}'`,
  });
}

/**
 * Resolves a bare `PathExpression` against the current schema scope and
 * reports an `unknown-field` warning when the contract does not declare
 * it. Severity is promoted to `error` in a later pass, keyed on the rule
 * rather than here, so `--strict` never touches any other diagnostic
 * (see plan.md's `## Global constraints`).
 * @param {object} pathNode
 * @param {WalkContext} ctx
 */
function checkFieldReference(pathNode, ctx) {
  const result = ctx.resolveFieldPath(ctx.scope, pathNode);
  if (result.status !== "unknown") return;

  ctx.report({
    file: ctx.file,
    line: pathNode.loc?.start.line ?? 1,
    column: pathNode.loc?.start.column ?? 0,
    severity: "warning",
    rule: "unknown-field",
    message: `Unknown field '${pathNode.original}'`,
  });
}

/**
 * Generic fallback: recurse into every array/object child except `loc`.
 * Covers `Program` (via `body`), content/comment statements (no children
 * of interest), and bare `PathExpression` params (fields, ignored here).
 * @param {object} node
 * @param {WalkContext} ctx
 */
function walkChildren(node, ctx) {
  Object.entries(node).forEach(([key, value]) => {
    if (key === "loc") return;
    if (Array.isArray(value))
      value.forEach((child) => walkTemplate(child, ctx));
    else if (value && typeof value === "object") walkTemplate(value, ctx);
  });
}

/**
 * @typedef {{ node: object|null, params: Map<string, object|null>, parent: Scope|null }} Scope
 */

/**
 * @typedef {{ file: string, scope: Scope, registry: { helpers: Set<string>, partials: Set<string> }, resolveFieldPath: Function, enterBlock: Function, report: (d: object) => void }} WalkContext
 */

/**
 * @param {object | null | undefined} node
 * @param {WalkContext} ctx
 */
function walkTemplate(node, ctx) {
  if (!node || typeof node !== "object") return;

  switch (node.type) {
    case "MustacheStatement":
    case "SubExpression":
      walkCallable(node, ctx);
      return;
    case "BlockStatement":
      walkBlock(node, ctx);
      return;
    case "PartialStatement":
    case "PartialBlockStatement":
      walkPartial(node, ctx);
      return;
    case "PathExpression":
      checkFieldReference(node, ctx);
      return;
    case "DecoratorBlock":
    case "Decorator":
      return; // `{{#*inline}}` etc. — deferred, see plan.md's `## Deferred`
    default:
      walkChildren(node, ctx);
  }
}

/* eslint-enable no-use-before-define */

/**
 * Parses and walks one `.hbs` file under one registry and one schema
 * scope, returning its diagnostics. When `demote` is set, registry-derived
 * diagnostics are downgraded to `warning` — the empty-registry leg of EC5:
 * a widget no template reaches is unfinished, not broken, and must not fail
 * a commit that never touched it.
 *
 * `parse-error` is exempt from the demotion. Demotion expresses "this
 * judgement was made without a registry, so do not trust it", but a file
 * that will not parse cannot compile under any registry — plan.md's
 * severity table calls it "Not a judgment call". Demoting it would let an
 * uncompilable `.hbs` pass a commit.
 * @param {string} absPath
 * @param {{ helpers: Set<string>, partials: Set<string> }} registry
 * @param {boolean} demote
 * @param {Scope} scope
 * @param {{ resolveFieldPath: Function, enterBlock: Function }} schemaEngine
 */
const walkFile = (absPath, registry, demote, scope, schemaEngine) => {
  const parsed = parseTemplate(absPath);
  const diagnostics = [];

  if (parsed.diagnostic) {
    diagnostics.push(parsed.diagnostic);
  } else {
    walkTemplate(parsed.ast, {
      file: absPath,
      scope,
      registry,
      resolveFieldPath: schemaEngine.resolveFieldPath,
      enterBlock: schemaEngine.enterBlock,
      report: (diagnostic) => diagnostics.push(diagnostic),
    });
  }

  return demote
    ? diagnostics.map((d) =>
        d.rule === "parse-error" ? d : { ...d, severity: "warning" }
      )
    : diagnostics;
};

/**
 * A positional path selects a template when it is that template's own
 * `template.hbs`/`index.ts`, or when it appears anywhere in that
 * template's module graph — a widget import selects every template that
 * reaches it, which is the correct blast radius for a pre-commit hook.
 * @param {Array<{ templatePath: string, entry: string | null, registrations: { modules: Set<string> } }>} templates
 * @param {string[]} paths
 */
const selectTemplates = (templates, paths) => {
  if (paths.length === 0) return { selected: templates, unmatched: [] };

  const resolved = paths.map((p) => path.resolve(p));
  const selected = new Set();
  const unmatched = [];

  resolved.forEach((p) => {
    const matches = templates.filter(
      (t) =>
        t.templatePath === p || t.entry === p || t.registrations.modules.has(p)
    );
    if (matches.length === 0) unmatched.push(p);
    else matches.forEach((t) => selected.add(t));
  });

  return { selected: templates.filter((t) => selected.has(t)), unmatched };
};

/** Later occurrences of the same (file, line, column, rule) are dropped. */
const dedupeDiagnostics = (diagnostics) => {
  const seen = new Set();
  return diagnostics.filter((d) => {
    const key = `${d.file}|${d.line}|${d.column}|${d.rule}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Deterministic order for NF3: file, then line, then column. */
const sortDiagnostics = (diagnostics) =>
  [...diagnostics].sort(
    (a, b) =>
      a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column
  );

/**
 * @param {string[]} argv
 */
const parseArgs = (argv) => {
  const strict = argv.includes("--strict");
  const formatIndex = argv.indexOf("--format");
  const format = formatIndex === -1 ? "human" : argv[formatIndex + 1];
  const paths = argv.filter(
    (arg, i) =>
      arg !== "--strict" && arg !== "--format" && argv[i - 1] !== "--format"
  );
  return { strict, format, paths };
};

const main = () => {
  const { strict, format, paths } = parseArgs(process.argv.slice(2));

  const { defs } = loadSchemas(repoRoot);
  const schemaEngine = createSchemaEngine(defs);
  // EC2: a widget partial's context comes from whatever helper rendered
  // it, not any schema, so its root scope is always unknown.
  const WIDGET_ROOT_SCOPE = { node: null, params: new Map(), parent: null };

  const templates = discoverTemplates(repoRoot).map((template) => ({
    ...template,
    registrations: template.entry
      ? collectRegistrations(template.entry)
      : EMPTY_REGISTRY,
    rootContext: template.entry
      ? rootDefinitionFor(template.entry)
      : { definition: null, mapper: null },
  }));

  const missingEntryDiagnostics = templates
    .filter((t) => t.entry === null)
    .map((t) => ({
      file: t.templatePath,
      line: 1,
      column: 0,
      severity: "error",
      rule: "missing-entry",
      message: `Template directory '${t.name}' has no index.ts entry file`,
    }));

  // EC3: the mapper assignment matched, but the identifier is not in
  // MAPPER_ROOTS — degrade to structural checks only, with one warning.
  const rootContextDiagnostics = templates
    .filter(
      (t) =>
        t.entry !== null &&
        t.rootContext.mapper !== null &&
        t.rootContext.definition === null
    )
    .map((t) => ({
      file: t.entry,
      line: 1,
      column: 0,
      severity: "warning",
      rule: "unknown-root-context",
      message: `Template '${t.name}' assigns unrecognised data mapper '${t.rootContext.mapper}'; field validation skipped`,
    }));

  const { selected, unmatched } = selectTemplates(templates, paths);
  const templatesInScope = paths.length > 0 ? selected : templates;

  const unmatchedDiagnostics = unmatched.map((p) => ({
    file: p,
    line: 1,
    column: 0,
    severity: "warning",
    rule: "unmatched-path",
    message: `Path did not match any template: ${path.relative(repoRoot, p)}`,
  }));

  const rootScopeFor = (t) => ({
    node: t.rootContext.definition
      ? defs[t.rootContext.definition] ?? null
      : null,
    params: new Map(),
    parent: null,
  });

  // R1: every template is parsed, including one whose directory has no
  // `index.ts`. Its body still has to be reported — a `template.hbs` that
  // cannot compile is a parse error whether or not an entry file names its
  // helpers. EC4 asks only that the missing entry be reported rather than
  // crash the run; it does not license skipping the body.
  //
  // Such a template already carries EMPTY_REGISTRY, so its helper and
  // partial calls resolve against nothing. Those diagnostics are demoted
  // (the same reasoning as EC5's unreached widget: with no entry file we
  // cannot see what was registered, so calling them errors would be a false
  // positive on top of the `missing-entry` error the run already reports).
  // `parse-error` survives the demotion — see `walkFile`.
  const templateBodyDiagnostics = templatesInScope.flatMap((t) =>
    walkFile(
      t.templatePath,
      t.registrations,
      t.entry === null,
      rootScopeFor(t),
      schemaEngine
    )
  );

  const widgetDiagnostics = discoverWidgetPartials(repoRoot).flatMap(
    (hbsPath) => {
      const reaching = templatesInScope.filter((t) =>
        t.registrations.modules.has(hbsPath)
      );
      return reaching.length > 0
        ? dedupeDiagnostics(
            reaching.flatMap((t) =>
              walkFile(
                hbsPath,
                t.registrations,
                false,
                WIDGET_ROOT_SCOPE,
                schemaEngine
              )
            )
          )
        : walkFile(
            hbsPath,
            EMPTY_REGISTRY,
            true,
            WIDGET_ROOT_SCOPE,
            schemaEngine
          );
    }
  );

  const diagnostics = sortDiagnostics(
    dedupeDiagnostics([
      ...missingEntryDiagnostics,
      ...rootContextDiagnostics,
      ...templateBodyDiagnostics,
      ...widgetDiagnostics,
      ...unmatchedDiagnostics,
    ])
  ).map((d) =>
    strict && d.rule === "unknown-field" ? { ...d, severity: "error" } : d
  );

  const output = diagnostics.map((d) => ({
    ...d,
    file: path.relative(repoRoot, d.file).split(path.sep).join("/"),
  }));

  if (format === "json") {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    output.forEach((d) =>
      process.stdout.write(
        `${d.file}:${d.line}:${d.column}  ${d.severity}  ${d.message}\n`
      )
    );
  }

  process.exit(diagnostics.some((d) => d.severity === "error") ? 1 : 0);
};

main();
