/* ----------------------
 * Imports
 * --------------------- */
import * as appDiagnosticsModule from "./application/appDiagnostics.js";
import * as controlHandlerModule from "./application/controlHandler.js";
import * as resourceLoaderModule from "./application/resourceLoader.js";
import * as stateHandlerModule from "./application/stateHandler.js";
import * as contentDiagnosticsModule from "./content/contentDiagnostics.js";
import * as imagesModule from "./content/images.js";
import * as jsonLdModule from "./content/jsonLd.js";
import * as xmlPreflightModule from "./content/xmlPreflight.js";
import * as xmlToHtmlModule from "./content/xmlToHtml.js";
import * as exportStaticHtmlModule from "./exports/exportStaticHTML.js";
import { pagedView } from "./views/generatePagedView.js";
import { webView } from "./views/generateWebView.js";

/* ----------------------
 * Application constants
 * --------------------- */
const VIEW_MODES = Object.freeze({
    PAGED: "PDF",
    WEB: "Viewer",
    SETUP: "Setup"
});

const STORAGE_KEYS = Object.freeze({
    AUTO_CORRECT_ITERATION: "auto-correct-iteration",
    DOCUMENT_STATE: "documentState",
    EDITOR_XML: "editor-xml",
    FIGURE_MAP: "figure-map",
    RENDER_MODE: "renderAs",
    SIZE_CLASS: "sizeClassSetGlobal",
    TEXT_CONTENT_MAP: "text-content-map"
});

const PROGRESS_STAGES = Object.freeze({
    LOAD_RESOURCES: "Loading application resources...",
    PROCESS_XML: "Process XML document...",
    READY: "Ready"
});

const SELECTORS = Object.freeze({
    ARTICLE_TITLE: "article-title",
    JOURNAL_ID: "journal-id",
    DIAGNOSTICS: "#diagnostics",
    XML_FILE_META: 'meta[name="--xml-file"]'
});

/* ---------------------
 * Application startup
 * --------------------- */
document.addEventListener("DOMContentLoaded", initializeApp);

/**
 * Starts the application and contains initialization failures at one boundary.
 * Resource, document, and selected-view initialization complete in order.
 * @returns {Promise<void>}
 */

async function initializeApp() {
    try {
        document.head.appendChild(faviconLink);

        // create storage access with application-level warning and error handling:
        const applicationStorage = stateHandlerModule.createStorage({
            onWarning: (message, details) => {
                reportDiagnostic("warning", message, details);
            },
            createWriteError: (message, details) => {
                return new ApplicationError(message, details);
            }
        });

        // bind storage operations passed to controls, processing, and view modules:
        const readStorageValue = (key, fallback = null) => {
            return applicationStorage.get(key, fallback);
        };
        const readJsonStorage = (key, fallback = null) => {
            return applicationStorage.getJson(key, fallback);
        };
        const writeStorageValue = (key, value) => {
            applicationStorage.set(key, value);
        };
        const writeJsonStorage = (key, value) => {
            applicationStorage.setJson(key, value);
        };
        const removeStorageValue = (key) => {
            applicationStorage.remove(key);
        };

        // read one property from the persisted state of the current document:
        const getDocumentStateProperty = (propertyKey) => {
            const documentState = readJsonStorage(STORAGE_KEYS.DOCUMENT_STATE, {});
            return documentState[propertyKey] ?? false;
        };

        // load shared application resources and create the runtime context:
        showProgress(PROGRESS_STAGES.LOAD_RESOURCES);
        const applicationResources =
            await resourceLoaderModule.resources.loadApplicationResources();
        const applicationContext = {
            document: null,
            resources: applicationResources
        };

        // create figure interaction with its storage and layout dependencies:
        const applicationFigureInteraction =
            controlHandlerModule.createFigureInteraction({
                figureMapKey: STORAGE_KEYS.FIGURE_MAP,
                sizeClassKey: STORAGE_KEYS.SIZE_CLASS,
                readJson: readJsonStorage,
                writeJson: writeJsonStorage,
                writeValue: writeStorageValue,
                getFigureModelSpecs: () => (
                    applicationContext.document?.journalConfig?.figureModelSpecs
                ),
                applyLayout: (figure, className) => {
                    pagedView.applyFigureLayout(figure, className);
                },
                onWarning: (message, details) => {
                    reportDiagnostic("warning", message, details);
                }
            });

        // attach keyboard controls after their configuration and services are available:
        initializeKeyboardControls(applicationResources.controlKeyList, {
            applicationContext,
            applicationFigureInteraction,
            applicationResources,
            readStorageValue,
            removeStorageValue,
            writeStorageValue
        });

        // load and parse the configured XML source:
        const xmlString = await loadXmlSource(readStorageValue);

        // initialize DOMparser and parse xmlString:
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");

        // stop initialization when the browser reports malformed XML:
        const parserIssue = xmlPreflightModule.getParserIssue(xmlDoc, xmlString);
        if (parserIssue) {
            throw new ApplicationError(
                "The XML document is not well-formed and could not be processed.",
                parserIssue,
                "source"
            );
        }

        // read the document metadata required for view initialization:
        const journalIdElement = requireElement(xmlDoc, SELECTORS.JOURNAL_ID, "XML");
        const articleTitleElement = requireElement(xmlDoc, SELECTORS.ARTICLE_TITLE, "XML");
        const journalId = journalIdElement.textContent;
        const articleTitle = articleTitleElement.textContent;

        // process the XML and complete the runtime document context:
        showProgress(PROGRESS_STAGES.PROCESS_XML);
        const documentContext = processXmlDocument(
            xmlDoc,
            applicationResources,
            {getDocumentStateProperty, readStorageValue, writeJsonStorage}
        );
        applicationContext.document = documentContext;

        // load and activate the persisted view mode:
        const mode = getSelectedViewMode(readStorageValue);
        await loadSelectedView(mode, journalId, articleTitle, {
            applicationContext,
            applicationResources,
            getDocumentStateProperty,
            readJsonStorage,
            writeJsonStorage
        });
        await activateSelectedView(mode, {
            applicationFigureInteraction,
            getDocumentStateProperty,
            writeJsonStorage
        });

        showProgress(PROGRESS_STAGES.READY);
    } catch (error) {
        showApplicationError(error);
    }
}

