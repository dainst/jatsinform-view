// app base url:
const appBaseUrl = "http://localhost:3000/";

// single file script source
const singleFileScriptsUrl = "http://127.0.0.1:3001/" // "https:/publications.test.dainst.org/jatsinform-view/";

// scriptLibrary:
const scriptLibrary = {
    "viewerConfig": {
        "type": "text/javascript",
        "src-remote": "web-viewer/viewer-config.js",
        "src-local": "web-viewer/viewer-config.js"
    },
    "articleWebViewController": {
        "type": "text/javascript",
        "src-remote": "web-viewer/articleWebViewController.js",
        "src-local": "web-viewer/articleWebViewController.js"
    },
    "figConstellationSetup": {
        "type": "text/javascript",
        "src-remote": "configs/setupFigConstellations.js",
        "src-local": "configs/setupFigConstellations.js"
    },
    "pagedJs": {
        "type": "text/javascript",
        "src-remote": "https://unpkg.com/pagedjs/dist/paged.polyfill.js",
        "src-local": "lib/pagedJs/pagedJs_0.4.3.js"
    },
    "highlightJs": {
        "type": "text/javascript",
        "src-remote": "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/highlight.min.js",
        "src-local": "lib/highlightJs/highlightJs_11.10.0.js",
    },
    "highlightJsCss": {
        "type": "text/css",
        "src-remote": "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/default.min.css",
        "src-local": "lib/highlightJs/highlightJsCss_11.10.0.css",
    },
   "leaflet": {
        "type": "text/javascript",
        "src-remote": "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
        "src-local": "lib/leaflet/leaflet_1.9.4.js" 
    },
    "leafletCss": {
        "type": "text/css",
        "src-remote": "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
        "src-local": "lib/leaflet/leafletCss_1.9.4.css"
    },
    "fontAwesome": {
        "type": "text/css",
        "src-remote": "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
        "src-local": "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css"
    },
    "interactJs": {
        "type": "text/javascript",
        "src-remote": "https://cdn.jsdelivr.net/npm/interactjs/dist/interact.min.js",
        "src-local": "https://cdn.jsdelivr.net/npm/interactjs/dist/interact.min.js"
    },
    "NotoSans": {
        "type": "text/css",
        "src-remote": "https://fonts.bunny.net/css?family=noto-sans:300",
        "src-local": "https://fonts.bunny.net/css?family=noto-sans:300"
    }  
} 

// path to xml directory in base-domain
const xmlFolder = "xml-documents";

// load editor-xml from localStorage
const xmlFromEditor = true;

// devMode (= additional browser logs)
const devMode = false;

// default journal:
const defaultJournal = "AA";

// check urls according to this regex specs:
const urlRegex = /doi|handle|urn|ark:|orcid|ror|dainst|idai.world|wikipedia/g;
const specificUseRegex = "zenon|extrafeatures|supplements";

// favicon:
const faviconLink = document.createElement("link");
faviconLink.type = 'image/png';
faviconLink.rel = 'icon';
faviconLink.href = "src/css/assets/graphics/greif.png";

// systemnotice (jatsinform)
const systemNotice = {
    "html": "This HTML document was created with <em>JatsInForm</em>.",
    "pdf": "This PDF was created with </em>JatsInForm</em."
}
