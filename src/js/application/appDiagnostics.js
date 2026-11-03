/* ------------------------
 * Application diagnostics
 * ------------------------*/

// create one reusable element for progress and fatal errors:
export const diagnosticsElement = document.createElement("div");
diagnosticsElement.id = "diagnostics";
diagnosticsElement.hidden = true;
diagnosticsElement.setAttribute("data-pagedjs-ignore", "true");

// retain the pending progress-hiding timer between updates:
let hideTimer = null;

/**
 * Presents an application progress stage.
 *
 * @param {string} stage
 * @param {Object} [options]
 * @param {string} [options.readyStage="Ready"]
 * @returns {void}
 */
export function showProgress(stage, { readyStage = "Ready" } = {}) {
    // cancel pending hiding and attach the reusable diagnostics element:
    clearDiagnosticsTimer();
    attachDiagnosticsElement();

    // present the current stage as a polite status update:
    diagnosticsElement.className = "diagnostics-progress";
    diagnosticsElement.setAttribute("role", "status");
    diagnosticsElement.setAttribute("aria-live", "polite");
    diagnosticsElement.textContent = stage === readyStage ? stage + "!" : stage;
    diagnosticsElement.hidden = false;

    // hide the completed stage after a short confirmation period:
    if (stage === readyStage) {
        hideTimer = window.setTimeout(() => {
            diagnosticsElement.hidden = true;
        }, 2000);
    }
}

/**
 * Presents a fatal application error and logs its structured details.
 *
 * @param {Error & {details?: Object}} error
 * @returns {void}
 */
export function showError(error) {
    // retain structured error details in the browser console:
    console.error("Application initialization failed:", error, error.details || {});

    // replace pending progress with an assertive error message:
    clearDiagnosticsTimer();
    attachDiagnosticsElement();

    diagnosticsElement.className = "diagnostics-error";
    diagnosticsElement.setAttribute("role", "alert");
    diagnosticsElement.setAttribute("aria-live", "assertive");
    diagnosticsElement.textContent = "Application initialization failed: " + error.message;
    diagnosticsElement.hidden = false;
}

/**
 * Ensures that the reusable diagnostics element is attached only once.
 *
 * @returns {void}
 */
function attachDiagnosticsElement() {
    document.querySelectorAll("#diagnostics").forEach((element) => {
        if (element !== diagnosticsElement) {
            element.remove();
        }
    });

    if (document.body && diagnosticsElement.parentElement !== document.body) {
        document.body.prepend(diagnosticsElement);
    }
}

/**
 * Cancels a pending progress-hiding timer.
 *
 * @returns {void}
 */
function clearDiagnosticsTimer() {
    if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
    }
}

/**
 * Records and returns a structured nonfatal diagnostic.
 *
 * @param {string} level diagnostic severity
 * @param {string} message human-readable diagnostic message
 * @param {Object} [details={}] structured diagnostic details
 * @returns {Object} normalized diagnostic
 */
export function reportDiagnostic(level, message, details = {}) {
    const diagnostic = { ...details, level, message };
    const logger = level === "error"
        ? console.error
        : level === "warning"
            ? console.warn
            : console.log;
    logger("Jatsinform diagnostic:", diagnostic);
    return diagnostic;
}

/**
 * Verifies that dependencies required by the selected view are available.
 *
 * @param {string} mode selected view mode
 * @param {Object} options view modes and loaded paged-view API
 * @param {string} options.pagedMode paged view mode
 * @param {Object} options.pagedViewApi paged-view module API
 * @param {string} options.webMode web view mode
 * @returns {void}
 * @throws {Error} when one or more required dependencies are unavailable
 */
export function verifyViewDependencies(mode, { pagedMode, pagedViewApi, webMode }) {
    // collect dependencies required by the selected view mode:
    const missing = [];
    if (mode === pagedMode) {
        if (typeof window.Paged === "undefined") missing.push("Paged");
        if (!window.PagedPolyfill?.preview) missing.push("PagedPolyfill.preview");
        if (typeof window.hljs === "undefined") missing.push("hljs");
        if (typeof window.interact === "undefined") missing.push("interact");
        if (typeof pagedViewApi?.registerHandler !== "function") {
            missing.push("pagedView.registerHandler");
        }
        if (typeof pagedViewApi?.applyFigureLayout !== "function") {
            missing.push("pagedView.applyFigureLayout");
        }
    } else if (mode === webMode) {
        if (typeof window.hljs === "undefined") missing.push("hljs");
        if (typeof window.L === "undefined") missing.push("L");
    }

    // stop view activation when required dependencies are unavailable:
    if (missing.length) {
        throw new Error("Required dependencies are unavailable: " + missing.join(", "));
    }
}