/* ---------------------
 * Resource loading
 * --------------------- */

/**
 * Loads the configured XML source from the editor bridge or document folder.
 *
 * @param {Function} readStorageValue reads a plain browser-storage value
 * @returns {Promise<string>} loaded XML source
 * @throws {ApplicationError} when the source configuration or XML is unavailable
 */
async function loadXmlSource(readStorageValue) {
    // resolve the configured XML source from document metadata:
    const xmlFileMeta = document.querySelector(SELECTORS.XML_FILE_META);
    if (!xmlFileMeta) {
        throw new ApplicationError("No XML file is configured", {
            selector: SELECTORS.XML_FILE_META
        });
    }

    // load XML passed over from the editor:
    if (xmlFromEditor) {
        const xml = readStorageValue(STORAGE_KEYS.EDITOR_XML);
        if (!xml) {
            throw new ApplicationError("Could not load XML source", {
                key: STORAGE_KEYS.EDITOR_XML
            });
        }
        return xml;
    }

    // validate and load the configured XML file:
    const xmlPath = `${xmlFolder}/${xmlFileMeta.content}`;
    if (!/\.xml$/i.test(xmlPath)) {
        throw new ApplicationError("Configured XML path is invalid", {
            path: xmlPath,
            selector: SELECTORS.XML_FILE_META
        });
    }

    const xml = await resourceLoaderModule.resources.fetchText(xmlPath);
    if (!xml) {
        throw new ApplicationError("Could not load XML source", {
            selector: SELECTORS.XML_FILE_META
        });
    }
    return xml;
}

/**
 * Loads a named script or stylesheet from the application resource library.
 *
 * @param {string} resourceName resource key defined in `scriptLibrary`
 * @returns {Promise<void>}
 * @throws {Error} when the resource is unknown, unsupported, or cannot load
 */
function loadViewDependency(resourceName) {
    return resourceLoaderModule.viewLoader.loadNamedResource(
        resourceName,
        scriptLibrary
    );
}

/* ----------------------------
 * Selected-view orchestration
 * --------------------------- */

/**
 * Returns the persisted view mode or Setup mode when the value is invalid.
 *
 * @param {Function} readStorageValue reads a plain browser-storage value
 * @returns {string} value from `VIEW_MODES`
 */
