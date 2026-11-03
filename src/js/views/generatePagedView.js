// Paged-view generation
// ---------------------
// Public API: pagedView.registerHandler() and pagedView.applyFigureLayout()

import { convertToDataUrl } from "../exports/imageEncoding.js";

// Dependencies supplied by the application entry point.
let applicationContext;
let applicationResources;
let STORAGE_KEYS;
let updateStorageEventListener;
let getDocumentStateProperty;
let readJsonStorage;
let writeJsonStorage;
let checkQualityOfUrls;
let reportDiagnostic;
let checkMaxLengthOfInnerText;
let URLifyString;
let devMode;
let systemNotice;
let defaultTitles;
let contributorsPrepositions;
let imgQuality;
let firstTextPageId;
let maxAbstractLength;
let maxFootnoteLength;
let maxCaptionLength;
let createToC;
let rangeNextFigRefs;
let keepFiguresWithinSection;
let allFiguresOnTop;
let setAllFiguresTiny;
let setFiguresAtEnd;
let setNoFigures;

function configurePagedView(dependencies) {
    ({
        applicationContext,
        applicationResources,
        STORAGE_KEYS,
        updateStorageEventListener,
        getDocumentStateProperty,
        readJsonStorage,
        writeJsonStorage,
        checkQualityOfUrls,
        reportDiagnostic,
        checkMaxLengthOfInnerText,
        URLifyString,
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
    } = dependencies);
}

// Paged-view constants
// --------------------
const resTypeClassListKey = 0;
const ratioClassListKey = 1;
const typesettingClassListKey = 2;
const pageSpaceBuffer = 0.93;
const temporaryMarginBuffer = 0.9;
const minDistanceFromNodeTop = 0;
const pageFigureMax = 2;
const figureDensityThreshold = 2;
const rangeOverSection = true;
const keepGlobalFigOrder = true;

// Paged.js handler
// ----------------
function controlPagedJsHandler() {

    class pagedJsHandler extends Paged.Handler {

        constructor(chunker, polisher, caller) {
            super(chunker, polisher, caller);
        }

        /** Chunker beforeParsed:
         *  runs on content before it is parsed and given IDs
         *  content → document-fragment made from the original DOM
         */
        beforeParsed(content) {
            // exclude application elements from paged content
            content.querySelectorAll("#diagnostics").forEach(element => {
                element.remove();
            });

            // create article and replace content
            updateStorageEventListener("Create PDF article...");
            // clean up list elements (from internal paragraphs)
            if(content.querySelectorAll("li") !== null) {
                let listElements = content.querySelectorAll("li");
                listElements.forEach(function (element) {
                    if(element.firstElementChild !== null &&
                    element.firstElementChild.tagName === "P") {
                        element.innerHTML = element.firstElementChild.innerHTML;
                    }
                });
            }
            const article = createPagedArticle(content);
            content.replaceChildren();
            content.append(article);
        }

        /** Chunker: afterParsed:
         *  runs after the content has been parsed but before rendering has started
         *  parsed → content once parsed and given ids (data-ref and break rules from the css)
         */
        afterParsed(parsed) {
            let documentId = getDocumentStateProperty("documentId");
            let previousTextContentMap = readJsonStorage(STORAGE_KEYS.TEXT_CONTENT_MAP);
            if (previousTextContentMap && previousTextContentMap["documentId"] === documentId) {
                createTextContentMap(parsed, previousTextContentMap);
            }
            else {
                createTextContentMap(parsed, false);
            }
         
            let previousFigMap = readJsonStorage(STORAGE_KEYS.FIGURE_MAP);
            if (previousFigMap && previousFigMap["documentId"] === documentId) {
                createFigureMap(parsed, previousFigMap);
            }
            else {
                createFigureMap(parsed, false);
            }
        }

        /** Layout: render node
         *   When a node is rendered
         *  (renderNode is the cloned node that is added to the DOM)
         */
        renderNode(sourceNode, renderNode, Layout) {

            let journalConfig = applicationContext.document.journalConfig;
            let isTwoColumnLayout = journalConfig["twoColumnLayout"];
            // e.g. for journal E-FB
            if(isTwoColumnLayout !== undefined && isTwoColumnLayout) {
                controlTwoColumnLayout(sourceNode, renderNode, Layout);
            }
            // default journals:
            else {
                controlDefaultLayout(sourceNode, renderNode, Layout);
            }
        }

        /** Chunker: afterPageLayout
         *  runs after a single page has gone through layout, and allows adjusting the breakToken
         *  pageElement → page element that just been rendered,
         *  page → node of the page being rendered,
         *  breakToken → location of the beginning of the overflow
         */
        afterPageLayout(pageElement, page, breakToken) {

            updateStorageEventListener("Render " + page.id + "...");

            // ignore hyphenation by pagedJs:
            ignoreHyphenationByPagedJs(pageElement, page, breakToken);

            // classify if elements are rendered on left or right page:
            classifyPageOfElements(pageElement, 
                "figure,.fig-number,.boxed-text,.meta-section,#endnotes-section");

            // classify position of elements on page:
            classifyElementPositionOnPage(pageElement,".text-content,figure");
            
            // push title orphans to next page:
            if(!devMode) pushTitleOrphansToNextPage(pageElement, page, breakToken);

            // push figure element on top of page:
            pushFigureElementOnTopOfPage(pageElement, 
                "p,.title,table,ol,ul,li,figure,figCaption,pre,.boxed-text");

            // enhance figure elements after page rendering:
            let pageContent = pageElement.querySelector(".pagedjs_page_content");
            let figures = pageContent.querySelectorAll("figure");
            let figCaption;
            for (let i = 0; i < figures.length; i++) {
                // add resizable class for interact-js:
                figures[i].classList.add("resizable");
                // set figCaptions as block element after page rendering
                figCaption = figures[i].querySelector("figcaption");
                if(figCaption !== null) figCaption.style.display = "block";
            }

            // anchoring: replace footnote innerText with innerHTML saved as attr:
            let footnoteSpans = pageElement.querySelectorAll(".footnote");
            for (let i = 0; i < footnoteSpans.length; i++) {
                let isFootnote = footnoteSpans[i].getAttribute("isFootnote");
                if(isFootnote) { 
                    footnoteSpans[i].innerHTML = footnoteSpans[i].getAttribute("footnote-html");
                } 
            }
            // check urls:
            checkQualityOfUrls();

            // log calculations of node distances (see console)
            if(devMode) {
                logCalculationsOfNodeDistances(pageElement);                
            }
        }

        /** Chunker: afterRendered
         *  runs after all pages have finished rendering
         *  pages → array that contains all page nodes
         */
        afterRendered(pages) {
            if(pages) {updateStorageEventListener("Ready");}
            // post process images:
            document.querySelectorAll("FIGURE").forEach(element => {
                if(element.firstElementChild !== null) {
                    let img = element.firstElementChild;
                    // compress images based on imgQuality (see index.html):
                    if(img !== null && !/logo-img/.test(img.className)) {
                        convertToDataUrl(img, "image/jpeg",imgQuality,
                            (error, source) => {
                                reportDiagnostic(
                                    "warning",
                                    "Paged-view image compression was skipped",
                                    { error, source }
                                );
                            }
                        );
                    }
                    // add mouseover event class to typeset figures:
                    img.addEventListener("mouseover", () => {
                        img.classList.toggle('active');
                    })
                    img.addEventListener("mouseout", () => {
                        img.classList.remove('active');
                    })
                }
            });
            // remove last page if cloned images container is empty:
            let removePage = true; // true
            let clonedImagesContainer = document.querySelector("#cloned-images-container");
            if(clonedImagesContainer !== null) {
                // check if cloned images container is empty
                clonedImagesContainer.childNodes.forEach(element => {
                    if(/FIGURE/.test(element.tagName)) {removePage = false;}
                })
                // remove page
                if(removePage) {
                    let page = clonedImagesContainer.closest(".pagedjs_page");
                    page.remove();
                }
            }
        }
    }
    Paged.registerHandlers(pagedJsHandler);
}

function controlTwoColumnLayout(sourceNode, renderNode, Layout) {

    // get textContentMap and parsedContent:
    let textContentMap = readJsonStorage(STORAGE_KEYS.TEXT_CONTENT_MAP, {});
    delete textContentMap["documentId"];  // skip documentId:
    let parsedContent = Layout.hooks.afterParsed.context.source.firstChild;

    if(sourceNode && sourceNode.nodeType === Node.ELEMENT_NODE) {
        if(textContentMap[sourceNode.id] !== undefined && !textContentMap[sourceNode.id]["isSet"]) {
            // define nodeParams (e.g. position on page, figure references):
            let nodeParams = defineSourceNodeParameter(sourceNode, renderNode, parsedContent, Layout);
            processFigureEnhancingOfFigureColumnBlock(nodeParams);

            // handle over rest of figRefs which exceeds the limit maxNumFigures
            let maxNumFigures = 2; // limit of figures, each one single node can handle
            if(nodeParams["figRefs"]) {
                for (let i = maxNumFigures; i < nodeParams["figRefs"].length; i++) {
                    pushFigRefToNextNode(sourceNode.id, nodeParams["figRefs"][i]);
                }
            }
            // passFigRef to next content node:
            if(nodeParams["contexts"]["renderNodeType"] == "next-page-node") {
                let currentNodePosition = textContentMap[sourceNode.id]["position"];
                let nextNodeId = Object.keys(textContentMap)[currentNodePosition + 1];
                if(nextNodeId !== undefined) {
                    updateTextContentMap(nextNodeId, "ignoreFigRefPass", true);
                }
            }
            // set isSet flag in text-content-map:
            updateTextContentMap(sourceNode.id, "isSet", true);
        }
        else {
            adjustLayoutOfAppendixTitles(sourceNode);
        }
    }
}

 function controlDefaultLayout(sourceNode, renderNode, Layout) {

    // get textContentMap and parsedContent:
    let textContentMap = readJsonStorage(STORAGE_KEYS.TEXT_CONTENT_MAP, {});
    delete textContentMap["documentId"];  // skip documentId:
    let parsedContent = Layout.hooks.afterParsed.context.source.firstChild;

    if(sourceNode && sourceNode.nodeType === Node.ELEMENT_NODE) {
        // handle layout of text-content-elements:
        if(textContentMap[sourceNode.id] !== undefined && !textContentMap[sourceNode.id]["isSet"]) {
            // define nodeParams (e.g. position on page, figure references):
            let nodeParams = defineSourceNodeParameter(sourceNode, renderNode, parsedContent, Layout);

            // detect splitted nodes:
            let isSplitNode = (sourceNode.getAttribute("is-split-node") !== null) ? true : false;

            // exclude figures for defined paragraphs (first text page):
            if(nodeParams["contexts"]["pageId"] === firstTextPageId && !isSplitNode) {
                if(nodeParams["currentFigure"]) {
                    pushFigRefToNextNode(sourceNode.id, nodeParams["currentFigure"].id);
                }
                if(nodeParams["nextFigure"]) {
                    pushFigRefToNextNode(sourceNode.id, nodeParams["nextFigure"].id);
                }
            }
            else if(setFiguresAtEnd && !nodeParams["isLastOfAll"]) {
                if(nodeParams["currentFigure"]) {
                    pushFigRefToNextNode(sourceNode.id, nodeParams["currentFigure"].id);
                }
                if(nodeParams["nextFigure"]) {
                    pushFigRefToNextNode(sourceNode.id, nodeParams["nextFigure"].id);
                }
            }
            // process figure enhancing:
            else {
                processFigureEnhancing(nodeParams);
            }

            // handle over rest of figRefs which exceeds the limit maxNumFigures
            let maxNumFigures = 2; // limit of figures, each one single node can handle
            if(nodeParams["figRefs"]) {
                for (let i = maxNumFigures; i < nodeParams["figRefs"].length; i++) {
                    pushFigRefToNextNode(sourceNode.id, nodeParams["figRefs"][i]);
                }
            }
            // set isSet flag in text-content-map:
            updateTextContentMap(sourceNode.id, "isSet", true);
        }
        // define contexts of figure elements:
        else if(/FIGURE/.test(sourceNode.tagName)) {
            let contexts = definePageContextsOfSourceNode(sourceNode);
            contexts = calculateNodeDistances(contexts, sourceNode);
            setPageContextsAsElementAttribute(contexts, sourceNode, renderNode);

            // add resizable class for interact-js:
            // sourceNode.classList.add("resizable");
        }
        // adjust layout of appendix titles:
        else {
            adjustLayoutOfAppendixTitles(sourceNode);
        }
    }
}

  /**
 * process figure enhancing: meta function used to control the typesetting of figures:
 * based on defined typesetting classes, figure constellations, layout specs and page
 * contexts it decides if the figures currently processed will be inserted or pushed 
 * to the following node until it fits:
 * @param {JSON} nodeParams: parameter collection (e.g. pageContext-parameter,
 * target figure references, target figure Elements)
 * @returns {void} figures saved in nodeParams will be inserted in renderNode or not.
 */

