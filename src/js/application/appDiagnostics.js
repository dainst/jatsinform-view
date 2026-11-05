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
 * @param {Error & {category?: string, details?: Object}} error
 * @returns {void}
 */
export function showError(error) {
    // retain structured error details in the browser console:
    const isSourceError = error.category === "source";
    const consoleLabel = isSourceError
        ? "XML source error:"
        : "Application initialization failed:";
    console.error(consoleLabel, error, error.details || {});

    // replace pending progress with an assertive error message:
    clearDiagnosticsTimer();
    attachDiagnosticsElement();

    diagnosticsElement.setAttribute("role", "alert");
    diagnosticsElement.setAttribute("aria-live", "assertive");
    if (isSourceError) {
        showSourceError(error);
    } else {
        diagnosticsElement.className = "diagnostics-error";
        diagnosticsElement.textContent = "Application initialization failed: " + error.message;
    }
    diagnosticsElement.hidden = false;
}

/**
 * Presents an XML source error as structured, actionable information.
 *
 * @param {Error & {details?: Object}} error source validation error
 * @returns {void}
 */
function showSourceError(error) {
    // create the source-error heading and summary:
    const details = error.details || {};
    const heading = document.createElement("strong");
    heading.textContent = "XML source error";
    const summary = document.createElement("div");
    summary.textContent = error.message;

    // initialize the structured source-error presentation:
    diagnosticsElement.className = "diagnostics-error diagnostics-source-error";
    diagnosticsElement.replaceChildren(heading, summary);

    // append available parser location and source details:
    const location = [
        details.line ? "line " + details.line : null,
        details.column ? "column " + details.column : null
    ].filter(Boolean).join(", ");
    
    if (location) {
        appendSourceDetail("Location", location);
    }
    if (details.message) {
        appendSourceDetail("Problem", details.message);
    }
    if (details.sourceLine) {
        appendSourceDetail("Source", details.sourceLine, "diagnostics-source-line");
    }

    // append semantic XML validation issues:
    if (Array.isArray(details.issues)) {
        details.issues.forEach((issue) => {
            appendSourceDetail("Problem", issue.message);
        });
    }

    // provide the corrective action for the source document:
    const action = document.createElement("div");
    action.textContent = "Correct the XML source and reload the document.";
    action.className = "diagnostics-action";
    diagnosticsElement.appendChild(action);
}

/**
 * Appends one labeled XML source detail to the diagnostics element.
 *
 * @param {string} label detail label
 * @param {string} value detail value
 * @param {string} [className=""] optional detail class
 * @returns {void}
 */
function appendSourceDetail(label, value, className = "") {
    const detail = document.createElement("div");
    detail.textContent = label + ": " + value;
    if (className) detail.className = className;
    diagnosticsElement.appendChild(detail);
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