function getSelectedViewMode(readStorageValue) {
    const mode = readStorageValue(
        STORAGE_KEYS.RENDER_MODE,
        VIEW_MODES.SETUP
    );

    return Object.values(VIEW_MODES).includes(mode)
        ? mode
        : VIEW_MODES.SETUP;
}

/**
 * Loads styles and runtime dependencies for the selected view and configures
 * its view module before activation.
 *
 * @param {string} mode selected value from `VIEW_MODES`
 * @param {string} journalId journal identifier used for styles and the title
 * @param {string} articleTitle article title used for the browser title
 * @param {Object} dependencies
 * @param {Object} dependencies.applicationContext shared document context
 * @param {Object} dependencies.applicationResources loaded application resources
 * @param {Function} dependencies.getDocumentStateProperty reads persisted document state
 * @param {Function} dependencies.readJsonStorage reads JSON values from browser storage
 * @param {Function} dependencies.writeJsonStorage writes JSON values to browser storage
 * @returns {Promise<void>}
 * @throws {Error} when a required stylesheet or runtime dependency cannot load
 */

async function loadSelectedView(mode, journalId, articleTitle, {
        applicationContext,
        applicationResources,
        getDocumentStateProperty,
        readJsonStorage,
        writeJsonStorage
    }) {
    // create the browser title shared by the rendered document views:
    const title = document.createElement("title");
    title.textContent = journalId + ": " + articleTitle;

    if(mode === VIEW_MODES.PAGED) {
        // prepare Paged mode and its document metadata:
        window.PagedConfig = { auto: false };
        await appendViewStylesheet(journalId, "pagedView");
        document.head.appendChild(title);

        // load independent Paged mode dependencies in parallel:
        await Promise.all([
            loadViewDependency("highlightJs"),
            loadViewDependency("highlightJsCss"),
            loadViewDependency("interactJs")
        ]);
        // configure the Paged view with application and layout dependencies:
        pagedView.configure({
            applicationContext,
            applicationResources,
            STORAGE_KEYS,
            updateStorageEventListener: updateProgress,
            getDocumentStateProperty,
            readJsonStorage,
            writeJsonStorage,
            checkQualityOfUrls,
            reportDiagnostic,
            checkMaxLengthOfInnerText: contentDiagnosticsModule.markOverlongContent,
            URLifyString: xmlToHtmlModule.urlify,
            devMode,
            systemNotice,
            defaultTitles,
            contributorsPrepositions,
            imgQuality,
            firstTextPageId,
            maxAbstractLength,
            maxFootnoteLength,
            maxCaptionLength,
            createToC,
            rangeNextFigRefs,
            keepFiguresWithinSection,
            allFiguresOnTop,
            setAllFiguresTiny,
            setFiguresAtEnd,
            setNoFigures
        });
        // load Paged.js after its configuration is available:
        await loadViewDependency("pagedJs");
        return;
    }

    if(mode === VIEW_MODES.WEB) {
        // prepare Viewer mode and add structured article metadata:
        await appendViewStylesheet(journalId, "htmlView");
        document.head.appendChild(title);
        appendStructuredArticleData(applicationContext.document.jsonLd);

        // load independent Viewer mode dependencies in parallel:
        await Promise.all([
            loadViewDependency("highlightJs"),
            loadViewDependency("highlightJsCss"),
            loadViewDependency("leaflet"),
            loadViewDependency("leafletCss"),
            loadViewDependency("fontAwesome"),
            loadViewDependency("NotoSans")
        ]);
        // configure the Viewer with application and content dependencies:
        webView.configure({
            applicationContext,
            getDocumentStateProperty,
            checkQualityOfUrls,
            reportDiagnostic,
            URLifyString: xmlToHtmlModule.urlify,
            generateRandomString: xmlToHtmlModule.createRandomString,
            systemNotice,
            defaultTitles,
            contributorsPrepositions
        });
        return;
    }
    // load figure-constellation tooling for Setup mode:
    await loadViewDependency("figConstellationSetup");
}

/**
 * Activates the selected view after the window and its runtime dependencies
 * are ready.
 *
 * @param {string} mode selected value from `VIEW_MODES`
 * @param {Object} dependencies
 * @param {Object} dependencies.applicationFigureInteraction figure resize controller
 * @param {Function} dependencies.getDocumentStateProperty reads persisted document state
 * @param {Function} dependencies.writeJsonStorage writes JSON values to browser storage
 * @returns {Promise<void>}
 * @throws {Error} when required runtime dependencies are unavailable
 */