function processFigureEnhancingOfFigureColumnBlock(nodeParams) {

    // shorten nodeParams and contextsParams:
    let sourceNode = nodeParams["sourceNode"];
    let renderNode = nodeParams["renderNode"];
    let contexts = nodeParams["contexts"];
    let currentFigure = nodeParams["currentFigure"];
    let nextFigure = nodeParams["nextFigure"];
    let htmlWrapper = contexts["pageContent"].querySelector(".html-wrapper"); // .html-wrapper
   
    // preset default typesetting classes:
    if(currentFigure) setFigureTypesettingClass(currentFigure);
    if(nextFigure) setFigureTypesettingClass(nextFigure);

    // set final layout specs of figures:
    if(currentFigure) setLayoutSpecsOfFigure(currentFigure, "inset");
    if(nextFigure) setLayoutSpecsOfFigure(nextFigure, "float-w-col-2");

    // add pseudo-nodes for all figures not set before:
    if(nodeParams["isLastOfAll"] && nodeParams["figRefs"].length > 0) {

        let textContentMap = readJsonStorage(STORAGE_KEYS.TEXT_CONTENT_MAP, {});
        let currentNodePosition = textContentMap[sourceNode.id]["position"];

        // get element in parsed source
        let parsedContent = nodeParams["parsedContent"];
        let sourceRef = sourceNode.getAttribute("data-ref");
        console.log(sourceRef);
        let sourceElement = parsedContent.querySelector(`[data-ref="${sourceRef}"]`);

        // flip sorting order due to reversed insert
        let nextFigRefs = nodeParams["figRefs"].reverse();
        for (let i = 0; i < nextFigRefs.length; i++) {
            // add pseudo-render node:
            let pseudoRenderNode = document.createElement("p");
            pseudoRenderNode.id = "pseudo-" + Math.floor(Math.random() * 101);
            pseudoRenderNode.setAttribute("data-ref",  pseudoRenderNode.id);
            pseudoRenderNode.classList.add("text-content", "pseudo-node");
            pseudoRenderNode.textContent = "[pseudo-node]";
            sourceElement.insertAdjacentElement("afterend", pseudoRenderNode);

            // assign values for each text element:
            let values = {
                "position": currentNodePosition + 1,
                "id": pseudoRenderNode.id,
                "tagName": pseudoRenderNode.tagName,
                "figRefs": nextFigRefs,
                "isSet": false,
                "style": false,
                "class": false,
                "isFirstOfSection": false,
                "isLastOfSection": false,
                "isLastOfAll": true,
                "numFigRefsSection": false,
                "numTextElementsSection": false,
                "ignoreFigRefPass": true,
            };
            textContentMap[pseudoRenderNode.id] = values;
            writeJsonStorage(STORAGE_KEYS.TEXT_CONTENT_MAP, textContentMap);
        }
    }

    /* ------------------------
    PREPARE FIGURE COLUMN BLOCK
    ----------------------------*/
    // check out existing figureColumnBlock or predefine a new one:
    let figColumnBlock;
    let pageContent = contexts["pageContent"];
    if(contexts["pageContent"].querySelector("#fig-column-block-" + contexts["pageNumber"]) !== null) {
        figColumnBlock = contexts["pageContent"].querySelector("#fig-column-block-" + contexts["pageNumber"]);   
        
    } else {
        figColumnBlock = document.createElement("div");
        figColumnBlock.id = "fig-column-block-" + contexts["pageNumber"];
        figColumnBlock.classList.add("fig-column-block");
    }

    /* ------------------------
    CALCULATE SPACING ON PAGE
    ----------------------------*/
  
    // calculate heights:
    // taken into account fig-column-block of 50% (48 % not exact, to be improved)
    let pageContentWidth = contexts["pageContentWidth"] * 0.48; 
    let maxPageContentHeight = contexts["maxPageContentHeight"] * pageSpaceBuffer;
    let maxTargetHeight = maxPageContentHeight * 0.9;
    let remainingSpace = maxPageContentHeight;  // add pageSpaceBuffer to avoid tight constellations:
    
    let clientSizeCurrentFigure;
    let clientHeightCurrentFigure;
    if(currentFigure) {
        // calculate clientSize of figure (includes figCaption and marginBottom)
        clientSizeCurrentFigure = calculateClientSizeOfFigure(currentFigure, pageContentWidth);
        clientHeightCurrentFigure = clientSizeCurrentFigure["clientHeightCalculated"];

        // rescale portait images with exceeding height limit (of page):
        if(clientHeightCurrentFigure > maxTargetHeight) {
            clientHeightCurrentFigure = maxTargetHeight;
            currentFigure.querySelector("img").style = "max-height:" + maxTargetHeight + "px;";
        }
    }
    let clientSizeNextFigure;
    let clientHeightNextFigure;
    if(nextFigure) {
        clientSizeNextFigure = calculateClientSizeOfFigure(nextFigure, pageContentWidth);
        clientHeightNextFigure = clientSizeNextFigure["clientHeightCalculated"];
        if(clientHeightNextFigure > maxTargetHeight) {
            clientHeightNextFigure = maxTargetHeight;
            nextFigure.querySelector("img").style = "max-height:" + maxTargetHeight + "px;";
        }
    }

    let figureBefore = false;
    let clientSizeFigureBefore = false;
    let clientHeightFigureBefore = false;
    if(figColumnBlock.children[0] !== undefined) {
        figureBefore = figColumnBlock.children[0];
        clientSizeFigureBefore = calculateClientSizeOfFigure(figureBefore, pageContentWidth);
        clientHeightFigureBefore = clientSizeFigureBefore["clientHeightCalculated"]
        remainingSpace = maxPageContentHeight - clientHeightFigureBefore;
        if(remainingSpace < 0) {remainingSpace = 0}; // nullify negative value of remainingSpace:
    };

    /* ------------------------------
    DEFINE CRITICAL LAYOUT CONDITIONS
    ---------------------------------*/

    // check if node contains fig-ref:
    let currentFigRefElementInNode = false;
    let nextFigRefElementInNode = false;
    if(currentFigure) {
        currentFigRefElementInNode = isFigRefElementInNode(currentFigure, renderNode);
    }
    if(currentFigure) {
        nextFigRefElementInNode = isFigRefElementInNode(nextFigure, renderNode);
    }

    /* ---------------------------
    DEFINE IF FIGURES FIT AT ALL
    ------------------------------*/

    let fits = [];
    fits["currentFigure"] = false;
    fits["nextFigure"] = false;

    let ignoreFigRefElementOnPage = nodeParams["ignoreFigRefPass"];
    if(currentFigure
        && remainingSpace >= clientHeightCurrentFigure) {
        if(currentFigRefElementInNode || ignoreFigRefElementOnPage) {
            fits["currentFigure"] = true;
        }
    } 

    if(nextFigure 
        && remainingSpace - clientHeightCurrentFigure >= clientHeightNextFigure) {
        if(nextFigRefElementInNode || ignoreFigRefElementOnPage) {
             fits["nextFigure"] = true;
        }
    }

    // keep global figure order, somehow broken
    if(keepGlobalFigOrder) {
        if(currentFigure && !isGlobalFigureOrder(currentFigure)) {
            fits["currentFigure"] = false;
        }
        if(nextFigure && !isGlobalFigureOrder(nextFigure)) {
            if(!fits["currentFigure"]) {
                fits["nextFigure"] = false;
            } 
        }
    }

    // exclude pages which have n-Figures already:
    if(contexts["isPageFigureMax"]) {
        fits["currentFigure"] = false;
        fits["nextFigure"] = false;
    }

    // respect exceptions like next-page node:
    if(contexts["renderNodeType"] == "next-page-node"
    && contexts["sourceNodeType"] !== "split-node-parent") {
        // renderNode.style.background = "yellow";
        fits["currentFigure"] = false;
        fits["nextFigure"] = false;
    }

    /* ------------------
    EXECUTION LOGICS
    --------------------*/
    // process inserts or skip
    if(fits["currentFigure"] && fits["nextFigure"]) {
        figColumnBlock.insertAdjacentElement("beforeend", currentFigure);
        figColumnBlock.insertAdjacentElement("beforeend", nextFigure);
        updateFigureMap(nextFigure.id);
        updateFigureMap(currentFigure.id);
    }
    else if(fits["currentFigure"]) {
        figColumnBlock.insertAdjacentElement("beforeend", currentFigure);
        updateFigureMap(currentFigure.id);
        pushFigRefToNextNode(sourceNode.id, nextFigure.id);
    } 
    else {
        pushFigRefToNextNode(sourceNode.id, currentFigure.id);
        pushFigRefToNextNode(sourceNode.id, nextFigure.id);
    }

    // add figColumnBlock to page
    if(figColumnBlock !== null && figColumnBlock.children.length) {
        htmlWrapper.insertAdjacentElement("afterbegin", figColumnBlock);
    } 
    if(figColumnBlock === null || figColumnBlock !== null 
    && !figColumnBlock.children.length) {
        pageContent.querySelector(".text-body").classList.add("two-columns");
    }
    else if(nodeParams["isLastOfAll"]) {
     
    }
    else {
        pageContent.querySelector(".text-body").classList.remove("two-columns");
    }

    /* ---------------
    LOGGING ALL
    -----------------*/

    const showLogs = false;
    if(showLogs) {
        console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>");
        let pageIdLog = contexts["pageId"] + "----------------------";
        console.log(pageIdLog);
        console.log("---isPageFigureMax:", contexts["isPageFigureMax"]);
        console.log("---page-has-figures:", contexts["pageHasFigure"]);

        let elementIdLog = "----" + sourceNode.id;
        console.log(elementIdLog);
        console.log("-----node-type:", nodeParams["contexts"]["renderNodeType"]);
        console.log("-----fig-refs:", nodeParams["figRefs"]);
        console.log("------------------------");

        if(currentFigure) {
            console.log("-----currentFigure:", currentFigure.id);
            console.log("-----remainingSpace", {remainingSpace});
            if(figureBefore) {
                console.log("-----heightFigureBefore", figureBefore.id, clientHeightFigureBefore );
            } else console.log("-----heightFigureBefore","[]");
            console.log("-----heightCurrentFigure:", clientHeightCurrentFigure);
            console.log("-----currentFigRefElementInNode:", currentFigRefElementInNode);
            console.log("-----ignoreFigRefPass:", nodeParams["ignoreFigRefPass"]);
            console.log("-----is-in-order:", isGlobalFigureOrder(currentFigure));

            let fitsCurrent = "-----fits-current-figure:" + fits["currentFigure"];
            if(fits["currentFigure"]) {
                console.log("%c" + fitsCurrent, "color: green;");
            } else console.log("%c" + fitsCurrent, "color: gray;");
        
        }
        else { 
            console.log("-----currentFigure:", "[]");
        }

        if(nextFigure) {
            console.log("-----nextFigure:", nextFigure.id);
            console.log("-----remainingSpace:", {remainingSpace});
            if(figureBefore) {
                console.log("-----heightFigureBefore", figureBefore.id, clientHeightFigureBefore );
            } else console.log("-----heightFigureBefore","[]");
            console.log("-----heightNextFigure:", clientHeightNextFigure);
            console.log("-----nextFigRefElementInNode:", nextFigRefElementInNode);
            console.log("-----ignoreFigRefPass:", nodeParams["ignoreFigRefPass"]);
            console.log("-----is-in-order:", isGlobalFigureOrder(nextFigure));
            
            let fitsNext = "-----fits-next-figure:" + fits["nextFigure"];
            if(fits["nextFigure"]) {
                console.log("%c" + fitsNext, "color: green;");
            } else console.log("%c" + fitsNext, "color: gray;");
        }
        else { 
            console.log("-----nextFigure:", "[]");
        }

        console.log("------------------------");
        console.log("-----Element", sourceNode);
        console.log("-----NodeParams", nodeParams);
    }
}  

function isFigRefElementInNode(figure, renderNode) {

    let figRefSelector;
    let figRefElement;
    let figRefElementInNode;
    if(figure) {
        figRefSelector = "a[href='#" + figure.id + "']";
        figRefElement = renderNode.querySelector(figRefSelector);
        figRefElementInNode = (figRefElement !== null) ? true : false;
    }
    return(figRefElementInNode);
}

// Paged article elements
// ----------------------
/**
 * create article-html for pdf rendering:
 * @param {DocumentFragment} content: document-fragment made from the original DOM
 * @returns {HTMLElement} article element: extensively enriched with all content- and meta-sections 
 * used in dai-journal-article 
 */
function createPagedArticle(content) {

    // get journal-id:
    let journalId = content.querySelector(".journal-id").textContent;

    // define short title information for margin-sections:
    let articleTitle = "[No-article-title]";
    let journalTitle = "[No-journal-title]";
    let volume = "[No-journal-volume]";
    let citeAs = "[No-citation-guideline]";
    if(content.querySelector(".article-title") !== null) {
        articleTitle = content.querySelector(".article-title").textContent;
    }
    if(content.querySelector(".journal-title") !== null) {
        journalTitle = content.querySelector(".journal-title").textContent;
    }
    if(content.querySelector(".volume") !== null) {
        volume = content.querySelector(".volume").textContent;
    }
    if(content.querySelector(".citation-guideline > .meta-value") !== null) {
        citeAs = content.querySelector(".citation-guideline > .meta-value").textContent;
    }
  
    // add values to document root:
    let documentRoot = document.querySelector(':root');
    documentRoot.style.setProperty('--article-title', "'" + articleTitle + "'");
    documentRoot.style.setProperty('--journal-title', "'" + journalTitle + "'");
    documentRoot.style.setProperty('--volume', "'" + volume + "'");
    documentRoot.style.setProperty('--citation-guideline', "'" + citeAs + "'");
    let issueFrontmatterPage = createIssueFrontmatterPage(content);

    // create journal logo:
    let journalLogo = document.createElement("figure");
    journalLogo.id = "journal-logo";
    if(applicationContext.document?.journalConfig) {
        let journalConfig = applicationContext.document.journalConfig;
        let logoPath = journalConfig["logoPath"];
        let logoImg = document.createElement("img");
        logoImg.classList.add("logo-img");
        logoImg.src = logoPath;
        logoImg.alt = "Logo of the journal"
        journalLogo.appendChild(logoImg);
    }

    // prepare article components:
    let titleElements = createTitleElements(content);
    let authorsElement = createAuthorsElement(content);
    let contributorsElement = createContributorsElement(content);
    let abstractCollection = createAbstractCollection(content);
    let abstractBox;
    if(abstractCollection.querySelector(".abstract") !== null) {
        abstractBox = abstractCollection.querySelector(".abstract");
    } else {
        abstractBox = document.createElement("div")
        abstractBox.classList.add("abstract", "warning-box")
        abstractBox.innerHTML = "[NO ABSTRACTS]";
    };
    let projectMetaSection = createProjectMetaSection(content);
    let referenceList = createReferenceList(content);

    let endnotesSection;
    if(journalId === "e-DAI-F") {endnotesSection = createEndnotesSection(content);}

    let contributorsDetails = createContributorsDetails(content, true);
    let articleMetaSection = createArticleMetaSection(content);
    let imprintSection = createImprintSection(content);
    let tocList = createToCFromHeadings(content);
    let figureSection = recreateFiguresSection(content);
    let sourceOfIllustrations = createSourceOfIllustrations(figureSection);

    // create article with documentId:
    let article = document.createElement("article");
    let documentId = getDocumentStateProperty("documentId");
    article.id = (documentId) ? documentId : "no-id";

    // append front-part to article:
    if(journalId === "e-DAI-F") {
        article.appendChild(issueFrontmatterPage);
        article.appendChild(titleElements);
        article.appendChild(authorsElement);
        article.appendChild(contributorsElement);
        article.appendChild(abstractBox);
        article.appendChild(projectMetaSection);
    // default:
    } else {
        article.appendChild(journalLogo);
        article.appendChild(abstractBox);
        let titleHeader = document.createElement("div");
        titleHeader.id = "title-header";
        titleHeader.append(authorsElement);
        titleHeader.append(titleElements);
        titleHeader.append(contributorsElement);
        article.appendChild(titleHeader);
    }

    // append main-text part:
    if(journalId !== "e-DAI-F") reformatFootnotes(content);
    article.innerHTML += content.querySelector("#html-wrapper").outerHTML;
  
    // append back-parts
    let meta = document.createElement("div");
    meta.classList.add("meta-section");

    let transAbstracts = abstractCollection.querySelectorAll(".trans-abstract");
    if(transAbstracts !== null) {
        transAbstracts.forEach(transAbstract => {
            meta.appendChild(transAbstract);
        });
    }
    meta.appendChild(contributorsDetails);
    meta.appendChild(articleMetaSection);
    meta.appendChild(imprintSection);
    if(createToC) {meta.appendChild(tocList);}

    // append back-part / appendixes:
    if(journalId === "e-DAI-F" && endnotesSection !== null) {
        article.appendChild(endnotesSection);
    }
    article.appendChild(referenceList);
    article.appendChild(sourceOfIllustrations);
    article.appendChild(meta);
    article.append(figureSection)

    // remove redundant elements:
    if(article.querySelectorAll("#poster-image").length > 0) {
        article.querySelectorAll("#poster-image").forEach(element => {
            element.remove();});
    }
    if(article.querySelector(".front") !== null) {
        article.querySelector(".front").remove();
    }
    if(article.querySelector(".back") !== null) {
        article.querySelector(".back").remove();
    }
    if(article.querySelector("#images-container") !== null) {
        article.querySelector("#images-container").remove();
        article.querySelector("#cloned-images-container > .title").remove();
    }
    return (article);
}

/**
 * create issue frontmatter page for e-fb as div-element:
 * @param {DocumentFragment} content: document-fragment made from original DOM
 * @returns {HTMLElement} coverPage with abstractSection
 */
function createIssueFrontmatterPage(content) {

    let issueFrontmatterPage = document.createElement("div");
    issueFrontmatterPage.id = "issue-frontmatter-page";

    // add journal title
    let journalTitle = document.createElement("div");
    journalTitle.id = "journal-title";
    journalTitle.textContent = "eFORSCHUNGSBERICHTE";
    issueFrontmatterPage.appendChild(journalTitle);

    // add issue number / volume
    if(content.querySelector(".volume") !== null) {
        let volume = document.createElement("div");
        volume.id = "volume";
        volume.textContent = content.querySelector(".volume").textContent;
        issueFrontmatterPage.appendChild(volume);
    }

    /* add topic location map image:
    if(content.querySelector("#poster-image > img") !== null) {
        let topicLocationContainer = document.createElement("div");
        topicLocationContainer.id = "topic-location-image";
        topicLocationContainer.appendChild(content.querySelector("#poster-image > img"));
        issueFrontmatterPage.appendChild(topicLocationContainer);
    }
        */

    // add title-topic-location
    if(content.querySelector(".title-topic-location > .meta-value") !== null) {
        let topicLoc = document.createElement("div");
        topicLoc.id = "topic-location";
        topicLoc.textContent = content.querySelector(".title-topic-location > .meta-value").textContent;
        let locIcon = document.createElement("i");
        locIcon.ariaHidden ="true";
        topicLoc.insertAdjacentElement("afterbegin", locIcon);
        issueFrontmatterPage.appendChild(topicLoc);
    }
    // add title-department
    if(content.querySelector(".title-department > .meta-value") !== null) {
        let titleDepartment = document.createElement("div");
        titleDepartment.id = "title-department";
        titleDepartment.textContent = content.querySelector(".title-department > .meta-value").textContent;
        issueFrontmatterPage.appendChild(titleDepartment);
    }
    return (issueFrontmatterPage);
}

function createTitleElements(content) {

    // prepae titleElemens container:
    let titleElements = document.createElement("div");
    titleElements.id = "title-elements";

    // get title and subtitle:
    let title = content.querySelector(".article-title");
    let subtitle = content.querySelector(".article-subtitle");

    let titleElement = document.createElement("h1");
    titleElement.classList.add("title-header-title");
    titleElement.innerHTML = (title !== null) ? title.textContent : "[Kein Titel]";

    // append to titleElements container
    titleElements.append(titleElement);
    
    let subtitleElement;
    if(subtitle !== null) {
        subtitleElement = document.createElement("h2");
        subtitleElement.classList.add("title-header-subtitle");
        subtitleElement.innerHTML = subtitle.textContent;
        // append to titleElements container
        titleElements.append(subtitleElement)
    }
    return(titleElements);
}

function createAuthorsElement(content) {
    
    let authorsElement = document.createElement("div");
    authorsElement.classList.add("title-header-authors");
    
    // get article contributors (e.g. authors):
    let authors = [];
    authors = content.querySelectorAll(".contrib[contrib-type='author']");

    // collect names of each author:
    let authorsCollection = [];
    if(authors.length) {
        for (let i = 0; i < authors.length; i++) {
            let givenName;
            let surName;
            if(authors[i].querySelector(".given-names") !== null) {
                givenName = authors[i].querySelector(".given-names").textContent;
            }
            if(authors[i].querySelector(".surname") !== null) {
                surName = authors[i].querySelector(".surname").textContent;
            }
            authorsCollection.push(givenName + " " + surName);
        }
    }

    // populate authorsElement with content:
    authorsElement.innerHTML = (authorsCollection.length) ? authorsCollection.join(", ") : "[Keine Autoren]";

    return(authorsElement);
}

function createContributorsElement(content) {

    // create contributorsElement and get document lang:
    let lang = document.documentElement.lang;
    let contributorsElement = document.createElement("p");
    contributorsElement.className = "title-header-contributors";

    // get article contributors (e.g. authors):
    let contributors = [];
    contributors = content.querySelectorAll(".contrib[contrib-type='co-author']");

    // collect names of each contributor (e.g. co-author):
    let contributorsCollection = [];
    if(contributors.length) {
        for (let i = 0; i < contributors.length; i++) {
            let givenName = contributors[i].querySelector(".given-names").textContent;
            let surName = contributors[i].querySelector(".surname").textContent;
            contributorsCollection.push(givenName + " " + surName);
        }
    }

    // populate authorsElement with content:
    if(contributorsCollection.length && lang !== undefined) {
        contributorsElement.innerHTML = contributorsPrepositions[lang] + " " + contributorsCollection.join(", ");
    }

    return(contributorsElement);
}

/**
 * create abstract collection (abstracts, trans-abstracts, keywords)
 * @param {DocumentFragment} content: document-fragment made from original DOM
 * @returns {HTMLElement} all abstracts and trans-abstracts (multiple) as abstract-boxes
 */
