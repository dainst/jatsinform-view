// Standalone HTML export
// ----------------------
// Public API: downloadDocument(options)
// Internal dependency: convertAllToWebP(container, options)

import { convertAllToWebP } from "./imageEncoding.js";
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
        onWarning = null
    }) {
        setProgress(diagnosticsElement, "", true);
        const bodyClone = document.body.cloneNode(true);

        await convertAllToWebP(bodyClone, {
            selector: convertImages
                ? "img:not(.object-image)"
                : "img.logo-img",
            quality: imageQuality,
            concurrency: 4,
            onProgress: (done, total) => {
                setProgress(diagnosticsElement, `Converting images… ${done}/${total}`);
            },
            onWarning
        });

        setProgress(diagnosticsElement, "Packing HTML…");

        const jsonLd = documentContext.jsonLd;
        const structuredHeadline = typeof jsonLd?.headline === "string"
            ? jsonLd.headline.trim()
            : "";
        const title = structuredHeadline || document.title.trim() || "Document";
        const htmlDocument = document.implementation.createHTMLDocument();
        htmlDocument.documentElement.lang = documentContext.language || "en";
        copyRootStyles(htmlDocument);
        buildHead(htmlDocument, {
            title,
            jsonLd,
            fallbackStyles,
            resourceBaseUrl
        });

        bodyClone.querySelectorAll(".fetch-state").forEach(element => element.remove());
        bodyClone.querySelector(diagnosticsSelector)?.remove();
        const exportedBody = htmlDocument.importNode(bodyClone, true);
        exportedBody.classList.add("fade-in");
        htmlDocument.body.replaceWith(exportedBody);

        const content = "<!doctype html>\n" + htmlDocument.documentElement.outerHTML;
        downloadFile(content, "text/html", sanitizeFilename(title) + ".html");
    }

    function setProgress(diagnosticsElement, message, show = false) {
        if (!diagnosticsElement) return;
        if (show) diagnosticsElement.hidden = false;
        diagnosticsElement.textContent = message;
    }

    function copyRootStyles(htmlDocument) {
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

    function buildHead(htmlDocument, {
        title,
        jsonLd,
        fallbackStyles,
        resourceBaseUrl
    }) {
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

        const favicon = htmlDocument.createElement("link");
        favicon.rel = "icon";
        favicon.type = "image/png";
        favicon.href = resourceBaseUrl + "web-viewer/assets/greif.png";
        htmlDocument.head.appendChild(favicon);

        const fallback = htmlDocument.createElement("script");
        fallback.textContent = standaloneFallback.toString();
        htmlDocument.head.appendChild(fallback);

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

        if (jsonLd && typeof jsonLd === "object") {
            const structuredData = htmlDocument.createElement("script");
            structuredData.type = "application/ld+json";
            structuredData.textContent = JSON.stringify(jsonLd);
            htmlDocument.head.appendChild(structuredData);
        }

        if (fallbackStyles) {
            const styles = htmlDocument.createElement("style");
            styles.id = "fallback-styles";
            styles.textContent = fallbackStyles;
            htmlDocument.head.appendChild(styles);
        }
    }

    function appendScript(htmlDocument, source, errorHandler = null) {
        const script = htmlDocument.createElement("script");
        script.src = source;
        if (errorHandler) script.setAttribute("onerror", errorHandler);
        htmlDocument.head.appendChild(script);
    }

    function standaloneFallback(noJs) {
        document.addEventListener("readystatechange", event => {
            if (event.target.readyState !== "interactive" || !noJs) return;

            const message = document.createElement("div");
            message.id = "error-message";
            message.innerHTML = "<span>&#9432;</span> There was a problem loading external scripts from the internet. " + 
            "The document is entirely readable but might have reduced functionalities. " + 
            "Please visit the source address by following the DOI link!";
            document.body.prepend(message);
            document.querySelector("link")?.remove();

            const mainWrapper = document.querySelector("#main-wrapper");
            const pageHeader = document.querySelector("#cover-area");
            const tocList = document.querySelector("#toc-list");
            if (pageHeader && tocList) pageHeader.appendChild(tocList);
            if (mainWrapper && pageHeader) mainWrapper.prepend(pageHeader);
        });
    }

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

    function downloadFile(content, type, filename) {
        const blob = new Blob([content], { type });
        const link = document.createElement("a");
        const objectUrl = window.URL.createObjectURL(blob);
        link.download = filename;
        link.href = objectUrl;
        link.dataset.downloadurl = [type, filename, objectUrl].join(":");
        link.dispatchEvent(new MouseEvent("click", {
            view: window,
            bubbles: true,
            cancelable: true
        }));
        link.remove();
        window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
    }