async function activateSelectedView(mode, {
        applicationFigureInteraction,
        getDocumentStateProperty,
        writeJsonStorage
    }) {
    // wait for remaining page resources before activating the selected view:
    if (document.readyState !== "complete") {
        await new Promise(resolve => {
            window.addEventListener("load", resolve, { once: true });
        });
    }

    // verify dependencies required by the selected view:
    appDiagnosticsModule.verifyViewDependencies(mode, {
        pagedMode: VIEW_MODES.PAGED,
        pagedViewApi: pagedView,
        webMode: VIEW_MODES.WEB
    });

    // render Paged mode and restore its interactive state:
    if (mode === VIEW_MODES.PAGED) {
        document.body.classList.add("fade-in");
        pagedView.registerHandler();
        await window.PagedPolyfill.preview();
        stateHandlerModule.restoreScrollState({
            getStateProperty: getDocumentStateProperty,
            writeState: state => {
                writeJsonStorage(STORAGE_KEYS.DOCUMENT_STATE, state);
            }
        });
        hljs.highlightAll();
        applicationFigureInteraction.enableResize(window.interact);
        return;
    }
    // render Viewer mode and initialize its standalone controller:
    if (mode === VIEW_MODES.WEB) {
        webView.render();
        await loadViewDependency("viewerConfig");
        await loadViewDependency("articleWebViewController");
        // trigger controller initialization because the native ready-state event has already passed:
        document.dispatchEvent(new Event("readystatechange"));
        hljs.highlightAll();
        return;
    }

    // present keyboard guidance for Setup mode:
    document.body.innerHTML = "Setup mode...(see console)!<br><br>" +
        "Press p for rendering jats-xml as pdf-preview.<br>" +
        "Press v for rendering jats-xml as html-view.<br>";
}

/**
 * Creates and loads the stylesheet for a journal and view.
 *
 * @param {string} journalId journal identifier used for stylesheet selection
 * @param {string} view configured stylesheet view, such as `pagedView` or `htmlView`
 * @returns {Promise<void>}
 * @throws {Error} when the view is unknown or the stylesheet cannot load
 */

async function appendViewStylesheet(journalId, view) {
    const stylesheet = resourceLoaderModule.viewLoader.createStylesheet(journalId, view);
    await resourceLoaderModule.viewLoader.appendResource(stylesheet);
}

/**
 * Appends Schema.org article metadata to the document head as JSON-LD.
 *
 * @param {Object} jsonLd structured article metadata
 * @returns {void}
 */

function appendStructuredArticleData(jsonLd) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(script);
}

/* ------------------------------------
 * Diagnostics and cross-window updates
 * ------------------------------------ */

// reload when the editor updates XML in another window:
window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEYS.EDITOR_XML) {
        window.location.reload();
    }
});

/**
 * Presents the current application progress stage.
 *
 * @param {string} processStage
 * @returns {void}
 */
function showProgress(processStage) {
    appDiagnosticsModule.showProgress(processStage, {
        readyStage: PROGRESS_STAGES.READY
    });
}

// preserve the progress callback expected by existing view modules:
function updateProgress(processStage) {
    showProgress(processStage);
}

/**
 * Delegates a structured nonfatal diagnostic to the diagnostics module.
 *
 * @param {string} level diagnostic severity
 * @param {string} message human-readable diagnostic message
 * @param {Object} [details={}] structured diagnostic details
 * @returns {Object} normalized diagnostic
 */
function reportDiagnostic(level, message, details = {}) {
    return appDiagnosticsModule.reportDiagnostic(level, message, details);
}

/* ---------------------
 * Keyboard controls
 * --------------------- */

/**
 * Connects configured keyboard commands to application and figure actions.
 *
 * @param {Object} controls keyboard-command configuration
 * @param {Object} dependencies
 * @param {Object} dependencies.applicationContext current document context
 * @param {Object} dependencies.applicationFigureInteraction figure command controller
 * @param {Object} dependencies.applicationResources loaded application resources
 * @param {Function} dependencies.readStorageValue reads plain browser-storage values
 * @param {Function} dependencies.removeStorageValue removes browser-storage values
 * @param {Function} dependencies.writeStorageValue writes plain browser-storage values
 * @returns {void}
 */