function createAbstractCollection(content) {

    let abstractCollection = document.createElement("div");
    abstractCollection.id = "abstract-collection";

    // query abstract content 
    let abstracts = content.querySelectorAll(".abstract, .trans-abstract");
    if(abstracts.length) {
        let kwdGroup = content.querySelectorAll(".kwd-group");
        abstracts.forEach(function(abstract) {
            // create abstract box:
            let abstractBox = createAbstractBox(abstract, kwdGroup);  
            
            // re-classify abstractHeadline:
            let abstractHeadline;
            if(abstractBox.querySelector(".title") !== null) {
                abstractHeadline = abstractBox.querySelector(".title");
                if(/abstract/.test(abstractBox.className)) {
                    abstractHeadline.classList.add("abstract-headline");
                }
                if(/trans-abstract/.test(abstractBox.className)) {
                    abstractHeadline.classList.add("title-appendix");
                }
                abstractHeadline.classList.remove("title");
            }
            // append abstractBoxes (one up to three)
            abstractCollection.appendChild(abstractBox);
        });
    }
    return(abstractCollection);
}

/**
 * create abstract box
 * @param {DocumentFragment} content: document-fragment made from original DOM
 * @param {HTMLElement} abstract: abstract elements (class .abstract or .trans-abstract)
 * @param {HTMLElement} kwdGroup: kwd elements grouped by language
 * @returns {HTMLElement} abstract with abstract elements and keywords.
 */
function createAbstractBox(abstract, kwdGroup) {

    if(abstract !== null) {
        // check maxLength of abstractText
        if(abstract.querySelectorAll(".abstract-text") !== null) {
            let abstractText = abstract.querySelectorAll(".abstract-text");
            if (abstractText.length > 0) {
                checkMaxLengthOfInnerText(abstractText[0], maxAbstractLength);
            }
        }

        // add generic abstract-title if missing:
        let abstractTitle;
        let abstractLang = abstract.getAttribute("lang");
        if(abstract.querySelector(".title") === null) {
            abstractTitle = document.createElement("h3");
            abstractTitle.classList.add("title");
            abstractTitle.textContent = defaultTitles["abstract"][abstractLang];
            abstract.insertAdjacentElement("afterbegin", abstractTitle);
        }

        // get keywordsSection
        let keywordsSection = document.createElement("div");
        keywordsSection.classList.add("kwd-group");
        if(kwdGroup.length) {
            for (let i = 0; i < kwdGroup.length; i++) {
                let keywordsLang = kwdGroup[i].getAttribute("lang");
                let abstractLang = abstract.getAttribute("lang");
                // if keywords correspond to abstractLang
                if(keywordsLang === abstractLang) {
                    let kwHeadline = kwdGroup[i].querySelector(".title");
                    if(kwHeadline === null) {
                        // generate default title:
                        kwHeadline = document.createElement("h3");
                        if(defaultTitles["keywords"][keywordsLang] !== undefined)  {
                            kwHeadline.textContent = defaultTitles["keywords"][keywordsLang];
                        } else (kwHeadline.textContent = "Keywords")
                    }
                    kwHeadline.classList.add("keywords-headline");
                    keywordsSection.appendChild(kwHeadline);

                    let keywords = kwdGroup[i].querySelectorAll(".keyword");
                    // add each keyword (span> to keywordSection:
                    for (let i = 0; i < keywords.length; i++) {
                        let lastIndex = keywords.length-1;
                        if(i !== lastIndex) {
                            // separate spans with comma except last kwd:
                            keywords[i].textContent = keywords[i].textContent + ", ";
                        }
                        keywordsSection.appendChild(keywords[i]);
                    }
                }
            }
        }
        else {
            keywordsSection.classList.add("warning-box");
            keywordsSection.innerHTML = "[KEYWORDS MISSING]";
        }

        // clean up empty paragraphs in abstract:
        let paragraphs = abstract.querySelectorAll("p");
        for (let i = 0; i < paragraphs.length; i++) {
            if(!paragraphs[i].childNodes.length
            || paragraphs[i].innerText.trim() === '') {
                paragraphs[i].remove();
            }
        }

        // add keywordsSection to abstract
        abstract.append(keywordsSection);
    }
    return(abstract)
}

/**
 * create project-meta-section like cooperations, funding etc.
 * @param {DocumentFragment} content document-fragment made from original DOM
 * @returns {HTMLElement} projectMetaSection with specific custom-meta-values
 */
function createProjectMetaSection(content) {

    let lang = document.documentElement.lang;
    let projectMetaSection = document.createElement("div");
    projectMetaSection.id = "project-meta-section";

    let projectMetaProperties =  ["cooperations", "funding", "project-lead", "project-team"];
    projectMetaProperties.forEach(propertyName => {
        // define meta element:
        let metaElement = document.createElement("p");
        metaElement.id = propertyName;
        // populate project meta section with content
        let selector = "." + propertyName + "> .meta-value";
        if(content.querySelector(selector) !== null) {
            // select value from articleMeta
            metaElement.textContent = content.querySelector(selector).textContent;
            // add title as span:
            let title = document.createElement("h3");
            title.classList.add("project-meta-title");
            title.textContent = defaultTitles[propertyName][lang];
            projectMetaSection.appendChild(title);
            projectMetaSection.appendChild(metaElement);
        }
    });
    return(projectMetaSection)
}

/**
 * create ToC: table of contents by headlines:
 * @param {DocumentFragment} content document-fragment made from original DOM
 * @returns {HTMLElement} toc: table of content; currently not used for dai-journals
 */
function createToCFromHeadings(content) {

    let toc = document.createElement("div");

    if (createToC) {
        let tocListTitle = document.createElement("h3");
        tocListTitle.id = "contents";
        tocListTitle.classList.add("title-appendix");
        let lang = document.documentElement.lang;
        tocListTitle.innerHTML = defaultTitles["contents"][lang];
        toc.append(tocListTitle);

        let tocList = document.createElement("ul");
        tocList.classList.add("toc-list");

        // get headings
        let headings = content.querySelectorAll(".title");
        if (headings) {
            for (let i = 0; i < headings.length; ++i) {
                let name = "toc-" + i;
                let level = headings[i].localName; // get h1, h2 etc.
                level = level.substring(1); // remove h
                headings[i].id = name;

                let tocListItem = document.createElement("li");
                tocListItem.classList.add("heading-ref", "level-" + level);
                let tocEntry = document.createElement("a");
                tocEntry.classList.add("heading-ref-a");
                tocEntry.setAttribute("href", "#" + name);
                tocEntry.innerHTML = headings[i].innerHTML;

                tocListItem.appendChild(tocEntry);
                tocList.appendChild(tocListItem);
            }
            toc.appendChild(tocList);
        }
    }
    return(toc);
}

/**
 * reformat footnotes for displaying them at bottom of page,
 * based on https://pagedjs.org/posts/2021-06-newRelease/:
 * @param {DocumentFragment} content document-fragment made from original DOM
 * @returns {void}
 */
function reformatFootnotes(content) {

    // get footnotes and footnoteReferences
    let footnotes = content.querySelectorAll(".footnote");
    let footnoteRefs = content.querySelectorAll("a[href*='#fn']");
    const footnotesCollection = [];

    if (footnoteRefs && footnotes) {
        // reformat footnotes:
        for (let i = 0; i < footnotes.length; ++i) {
            let footnote = document.createElement("span");
            // add attribute (distinct from endnotes)
            footnote.setAttribute("isFootnote", true); 

            // remove fn-label:
            if( footnotes[i].querySelector(".label")) {
                footnotes[i].querySelector(".label").remove();
            }
            // assign classes for rendering and for range-specific stylings
            if (i + 1 < 10) {
                footnote.classList.add("footnote");
                footnote.classList.add("footnote-1-9");
            } else if (i + 1 >= 10 && i + 1 <= 99) {
                footnote.classList.add("footnote");
                footnote.classList.add("footnote-10-99");
            } else {
                footnote.classList.add("footnote");
                footnote.classList.add("footnote-100-999");
            }

            // save footnoteSpan html separately as attribute to preserve anchors:
            let foonoteHTML;
            if(footnotes[i].firstElementChild !== null) {
                foonoteHTML = footnotes[i].firstElementChild.innerHTML;
                footnote.setAttribute("footnote-html", foonoteHTML.trim());
                // assign innerText to new defined footnote:
                footnote.innerText = footnotes[i].firstElementChild.innerText;
                // check footnote length based on innerText:
                checkMaxLengthOfInnerText(footnote, maxFootnoteLength);
            }
            footnotesCollection.push(footnote);
        }

        // reformat footnoteReferences:
        for (let i = 0; i < footnoteRefs.length; ++i) {
            footnoteRefs[i].innerHTML = "";
            footnoteRefs[i].append(footnotesCollection[i]);
        }
    }
}

/**
 * create endnotes section (for footnotes):
 * @param {DocumentFragment} content document-fragment made from original DOM
 * @returns {HTMLElement} endnotes container with fn-label, fn-text and fn-back-link
 */
function createEndnotesSection(content) {

    let lang = document.documentElement.lang;
    let endnotesSection = content.querySelector(".footnotes-section");
    if(endnotesSection !== null) {
        endnotesSection.id = "endnotes-section";
        endnotesSection.classList.add("meta-section");
        // add default section title:
        let endnotesTitle = document.createElement("h3")
        endnotesTitle.innerHTML = defaultTitles["endnotes"][lang];
        endnotesTitle.classList.add("main-section-title");
        endnotesSection.insertAdjacentElement("afterbegin", endnotesTitle);
        // remove given title
        if(endnotesSection.querySelector(".title") !== null) {
            endnotesSection.querySelector(".title").remove();
        }
        // add back-links to each endnote
        let endnotes = endnotesSection.querySelectorAll(".footnote");
        endnotes.forEach(note => {
            let backLinkToFnRef = document.createElement("a");
            backLinkToFnRef.classList.add("backLinkToFnRef");
            backLinkToFnRef.title = "Jump to paragraph";
            let targetFnRefSelector = ".fn-ref[href='#" + note.id + "']";
            let targetFnRef = content.querySelector(targetFnRefSelector);
            if(targetFnRef !== null) {
                backLinkToFnRef.href = "#" + targetFnRef.id;
                note.insertAdjacentElement("afterbegin", backLinkToFnRef);
            }
        });
  
    }
    return(endnotesSection)
}

/**
 * create referenceList:
 * @param {DocumentFragment} content document-fragment made from original DOM
 * @returns {HTMLElement} referenceList as meta-section with author-year-label,
 * reference titles and external ref-links
 */
function createReferenceList(content) {

    let referenceList = document.createElement("ul");
    let references = []; // no ref-list
    if(content.querySelectorAll(".reference") !== null) {
        if(content.querySelectorAll(".reference").length) {
            referenceList.id = "reference-list";
            referenceList.classList.add("meta-section");

            // add ref-list title
            let lang = document.documentElement.lang;
            let refListTitle = document.createElement("h3")
            refListTitle.innerHTML = defaultTitles["references"][lang];
            refListTitle.classList.add("main-section-title");
            referenceList.appendChild(refListTitle);

            // get and add reference elements:
            references = content.querySelectorAll(".reference");
            referenceList = addReferencesToReferenceList(referenceList, references);
        }
        else {
            referenceList.id = "reference-list-empty";
        }
    }
    return (referenceList);
}

/**
 * add references to reference list:
 * @param {DocumentFragment} referenceList as section with author-year-label,
 * reference titles and external ref-links
 * @param {NodeList} references: .reference elements w
 * @returns {HTMLElement} referenceList as meta-section with author-year-label,
 * reference titles and external ref-links
 */
function addReferencesToReferenceList(referenceList, references) {

    for (let i = 0; i < references.length; i++) {
        let label = references[i].querySelector(".label");
        let mixedCitation = references[i].querySelector(".mixed-citation");
        
        // handle ext-ref-links and urlify plain url strings:
        if(references[i].querySelector(".ext-ref") !== null
        && mixedCitation !== null) {
            // rebuild ext-refs as single anchor:
            let extRef = references[i].querySelector(".ext-ref")
            let extRefLink = document.createElement("a");
            extRefLink.classList.add("ext-ref");
            extRefLink.target = "_blank";
            extRefLink.href = extRef.href;

            // clone specific use attribute:
            if(extRef.getAttribute("data-specific-use")) {
                let specificUse = extRef.getAttribute("data-specific-use");
                extRefLink.setAttribute("data-specific-use", specificUse);
                // display zenon-links in parenthesis-notation:
                if(specificUse === "zenon") { 
                    extRefLink.innerHTML = "[Zenon &#9741]";
                };
                if(specificUse === "weblink") { 
                    extRefLink.innerHTML = "" + extRef.href + "";
                };
            }
            // extract reference text from ext-ref-element
            mixedCitation.innerHTML = URLifyString(mixedCitation.textContent);
            mixedCitation.append(extRefLink);
        }
        else if(mixedCitation !== null) {
            mixedCitation.innerHTML = URLifyString(mixedCitation.innerText);
        }
        else {
            mixedCitation = document.createElement("p");
            mixedCitation.classList.add("mixed-citation");
            mixedCitation = references[i].innerHTML;
        }

        // check for label
        if(label === null) {
            label = document.createElement("span");
            label = "no-label";
        } 
    
        // append:
        references[i].innerHTML = "";
        references[i].append(label);
        references[i].append(mixedCitation);
        referenceList.append(references[i]);
    }

    return(referenceList);
}

/**
 * recreate figureSection as clone from content:
 * @param {DocumentFragment} content document-fragment made from original DOM
 * @returns {HTMLElement} cloned figureSection, validated, enhanced, classified,
 * reordered. Will be reused for parts of sourceOfIllustration
 */
function recreateFiguresSection(content) {

    // check and clone original figure section:
    let figureSection;
    let figures;
    if(content.querySelector(".figure-section") !== null) {
        figureSection = content.querySelector(".figure-section").cloneNode(true);
        figureSection.id = "cloned-images-container";
        figures = figureSection.querySelectorAll("figure:not(#poster-image,#journal-logo)");
    } 
    else {
        figureSection = document.createElement("div");
        return(figureSection);
    }

    // process each figure element:
    let figure;
    let img;
    let attribution;
    let licensePara;
    let licenseUrl;
    let label;
    for (let i = 0; i < figures.length; ++i) {
        figure = figures[i];
        img = figure.querySelector("img");

        if(figure.querySelector(".attribution") !== null) {
            attribution = figure.querySelector(".attribution");
        } else {
            attribution = document.createElement("p");
            attribution.classList.add("attribution");
            attribution.classList.add("warning-text");
            attribution.textContent = "[CREDIT ATTRIBUTION MISSING]";
        }
        if(figure.querySelector(".license-p") !== null) {
            licensePara = figure.querySelector(".license-p");
        }
        else {
            licensePara  = document.createElement("p");
            licensePara .classList.add("license-p");
        }
        if(figure.querySelector(".license-url") !== null) {
            licenseUrl = figure.querySelector(".license-url");
        } else {
            licenseUrl = document.createElement("p");
            licenseUrl.classList.add("license-p");
        }
        if(figure.querySelector(".label") !== null) {
            label = figure.querySelector(".label");
        } else {
            label = document.createElement("span");
            label.textContent = "[LABEL MISSING]";
        }
        label.classList.add("img-label");

        // clone label for separate fig-number:
        let figNumber = label.cloneNode(true);
        figNumber.classList.remove("img-label");
        figNumber.classList.add("fig-number");
        let counter = figNumber.textContent.slice(5);
        figNumber.innerHTML = counter;

        // add ": " for label within figCaption:
        label.textContent = label.textContent + ": ";

        // check length of figCaption text:
        let figCaption;
        let figCaptionText;
        if(figure.querySelector("figCaption") !== null) {
            figCaption = figure.querySelector("figCaption");
        }
        else {
            figCaption = document.createElement("figCaption");
            figCaptionText = document.createElement("p");
            figCaption.textContent = "[CAPTION MISSING]";
            figCaption.appendChild(figCaptionText);
        }
        checkMaxLengthOfInnerText(figCaption.firstElementChild, maxCaptionLength);
       
        // reorder label and figCaption:
        figCaption.firstElementChild.classList.add("caption-text");
        figCaption.firstElementChild.insertAdjacentElement("afterbegin", label);
     
        // reappend figure elements:
        figures[i].innerHTML = "";
        figures[i].append(img);
        figures[i].append(figNumber);
        figures[i].append(figCaption);
        figures[i].append(attribution);
        figures[i].append(licensePara);
        figures[i].append(licenseUrl);
        figureSection.append(figures[i]);
    }
    return(figureSection);
}

/**
 * create source of illustrations or rather credits section:
 * @param {Element} figureSection figureSection cloned from content
 * @returns {HTMLElement} sourceOfIllustrations used as meta-section with credith
 * information for each figure
 */
function createSourceOfIllustrations(figureSection) {

    // prepare section elements:
    let sourceOfIllustrations = document.createElement("div");
    sourceOfIllustrations.id = "source-of-illustrations";
    sourceOfIllustrations.classList.add("meta-section");

    if(figureSection) {
        // (re)create title for source of illustrations:
        let lang = document.documentElement.lang;
        let sourceOfIllustrationsTitle = document.createElement("h3");
        sourceOfIllustrationsTitle.classList.add("main-section-title");
        sourceOfIllustrationsTitle.innerHTML = defaultTitles["sourceOfIllustrations"][lang];
        sourceOfIllustrations.appendChild(sourceOfIllustrationsTitle);

       // append credits for each figure
       let figures = figureSection.querySelectorAll("figure:not(#poster-image,#journal-logo)");
       for (let i = 0; i < figures.length; ++i) {
            let credits = document.createElement("div");
            credits.classList.add("credits");

            let label = figures[i].querySelector(".img-label");
            let labelCloned = label.cloneNode(true);
            let attribution = figures[i].querySelector(".attribution");
            credits.insertAdjacentElement("afterbegin", labelCloned);
           
            // build and add license statements with url
            if(figures[i].querySelector(".license-p") !== null 
            && figures[i].querySelector(".license-url") !== null) {
                let licensePara = figures[i].querySelector(".license-p");
                let licenseUrl = figures[i].querySelector(".license-url");
                licenseUrl.textContent = licensePara.textContent;
                attribution.append(licenseUrl);
                licensePara.remove();
            } 
            credits.appendChild(attribution);
            sourceOfIllustrations.appendChild(credits);
       }
    }
    return (sourceOfIllustrations);
}

