/**
 * Lydia Bridge — the communication layer between Ceres and Lydia.
 *
 * When a business uses a custom layout template for their documents (invoices, quotations, etc.),
 * Lydia doesn't render the document itself. Instead, it embeds Ceres inside an <iframe>.
 * Ceres fetches the document data from Serana, renders it using the custom template, and then
 * needs to tell Lydia how tall the content is so the iframe fits naturally — no scrollbars,
 * no clipping. That's what this bridge handles.
 *
 * The lifecycle looks like this:
 *   1. Lydia builds a Ceres URL with ?template=...&apiUrl=... and drops it into an iframe
 *   2. Ceres renders the document template into #documentOutput
 *   3. This bridge wakes up (if ?isLydiaMode is present), measures the content height,
 *      and posts it to Lydia via postMessage
 *   4. Lydia's useIframeHeight hook picks up the message and resizes the iframe
 *   5. When the user prints, this bridge takes over sizing so the PDF comes out clean
 *
 * The bridge only activates when loaded inside Lydia's iframe — it's a no-op otherwise.
 * Pass ?debugHeight in the URL to see what's happening in the console.
 */

import {
  applyAdvanceOptionsUpdate,
  applyPreviewAssets,
  applyPreviewStyles,
  applyQrCodeUpdate,
  applyIrnUpdate,
  applyZatcaQrCodeUpdate,
  applyLhdnQrCodeUpdate,
  applyDocumentQrUpdate,
  extractTemplateStyleOptions,
  getQueryParam,
  isPlainObject,
} from "./commonUtils";

// Query params
const DEBUG_PARAM = "debugHeight";
const DEBUG_STYLES_PARAM = "debugStyles";

// postMessage contract
const HEIGHT_MESSAGE_TYPE = "ceres:content-height";
const HEIGHT_MESSAGE_SOURCE = "ceres";

// Height calculation configuration
const PRINT_HEIGHT_BUFFER = 80;
const PARENT_HEIGHT_BUFFER = 0;
const HEIGHT_REPORT_DEBOUNCE_MS = 120;
const HEIGHT_CHANGE_THRESHOLD = 1;

type CleanupFn = () => void;

export interface LydiaBridgeOptions {
  outputElementId?: string;
}

export interface LydiaBridgeHandle {
  reportContentHeight: (reason?: string) => void;
  triggerPrint: (reason?: string) => void;
  registerInvoiceFieldHandler: (
    field: string,
    handler: (value: unknown) => void
  ) => void;
  notifyReady: () => void;
  destroy: () => void;
}

/**
 * Boots the bridge. Called by Ceres' main renderer after the template is injected.
 * Returns null if we're not inside Lydia's iframe — so it's always safe to call.
 *
 * Height reporting contract:
 * - Ceres posts `ceres:content-height` only after render or when layout changes.
 * - Updates are debounced and only sent when the height meaningfully changes.
 * - Lydia applies the reported height to the iframe.
 * @param options
 */
