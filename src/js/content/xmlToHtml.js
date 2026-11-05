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

export function convert(xmlDoc, tagConversionMap, {
    imageBasePath = "",
    onDiagnostic = null} = {}) {

    const xmlArticle = xmlDoc.getElementsByTagName("article")[0];

    // remove empty elements except of (inline-)graphic:
    removeEmptyElements(xmlArticle, onDiagnostic);

    // convert xml elements to html elements:
    convertElementsByTagConversionMap(xmlArticle, tagConversionMap, {
        imageBasePath,
        onDiagnostic
    });

    // enhance code wit <pre> and language-class:
    const codeItems = xmlDoc.querySelectorAll("code:not(.language-xml)");
    for (let i = 0; i < codeItems.length; i++) {
        const language = codeItems[i].getAttribute("language");
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        if (language) { code.classList.add(language); }
        code.innerHTML = codeItems[i].innerHTML;
        pre.appendChild(code)
        codeItems[i].replaceWith(pre);
    }

    // set metaName as element-attribute of custom-meta:
    const customMetaElements = xmlDoc.querySelectorAll(".custom-meta");
    for (let i = 0; i < customMetaElements.length; i++) {
        const metaName = customMetaElements[i].querySelector(".meta-name");
        const metaClass = metaName?.innerText.trim();
        if(metaClass) {
            customMetaElements[i].classList.add(metaClass);
        }
    }

    // create generic ids for text-elements:
    const textContentElements = xmlArticle.querySelectorAll(
        "p, ul, ol, li, table, pre, code, .title"
    );
    generateGenericElementIdsIfMissing(textContentElements);

    // classify title-level by section
    createHeadlinesBySectionHierarchy(xmlArticle, "text-body");

    // wrap xmlArticle content into htmlWrapper
    const htmlWrapper = document.createElement("div");
    htmlWrapper.id = "html-wrapper";
    htmlWrapper.classList.add("html-wrapper");
    htmlWrapper.innerHTML = xmlArticle.innerHTML;
    return(htmlWrapper);
}

function removeEmptyElements(container, onDiagnostic) {

    // get empty elements:
    const emptyTags = container.querySelectorAll("*:empty:not(graphic,inline-graphic)");

    // remove empty elements:
    for (let i = 0; i < emptyTags.length; i++) {
        onDiagnostic?.("warning", "Empty XML element was removed", {
            element: emptyTags[i]
        });
        emptyTags[i].remove();
    }
}