/**
 * create contributors details for all participants (article and journal)
 * @param {DocumentFragment} content document-fragment made from original DOM
 * @param {boolean} isArticle if true, contributors data will be taken from 
   <article-meta> and display as contributors of article or rather authorDetails
 * @returns {HTMLElement} contributorsDetails
 */
function createContributorsDetails(content, isArticle) {

    let contributorsDetails = document.createElement("div");
    contributorsDetails.id = "contributors-section";

    let authors;
    let contributors;
    let editors;
    let coEditors;
    let advisoryBoardMember;
    if(isArticle) {
        // define title of authorDetails
        let contributorsDetailsTitle = document.createElement("h3");
        contributorsDetailsTitle.classList.add("title-appendix");
        let lang = document.documentElement.lang;
        contributorsDetailsTitle.innerHTML = defaultTitles["authorDetails"][lang];
        contributorsDetails.appendChild(contributorsDetailsTitle);

        // get article authors and contributors
        authors = content.querySelectorAll(".contrib[contrib-type='author']");
        contributors = content.querySelectorAll(".contrib[contrib-type='co-author']");
    }
    else {
        // get journals editors, co-editors and advisory board member
        editors = content.querySelectorAll(".contrib[contrib-type='Editor']");
        coEditors = content.querySelectorAll(".contrib[contrib-type='Co-Editor']");
        advisoryBoardMember = content.querySelectorAll(".contrib[contrib-type='Advisory Board Member']");
    }

    // add main-authors:
    if(authors && authors.length) {
        for (let i = 0; i < authors.length; i++) {
            let contributorsCard = createContributorsCard(authors[i]);
            contributorsDetails.appendChild(contributorsCard);
        }
    }
    // add contributors:
    if(contributors && contributors.length) {
        for (let i = 0; i < contributors.length; i++) {
            let contributorsCard = createContributorsCard(contributors[i]);
            contributorsDetails.appendChild(contributorsCard);
        }
    }
    // add editors:
    if(editors && editors.length) {
        // add role title:
        let contribGroup = editors[0].parentElement;
        let role = contribGroup.querySelector(".role");
        role.classList.add("meta-details-title");
        contributorsDetails.appendChild(role);
        for (let i = 0; i < editors.length; i++) {
            let contributorsCard = createContributorsCard(editors[i]);
            contributorsDetails.appendChild(contributorsCard);
        }
    }
    // add co-editors:
    if(coEditors && coEditors.length) {
        // add role title:
        let contribGroup = coEditors[0].parentElement;
        let role = contribGroup.querySelector(".role");
        role.classList.add("meta-details-title");
        contributorsDetails.appendChild(role);
        for (let i = 0; i < coEditors.length; i++) {
            let contributorsCard = createContributorsCard(coEditors[i]);
            contributorsDetails.appendChild(contributorsCard);
        }
    }
     // add co-editors:
     if(advisoryBoardMember && advisoryBoardMember.length) {
        // add role title:
        let contribGroup = advisoryBoardMember[0].parentElement;
        let role = contribGroup.querySelector(".role");
        role.classList.add("meta-details-title");
        contributorsDetails.appendChild(role);
        for (let i = 0; i < advisoryBoardMember.length; i++) {
            let contributorsCard = createContributorsCard(advisoryBoardMember[i]);
            contributorsDetails.appendChild(contributorsCard);
        }
    }
    return(contributorsDetails);
}

/**
 * create contributors card for each participant (e.g author)
 * @param {HTMLElement} contributor given data for each contributor
 * @returns {HTMLElement} contributorsCard, common information of each author
   including contributors-ids, institution affiliation and contact email
 */
function createContributorsCard(contributor) {

    // prepare section elements:
    let contributorsCard = document.createElement("div");
    contributorsCard.classList.add("contributors-card");

    // prepae sub-elements of contributors card:
    let name = document.createElement("p");
    let institution = document.createElement("p");
    let contribIdLink = document.createElement("a");
    let institutionIdLink = document.createElement("a");

    // prefer string-name first, e.g. Dr. Werner Heisenberg
    let preferredFullName = "";
    if(contributor.querySelector(".string-name") !== null) {
        preferredFullName = contributor.querySelector(".string-name").textContent;
    }
    // parse and reorder names and contrib-ids (e.g. orcid):
    else if(contributor.querySelector(".given-names") !== null 
    && contributor.querySelector(".surname") !== null){
        // get prefix:
        let prefix;
        if(contributor.querySelector(".prefix") !== null) {
            prefix = contributor.querySelector(".prefix").textContent;
            preferredFullName = prefix;
        }
        // get surname and given-names
        let givenName = contributor.querySelector(".given-names").textContent;
        let surName = contributor.querySelector(".surname").textContent;
        preferredFullName = preferredFullName + " " + givenName + " " + surName;
       
        // get suffix:
        let suffix;
        if(contributor.querySelector(".suffix") !== null) {
            suffix = contributor.querySelector(".suffix").textContent;
            preferredFullName = preferredFullName + ", " + suffix;
        }
    }
    // fallback:
    else {
        preferredFullName = "[Prefix] [Given-Names] [Surname] [Suffix]";
    }  

    // wrap preferredFullName into anchor with orcid-link:
    if(contributor.querySelector(".contrib-id") !== null) {
        contribIdLink.classList.add("contributor-link");
        contribIdLink.target = "_blank";
        contribIdLink.href = contributor.querySelector(".contrib-id").textContent;
        contribIdLink.innerHTML = preferredFullName
        name.append(contribIdLink);
    } 
    // display full name only:
    else { 
        name.innerHTML = preferredFullName;
    }
    contributorsCard.append(name);

     // parse and reorder affiliation information: 
    if(contributor.querySelector(".institution") !== null) {
        if(contributor.querySelector(".institution-id") !== null) {
            let institutionId = contributor.querySelector(".institution-id").textContent;
            institutionIdLink.classList.add("institution-link");
            institutionIdLink.target = "_blank";
            institutionIdLink.href = institutionId
            institutionIdLink.innerHTML = contributor.querySelector(".institution").textContent;
            institution.append(institutionIdLink);
        } else { institution.innerHTML = contributor.querySelector(".institution").textContent;}
        contributorsCard.append(institution);
    };

    // parse and append email information:
    if(contributor.querySelector(".email") !== null) {
        const email = contributor.querySelector(".email");
        contributorsCard.append(email);
    }
    return(contributorsCard);
}

/**
 * create article meta-section in form of external doi-reference
 * @param {DocumentFragment} content document-fragment made from original DOM
 * @returns {HTMLElement} articleMetaSection with doi as link
 */
function createArticleMetaSection(content) {

    // prepare section elements:
    let articleMetaSection = document.createElement("div");
    articleMetaSection.id = "metadata";
    articleMetaSection.classList.add("metadata-section");
    let articleMetaSectionTitle = document.createElement("h3");
    articleMetaSectionTitle.classList.add("title-appendix");
    let lang = document.documentElement.lang;
    articleMetaSectionTitle.innerHTML = defaultTitles["metadata"][lang];
    articleMetaSection.appendChild(articleMetaSectionTitle);

    // add basic article meta:
    let articleMeta = content.querySelector(".article-meta");
    if(articleMeta !== null) {
        if(articleMeta.querySelector(".article-id[pub-id-type='doi']") !== null) {
            // create anchor-element for doi-url:
            let articleId = articleMeta.querySelector(".article-id[pub-id-type='doi']");
            let doiAnchor = document.createElement("a");
            doiAnchor.classList.add("doi-url");
            doiAnchor.textContent = articleId.textContent;
            doiAnchor.href = articleId.textContent;
            articleId.innerHTML = "";
            articleId.appendChild(doiAnchor);
            // append articleId with doi-url-anchor:
            articleMetaSection.appendChild(articleId);
        }
        if(articleMeta.querySelector(".article-title") !== null) {
            articleMetaSection.appendChild(
                articleMeta.querySelector(".article-title"));
        } 
        if(articleMeta.querySelector(".article-subtitle") !== null) {
            articleMetaSection.appendChild(
                articleMeta.querySelector(".article-subtitle"));
        } 
        if(articleMeta.querySelector(".volume") !== null) {
            articleMetaSection.appendChild
            (articleMeta.querySelector(".volume"));
        }
        if(articleMeta.querySelector(".date") !== null) {
            let date = articleMeta.querySelector(".date");
            if(date.getAttribute("iso-8601-date") !== null) {
               date.textContent = date.getAttribute("iso-8601-date");
            }
            articleMetaSection.appendChild(date);
        }
        if(articleMeta.querySelector(".citation-guideline") !== null) {
            articleMetaSection.appendChild
            (articleMeta.querySelector(".citation-guideline"));
        }
        if(articleMeta.querySelector(".copyright-statement:not([content-type='print'])")) {
            articleMetaSection.appendChild(articleMeta.querySelector(".copyright-statement:not([content-type='print'])"));
        }
        if(articleMeta.querySelector(".license:not([license-type='print'])")) {
            if(articleMeta.querySelector(".license-ref") !== null) {
                let licenseRef = articleMeta.querySelector(".license-ref");
                licenseRef.href = licenseRef.textContent;
                licenseRef.target = "_blank";
            }
            articleMetaSection.appendChild(articleMeta.querySelector(".license:not([license-type='print'])"));
        }
        if(articleMeta.querySelectorAll(".license-p").length > 0) {
            articleMeta.querySelectorAll(".license-p").forEach(element => {
                articleMetaSection.appendChild(element);
            });
        }
    }

    // create customMetaSection:
    let customMetaSection = createCustomMetaSection(articleMeta);
    articleMetaSection.appendChild(customMetaSection);
    
    return (articleMetaSection);
}

/**
 * create customMeta section for custom metadata properties filtered
 * @param {DocumentFragment} articleMeta article-meta from xml-front
 * @returns {HTMLElement} customMetaSection
 */
function createCustomMetaSection(articleMeta) {
    
    let customMetaSection = document.createElement("div");
    customMetaSection.classList.add("custom-meta-section");
    
    let customMetas;
    if(articleMeta.querySelector(".custom-meta-group") !== null) {
        customMetas = articleMeta.querySelectorAll(".custom-meta");
        for (let i = 0; i < customMetas.length; i++) {
            let customMeta = customMetas[i];
            if(/label/.test(customMeta.className)) {customMeta.style.display = "none";}
            if(/url/.test(customMeta.className)) {customMeta.style.display = "none";}
            if(/title-department/.test(customMeta.className)) {customMeta.style.display = "none";}
            if(/title-topic-location/.test(customMeta.className)) {customMeta.style.display = "none";}
            if(/cooperations/.test(customMeta.className)) {customMeta.style.display = "none";}
            if(/funding/.test(customMeta.className)) {customMeta.style.display = "none";}
            if(/project-lead/.test(customMeta.className)) {customMeta.style.display = "none";}
            if(/team/.test(customMeta.className)) {customMeta.style.display = "none";}
            customMetaSection.appendChild(customMeta);
        }
    }
    return(customMetaSection);     
}


/**
 * create imprint section to display journal related metadata
 * @param {DocumentFragment} content document-fragment made from original DOM
 * @returns {HTMLElement} imprint section enhanced with certain journal 
   information (publisher, editors, contributors and other credits)
 */
function createImprintSection(content) {

    let journalMeta = content.querySelector(".journal-meta");

    // prepare imprint elements:
    let imprintSection = document.createElement("div");
    imprintSection.id = "imprint";
    imprintSection.classList.add("metadata-section");
    let imprintSectionTitle = document.createElement("h3");
    imprintSectionTitle.classList.add("title-appendix");
    let lang = document.documentElement.lang;
    imprintSectionTitle.innerHTML = defaultTitles["imprint"][lang];
    imprintSection.appendChild(imprintSectionTitle);

    // collect journal information:
    let journalTitle;
    let journalDOI;
    let publisher;

    // journal title
    if(journalMeta.querySelector(".journal-title") !== null) {
        journalTitle = journalMeta.querySelector(".journal-title");
        journalTitle.innerHTML = journalTitle.innerText;
        // add journal DOI:
        let journalDOILink
        if(journalMeta.querySelector(".journal-id[journal-id-type='doi']") !== null) {
            journalDOI = journalMeta.querySelector(".journal-id[journal-id-type='doi']");
            journalDOILink = document.createElement("a");
            journalDOILink.id = "journal-doi-link";
            journalDOILink.href = journalDOI.innerText;
            journalDOILink.textContent = journalDOI.innerText;
            journalTitle.appendChild(journalDOILink);
        }
        imprintSection.appendChild(journalTitle);
    }

    // ISSN:
    if(journalMeta.querySelector(".issn") !== null) {
        let role = document.createElement("p");
        role.classList.add("role");
        role.textContent = "ISSN:";
        imprintSection.appendChild(role);
        imprintSection.appendChild(journalMeta.querySelector(".issn"));
    }

    // publisher:
    if(journalMeta.querySelector(".publisher") !== null) {
        let role = document.createElement("p");
        role.classList.add("role");
        role.textContent = "Publisher:";
        publisher = journalMeta.querySelector(".publisher");
        imprintSection.appendChild(role);
        imprintSection.appendChild(publisher);
    }

    let journalContributorsDetails = createContributorsDetails(content, false);
    journalContributorsDetails.classList.add("journal-contributors");
    imprintSection.appendChild(journalContributorsDetails);
    
    // parse customMetaGroup:
    let customMetas;
    let customMetaSection = document.createElement("div");
    customMetaSection.classList.add("custom-meta-section")
    if(journalMeta.querySelector(".custom-meta-group") !== null) {
        customMetas = journalMeta.querySelectorAll(".custom-meta");
        for (let i = 0; i < customMetas.length; i++) {
            let metaName = customMetas[i].querySelector(".meta-name");
            if(/label/.test(metaName.textContent)) {
                customMetas[i].style.display = "none";
            }
            if(/url/.test(metaName.textContent)) {
                customMetas[i].style.display = "none";
            }
            if(/publishing-history/.test(metaName.textContent)) {
                customMetas[i].style.display = "none";
            }
            customMetaSection.appendChild(customMetas[i]);
        }
        imprintSection.appendChild(customMetaSection);
    }

    // add system / format notice:
    let notice = document.createElement("p");
    notice.classList.add("system-notice");
    notice.innerHTML = systemNotice["pdf"];
    imprintSection.appendChild(notice);

    return (imprintSection);
}

// Figure and text-content maps
// ----------------------------
/**
 * create text-content map
 * @param {HTMLElement} parsedContent content once parsed and given ids (data-ref and break rules from the css)
 * @param {JSON} previousMap previous map saved in local storage, e.g. with given style properties 
 * @returns {void} textContentMap (with figRefs, position and other params) will be saved in local storage
 */
function createTextContentMap(parsedContent, previousMap) {

    // presets:
    let textContentMap = {};
    let allFigRefs = [];
    let hasSectionId = [];
    let numFigRefsSection = 0;
    let numTextElementsSection = 0;

    // set hash for current html document:
    let documentId = parsedContent.querySelector("article").id;
    textContentMap["documentId"] = documentId;

    // get html-wrapper
    let htmlWrapper = parsedContent.querySelector("#html-wrapper");

    // elements defined as text-elements:
    let textElementsSelector = "p[id],li,table,pre,.boxed-text,.title";

    // select text elements:
    if(htmlWrapper.querySelectorAll(textElementsSelector) !== null) {
        let textElements = htmlWrapper.querySelectorAll(textElementsSelector);        
        // process each text element
        for (let i = 0; i < textElements.length; i++) {
             // add text-content class to text element
            let element = textElements[i];
            element.classList.add("text-content");

            // parse references for each text element:
            let references = element.querySelectorAll("a.fig-ref");
            let figRefs = [];
            if (references) {
                for (let index = 0; index < references.length; index++) {
                    let specificUse = references[index].getAttribute("data-specific-use");
                    // get figure ids from href/hash:
                    let reference = references[index].hash.slice(1); // e.g. "f-1"
                    // avoid duplicates:
                    if (!allFigRefs.includes(reference)
                    // no fig-refs excluded from typeset
                    && specificUse !== "ref-only") {  
                        figRefs.push(reference);
                        allFigRefs.push(reference);
                    }
                }
            }
            // count amout of figures and text elements within section
            let parent = element.parentElement;
            if (parent && parent.tagName === "SECTION") {
                if (hasSectionId.includes(parent.id)) {
                    // same section
                    numFigRefsSection = numFigRefsSection + figRefs.length;
                    numTextElementsSection = numTextElementsSection + 1;
                }
                else {
                    // new section
                    hasSectionId.push(parent.id);
                    numFigRefsSection = figRefs.length;
                    numTextElementsSection = 1;
                }
            }

            // mark position of text-elements within section and at all
            let isLastOfAll = false;
            let isFirstOfSection = false;
            let isLastOfSection = false;
            if(parent.firstElementChild === element) {
                isFirstOfSection = true;
                element.classList.add("first-of-section");
            }
            if(parent.lastElementChild === element) {
                isLastOfSection = true;
                element.classList.add("last-of-section");
            }
            if(i + 1 === textElements.length) {
                isLastOfAll = true;
                element.classList.add("last-of-all");
                element.style = "break-after:page;"
            }

            // assign values for each text element:
            let values = {
                "position": i,
                "id": element.id,
                "tagName": element.tagName,
                "figRefs": figRefs,
                "isSet": false,
                "style": (previousMap[element.id] !== undefined) ? previousMap[element.id]["style"] : false,
                "class": (previousMap[element.id] !== undefined) ? previousMap[element.id]["class"] : false,
                "isFirstOfSection": isFirstOfSection,
                "isLastOfSection": isLastOfSection,
                "isLastOfAll": isLastOfAll,
                "numFigRefsSection": numFigRefsSection,
                "numTextElementsSection": numTextElementsSection,
                "ignoreFigRefPass":  (previousMap[element.id] !== undefined) ? previousMap[element.id]["ignoreFigRefPass"] : false,
            };
            textContentMap[element.id] = values;
        }
    }
    // save entire map in local storage:
    writeJsonStorage(STORAGE_KEYS.TEXT_CONTENT_MAP, textContentMap);
}

