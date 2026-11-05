/* ---------------------
 * XML preflight
 * --------------------- */

/**
 * Normalizes the browser-specific error produced by DOMParser.
 *
 * @param {XMLDocument} xmlDocument parsed XML document
 * @param {string} [xmlSource=""] original XML source
 * @returns {Object|null} structured parser issue, or null for valid XML
 */
export function getParserIssue(xmlDocument, xmlSource = "") {
    const parserError = xmlDocument.querySelector("parsererror");
    if (!parserError) return null;

    const parserMessage = parserError.textContent.trim().replace(/\s+/g, " ");
    const lineMatch = parserMessage.match(/\bline(?: number)?\s*:?\s*(\d+)/i);
    const columnMatch = parserMessage.match(/\bcolumn(?: number)?\s*:?\s*(\d+)/i);
    const line = lineMatch ? Number(lineMatch[1]) : null;
    const column = columnMatch ? Number(columnMatch[1]) : null;
    const sourceLine = line
        ? xmlSource.split(/\r?\n/)[line - 1]?.trim().slice(0, 240) || null
        : null;

    const message = parserMessage
        .replace(/\s*Below is a rendering.*$/i, "")
        .replace(/^.*?\berror on line \d+ at column \d+:\s*/i, "")
        .replace(/^XML Parsing Error:\s*/i, "")
        .replace(/^error on line \d+ at column \d+:\s*/i, "")
        .replace(/\s+Location:.*$/i, "")
        .replace(/\s+Line Number.*$/i, "")
        .trim();

    return {
        severity: "error",
        code: "xml-parser-error",
        message: message || "The XML syntax is invalid",
        line,
        column,
        sourceLine,
        parserMessage,
        selector: "parsererror"
    };
}

/**
 * Validates required JATS elements and graphic references.
 *
 * @param {XMLDocument} xmlDocument parsed JATS XML document
 * @param {Object} conversionMap element conversion configuration
 * @param {RegExp|null} [unsupportedImageExtensionRegex=null] unsupported image extensions
 * @returns {Array<Object>} structured validation issues
 */
export function validate(xmlDocument, conversionMap, unsupportedImageExtensionRegex = null) {
    const issues = [];

    // stop validation when the document contains a parser error:
    const parserIssue = getParserIssue(xmlDocument);
    if (parserIssue) {
        issues.push(parserIssue);
        return issues;
    }

    // validate required elements defined by the conversion map:
    getRequiredSelectors(conversionMap).forEach(selector => {
        const element = xmlDocument.querySelector(selector);
        if (!element) {
            issues.push({
                severity: "error",
                code: "required-element-missing",
                message: "Required XML element is missing: " + selector,
                selector
            });
            return;
        }

        const hasContent = element.textContent.trim() !== "" || element.children.length > 0;

        // allow an empty back section while requiring content in other obligatory elements:
        if (!hasContent && element.localName !== "back") {
            issues.push({
                severity: "error",
                code: "required-element-empty",
                message: "Required XML element is empty: " + selector,
                selector
            });
        }
    });

    // validate graphic sources, paths, and file formats:
    const xlinkNamespace = "http://www.w3.org/1999/xlink";
    const invalidGraphicPathPattern = /[(){}<>?~;,]/;
    const graphics = xmlDocument.querySelectorAll(
        "graphic:not([specific-use='placeholder-image']), inline-graphic"
    );
    graphics.forEach(graphic => {
        const href = graphic.getAttributeNS(xlinkNamespace, "href") ||
            graphic.getAttribute("xlink:href");
        if (!href) {
            issues.push({
                severity: "error",
                code: "graphic-source-missing",
                message: "Graphic is missing xlink:href",
                selector: graphic.id ? "#" + graphic.id : graphic.tagName
            });
            return;
        }

        if (invalidGraphicPathPattern.test(href)) {
            issues.push({
                severity: "error",
                code: "graphic-path-invalid",
                message: "Graphic path contains invalid characters: " + href,
                path: href
            });
        }
        if (unsupportedImageExtensionRegex?.test(href)) {
            issues.push({
                severity: "error",
                code: "graphic-format-invalid",
                message: "Graphic format is unsupported (JPEG or PNG expected): " + href,
                path: href
            });
        }
    });

    return issues;
}

/**
 * Returns selectors marked as obligatory in the conversion map.
 *
 * @param {Object} conversionMap element conversion configuration
 * @returns {Array<string>} required XML selectors
 */
function getRequiredSelectors(conversionMap) {
    const requiredSelectors = Object.entries(conversionMap)
        .filter(([, configuration]) => {
            return configuration?.obligatory === true;
        })
        .map(([selector]) => {
            return selector;
        });

    return requiredSelectors;
}
