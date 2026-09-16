const GOOGLE_FONT_WEIGHTS = "300;400;500;600;700";

type RGBAColor = { r: number; g: number; b: number; a?: number };

type PlainObject = Record<string, unknown>;

export const decodeBase64 = (encoded: string | null): string | null => {
  if (!encoded) {
    return null;
  }

  if (encoded.startsWith("http://") || encoded.startsWith("https://")) {
    return encoded;
  }

  try {
    return atob(encoded);
  } catch (error) {
    return encoded;
  }
};

export const getQueryParam = (key: string): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  return params.get(key);
};

export const resolveTemplateManifestUrl = (
  encodedValue: string | null
): string | null => {
  if (!encodedValue) {
    return null;
  }

  const decoded = decodeBase64(encodedValue);
  if (!decoded) {
    return null;
  }

  if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
    return decoded;
  }

  return `./templates/${decoded}/manifest.json`;
};

export const loadTemplateManifest = async () => {
  const encodedManifestUrl =
    getQueryParam("templateManifest") || getQueryParam("template");
  const manifestUrl = resolveTemplateManifestUrl(encodedManifestUrl);

  if (!manifestUrl) {
    throw new Error(
      "No template specified. Please provide ?template=<name> or ?templateManifest=<base64-url>"
    );
  }

  const response = await fetch(manifestUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch template manifest from ${manifestUrl}: ${response.status}`
    );
  }

  const manifest = await response.json();
  return { manifest, url: manifestUrl };
};

export const loadScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });

export const loadCSS = (href: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load CSS: ${href}`));
    document.head.appendChild(link);
  });

export const waitForImages = (
  container: HTMLElement | null,
  timeoutMs = 2000
): Promise<void> =>
  new Promise((resolve) => {
    if (!container) {
      resolve();
      return;
    }

    const images = Array.from(container.querySelectorAll("img"));
    if (images.length === 0) {
      resolve();
      return;
    }

    let pending = images.length;
    let resolved = false;

    const finish = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve();
    };

    const onImageDone = () => {
      pending -= 1;
      if (pending <= 0) {
        finish();
      }
    };

    images.forEach((image) => {
      if (image.complete) {
        onImageDone();
        return;
      }

      image.addEventListener("load", onImageDone, { once: true });
      image.addEventListener("error", onImageDone, { once: true });
    });

    window.setTimeout(finish, timeoutMs);
  });

export const isPlainObject = (value: unknown): value is PlainObject => {
  if (value === null) {
    return false;
  }

  return typeof value === "object" && !Array.isArray(value);
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const toNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toAssetUrl = (value: unknown): string | null => {
  const direct = toNonEmptyString(value);
  if (direct) {
    return direct;
  }

  if (!isPlainObject(value)) {
    return null;
  }

  return toNonEmptyString((value as PlainObject).url);
};

const isRGBAColor = (value: unknown): value is RGBAColor => {
  if (!isPlainObject(value)) {
    return false;
  }

  const { r, g, b } = value as PlainObject;
  return isFiniteNumber(r) && isFiniteNumber(g) && isFiniteNumber(b);
};

export const toCssColor = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!isRGBAColor(value)) {
    return null;
  }

  const red = clamp(Math.round(value.r), 0, 255);
  const green = clamp(Math.round(value.g), 0, 255);
  const blue = clamp(Math.round(value.b), 0, 255);
  const alpha = value.a;

  if (!isFiniteNumber(alpha)) {
    return `rgb(${red}, ${green}, ${blue})`;
  }

  const normalizedAlpha = Math.round(clamp(alpha, 0, 1) * 1000) / 1000;
  return `rgba(${red}, ${green}, ${blue}, ${normalizedAlpha})`;
};

const normalizeFontName = (font: string | undefined): string | null => {
  if (!font) {
    return null;
  }

  const trimmed = font.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const ensureGoogleFontLoaded = (fontName: string) => {
  const normalized = normalizeFontName(fontName);
  if (!normalized) {
    return;
  }

  const id = `ceres-font-${normalized.replace(/\s+/g, "-").toLowerCase()}`;
  if (document.getElementById(id)) {
    return;
  }

  const fontFamilyParam = encodeURIComponent(normalized).replace(/%20/g, "+");
  const href = `https://fonts.googleapis.com/css2?family=${fontFamilyParam}:wght@${GOOGLE_FONT_WEIGHTS}&display=swap`;

  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute("data-ceres-font", normalized);
  document.head.appendChild(link);
};

export const mergeInto = (target: unknown, source: unknown): PlainObject => {
  const base = isPlainObject(target) ? target : {};

  if (!isPlainObject(source)) {
    return base;
  }

  Object.entries(source).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    if (isPlainObject(value)) {
      base[key] = mergeInto(base[key], value);
      return;
    }

    if (Array.isArray(value)) {
      base[key] = value.map((item) =>
        isPlainObject(item) ? mergeInto({}, item) : item
      );
      return;
    }

    base[key] = value;
  });

  return base;
};