/**
 * update text-content map
 * @param {string} currentNodeId id of regular text-content-nodes (e.g. paragraphs) 
 * @param {string} property property-key of textContentMap
 * @param {string} value property-value of textContentMap
 * @returns {void} changes are saved in localStorage
 */
function updateTextContentMap(currentNodeId, property, value) {

    // get current textContentMap:
    let textContentMap = readJsonStorage(STORAGE_KEYS.TEXT_CONTENT_MAP, {});
    if (textContentMap[currentNodeId]) {
        // change given property value
        if(property !== undefined) {
            textContentMap[currentNodeId][property] = value;
        }
    }
    // save updated figure map:
    writeJsonStorage(STORAGE_KEYS.TEXT_CONTENT_MAP, textContentMap);
}

/**
 * create figure map
 * @param {HTMLElement} parsedContent content once parsed and given ids
 * (data-ref and break rules from the css)
 * @param {JSON} previousMap previous map saved in local storage, e.g. with given style properties 
 * @returns {void} figureMap (with position, states, styles and typesettingClasses) will be saved in local storage
 */
function createFigureMap(parsedContent, previousMap) {

    let figureMap = {};

    // set hash for current html document:
    let documentId = parsedContent.querySelector("article").id;
    figureMap["documentId"] = documentId;

    // create map of regular paragraphs:
    let figures = parsedContent.querySelectorAll("figure:not(#poster-image,#journal-logo)");
    for (let i = 0; i < figures.length; i++) {
        let figure = figures[i];
        let figCaption = figure.querySelector(".caption-text");
        let values = {
            "position": i,
            "id": figure.id,
            "inserted": false,
            "style": (previousMap[figure.id] !== undefined) ? previousMap[figure.id]["style"] : false,
            "typesettingClass": (previousMap[figure.id] !== undefined) ? previousMap[figure.id]["typesettingClass"] : false,
            "positionClass": (previousMap[figure.id] !== undefined) ? previousMap[figure.id]["positionClass"] : false,
            "figCaptionText": (figCaption !== null) ? figCaption.innerText : ""
        };
        figureMap[figure.id] = values;
    }
    // save entire map in local storage:
    writeJsonStorage(STORAGE_KEYS.FIGURE_MAP, figureMap);
}

/**
 * update figure map
 * @param {string} figureId id of figure element
 * @returns {void} changes are saved in localStorage
 */
function updateFigureMap(figureId) {

    // get current figureMap:
    let figureMap = readJsonStorage(STORAGE_KEYS.FIGURE_MAP, {});

    // reset "setLast"-state of previous figure:
    let setLastId = Object.keys(figureMap).find(
        key => figureMap[key]?.["setLast"] === true
    );
    if (setLastId) {
        figureMap[setLastId]["setLast"] = false;
    }
    // update states of current figure:
    if (!figureMap[figureId]) {
        reportDiagnostic("warning", "Figure is missing map state", { figureId });
        return;
    }
    figureMap[figureId]["inserted"] = true;
    figureMap[figureId]["setLast"] = true;

    // save updated figure map:
    writeJsonStorage(STORAGE_KEYS.FIGURE_MAP, figureMap);
}

// Figure references
// -----------------
/**
 * get next figure references in sourceNode
 * @param {string, number} nodeId id of sourceNode, right before rendering
 * @returns {array} nextFigRefs
 */
function getNextFigRefs(currentNodeId) {

    // get textContent and figure map:
    let textContentMap = readJsonStorage(STORAGE_KEYS.TEXT_CONTENT_MAP, {});
    let figureMap = readJsonStorage(STORAGE_KEYS.FIGURE_MAP, {});
    let currentNodePosition = textContentMap[currentNodeId]["position"];

    // find next figure references in all textElement within rangeNextFigRefs:
    let nextFigRefs = [];
    let nodeId;
    let textElement;
    let i = 1;  // starting point (currentNode)
    while (i <= rangeNextFigRefs) {
        nodeId = Object.keys(textContentMap)[currentNodePosition + i];
        textElement = textContentMap[nodeId];
        if(textElement && textElement.figRefs !== undefined && textElement.figRefs.length) {
            let figRef;   // check figRefs of each text element
            for (let i = 0; i < textElement.figRefs.length; ++i) {
                figRef = textElement.figRefs[i];
                // collect each figRef in nextFigRefs:
                if(figureMap[figRef] !== undefined) {
                    if (!figureMap[figRef]["inserted"]     // if figure not already inserted
                     && !nextFigRefs.includes(figRef)) {   // and not already included in array
                        nextFigRefs.push(figRef);
                    }
                }
            }
        }
        // if node is first of content section:
        if(textElement && !textContentMap[nodeId]["isFirstOfSection"]) {
            // ++i; // proceed (next paragraph)
            i = i + 1;
        }
        // if rangeOverSection is true (allowed):  
        else if(rangeOverSection) {
            // ++i; // proceed (next paragraph)
            i = i + 1;
        }
        // break up entire loop of figRef search:
        else {
            i = rangeNextFigRefs;
        }
    }
    return(nextFigRefs);
}

/**
 * sort nextFigRefs by figurePosition
 * @param {array} nextFigRefs array of figRefs
 * @returns {array} nextFigRefs: nextFigRefs sorted by figure position
 * to ensure keeping figure placement in numeric order (fig. 3 before fig. 4) 
 */
function sortNextFigRefsByFigurePosition(nextFigRefs) {

    if(nextFigRefs && nextFigRefs.length) {
        let figureMap = readJsonStorage(STORAGE_KEYS.FIGURE_MAP, {});
        // get figurePosition and collect in positionArray:
        let positionArray = [];
        for (let i = 0; i < nextFigRefs.length; i++) {
            let figRef = nextFigRefs[i];
            let figurePosition = figureMap[figRef]["position"];
            positionArray.push(figurePosition);
        }
        // sort positionArray numerically:
        positionArray.sort(function(a, b) {return a - b;});
        // re-map nextFigRefs by positionArray:
        nextFigRefs = [];
        for (let i = 0; i < positionArray.length; i++) {
            let figRef = Object.keys(figureMap).find(key => 
                figureMap[key]["position"] === positionArray[i]);
            nextFigRefs.push(figRef);
        }
    }
    return(nextFigRefs);
}

/**
 * push figure reference to next text-content node, used to skip typsetting figure, 
 * which not fits in current node contexts
 * @param {string, number} currentNodeId id of sourceNode to be rendered
 * @param {string} figureId, figure reference as element-id of figure
 * @returns {void} changes are saved in localStorage
 * 
 */
function pushFigRefToNextNode(currentNodeId, figureId) {

    if(currentNodeId !== undefined && figureId !== undefined) {
        // get textContentMap
        let textContentMap = readJsonStorage(STORAGE_KEYS.TEXT_CONTENT_MAP, {});

        // get nextNodeId by position of current node:
        let currentNodePosition = textContentMap[currentNodeId]["position"];
        let nextNodeId = Object.keys(textContentMap)
        .find(key => textContentMap[key]["position"] === currentNodePosition + 1);

        // push figRef to next node
        if (textContentMap[nextNodeId] !== undefined) {
            if(!textContentMap[nextNodeId]["figRefs"].includes(figureId)) {
                textContentMap[nextNodeId]["figRefs"].push(figureId);
            }
        }
        // save updated figure map:
        writeJsonStorage(STORAGE_KEYS.TEXT_CONTENT_MAP, textContentMap);
    }  
}

/**
 * get next figure element by figure reference
 * @param {string} nextFigRef is figure reference as element-id of figure
 * @param {HTMLElement} parsedContent content once parsed and given ids 
 * (data-ref and break rules from the css)
 * @returns {HTMLElement} figureElement
 * 
 */
function getNextFigureElement(nextFigRef, parsedContent) {

    let figureElement = false;
    if (nextFigRef) {
        figureElement = parsedContent.querySelector("figure#" + nextFigRef);
    }
    return(figureElement);
}

// Paged element layout
// --------------------
/**
 * define parameter of renderNode
 * @param {node} sourceNode original node from parsedContent currently rendered
 * @param {node} renderNode cloned node that is added to the DOM; if pagedJs splits
 * the sourceNode, renderNode is rendered on the next page
 * @param {HTMLElement} parsedContent content once parsed and given ids
 * (data-ref and break rules from the css)
 * @returns {JSON} nodeParams: parameter collection (e.g. pageContext-parameter,
 * target figure references, target figure Elements)
 * 
 */
function defineSourceNodeParameter(sourceNode, renderNode, parsedContent) {

    // get text content map:
    let textContentMap = readJsonStorage(STORAGE_KEYS.TEXT_CONTENT_MAP, {});

    // define figure density of section (relation between figures to text-content):
    let figureDensity = defineFigureDensityOfSection(sourceNode);

    // define page contexts and distances of source node:
    let contexts = definePageContextsOfSourceNode(sourceNode, renderNode);
    contexts = calculateNodeDistances(contexts, sourceNode);

    // save stats of pageContexts as element attribute:
    setPageContextsAsElementAttribute(contexts, sourceNode, renderNode);

    // get next figRefs and sort nextFigRefs:
    let nextFigRefs = getNextFigRefs(sourceNode.id);
    nextFigRefs = sortNextFigRefsByFigurePosition(nextFigRefs);

    // get next two figure elements by nextFigRefs:
    let currentFigure = getNextFigureElement(nextFigRefs[0], parsedContent);
    let nextFigure = getNextFigureElement(nextFigRefs[1], parsedContent);

    // collect nodeParams:
    let nodeParams = {
        "sourceNode": sourceNode,
        "renderNode": renderNode,
        "isLastOfSection": textContentMap[sourceNode.id]["isLastOfSection"],
        "isLastOfAll": textContentMap[sourceNode.id]["isLastOfAll"],
        "figureDensity": figureDensity,
        "figRefs": nextFigRefs,
        "numFigRefs": nextFigRefs.length,
        "contexts": contexts,
        "currentFigure": currentFigure,
        "nextFigure": nextFigure,
        "parsedContent": parsedContent,
        "ignoreFigRefPass": textContentMap[sourceNode.id]["ignoreFigRefPass"]
    };
    return(nodeParams);
}

/**
 * define figure density of section
 * @param {node} sourceNode original node from parsedContent currently rendered
 * @returns {number} figureDensity: decimal number decribing the ratio between amount of figures,
 * referenced in all textElements of each section, in relation to the amout of these textElements 
 */
function defineFigureDensityOfSection(sourceNode) {

    let figureDensity;
    let textContentMap = readJsonStorage(STORAGE_KEYS.TEXT_CONTENT_MAP, {});
 
    if(textContentMap[sourceNode.id]) {
        let textElement = textContentMap[sourceNode.id];
        let numTextElements = textElement["numTextElementsSection"];
        let numFigRefs = textElement["numFigRefsSection"];
        if(numTextElements !== 0) {
            figureDensity = numFigRefs / numTextElements;
        } else {
            figureDensity = 0;
        }
    }
    return(figureDensity);
}

/**
 * define page contexts of sourceNode
 * @param {node} sourceNode original node from parsedContent currently rendered
 * @returns {JSON} pageContexts: parameter collection (e.g. pageId, elementSetBefore,
 * precalculated distances)
 * 
 */
function definePageContextsOfSourceNode(sourceNode, renderNode) {

    // get pageContent, pageElement and pageId of sourceNode:
    let pageContent = sourceNode.closest(".pagedjs_page_content");
    let pageElement = pageContent.closest(".pagedjs_page");
    let pageId = (pageElement !== null) ? pageElement.id : false;
    let pageNumber;
    if(pageElement !== null) {
        pageNumber = parseInt(pageElement.getAttribute("data-page-number"));
    } else {pageNumber = false};
    
    // calculate measurements of element in DOM-Client Rectangle:
    let pageContexts = calculateClientMeasurementsOfElement(sourceNode);

    // get element set before on page:
    let elementsOfPage = pageContent.querySelectorAll(".text-content,figure");
    let index = Array.prototype.indexOf.call(elementsOfPage, sourceNode);
    let elementSetBefore = (index >= 1) ? elementsOfPage[index-1] : false;
    let elementSetBeforeTagName = (elementSetBefore) ? elementSetBefore.tagName : false;

    // check if page has figure and reached maximum amount of figures:
    let figureStatsPage = pageHasFigures(pageContent);
    
    // save as values in pageContexts object:
    pageContexts["pageId"] = pageId;
    pageContexts["pageNumber"] = pageNumber;
    pageContexts["pageContent"] = pageContent;
    pageContexts["elementSetBefore"] = elementSetBefore;
    pageContexts["elementSetBeforeTagName"] = elementSetBeforeTagName;
    pageContexts["pageHasFigure"] =  figureStatsPage["pageHasFigure"];
    pageContexts["isPageFigureMax"] = figureStatsPage["isPageFigureMax"];
    pageContexts["pageHasFloats"] = figureStatsPage["pageHasFloats"];
    pageContexts["renderNode"] =  {};
    pageContexts["renderNodeElement"] = renderNode;
    return pageContexts;
} 

function calculateClientMeasurementsOfElement(element) {

    // get pageContent, pageElement and pageId of sourceNode:
    let pageContent = element.closest(".pagedjs_page_content");
    let pageElement = pageContent.closest(".pagedjs_page");

    // get bounding client rectangles of pageContent:
    let pageContentTop = Math.round(pageContent.getBoundingClientRect().top);
    let pageContentHeight = pageContent.offsetHeight;
    let pageContentWidth = pageContent.offsetWidth;
    
    // get height of footnoteArea:
    let footnoteArea = pageElement.querySelector(".pagedjs_footnote_area");
    let footnoteAreaHeight = footnoteArea.getBoundingClientRect().height;
    footnoteAreaHeight = Math.round(footnoteAreaHeight);

    // get bounding client rectangle of nodes:
    let nodeTop = Math.round(element.getBoundingClientRect().top);
    let nodeBottom = Math.round(element.getBoundingClientRect().bottom);
    let nodeMarginTop = parseInt(getComputedStyle(element).marginTop);
    let nodeMarginBottom = parseInt(getComputedStyle(element).marginBottom);
    
    // pre-calculate distances of node to top of page:
    let distanceFromNodeTop = Math.round(nodeTop - pageContentTop + nodeMarginTop);
    let elementBoxHeight = element.clientHeight + nodeMarginTop + nodeMarginBottom;
    let distanceFromNodeBottom = Math.round(distanceFromNodeTop + elementBoxHeight - nodeMarginTop);
    let nodeBottomBeforeSplit = Math.round(nodeBottom - pageContentTop + nodeMarginBottom); 

    // get maxPageContentHeight (in px) from root-styles:
    let documentRoot = document.querySelector(':root');
    let maxPageContentHeight = getComputedStyle(documentRoot).getPropertyValue("--max-page-content-height");
    if(maxPageContentHeight !== "") {maxPageContentHeight = parseInt(maxPageContentHeight);} 
    else { maxPageContentHeight = 970;}
 
    // define values of pageContexts objecs:
    let pageContexts = {
        "maxPageContentHeight": maxPageContentHeight,
        "pageContentHeight": pageContentHeight,
        "pageContentWidth": pageContentWidth,
        "pageContentTop": pageContentTop,
        "footnoteAreaHeight": footnoteAreaHeight,
        "nodeTop": nodeTop,
        "nodeBottom": nodeBottom,
        "distanceFromNodeTop": distanceFromNodeTop,
        "distanceFromNodeBottom": distanceFromNodeBottom,
        "nodeBottomBeforeSplit": nodeBottomBeforeSplit,
        "nodeMarginTop": nodeMarginTop,
        "nodeMarginBottom": nodeMarginBottom,
    };
    return (pageContexts);
}

function pageHasFigures(pageContent) {

    let pageHasFigure;
    let isPageFigureMax;

    // check if there are figures on page:
    let pageFigures = pageContent.querySelectorAll("FIGURE");
    if(pageFigures.length > pageFigureMax-1) {
        pageHasFigure = true;
        isPageFigureMax = true;
    }
    else if(pageFigures.length) {
        pageHasFigure = true;
        isPageFigureMax = false;
    } else {
        pageHasFigure = false;
        isPageFigureMax = false;
    }
    // search for floating images:
    let pageHasFloats = false;
    pageFigures.forEach(figure => {
        if(/float/.test(figure.className)) {
            pageHasFloats = true;
        }
    });
    // skip in case of set all figures tiny command:
    if(setAllFiguresTiny) {
        pageHasFloats = false;
        isPageFigureMax = false;
    }
 
    let figureStatsPage = {
        "pageHasFigure": pageHasFigure,
        "isPageFigureMax": isPageFigureMax,
        "pageHasFloats": pageHasFloats
    }
    return (figureStatsPage);
}

/**
 * calculate critical distances of source nodes
 * @param {JSON} contexts parameter collection (e.g. pageId, elementSetBefore,
 * distances etc), predefined before as pageContexts
 * @param {node} sourceNode original node from parsedContent currently rendered
 * @returns {JSON} contexts: enhanced and updated parameterCollection with 
 * calculated distances (e.g. remainingSpace, nodeHeight)
 */
