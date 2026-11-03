/* -------------------------------------
IMPORT STANDALONE ARTICLE VIEWER CONFIGS
--------------------------------------- */
const htmlViewScriptLibrary = window.HtmlViewerConfig?.dependencies || {};
const panelSearchConfig = window.HtmlViewerConfig?.panelSearch || {};
const elementSelectorsConfig = window.HtmlViewerConfig?.elementSelectorsConfig || {};

// prevent scrolling of application frame (window)
keepApplicationFrameInPlace();
window.addEventListener("scroll", keepApplicationFrameInPlace);
window.addEventListener("resize", keepApplicationFrameInPlace);

/* ------------------------------------
INITIALIZE STANDALONE WEB-VIEW
------------------------------------ */
 document.addEventListener("readystatechange", (event) => {

    if (event.target.readyState === "interactive") {

        // document is served single HTML or generated on the fly
        let isSingleHTMLFile;
        if(document.querySelector('meta[name="--from-xml"]') === null) {
            isSingleHTMLFile = true;
        } else isSingleHTMLFile = false;

        // add third-party libraries and stylesheets:
        if(isSingleHTMLFile) {
            addScriptToDocumentHead("highlightJs");
            addScriptToDocumentHead("highlightJsCss");
            addScriptToDocumentHead("leaflet");
            addScriptToDocumentHead("leafletCss");
            addScriptToDocumentHead("fontAwesome");
            addScriptToDocumentHead("NotoSans");
        }
     
        // remove fallback-styles:
        const fallbackStyles = document.querySelector("#fallback-styles");
        if(fallbackStyles !== null) {fallbackStyles.remove();}
    }

    if (event.target.readyState === "complete") {

        // hide progress-bar:
        if(document.querySelector("#progress-bar") !== null) {
            document.querySelector("#progress-bar").style.display = "none";
        }

        // event listeners:
        focusTocTargetsOnIntersectSection();
        scrollToFigureReferenceOnHoverFigure();
        filterAsidePanelsBySelectedText();
        highlightAnchorTargets();
        handleAnchorHashFeatures();
        window.addEventListener("hashchange", handleAnchorHashFeatures);

        // sync initial panel hash (#panel-cover by default):
        if (!window.location.hash) {window.location.hash = "#panel-cover"}
        // re-apply initial hash after dynamic panel DOM has been created
        setTimeout(() => {
            const hash = window.location.hash;
            if (!hash) return;
            history.replaceState(null, "", "#");
            window.location.hash = hash;
        }, 1000);
        }
});

/* ------------------
WEB VIEW CONTROLS
/ -----------------*/

 /**
 * add <script>- or <link>-element to document head
 * @param {String} scriptName: name of the script, 
 * defined in htmlViewScriptLibrary (constant)
 * @returns {void} appends script or link to document head
 */
function addScriptToDocumentHead(scriptName) {

    let type;
    if(htmlViewScriptLibrary[scriptName] !== undefined) {
        type = htmlViewScriptLibrary[scriptName]["type"];
    } else type = false;
    
    if(type === "text/javascript") {
        let script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = htmlViewScriptLibrary[scriptName]["source"];
        if(scriptName === "articleWebViewController") {
            script.defer = true;
        }
        document.head.appendChild(script);
    }
    else if(type === "text/css") {
        let cssLink = document.createElement('link');
        cssLink.type = 'text/css';
        cssLink.rel = 'stylesheet';
        cssLink.href = htmlViewScriptLibrary[scriptName]["source"];
        document.head.appendChild(cssLink);
    }
    else {
        console.warn("ScriptName [" + scriptName + "] not defined in scriptLibary")
    }
}

 /**
 * handle hash-driven side effects while panel visibility is controlled by CSS.
 * @returns {void} initializes map panel when required and keeps scroll correction behavior.
 */
function handleAnchorHashFeatures() {

    // get current hash from url:
    const currentHash = window.location.hash;
    if(!currentHash) {return;}

    // remove leading "#" because getElementById expects a plain id
    const hashTargetId = decodeURIComponent(currentHash.slice(1));
    const target = document.getElementById(hashTargetId);

    // init maps when a target inside gazetteer is addressed directly
    if(target !== null && target.closest("#gazetteer") !== null) {
        setTimeout(() => {initMaps(".map");}, 500);
    }

    // init maps when the panel-state hash directly targets gazetteer panel
    if(hashTargetId === "panel-gazetteer") {
        setTimeout(() => {initMaps(".map");}, 500);
    }
}

 /**
 * restore highlight/scroll behavior for internal anchor targets.
 * @returns {void} updates hash, scrolls target into view and applies temporary highlight
 */
