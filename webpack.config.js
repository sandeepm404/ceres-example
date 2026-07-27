const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { RawSource } = require("webpack").sources;

// Env switches (simplified)
// Removed BUILD_SYSTEM_ONLY legacy flag
const ONLY_TEMPLATES = process.env.BUILD_TEMPLATES_ONLY === "1"; // build only templates
const ONLY_MAIN = process.env.BUILD_MAIN_ONLY === "1"; // build just main renderer
const ONLY_WIDGETS = process.env.BUILD_WIDGETS_ONLY === "1"; // build just widgets
const ONLY_TEMPLATE = process.env.TEMPLATE; // npm run build:template --template=<name>
const ONLY_WIDGET = process.env.WIDGET; // npm run build:widget --widget=<name>
const ONLY_VENDOR = process.env.BUILD_VENDOR_ONLY === "1"; // build just vendor chunks
const PURGE_OLD = process.env.PURGE_OLD_ASSETS === "1"; // optional cleanup flag

// --- Template SemVer Helpers (enhanced) ----------------------------------------------
/**
 *
 * @param name
 */
function isValidTemplateName(name) {
  return /^[a-z0-9-]+$/i.test(name);
}
/**
 *
 * @param fp
 */
function safeReadJSON(fp) {
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return null;
  }
}
// Compute a stable hash of a directory (used for templates & widgets source digest)
/**
 *
 * @param dir
 * @param root0
 * @param root0.ignoreFiles
 * @param root0.ignoreDirs
 */
function hashDirectory(dir, { ignoreFiles = [], ignoreDirs = [] } = {}) {
  const hash = crypto.createHash("md5");

  /**
   *
   * @param currentDir
   */
  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir).sort(); // sort = stable order
    for (const entry of entries) {
      if (ignoreDirs.includes(entry)) continue;
      if (ignoreFiles.includes(entry)) continue;

      const fullPath = path.join(currentDir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        const relPath = path.relative(dir, fullPath);
        hash.update(relPath);
        hash.update(fs.readFileSync(fullPath));
      }
    }
  }

  if (fs.existsSync(dir)) {
    walk(dir);
  }

  return hash.digest("hex").substring(0, 8);
}

/**
 *
 * @param filePath
 */
function readVersionFile(filePath) {
  const data = safeReadJSON(filePath);
  if (!data || typeof data.version !== "string") return null;
  return /^\d+\.\d+\.\d+$/.test(data.version) ? data.version : null;
}

// New: template meta helpers (version + digest)
/**
 *
 * @param templateName
 */
function getTemplateVersionFile(templateName) {
  return path.join(__dirname, "src", "templates", templateName, "version.json");
}

/**
 *
 * @param templateName
 */
function readTemplateVersionMeta(templateName) {
  const versionFile = getTemplateVersionFile(templateName);
  const data = safeReadJSON(versionFile) || {};
  let version = "1.0.0";

  if (
    typeof data.version === "string" &&
    /^\d+\.\d+\.\d+$/.test(data.version)
  ) {
    version = data.version;
  }

  return {
    versionFile,
    version,
    digest: typeof data.digest === "string" ? data.digest : null,
    pinned: data.pinned === true,
  };
}

/**
 *
 * @param templateName
 * @param version
 * @param digest
 * @param pinned
 */
function writeTemplateVersionMeta(templateName, version, digest, pinned) {
  const versionFile = getTemplateVersionFile(templateName);
  const meta = pinned ? { version, digest, pinned: true } : { version, digest };
  try {
    fs.mkdirSync(path.dirname(versionFile), { recursive: true });
    fs.writeFileSync(versionFile, JSON.stringify(meta, null, 2));
  } catch (e) {
    // Non-fatal: build continues; version will still be used in-memory
  }
}

/**
 *
 * @param templateName
 */
function computeTemplateSourceDigest(templateName) {
  const baseDir = path.join(__dirname, "src", "templates", templateName);
  // Ignore version.json so bumping version doesn't change digest
  return hashDirectory(baseDir, {
    ignoreFiles: ["version.json"],
    ignoreDirs: ["node_modules", "dist"],
  });
}

/**
 *
 * @param v
 */
function bumpPatchVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v || "");
  if (!m) return "1.0.1"; // initialize sequence if corrupt
  return `${m[1]}.${m[2]}.${parseInt(m[3], 10) + 1}`;
}

// Only bump template semver when digest changes
/**
 *
 * @param templateEntryNames
 */
function computeTemplateVersionMap(templateEntryNames) {
  const map = {};
  templateEntryNames.forEach((entryKey) => {
    // entryKey pattern: templates/<name>/bundle
    if (!entryKey.startsWith("templates/")) return;
    const parts = entryKey.split("/");
    if (parts.length < 3) return;
    const templateName = parts[1];
    if (!isValidTemplateName(templateName)) return;
    if (map[templateName]) return; // guard duplicate

    const newDigest = computeTemplateSourceDigest(templateName);
    const meta = readTemplateVersionMeta(templateName);

    let nextVersion = meta.version;
    // "pinned": true in version.json freezes the version, so every build keeps
    // overwriting the same folder. Consumers that stored a versioned manifest
    // URL keep resolving; deploys replace the site, so unpinned bumps strand
    // those URLs. Remove the flag (and set the version by hand) to resume.
    if (meta.pinned) {
      if (meta.digest !== newDigest) {
        console.log(`[version] ${templateName}: content changed, held at ${meta.version} (pinned)`);
      }
    } else if (meta.digest && meta.digest !== newDigest) {
      // If we already have a digest and it changed, bump
      nextVersion = bumpPatchVersion(meta.version);
    }
    // If there was no digest, just record it without bumping
    writeTemplateVersionMeta(templateName, nextVersion, newDigest, meta.pinned);

    map[templateName] = nextVersion;
  });
  return map;
}

let templateVersionMap = {}; // populated only if templates are built
// --------------------------------------------------------------------------------------

// --- Widget SemVer Helpers (new) -----------------------------------------------------
// --- Widget SemVer Helpers (digest + semver-on-change) ------------------------------
/**
 *
 * @param widgetName
 */
function getWidgetVersionFile(widgetName) {
  return path.join(__dirname, "src", "widgets", widgetName, "version.json");
}

/**
 *
 * @param widgetName
 */
function readWidgetVersionMeta(widgetName) {
  const versionFile = getWidgetVersionFile(widgetName);
  const data = safeReadJSON(versionFile) || {};
  let version = "1.0.0";

  if (
    typeof data.version === "string" &&
    /^\d+\.\d+\.\d+$/.test(data.version)
  ) {
    version = data.version;
  }

  return {
    versionFile,
    version,
    digest: typeof data.digest === "string" ? data.digest : null,
  };
}

/**
 *
 * @param widgetName
 * @param version
 * @param digest
 */
function writeWidgetVersionMeta(widgetName, version, digest) {
  const versionFile = getWidgetVersionFile(widgetName);
  try {
    fs.mkdirSync(path.dirname(versionFile), { recursive: true });
    fs.writeFileSync(versionFile, JSON.stringify({ version, digest }, null, 2));
  } catch (e) {
    // Non-fatal
  }
}

/**
 *
 * @param widgetName
 */
function computeWidgetSourceDigest(widgetName) {
  const baseDir = path.join(__dirname, "src", "widgets", widgetName);
  return hashDirectory(baseDir, {
    ignoreFiles: ["version.json"],
    ignoreDirs: ["node_modules", "dist"],
  });
}

/**
 *
 * @param widgetEntryNames
 */
function computeWidgetVersionMap(widgetEntryNames) {
  const map = {};
  widgetEntryNames.forEach((entryKey) => {
    // entryKey pattern: widgets/<name>/bundle
    if (!entryKey.startsWith("widgets/")) return;
    const parts = entryKey.split("/");
    if (parts.length < 3) return;
    const widgetName = parts[1];
    if (!isValidTemplateName(widgetName)) return;
    if (map[widgetName]) return; // guard duplicate

    const newDigest = computeWidgetSourceDigest(widgetName);
    const meta = readWidgetVersionMeta(widgetName);

    let nextVersion = meta.version;
    if (meta.digest && meta.digest !== newDigest) {
      nextVersion = bumpPatchVersion(meta.version);
    }
    writeWidgetVersionMeta(widgetName, nextVersion, newDigest);

    map[widgetName] = nextVersion;
  });
  return map;
}
let widgetVersionMap = {}; // populated only if widgets are built
// --------------------------------------------------------------------------------------

