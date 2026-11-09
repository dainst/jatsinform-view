/* ---------------------
 * XML normalization
 * --------------------- */

/**
 * Clones an XML document and renames JATS `sec` elements to `section`.
 * The original XML document remains unchanged.
 *
 * @param {XMLDocument} xmlDocument source XML document
 * @returns {XMLDocument} cloned document with normalized section elements
 */
export function normalizeJatsSections(xmlDocument) {
    // clone the source and collect JATS section elements:
    const normalizedDocument = xmlDocument.cloneNode(true);
    const sectionElements = Array.from(
        normalizedDocument.getElementsByTagNameNS("*", "sec")
    );

    // process each section element:
    sectionElements.forEach((sectionElement) => {
        const qualifiedName = sectionElement.prefix
            ? sectionElement.prefix + ":section"
            : "section";

        // rename the existing node when the XML DOM provides renameNode():
        if (typeof normalizedDocument.renameNode === "function") {
            normalizedDocument.renameNode(
                sectionElement,
                sectionElement.namespaceURI,
                qualifiedName
            );
            return;
        }

        // replace sections manually while preserving attributes and children:
        const replacement = normalizedDocument.createElementNS(
            sectionElement.namespaceURI,
            qualifiedName
        );
        Array.from(sectionElement.attributes).forEach((attribute) => {
            replacement.setAttributeNS(
                attribute.namespaceURI,
                attribute.name,
                attribute.value
            );
        });
        while (sectionElement.firstChild) {
            replacement.appendChild(sectionElement.firstChild);
        }
        sectionElement.replaceWith(replacement);
    });

    return normalizedDocument;
}

/* ---------------------
 * Element conversion
 * --------------------- */

/**
 * Converts a normalized JATS XML document into an HTML wrapper.
 * The supplied XML document is modified during conversion.
 *
 * @param {XMLDocument} xmlDocument normalized JATS XML document
 * @param {Object} tagConversionMap XML-to-HTML element configuration
 * @param {Object} [options]
 * @param {string} [options.imageBasePath=""] base path for referenced images
 * @param {Function|null} [options.onDiagnostic=null] conversion diagnostic callback
 * @returns {HTMLDivElement} converted article wrapper
 */
export function convertJatsToHtml(xmlDocument, tagConversionMap, 
    {imageBasePath = "", onDiagnostic = null} = {}) {

    const xmlArticle = xmlDocument.getElementsByTagName("article")[0];

    // remove empty elements before conversion:
    const removedElements = removeEmptyElements(xmlArticle);
    removedElements.forEach((element) => {
        onDiagnostic?.("warning", "Empty XML element was removed", {
            element
        });
    });

    // replace configured XML elements with HTML elements:
    const elementsNotFound = convertElementsByTagConversionMap(
        xmlArticle,
        tagConversionMap,
        imageBasePath
    );
    if (elementsNotFound.length > 0) {
        onDiagnostic?.(
            "notice",
            "Configured XML elements were not present",
            { elements: elementsNotFound }
        );
    }

    // apply content-specific HTML transformations:
    formatCodeBlocks(xmlArticle);
    applyCustomMetaClasses(xmlArticle);

    // add identifiers and heading hierarchy:
    const textContentElements = xmlArticle.querySelectorAll(
        "p, ul, ol, li, table, pre, code, .title"
    );
    assignMissingElementIds(textContentElements);
    convertTitlesToHeadings(xmlArticle);

    // create the application HTML wrapper:
    const htmlWrapper = document.createElement("div");
    htmlWrapper.id = "html-wrapper";
    htmlWrapper.classList.add("html-wrapper");
    htmlWrapper.innerHTML = xmlArticle.innerHTML;

    return htmlWrapper;
}

/**
 * Wraps converted code elements in preformatted blocks.
 *
 * @param {HTMLElement} container converted article content
 * @returns {void}
 */
function formatCodeBlocks(container) {
    const codeItems = container.querySelectorAll("code:not(.language-xml)");
    for (let i = 0; i < codeItems.length; i++) {
        const language = codeItems[i].getAttribute("language");
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        if (language) { code.classList.add(language); }
        code.innerHTML = codeItems[i].innerHTML;
        pre.appendChild(code)
        codeItems[i].replaceWith(pre);
    }
}

/**
 * Applies each custom metadata name as a class on its container.
 *
 * @param {HTMLElement} container converted article content
 * @returns {void}
 */
function applyCustomMetaClasses(container) {
    const customMetaElements = container.querySelectorAll(".custom-meta");
    for (let i = 0; i < customMetaElements.length; i++) {
        const metaName = customMetaElements[i].querySelector(".meta-name");
        const metaClass = metaName?.innerText.trim();
        if(metaClass) {
            customMetaElements[i].classList.add(metaClass);
        }
    }
}

/**
 * Removes empty elements except graphic source elements.
 *
 * @param {Element} container XML article containing elements to inspect
 * @returns {Array<Element>} removed XML elements
 */
function removeEmptyElements(container) {
    const emptyElements = Array.from(
        container.querySelectorAll("*:empty:not(graphic,inline-graphic)")
    );
    emptyElements.forEach((element) => {
        element.remove();
    });

    return emptyElements;
}

