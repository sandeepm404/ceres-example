import initDibellaBridge from "./dibellaBridge";
import { initLydiaBridge } from "./lydiaBridge";
import { initDevBridge } from "./ceresDevBridge";
import {
  applyPreviewStyles,
  decodeBase64,
  extractTemplateStyleOptions,
  getQueryParam,
  loadCSS,
  loadScript,
  loadTemplateManifest,
  waitForImages,
} from "./commonUtils";

const OUTPUT_ELEMENT_ID = "documentOutput";
const LYDIA_MODE_PARAM = "isLydiaMode";
const DIBELLA_MODE_PARAM = "isDibellaMode";
const DEBUG_STYLES_PARAM = "debugStyles";
const DEBUG_MAPPING_PARAM = "debugMapping";

const isLydiaMode = Boolean(getQueryParam(LYDIA_MODE_PARAM));
const isDibellaMode = Boolean(getQueryParam(DIBELLA_MODE_PARAM));
const isDevMode = Boolean(getQueryParam("devMode"));

const shouldDebugStyles = getQueryParam(DEBUG_STYLES_PARAM) !== null;
const shouldDebugMapping = getQueryParam(DEBUG_MAPPING_PARAM) !== null;

const getTopLevelKeys = (value: unknown): string[] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.keys(value as Record<string, unknown>).sort();
};

let shouldRender = true;
if (isDevMode) {
  shouldRender = !initDevBridge();
}

if (isDibellaMode && !isLydiaMode && typeof document !== "undefined") {
  document.body?.classList.add("isDibella");
}

const lydiaBridge = isLydiaMode
  ? initLydiaBridge({ outputElementId: OUTPUT_ELEMENT_ID })
  : null;

if (!isLydiaMode && isDibellaMode) {
  initDibellaBridge();
}

const renderDocument = async () => {
  const outputDiv = document.getElementById(OUTPUT_ELEMENT_ID);

  try {
    const { manifest: templateManifest, url: templateManifestUrl } =
      await loadTemplateManifest();

    const encodedApiUrl = getQueryParam("apiUrl");
    if (!encodedApiUrl) {
      throw new Error(
        "Missing required parameter: ?apiUrl=<base64-encoded-url>",
      );
    }

    const apiEndpoint = decodeBase64(encodedApiUrl);
    if (!apiEndpoint) {
      throw new Error("Could not decode apiUrl parameter");
    }

    let templateStylesApplied = false;

    const { assets } = templateManifest;
    if (!assets || !assets.js) {
      throw new Error(
        "Template manifest does not contain required 'assets.js' field",
      );
    }

    const manifestBaseUrl = templateManifestUrl.substring(
      0,
      templateManifestUrl.lastIndexOf("/"),
    );
    const jsUrl = `${manifestBaseUrl}/${assets.js}`;
    const cssUrl = assets.css ? `${manifestBaseUrl}/${assets.css}` : null;

    await Promise.all([
      loadScript(jsUrl),
      cssUrl ? loadCSS(cssUrl) : Promise.resolve(),
    ]);

    const renderWithData = async (payload: any, reason = "payload") => {
      if (!payload) {
        return;
      }

      const templateStyleOptions = extractTemplateStyleOptions(payload);
      if (templateStyleOptions && !templateStylesApplied) {
        if (shouldDebugStyles) {
          console.debug("[CeresStyle]", {
            source: "apiTemplate",
            options: templateStyleOptions,
          });
        }
        applyPreviewStyles(templateStyleOptions);
        templateStylesApplied = true;
      } else if (shouldDebugStyles && !templateStyleOptions) {
        console.debug("[CeresStyle]", {
          source: "apiTemplate",
          options: null,
        });
      }

      const template = (window as any).CeresTemplate;

      if (typeof template !== "function") {
        throw new Error(
          "Template bundle did not export window.CeresTemplate. The template bundle may have failed to load or initialize properly.",
        );
      }

      const mapper = (window as any).CeresTemplateDataMapper;
      const mappedPayload =
        typeof mapper === "function" ? mapper(payload) : payload;

      if (shouldDebugMapping) {
        console.debug("[CeresMapping]", {
          hasMapper: typeof mapper === "function",
          sourceTopLevelKeys: getTopLevelKeys(payload),
          mappedTopLevelKeys: getTopLevelKeys(mappedPayload),
        });
      }

      // Store before rendering so formatCurrency helper can read currency/locale from it
      (window as any).ceresInvoiceData = mappedPayload;
      const html = template(mappedPayload);

      if (outputDiv) {
        outputDiv.innerHTML = html;
        outputDiv.classList.remove("loading-message");
        // DOM elements (data-ceres-field targets) now exist — safe to tell Lydia we're ready.
        // Lydia will flush its queue (e.g. qrCode/irn updates) in response to ceres:ready.
        lydiaBridge?.notifyReady();
      }

      const fontsReady =
        "fonts" in document && document.fonts?.ready
          ? document.fonts.ready
          : Promise.resolve();

      await Promise.all([fontsReady, waitForImages(outputDiv)]);

      lydiaBridge?.reportContentHeight(`render:${reason}`);
    };

    const response = await fetch(apiEndpoint);
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    await renderWithData(data, "api");

    if (shouldDebugStyles && !templateStylesApplied) {
      console.debug("[CeresStyle]", {
        source: "apiTemplate:missing",
        options: null,
      });
    }
  } catch (error: any) {
    console.error("Error rendering document:", error);
    if (outputDiv) {
      outputDiv.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
      outputDiv.classList.remove("loading-message");
    }
    lydiaBridge?.reportContentHeight("error");
  }
};

renderDocument();

export {};