// Discover template entry points
/**
 *
 */
function getTemplateEntries() {
  const base = path.join(__dirname, "src/templates");
  if (!fs.existsSync(base)) return {};
  const dirs = fs
    .readdirSync(base)
    .filter((d) => fs.statSync(path.join(base, d)).isDirectory());
  const filtered = ONLY_TEMPLATE
    ? dirs.filter((d) => d === ONLY_TEMPLATE)
    : dirs;
  return filtered.reduce((acc, dir) => {
    const entry = path.join(base, dir, "index.ts");
    if (fs.existsSync(entry)) acc[`templates/${dir}/bundle`] = entry;
    return acc;
  }, {});
}

// Discover widget entry points (per widget)
/**
 *
 */
function getWidgetEntries() {
  const base = path.join(__dirname, "src/widgets");
  if (!fs.existsSync(base)) return {};
  const dirs = fs
    .readdirSync(base)
    .filter((d) => fs.statSync(path.join(base, d)).isDirectory());
  const filtered = ONLY_WIDGET ? dirs.filter((d) => d === ONLY_WIDGET) : dirs;
  return filtered.reduce((acc, dir) => {
    const entry = path.join(base, dir, "index.ts");
    if (fs.existsSync(entry)) acc[`widgets/${dir}/bundle`] = entry;
    return acc;
  }, {});
}

// Discover vendor entry points (self-hosted shared dependencies)
/**
 *
 */
function getVendorEntries() {
  const base = path.join(__dirname, "src/vendor");
  if (!fs.existsSync(base)) return {};
  const dirs = fs
    .readdirSync(base)
    .filter((d) => fs.statSync(path.join(base, d)).isDirectory());
  return dirs.reduce((acc, dir) => {
    const entry = path.join(base, dir, "index.ts");
    if (fs.existsSync(entry)) acc[`vendor/${dir}/bundle`] = entry;
    return acc;
  }, {});
}

// Decide entries
let templateEntries = {};
if (ONLY_TEMPLATES || ONLY_TEMPLATE) templateEntries = getTemplateEntries();
else if (ONLY_MAIN || ONLY_WIDGETS || ONLY_VENDOR) templateEntries = {};
else templateEntries = getTemplateEntries();

let widgetEntries = {};
if (ONLY_WIDGETS) widgetEntries = getWidgetEntries();
else if (ONLY_MAIN || ONLY_TEMPLATES || ONLY_TEMPLATE || ONLY_VENDOR)
  widgetEntries = {};
else widgetEntries = getWidgetEntries();

let vendorEntries = {};
if (ONLY_VENDOR) vendorEntries = getVendorEntries();
else if (ONLY_MAIN || ONLY_TEMPLATES || ONLY_TEMPLATE || ONLY_WIDGETS)
  vendorEntries = {};
else vendorEntries = getVendorEntries();

let systemEntries = {};
if (ONLY_TEMPLATES || ONLY_TEMPLATE) systemEntries = {};
else if (ONLY_MAIN)
  systemEntries = { "main-renderer/renderer": "./src/main/index.ts" };
else if (ONLY_WIDGETS || ONLY_VENDOR)
  systemEntries = {};
else
  systemEntries = {
    "main-renderer/renderer": "./src/main/index.ts",
  };

const entries = {
  ...systemEntries,
  ...templateEntries,
  ...widgetEntries,
  ...vendorEntries,
};

// Build version maps ONCE (patch bump) only if we are actually building assets
const templateEntryKeys = Object.keys(templateEntries);
if (templateEntryKeys.length) {
  templateVersionMap = computeTemplateVersionMap(templateEntryKeys);
}
const widgetEntryKeys = Object.keys(widgetEntries);
if (widgetEntryKeys.length) {
  widgetVersionMap = computeWidgetVersionMap(widgetEntryKeys);
}