function calculateNodeDistances(contexts, sourceNode) {

    // define node types:
    let nodeTypes = defineNodeTypes(contexts, sourceNode);
    contexts["sourceNodeType"] = nodeTypes["sourceNodeType"];
    contexts["renderNodeType"] = nodeTypes["renderNodeType"];

    // calculate distances of figure nodes:
    if (nodeTypes["sourceNodeType"] === "figure" 
    || nodeTypes["sourceNodeType"] === "float") {
        contexts = calculateDistancesOfFigureNodes(contexts, sourceNode);
    }
    // calculate distances of renderNode laid out on next-page:
    if(nodeTypes["renderNodeType"] === "next-page-node") {
        contexts = calculateDistancesOfNextPageNode(contexts);
    }
    // modulate distances of split nodes, partly rendered on next page:
    if(nodeTypes["sourceNodeType"] === "split-node-parent") {
        contexts = calculateDistancesOfSplitNodes(contexts);
    }
    // modulate distances of text nodes affected by floating figures:
    if(nodeTypes["sourceNodeType"] === "floating-figure-before") {
        contexts = calculateDistancesOfNodesAroundFloats(contexts);
    }
    // calculate distances of regular nodes:
    if(nodeTypes["sourceNodeType"] === "regular-node") {
        contexts = calculateDistancesOfRegularNodes(contexts);
    }

    // return contexts object:
    return(contexts);
}

/**
 * define types of sourceNode and element set before
 * @param {JSON} contexts parameter collection (e.g. pageId, elementSetBefore,
 * distances etc), predefined before as pageContexts
 * @param {node} sourceNode original node from parsedContent currently rendered
 * @returns {Object} nodeTypes object
 */

function defineNodeTypes(contexts, sourceNode) {

    // define type of sourceNode:
    let sourceNodeType;
    switch (true) {
        case (/FIGURE/.test(sourceNode.tagName)):
            if (/float/.test(sourceNode.className)) {
                sourceNodeType = "float";
            } else sourceNodeType = "figure";
        break;
        case (contexts["nodeBottomBeforeSplit"] >= contexts["pageContentHeight"]):
            sourceNodeType = "split-node-parent";
            sourceNode.setAttribute("is-split-node", true);
            sourceNode.setAttribute("is-split-node-parent", true);
        break;
        case(contexts["elementSetBefore"] && 
            /float/.test(contexts["elementSetBefore"].className)):
            sourceNodeType = "floating-figure-before";
        break;
        case (/title-appendix/.test(sourceNode.className)):
            sourceNodeType = "title-appendix";
        break;
        default:
            sourceNodeType = "regular-node";
        break;
    }

    // define type of renderNode:
    let renderNode = contexts["renderNodeElement"];
    let renderNodeType;
    switch (true) {
        case (renderNode !== undefined && contexts["distanceFromNodeTop"]):
            renderNodeType = "split-node-child";
            renderNode.setAttribute("is-split-node", true);
            renderNode.setAttribute("is-split-node-child", true);
        break;
        case (renderNode !== undefined && !contexts["distanceFromNodeTop"]):
            renderNodeType = "next-page-node";
            renderNode.setAttribute("next-page-node", true);
        break;
        default:
            renderNodeType = sourceNodeType;
        break;
    }

    // return nodeTypes:
    return {
        "sourceNodeType": sourceNodeType,
        "renderNodeType": renderNodeType
    };
}

function calculateDistancesOfNextPageNode(contexts) {

    // get parameter from contexts object:
    let nodeMarginBottom = contexts["nodeMarginBottom"];
    let pageContentHeight = contexts["pageContentHeight"];
    let footnoteAreaHeight = contexts["footnoteAreaHeight"];

    // clone renderNode to exclude footnotes
    let clonedRenderNode = contexts["renderNodeElement"].cloneNode(true);
    clonedRenderNode.querySelectorAll(".fn-ref").forEach(fnRef => {
        fnRef.remove();
    });
    
    // redefine values based on clonedRenderNode:
    let calculatedHeight = calculateHeightOfNodeByTextWidth(clonedRenderNode, contexts);
    let nodeHeight = calculatedHeight + nodeMarginBottom;
    let remainingSpace = pageContentHeight - nodeHeight;

    // add sourceNode values to contexts object:
    contexts["distanceFromNodeTop"] = minDistanceFromNodeTop;
    contexts["distanceFromNodeBottom"] = nodeHeight;
    contexts["nodeHeight"] = nodeHeight;
    contexts["remainingSpace"] = Math.round(remainingSpace);
    contexts["footnoteAreaHeight"] = footnoteAreaHeight;

    // add renderNode values to contexts object:
    contexts["renderNode"]["distanceFromNodeTop"] = minDistanceFromNodeTop;
    contexts["renderNode"]["distanceFromNodeBottom"] = nodeHeight;
    contexts["renderNode"]["nodeHeight"] = nodeHeight;
    contexts["renderNode"]["remainingSpace"] = Math.round(remainingSpace);
    contexts["renderNode"]["footnoteAreaHeight"] = footnoteAreaHeight;

    return(contexts);
}

function calculateDistancesOfSplitNodes(contexts) {
            
    // get parameter from contexts object:
    let elementSetBefore = contexts["elementSetBefore"];
    let distanceFromNodeBottom = contexts["distanceFromNodeBottom"];
    let distanceFromNodeTop = contexts["distanceFromNodeTop"];
    let nodeMarginBottom = contexts["nodeMarginBottom"];
    let pageContentHeight = contexts["pageContentHeight"];
    let maxPageContentHeight = contexts["maxPageContentHeight"];
    let footnoteAreaHeight = contexts["footnoteAreaHeight"];

    // redefine attributes of sourceNode (split-parent):
    let fromNodeBottomBefore = elementSetBefore.getAttribute("fromNodeBottom");
    if(fromNodeBottomBefore === null) {
        let pageHeader = document.querySelector("#title-header");
        let pageHeaderContexts = definePageContextsOfSourceNode(pageHeader);
        pageHeaderContexts = calculateNodeDistances(pageHeaderContexts, pageHeader);
        distanceFromNodeTop = pageHeaderContexts["distanceFromNodeBottom"];
    } else {
        distanceFromNodeTop = parseFloat(fromNodeBottomBefore); 
    }
    distanceFromNodeBottom = pageContentHeight;
    let heightOfSplitParent = distanceFromNodeBottom - distanceFromNodeTop;
    let remainingSpace = pageContentHeight - distanceFromNodeBottom;

    // add sourceNode (split-parent) values to contexts object:
    contexts["distanceFromNodeTop"] = distanceFromNodeTop;
    contexts["distanceFromNodeBottom"] = distanceFromNodeBottom;
    contexts["nodeHeight"] = heightOfSplitParent;
    contexts["remainingSpace"] = Math.round(remainingSpace);
    contexts["footnoteAreaHeight"] = footnoteAreaHeight;

    // clone renderNode to exclude footnotes
    let clonedRenderNode = contexts["renderNodeElement"].cloneNode(true);
    clonedRenderNode.querySelectorAll(".fn-ref").forEach(fnRef => { fnRef.remove();});
    let calculatedHeight = calculateHeightOfNodeByTextWidth(clonedRenderNode, contexts);

    // redefine measurements of renderNode (split-child):
    let heightOfRenderNode = calculatedHeight + nodeMarginBottom - heightOfSplitParent;
    let fromNodeBottomRenderNode = heightOfRenderNode;
    let remainingSpaceRenderNode = maxPageContentHeight - heightOfRenderNode;

    // add renderNode values to contexts object:
    contexts["renderNode"]["distanceFromNodeTop"] = minDistanceFromNodeTop;
    contexts["renderNode"]["distanceFromNodeBottom"] = fromNodeBottomRenderNode;
    contexts["renderNode"]["nodeHeight"] = heightOfRenderNode + nodeMarginBottom;
    contexts["renderNode"]["remainingSpace"] = Math.round(remainingSpaceRenderNode);
    contexts["renderNode"]["footnoteAreaHeight"] = 1;

    return(contexts);
}

function calculateDistancesOfFigureNodes(contexts, sourceNode) {
            
    let distanceFromNodeBottom = contexts["distanceFromNodeBottom"];
    let distanceFromNodeTop = contexts["distanceFromNodeTop"];
    let pageContentHeight = contexts["pageContentHeight"];
    let pageContentWidth = contexts["pageContentWidth"];
 
    let clientSizes = calculateClientSizeOfFigure(sourceNode, pageContentWidth); 
    let figureHeight = Math.round(clientSizes["clientHeightCalculated"]);
    distanceFromNodeBottom = distanceFromNodeTop + figureHeight;
    let remainingSpace = pageContentHeight - distanceFromNodeBottom;

    contexts["distanceFromNodeTop"] = distanceFromNodeTop;
    contexts["distanceFromNodeBottom"] = distanceFromNodeBottom;
    contexts["nodeHeight"] = figureHeight;
    contexts["remainingSpace"] = Math.round(remainingSpace);

    return(contexts);
}

function calculateDistancesOfNodesAroundFloats(contexts) {

    // get distanceFromNodeTop from figure before:
    let distanceFromNodeTop = contexts["elementSetBefore"].getAttribute("fromnodetop");
    let distanceFromNodeBottom = contexts["distanceFromNodeBottom"];

    // calculate nodeHeight and remaining space:
    let pageContentHeight = contexts["pageContentHeight"];
    let nodeHeight = distanceFromNodeBottom - distanceFromNodeTop; 
    let remainingSpace = pageContentHeight - distanceFromNodeBottom;

    // update sourceNode values in contexts object:
    contexts["distanceFromNodeTop"] = distanceFromNodeTop;
    contexts["nodeHeight"] = nodeHeight;
    contexts["remainingSpace"] = Math.round(remainingSpace);

    // update renderNode values in contexts object:
    contexts["renderNode"]["distanceFromNodeTop"] = distanceFromNodeTop;
    contexts["renderNode"]["nodeHeight"] = nodeHeight;
    contexts["renderNode"]["remainingSpace"] = Math.round(remainingSpace);

    return(contexts);
}

function calculateDistancesOfRegularNodes(contexts) {

    let distanceFromNodeBottom = contexts["distanceFromNodeBottom"];
    let distanceFromNodeTop = contexts["distanceFromNodeTop"];
    let pageContentHeight = contexts["pageContentHeight"];
            
    // calculate nodeHeight and remaining space:
    let nodeHeight = distanceFromNodeBottom - distanceFromNodeTop; 
    let remainingSpace = pageContentHeight - distanceFromNodeBottom;

    // update sourceNode values in contexts object:
    contexts["distanceFromNodeTop"] = distanceFromNodeTop;
    contexts["distanceFromNodeBottom"] = distanceFromNodeBottom;
    contexts["nodeHeight"] = nodeHeight;
    contexts["remainingSpace"] = Math.round(remainingSpace);

    // update renderNode values in contexts object:
    contexts["renderNode"]["distanceFromNodeTop"] = distanceFromNodeTop;
    contexts["renderNode"]["distanceFromNodeBottom"] = distanceFromNodeBottom;
    contexts["renderNode"]["nodeHeight"] = nodeHeight;
    contexts["renderNode"]["remainingSpace"] = Math.round(remainingSpace);
    contexts["renderNode"]["footnoteAreaHeight"] = contexts["footnoteAreaHeight"];

    return(contexts);
}

function logCalculationsOfNodeDistances(pageElement) {
    
    let pageId = (pageElement !== null) ? pageElement.id : false;
    let pageContent = pageElement.querySelector(".pagedjs_page_content");
    let figureStatsPage = pageHasFigures(pageContent);
    let selector = ".text-content:not(.title-header-title,.title-header-subtitle,.title-header-authors),figure:not(#journal-logo)";
    let elementsOfPage = pageContent.querySelectorAll(selector);

    let elementIds = [];
    for (let i = 0; i < elementsOfPage.length; i++) {
        let element = elementsOfPage[i]; 

        let elementId;
        if(element.getAttribute("is-split-node-parent")) {
            elementId = "split-parent-" + element.id;
            elementIds.push(element.id);
        }
        else if(element.id === "") {
            elementId = "split-child-from-previous";
        }
        else {elementId = element.id;}
      
        // calculate client measurements of element:
        let pageContexts = calculateClientMeasurementsOfElement(element);
        let fromNodeTop = pageContexts["distanceFromNodeTop"];
        let fromNodeBottom = pageContexts["distanceFromNodeBottom"];

        // calculate nodeHeight and remaining space:
        let nodeHeight = fromNodeBottom - fromNodeTop; 
        let remainingSpace = pageContexts["pageContentHeight"] - fromNodeBottom;
    
        // define pageContexts calculated:  
        let fromNodeTopCalc = parseInt(element.getAttribute("fromNodeTop"));
        let fromNodeBottomCalc = parseInt(element.getAttribute("fromNodeBottom"));
        let nodeHeightCalc = parseInt(element.getAttribute("nodeHeight"));
        let remainingSpaceCalc = parseInt(element.getAttribute("remainingSpace"));
        let footnoteAreaHeightCalc = parseInt(element.getAttribute("footnoteAreaHeight"));

        // adjust remainingSpace by repecting the footnote situation during rendering:
        let footnoteAreaHeight = pageContexts["footnoteAreaHeight"];
        let footnoteAreaDiff = footnoteAreaHeight - footnoteAreaHeightCalc;
        remainingSpace = remainingSpace + footnoteAreaDiff;
        remainingSpace = (remainingSpace > 0) ? remainingSpace : 0;

        // parameter of fitsInCurrentPageFrame (figures):
        let fitsCalc;
        if(element.getAttribute("data-after") !== null) {
            fitsCalc = element.getAttribute("data-after");
        } else {fitsCalc = "Node is figure node."};

        // display:
        let failColor = "color: red;"
        let warnColor = "color: #ffc107;";
        let passedColor = "color: green;";

        let pageIdLog = pageId + "----------------------";
        console.log(pageIdLog);
        let elementIdLog = "---" + elementId;
        console.log(elementIdLog);

        console.log("---page-has-figures:",figureStatsPage);

        let fromNodeTopLog = "------fromNodeTop => was: " + 
            fromNodeTopCalc + ", is: " + fromNodeTop;
        if(isNaN(fromNodeTopCalc)) {
            console.log("%c" + fromNodeTopLog, failColor);
        }
        else if(Math.abs(fromNodeTop - fromNodeTopCalc) >= 100) {
            console.log("%c" + fromNodeTopLog, failColor);
        }
        else if(Math.abs(fromNodeTop - fromNodeTopCalc) >= 50) {
            console.log("%c" + fromNodeTopLog, warnColor);
        } 
        else {console.log("%c" + fromNodeTopLog, passedColor);}

        let fromNodeBottomLog = "------fromNodeBottom => was: " + 
            fromNodeBottomCalc + ", is: " + fromNodeBottom;
        if(isNaN(fromNodeBottomCalc)) {
            console.log("%c" + fromNodeBottomLog, failColor);
        }
        else if(Math.abs(fromNodeBottom - fromNodeBottomCalc) >= 60) {
            console.log("%c" + fromNodeBottomLog, failColor);
        } 
        else if(Math.abs(fromNodeBottom - fromNodeBottomCalc) >= 10) {
            console.log("%c" + fromNodeBottomLog, warnColor);
        } 
        else {console.log("%c" + fromNodeBottomLog, passedColor);}

        let nodeHeightLog = "------nodeHeight => was: " + 
            nodeHeightCalc + ", is: " + nodeHeight;
        if(isNaN(nodeHeightCalc)) {
            console.log("%c" + nodeHeightLog, failColor);
        }
        else if(Math.abs(nodeHeightCalc - nodeHeight) >= 60) {
            console.log("%c" + nodeHeightLog,  failColor);
        } 
        else if(Math.abs(nodeHeightCalc - nodeHeight) >= 10) {
            console.log("%c" + nodeHeightLog,  warnColor);
        } 
        else {console.log("%c" + nodeHeightLog, passedColor);}

        // compare remaining space and footnoteArea
        let remainingSpaceLog = "------remainingSpace => was: " + 
        remainingSpaceCalc + "; is: " + remainingSpace;
        if(isNaN(remainingSpace)) {
            console.log("%c" + remainingSpaceLog, failColor);
        }
        else if(Math.abs(remainingSpaceCalc - remainingSpace) >= 60) {
            console.log("%c" + remainingSpaceLog, failColor);
        } 
        else if(Math.abs(remainingSpaceCalc - remainingSpace) >= 10) {
            console.log("%c" + remainingSpaceLog, warnColor);
        } 
        else {console.log("%c" + remainingSpaceLog, passedColor);}

        let footnoteAreaHeightLog = "------footnoteAreaHeight => " + 
        " at node: " + footnoteAreaHeightCalc + 
        "; at page end: " + footnoteAreaHeight;
        console.log(footnoteAreaHeightLog);

        console.log("---fits", fitsCalc);
        console.log("---Element", element);
    } 
        
}

/**
 * calculate height of text node by textWidth:
 * @param {node} node node from parsedContent before rendered
  * @param {JSON} contexts parameter collection (e.g. pageId, elementSetBefore,
 * distances etc), predefined before as pageContexts
 * @returns {Number} distance to page-top from node-bottom in px
 * 
 */ 
function calculateHeightOfNodeByTextWidth(node, contexts) {

    let pageContentWidth = contexts["pageContent"].offsetWidth;

    // calculate text-width of node text:   
    let textStyles = getComputedStylesOfTextElements();
    let font = textStyles["paraFontSizeDeclared"] + " " + textStyles["paraFont"];
    let textWidth = getTextWidth(node.innerText, font);
    let linesComplete = Math.ceil(textWidth / pageContentWidth); 

    // calculate text-height by lineHeight:
    let heightParagraphLinePx = textStyles["heightParagraphLinePx"];
    let calculatedHeight = linesComplete * Math.ceil(heightParagraphLinePx);
    
    return(calculatedHeight);
}

