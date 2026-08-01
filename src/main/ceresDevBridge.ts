import { getQueryParam, decodeBase64 } from "./commonUtils";

const DEFAULT_TEMPLATE = "default-template";

export function initDevBridge(): boolean {
  const templateParam = getQueryParam("template");
  const apiUrlParam = getQueryParam("apiUrl");

  // PRE-FLIGHT REDIRECT LOGIC
  // 1. Missing Template -> Default Template
  if (!templateParam) {
    const newParams = new URLSearchParams(window.location.search);
    newParams.set("template", DEFAULT_TEMPLATE);
    window.location.replace(
      `${window.location.pathname}?${newParams.toString()}`
    );
    return true;
  }

  // 2. Local template name -> Full Manifest Path
  if (
    templateParam &&
    !templateParam.startsWith("http") &&
    !templateParam.includes("=")
  ) {
    let isDecodingValid = false;
    try {
      const decoded = atob(templateParam);
      if (decoded.includes("/") || decoded.includes(".json")) {
        isDecodingValid = true;
      }
    } catch (e) {}

    if (!isDecodingValid) {
      const tplName = templateParam;
      console.log(
        "Local Dev: Rewriting URL parameters to base64 for renderer compatibility..."
      );

      fetch(`./templates/${tplName}/manifest.json`)
        .then((r) => {
          if (!r.ok)
            throw new Error(`Could not load local manifest for ${tplName}`);
          return r.json();
        })
        .then((manifest) => {
          const fullPath = `${
            window.location.origin +
            window.location.pathname.replace("index.html", "")
          }templates/${tplName}/${manifest.version}/manifest.json`;
          const newParams = new URLSearchParams(window.location.search);
          newParams.set("template", btoa(fullPath));
          window.location.replace(
            `${window.location.pathname}?${newParams.toString()}`
          );
        })
        .catch((e) => {
          console.error("Pre-flight error:", e);
        });

      return true; // Skip rendering
    }
  }

  // 3. Missing API URL -> Auto-load first sample
  if (templateParam && !apiUrlParam) {
    let tplName = DEFAULT_TEMPLATE;
    try {
      const decoded = atob(templateParam);
      const match = decoded.match(/\/templates\/([^\/]+)\//);
      if (match && match[1]) tplName = match[1];
    } catch (e) {}

    fetch(`./templates/${tplName}/samples.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((samples: Record<string, string>) => {
        const keys = Object.keys(samples);
        if (keys.length > 0) {
          const firstSample = samples[keys[0]];
          const newParams = new URLSearchParams(window.location.search);
          newParams.set("apiUrl", firstSample);
          window.location.replace(
            `${window.location.pathname}?${newParams.toString()}`
          );
        }
      });
    return true;
  }

  // MODAL INJECTION LOGIC
  injectModal(templateParam, apiUrlParam);

  return false;
}

async function injectModal(
  templateParam: string | null,
  apiUrlParam: string | null
) {
  // Inject CSS
  const style = document.createElement("style");
  style.innerHTML = `
    #ceresExampleModal {
      position: fixed; bottom: 20px; right: 20px; 
      background: rgba(255, 255, 255, 0.85); 
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      padding: 20px;
      border-radius: 16px; 
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 0 1px rgba(0,0,0,0.2); 
      z-index: 9999;
      font-family: 'Inter', system-ui, -apple-system, sans-serif; 
      border: 1px solid rgba(255, 255, 255, 0.5); 
      width: 340px; 
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    @media print { #ceresExampleModal { display: none !important; } }
    #ceresExampleModal h3 { 
      margin: 0; 
      font-size: 13px; 
      font-weight: 600; 
      color: #1e293b; 
      text-transform: uppercase; 
      letter-spacing: 0.05em;
    }
    .modal-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .modal-action { display: flex; gap: 8px; align-items: center; }
    .modal-action select, .modal-action input { 
      flex: 1; 
      padding: 10px; 
      border: 1px solid #e2e8f0; 
      border-radius: 8px; 
      font-size: 12px; 
      color: #475569; 
      background: white;
      transition: all 0.2s;
      outline: none;
    }
    .modal-action select:hover { border-color: #cbd5e1; }
    .modal-action select:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); }
    
    .modal-action button { 
      padding: 10px 16px; 
      background: #3b82f6; 
      color: white; 
      border: none; 
      border-radius: 8px; 
      cursor: pointer; 
      font-size: 12px; 
      font-weight: 600; 
      transition: all 0.2s; 
      box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
    }
    .modal-action button:hover { background: #2563eb; transform: translateY(-1px); }
    .modal-action button:active { transform: translateY(0); }
    .modal-action button.secondary {
      background: #f1f5f9;
      color: #475569;
      box-shadow: none;
    }
    .modal-action button.secondary:hover { background: #e2e8f0; color: #1e293b; }
    
    #copyFeedback { 
      position: absolute; top: -40px; right: 0;
      font-size: 11px; font-weight: 600; color: #10b981; 
      background: white; padding: 6px 12px; border-radius: 6px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.05);
      border: 1px solid #d1fae5;
      display: none; 
    }
    .badge-dev {
      align-self: flex-start;
      background: #3b82f6;
      color: white;
      font-size: 9px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 4px;
      margin-bottom: 4px;
    }
    #ceresManifestBadge {
      position: fixed; top: 10px; left: 50%; transform: translateX(-50%);
      background: rgba(255, 255, 255, 0.8);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      padding: 6px 12px;
      border-radius: 20px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05), 0 0 1px rgba(0,0,0,0.1);
      z-index: 10000;
      font-family: 'Inter', system-ui, sans-serif;
      border: 1px solid rgba(255, 255, 255, 0.5);
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: 80%;
      cursor: pointer;
      transition: all 0.2s;
    }
    #ceresManifestBadge:hover { background: rgba(255, 255, 255, 0.95); transform: translateX(-50%) translateY(-1px); box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1); }
    #ceresManifestBadge:active { transform: translateX(-50%) translateY(0); }
    #ceresManifestBadge .path {
      font-size: 11px;
      color: #64748b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: monospace;
    }
    #ceresManifestBadge .copy-icon {
      font-size: 10px;
      font-weight: 700;
      color: #3b82f6;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    #ceresManifestBadge.copied {
      background: #f0fdf4;
      border-color: #bbf7d0;
    }
    #ceresManifestBadge.copied .path { color: #166534; }
    #ceresManifestBadge.copied .copy-icon { color: #15803d; }
    @media print {
      #ceresManifestBadge { display: none !important; }
    }
  `;
  document.head.appendChild(style);

  // Get current template name
  let currentTplName = DEFAULT_TEMPLATE;
  let decodedManifestPath = "No template loaded";
  if (templateParam) {
    try {
      decodedManifestPath = atob(templateParam);
      const match = decodedManifestPath.match(/\/templates\/([^\/]+)\//);
      if (match && match[1]) currentTplName = match[1];
    } catch (e) {
      decodedManifestPath = templateParam;
    }
  }

  // Fetch templates list
  const templatesResponse = await fetch("./templates-list.json").catch(
    () => null
  );
  const templatesList: string[] = templatesResponse?.ok
    ? await templatesResponse.json()
    : [DEFAULT_TEMPLATE];

  // Fetch samples for current template
  const samplesResponse = await fetch(
    `./templates/${currentTplName}/samples.json`
  ).catch(() => null);
  const samples: Record<string, string> = samplesResponse?.ok
    ? await samplesResponse.json()
    : {};

  // Inject Top Badge
  const badge = document.createElement("div");
  badge.id = "ceresManifestBadge";
  badge.title = "Click to copy manifest path";
  badge.innerHTML = `
    <span class="path">${decodedManifestPath}</span>
    <span class="copy-icon" id="badgeCopyStatus">Copy Path</span>
  `;
  document.body.appendChild(badge);

  // Inject Modal HTML
  const modal = document.createElement("div");
  modal.id = "ceresExampleModal";
  modal.innerHTML = `
    <div class="badge-dev">CERES DEV MODE</div>
    <div id="copyFeedback">✓ Copied to clipboard!</div>
    
    <div class="modal-section">
      <h3>Select Template</h3>
      <div class="modal-action">
        <select id="templateSelect">
          ${templatesList
            .map(
              (t) =>
                `<option value="${t}" ${
                  t === currentTplName ? "selected" : ""
                }>${t}</option>`
            )
            .join("")}
        </select>
        <button id="loadTemplateBtn">Switch</button>
      </div>
    </div>

    <div class="modal-section">
      <h3>Preview Payload</h3>
      <div class="modal-action">
        <select id="apiUrlSelect">
          ${Object.entries(samples)
            .map(([name, url]) => {
              const isSelected = url === apiUrlParam;
              return `<option value="${url}" ${
                isSelected ? "selected" : ""
              }>${name}</option>`;
            })
            .join("")}
          <option value="custom">-- Custom URL --</option>
        </select>
        <button id="loadApiBtn">Load</button>
      </div>
      <input type="text" id="customApiInput" placeholder="Paste custom API URL..." style="display:none; margin-top: 8px;" />
    </div>
  `;
  document.body.appendChild(modal);

  // Attach events
  const templateSelect = document.getElementById(
    "templateSelect"
  ) as HTMLSelectElement;
  const apiUrlSelect = document.getElementById(
    "apiUrlSelect"
  ) as HTMLSelectElement;
  const customApiInput = document.getElementById(
    "customApiInput"
  ) as HTMLInputElement;

  apiUrlSelect.addEventListener("change", () => {
    if (apiUrlSelect.value === "custom") {
      customApiInput.style.display = "block";
    } else {
      customApiInput.style.display = "none";
    }
  });

  document.getElementById("loadTemplateBtn")?.addEventListener("click", () => {
    const tplName = templateSelect.value;
    if (tplName) {
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.delete("apiUrl"); // Clear API URL when switching templates to trigger auto-load of first sample
      urlParams.set("template", tplName);
      window.location.search = urlParams.toString();
    }
  });

  document.getElementById("loadApiBtn")?.addEventListener("click", () => {
    let aUrl = apiUrlSelect.value;
    if (aUrl === "custom") {
      aUrl = btoa(customApiInput.value.trim());
    }
    if (aUrl && aUrl !== "custom") {
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set("apiUrl", aUrl);
      window.location.search = urlParams.toString();
    }
  });

  badge.addEventListener("click", () => {
    if (!decodedManifestPath || decodedManifestPath.includes("No template"))
      return;
    navigator.clipboard.writeText(decodedManifestPath).then(() => {
      badge.classList.add("copied");
      const status = document.getElementById("badgeCopyStatus");
      if (status) status.textContent = "COPIED!";
      setTimeout(() => {
        badge.classList.remove("copied");
        if (status) status.textContent = "COPY PATH";
      }, 2000);
    });
  });
}