function convertElementsByTagConversionMap(xmlBody, tagConversionMap, {
    imageBasePath,
    onDiagnostic}) {

    // convert selectors as defined in tagConversionMap:
    const elementsNotFound = [];
    for (const selector in tagConversionMap) {
        const selectorForQuery = selector.replace(/:/g, "\\:");
        const mapTagName = tagConversionMap[selector]["tagName"];
        const mapClassName = tagConversionMap[selector]["className"];
        const metaTitle = tagConversionMap[selector]["metaTitle"];

        // process each selector
        if (xmlBody.querySelectorAll(selectorForQuery).length !== 0) {
            const xmlElements = xmlBody.querySelectorAll(selectorForQuery);

            for (let i = 0; i < xmlElements.length; ++i) {
                const newElement = document.createElement(mapTagName);
                
                // transfer ids and classnames of xml-elements:
                if (xmlElements[i].className) {newElement.classList.add(xmlElements[i].className);}
                if (xmlElements[i].id) {newElement.id = xmlElements[i].id;}

                // transfer metaTitles as data-attribute:
                if (metaTitle) {newElement.setAttribute("data-meta-title", metaTitle)};
        
                // add new defined classnames in tagConversionMap
                if (mapClassName) {newElement.classList.add(mapClassName);}

                // set ref-links:
                if (tagConversionMap[selector].hasOwnProperty("refAttribute")) {
                    let refAttribute = tagConversionMap[selector]["refAttribute"];
                    let refValue = xmlElements[i].getAttribute(refAttribute);

                    // image source-links:
                    if (selector === "graphic" || selector === "inline-graphic") {
                        // exclude placeholder-graphics:
                        if(refValue.startsWith('data:')) {
                            newElement.src = (refValue) ? refValue : "";
                        } 
                        else {
                            newElement.src = (refValue) ? imageBasePath + "/" + refValue : "";
                        }
                    }
                    // get license-url:
                    else if(selector === "license") {
                        let licenseUrl = document.createElement("a");
                        licenseUrl.classList.add("license-url");
                        licenseUrl.href = (refValue) ? (refValue).trim() : "";
                        licenseUrl.textContent = (refValue) ? (refValue).trim() : "";
                        xmlElements[i].appendChild(licenseUrl);
                    }
                    // external url-links:
                    else if (selector === "ext-link") {
                        // handle over specific-use attributes of ext-link
                        if(xmlElements[i].getAttribute("specific-use")) {
                            let specificUseValue = xmlElements[i].getAttribute("specific-use");
                            newElement.setAttribute("data-specific-use", specificUseValue);
                            // ext-link as external:
                            if(specificUseValue === "weblink")  {
                                newElement.target = "_blank";
                                newElement.rel="noopener noreferrer";
                            }
                        } else {
                            newElement.target = "_blank";
                            newElement.rel="noopener noreferrer";
                        }
                        // add href:
                        newElement.href = (refValue) ? (refValue).trim() : "";

                    // internal id-links:
                    } else {
                        newElement.href = (refValue) ? "#" + (refValue).trim() : "";
                        newElement.id = "xref-" + createRandomString(4) + "_" + refValue;
                        newElement.setAttribute("data-target-section", defineTargetSectionByClassname(mapClassName));
                    }
                }
                // set defined attribute to newElement
                if (tagConversionMap[selector].hasOwnProperty("setAttribute")) {
                    let attributeKey = tagConversionMap[selector]["setAttribute"];
                    let attributeValue = xmlElements[i].getAttribute(attributeKey);

                    // transform xml:lang-attribute to lang (html)
                    attributeKey = (attributeKey === "xml:lang") ? "lang" : attributeKey;
                    if(selector === "contrib-group" && attributeValue === null) {
                        // check firstChild of contrib-group:
                        let firstChild = xmlElements[i].firstElementChild;
                        if(firstChild && firstChild.getAttribute("contrib-type") === "author") {
                            attributeValue = "article-contributors";
                        }
                    }
                    // add translate="no" to defined elements:
                    if(attributeKey === "translate") {attributeValue = "no";}
               
                    // set attribute to new element:
                    if(attributeKey !== null && attributeValue !== null) {
                        newElement.setAttribute(attributeKey, attributeValue);
                    }
                }
    
                if(selector === "xref[ref-type='fig']"
                && xmlElements[i].getAttribute("specific-use")) {
                    let specificUseValue = xmlElements[i].getAttribute("specific-use");
                    newElement.setAttribute("data-specific-use", specificUseValue);
                }
                // transfer content
                newElement.innerHTML = xmlElements[i].innerHTML;

                // replace xml-element:
                xmlElements[i].replaceWith(newElement);
            }
        }
        else {
            elementsNotFound.push(selector);
        }
    }
    if(elementsNotFound.length) {
        onDiagnostic?.("notice", "Configured XML elements were not present", {
            elements: elementsNotFound
        });
    }
}

/* ---------------------
 * Generated identifiers
 * --------------------- */

function generateGenericElementIdsIfMissing(textContentElements) {

    let genId;
    for (let i = 0; i < textContentElements.length; i++) {
        if(!textContentElements[i].id) {
            let tagName = textContentElements[i].tagName;
            // use tagName abbreviation and loop index to genId
            if(/title/.test(textContentElements[i].className)) {
                genId = "genId-t" + i;
            }
            else if(tagName !== undefined) {
                genId = "genId-" + tagName.substring(0, 2) + i;
            } 
            else {
                genId = "genId-" + i;
            }
            let parent = textContentElements[i].parentElement;
            if(parent !== undefined) {
                if(/footnote/.test(parent.className)) {
                    genId = "fn-genId" + i;
                }
            }
            textContentElements[i].id = genId;
        }
    }
}