export const parsePreviewOptions = (
  encoded: string | null
): PlainObject | null => {
  if (!encoded) {
    return null;
  }

  const decoded = decodeBase64(encoded);
  if (!decoded) {
    return null;
  }

  try {
    const parsed = JSON.parse(decoded);
    if (isPlainObject(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.warn("Unable to parse previewOptions payload", error);
  }

  return null;
};

export const sanitizePreviewOptions = (
  options: PlainObject | null
): PlainObject | null => {
  if (!options) {
    return null;
  }

  const clone = mergeInto({}, options);

  const { templateColor } = clone;
  if (isPlainObject(templateColor)) {
    const colorKeys: Array<
      | "primaryColor"
      | "secondaryColor"
      | "primaryBackground"
      | "secondaryBackground"
    > = [
      "primaryColor",
      "secondaryColor",
      "primaryBackground",
      "secondaryBackground",
    ];

    const sanitizedEntries = colorKeys
      .map((key) => {
        const css = toCssColor((templateColor as PlainObject)[key]);
        return css ? [key, css] : null;
      })
      .filter((entry): entry is [string, string] => Array.isArray(entry));

    if (sanitizedEntries.length > 0) {
      clone.templateColor = {
        ...templateColor,
        ...Object.fromEntries(sanitizedEntries),
      };
    }
  }

  const assetKeys: Array<"letterHead" | "letterHeadFooter" | "logo"> = [
    "letterHead",
    "letterHeadFooter",
    "logo",
  ];

  assetKeys.forEach((key) => {
    const rawValue = (clone as PlainObject)[key];
    let sanitized = toNonEmptyString(rawValue);

    if (!sanitized && isPlainObject(rawValue)) {
      sanitized = toNonEmptyString((rawValue as PlainObject).url);
    }

    if (sanitized) {
      (clone as PlainObject)[key] = sanitized;
    } else {
      delete (clone as PlainObject)[key];
    }
  });

  return clone;
};

export const applyPreviewStyles = (options: PlainObject | null | undefined) => {
  if (
    !options ||
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    return;
  }

  const root = document.documentElement;
  if (!root) {
    return;
  }

  const setVar = (name: string, value: string | null | undefined) => {
    if (!value) {
      return;
    }
    root.style.setProperty(name, value);
  };

  const setColorVar = (name: string, value: unknown) => {
    const cssValue = toCssColor(value);
    if (!cssValue) {
      return;
    }
    setVar(name, cssValue);
  };

  const templateColor = isPlainObject(options.templateColor)
    ? (options.templateColor as PlainObject)
    : null;

  if (templateColor) {
    setColorVar("--primary-color", templateColor.primaryColor);
    setColorVar("--secondary-color", templateColor.secondaryColor);
    setColorVar("--primary-background", templateColor.primaryBackground);
    setColorVar("--secondary-background", templateColor.secondaryBackground);
  }

  const template = (options.template ?? null) as {
    titleFont?: string;
    bodyFont?: string;
  } | null;

  if (template) {
    const titleFont = normalizeFontName(template.titleFont);
    const bodyFont = normalizeFontName(template.bodyFont);
    const templateRecord = template as PlainObject;
    const templatePdfOptions = isPlainObject(templateRecord.pdfOptions)
      ? (templateRecord.pdfOptions as PlainObject)
      : null;

    if (titleFont) {
      ensureGoogleFontLoaded(titleFont);
      const escaped = titleFont.replace(/'/g, "\\'");
      setVar("--title-font", `'${escaped}', sans-serif`);
    }

    if (bodyFont) {
      ensureGoogleFontLoaded(bodyFont);
      const escaped = bodyFont.replace(/'/g, "\\'");
      setVar("--subtitle-font", `'${escaped}', sans-serif`);
    }

    if (!titleFont && bodyFont) {
      const escaped = bodyFont.replace(/'/g, "\\'");
      setVar("--title-font", `'${escaped}', sans-serif`);
    }

    if (templatePdfOptions) {
      const zoomValue = Number(templatePdfOptions.zoomSize);
      const zoomStyleId = "ceres-template-zoom";
      const existingZoom = document.getElementById(zoomStyleId);

      if (!Number.isFinite(zoomValue) || zoomValue <= 0 || zoomValue === 0.8) {
        existingZoom?.remove();
      } else {
        const style = existingZoom ?? document.createElement("style");
        style.id = zoomStyleId;
        style.textContent = `@media print { html { zoom: ${zoomValue}; } }`;
        if (!existingZoom) {
          document.head.appendChild(style);
        }
      }
    }
  }

  // --- Watermark ---
  const watermark = isPlainObject(options.watermark)
    ? (options.watermark as PlainObject)
    : null;

  if (watermark) {
    // Use Boolean() directly — no undefined fallback needed since isEnabled is
    // always present in the real data shape, and an absent/falsy value should
    // be treated as disabled (avoids an untested dead branch).
    const isEnabled = Boolean(watermark.isEnabled);

    const outputEl =
      typeof document !== "undefined"
        ? document.getElementById("documentOutput")
        : null;

    if (!isEnabled) {
      // Clear all watermark state when disabled
      root.style.removeProperty("--watermark-logo");
      root.style.removeProperty("--watermark-opacity");
      root.style.removeProperty("--watermark-rotate");
      root.style.removeProperty("--watermark-scale");
      root.style.removeProperty("--watermark-repeated-pattern");
      root.style.removeProperty("--watermark-z-index");
      // Clear text attr on both elements (screen + print targets)
      outputEl?.removeAttribute("data-watermark-text");
      document.body?.removeAttribute("data-watermark-text");
      return;
      // NOTE: this `return` exits applyPreviewStyles entirely. Colors and fonts
      // are processed before this block so they are not affected.
    }

    const logo = toNonEmptyString(watermark.logo);
    const customText = toNonEmptyString(watermark.customText);

    if (logo) {
      // Image watermark: set logo URL, raise z-index so image overlays content, clear stale text.
      root.style.setProperty("--watermark-logo", `url(${toAssetUrl(logo)})`);
      root.style.setProperty("--watermark-z-index", "5");
      outputEl?.removeAttribute("data-watermark-text");
      document.body?.removeAttribute("data-watermark-text");
    } else if (customText) {
      // Text watermark: clear logo var and z-index override; set data attribute on both elements.
      // outputEl (#documentOutput) drives the screen ::before pseudo-element.
      // document.body drives the print ::before pseudo-element (position:fixed).
      root.style.removeProperty("--watermark-logo");
      root.style.removeProperty("--watermark-z-index");
      outputEl?.setAttribute("data-watermark-text", customText);
      document.body?.setAttribute("data-watermark-text", customText);
    }

    // Numeric properties — use setProperty directly, NOT setVar, because setVar
    // guards with `if (!value)` which treats "0" as falsy and would silently skip
    // opacity:0, rotation:0 etc.
    const opacity =
      typeof watermark.opacity === "number" ? watermark.opacity / 100 : 0.1;
    root.style.setProperty("--watermark-opacity", String(opacity));

    const rotation =
      typeof watermark.rotation === "number" ? watermark.rotation : 0;
    root.style.setProperty("--watermark-rotate", `${rotation}deg`);

    const scale = typeof watermark.scale === "number" ? watermark.scale : 1;
    root.style.setProperty("--watermark-scale", String(scale));

    const repeatedPattern = watermark.repeatedPatterns
      ? "repeat-y"
      : "no-repeat";
    root.style.setProperty("--watermark-repeated-pattern", repeatedPattern);
  }
};

export const applyPreviewAssets = (
  template: PlainObject | null | undefined
): boolean => {
  if (
    !template ||
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    return false;
  }

  const hasLetterHead = Object.prototype.hasOwnProperty.call(
    template,
    "letterHead"
  );
  const hasLetterHeadFooter = Object.prototype.hasOwnProperty.call(
    template,
    "letterHeadFooter"
  );

  if (!hasLetterHead && !hasLetterHeadFooter) {
    return false;
  }

  let didUpdate = false;

  const updateAsset = (
    dataKey: "letterHead" | "letterHeadFooter",
    selector: string,
    containerSelector: string
  ) => {
    if (!Object.prototype.hasOwnProperty.call(template, dataKey)) {
      return;
    }

    const img = document.querySelector(selector);
    if (!(img instanceof HTMLImageElement)) {
      return;
    }

    const url = toAssetUrl((template as PlainObject)[dataKey]);
    const container = img.closest(containerSelector) as HTMLElement | null;

    if (url) {
      if (img.src !== url) {
        img.src = url;
      }
      if (container) {
        container.style.removeProperty("display");
        container.classList.remove("is-empty");
      }
    } else {
      img.removeAttribute("src");
      if (container) {
        container.classList.add("is-empty");
      }
    }

    didUpdate = true;
  };

  updateAsset(
    "letterHead",
    'img[data-ceres-height="letterhead"]',
    ".invoice-letterhead"
  );
  updateAsset(
    "letterHeadFooter",
    'img[data-ceres-height="letterhead-footer"]',
    ".invoice-letterhead-footer"
  );

  return didUpdate;
};

/**
 * DOM targeting convention for Lydia-pushed field updates.
 *
 * Templates must mark updatable elements with data attributes:
 *   - img[data-ceres-field="qrCode"]           → QR code image
 *   - [data-ceres-field="irn"]                 → IRN text node
 *   - [data-ceres-field-container="qrCode"]    → wrapper toggled with is-empty class
 *
 * Element targeting uses data-ceres-field attributes (similar to data-ceres-height in applyPreviewAssets).
 * Container targeting uses data-ceres-field-container attributes (not class selectors — intentionally explicit).
 * Adding support for a new field: add data-ceres-field="<key>" to the template element,
 * then register a handler in lydiaBridge.ts using registerInvoiceFieldHandler.
 */

/**
 * Updates the QR code image in the rendered template.
 * Targets img[data-ceres-field="qrCode"] — templates must use this attribute.
 * Toggles is-empty on the nearest [data-ceres-field-container="qrCode"] when value is absent.
 *
 * @param value - QR code data URL, or null/undefined to hide
 */
export const applyQrCodeUpdate = (value: unknown): void => {
  const qrImg = document.querySelector<HTMLImageElement>(
    'img[data-ceres-field="qrCode"]'
  );
  if (!qrImg) return;

  const container = qrImg.closest<HTMLElement>(
    '[data-ceres-field-container="qrCode"]'
  );

  if (typeof value === "string" && value.length > 0) {
    qrImg.src = value;
    container?.classList.remove("is-empty");
  } else {
    // removeAttribute (not src = "") so the browser doesn't refetch the current
    // page URL — matches the pattern in applyPreviewAssets.
    qrImg.removeAttribute("src");
    container?.classList.add("is-empty");
  }
};

/**
 * Updates the ZATCA QR code image in the rendered template.
 * Targets img[data-ceres-field="zatcaQrCode"] — templates must use this attribute.
 * Toggles is-empty on the nearest [data-ceres-field-container="zatcaQrCode"] when value is absent.
 */
export const applyZatcaQrCodeUpdate = (value: unknown): void => {
  const qrImg = document.querySelector<HTMLImageElement>(
    'img[data-ceres-field="zatcaQrCode"]'
  );
  if (!qrImg) return;

  const container = qrImg.closest<HTMLElement>(
    '[data-ceres-field-container="zatcaQrCode"]'
  );

  if (typeof value === "string" && value.length > 0) {
    qrImg.src = value;
    container?.classList.remove("is-empty");
  } else {
    // removeAttribute (not src = "") so the browser doesn't refetch the current
    // page URL — matches the pattern in applyPreviewAssets.
    qrImg.removeAttribute("src");
    container?.classList.add("is-empty");
  }
};

/**
 * Updates the LHDN QR code image in the rendered template.
 * Targets img[data-ceres-field="lhdnQrCode"] — templates must use this attribute.
 * Toggles is-empty on the nearest [data-ceres-field-container="lhdnQrCode"] when value is absent.
 */
export const applyLhdnQrCodeUpdate = (value: unknown): void => {
  const qrImg = document.querySelector<HTMLImageElement>(
    'img[data-ceres-field="lhdnQrCode"]'
  );
  if (!qrImg) return;

  const container = qrImg.closest<HTMLElement>(
    '[data-ceres-field-container="lhdnQrCode"]'
  );

  if (typeof value === "string" && value.length > 0) {
    qrImg.src = value;
    container?.classList.remove("is-empty");
  } else {
    // removeAttribute (not src = "") so the browser doesn't refetch the current
    // page URL — matches the pattern in applyPreviewAssets.
    qrImg.removeAttribute("src");
    container?.classList.add("is-empty");
  }
};

/**
 * Updates the document QR code image in the rendered template.
 * Targets img[data-ceres-field="documentQr"] — templates must use this attribute.
 * Toggles is-empty on the nearest [data-ceres-field-container="documentQr"] when value is absent.
 */
export const applyDocumentQrUpdate = (value: unknown): void => {
  const qrImg = document.querySelector<HTMLImageElement>(
    'img[data-ceres-field="documentQr"]'
  );
  if (!qrImg) return;

  const container = qrImg.closest<HTMLElement>(
    '[data-ceres-field-container="documentQr"]'
  );

  if (typeof value === "string" && value.length > 0) {
    qrImg.src = value;
    container?.classList.remove("is-empty");
  } else {
    // removeAttribute (not src = "") so the browser doesn't refetch the current
    // page URL — matches the pattern in applyPreviewAssets.
    qrImg.removeAttribute("src");
    container?.classList.add("is-empty");
  }
};

/**
 * Updates the IRN text node in the rendered template.
 * Targets [data-ceres-field="irn"] — templates must use this attribute.
 *
 * @param value - IRN string, or null/undefined to clear
 */
export const applyIrnUpdate = (value: unknown): void => {
  const irnEl = document.querySelector<HTMLElement>('[data-ceres-field="irn"]');
  if (!irnEl) return;

  irnEl.textContent = typeof value === "string" ? value : "";
};

const applyShowPaymentsTableUpdate = (value: unknown): void => {
  if (typeof value !== "boolean") return;
  const container = document.querySelector<HTMLElement>(
    "[data-ceres-payment-table]"
  );
  if (container) {
    container.style.display = value ? "" : "none";
  }
};

const applyTaxSummaryViewUpdate = (value: unknown): void => {
  if (typeof value !== "string") return;
  const show = value === "TABLE" || value === "BOTH";
  const container = document.querySelector<HTMLElement>(
    "[data-ceres-tax-summary]"
  );
  if (container) {
    container.style.display = show ? "" : "none";
  }
};

const applyShowHsnSummaryUpdate = (value: unknown): void => {
  if (typeof value !== "boolean") return;
  const container = document.querySelector<HTMLElement>(
    "[data-ceres-hsn-summary]"
  );
  if (container) {
    container.style.display = value ? "" : "none";
  }
};

export const applyAdvanceOptionsUpdate = (value: unknown): void => {
  if (!isPlainObject(value)) return;
  const opts = value as Record<string, unknown>;
  applyShowPaymentsTableUpdate(opts.showPaymentsTable);
  applyTaxSummaryViewUpdate(opts.taxSummaryView);
  applyShowHsnSummaryUpdate(opts.showHsnSummary);
};

export const extractTemplateStyleOptions = (
  payload: unknown
): PlainObject | null => {
  if (!isPlainObject(payload)) {
    return null;
  }

  const template = isPlainObject(payload.template)
    ? (payload.template as PlainObject)
    : null;
  if (!template) {
    return null;
  }

  const colorKeys: Array<
    | "primaryColor"
    | "secondaryColor"
    | "primaryBackground"
    | "secondaryBackground"
  > = [
    "primaryColor",
    "secondaryColor",
    "primaryBackground",
    "secondaryBackground",
  ];

  const templateColorSource = isPlainObject(template.templateColor)
    ? (template.templateColor as PlainObject)
    : null;

  const templateColor: PlainObject = {};
  colorKeys.forEach((key) => {
    if (templateColorSource && key in templateColorSource) {
      templateColor[key] = templateColorSource[key];
      return;
    }

    if (key in template) {
      templateColor[key] = template[key];
    }
  });

  const templateFonts: PlainObject = {};
  if ("titleFont" in template) {
    templateFonts.titleFont = template.titleFont;
  }
  if ("bodyFont" in template) {
    templateFonts.bodyFont = template.bodyFont;
  }

  if (isPlainObject(template.pdfOptions)) {
    const pdfOptions = template.pdfOptions as PlainObject;
    if ("zoomSize" in pdfOptions) {
      templateFonts.pdfOptions = { zoomSize: pdfOptions.zoomSize };
    }
  }

  const result: PlainObject = {};
  if (Object.keys(templateColor).length > 0) {
    result.templateColor = templateColor;
  }

  if (Object.keys(templateFonts).length > 0) {
    result.template = templateFonts;
  }

  // Extract watermark — must be before the null-return guard so a payload
  // with only watermark (no colors/fonts) still returns a non-null result.
  if (isPlainObject(template.watermark)) {
    result.watermark = template.watermark;
  }

  return Object.keys(result).length > 0 ? result : null;
};

export type PreviewOptions = PlainObject | null;
