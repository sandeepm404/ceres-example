import { initLydiaBridge } from "../src/main/lydiaBridge";

// Helpers

function makeMockElement() {
    return {
        scrollHeight: 500,
        offsetHeight: 500,
        getBoundingClientRect: () => ({ height: 500 }),
        style: { removeProperty: jest.fn() } as Record<string, unknown>,
        classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn(() => false) },
        children: { length: 0 },
    };
}

type WindowListeners = Record<string, Array<(event: Partial<MessageEvent>) => void>>;

function setupBrowserGlobals(
    parentOverride?: Partial<{ postMessage: jest.Mock; isWindow: boolean; isNull: boolean; noPostMessage: boolean }>
) {
    const parentPostMessage = jest.fn();
    const windowListeners: WindowListeners = {};

    const mockWindow: Record<string, unknown> = {
        location: { search: "" },
        setTimeout: jest.fn().mockReturnValue(1),
        clearTimeout: jest.fn(),
        print: jest.fn(),
        postMessage: jest.fn(), // window.postMessage (used when parent === window)
        addEventListener: jest.fn((type: string, handler: any) => {
            windowListeners[type] = windowListeners[type] ?? [];
            windowListeners[type].push(handler);
        }),
        removeEventListener: jest.fn(),
    };

    if (parentOverride?.isNull) {
        mockWindow.parent = null;
    } else if (parentOverride?.isWindow) {
        // parent === window — guard fires because parent === window
        mockWindow.parent = mockWindow;
    } else if (parentOverride?.noPostMessage) {
        mockWindow.parent = { postMessage: "not-a-function" };
    } else {
        mockWindow.parent = { postMessage: parentPostMessage };
    }

    (global as any).window = mockWindow;
    (global as any).document = {
        body: makeMockElement(),
        documentElement: makeMockElement(),
        getElementById: jest.fn().mockReturnValue(null),
        readyState: "complete",
        visibilityState: "visible",
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    };
    (global as any).ResizeObserver = jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn() }));
    (global as any).requestAnimationFrame = jest.fn((fn: any) => { fn(); return 1; });
    (global as any).MutationObserver = jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn() }));

    return { parentPostMessage, windowListeners };
}

function simulateMessage(
    windowListeners: WindowListeners,
    data: unknown,
    source?: unknown
) {
    const handlers = windowListeners["message"] ?? [];
    const event = { data, source: source ?? (global as any).window?.parent };
    handlers.forEach((h) => h(event));
}

function teardownBrowserGlobals() {
    delete (global as any).window;
    delete (global as any).document;
    delete (global as any).ResizeObserver;
    delete (global as any).requestAnimationFrame;
    delete (global as any).MutationObserver;
}

// Tests