function highlightAnchorTargets() {

    // define anchors:
    const anchors = document.querySelectorAll(
        "a.fig-ref,a.bib-ref,a.fn-ref,a.box-ref,a.index-ref"
        + ",a.ext-ref:not([data-specific-use='weblink'])"); // exclude weblinks

    // process anchors:
    anchors.forEach((anchor) => {
        anchor.addEventListener("click", event => {
            const targetRef = anchor.getAttribute("href");
            if(targetRef === null 
                || !targetRef.startsWith("#") 
                || targetRef.includes(' ')) {
                return;
            }

            //  ensure deterministic panel + centered scrolling.
            event.preventDefault(); // avoid default jump
            window.location.hash = targetRef;

            const target = document.querySelector(targetRef);
            if (!target) return;

            setTimeout(() => {
                target.classList.add("highlight");
                target.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                    inline: "nearest"
                });
            }, 500);

            // reset highlight after delay:
            setTimeout(() => {
                target.classList.remove("highlight");
            }, 3000);
        });
    });
}

/**
 * scroll to figure reference when hovering over figure image:
 * @returns {void} scrolls into view in DOM
 */
function scrollToFigureReferenceOnHoverFigure() {

    // define figures:
    const figures = document.querySelectorAll(
        "figure:not(.logo-img,.poster-img)");

    // process figures:
    figures.forEach(figure => {
        // use ref elements already stored in .internal-index-box
        const firstIndexRef = figure.querySelector('.index-ref');
        if (!firstIndexRef || !firstIndexRef.hash) return;

        // use hash value only as selector
        const refSelector = (firstIndexRef.hash) ? firstIndexRef.hash : false;

        // use img as trigger point for event listener
        const img = figure.querySelector("img");
        if (!img) return;

        // store active hover delay timeout
        let hoverTimer = null; 

        img.addEventListener("mouseenter", () => {
            // wait before executing the scroll sequence
            hoverTimer = setTimeout(() => {
                const target = document.querySelector(refSelector);
                if (!target) return;

                // apply intended behaviour in DOM
                target.classList.add("highlight");
                target.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });

                // reset highlight after delay:
                setTimeout(() => {
                    target.classList.remove("highlight");
                }, 3000);
            }, 500); // trigger delay time
        });

        img.addEventListener("mouseleave", () => {
            // cancel the sequence if mouse leaves before hover threshold is reached
            if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
            }
        });
    });
}

 /**
 * focus toc-targets when section comes in viewport at bottom
 * @returns {void} classes of targeted toc elements will be changed
 */
function focusTocTargetsOnIntersectSection() {

    const options = {threshold: 1,};
    const observer = new IntersectionObserver(sections => {
        sections.forEach(section => {

            // get target reference by section headline:
            const headline = section.target.firstElementChild;
            if(!headline) return;

            const targetRefId = headline.getAttribute("href");
            if(!targetRefId || targetRefId.includes(' ')) return;
    
            // query target:
            const target = document.getElementById
                (targetRefId.slice(1)); // remove #
            if (!target) return;

            // reference comes into viewport (at bottom)
            if (section.isIntersecting) { 
                // apply intended behaviour in DOM
                target.classList.add('active');
                target.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
                target.ariaCurrent = "true";
            } 
            // element leaves the viewport (at top)
            else {
                target.classList.remove('active');
                target.ariaCurrent = "false";
            }
        }, options);
    });

    // track all section elements:
    document.querySelectorAll("section")
        .forEach((element) => {observer.observe(element);
    });
}

 /**
 * filter aside-panel content by selected text on event listener selection-change
 * @returns {void} panel elements are filtered in the DOM directly
 */