// Simple plugin to generate asset manifest
class AssetManifestPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap("AssetManifestPlugin", (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: "AssetManifestPlugin",
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        () => {
          const MAIN_ENTRY = "main-renderer/renderer";
          const templateManifests = {}; // tplName -> { version, js, css, jsHash, cssHash }
          const widgetManifests = {}; // widgetName -> { js, css }
          const vendorManifests = {}; // vendorName -> { js, css }
          const globalTemplatesManifest = {}; // Global template manifest

          // Helper to calculate file hash
          const getFileHash = (filePath) => {
            try {
              const asset = compilation.getAsset(filePath);
              if (asset && asset.source) {
                const content = asset.source.source();
                return crypto
                  .createHash("md5")
                  .update(content)
                  .digest("hex")
                  .substring(0, 8);
              }
            } catch (e) {
              // Fallback: no hash
            }
            return null;
          };

          // Helper to copy samples.json if exists
          const copySamples = (templateName) => {
            const srcPath = path.join(
              __dirname,
              "src",
              "templates",
              templateName,
              "samples.json"
            );
            if (fs.existsSync(srcPath)) {
              try {
                const samplesContent = fs.readFileSync(srcPath);
                const samplesAssetPath = `templates/${templateName}/samples.json`;
                compilation.emitAsset(
                  samplesAssetPath,
                  new RawSource(samplesContent)
                );
                return true;
              } catch (e) {
                console.warn(
                  `Failed to copy samples for ${templateName}:`,
                  e.message
                );
              }
            }
            return false;
          };

          // Helper to copy any mock-*.json static data files for local/CI testing
          const copyMockFiles = (templateName) => {
            const srcDir = path.join(
              __dirname,
              "src",
              "templates",
              templateName
            );
            if (!fs.existsSync(srcDir)) return;
            const mockFiles = fs.readdirSync(srcDir).filter(
              (f) => f.startsWith("mock-") && f.endsWith(".json")
            );
            for (const mockFile of mockFiles) {
              try {
                const content = fs.readFileSync(path.join(srcDir, mockFile));
                compilation.emitAsset(
                  `templates/${templateName}/${mockFile}`,
                  new RawSource(content)
                );
              } catch (e) {
                console.warn(
                  `Failed to copy mock file ${mockFile} for ${templateName}:`,
                  e.message
                );
              }
            }
          };

          // Helper to copy thumbnail if exists
          const copyThumbnail = (templateName, version) => {
            const srcPath = path.join(
              __dirname,
              "src",
              "templates",
              templateName,
              "thumbnail.png"
            );
            if (fs.existsSync(srcPath)) {
              try {
                const thumbnailContent = fs.readFileSync(srcPath);
                const thumbnailAssetPath = `templates/${templateName}/${version}/thumbnail.png`;
                compilation.emitAsset(
                  thumbnailAssetPath,
                  new RawSource(thumbnailContent)
                );
                return "thumbnail.png";
              } catch (e) {
                console.warn(
                  `Failed to copy thumbnail for ${templateName}:`,
                  e.message
                );
              }
            }
            return null;
          };

          for (const [entryName, entrypoint] of compilation.entrypoints) {
            const files = entrypoint
              .getFiles()
              .filter((f) => /\.(js|css)$/.test(f));
            if (!files.length) continue;

            const assetRecord = {};
            for (const file of files) {
              if (file.endsWith(".js") && !assetRecord.js)
                assetRecord.js = file;
              if (file.endsWith(".css") && !assetRecord.css)
                assetRecord.css = file;
            }

            if (entryName === MAIN_ENTRY) {
              // Emit flat main manifest
              compilation.emitAsset(
                "main-manifest.json",
                new RawSource(JSON.stringify(assetRecord, null, 2))
              );
              continue;
            }

            if (entryName.startsWith("templates/")) {
              const parts = entryName.split("/");
              if (parts.length >= 3) {
                const templateName = parts[1];
                const version = templateVersionMap[templateName];

                // Copy thumbnail to version directory
                const thumbnailPath = copyThumbnail(templateName, version);
                // Copy samples and mock data files to root template directory
                copySamples(templateName);
                copyMockFiles(templateName);

                // Create versioned manifest structure
                const assets = {
                  js: "bundle.js",
                  css: "bundle.css",
                };
                if (thumbnailPath) {
                  assets.thumbnail = thumbnailPath;
                }

                const digest = {
                  js: getFileHash(assetRecord.js),
                  css: getFileHash(assetRecord.css),
                };

                const versionedManifest = {
                  version,
                  assets,
                  digest,
                };

                // Emit per-version manifest
                compilation.emitAsset(
                  `templates/${templateName}/${version}/manifest.json`,
                  new RawSource(JSON.stringify(versionedManifest, null, 2))
                );

                // Emit legacy fallback version folders up to current version patch number
                // so stale or cached version URLs (e.g., 1.0.5) on static hosts like GitHub Pages never return 404
                const vMatch = /^(\d+\.\d+\.)(\d+)$/.exec(version);
                if (vMatch) {
                  const prefix = vMatch[1];
                  const currentPatch = parseInt(vMatch[2], 10);
                  for (let p = 0; p <= currentPatch; p++) {
                    const legacyVer = `${prefix}${p}`;
                    if (legacyVer === version) continue;
                    compilation.emitAsset(
                      `templates/${templateName}/${legacyVer}/manifest.json`,
                      new RawSource(
                        JSON.stringify(
                          { ...versionedManifest, version: legacyVer },
                          null,
                          2
                        )
                      )
                    );
                    if (assetRecord.js && compilation.assets[assetRecord.js]) {
                      compilation.emitAsset(
                        `templates/${templateName}/${legacyVer}/bundle.js`,
                        compilation.assets[assetRecord.js]
                      );
                    }
                    if (assetRecord.css && compilation.assets[assetRecord.css]) {
                      compilation.emitAsset(
                        `templates/${templateName}/${legacyVer}/bundle.css`,
                        compilation.assets[assetRecord.css]
                      );
                    }
                  }
                }

                // Store for per-template root manifest with direct asset URLs
                globalTemplatesManifest[templateName] = {
                  manifest: `./${version}/manifest.json`,
                  version,
                  assets: {
                    js: `./${version}/bundle.js`,
                    css: `./${version}/bundle.css`,
                    ...(thumbnailPath && {
                      thumbnail: `./${version}/thumbnail.png`,
                    }),
                  },
                };
              }
              continue;
            }

            if (entryName.startsWith("widgets/")) {
              const parts = entryName.split("/");
              if (parts.length >= 3) {
                const widgetName = parts[1];
                widgetManifests[widgetName] = assetRecord;
              }
              continue;
            }

            if (entryName.startsWith("vendor/")) {
              const parts = entryName.split("/");
              if (parts.length >= 3) {
                const vendorName = parts[1];
                vendorManifests[vendorName] = assetRecord;
              }
              continue;
            }
          }

          const emitJSON = (name, obj) =>
            compilation.emitAsset(
              name,
              new RawSource(JSON.stringify(obj, null, 2))
            );

          // Emit per-template root manifests instead of global manifest
          if (Object.keys(globalTemplatesManifest).length) {
            Object.keys(globalTemplatesManifest).forEach((templateName) => {
              const templateManifest = globalTemplatesManifest[templateName];
              emitJSON(
                `templates/${templateName}/manifest.json`,
                templateManifest
              );
            });
            // Emit templates-list.json (array of template names)
            emitJSON(
              "templates-list.json",
              Object.keys(globalTemplatesManifest).sort()
            );
          }

          // Widgets: per-widget manifest (with version) and a summary manifest mapping
          const widgetsSummary = {};
          for (const [w, rec] of Object.entries(widgetManifests)) {
            const version = widgetVersionMap[w] || null;
            emitJSON(`widgets/${w}/manifest.json`, {
              version,
              assets: { [`widgets/${w}/bundle`]: rec },
            });
            widgetsSummary[w] = { ...rec, version };
          }
          if (Object.keys(widgetsSummary).length) {
            emitJSON("widgets-manifest.json", widgetsSummary);
          }

          // Vendor: summary manifest mapping vendorName -> { js, css }
          if (Object.keys(vendorManifests).length) {
            emitJSON("vendor-manifest.json", vendorManifests);
          }

          // Optional purge of old template and widget versions
          if (
            PURGE_OLD &&
            (Object.keys(templateVersionMap).length ||
              Object.keys(widgetVersionMap).length)
          ) {
            const distRoot = compiler.options.output.path;
            const DEBUG = process.env.PURGE_OLD_DEBUG === "1";

            // Purge templates - now purge entire version folders
            for (const tpl of Object.keys(templateVersionMap)) {
              const currentVersion = templateVersionMap[tpl];
              const templateDir = path.join(distRoot, "templates", tpl);
              if (!fs.existsSync(templateDir)) continue;
              try {
                const versionDirs = fs
                  .readdirSync(templateDir)
                  .filter(
                    (d) =>
                      fs.statSync(path.join(templateDir, d)).isDirectory() &&
                      /^\d+\.\d+\.\d+$/.test(d)
                  );

                for (const versionDir of versionDirs) {
                  if (versionDir === currentVersion) {
                    if (DEBUG)
                      console.log(
                        "[purge] keep template version",
                        tpl,
                        versionDir
                      );
                    continue;
                  }

                  const versionPath = path.join(templateDir, versionDir);
                  try {
                    // Remove all files in the version directory
                    const files = fs.readdirSync(versionPath);
                    for (const file of files) {
                      const filePath = path.join(versionPath, file);
                      const relAssetKey = path
                        .relative(distRoot, filePath)
                        .split(path.sep)
                        .join("/");
                      if (compilation.getAsset(relAssetKey)) {
                        compilation.deleteAsset(relAssetKey);
                      }
                      fs.unlinkSync(filePath);
                    }
                    fs.rmdirSync(versionPath);
                    if (DEBUG)
                      console.log(
                        "[purge] removed old template version",
                        tpl,
                        versionDir
                      );
                  } catch (err) {
                    if (DEBUG)
                      console.warn(
                        "[purge] failed remove template version",
                        tpl,
                        versionDir,
                        err && err.message
                      );
                  }
                }
              } catch (e) {
                if (DEBUG)
                  console.warn(
                    "[purge] error scanning template",
                    tpl,
                    e && e.message
                  );
              }
            }

            // Purge widgets (existing logic)
            for (const w of Object.keys(widgetVersionMap)) {
              const currentVersion = widgetVersionMap[w];
              const dir = path.join(distRoot, "widgets", w);
              if (!fs.existsSync(dir)) continue;
              try {
                const anyPattern =
                  /^bundle\.([^.]+\.[^.]+\.[^.]+|[^.]+)\.(js|css)$/;
                for (const f of fs.readdirSync(dir)) {
                  const m = anyPattern.exec(f);
                  if (!m) continue;
                  const token = m[1];
                  const isSemVer = /^\d+\.\d+\.\d+$/.test(token);
                  const keep = isSemVer ? token === currentVersion : false;
                  if (keep) {
                    if (DEBUG) console.log("[purge] keep widget", w, f);
                    continue;
                  }
                  const abs = path.join(dir, f);
                  try {
                    const relAssetKey = path
                      .relative(distRoot, abs)
                      .split(path.sep)
                      .join("/");
                    if (compilation.getAsset(relAssetKey))
                      compilation.deleteAsset(relAssetKey);
                    fs.unlinkSync(abs);
                    if (DEBUG) console.log("[purge] removed old widget", w, f);
                  } catch (err) {
                    if (DEBUG)
                      console.warn(
                        "[purge] failed remove widget",
                        f,
                        err && err.message
                      );
                  }
                }
              } catch (e) {
                if (DEBUG)
                  console.warn(
                    "[purge] error scanning widget",
                    w,
                    e && e.message
                  );
              }
            }
          }
        }
      );
    });
  }
}