/**
 * Replaces XML elements with HTML elements defined by the conversion map.
 * Returns configured selectors not present in the document.
 *
 * @param {Element} container XML article containing elements to convert
 * @param {Object<string, Object>} tagConversionMap conversion definitions keyed by selector
 * @param {string} imageBasePath base path for referenced images
 * @returns {Array<string>} configured selectors not present in the document
 */
function convertElementsByTagConversionMap(container, tagConversionMap, imageBasePath) {
    // process every selector defined by the conversion map:
    const elementsNotFound = [];
    for (const [selector, definition] of Object.entries(tagConversionMap)) {

        // escape namespace colons before querying the XML document:
        const selectorForQuery = selector.replace(/:/g, "\\:"); // e.g. "ali:license_ref"
        const xmlElements = container.querySelectorAll(selectorForQuery);

        // collect matching XML elements or retain the missing selector:
        if (xmlElements.length === 0) {
            elementsNotFound.push(selector);
            continue;
        }

        // read the conversion properties applied to each matching XML element
        const mappedTagName = definition.tagName;
        const mappedClassName = definition.className;
        const metaTitle = definition.metaTitle;
        const refAttribute = definition.refAttribute;
        const mappedAttribute = definition.setAttribute;

        for (const xmlElement of xmlElements) {
            // create the configured HTML element:
            const newElement = document.createElement(mappedTagName);

            // transfer source identity and mapped metadata:
            if (xmlElement.className) {
                newElement.classList.add(xmlElement.className);
            }
            if (xmlElement.id) {
                newElement.id = xmlElement.id;
            }
            if (metaTitle) {
                newElement.setAttribute("data-meta-title", metaTitle);
            }
            if (mappedClassName) {
                newElement.classList.add(mappedClassName);
            }

            // map configured reference attributes by reference purpose:
            if (refAttribute !== undefined) {
                const refValue = xmlElement.getAttribute(refAttribute)?.trim() || "";
                switch (selector) {
                    case "graphic":
                    case "inline-graphic":
                        setImageSource(newElement, refValue, imageBasePath);
                        break;
                    case "license":
                        appendLicenseUrl(xmlElement, refValue);
                        break;
                    case "ext-link":
                        configureExternalLink(xmlElement, newElement, refValue);
                        break;
                    default:
                        configureInternalReference(
                            newElement,
                            refValue,
                            mappedClassName
                        );
                        break;
                }
            }

            // transfer configured XML attributes:
            if (mappedAttribute !== undefined) {
                let attributeKey = mappedAttribute;
                let attributeValue = xmlElement.getAttribute(attributeKey);

                if (attributeKey === "xml:lang") {
                    attributeKey = "lang";
                }
                if (selector === "contrib-group" && attributeValue === null) {
                    const firstChild = xmlElement.firstElementChild;
                    if (firstChild?.getAttribute("contrib-type") === "author") {
                        attributeValue = "article-contributors";
                    }
                }
                if (attributeKey === "translate") {
                    attributeValue = "no";
                }
                if (attributeKey !== null && attributeValue !== null) {
                    newElement.setAttribute(attributeKey, attributeValue);
                }
            }

            // transfer content and replace the XML element:
            newElement.innerHTML = xmlElement.innerHTML;
            xmlElement.replaceWith(newElement);
        }
    }

    return elementsNotFound;
}

/**
 * Resolves a mapped image source from an embedded or file-based reference.
 *
 * @param {HTMLImageElement} image converted image element
 * @param {string} refValue image source reference
 * @param {string} imageBasePath base path for file-based images
 * @returns {void}
 */
function setImageSource(image, refValue, imageBasePath) {
    if (refValue.startsWith("data:")) {
        image.src = refValue;
    } else {
        image.src = refValue ? imageBasePath + "/" + refValue : "";
    }
}

/**
 * Appends a visible licence URL to the source licence element.
 *
 * @param {Element} xmlElement source licence element
 * @param {string} refValue licence URL
 * @returns {void}
 */
function appendLicenseUrl(xmlElement, refValue) {
    const licenseUrl = document.createElement("a");
    licenseUrl.classList.add("license-url");
    licenseUrl.href = refValue;
    licenseUrl.textContent = refValue;
    xmlElement.appendChild(licenseUrl);
}

/**
 * Applies the URL and browsing behavior of an external link.
 *
 * @param {Element} xmlElement source external-link element
 * @param {HTMLAnchorElement} link converted link element
 * @param {string} refValue external URL
 * @returns {void}
 */
function configureExternalLink(xmlElement, link, refValue) {
    const specificUse = xmlElement.getAttribute("specific-use");
    if (specificUse) {
        link.setAttribute("data-specific-use", specificUse);
    }
    if (!specificUse || specificUse === "weblink") {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
    }
    link.href = refValue;
}

/**
 * Applies the target and generated identity of an internal reference.
 *
 * @param {HTMLAnchorElement} link converted reference element
 * @param {string} refValue referenced element identifier
 * @param {string|false} mappedClassName configured reference class
 * @returns {void}
 */