function filterAsidePanelsBySelectedText() {

    // listen to selectionchange:
    document.addEventListener("selectionchange", () => {

        // get searchLog as feedback element:
        let searchLog = document.querySelector("#search-log");

        // define current panel context by locationHash:
        let locationHash = window.location.hash;
        if(/#f-/.test(locationHash)) {locationHash = "#panel-figures";}
        if(/#fn-/.test(locationHash)) {locationHash = "#panel-notes";}
        if(/#ref-/.test(locationHash)) {locationHash = "#panel-references";}

        // get panelElements selector from panelSearchConfig:
        let selector = panelSearchConfig[locationHash]; 
        if(selector === undefined) {return;}

        // give user some time to select desired text string:
        setTimeout(() => {

            // get selected text and show or hide searchLog accordingly
            const selectedText = window.getSelection().toString();
            if (selectedText.length > 2 && selectedText.length < 50) {
                searchLog.style = "display:block;";
                searchLog.textContent = selectedText;
            }
            else {
                searchLog.style = "display:none;";
                searchLog.textContent = selectedText;
            }
            // trim selected text:
            let searchTerm = selectedText.toLowerCase().trim();
           
            // query panel elements (e.g. FIGURE, .footnote)
            let panelElements = document.querySelectorAll(selector);
            if(!panelElements.length || searchTerm === null) {
                return;
            }
            
            // search panel elements:
            let matchCount = 0;
            panelElements.forEach(element => {
                let hayStack;
                let target;
                // get haystack and define target for figure elements specifically:
                if(locationHash === "#panel-figures") {
                    hayStack = element.getAttribute("data-search-haystack");
                    target = element.parentElement;
                } 
                // default behaviour, e.g. footnote, reference elements
                else {
                    hayStack = element.innerText.toLowerCase();
                    target = element;
                }
            
                // show all targets or matching result elements:
                const isMatch = searchTerm === "#show-all"
                    || (hayStack !== null && hayStack.includes(searchTerm));
                if(isMatch) {
                    target.style = "";
                    matchCount++;
                } 
                // hide the rest:
                else {
                    target.style = "display:none";
                }
            });

            const noResults = searchTerm.length > 2
                && searchTerm.length < 50
                && matchCount === 0;
                
            searchLog.classList.toggle("no-results", noResults);
            if(noResults) {
                searchLog.style.display = "block";
                searchLog.textContent = "No object found based on the given filter.";
            }
        }, 2000);
    });
}

 /**
 * init(ialize) map containers for leaflet
 * @param {String} selector css-selector of map container(s)
 * @returns {void} handles over mapId and coords to createMap()
 */
function initMaps(selector) {

    let maps = document.querySelectorAll(selector);
    maps.forEach(map => {
        let coords = [];
        let longitude = parseFloat(map.getAttribute("longitude"));
        let latitude = parseFloat(map.getAttribute("latitude"));
        // check if value is parseable finite number (!== null)
        if(Number.isFinite(longitude) && Number.isFinite(latitude)) {
            coords.push(longitude);
            coords.push(latitude);
        // no coordinates available:
        } else {
            coords = false;
        }
        createMap(map.id, coords);
    });
}

 /**
 * create leaflet maps
 * @param {String} mapId: ids of map elements (divs with class 'map')
 * @param {Array} coordinates: array wit long and lat values
 * @returns {void} instantiates leaflet maps (e.g. mapLayers and marker)
 */
function createMap(mapId, coordinates) {

    // set tile layers:
    let mapLayer = L.tileLayer.wms("https://tile.openstreetmap.de/{z}/{x}/{y}.png", {
        tiled: true,
        format: "image/jpeg",
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });

    // define map parameter:
    let location = (coordinates) ? {lat: coordinates[1], lng: coordinates[0]} : [0,0];
    let zoom = (coordinates) ? 8 : 1;

    // instantiate map:
    if(!document.querySelector("#" + mapId + " > .leaflet-pane")) {
        let map = L.map(document.querySelector("#" + mapId), {
            zoom: zoom,
            doubleClickZoom: false,
            dragging: false,
            zoomSnap: false,
            trackResize: false,
            touchZoom: false,
            scrollWheelZoom: false,
            center: location,
        });
        mapLayer.addTo(map);             // show mapLayer by default
        L.control.scale().addTo(map);    // show dynamic scale (Maßstab)
      
        // add location marker:
        let marker = L.marker(location).addTo(map);
        if(!coordinates) {
            marker.bindPopup("No coordinates available.").openPopup();
        }
    }
}

/**
 * prevent browser scrolling of the fixed application frame:
 * This helper prevents a common scroll mis-behaviour when scrollIntoView while the viewport
 * is at the bottom of the window/screen. Chrome extends the application frame (window) 
 * beyond the document view (= ugly jumping effect and unintended document viewport cut)
 * @returns {void}
 */
function keepApplicationFrameInPlace() {
    // Desktop uses two independently scrolling, fixed-height panels. On smaller
    // screens the panels are stacked and the document itself is the intended
    // scroll container, so resetting the root scroll position would prevent
    // all touch and wheel scrolling.
    const scrollMode = getComputedStyle(document.documentElement)
        .getPropertyValue("--viewer-scroll-mode")
        .trim();
    if(scrollMode !== "fixed") return;

    const documentRoot = document.scrollingElement;
    if(documentRoot === null) return;
    if(documentRoot.scrollTop !== 0) {documentRoot.scrollTop = 0;}
    if(documentRoot.scrollLeft !== 0) {documentRoot.scrollLeft = 0;}
}