// CSP meta tag plugin – injects Content-Security-Policy into index.html
// Computes SHA-256 hashes for all inline <script> blocks so the CSP stays
// in sync with the actual script content across builds.
class CspMetaPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap("CspMetaPlugin", (compilation) => {
      // Hook into HtmlWebpackPlugin's afterEmit to modify the emitted HTML
      const HWP = require("html-webpack-plugin");

      HWP.getHooks(compilation).beforeEmit.tapAsync(
        "CspMetaPlugin",
        (data, cb) => {
          const html = data.html;

          // Extract all inline <script>…</script> content (not <script src="...">)
          const inlineScriptRegex =
            /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
          const hashes = [];
          let match;

          while ((match = inlineScriptRegex.exec(html)) !== null) {
            const scriptContent = match[1];
            if (!scriptContent.trim()) continue;
            const hash = crypto
              .createHash("sha256")
              .update(scriptContent)
              .digest("base64");
            hashes.push(`'sha256-${hash}'`);
          }

          // Build CSP directives
          const scriptSrc = [
            ...hashes,
            "'self'",
          ].join(" ");

          const csp = [
            `script-src ${scriptSrc}`,
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
            "font-src 'self' https://fonts.gstatic.com",
            "connect-src *",
            "img-src 'self' data: https:",
            "default-src 'self'",
          ].join("; ");

          const metaTag = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;

          // Inject right after <head> (or after existing <meta> tags)
          data.html = html.replace(
            /(<head[^>]*>)/i,
            `$1\n    ${metaTag}`
          );

          cb(null, data);
        }
      );
    });
  }
}

