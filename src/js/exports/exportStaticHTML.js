/* ---------------------
 * Imports
 * --------------------- */

import { convertAllToWebP } from "./imageEncoding.js";

/* ---------------------
 * Standalone HTML export
 * --------------------- */

/**
 * Builds and downloads a standalone copy of the current HTML document.
 * Export-specific mutations are limited to a detached body clone.
 *
 * @param {Object} options
 * @param {Object} options.documentContext
 * @param {string} [options.fallbackStyles=""]
 * @param {string} options.resourceBaseUrl
 * @param {HTMLElement|null} [options.diagnosticsElement=null]
 * @param {string} [options.diagnosticsSelector="#diagnostics"]
 * @param {boolean} [options.convertImages=false] Whether to embed all eligible
 * images. Logo images are always embedded.
 * @param {number} [options.imageQuality=0.8]
 * @param {Function|null} [options.onWarning=null]
 * @returns {Promise<void>}
 */

export async function downloadDocument({
    documentContext,
    fallbackStyles = "",
    resourceBaseUrl,
    diagnosticsElement = null,
    diagnosticsSelector = "#diagnostics",
    convertImages = false,
    imageQuality = 0.8,
    onWarning = null}) {

    // prepare a detached copy without modifying the displayed document:
    setProgress(diagnosticsElement, "", true);
    const bodyClone = document.body.cloneNode(true);

    // embed the selected images in the detached copy:
    const imageSelector = convertImages
        ? "img:not(.object-image)" // .object-image = supplement imgs -> already converted
        : "img.logo-img";
    const images = bodyClone.querySelectorAll(imageSelector);
    await convertAllToWebP(images, {
        quality: imageQuality,
        onProgress: (done, total) => {
            setProgress(diagnosticsElement, `Converting images… ${done}/${total}`);
        },
        onWarning
    });

    setProgress(diagnosticsElement, "Packing HTML…");

    // derive the exported document metadata:
    const jsonLd = documentContext.jsonLd;
    const structuredHeadline = typeof jsonLd?.headline === "string"
        ? jsonLd.headline.trim()
        : "";
    const title = structuredHeadline || document.title.trim() || "Document";

    // construct the standalone document head:
    const htmlDocument = document.implementation.createHTMLDocument();
    htmlDocument.documentElement.lang = documentContext.language || "en";
    copyJournalColorProperties(htmlDocument);
    buildHead(htmlDocument, {
        title,
        jsonLd,
        fallbackStyles,
        resourceBaseUrl
    });

    // remove application-only elements from the exported body:
    bodyClone.querySelectorAll(".fetch-state").forEach(element => element.remove());
    bodyClone.querySelector(diagnosticsSelector)?.remove();
    const exportedBody = htmlDocument.importNode(bodyClone, true);
    exportedBody.classList.add("fade-in");
    htmlDocument.body.replaceWith(exportedBody);

    // serialize and download the completed document:
    const content = "<!doctype html>\n" + htmlDocument.documentElement.outerHTML;
    downloadFile(content, "text/html", sanitizeFilename(title) + ".html");

    // clear the completed export progress displayed in diagnostics element:
    if (diagnosticsElement) {
        diagnosticsElement.textContent = "";
        diagnosticsElement.hidden = true;
    }
}

/**
 * Updates the optional export progress display.
 *
 * @param {HTMLElement|null} diagnosticsElement progress display element
 * @param {string} message progress message
 * @param {boolean} [show=false] whether to reveal the display
 * @returns {void}
 */
function setProgress(diagnosticsElement, message, show = false) {
    if (!diagnosticsElement) return;
    if (show) diagnosticsElement.hidden = false;
    diagnosticsElement.textContent = message;
}

/**
 * Copies the computed journal colors to the standalone document root.
 *
 * @param {Document} htmlDocument standalone HTML document
 * @returns {void}
 */
function copyJournalColorProperties(htmlDocument) {
    const styles = getComputedStyle(document.documentElement);
    htmlDocument.documentElement.style.setProperty(
        "--journal-color",
        styles.getPropertyValue("--journal-color")
    );
    htmlDocument.documentElement.style.setProperty(
        "--journal-color-high-contrast",
        styles.getPropertyValue("--journal-color-high-contrast")
    );
}

/* ---------------------
 * Document head
 * --------------------- */

/**
 * Adds metadata, viewer resources, and embedded data to the document head.
 *
 * @param {Document} htmlDocument standalone HTML document
 * @param {Object} options head construction options
 * @param {string} options.title document title
 * @param {Object|null} options.jsonLd structured article metadata
 * @param {string} options.fallbackStyles locally available fallback CSS
 * @param {string} options.resourceBaseUrl base URL for viewer resources
 * @returns {void}
 */