export function initLydiaBridge(
  options?: LydiaBridgeOptions
): LydiaBridgeHandle | null {
  // Not in a browser — nothing to bridge
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  const shouldDebug = getQueryParam(DEBUG_PARAM) !== null;
  const shouldDebugStyles = getQueryParam(DEBUG_STYLES_PARAM) !== null;
  const outputElementId = options?.outputElementId ?? "documentOutput";

  // Internal state
  let isPreparingForPrint = false;
  let hasSentHeight = false;
  let lastComputedHeight: number | null = null;
  let lastReportedHeight: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let heightReportTimer: number | null = null;
  let pendingReportReason: string | null = null;

  // Handshake state
  let isLydiaReady = false;
  const pendingCeresQueue: Array<() => void> = [];

  // Field handler registry — maps invoiceResponse field keys to DOM update functions.
  // Registered before ceres:ready is sent; dispatched when lydia:invoice-update arrives.
  const invoiceFieldHandlers = new Map<string, (value: unknown) => void>();

  const cleanupFns: CleanupFn[] = [];

  // Note: handler receives `unknown` (not a generic keyed type) because Map<string, fn>
  // cannot express per-key type safety without complex mapped types. Handlers guard internally.
  const registerInvoiceFieldHandler = <K extends string>(
    field: K,
    handler: (value: unknown) => void
  ): void => {
    invoiceFieldHandlers.set(field, handler);
  };

  const handleInvoiceUpdate = (fields: Record<string, unknown>): void => {
    // Unrecognised keys are silently ignored — forward compatible.
    Object.entries(fields).forEach(([key, value]) => {
      const handler = invoiceFieldHandlers.get(key);
      if (handler) handler(value);
    });
  };

  // Logging (only when debug flag is enabled)
  const debugLog = (...args: unknown[]) => {
    if (!shouldDebug) {
      return;
    }
    console.debug("[CeresPrint]", ...args);
  };

  // Measures the full document height using every reliable method available.
  // Different browsers report height differently, so we take the max of all approaches.
  const computeFullHeight = (): number => {
    const { body, documentElement: docEl } = document;
    if (!body || !docEl) return 0;

    return Math.max(
      body.scrollHeight,
      docEl.scrollHeight,
      body.offsetHeight,
      docEl.offsetHeight,
      body.getBoundingClientRect().height,
      docEl.getBoundingClientRect().height
    );
  };

  // Sends a message to the parent window. Includes all necessary guards.
  const sendToParent = (payload: object) => {
    if (window.parent == null || window.parent === window) return;
    if (typeof window.parent.postMessage !== "function") return;
    window.parent.postMessage(payload, "*");
  };

  // Sends immediately if handshake is complete, otherwise queues for later.
  const sendOrQueue = (fn: () => void) => {
    if (isLydiaReady) {
      fn();
    } else {
      pendingCeresQueue.push(fn);
    }
  };

  // Sends the measured height to Lydia so it can resize the iframe to fit.
  // Skips duplicate reports on resize to avoid unnecessary chatter.
  const postHeightToParent = (fullHeight: number, reason = "resize") => {
    if (!Number.isFinite(fullHeight)) {
      return;
    }

    const height = Math.ceil(fullHeight + PARENT_HEIGHT_BUFFER);

    if (lastReportedHeight === height && reason === "resize") {
      return;
    }

    lastReportedHeight = height;

    const payload = {
      source: HEIGHT_MESSAGE_SOURCE,
      type: HEIGHT_MESSAGE_TYPE,
      height,
      reason,
      timestamp: Date.now(),
    };

    sendOrQueue(() => sendToParent(payload));
    debugLog("postHeightToParent", payload);
  };

  // The first height report is special — it's the moment Lydia knows the content is ready.
  // We only send it once; after that, resize events take over.
  const measureAndReportHeight = (reason: string, force: boolean) => {
    const fullHeight = computeFullHeight();

    if (!Number.isFinite(fullHeight) || fullHeight <= 0) {
      return;
    }

    lastComputedHeight = fullHeight;

    const nextReportedHeight = Math.ceil(fullHeight + PARENT_HEIGHT_BUFFER);
    const shouldPost =
      force ||
      lastReportedHeight == null ||
      Math.abs(nextReportedHeight - lastReportedHeight) >
        HEIGHT_CHANGE_THRESHOLD;

    if (!shouldPost) {
      return;
    }

    hasSentHeight = true;
    postHeightToParent(fullHeight, reason);
    debugLog("reportContentHeight", { reason, fullHeight });
  };

  /**
   * Debounced height report. The double rAF ensures layout is settled before measurement.
   * @param reason
   * @param force
   */
  const scheduleHeightReport = (reason = "resize", force = false) => {
    if (hasSentHeight && !force) {
      return;
    }

    pendingReportReason = reason;

    if (heightReportTimer) {
      window.clearTimeout(heightReportTimer);
    }

    heightReportTimer = window.setTimeout(() => {
      heightReportTimer = null;
      const reportReason = pendingReportReason ?? reason;
      pendingReportReason = null;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          measureAndReportHeight(reportReason, force);
        });
      });
    }, HEIGHT_REPORT_DEBOUNCE_MS);
  };

  // Locks the document to a minimum height so the browser doesn't collapse it during print.
  // The extra buffer accounts for browser chrome and margin quirks in print mode.
  const enforceSizing = (fullHeight: number) => {
    const docEl = document.documentElement;
    const { body } = document;

    if (!docEl || !body) {
      return;
    }

    const targetHeight = fullHeight + PRINT_HEIGHT_BUFFER;
    lastComputedHeight = fullHeight;

    docEl.style.minHeight = `${targetHeight}px`;
    body.style.minHeight = `${targetHeight}px`;
  };

  /**
   * Prepares the document for printing. Browsers behave oddly with iframed content —
   * they can clip, collapse, or misalign things. We force everything to auto/visible
   * and then pin the height so the full document makes it to the PDF.
   * Uses min-height so content doesn't collapse.
   * @param reason
   */
  const applyPrintSizing = (reason = "manual") => {
    const docEl = document.documentElement;
    const { body } = document;

    if (!docEl || !body) {
      return;
    }

    isPreparingForPrint = true;

    docEl.style.height = "auto";
    body.style.height = "auto";
    docEl.style.overflow = "visible";
    body.style.overflow = "visible";
    docEl.style.width = "auto";
    body.style.width = "auto";
    body.style.display = "block";
    body.style.alignItems = "stretch";

    const fullHeight = computeFullHeight();
    enforceSizing(fullHeight);

    debugLog("applyPrintSizing", { reason, fullHeight });
  };

  /**
   * Restores document sizing after printing.
   * Undoes the print overrides so the document goes back to normal.
   * @param reason
   */
  const resetSizing = (reason = "manual") => {
    const docEl = document.documentElement;
    const { body } = document;

    if (!docEl || !body) {
      return;
    }

    isPreparingForPrint = false;

    docEl.style.removeProperty("min-height");
    body.style.removeProperty("min-height");
    docEl.style.removeProperty("height");
    body.style.removeProperty("height");
    docEl.style.removeProperty("overflow");
    body.style.removeProperty("overflow");
    docEl.style.removeProperty("width");
    body.style.removeProperty("width");
    body.style.removeProperty("display");
    body.style.removeProperty("align-items");

    debugLog("resetSizing", { reason });
  };

  // The actual print trigger. We apply sizing first, then wait two animation frames
  // to let the browser settle before calling window.print(). One frame isn't enough —
  // the browser needs a full paint cycle to reflect the style changes.
  const triggerPrintInternal = (reason = "manual") => {
    applyPrintSizing(reason);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        debugLog("triggerIframePrint", { reason, height: lastComputedHeight });
        window.print();
      });
    });
  };

  /**
   * Public API used by the renderer to report a stable height once rendering finishes.
   * Called by Ceres' renderer after the template has been injected into the DOM.
   * This is debounced and will only post if height changed.
   * @param reason
   */
  const reportContentHeight = (reason = "render-complete") => {
    scheduleHeightReport(reason, true);
  };

  // Intercepts Ctrl+P / Cmd+P inside the iframe so we can prep the layout before printing.
  // Without this, the browser would print the iframe content as-is, which can look broken.
  const handlePrintKey = (event: KeyboardEvent) => {
    const key = typeof event.key === "string" ? event.key.toLowerCase() : null;
    if (!key || key !== "p") {
      return;
    }

    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    triggerPrintInternal("keydown");
  };

  const handleBeforePrint = () => applyPrintSizing("beforeprint");
  const handleAfterPrint = () => resetSizing("afterprint");

  const isPrintMessage = (
    data: unknown
  ): data is { action: "lydia:print"; reason?: string } => {
    if (!data || typeof data !== "object") {
      return false;
    }
    return (data as { action?: string }).action === "lydia:print";
  };

  const isHeightRequestMessage = (
    data: unknown
  ): data is { action: "lydia:height-request"; reason?: string } => {
    if (!data || typeof data !== "object") {
      return false;
    }
    return (data as { action?: string }).action === "lydia:height-request";
  };

  const isLydiaAckMessage = (
    data: unknown
  ): data is { source: "lydia"; type: "lydia:ack"; version: number } => {
    if (!isPlainObject(data)) return false;
    return data.source === "lydia" && data.type === "lydia:ack";
  };

  const isInvoiceUpdateMessage = (
    data: unknown
  ): data is {
    source: "lydia";
    type: "lydia:invoice-update";
    fields: Record<string, unknown>;
    reason?: string;
  } => {
    if (!isPlainObject(data)) return false;
    return (
      data.source === "lydia" &&
      data.type === "lydia:invoice-update" &&
      typeof data.fields === "object" &&
      data.fields !== null
    );
  };

  const isTemplateUpdateMessage = (
    data: unknown
  ): data is {
    type: "lydia:template-update";
    template?: unknown;
    reason?: string;
  } => {
    if (!isPlainObject(data)) {
      return false;
    }

    return data.type === "lydia:template-update";
  };

  // Listens for print commands from Lydia. When the user hits print in the parent app,
  // Lydia sends { action: 'lydia:print' } so Ceres can prepare the layout first.
  const handleParentMessage = (event: MessageEvent) => {
    const { data } = event;

    if (event.source !== window.parent) {
      return;
    }

    if (isLydiaAckMessage(data)) {
      isLydiaReady = true;
      const queued = pendingCeresQueue.splice(0);
      queued.forEach((fn) => fn());
      return;
    }

    if (isInvoiceUpdateMessage(data)) {
      handleInvoiceUpdate(data.fields);
      return;
    }

    if (isTemplateUpdateMessage(data)) {
      const styleOptions = extractTemplateStyleOptions({
        template: data.template,
      });

      if (shouldDebugStyles) {
        console.debug("[CeresStyle]", {
          source: "postMessage",
          reason: data.reason,
          dialogOptions: styleOptions,
        });
      }

      if (styleOptions) {
        applyPreviewStyles(styleOptions);
      }

      const assetUpdated = applyPreviewAssets(
        isPlainObject(data.template)
          ? (data.template as Record<string, unknown>)
          : null
      );
      if (assetUpdated) {
        reportContentHeight("template-assets");
      }

      return;
    }

    if (isHeightRequestMessage(data)) {
      const { reason } = data;
      reportContentHeight(
        reason ? `parent:${reason}` : "parent:height-request"
      );
      return;
    }

    if (!isPrintMessage(data)) {
      return;
    }

    const { reason } = data;
    triggerPrintInternal(reason ? `parent:${reason}` : "parent");
  };

  const addCleanup = (cleanup: CleanupFn) => {
    cleanupFns.push(cleanup);
  };

  const addListener = (
    target: Window | Document,
    type: string,
    handler: EventListenerOrEventListenerObject,
    eventOptions?: boolean | AddEventListenerOptions
  ) => {
    target.addEventListener(type, handler, eventOptions);
    addCleanup(() => target.removeEventListener(type, handler, eventOptions));
  };

  // Wire up all the event listeners. Everything gets tracked for cleanup on destroy.
  addListener(window, "keydown", handlePrintKey as EventListener, {
    passive: false,
  });
  addListener(window, "beforeprint", handleBeforePrint as EventListener);
  addListener(window, "afterprint", handleAfterPrint as EventListener);
  addListener(window, "message", handleParentMessage as EventListener);

  // Some browsers leave print styles stuck when the user switches tabs during a print dialog.
  // When the tab comes back into view, we clean up just in case.
  const handleDocumentVisibilityChange = () => {
    if (document.visibilityState === "visible" && !isPreparingForPrint) {
      resetSizing("visibilitychange");
    }
  };
  addListener(
    document,
    "visibilitychange",
    handleDocumentVisibilityChange as EventListener
  );

  // Watch for content size changes after initial render — images loading, fonts swapping,
  // or dynamic content shifting things around. During print prep, we re-enforce sizing;
  // otherwise we just track the latest height quietly.
  if (typeof ResizeObserver !== "undefined" && document.body) {
    resizeObserver = new ResizeObserver(() => {
      if (isPreparingForPrint) {
        const fullHeight = computeFullHeight();
        enforceSizing(fullHeight);
      }
    });

    resizeObserver.observe(document.body);
    addCleanup(() => {
      resizeObserver?.disconnect();
      resizeObserver = null;
    });
  }

  const triggerPrint = (reason?: string) =>
    triggerPrintInternal(reason ?? "external");

  // Figure out when the template content is actually in the DOM so we can report
  // the first meaningful height to Lydia. Three strategies, in order of preference:
  //   1. Content is already there — measure immediately
  //   2. Container exists but is empty — watch for the first child nodes to appear
  //   3. No container at all — fall back to the window load event
  const setupInitialHeightReporting = () => {
    const container = document.getElementById(outputElementId);

    if (
      container &&
      container.children.length > 0 &&
      !container.classList.contains("loading-message")
    ) {
      reportContentHeight("initial");
      return;
    }

    if (container && typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver((mutations) => {
        const hasNewNodes = mutations.some(
          (mutation) =>
            mutation.type === "childList" && mutation.addedNodes.length > 0
        );

        if (!hasNewNodes) {
          return;
        }

        observer.disconnect();
        reportContentHeight("mutation");
      });

      observer.observe(container, { childList: true, subtree: true });
      addCleanup(() => observer.disconnect());
      return;
    }

    if (!container) {
      const onLoad = () => reportContentHeight("load");
      if (document.readyState === "complete") {
        requestAnimationFrame(onLoad);
      } else {
        addListener(window, "load", onLoad as EventListener, { once: true });
      }
    }
  };

  setupInitialHeightReporting();

  const destroy = () => {
    cleanupFns.forEach((fn) => fn());
    cleanupFns.length = 0;
    resetSizing("destroy");
  };

  // Register known invoice field handlers.
  registerInvoiceFieldHandler("qrCode", applyQrCodeUpdate);
  registerInvoiceFieldHandler("irn", applyIrnUpdate);
  registerInvoiceFieldHandler("zatcaQrCode", applyZatcaQrCodeUpdate);
  registerInvoiceFieldHandler("lhdnQrCode", applyLhdnQrCodeUpdate);
  registerInvoiceFieldHandler("documentQr", applyDocumentQrUpdate);
  registerInvoiceFieldHandler("advanceOptions", (value: unknown) => {
    applyAdvanceOptionsUpdate(value as unknown);
    reportContentHeight("advance-options-update");
  });

  // Called by the renderer after the template HTML is injected into the DOM.
  // Sending ceres:ready at that point ensures Lydia's queued invoice-update messages
  // (e.g. qrCode, irn) arrive when the target DOM elements already exist.
  // Must NOT be called before outputDiv.innerHTML is set — handlers look up DOM elements
  // at call time and will silently fail if the elements aren't there yet.
  let hasNotifiedReady = false;
  const notifyReady = () => {
    if (hasNotifiedReady) return;
    hasNotifiedReady = true;
    sendToParent({ source: "ceres", type: "ceres:ready", version: 1 });
  };

  return {
    reportContentHeight,
    triggerPrint,
    registerInvoiceFieldHandler,
    notifyReady,
    destroy,
  };
}