function initializeKeyboardControls(controls, {
        applicationContext,
        applicationFigureInteraction,
        applicationResources,
        readStorageValue,
        removeStorageValue,
        writeStorageValue
    }) {
    // connect configured commands to their application actions:
    controlHandlerModule.attachKeyboardControls({
        target: document,
        controls,
        actions: {
            showPagedView: () => {
                setViewModeAndReload(VIEW_MODES.PAGED, writeStorageValue);
            },
            showHTMLView: () => {
                setViewModeAndReload(VIEW_MODES.WEB, writeStorageValue);
            },
            setupFigConstellations: () => {
                setViewModeAndReload(VIEW_MODES.SETUP, writeStorageValue);
            },
            reload: () => window.location.reload(),
            hardReset: () => resetDocumentLayout(removeStorageValue),
            downloadDocumentFiles: () => {
                downloadSelectedView({
                    applicationContext,
                    applicationResources,
                    readStorageValue
                }).catch((error) => {
                    reportDiagnostic("error", "Document download failed", { error });
                });
            },
            highlightFigReferences,
            highlightContextInfo,
            displayOverflows,
            setGlobalFigureSize: applicationFigureInteraction.setGlobalSize
        },
        onFigureCommand: applicationFigureInteraction.handleCommand,
        onWarning: (message, details) => {
            reportDiagnostic("warning", message, details);
        }
    });
}

/* ---------------------
 * Application commands
 * --------------------- */

/**
 * Persists the selected view mode and reloads the application.
 *
 * @param {string} mode value from `VIEW_MODES`
 * @param {Function} writeStorageValue writes a plain browser-storage value
 * @returns {void}
 */
function setViewModeAndReload(mode, writeStorageValue) {
    writeStorageValue(STORAGE_KEYS.RENDER_MODE, mode);
    window.location.reload();
}

/**
 * Clears document-specific layout state and reloads the application.
 *
 * @param {Function} removeStorageValue removes a browser-storage value
 * @returns {void}
 */
function resetDocumentLayout(removeStorageValue) {
    // remove document-specific layout and restoration state:
    removeStorageValue(STORAGE_KEYS.FIGURE_MAP);
    removeStorageValue(STORAGE_KEYS.TEXT_CONTENT_MAP);
    removeStorageValue(STORAGE_KEYS.DOCUMENT_STATE);
    window.location.reload();
}

/**
 * Downloads the configuration or standalone document for the selected view.
 *
 * @param {Object} dependencies
 * @param {Object} dependencies.applicationContext current document context
 * @param {Object} dependencies.applicationResources loaded application resources
 * @param {Function} dependencies.readStorageValue reads a plain browser-storage value
 * @returns {Promise<void>}
 */
async function downloadSelectedView({
        applicationContext,
        applicationResources,
        readStorageValue
    }) {
    // delegate the download action according to the persisted view mode:
    const mode = getSelectedViewMode(readStorageValue);
    if (mode === VIEW_MODES.PAGED) {
        downloadDocumentConfig();
    } else if (mode === VIEW_MODES.WEB) {
        await downloadHTMLDocument(
            applicationContext.document,
            applicationResources.viewerFallbackStyles
        );
    }
}

/**
 * Highlights all figure-reference links in the current document.
 *
 * @returns {void}
 */
function highlightFigReferences() {
    document.querySelectorAll("a.fig-ref").forEach((element) => {
        element.style.background = "rgb(250 250 172)";
    });
}

/**
 * Reveals diagnostic context information for text and figure elements.
 *
 * @returns {void}
 */
function highlightContextInfo() {
    document.querySelectorAll(".text-content, figure").forEach((element) => {
        element.classList.add("display-data-attributes");
    });
}

/**
 * Reveals overflowing content in rendered Paged.js page areas.
 *
 * @returns {void}
 */
function displayOverflows() {
    document.querySelectorAll(".pagedjs_page_content").forEach((element) => {
        element.style.display = "flex";
    });
}

/* ---------------------
 * XML processing
 * --------------------- */

/**
 * Validates and converts a parsed JATS document, installs the generated HTML,
 * and returns the document metadata required by the selected view.
 *
 * @param {XMLDocument} xmlDocument parsed JATS document
 * @param {Object} applicationResources loaded application resources
 * @param {Object} dependencies
 * @param {Function} dependencies.getDocumentStateProperty reads persisted document state
 * @param {Function} dependencies.readStorageValue reads a plain browser-storage value
 * @param {Function} dependencies.writeJsonStorage writes JSON browser-storage values
 * @returns {Object} processed document context
 * @throws {ApplicationError} when configuration or XML validation fails
 */