function buildHead(htmlDocument, {title, jsonLd, fallbackStyles, resourceBaseUrl}) {
    
    // add the essential document metadata:
    const charset = htmlDocument.createElement("meta");
    charset.setAttribute("charset", "utf-8");
    htmlDocument.head.appendChild(charset);

    const viewport = htmlDocument.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width, initial-scale=1";
    htmlDocument.head.appendChild(viewport);

    const titleElement = htmlDocument.createElement("title");
    titleElement.textContent = title;
    htmlDocument.head.appendChild(titleElement);

    // add the application icon and standalone fallback:
    const favicon = htmlDocument.createElement("link");
    favicon.rel = "icon";
    favicon.type = "image/png";
    favicon.href = resourceBaseUrl + "web-viewer/assets/greif.png";
    htmlDocument.head.appendChild(favicon);

    const fallback = htmlDocument.createElement("script");
    fallback.textContent = standaloneFallback.toString();
    htmlDocument.head.appendChild(fallback);

    // reference the external viewer resources:
    appendScript(
        htmlDocument,
        resourceBaseUrl + "web-viewer/viewer-config.js",
        "this.onerror=null;standaloneFallback(true);"
    );
    appendScript(
        htmlDocument,
        resourceBaseUrl + "web-viewer/articleWebViewController.js"
    );

    const stylesheet = htmlDocument.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = resourceBaseUrl + "web-viewer/article-viewer-styles.css";
    htmlDocument.head.appendChild(stylesheet);

    // embed the article's structured metadata:
    if (jsonLd && typeof jsonLd === "object") {
        const structuredData = htmlDocument.createElement("script");
        structuredData.type = "application/ld+json";
        structuredData.textContent = JSON.stringify(jsonLd);
        htmlDocument.head.appendChild(structuredData);
    }

    // provide the locally available fallback styles:
    if (fallbackStyles) {
        const styles = htmlDocument.createElement("style");
        styles.id = "fallback-styles";
        styles.textContent = fallbackStyles;
        htmlDocument.head.appendChild(styles);
    }
}

/**
 * Appends an external script reference to the standalone document.
 *
 * @param {Document} htmlDocument standalone HTML document
 * @param {string} src script source URL
 * @param {string|null} [errorHandler=null] inline script error handler
 * @returns {void}
 */
function appendScript(htmlDocument, src, errorHandler = null) {
    const script = htmlDocument.createElement("script");
    script.src = src;
    if (errorHandler) script.setAttribute("onerror", errorHandler);
    htmlDocument.head.appendChild(script);
}

/* ---------------------
 * Standalone fallback
 * --------------------- */

/**
 * Restores a readable static layout when external viewer scripts fail.
 *
 * @param {boolean} externalScriptsUnavailable whether viewer loading failed
 * @returns {void}
 */
function standaloneFallback(externalScriptsUnavailable) {
    document.addEventListener("readystatechange", event => {
        if (
            event.target.readyState !== "interactive"
            || !externalScriptsUnavailable
        ) return;

        // display a warning about the unavailable viewer scripts:
        const message = document.createElement("div");
        message.id = "error-message";
        message.innerHTML =
            "<span>&#9432;</span> There was a problem loading external scripts "
            + "from the internet. The document is entirely readable but might "
            + "have reduced functionalities. Please visit the source address "
            + "by following the DOI link!";
        document.body.prepend(message);
        document.querySelector('link[rel="stylesheet"]')?.remove();

        // restore a readable static article arrangement:
        const mainWrapper = document.querySelector("#main-wrapper");
        const pageHeader = document.querySelector("#cover-area");
        const tocList = document.querySelector("#toc-list");
        if (pageHeader && tocList) pageHeader.appendChild(tocList);
        if (mainWrapper && pageHeader) mainWrapper.prepend(pageHeader);
    });
}

/* ---------------------
 * Download utilities
 * --------------------- */

/**
 * Creates a filesystem-safe filename from the document title.
 *
 * @param {string} title document title
 * @returns {string} sanitized filename without an extension
 */
function sanitizeFilename(title) {
    const sanitized = String(title || "")
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
        .replace(/\s+/g, " ")
        .replace(/[. ]+$/g, "")
        .trim()
        .slice(0, 120);
    const reservedName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
    if (!sanitized) return "document";
    return reservedName.test(sanitized) ? "document-" + sanitized : sanitized;
}

/**
 * Triggers a browser download for generated content.
 *
 * @param {string} content serialized file content
 * @param {string} type MIME type
 * @param {string} filename download filename
 * @returns {void}
 */
function downloadFile(content, type, filename) {
    // create a temporary object URL for the generated document:
    const blob = new Blob([content], { type });
    const link = document.createElement("a");
    const objectUrl = window.URL.createObjectURL(blob);
    link.download = filename;
    link.href = objectUrl;
    link.dataset.downloadurl = [type, filename, objectUrl].join(":");

    // trigger the browser download and release the temporary URL:
    link.dispatchEvent(new MouseEvent("click", {
        view: window,
        bubbles: true,
        cancelable: true
    }));
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
}