// Build dynamic partialDirs for all widgets subfolders
/**
 *
 */
function getWidgetPartialDirs() {
  const base = path.join(__dirname, "src", "widgets");
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base)
    .filter((d) => fs.statSync(path.join(base, d)).isDirectory())
    .map((d) => path.resolve(__dirname, "src/widgets", d));
}

module.exports = {
  mode: "production",
  entry: entries,
  output: {
    path: path.resolve(__dirname, "dist"),
    // Dynamic filename: templates use semver in versioned folders; widgets & system bundles use contenthash for cache busting
    filename: (pathData) => {
      const name =
        pathData.chunk && pathData.chunk.name ? pathData.chunk.name : "[name]";
      if (name.startsWith("templates/")) {
        const parts = name.split("/");
        const tpl = parts[1];
        const version = templateVersionMap[tpl];
        return `templates/${tpl}/${version}/bundle.js`;
      }
      if (name.startsWith("widgets/")) {
        const parts = name.split("/");
        const w = parts[1];
        const version = widgetVersionMap[w];
        return `${name}.${version}.js`;
      }
      if (name.startsWith("vendor/")) {
        const parts = name.split("/");
        const v = parts[1];
        return `vendor/${v}/bundle.[contenthash:8].js`;
      }
      return `${name}.[contenthash:8].js`;
    },
    iife: true,
    clean: false,
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [{ loader: "babel-loader" }],
        exclude: /node_modules/,
      },
      { test: /\.css$/, use: [MiniCssExtractPlugin.loader, "css-loader"] },
      {
        test: /\.hbs$/,
        loader: "handlebars-loader",
        options: {
          runtime: "handlebars/runtime",
          precompileOptions: { knownHelpersOnly: false },
          partialDirs: getWidgetPartialDirs(),
        },
      },
    ],
  },
  resolve: { extensions: [".ts", ".js"], fallback: {} },
  externals: { handlebars: "Handlebars", "handlebars/runtime": "Handlebars" },
  plugins: [
    new MiniCssExtractPlugin({
      filename: (pathData) => {
        const name =
          pathData.chunk && pathData.chunk.name
            ? pathData.chunk.name
            : "[name]";
        if (name.startsWith("templates/")) {
          const parts = name.split("/");
          const tpl = parts[1];
          const version = templateVersionMap[tpl];
          return `templates/${tpl}/${version}/bundle.css`;
        }
        if (name.startsWith("widgets/")) {
          const parts = name.split("/");
          const w = parts[1];
          const version = widgetVersionMap[w];
          return `${name}.${version}.css`;
        }
        if (name.startsWith("vendor/")) {
          const parts = name.split("/");
          const v = parts[1];
          return `vendor/${v}/bundle.[contenthash:8].css`;
        }
        return `${name}.[contenthash:8].css`;
      },
    }),
    new ForkTsCheckerWebpackPlugin(),
    new HtmlWebpackPlugin({
      template: "index.html",
      filename: "index.html",
      inject: false, // We handle script/CSS injection manually
      minify: false,
    }),
    new CspMetaPlugin(),
    new AssetManifestPlugin(),
  ],
  optimization: {
    usedExports: true,
    sideEffects: true,
    concatenateModules: true,
    splitChunks: false,
    runtimeChunk: false,
    minimize: true,
    minimizer: ["...", new CssMinimizerPlugin()],
  },
  devtool: false,
};
