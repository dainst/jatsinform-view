/* ---------------------
 * Application resources
 * --------------------- */

// define application resources loaded together during startup:
const APPLICATION_RESOURCE_MANIFEST = {
    controlKeyList: { path: "configs/controlKeyList.json", format: "json" },
    tagConversionMap: { path: "configs/tagConversionMap.json", format: "json" },
    journalsConfig: { path: "configs/journals.json", format: "json" },
    figConstellations: { path: "configs/figConstellations.json", format: "json" },
    viewerStyles: { path: "web-viewer/article-viewer-styles.css", format: "text" },
    viewerFallbackStyles: { path: "src/css/viewer-fallback-styles.css", format: "text" }
};

/**
 * Loads and parses all resources in the application manifest.
 *
 * @returns {Promise<Object>} application resources keyed by manifest name
 */
async function loadApplicationResources() {
    // load and parse every resource defined in the application manifest:
    const entries = await Promise.all(
        Object.entries(APPLICATION_RESOURCE_MANIFEST).map(async ([name, definition]) => {
            const source = await fetchText(definition.path);
            const value = definition.format === "json"
                ? parseJson(source, definition.path)
                : source;
            return [name, value];
        })
    );
    return Object.fromEntries(entries);
}

/**
 * Fetches a text resource and rejects unsuccessful HTTP responses.
 *
 * @param {string} path resource path to fetch
 * @returns {Promise<string>} loaded resource text
 */
async function fetchText(path) {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error("Could not load " + path + " (HTTP " + response.status + ")");
    }
    return response.text();
}

/**
 * Parses JSON source and identifies its resource in parsing errors.
 *
 * @param {string} source JSON source text
 * @param {string} path source resource path
 * @returns {*} parsed JSON value
 */
function parseJson(source, path) {
    try {
        return JSON.parse(source);
    } catch (error) {
        throw new Error("Could not parse " + path + ": " + error.message);
    }
}

export const resources = Object.freeze({
    loadApplicationResources,
    fetchText,
    parseJson
});

/* ---------------------
 * View dependencies
 * --------------------- */

/**
 * Appends a script or stylesheet element and resolves when it has loaded.
 *
 * @param {HTMLScriptElement|HTMLLinkElement} element resource element to append
 * @param {string} [resourceName] resource name reported in loading errors
 * @returns {Promise<Event>} resolves with the resource load event
 */
function appendResource(element, resourceName = element.src || element.href) {
    return new Promise((resolve, reject) => {
        element.addEventListener("load", resolve, { once: true });
        element.addEventListener("error", () => {
            reject(new Error("Could not load resource: " + resourceName));
        }, { once: true });
        document.head.appendChild(element);
    });
}

/**
 * Creates and loads a named script or stylesheet from a resource library.
 *
 * @param {string} name resource name in the library
 * @param {Object} library resource definitions keyed by name
 * @returns {Promise<Event>} resolves when the resource has loaded
 */
function loadNamedResource(name, library) {
    // resolve the requested entry from the configured resource library:
    const resource = library[name];
    if (!resource) {
        return Promise.reject(
            new Error("Resource is not defined in the resource library: " + name)
        );
    }

    // create the matching DOM element for scripts or stylesheets:
    let element;
    if (resource.type === "text/javascript") {
        element = document.createElement("script");
        element.type = "text/javascript";
        element.src = resource["src-local"];
        element.async = false;
    } else if (resource.type === "text/css") {
        element = document.createElement("link");
        element.type = "text/css";
        element.rel = "stylesheet";
        element.href = resource["src-local"];
    } else {
        return Promise.reject(new Error("Unsupported resource type for " + name));
    }
    return appendResource(element, name);
}

/**
 * Creates the stylesheet element required by a journal view.
 *
 * @param {string} journalId selected journal identifier
 * @param {string} view selected application view
 * @returns {HTMLLinkElement} stylesheet element for deferred insertion
 */
function createStylesheet(journalId, view) {
    // resolve the stylesheet for the selected journal and view:
    const stylesheets = {
        pagedView: journalId === "e-DAI-F"
            ? "src/css/paged-styles-efb.css"
            : "src/css/paged-styles-journals.css",
        htmlView: "web-viewer/article-viewer-styles.css"
    };
    const stylesheet = stylesheets[view];
    if (!stylesheet) throw new Error("Unknown stylesheet view: " + view);

    // create the stylesheet element for deferred insertion:
    const link = document.createElement("link");
    link.type = "text/css";
    link.rel = "stylesheet";
    link.href = stylesheet;
    return link;
}

export const viewLoader = Object.freeze({
    appendResource,
    createStylesheet,
    loadNamedResource
});