function getComputedStylesOfTextElements() {

    let documentRoot = document.querySelector(':root');

    // get and parse declared style properties of text-content:
    let paraFont = getComputedStyle(documentRoot).getPropertyValue("--para-font"); 
    let paraFontSizeDeclared = getComputedStyle(documentRoot).getPropertyValue("--p-font-size");
    let lineHeightDeclaredPara = getComputedStyle(documentRoot).getPropertyValue("--line-height-para");
    let lineHeightPara = (lineHeightDeclaredPara) ? lineHeightDeclaredPara : 1.5; 
    let paraFontSize = (paraFontSizeDeclared) ? paraFontSizeDeclared.slice(0, -2) * 1.333 : 12.5; 
    let heightParagraphLinePx = paraFontSize * lineHeightPara; 

    // get and parse declared style properties of figCaptions:
    let captionFont = getComputedStyle(documentRoot).getPropertyValue("--caption-font");
    let captionFontSizeDeclared = getComputedStyle(documentRoot).getPropertyValue("--caption-font-size");
    let lineHeightDeclaredCap = getComputedStyle(documentRoot).getPropertyValue("--line-height-cap");
    let lineHeightCap = (lineHeightDeclaredCap) ? lineHeightDeclaredCap : 1.37; 
    let captionFontSize = (captionFontSizeDeclared) ? captionFontSizeDeclared.slice(0, -2) * 1.333 : 9.75;
    let heightCaptionLinePx = captionFontSize * lineHeightCap;

    // collect computed styles in object
    let computedTextStyles = {
        "paraFont": paraFont,
        "paraFontSizeDeclared": paraFontSizeDeclared,
        "paraFontSize": paraFontSize,
        "heightParagraphLinePx": heightParagraphLinePx,
        "lineHeightPara": lineHeightPara,
        "lineHeightCap": lineHeightCap,
        "captionFont": captionFont,
        "captionFontSizeDeclared": captionFontSizeDeclared,
        "captionFontSize": captionFontSize,
        "heightCaptionLinePx": heightCaptionLinePx,
    }
    return(computedTextStyles);
}

function getTextWidth(text, font) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) { return 0;}

    context.font = font;
    const metrics = context.measureText(text);

    return metrics.actualBoundingBoxRight + metrics.actualBoundingBoxLeft;
}

/**
 * set page contexts information as an attribute node of element:
 * @param {JSON} contexts parameter collection (e.g. pageId, elementSetBefore,
 * distances etc), predefined before as pageContexts
 * @param {node} sourceNode original node from parsedContent currently rendered
 * @param {node} renderNode cloned node that is added to the DOM; if pagedJs splits
 * the sourceNode, renderNode is rendered on the next page
 * @returns {void} contexts information will be saved as attribute node of element
 */
function setPageContextsAsElementAttribute(contexts, sourceNode, renderNode) {

    // set contexts values as attributes of sourceNode:
    if(sourceNode !== undefined) {
        sourceNode.setAttribute('fromNodeTop', contexts["distanceFromNodeTop"]);
        sourceNode.setAttribute('fromNodeBottom', contexts["distanceFromNodeBottom"]);
        sourceNode.setAttribute('nodeHeight', contexts["nodeHeight"]);
        sourceNode.setAttribute('remainingSpace', contexts["remainingSpace"]);
        sourceNode.setAttribute('footnoteAreaHeight', contexts["footnoteAreaHeight"]);
        sourceNode.setAttribute("pageContentTop", contexts["pageContentTop"]);
    }

    // set contexts values as attributes of renderNode:
    let contextRenderNode = contexts["renderNode"];
    if(renderNode !== undefined) {
        renderNode.setAttribute('fromNodeTop', contextRenderNode["distanceFromNodeTop"]);
        renderNode.setAttribute('fromNodeBottom', contextRenderNode["distanceFromNodeBottom"]);
        renderNode.setAttribute('nodeHeight', contextRenderNode["nodeHeight"]);
        renderNode.setAttribute('remainingSpace', contextRenderNode["remainingSpace"]);
        renderNode.setAttribute('footnoteAreaHeight', contextRenderNode["footnoteAreaHeight"]);
        renderNode.setAttribute("pageContentTop", contexts["pageContentTop"]);
    }
}

/**
 * adjust layout of meta-titles (appendix), e.g. Abstract, Author information, in order
 * to places these headlines on top of each page
 * @param {node} sourceNode original node from parsedContent currently rendered
 * @returns {void} adds marginTop to title element depending on remainingSpace of previous page
 */
function adjustLayoutOfAppendixTitles(sourceNode) {

    if(/title-appendix/.test(sourceNode.className)) {

        // define page contexts of source node:
        let contexts = definePageContextsOfSourceNode(sourceNode);
        contexts = calculateNodeDistances(contexts, sourceNode);

        // add top-margins to title-appendixes and push them to next column
        if(contexts["distanceFromNodeTop"] !== 0) {
           sourceNode.style.marginTop = contexts["pageContentHeight"] + "px";
        }        
    }
}

// Figure typesetting
// ------------------
/**
 * process figure enhancing: meta function used to control the typesetting of figures:
 * based on defined typesetting classes, figure constellations, layout specs and page
 * contexts it decides if the figures currently processed will be inserted or pushed 
 * to the following node until it fits:
 * @param {JSON} nodeParams: parameter collection (e.g. pageContext-parameter,
 * target figure references, target figure Elements)
 * @returns {void} figures saved in nodeParams will be inserted in renderNode or not.
 */

function processFigureEnhancing(nodeParams) {

    // shorten nodeParams and contextsParams:
    let sourceNode = nodeParams["sourceNode"];
    let renderNode = nodeParams["renderNode"];
    let contexts = nodeParams["contexts"];
    let currentFigure = nodeParams["currentFigure"];
    let nextFigure = nodeParams["nextFigure"];
    let figureMap = readJsonStorage(STORAGE_KEYS.FIGURE_MAP, {});

    // preset default typesetting classes:
    if(currentFigure) setFigureTypesettingClass(currentFigure);
    if(nextFigure) setFigureTypesettingClass(nextFigure);

    // get typesetting instructions by figConstellationKeys:
    let classes = getTypesettingClassesOfConstellations(contexts, nodeParams);
    let keys = classes["beforeCurrent"] + "#" + classes["current"]  + "#" + classes["next"];
    let figConstellations = applicationResources.figConstellations[0];
    let set = figConstellations[keys];

    if(set !== undefined && set) {
        // set final layout specs of figures:
        if(currentFigure) setLayoutSpecsOfFigure(currentFigure, set["currentFigure"][1]);
        if(nextFigure) setLayoutSpecsOfFigure(nextFigure, set["nextFigure"][1]);

        // check if figures fit in current page frame (remaining space)
        let fits = figuresFitInCurrentPageFrame(set, nodeParams);

        // add target figureRefs and figureDensity to source- and renderNode:
        let allRefAttributes;
        if(nodeParams["figRefs"] && nodeParams["figRefs"].length) {
            allRefAttributes = "targetFigRefs: " + nodeParams["figRefs"].join(", ") +
            "; fits: " + JSON.stringify(fits);
        } else {
            allRefAttributes = "targetFigRefs: no-fig-refs" +
            "; fits: " + JSON.stringify(fits);
        }
        sourceNode.setAttribute('data-after', allRefAttributes);
        renderNode.setAttribute('data-after', allRefAttributes);

        // set each figure as tiny float:
        if(setAllFiguresTiny) {
            if(currentFigure && !figureMap[currentFigure.id]?.["typesettingClass"]) {
                fits["currentFigure"] = true;
                setLayoutSpecsOfFigure(currentFigure, "float-w-col-2");
            }
            if(nextFigure && !figureMap[nextFigure.id]?.["typesettingClass"]) {
                fits["nextFigure"] = true;
                setLayoutSpecsOfFigure(nextFigure, "float-w-col-2"); 
            }
        }

        // set each figure ignoring context calculation in case of high figure density:
        let figureDensity = nodeParams["figureDensity"];
        if(!setAllFiguresTiny && figureDensity >= figureDensityThreshold) {
            if(currentFigure && !/float/.test(classes["beforeCurrent"])
            && !figureMap[currentFigure.id]?.["typesettingClass"]) {
                if(!fits["currentFigure"]) {setLayoutSpecsOfFigure(currentFigure, "inset");}
                fits["currentFigure"] = true;
            }
            if(nextFigure && !/float/.test(classes["current"])
            && !figureMap[nextFigure.id]?.["typesettingClass"]) {
                if(!fits["nextFigure"]) {setLayoutSpecsOfFigure(nextFigure, "inset");}
                fits["nextFigure"] = true;
            }
        }

        // keep global figure order
        if(keepGlobalFigOrder) {
            if(currentFigure && !isGlobalFigureOrder(currentFigure)) {
                fits["currentFigure"] = false;
            }
            if(nextFigure && !isGlobalFigureOrder(nextFigure)) {
                fits["nextFigure"] = false;
            }
        }

        // process inserts or skip
        if(fits["currentFigure"] && fits["nextFigure"]) {
            addTemporaryMarginToFloatingFigure(nextFigure, contexts);
            addTemporaryMarginToFloatingFigure(currentFigure, contexts);

            if(!setNoFigures) {
                renderNode.insertAdjacentElement("afterend", nextFigure);
                renderNode.insertAdjacentElement("afterend", currentFigure);
            }
            updateFigureMap(nextFigure.id);
            updateFigureMap(currentFigure.id);
        }
        else if(fits["currentFigure"] && !contexts["pageHasFloats"]) {
            addTemporaryMarginToFloatingFigure(currentFigure, contexts);
            if(/overmargin/.test(currentFigure.className)) {
                setLayoutSpecsOfFigure(currentFigure, "overmargin");
            }
            if(!setNoFigures) {
                renderNode.insertAdjacentElement("afterend", currentFigure);
                updateFigureMap(currentFigure.id);
                pushFigRefToNextNode(sourceNode.id, nextFigure.id);
            }
        } 
        else {
            pushFigRefToNextNode(sourceNode.id, currentFigure.id);
            pushFigRefToNextNode(sourceNode.id, nextFigure.id);
        }

        // last text node of section => place all figures in section range
        if(keepFiguresWithinSection && nodeParams["isLastOfSection"]) {
            // flip sorting order due to reversed insert
            let nextFigRefs = nodeParams["figRefs"].reverse(); 
            let parsedContent = nodeParams["parsedContent"];
            for (let i = 0; i < nextFigRefs.length; i++) {     
                let figure = getNextFigureElement(nextFigRefs[i], parsedContent);
                setLayoutSpecsOfFigure(figure, "inset");

                if(!setNoFigures) {
                    renderNode.insertAdjacentElement("afterend", figure);
                }
                updateFigureMap(figure.id);
            }
        }        

        // last text node => place all figures not set before:
        if(nodeParams["isLastOfAll"]) {
            // force page break for last text node:
            if(setFiguresAtEnd) sourceNode.style = "margin-bottom:600mm;"
            // flip sorting order due to reversed insert
            let nextFigRefs = nodeParams["figRefs"].reverse();
        
            let parsedContent = nodeParams["parsedContent"];
            for (let i = 0; i < nextFigRefs.length; i++) {     
                let figure = getNextFigureElement(nextFigRefs[i], parsedContent);
                setLayoutSpecsOfFigure(figure, "inset");
                renderNode.insertAdjacentElement("afterend", figure);
            }
        }
    }
}

/**
 * set layout specifications (width) of figure
 * @param {HTMLElement} figure figure element currently on stage
 * @param {string} addClass given typesetting class; false by default
 * @returns {void} specs will be directly added as style of figure element
 */
function setLayoutSpecsOfFigure(figure, addClass = false) {

    if(figure) {
        // define and set typesetting class:
        let typesettingClass = setFigureTypesettingClass(figure, addClass);  
        let figureModelSpecs = getFigureModelSpecs(figure, typesettingClass);

        // define figure specs based on figureModelSpecs
        let figureWidthPreset = (figureModelSpecs) ? figureModelSpecs[0] : false;
        const figureHeightPreset = "auto"; // always

        // pre-assign specs of figure-width and -height:
        figure.style.width = (figureWidthPreset) ? figureWidthPreset : "auto";
        figure.style.height = (figureHeightPreset) ? figureHeightPreset : "auto";
    }
}

/**
 * set typesetting class of figure element
 * @param {HTMLElement} figure figure element currently on stage
 * @param {string} addClass given typesetting class; false by default
 * @returns {string} typesettingClass: the name of the typesettingClass
 * typesettingClass will additionally added to classList of figure
 */

function setFigureTypesettingClass(figure, addClass = false) {

    let figureMap = readJsonStorage(STORAGE_KEYS.FIGURE_MAP, {});
    let typesettingClass;

    // define typesetting class:
    if(figure) {
        // remove former class from figure element:
        if(figure.classList[typesettingClassListKey] !== undefined) {
            figure.classList.remove(figure.classList[typesettingClassListKey]);
        }
        // set typesettingClass saved in figureMap:
        if(figureMap[figure.id]?.["typesettingClass"]) {
            typesettingClass = figureMap[figure.id]["typesettingClass"];
        }
        // set typesettingClass given by user or figure constellation:
        else if(addClass) {
            typesettingClass = addClass;
        }
        // set default typesettingClass
        else {
            typesettingClass = getDefaultFigureTypesettingClass(figure);
        }
        // add new  typesetting class to figure element:
        if (typesettingClass) {
            figure.classList.add(typesettingClass);
        }
    }
    return(typesettingClass);
}

/**
 * get default typesetting class of figure from journalConfig. Search
 * key is defined by resolutionTypeClass (e.g. small) and ratioClass 
 * (e.g. landscape)
 * @param {HTMLElement} figure figure element currently on stage
 * @returns {string} typesettingClass: the name of typesettingClass
 */
function getDefaultFigureTypesettingClass(figure) {

    let typesettingClass;
    let figureKey;

    // define search keys by calculated figure classes:
    let resTypeFigure = (figure) ? figure.classList[resTypeClassListKey] : false;
    let ratioFigure = (figure) ? figure.classList[ratioClassListKey] : false;
    figureKey = (figure) ? resTypeFigure + "-" + ratioFigure : "";

    // get typeSettingClass from journalConfig:
    let journalConfig = applicationContext.document.journalConfig;
    typesettingClass = journalConfig["figureTypesettingClass"][figureKey];
    
    return(typesettingClass);
}

/**
 * get figure model specifications (width and height) from journal-config,
 * from figure map (document specific) or default specs (fallback)
 * key is defined by resolutionTypeClass (e.g. small) and ratioClass 
 * (e.g. landscape)
 * @param {HTMLElement} figure figure element currently on stage
 * @param {string} typesettingClass: the name of typesettingClass
 * @returns {array} figureModelSpecs as array [width, height]
 */
function getFigureModelSpecs(figure, typesettingClass) {

    let figureModelSpecs;
    let figureMap = readJsonStorage(STORAGE_KEYS.FIGURE_MAP, {});
    let journalConfig = applicationContext.document.journalConfig;

    // check for figure styles saved in figureMap:
    if(figureMap[figure.id]?.["style"]) {
        figure.style.cssText = figureMap[figure.id]["style"];
        figureModelSpecs = [figure.style.width, figure.style.height];
    } 
    // get specs from journal-config:
    else if(journalConfig["figureModelSpecs"][typesettingClass] !== undefined) {
        figureModelSpecs = journalConfig["figureModelSpecs"][typesettingClass];
    }
    // set default specs:
    else {
        figureModelSpecs = ["100%", "100%"];
    }    
    return(figureModelSpecs);
}

/**
 * helper function: get typesetting class of each figures in figure constellation, 
 * that means the typesetting class of the figure typeset before (if existing), the
 * the class of the current figure and the next figure
 * @param {JSON} contexts parameter collection (e.g. pageId, elementSetBefore,
 * distances etc), predefined before as pageContexts
 * @param {JSON} nodeParams: parameter collection (e.g. pageContext-parameter,
 * target figure references, target figure Elements)
 * @returns {JSON} typesetting classes of each figure
 */
function getTypesettingClassesOfConstellations(contexts, nodeParams) {

    let elementSetBefore = contexts["elementSetBefore"];
    let currentFigure = nodeParams["currentFigure"];
    let nextFigure = nodeParams["nextFigure"];

    let currentFigureClass = (currentFigure) ? currentFigure.classList[typesettingClassListKey] : false;
    let nextFigureClass = (nextFigure) ? nextFigure.classList[typesettingClassListKey] : false;
    let figureBeforeCurrentClass;

    if(elementSetBefore && elementSetBefore.tagName === "FIGURE") {
        figureBeforeCurrentClass = elementSetBefore.classList[typesettingClassListKey];
        if(/onTopOfPage/.test(figureBeforeCurrentClass)) {
            figureBeforeCurrentClass = elementSetBefore.classList[3];
        }
    }
    else {figureBeforeCurrentClass = false;}

    let typesettingClasses = {
        "beforeCurrent": figureBeforeCurrentClass,
        "current": currentFigureClass,
        "next": nextFigureClass
    }
    return(typesettingClasses);
}

/**
 * add a temporary margin-bottom to floating figure. The negative margin has
 * the purpose to give a temporary space to the text nodes following the figure
 * on page during pagedJs rendering. Currently pagedJs does not handle floating 
 * elements properly in regard to pageBreaks. Without this margin - overwritten 
 * later by the regular css-specs in the stylesheets - a lot of whitespace would 
 * be left. 
 * The margin value itself is calculated based on figureClientHeight and 
 * figureClientWidth in relation to floating text lines
 * @param {HTMLElement} figure figure element currently on stage
 * @param {JSON} contexts parameter collection (e.g. pageId, elementSetBefore,
 * distances etc), predefined before as pageContexts
 * @returns {void} margin-bottom will set as inline-style of figure element
 */
