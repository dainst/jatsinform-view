// Document content diagnostics
// ----------------------------
// Public APIs: markMaximumLength and markNonPersistentUrls

export function markMaximumLength(element, maximumCharacters) {
    if (element.innerText.length < maximumCharacters) return;
    element.classList.add("warning-box", "display-data-attributes");
    element.dataset.after = "!Max-Length: " + maximumCharacters + " characters!";
}

export function markNonPersistentUrls(container, {
    enabled,
    persistentUrlRegex,
    excludedSpecificUseRegex
}) {
    if (!enabled) return;

    const anchors = container.querySelectorAll(
        "a:not(.fig-ref,.fn-ref,.bib-ref,.footnote,.heading-ref-a)"
    );
    anchors.forEach(anchor => {
        const specificUse = anchor.getAttribute("data-specific-use");
        const isExcluded = specificUse !== null &&
            specificUse.search(excludedSpecificUseRegex) !== -1;
        if (!isExcluded && anchor.href.search(persistentUrlRegex) === -1) {
            anchor.classList.add("warning-text");
            anchor.title = "URL might not be persistent!";
        }
    });
}