export function createRandomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for ( let i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

/* ---------------------
 * Internal references
 * --------------------- */

/**
 * Returns the target panel for an internal-reference class.
 *
 * @param {string} className
 * @returns {string}
 */
function defineTargetSectionByClassname(className) {

    let panelName;
    switch (true) {
        case (/fig-ref/.test(className)):
            panelName = "figures";
            break;
        case (/fn-ref/.test(className)):
            panelName = "notes";
            break;
        case (/bib-ref/.test(className)):
            panelName = "references";
            break;
        default:
            panelName = "contents";
            break;
    }
    return(panelName);
}

/* ---------------------
 * Heading hierarchy
 * --------------------- */

/**
 * Replaces XML title elements with headings based on section depth.
 *
 * @param {HTMLElement} content document-fragment made from original DOM
 * @param {string} parentClass CSS class of the parent element
 * @returns {void} headline elements are created within the DOM
 */
function createHeadlinesBySectionHierarchy(content, parentClass) {

    // select parent:
    const textBody = content.getElementsByClassName(parentClass)[0];

    // check position in section hierarchy
    const headlines = textBody.querySelectorAll(".title");
    for (let i = 0; i < headlines.length; i++) {
        let parent = headlines[i].parentElement;
        let level = 1; // start with 1 (= article-title)
        do {
            parent = parent.parentElement;
            level++; // at least 2 for normal headlines (loop always run once)
        }
        while (parent !== null && parent.className !== parentClass);

        // add level as attribute to sections:
        if(/section/.test(headlines[i].parentElement.tagName)) {
            headlines[i].parentElement.setAttribute("level", level);
        }

        // create html headline elements based on headlineProperties:
        const headlineProperties = defineHeadlinePropertiesByHierarchyLevel(level);
        const headline = document.createElement(headlineProperties.elementName);
        headline.id = headlines[i].id;
        headline.classList.add(headlineProperties.className);
        headline.setAttribute("level", level);
        headline.classList.add("title");
        headline.innerHTML = headlines[i].innerHTML;
        headlines[i].replaceWith(headline);
    }
}

/**
 * Returns heading element and class names for a section depth.
 *
 * @param {number} level
 * @returns {{elementName: string, className: string}}
 */
function defineHeadlinePropertiesByHierarchyLevel(level) {

    let headlineProperties = {};
    switch (true) {
        case (level === 1):
            headlineProperties.elementName = "h1";
            headlineProperties.className = "article-title";
            break;
        case (level === 2):
            headlineProperties.elementName = "h2";
            headlineProperties.className = "main-section-title";
            break;
        case (level === 3):
            headlineProperties.elementName = "h3";
            headlineProperties.className = "section-title";
            break;
        case (level > 3):
            headlineProperties.elementName = "h4";
            headlineProperties.className = "subsection-title";
            break;
        default:
            headlineProperties.elementName = "h2";
            headlineProperties.className = "main-section-title";
    }
    return headlineProperties;
}

/* ---------------------
 * Text links
 * --------------------- */

/**
 * Converts URL-like substrings in plain text into external anchor markup.
 * Trailing sentence punctuation remains outside the generated link.
 *
 * @param {string} text
 * @returns {string}
 */
export function urlify(text) {
    if (typeof text !== "string" || text.length === 0) return text;
    const detectedUrlRegex = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

    return text.replace(detectedUrlRegex, rawUrl => {
        let url = rawUrl;
        let trailing = "";
        while (/[.,;]$/.test(url)) {
            trailing = url.slice(-1) + trailing;
            url = url.slice(0, -1);
        }
        const href = /^https?:\/\//i.test(url) ? url : "https://" + url;
        return `<a class="ext-ref" target="_blank" rel="noopener noreferrer" href="${encodeURI(href)}">${url}</a>${trailing}`;
    });
}