function addTemporaryMarginToFloatingFigure(figure, contexts) {

    // get properties from document root:
    let documentRoot = document.querySelector(':root');
    let offsetToMarginAreaDeclared = getComputedStyle(documentRoot)
        .getPropertyValue("--floatFigureOffsetToMarginArea");
    let figureMarginBottomDefault = getComputedStyle(documentRoot)
    .getPropertyValue("--figureMarginBottomDefault");

    if(/float/.test(figure.className)) {
        // parse offsetToMarginArea properties to int:
        let offsetToMarginArea;
        if(offsetToMarginAreaDeclared) {
            offsetToMarginArea = offsetToMarginAreaDeclared.slice(0, -2) * 3.78; // 1mm = 3.7795px
        } else offsetToMarginArea = 150; // default margin
        offsetToMarginArea = Math.abs(offsetToMarginArea); // turn negative value to positive

        // calculate client sizes of figure:
        let pageContentWidth = contexts["pageContentWidth"];
        let clientSizes = calculateClientSizeOfFigure(figure, pageContentWidth);
        let figureWidth = clientSizes["clientWidthCalculated"];
        let figureHeight = clientSizes["clientHeightCalculated"];
        let marginBottom = clientSizes["marginBottom"];
        let sideMargin = clientSizes["sideMargin"];

        // calculate width of floating text area:
        let lineWidth; /* expected with of text area based on figureWidth */
        if(figureWidth - sideMargin - offsetToMarginArea > 0) {
            lineWidth = figureWidth - offsetToMarginArea;
        } 
        // for figures which repress no text at all:
        else lineWidth = figureWidth; 

        let textFloatWidth = pageContentWidth - lineWidth;
        let textFloatPercent = textFloatWidth / pageContentWidth;
       
        // calculate height of floating text area:
        let textStyles = getComputedStylesOfTextElements();
        let textLines = figureHeight / textStyles["heightParagraphLinePx"];
        let textHeight = textLines * textStyles["heightParagraphLinePx"];

        // calculate temporaryMargin (- subtract regular marginBottom):
        let temporaryMargin = textHeight * textFloatPercent - marginBottom - sideMargin;
        temporaryMargin = temporaryMargin * temporaryMarginBuffer; // e.g. * 0.9 (const)
    
        // set negative margin value as inline-style:
        figure.style.marginBottom = "-" + temporaryMargin + "px"; 
    }
    // set marginBottom to default margin if figure was set to float before:
    else {
        figure.style.marginBottom = figureMarginBottomDefault; // e.g. 7.5mm
    }
}

/**
 * determine if figures fit in current page frame
 * @param {JSON} set: typesetting instructions from figConstellations.json 
 * defined by each classes of figure constellation
 * @param {JSON} nodeParams: parameter collection (e.g. pageContext-parameter,
 * target figure references, target figure Elements)
 * @returns {JSON} fits: object with booleans for current and next figure
 */
function figuresFitInCurrentPageFrame(set, nodeParams) {

    let contexts = nodeParams["contexts"];
    let renderNodeParams = contexts["renderNode"];
    let remainingSpaceRenderNode = renderNodeParams["remainingSpace"];
    let currentFigure = nodeParams["currentFigure"];
    let nextFigure = nodeParams["nextFigure"];
    
    // calculate clientSize of figure (includes figCaption and marginBottom)
    let pageContentWidth = contexts["pageContentWidth"];
    let maxPageContentHeight = contexts["maxPageContentHeight"];
    let clientSizeCurrentFigure = calculateClientSizeOfFigure(currentFigure, pageContentWidth);
    let clientSizeNextFigure = calculateClientSizeOfFigure(nextFigure, pageContentWidth);
    let clientHeightCurrentFigure = clientSizeCurrentFigure["clientHeightCalculated"];
    let clientHeightNextFigure = clientSizeNextFigure["clientHeightCalculated"];

    // add pageSpaceBuffer to avoid tight constellations:
    const remainingSpace = remainingSpaceRenderNode * pageSpaceBuffer;

    // rescale portait images with exceeding height limit (of page):
    let maxTargetHeight = maxPageContentHeight * 0.9;
    if(clientHeightCurrentFigure > maxTargetHeight) {
        clientHeightCurrentFigure = maxTargetHeight;
        currentFigure.querySelector("img").style = 
            "max-height:" + maxTargetHeight + "px;";
    }
    if(clientHeightNextFigure > maxTargetHeight) {
        clientHeightNextFigure = maxTargetHeight;
        nextFigure.querySelector("img").style = 
            "max-height:" + maxTargetHeight + "px;";
    }
 
    // check settings of current and next figure together:
    let fitsCurrentFigure;
    let fitsNextFigure;
    if(set["currentFigure"][0] && set["nextFigure"][0]) {
        if(remainingSpace > (clientHeightCurrentFigure + clientHeightNextFigure)) {
            fitsCurrentFigure = true;
            fitsNextFigure = true;
        }
        else if(remainingSpace > clientHeightCurrentFigure || remainingSpace < 100) {
            fitsCurrentFigure = true;
            fitsNextFigure = false;
        }
        else {
            fitsCurrentFigure = false;
            fitsNextFigure = false;
        }    
    }
    // check setting of current figure only:
    else if(set["currentFigure"][0]) {
        if(remainingSpace <= 50) {
            fitsCurrentFigure = true;
            fitsNextFigure = false;
        }
        else if(remainingSpace > clientHeightCurrentFigure || remainingSpace < 100) {
            fitsCurrentFigure = true;
            fitsNextFigure = false;
        }
        else {
            fitsCurrentFigure = false;
            fitsNextFigure = false;
        }
    }
    else {
        fitsCurrentFigure = false;
        fitsNextFigure = false;
    }

    // exclude pages which have n-Figures already:
    if(contexts["isPageFigureMax"]) {
        fitsCurrentFigure = false;
        fitsNextFigure = false;
    }

    // exclude figures within list blocks:
    if(/LI/.test(nodeParams["sourceNode"].tagName)) {
        fitsCurrentFigure = false;
        fitsNextFigure = false;
    }
  
    // return results as object:
    return {
        "currentFigure": fitsCurrentFigure,
        "clientHeightCurrentFigure": clientHeightCurrentFigure,
        "nextFigure": fitsNextFigure,
        "clientHeightNextFigure": clientHeightNextFigure
    }
}

/**
 * calculate client size of figure not yet added to DOM. It integrates
 * all size critical elements of figure (image, figCaption and each 
 * margins) 
 * @param {HTMLElement} figure figure element currently on stage
 * @param {int} pageContentWidth: width of text-area (without page-margins)
 * @returns {JSON} clientSizes: object with relevant size-parameter
 */
function calculateClientSizeOfFigure(figure, pageContentWidth) {

    // calculate clientWidth and clientHeight of figure:
    let clientSizes = {};
    let clientHeightCalculated = 0;
    let clientHeightFigCaption = 0;

    if(figure) {  
        // get available size parameter:
        let naturalWidth = figure.getAttribute("data-img-width");
        let naturalHeight = figure.getAttribute("data-img-height");
        let ratio = naturalWidth / naturalHeight;

        // calculate clientWidth by width (css-)percentage values:
        let clientWidthCalculated;
        let widthPercentage;
        if(/%/.test(figure.style.width)) {
            widthPercentage = figure.style.width.slice(0, -1); // e.g. 50 (%)
            clientWidthCalculated = pageContentWidth * widthPercentage / 100;
        }
        // take given clientWidth (e.g. 500px)
        else { clientWidthCalculated = figure.style.width.slice(0, -2);}
        clientHeightCalculated = clientWidthCalculated / ratio;

        // calculate img and figure margins:
        let documentRoot = document.querySelector(':root');
        let imgMarginBottomDeclared = getComputedStyle(documentRoot).getPropertyValue("--imgMarginBottom");
        let imgMarginBottom = (imgMarginBottomDeclared) ? imgMarginBottomDeclared.slice(0, -2) * 3.78 : 10;
        let marginBottomDeclared = getComputedStyle(documentRoot).getPropertyValue("--floatFigureMarginBottom");
        let marginBottom = (marginBottomDeclared) ? marginBottomDeclared.slice(0, -2) * 3.78 : 28;

        // calculate clientHeight of figCaption:
        if(!/inset/.test(figure.className)) {
            clientHeightFigCaption = calculateClientHeightOfFigCaption(figure, clientWidthCalculated);
        }
 
        // add clientHeightFigCaption and marginBottom to calculated clientHeight of figure:
        clientHeightCalculated = clientHeightCalculated + imgMarginBottom + clientHeightFigCaption + marginBottom;

        // add sideMargins to clientWidthFigure:
        let sideMarginDeclared = getComputedStyle(documentRoot).getPropertyValue("--floatFigureMarginToText");
        let sideMargin = (sideMarginDeclared ) ? sideMarginDeclared .slice(0, -2) * 3.78 : 38;
        clientWidthCalculated = clientWidthCalculated + sideMargin;

        // round client sizes by fixed-point notation:
        clientWidthCalculated = Math.round(parseFloat(clientWidthCalculated));
        clientHeightCalculated = Math.round(parseFloat(clientHeightCalculated));

        // assign values to clientSizes:
        clientSizes = {
            "clientWidthCalculated": clientWidthCalculated,
            "clientHeightCalculated": clientHeightCalculated,
            "marginBottom": marginBottom,
            "sideMargin": sideMargin
        }
    }
    return(clientSizes);
}

/**
 * calculate client-height of figure caption
 * @param {HTMLElement} figure: figure element currently on stage
 * @param {int} clientWidthCalculated: clientWidth of figure
 * @returns {int} heightFigCaption: height in px
 */
function calculateClientHeightOfFigCaption(figure, clientWidthCalculated) {

    // figureMap:
    let figureMap = readJsonStorage(STORAGE_KEYS.FIGURE_MAP, {});

    // get figCaptionText from figureMap:
    let figCaptionText
    if(figureMap[figure.id] !== undefined) {
        figCaptionText = figureMap[figure.id]["figCaptionText"];
    } else {
        figCaptionText = "";
    }

    // get styles:
    let textStyles = getComputedStylesOfTextElements();
    let captionFontStyles = textStyles["captionFontSizeDeclared"] + " " + textStyles["captionFont"];

    // calculate length of textWidth:
    let heightFigCaption = 0;
    if(figCaptionText !== undefined) {
        let textWidth = getTextWidth(figCaptionText, captionFontStyles); // figCaption.innerText
        let lines = textWidth / clientWidthCalculated;
        let captionLinesRound = Math.ceil(lines); // captionLines
        heightFigCaption = captionLinesRound * textStyles["heightCaptionLinePx"];
    }
    return(heightFigCaption);
}

/**
 * check if figure is in line with global figure order:
 * @param {HTMLElement} figure: figure element currently on stage
 * @returns {boolean} figBeforeInserted must be set before
 */
function isGlobalFigureOrder(figure) {
    
    let figBeforeIsInserted = false;
    let figureMap = readJsonStorage(STORAGE_KEYS.FIGURE_MAP, {});
    let posCurrent;
    let figBeforeId;
    if(figure) {
        posCurrent = figureMap[figure.id]?.["position"];
        if(posCurrent !== 0) {
            figBeforeId = Object.keys(figureMap)
            .find(key => figureMap[key]?.["position"] === posCurrent-1);
        }
        if(figBeforeId !== undefined) {
            figBeforeIsInserted = figureMap[figBeforeId]["inserted"];
        }
        if(posCurrent === 0) {   // Fig. 1 = always first
            figBeforeIsInserted = true;
        }
    }
    return(figBeforeIsInserted);
}

// Rendered-element classification
// -------------------------------
/**
 * classify if elements are rendered on left or right page:
 * @param {node} pageElement page element that just been rendered
 * @param {string} selector querySelector of elements
 * @returns {void} classes (right-page or left-page) are added to 
 * selected elements (also as title-attributes)
 */ 

function classifyPageOfElements(pageElement, selector) {

    let pageContent = pageElement.querySelector(".pagedjs_page_content");
    let elementsOfPage = pageContent.querySelectorAll(selector);

    for (let i = 0; i < elementsOfPage.length; i++) {
        // check and add page-class of element:
        let element = elementsOfPage[i];
        if (pageElement.classList[1] === "pagedjs_right_page") {
            element.classList.add("right-page");
        } else {
            element.classList.add("left-page");
        }
        // add classes as element-title attribute:
        if(devMode) {
            element.title = element.className;
        }
    }
}

/**
 * classify position of elements on page:
 * @param {node} pageElement page element that just been rendered
 * @param {string} selector querySelector of elements
 * @returns {void} classes (e.g. "first-element", "last-element") are added to 
 * selected elements (also as title-attributes)
 */ 
function classifyElementPositionOnPage(pageElement, selector) {

    let pageContent = pageElement.querySelector(".pagedjs_page_content");
    
    // handle classification in twoColumnLayout:
    let figColumnBlock = pageElement.querySelector(".fig-column-block");
    if(figColumnBlock !== null) {
        selector = ".text-content";
        let figuresInColumnBlock = figColumnBlock.querySelectorAll("figure") 
        if(figuresInColumnBlock[0] !== undefined) {
            // classify first figure element separately:
            figuresInColumnBlock[0].classList.add("first-element");
        }
    }

    // default classification:
    let elementsOfPage = pageContent.querySelectorAll(selector);
    let lastIndex = elementsOfPage.length - 1;
    for (let i = 0; i < elementsOfPage.length; i++) {
        let element = elementsOfPage[i];
        switch (true) {
            case (elementsOfPage.length === 1):
                element.classList.add("alone");
                break;
            case (elementsOfPage[0] === element):
                element.classList.add("first-element");
                break;
            case (elementsOfPage[lastIndex].id === element.id):
                element.classList.add("last-element");
                break;
            default:
                element.classList.add("in-between");
                break;
        }
        
        // add classes as element-title attribute:
        if(devMode) {
            element.title = element.className;
            if(/first-element/.test(element.className)) {
                element.classList.remove("first-element");
                element.classList.add("first-element-ignored");
            }
        }
    }
}

/**
 * push (figure) element on top of page with respect to the given figure order.
 * @param {node} pageElement page element that just been rendered
 * @param {string} selector querySelector of all common block elements on page
 * @returns {void} figure elements will be relocated by insertAdjacent-statements
 */ 
function pushFigureElementOnTopOfPage(pageElement, selector) {

    // select onTopOfPage classes when configured and not in devMode:
    let onTopOfPage = (allFiguresOnTop && !devMode) ? ["regular", "regular-bottom", "overmargin", 
        "overmargin-bottom", "inset", "float-w-col-2", "float-w-col-4", "float-w-col-6"] : [];

    let pageContent = pageElement.querySelector(".pagedjs_page_content");
    let elementsOfPage = pageContent.querySelectorAll(selector);
    for (let i = 0; i < elementsOfPage.length; i++) {
        let element = elementsOfPage[i];
        let firstElement = elementsOfPage[0];
        //  adjust figure elements:
        if (element.matches("figure") && i !== 0) {
            // check positionClass and add positionClass saved in figureMap:
            let figureMap = readJsonStorage(STORAGE_KEYS.FIGURE_MAP, {});
            if (figureMap[element.id]?.["positionClass"]) {
                element.classList.add(figureMap[element.id]["positionClass"]);
            }
            //  push figure with positionClass on top of each page
            if(onTopOfPage.some(className => element.classList.contains(className))
                || /onTopOfPage/.test(element.className)) {
             
                // if first element is figure push element after this figure:
                if(firstElement.matches("figure")) {
                    if(/regular/.test(firstElement.className) || 
                    /overmargin/.test(firstElement.className) ||
                    /inset/) {
                        firstElement.insertAdjacentElement("afterend", element);
                    }
                }
                // push element before first element and reassign position class:
                else {
                    firstElement.insertAdjacentElement("beforebegin", element);
                    element.classList.remove(element.classList.item(6));
                    element.classList.add("first-element");
                }
            }
        }
    }
}

/**
 * push title (headline) orphans to next page 
 * @param {node} pageElement - page element that just been rendered
 * @param {node} page - node of the page being rendered
 * @param {Object} breakToken - location of the beginning of the overflow
 * @returns {void} breakToken.node and breakToken.offset are change in DOM
 */ 
function pushTitleOrphansToNextPage(pageElement, page, breakToken) {

    let pageContent = pageElement.querySelector(".pagedjs_page_content");
    let elementsOfPage = pageContent.querySelectorAll(".text-content,figure");
    let hookDocumentSource = page.hooks.afterPageLayout.context.source;

    for (let i = 0; i < elementsOfPage.length; i++) {
        let element = elementsOfPage[i];
        let sourceRef;
        let sourceElement;
        if(/title/.test(elementsOfPage[i].className) 
        && /last-element/.test(elementsOfPage[i].className)) {
            // find matching element in the pagedjs document source hook using its data-ref
            sourceRef = element.getAttribute("data-ref");
            sourceElement = hookDocumentSource.querySelector(`[data-ref="${sourceRef}"]`);
        
            // update breakToken.node to render element on the next page
            breakToken.node = sourceElement;
            // reset breakToken.offset to render from the start of the element
            breakToken.offset = 0; 

            // remove element from current page's DOM
            elementsOfPage[i].remove();
        }
    }
}

/**
 * ignores hyphenation by pagedJs, for partly fixing the following issue: 
 * https://github.com/pagedjs/pagedjs/issues/87
 * @param {node} pageElement - page element that just been rendered
 * @param {node} page - node of the page being rendered
 * @param {Object} breakToken - location of the beginning of the overflow
 * @returns {void} pagedjs_hypen-elements are replaced in DOM
 * 
 */ 
function ignoreHyphenationByPagedJs(pageElement, page, breakToken) {

    if (pageElement.querySelector('.pagedjs_hyphen')) {

        // find the hyphenated word
        let block = pageElement.querySelector('.pagedjs_hyphen');

        // move the breakToken
        let offsetMove = getFinalWord(block.innerHTML).length;
   
        // move the token accordingly
        page.breakToken = page.endToken.offset - offsetMove;

        // remove the last word
        block.innerHTML = block.innerHTML.replace(getFinalWord(block.innerHTML), "");
        breakToken.offset = page.endToken.offset - offsetMove;
    }

    function getFinalWord(words) {
        var n = words.split(" ");
        return n[n.length - 1];
    }
}

export const pagedView = Object.freeze({
    applyFigureLayout: setLayoutSpecsOfFigure,
    configure: configurePagedView,
    registerHandler: controlPagedJsHandler
});