function processXmlDocument(xmlDocument, applicationResources, {
        getDocumentStateProperty,
        readStorageValue,
        writeJsonStorage
    }) {
    const unsupportedImageExtensionRegex = /\.(?:tif|tiff)$/i;

    // validate the conversion configuration and XML contents:
    updateProgress("Preflight XML document...");
    const tagConversionMap = applicationResources.tagConversionMap?.[0];
    if (!tagConversionMap) {
        throw new ApplicationError("Required configuration is empty", {
            path: "configs/tagConversionMap.json"
        });
    }
    const xmlIssues = xmlPreflightModule.validate(
        xmlDocument,
        tagConversionMap,
        unsupportedImageExtensionRegex
    );
    if (xmlIssues.length > 0) {
        xmlIssues.forEach((issue) => reportDiagnostic(
            issue.severity,
            issue.message,
            issue
        ));
        throw new ApplicationError(
            "The XML document contains content errors and could not be processed.",
            { issues: xmlIssues },
            "source"
        );
    }

    // normalize a detached XML document before conversion:
    const normalizedXmlDocument = xmlToHtmlModule.normalizeJatsSections(xmlDocument);

    // identify the document and reset persisted state when it changes:
    const documentId = getDocumentStateProperty("documentId");
    const doiElement = normalizedXmlDocument.querySelector("article-id[pub-id-type='doi']");
    const articleId = doiElement ? doiElement.textContent : "document-without-id";
    const documentState = {};
    if (!documentId || documentId !== articleId) {
        documentState["documentId"] = articleId;    // commonly a doi-url
        documentState["scrollPosition"] = [0, 0];   // x- and y-coordinates
        writeJsonStorage(STORAGE_KEYS.DOCUMENT_STATE, documentState);
    }

    // resolve document language and journal configuration:
    const articleElement = requireElement(normalizedXmlDocument, "article", "XML");
    const languageAttribute = articleElement.getAttribute("xml:lang");
    const language = languageAttribute ? languageAttribute.slice(0, 2) : "de";
    const journalId = requireElement(normalizedXmlDocument, "journal-id","XML").textContent;
    const journalConfigs = applicationResources.journalsConfig?.[0];
    if (!journalConfigs) {
        throw new ApplicationError("Required configuration is empty", {
            path: "configs/journals.json"
        });
    }
    const journalKey = journalConfigs[journalId] !== undefined ? journalId : defaultJournal;
    const journalConfig = journalConfigs[journalKey];
    if (!journalConfig) {
        throw new ApplicationError("Journal configuration is unavailable", {
            journalId,
            path: "configs/journals.json"
        });
    }
    const journalColor = journalConfig["journalMainColor"];
    const journalColorHighContrast = journalConfig["journalMainColorHighContrast"];

    // build structured metadata and the runtime document context:
    const serializer = new XMLSerializer();
    const xmlFront = requireElement(normalizedXmlDocument, "front", "XML");
    const xmlFrontString = serializer.serializeToString(xmlFront);
    const jsonLd = jsonLdModule.mapJATSFrontToScholarlyArticle(xmlFrontString,{});
    const documentContext = {
        articleId,
        journalConfig,
        journalId,
        jsonLd,
        language,
        xmlFront: xmlFrontString
    };

    // convert the normalized XML and install the generated HTML:
    updateProgress("Convert XML to HTML...");
    const htmlWrapper = xmlToHtmlModule.convert(
        normalizedXmlDocument,
        tagConversionMap,
        {
            imageBasePath: xmlFolder,
            onDiagnostic: reportDiagnostic
        }
    );
    document.body.innerHTML = htmlWrapper.outerHTML;

    // normalize document-level HTML attributes:
    document.querySelectorAll("[xmlns]").forEach((element) => {
        element.removeAttribute("xmlns");
    });
    document.documentElement.lang = documentContext.language;

    // prepare document images with the persisted default size:
    updateProgress("Process image files...");
    imagesModule.prepareImages(document, {
        sizeClass: readStorageValue(STORAGE_KEYS.SIZE_CLASS, "medium"),
        onProgress: figureId => {
            updateProgress("Image preloading... " + figureId);
        }
    });

    // report an unusually high figure-to-paragraph ratio:
    const paragraphs = document.querySelectorAll(".content-paragraph");
    const figures = document.querySelectorAll("figure");
    if (figures.length > paragraphs.length) {
        reportDiagnostic("warning", "Article has more figures than paragraphs", {
            figures: figures.length,
            paragraphs: paragraphs.length,
            recommendation: "Use at least two paragraphs per figure"
        });
    }

    // apply journal and cover properties used by the stylesheets:
    const documentRoot = document.documentElement;
    documentRoot.style.setProperty("--pages-flex-direction", pagesFlexDirection);
    documentRoot.style.setProperty("--journal-color", journalColor);
    documentRoot.style.setProperty("--journal-color-high-contrast", journalColorHighContrast);
    documentRoot.style.setProperty("--background-url",
        imagesModule.getCoverBackgroundUrl(document, coverImageId)
    );
    documentRoot.style.setProperty("--background-position", backgroundPosition);
    documentRoot.style.setProperty("--background-blend-mode", backgroundBlendMode);
    documentRoot.style.setProperty("--background-blend-color", backgroundBlendColor);

    return documentContext;
}
/* ---------------------
 * Content diagnostics
 * --------------------- */

