/* ---------------------
 * Content diagnostics
 * --------------------- */

/**
 * Marks an element whose rendered text reaches the configured length limit.
 *
 * @param {HTMLElement} element content element to inspect
 * @param {number} maximumCharacters configured character limit
 * @returns {void}
 */
export function markOverlongContent(element, maximumCharacters) {
    if (element.innerText.length < maximumCharacters) return;
    element.classList.add("warning-box", "display-data-attributes");
    element.dataset.after = "!Max-Length: " + maximumCharacters + " characters!";
}

/**
 * Marks eligible content links whose targets may not be persistent.
 * Reference links and configured specific-use values are excluded.
 *
 * @param {Document|HTMLElement} container content containing links to inspect
 * @param {RegExp} persistentPattern pattern identifying persistent URLs
 * @param {string|RegExp} excludedUsePattern pattern identifying excluded link purposes
 * @returns {void}
 */
export function markNonPersistentUrls(container, persistentPattern, excludedUsePattern) {
    // select content links eligible for URL diagnostics:
    const anchors = container.querySelectorAll(
        "a:not(.fig-ref,.fn-ref,.bib-ref,.footnote,.heading-ref-a)"
    );

    // ignore excluded link purposes and mark nonpersistent targets:
    anchors.forEach(anchor => {
        const specificUse = anchor.getAttribute("data-specific-use");
        const isExcluded = specificUse !== null &&
            specificUse.search(excludedUsePattern) !== -1;
        if (!isExcluded && anchor.href.search(persistentPattern) === -1) {
            anchor.classList.add("warning-text");
            anchor.title = "This URL might not be persistent!";
        }
    });
}