function configureInternalReference(link, refValue, mappedClassName) {
    link.href = refValue ? "#" + refValue : "";
    link.id = "xref-" + createRandomString(4) + "_" + refValue;
    link.setAttribute(
        "data-target-section",
        getTargetSectionForReference(mappedClassName)
    );
}

/* ----------------------
 * Generate identifiers
 * --------------------- */

/**
 * Assigns deterministic IDs to text elements that have no source ID.
 *
 * @param {NodeListOf<Element>} textContentElements text elements to identify
 * @returns {void}
 */
function assignMissingElementIds(textContentElements) {
    for (const [index, element] of textContentElements.entries()) {
        // preserve identifiers supplied by the XML source:
        if (element.id) continue;

        // derive the generated ID from element type and document position:
        const tagPrefix = element.classList.contains("title")
            ? "t"
            : element.tagName.substring(0, 2);
        let generatedId = "genId-" + tagPrefix + index;

        // use the established footnote prefix inside footnote containers:
        if (element.parentElement?.classList.contains("footnote")) {
            generatedId = "fn-genId" + index;
        }
        element.id = generatedId;
    }
}

/**
 * Creates a random alphanumeric string for generated element identifiers.
 *
 * @param {number} length number of characters to generate
 * @returns {string} random alphanumeric string
 */
export function createRandomString(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ" + 
    "abcdefghijklmnopqrstuvwxyz0123456789";

    let result = "";
    for (let i = 0; i < length; i++) {
        const characterIndex = Math.floor(Math.random() * characters.length);
        result += characters.charAt(characterIndex);
    }

    return result;
}

/* ---------------------
 * Internal references
 * --------------------- */

/**
 * Resolves the target section for an internal-reference class.
 *
 * @param {string|false} className configured reference class
 * @returns {string} target application section
 */
function getTargetSectionForReference(className) {

    // map classes to target:
    const targetSectionByClass = {
        "fig-ref": "figures",
        "fn-ref": "notes",
        "bib-ref": "references"
    };
    // get target section:
    const targetSection = targetSectionByClass[className] || "contents";

    return targetSection;
}

/* ---------------------
 * Heading hierarchy
 * --------------------- */

/**
 * Replaces converted title elements with headings based on section depth.
 *
 * @param {Element} content converted article content
 * @returns {void}
 */
function convertTitlesToHeadings(content) {
    const textBody = content.querySelector(".text-body");
    const titles = textBody.querySelectorAll(".title");

    for (const title of titles) {
        // derive heading level from ancestor sections:
        let level = 1;
        let ancestor = title.parentElement;
        while (ancestor && ancestor !== textBody) {
            if (ancestor.localName === "section") {
                level++;
            }
            ancestor = ancestor.parentElement;
        }

        // retain the level on the containing section:
        if (title.parentElement?.localName === "section") {
            title.parentElement.setAttribute("level", level);
        }

        // resolve and create the corresponding HTML heading:
        const headingProperties = getHeadingProperties(level);
        const heading = document.createElement(headingProperties.elementName);
        heading.id = title.id;
        heading.classList.add(headingProperties.className, "title");
        heading.setAttribute("level", level);
        heading.innerHTML = title.innerHTML;
        title.replaceWith(heading);
    }
}

/**
 * Returns heading element and class names for a section depth.
 *
 * @param {number} level section heading level
 * @returns {{elementName: string, className: string}} heading properties
 */
function getHeadingProperties(level) {
    const headingPropertiesByLevel = {
        1: {elementName: "h1", className: "article-title"},
        2: {elementName: "h2", className: "main-section-title"},
        3: {elementName: "h3", className: "section-title"}
    };
    const deeperHeadingProperties = {
        elementName: "h4",
        className: "subsection-title"
    };
    const headingProperties =
        headingPropertiesByLevel[level] || deeperHeadingProperties;

    return headingProperties;
}

/* ---------------------
 * Text links
 * --------------------- */

/**
 * Converts URL-like substrings in plain text into external links.
 * Trailing sentence punctuation remains outside generated links.
 *
 * @param {string} text plain text containing possible URLs
 * @returns {DocumentFragment} text and generated external links
 */
export function linkifyUrls(text) {
    const fragment = document.createDocumentFragment();
    const detectedUrlPattern = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
    let textIndex = 0;

    for (const match of text.matchAll(detectedUrlPattern)) {
        // append text preceding the detected URL:
        fragment.append(text.slice(textIndex, match.index));

        // separate trailing punctuation from the URL:
        let url = match[0];
        let trailing = "";
        while (/[.,;]$/.test(url)) {
            trailing = url.slice(-1) + trailing;
            url = url.slice(0, -1);
        }

        // create the external link without constructing HTML strings:
        const link = document.createElement("a");
        link.className = "ext-ref";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.href = /^https?:\/\//i.test(url) ? url : "https://" + url;
        link.textContent = url;

        fragment.append(link, trailing);
        textIndex = match.index + match[0].length;
    }

    // append text following the final detected URL:
    fragment.append(text.slice(textIndex));

    return fragment;
}