/**
 * Marks external links that do not match the configured persistent-URL rules.
 * UrlRegex and specificUseRegex are defined in app-config.js.
 * @returns {void}
 */
function checkQualityOfUrls() {
    if (!checkUrlPersistence) return;
    contentDiagnosticsModule.markNonPersistentUrls(
        document,
        urlRegex,
        specificUseRegex
    );
}

/* ---------------------
 * HTML export
 * --------------------- */

/**
 * Confirms and delegates standalone HTML export to the export module.
 *
 * @param {Object} documentContext processed document metadata
 * @param {string} fallbackStyles fallback CSS embedded in the export
 * @returns {Promise<void>}
 * @throws {Error} when the standalone document cannot be packaged
 */
async function downloadHTMLDocument(documentContext, fallbackStyles) {
    // confirm the export before starting image conversion and packaging:
    if (!window.confirm("Download this document as an HTML file?")) {
        return;
    }

    // delegate packaging with application configuration and warning reporting:
    await exportStaticHtmlModule.downloadDocument({
        documentContext,
        fallbackStyles,
        resourceBaseUrl: singleFileScriptsUrl,
        diagnosticsElement: appDiagnosticsModule.diagnosticsElement,
        diagnosticsSelector: SELECTORS.DIAGNOSTICS,
        convertImages: base64ImgConversion,
        imageQuality: imgQuality ?? 0.8,
        onWarning: (error, source) => {
            reportDiagnostic(
                "warning",
                "Image conversion was skipped; the original URL was retained",
                { error, source }
            );
        }
    });
}

/* ----------------------
 * Application errors
 * --------------------- */
class ApplicationError extends Error {
    constructor(message, details = {}, category = "application") {
        super(message);
        this.name = "ApplicationError";
        this.category = category;
        this.details = details;
    }
}

/**
 * Presents a fatal startup error and retains its details in the console.
 *
 * @param {unknown} error
 * @returns {void}
 */
function showApplicationError(error) {
    // normalize unknown failures to the application error shape:
    const applicationError = error instanceof ApplicationError
        ? error
        : new ApplicationError(
            error instanceof Error ? error.message : String(error),
            { cause: error }
        );

    // delegate presentation to diagnostics with a console fallback:
    if (appDiagnosticsModule?.showError) {
        appDiagnosticsModule.showError(applicationError);
        return;
    }

    // label application errors:
    const label = applicationError.category === "source"
        ? "XML source error:"
        : "Application initialization failed:";
    console.error(label, applicationError);
}

/**
 * Returns a required element or stops processing with an application error.
 *
 * @param {Document|Element} root query root
 * @param {string} selector required element selector
 * @param {string} [context="document"] diagnostic source context
 * @returns {Element}
 * @throws {ApplicationError} when the required element is missing
 */
function requireElement(root, selector, context = "document") {
    const element = root.querySelector(selector);

    if (!element) {
        throw new ApplicationError(
            "Required element is missing: " + selector,
            { context, selector }
        );
    }

    return element;
}
