// viewer assets resolve here:
const viewerBaseUrl = new URL("./", document.currentScript.src);

// export dependencies
window.HtmlViewerConfig = Object.freeze({
    dependencies: Object.freeze({
        "highlightJs": {
            "type": "text/javascript",
            "source": new URL("lib/highlightJs/highlightJs_11.10.0.js",viewerBaseUrl).href
        },
        "highlightJsCss": {
            "type": "text/css",
            "source": new URL("lib/highlightJs/highlightJsCss_11.10.0.css",viewerBaseUrl).href
        },
        "leaflet": {
            "type": "text/javascript",
            "source": new URL("lib/leaflet/leaflet_1.9.4.js",viewerBaseUrl).href
        },
        "leafletCss": {
            "type": "text/css",
            "source": new URL("lib/leaflet/leafletCss_1.9.4.css",viewerBaseUrl).href
        },
        "fontAwesome": {
            "type": "text/css",
            "source": "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css"
        },
        "NotoSans": {
            "type": "text/css",
            "source": "https://fonts.bunny.net/css?family=noto-sans:300"
        }
    }),
    panelSearch: Object.freeze({
        "#panel-figures": "figure:not(#poster-image,#journal-logo)",
        "#panel-references": ".reference",
        "#panel-notes": ".footnote"
    })
});