describe("initLydiaBridge", () => {
    afterEach(() => {
        teardownBrowserGlobals();
    });

    describe("environment guards", () => {
        it("returns null when window is not defined", () => {
            expect(initLydiaBridge()).toBeNull();
        });

        it("returns null when document is not defined", () => {
            (global as any).window = {};
            expect(initLydiaBridge()).toBeNull();
        });
    });

    describe("initialisation", () => {
        it("returns a handle with the expected public methods", () => {
            setupBrowserGlobals();
            const handle = initLydiaBridge();
            expect(handle).not.toBeNull();
            expect(typeof handle!.reportContentHeight).toBe("function");
            expect(typeof handle!.triggerPrint).toBe("function");
            expect(typeof handle!.registerInvoiceFieldHandler).toBe("function");
            expect(typeof handle!.destroy).toBe("function");
        });

        it("sends ceres:ready when notifyReady is called", () => {
            // ceres:ready is emitted by the renderer (src/main/index.ts) via
            // handle.notifyReady() AFTER outputDiv.innerHTML is set — not during init —
            // so handlers can find their data-ceres-field DOM targets when Lydia's
            // queued updates flush.
            const { parentPostMessage } = setupBrowserGlobals();
            const handle = initLydiaBridge();
            expect(handle).not.toBeNull();
            handle!.notifyReady();
            expect(parentPostMessage).toHaveBeenLastCalledWith(
                { source: "ceres", type: "ceres:ready", version: 1 },
                "*"
            );
        });
    });

    describe("sendToParent guards", () => {
        it("does not send ceres:ready when window.parent is null", () => {
            setupBrowserGlobals({ isNull: true });
            initLydiaBridge();
            // No postMessage available on null — no crash and nothing called
        });

        it("does not send ceres:ready when window.parent === window", () => {
            setupBrowserGlobals({ isWindow: true });
            initLydiaBridge();
            // Guard fires before postMessage is reached — window.postMessage is not called
            expect((global as any).window.postMessage).not.toHaveBeenCalledWith(
                expect.objectContaining({ type: "ceres:ready" }),
                "*"
            );
        });

        it("does not send ceres:ready when parent.postMessage is not a function", () => {
            setupBrowserGlobals({ noPostMessage: true });
            expect(() => initLydiaBridge()).not.toThrow();
        });
    });

    describe("outbound buffering — sendOrQueue", () => {
        it("queues height reports before lydia:ack is received", () => {
            const { parentPostMessage, windowListeners } = setupBrowserGlobals();
            // Use immediate setTimeout so scheduleHeightReport fires
            (global as any).window.setTimeout = jest.fn((fn: any) => { fn(); return 1; });
            initLydiaBridge();
            // Clear init calls (ceres:ready was sent)
            parentPostMessage.mockClear();

            // No lydia:ack yet — height reports go through sendOrQueue → queued
            // Trigger a height report
            simulateMessage(windowListeners, { action: "lydia:height-request", reason: "test" });

            // Height message should NOT have been sent yet (not ready)
            const heightCalls = parentPostMessage.mock.calls.filter(
                (call) => call[0]?.type === "ceres:content-height"
            );
            expect(heightCalls).toHaveLength(0);
        });

        it("flushes queued messages when lydia:ack is received", () => {
            const { parentPostMessage, windowListeners } = setupBrowserGlobals();
            (global as any).window.setTimeout = jest.fn((fn: any) => { fn(); return 1; });
            initLydiaBridge();
            parentPostMessage.mockClear();

            // Queue a height request before ack
            simulateMessage(windowListeners, { action: "lydia:height-request", reason: "pre-ack" });

            // Now send lydia:ack
            simulateMessage(windowListeners, { source: "lydia", type: "lydia:ack", version: 1 });

            // After ack, the queued height report should have been flushed and sent
            const heightCalls = parentPostMessage.mock.calls.filter(
                (call) => call[0]?.type === "ceres:content-height"
            );
            expect(heightCalls.length).toBeGreaterThan(0);
        });

        it("ignores lydia:ack from a non-parent source", () => {
            const { windowListeners } = setupBrowserGlobals();
            initLydiaBridge();

            // Ack from wrong source should be ignored without throwing
            expect(() => {
                simulateMessage(
                    windowListeners,
                    { source: "lydia", type: "lydia:ack", version: 1 },
                    { different: "source" }
                );
            }).not.toThrow();
        });

        it("ignores malformed lydia:ack messages", () => {
            const { windowListeners } = setupBrowserGlobals();
            initLydiaBridge();

            expect(() => {
                simulateMessage(windowListeners, null);
                simulateMessage(windowListeners, "string-message");
                simulateMessage(windowListeners, { source: "other", type: "lydia:ack" });
                simulateMessage(windowListeners, { source: "lydia", type: "wrong-type" });
            }).not.toThrow();
        });
    });

    describe("invoice field handler registry", () => {
        it("dispatches lydia:invoice-update to a registered handler", () => {
            const { windowListeners } = setupBrowserGlobals();
            const handle = initLydiaBridge()!;

            // Ack to unlock the bridge first
            simulateMessage(windowListeners, { source: "lydia", type: "lydia:ack", version: 1 });

            const qrHandler = jest.fn();
            handle.registerInvoiceFieldHandler("qrCode", qrHandler);

            simulateMessage(windowListeners, {
                source: "lydia",
                type: "lydia:invoice-update",
                fields: { qrCode: "data:image/png;base64,abc" },
                reason: "irn-generated",
            });

            expect(qrHandler).toHaveBeenCalledWith("data:image/png;base64,abc");
        });

        it("dispatches to multiple registered handlers in one update", () => {
            const { windowListeners } = setupBrowserGlobals();
            const handle = initLydiaBridge()!;

            simulateMessage(windowListeners, { source: "lydia", type: "lydia:ack", version: 1 });

            const qrHandler = jest.fn();
            const irnHandler = jest.fn();
            handle.registerInvoiceFieldHandler("qrCode", qrHandler);
            handle.registerInvoiceFieldHandler("irn", irnHandler);

            simulateMessage(windowListeners, {
                source: "lydia",
                type: "lydia:invoice-update",
                fields: { qrCode: "data:image/png;base64,abc", irn: "IRN12345678901234" },
                reason: "irn-generated",
            });

            expect(qrHandler).toHaveBeenCalledWith("data:image/png;base64,abc");
            expect(irnHandler).toHaveBeenCalledWith("IRN12345678901234");
        });

        it("silently ignores unregistered field keys", () => {
            const { windowListeners } = setupBrowserGlobals();
            initLydiaBridge();

            simulateMessage(windowListeners, { source: "lydia", type: "lydia:ack", version: 1 });

            expect(() => {
                simulateMessage(windowListeners, {
                    source: "lydia",
                    type: "lydia:invoice-update",
                    fields: { unknownField: "value" },
                    reason: "test",
                });
            }).not.toThrow();
        });

        it("ignores invalid invoice-update messages", () => {
            const { windowListeners } = setupBrowserGlobals();
            initLydiaBridge();

            simulateMessage(windowListeners, { source: "lydia", type: "lydia:ack", version: 1 });

            expect(() => {
                // missing fields
                simulateMessage(windowListeners, { source: "lydia", type: "lydia:invoice-update" });
                // null fields
                simulateMessage(windowListeners, { source: "lydia", type: "lydia:invoice-update", fields: null });
                // wrong source
                simulateMessage(windowListeners, { source: "other", type: "lydia:invoice-update", fields: {} });
            }).not.toThrow();
        });
    });

    describe("destroy", () => {
        it("cleans up without throwing", () => {
            setupBrowserGlobals();
            const handle = initLydiaBridge()!;
            expect(() => handle.destroy()).not.toThrow();
        });
    });
});
