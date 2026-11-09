/* ---------------------
 * Web-view configuration
 * --------------------- */

// Runtime dependencies supplied by the application entry point.
let webViewContext = null;

/**
 * Stores the application services and content configuration used by the view.
 *
 * @param {Object} context web-view runtime context
 * @returns {void}
 */
function configureWebView(context) {
    webViewContext = Object.freeze({
        applicationContext: context.applicationContext,
        getDocumentStateProperty: context.getDocumentStateProperty,
        checkQualityOfUrls: context.checkQualityOfUrls,
        reportDiagnostic: context.reportDiagnostic,
        linkifyUrls: context.linkifyUrls,
        generateRandomString: context.generateRandomString,
        systemNotice: context.systemNotice,
        defaultTitles: context.defaultTitles,
        contributorsPrepositions: context.contributorsPrepositions
    });
}

/* ---------------------
 * View state and shell
 * --------------------- */

// initialize navigationPanels array:
const navigationPanelsDocument = [];
const navIcons = {
    "cover": "<span class='fa fa-file-text' title='Text/Cover' aria-hidden='true'></span>",
    "contents": "<span class='fa fa-list' title='Table of Contents' aria-hidden='true'></span>",
    "figures": "<span class='fa fa-image' title='Figures' aria-hidden='true'></span>",
    "notes": "<span class='fa fa-list-ol' title='Notes' aria-hidden='true'></span>",
    "references": "<span class='fa fa-book' title='References' aria-hidden='true'></span>",
    "gazetteer": "<span class='fa fa-map' title='Locations' aria-hidden='true'></span>",
    "arachne": "<span class='fa fa-database' title='Objects from iDAI.objects/arachne' aria-hidden='true'></span>",
    "field": "<span class='fa fa-database' title='Objects from iDAI.field' aria-hidden='true'></span>",
    "metadata": "<span class='fa fa-info' title='Metadata' aria-hidden='true'></span>"
}

// navigation element to switch between each panel
const mainHeader = document.createElement("header");
mainHeader.id = "main-header";

// general wrapper:
const main = document.createElement("main");
main.id = "main-wrapper";

// article wrapper:
const article = document.createElement("article");

// wrapper containing the text-content (main-text)
const textContentWrapper = document.createElement("div");
textContentWrapper.id = "text-content-wrapper";
textContentWrapper.classList.add("column");
textContentWrapper.ariaLabel = "Main text panel";
textContentWrapper.role = "region";
textContentWrapper.tabIndex = -1;

// pseudo top element for back-to-top-anchor
const topElement = document.createElement("span");
topElement.id = "top";

// back-to-top-element:
const backToTop = document.createElement("a");
backToTop.id = "back-to-top";
backToTop.href = "#top";
backToTop.ariaLabel = "Back to top";

// wrapper containing side-content (figures, referenceList)
const panelWrapper = document.createElement("div");
panelWrapper.id = "panel-wrapper";
panelWrapper.classList.add("column");
panelWrapper.ariaLabel = "Supplementary panel";
panelWrapper.role = "region";
panelWrapper.tabIndex = -1;

// add search-log:
const searchLog = document.createElement("div");
searchLog.id = "search-log";

/* ---------------------
 * View initialization
 * --------------------- */

/**
 * Builds and activates the complete interactive web-view DOM.
 *
 * @returns {void}
 * @throws {Error} when configuration or converted article content is unavailable
 */
function generateWebView() {
    
    // verify the runtime configuration before rendering:
    if (!webViewContext) {throw new Error("The web view must be configured before rendering");}

    // read the converted article structure:
    const htmlWrapper = document.querySelector("#html-wrapper");
    if (!htmlWrapper) {throw new Error("The converted article wrapper is unavailable");}
    const front = htmlWrapper.querySelector(".front");

    // build the cover and its metadata:
    const coverArea = createCoverArea(htmlWrapper);
    const projectMetaSection = createProjectMetaSection(front);
    coverArea.appendChild(projectMetaSection);

    const abstractSection = createAbstractSection(htmlWrapper);
    coverArea.appendChild(abstractSection);

    const titleDepartmentValue = htmlWrapper.querySelector(
        ".title-department > .meta-value"
    );
    if (titleDepartmentValue) {
        const titleDepartment = document.createElement("span");
        titleDepartment.textContent = titleDepartmentValue.textContent;
        titleDepartment.id = "title-department";
        coverArea.appendChild(titleDepartment);
    }

    // create the primary navigation panels:
    const panelMainText = createPanel("cover", false);
    panelMainText.prepend(createSkipLinks());
    panelMainText.appendChild(coverArea);
    navigationPanelsDocument.push("cover");

    const language = document.documentElement.lang;
    const contentsTitle = webViewContext.defaultTitles["contents"][language];
    const panelContents = createPanel("contents", contentsTitle, false);
    navigationPanelsDocument.push("contents");

    // discover and prepare supplementary references:
    const supplementAnchors = document.querySelectorAll(
        "a.ext-ref:not([data-specific-use='weblink']):not([data-specific-use='zenon']"
    );
    const supplementLinks = extractSupplementsLinks(supplementAnchors)
        .filter(supplementLink => supplementLink.isUnique === true);
    const supplementCounts = countSupplementLinkTargets(supplementLinks);

    // create article-content and supplementary panels:
    createContentPanels(htmlWrapper);
    createSupplementPanels(supplementCounts);

    // load supplementary data without blocking initial rendering:
    fetchExternalData(supplementLinks).catch(error => {
        webViewContext.reportDiagnostic("warning",
            "External data processing stopped unexpectedly", {
            code: "external-data-processing-error",
            cause: error
        });
    });

    // create the metadata panel:
    const metadataPanel = createPanel("metadata", "Metadata", false);
    navigationPanelsDocument.push("metadata");

    if (front !== null) {
        const metadataSection = createMetaSection(front);
        metadataPanel.appendChild(metadataSection);
    }
    panelWrapper.appendChild(metadataPanel);

    // assemble the article and panel containers:
    const articleBody = htmlWrapper.querySelector(".text-body");
    const tableOfContents = createToCByHeadlines(articleBody);

    textContentWrapper.append(articleBody);
    textContentWrapper.insertAdjacentElement("afterbegin", topElement);
    textContentWrapper.insertAdjacentElement("beforeend", backToTop);
    panelContents.appendChild(tableOfContents);

    panelWrapper.appendChild(panelContents);
    panelWrapper.appendChild(panelMainText);
    panelWrapper.appendChild(searchLog);

    article.appendChild(textContentWrapper);
    article.appendChild(appendPanelStateAnchors(navigationPanelsDocument));
    article.appendChild(panelWrapper);
    main.appendChild(article);

    // attach the completed view to the document:
    document.body.appendChild(mainHeader);
    document.body.appendChild(main);
    createPanelNavigation(navigationPanelsDocument);

    const statisticsSection = createDocumentStats(supplementCounts);
    panelContents.appendChild(statisticsSection);
    addDaiHomeLinkToPanelNavigation();
    addLayoutSwitchToDocument();

    // remove the consumed conversion wrapper:
    front?.remove();
    htmlWrapper.querySelector(".back")?.remove();
    htmlWrapper.remove();

    // prepare images and article diagnostics:
    document.querySelectorAll('img:not(.logo-img,.poster-img)').forEach(function(img) {
        img.onerror = function(){this.style.display='none';};
        img.setAttribute("loading", "lazy");
        img.title = "Right-click or press on image for image-specific features";
        scaleImage(img);
    });

    webViewContext.checkQualityOfUrls();
    createIndexOfInternalReferences("figure:not(#journal-logo)", "fig-ref");
    createIndexOfInternalReferences(".reference", "bib-ref");
    addTitleAttributesAsAccessablityHelper();

    // reveal the completed web view:
    document.body.classList.add("fade-in");
}

/* ---------------------
 * Cover and abstracts
 * --------------------- */

/**
 * Creates the article cover with title, contributor, DOI, and journal elements.
 *
 * @param {HTMLElement} htmlWrapper converted article wrapper
 * @returns {HTMLElement} populated cover area
 */
function createCoverArea(htmlWrapper) {

    // create the collapsible cover container:
    const coverArea = document.createElement("div");
    coverArea.id = "cover-area";

    // read the cover metadata and contributor groups:
    const title = htmlWrapper.querySelector(".article-title");
    const subtitle = htmlWrapper.querySelector(".article-subtitle");
    const authors = htmlWrapper.querySelectorAll(
        ".contrib[contrib-type='author']"
    );
    const contributors = htmlWrapper.querySelectorAll(
        ".contrib[contrib-type='co-author']"
    );
    const authorNames = getContributorNames(authors);
    const contributorNames = getContributorNames(contributors);

    // create and populate the textual cover elements:
    const titleElement = document.createElement("h1");
    titleElement.className = "article-title";
    const subtitleElement = document.createElement("p");
    subtitleElement.className = "article-subtitle";
    const authorsElement = document.createElement("p");
    authorsElement.className = "article-authors";
    const contributorsElement = document.createElement("p");
    contributorsElement.className = "article-contributors";

    const language = document.documentElement.lang;
    titleElement.textContent = title ? title.textContent : "[Kein Titel]";
    subtitleElement.textContent = subtitle ? subtitle.textContent : "";
    authorsElement.textContent = authorNames.length
        ? authorNames.join(", ")
        : "[Keine Autoren]";
    if (contributorNames.length && language !== undefined) {
        contributorsElement.textContent =
            webViewContext.contributorsPrepositions[language]
            + " "
            + contributorNames.join(", ");
    }

    // prepare the optional poster image:
    const existingPosterImage = htmlWrapper.querySelector("#poster-image");
    let posterImage;
    if (existingPosterImage) {
        posterImage = existingPosterImage;
        const posterImageAttribution = posterImage.querySelector(".attribution");
        if (posterImageAttribution) {
            posterImageAttribution.classList.add("poster-image-attribution");
        }

        const posterImageElement = posterImage.querySelector("img");
        if (posterImageElement) {
            posterImageElement.classList.add("poster-img");
            posterImageElement.alt = "";
            posterImageElement.role = "presentation";
        }
    } else {
        posterImage = document.createElement("p");
        posterImage.id = "poster-image-missing";
        posterImage.textContent = "[no-poster-image]";
    }

    // create the configured journal logo:
    const logo = document.createElement("figure");
    logo.id = "journal-logo";
    const journalConfig = webViewContext.applicationContext.document?.journalConfig;
    if (journalConfig) {
        const logoPath = journalConfig["logoPath"];
        const logoImg = document.createElement("img");
        logoImg.classList.add("logo-img");
        logoImg.src = logoPath;
        logoImg.alt = "Logo of the journal";
        logo.appendChild(logoImg);
    }

    // assemble the cover in its display order:
    coverArea.append(
        logo,
        posterImage,
        createDoiElement(),
        titleElement,
        subtitleElement,
        authorsElement,
        contributorsElement
    );

    return coverArea;
}

/**
 * Collects the available given name and surname for each contributor.
 *
 * @param {NodeListOf<HTMLElement>} contributors contributor elements
 * @returns {string[]} non-empty contributor names
 */
function getContributorNames(contributors) {

    const contributorNames = Array.from(contributors, contributor => {
        const givenName = contributor.querySelector(".given-names")
            ?.textContent.trim() || "";
        const surname = contributor.querySelector(".surname")
            ?.textContent.trim() || "";
        const nameParts = [givenName, surname].filter(Boolean);

        return nameParts.join(" ");
    }).filter(Boolean);

    return contributorNames;
}

/**
 * Creates the DOI element displayed in the article cover.
 *
 * @returns {HTMLElement} linked DOI or non-linked missing-DOI notice
 */
function createDoiElement() {

    // read the DOI stored as the current document identifier:
    const documentId = webViewContext.getDocumentStateProperty("documentId");
    const hasDoi = documentId && documentId !== "document-without-id";

    // create a link only when a DOI is available:
    const doiElement = document.createElement(hasDoi ? "a" : "span");
    doiElement.id = "doi-anchor";

    if (hasDoi) {
        doiElement.href = getDoiUrl(documentId);
        doiElement.target = "_blank";
        doiElement.rel = "noopener noreferrer";
        doiElement.ariaLabel = "DOI (opens in new tab)";
        doiElement.textContent = documentId;
    } else {
        doiElement.textContent = "[No DOI assigned]";
    }

    // add the decorative DOI icon:
    const doiIcon = document.createElement("img");
    doiIcon.id = "doi-logo-icon";
    doiIcon.classList.add("logo-img");
    doiIcon.src = "src/css/assets/graphics/DOI_logo.svg";
    doiIcon.alt = "";
    doiIcon.ariaHidden = "true";
    doiElement.prepend(doiIcon);

    return doiElement;
}

/**
 * Resolves a DOI value to its HTTP(S) resolver URL.
 *
 * @param {string} doi DOI value or existing resolver URL
 * @returns {string} DOI resolver URL
 */
function getDoiUrl(doi) {
    const normalizedDoi = String(doi || "").trim();
    const doiUrl = /^https?:\/\//i.test(normalizedDoi)
        ? normalizedDoi
        : "https://doi.org/" + normalizedDoi;

    return doiUrl;
}

/**
 * Creates collapsible abstract entries for every available language.
 *
 * @param {HTMLElement} htmlWrapper converted article wrapper
 * @returns {HTMLElement} section containing the available abstracts
 */
function createAbstractSection(htmlWrapper) {

    // collect original and translated abstracts in display order:
    const abstractElements = [
        ...htmlWrapper.querySelectorAll(".abstract"),
        ...htmlWrapper.querySelectorAll(".trans-abstract")
    ];

    // create the shared abstract container:
    const abstractSection = document.createElement("section");
    abstractSection.id = "abstract-section";

    abstractElements.forEach((abstractElement, index) => {
        // resolve only explicitly available language and title metadata:
        const language = abstractElement.getAttribute("lang") || "";
        const sourceTitle = abstractElement.querySelector(".title");
        const configuredTitle = language
            ? webViewContext.defaultTitles.abstract?.[language] || ""
            : "";
        const abstractTitle = sourceTitle?.textContent.trim() || configuredTitle;

        // select the abstract text without changing its content:
        let abstractText = abstractElement.querySelector(".abstract-text");
        if (!abstractText) {
            abstractText = abstractElement.querySelector("p");
        }
        if (!abstractText) {
            abstractText = document.createElement("p");
        }
        abstractText.classList.add("abstract-text");
        if (language) {
            abstractText.lang = language;
        }

        // create a stable disclosure element for the abstract:
        const abstractDetails = document.createElement("details");
        abstractDetails.classList.add("abstract-details");
        abstractDetails.id = `abstract-${index + 1}`;

        const abstractSummary = document.createElement("summary");
        abstractSummary.classList.add("abstract-summary");
        abstractSummary.textContent = abstractTitle;

        abstractDetails.append(abstractSummary, abstractText);
        abstractSection.appendChild(abstractDetails);
    });

    return abstractSection;
}

/* ---------------------
 * Article metadata
 * --------------------- */

/**
 * Creates the combined article, journal, and format metadata section.
 *
 * @param {HTMLElement} front converted front-matter element
 * @returns {HTMLElement} combined metadata section
 */
function createMetaSection(front) {
    // create the combined metadata container:
    const metaSection = document.createElement("section");
    metaSection.id = "meta-section";
    const metaSectionTitle = document.createElement("h2");
    metaSectionTitle.classList.add("title", "panel-title", "main-section-title");
    metaSectionTitle.textContent = "Metadata";

    // create the article and journal metadata sections:
    const articleMeta = front.querySelector(".article-meta");
    const journalMeta = front.querySelector(".journal-meta");
    const articleMetaSection = createArticleMetaSection(articleMeta);
    const journalMetaSection = createJournalMetaSection(journalMeta);

    // create the application-format metadata section:
    const formatMetaSection = document.createElement("section");
    formatMetaSection.id = "format-meta-section";
    const formatMetaTitle = document.createElement("h3");
    formatMetaTitle.classList.add("title", "panel-subsection-title");
    formatMetaTitle.textContent = "About Format";
    const notice = document.createElement("p");
    notice.classList.add("system-notice");
    notice.innerHTML = webViewContext.systemNotice["html"];
    formatMetaSection.append(formatMetaTitle, notice);

    // assemble the metadata areas in their display order:
    metaSection.append(
        metaSectionTitle,
        articleMetaSection,
        journalMetaSection,
        formatMetaSection
    );

    return metaSection;
}

/**
 * Creates the project metadata displayed on the article cover.
 *
 * @param {HTMLElement} front converted front-matter element
 * @returns {HTMLElement} project metadata section
 */
function createProjectMetaSection(front) {
    // create the project metadata container:
    const language = document.documentElement.lang;
    const projectMetaSection = document.createElement("section");
    projectMetaSection.id = "project-meta-section";

    // append each supported project property when present:
    const projectMetaProperties = [
        "cooperations",
        "funding",
        "project-lead",
        "project-team"
    ];
    projectMetaProperties.forEach(propertyName => {
        const selector = `.${propertyName} > .meta-value`;
        const propertyValue = front.querySelector(selector);
        if (!propertyValue) return;

        const metaElement = document.createElement("p");
        metaElement.id = propertyName;
        metaElement.textContent = propertyValue.textContent;

        const configuredTitle =
            webViewContext.defaultTitles[propertyName]?.[language] || "";
        const titleSpan = document.createElement("span");
        titleSpan.classList.add("project-meta-title-span");
        titleSpan.textContent = configuredTitle ? configuredTitle + ": " : "";
        metaElement.prepend(titleSpan);
        projectMetaSection.appendChild(metaElement);
    });

    return projectMetaSection;
}

/**
 * Creates the detailed article metadata section.
 *
 * @param {HTMLElement} articleMeta converted article metadata
 * @returns {HTMLElement} article metadata section
 */
function createArticleMetaSection(articleMeta) {
    // create the article metadata container:
    const articleMetaSection = document.createElement("section");
    articleMetaSection.id = "article-meta-section";
    const articleMetaTitle = document.createElement("h3");
    articleMetaTitle.classList.add("title", "panel-subsection-title");
    articleMetaTitle.textContent = "About Article";
    articleMetaSection.appendChild(articleMetaTitle);

    // append article contributors:
    const articleContributorsDetails = createContributorsDetails(articleMeta, true);
    articleMetaSection.appendChild(articleContributorsDetails);

    // normalize the displayed publication date:
    const date = articleMeta.querySelector(".date");
    const isoDate = date?.getAttribute("iso-8601-date");
    if (isoDate) {
        date.textContent = isoDate;
    }

    // copy the selected basic metadata values:
    const metaElementSelectors =
        ".article-id,.article-title,.article-subtitle,.date,.volume,"
        + ".copyright-statement:not([content-type='print']),"
        + ".license[license-type='text']";
    const metaElements = articleMeta.querySelectorAll(metaElementSelectors);
    metaElements.forEach(element => {
        const metaElement = document.createElement("p");
        metaElement.classList.add("meta-element");
        const metaName = document.createElement("span");
        const metaValue = document.createElement("span");
        metaName.classList.add("meta-name");
        metaValue.classList.add("meta-value");

        metaName.textContent = element.getAttribute("data-meta-title");
        metaValue.innerHTML = element.innerHTML;
        metaElement.append(metaName, metaValue);
        articleMetaSection.appendChild(metaElement);
    });

    // move detailed license statements into the section:
    const licenseStatements = articleMeta.querySelectorAll(".license-p");
    licenseStatements.forEach(element => articleMetaSection.appendChild(element));

    // move remaining custom metadata into the section:
    const customMetaGroup = articleMeta.querySelector(".custom-meta-group");
    if (customMetaGroup) {
        const customMetas = articleMeta.querySelectorAll(
            ".custom-meta:not(.title-department,.title-topic-location,"
            + ".cooperations,.funding,.project-lead,.project-team)"
        );
        if (customMetas.length) {
            const customMetaSection = document.createElement("div");
            customMetaSection.classList.add("custom-meta-section");
            customMetas.forEach(element => customMetaSection.appendChild(element));
            articleMetaSection.appendChild(customMetaSection);
        }
    }

    return articleMetaSection;
}

/**
 * Creates the journal metadata and contributor sections.
 *
 * @param {HTMLElement} journalMeta converted journal metadata
 * @returns {HTMLElement} journal metadata section
 */
function createJournalMetaSection(journalMeta) {
    // create the journal metadata container:
    const journalMetaSection = document.createElement("section");
    journalMetaSection.id = "journal-meta-section";
    const journalMetaTitle = document.createElement("h3");
    journalMetaTitle.classList.add("title", "panel-subsection-title");
    journalMetaTitle.textContent = "About Journal";

    // create the imprint and journal contributor details:
    const imprintSection = createImprintSection(journalMeta);
    const journalContributorsDetails = createContributorsDetails(journalMeta, false);
    journalContributorsDetails.classList.add("journal-contributors");

    journalMetaSection.append(
        journalMetaTitle,
        imprintSection,
        journalContributorsDetails
    );

    return journalMetaSection;
}

/**
 * Creates the journal imprint section.
 *
 * @param {HTMLElement} journalMeta converted journal metadata
 * @returns {HTMLElement} journal imprint section
 */
function createImprintSection(journalMeta) {
    // create the imprint container:
    const imprintSection = document.createElement("section");
    imprintSection.classList.add("imprint-section");

    // prepare the journal title and optional DOI link:
    const journalTitle = journalMeta.querySelector(".journal-title");
    const journalDoi = journalMeta.querySelector(
        ".journal-id[journal-id-type='doi']"
    );
    if (journalTitle) {
        const journalTitleText = journalTitle.textContent;
        const journalDoiValue = journalDoi?.textContent.trim() || "";
        if (journalDoiValue) {
            const journalDoiLink = document.createElement("a");
            journalDoiLink.id = "journal-doi-link";
            journalDoiLink.href = getDoiUrl(journalDoiValue);
            journalDoiLink.textContent = journalTitleText;
            journalTitle.replaceChildren(journalDoiLink);
        } else {
            journalTitle.textContent = journalTitleText;
        }
        imprintSection.appendChild(journalTitle);
    }

    // append the journal publisher when available:
    const publisher = journalMeta.querySelector(".publisher");
    if (publisher) {
        imprintSection.appendChild(publisher);
    }

    // move journal custom metadata and retain its existing visibility rules:
    const customMetaGroup = journalMeta.querySelector(".custom-meta-group");
    if (customMetaGroup) {
        const customMetas = journalMeta.querySelectorAll(".custom-meta");
        if (customMetas.length) {
            const customMetaSection = document.createElement("div");
            customMetaSection.classList.add("custom-meta-section");
            customMetas.forEach(customMeta => {
                const metaName = customMeta.querySelector(".meta-name");
                const propertyName = metaName?.textContent || "";
                const hiddenProperty = /label/.test(propertyName)
                    || /url/.test(propertyName)
                    || /publishing-history/.test(propertyName);
                if (hiddenProperty) {
                    customMeta.style.display = "none";
                }
                customMetaSection.appendChild(customMeta);
            });
            imprintSection.appendChild(customMetaSection);
        }
    }

    return imprintSection;
}

/* ---------------------
 * Contributors
 * --------------------- */

/**
 * Creates contributor listings for an article or journal.
 *
 * @param {HTMLElement} content converted article or journal metadata
 * @param {boolean} isArticle whether article contributor types should be used
 * @returns {HTMLElement} contributor details section
 */
function createContributorsDetails(content, isArticle) {

    // declare the supported article and journal contributor groups:
    let authors;
    let coAuthors;
    let editors;
    let coEditors;
    let advisoryBoardMember;

    // select contributor groups for the current metadata context:
    if (isArticle) {
        authors = content.querySelectorAll(".contrib[contrib-type='author']");
        coAuthors = content.querySelectorAll(".contrib[contrib-type='co-author']");
    } else {
        editors = content.querySelectorAll(".contrib[contrib-type='Editor']");
        coEditors = content.querySelectorAll(".contrib[contrib-type='Co-Editor']");
        advisoryBoardMember = content.querySelectorAll(
            ".contrib[contrib-type='Advisory Board Member']"
        );
    }

    // create the contributor details container:
    const contributorsDetails = document.createElement("section");
    contributorsDetails.classList.add("contributors-section");

    // append each selected contributor group in its display order:
    appendContributorGroup(authors, contributorsDetails);
    appendContributorGroup(coAuthors, contributorsDetails);
    appendContributorGroup(editors, contributorsDetails);
    appendContributorGroup(coEditors, contributorsDetails);
    appendContributorGroup(advisoryBoardMember, contributorsDetails);

    return contributorsDetails;
}

/**
 * Appends one contributor group to a contributor details section.
 *
 * @param {NodeListOf<HTMLElement>|undefined} contributors contributor group
 * @param {HTMLElement} contributorsDetails target contributor section
 * @returns {void}
 */
function appendContributorGroup(contributors, contributorsDetails) {
    if (!contributors?.length) return;

    // use the source role or create an explicit fallback:
    const contributorGroup = contributors[0].parentElement;
    let role = contributorGroup?.querySelector(".role");
    if (!role) {
        role = document.createElement("p");
        role.classList.add("role");
        role.textContent = "[No-contributor-group-role]";
    }
    role.classList.add("meta-details-title");

    // create one card for each contributor in the group:
    const contributorsList = document.createElement("ul");
    contributorsList.classList.add("contributors-list");
    contributors.forEach(contributor => {
        const contributorCard = createContributorsCard(contributor);
        contributorsList.appendChild(contributorCard);
    });

    // append the complete group in its display order:
    contributorsDetails.append(role, contributorsList);
}

/**
 * Creates a contributor card with identity, affiliation, and contact data.
 *
 * @param {HTMLElement} contributor converted contributor element
 * @returns {HTMLElement} contributor card
 */
function createContributorsCard(contributor) {
    // create the contributor card and resolve its display name:
    const contributorCard = document.createElement("li");
    contributorCard.classList.add("contributors-card");
    const preferredFullName = getContributorDisplayName(contributor);

    // create the contributor name and optional identifier link:
    const name = document.createElement("p");
    const contributorId = contributor.querySelector(".contrib-id");
    if (contributorId) {
        const contributorLink = document.createElement("a");
        contributorLink.classList.add("contributor-link");
        contributorLink.target = "_blank";
        contributorLink.rel = "noopener noreferrer";
        contributorLink.href = contributorId.textContent.trim();
        contributorLink.textContent = preferredFullName;

        const orcidIcon = document.createElement("img");
        orcidIcon.classList.add("logo-img", "orcid-icon");
        orcidIcon.src = "src/css/assets/graphics/ORCID.png";
        orcidIcon.alt = "";
        orcidIcon.ariaHidden = "true";

        contributorLink.prepend(orcidIcon);
        name.appendChild(contributorLink);
    } else {
        name.textContent = preferredFullName;
    }
    contributorCard.appendChild(name);

    // create the institution and optional identifier link:
    const institutionSource = contributor.querySelector(".institution");
    if (institutionSource) {
        const institution = document.createElement("p");
        const institutionId = contributor.querySelector(".institution-id");
        if (institutionId) {
            const institutionLink = document.createElement("a");
            institutionLink.classList.add("institution-link");
            institutionLink.target = "_blank";
            institutionLink.rel = "noopener noreferrer";
            institutionLink.href = institutionId.textContent.trim();
            institutionLink.textContent = institutionSource.textContent;

            const rorIcon = document.createElement("img");
            rorIcon.classList.add("logo-img", "ror-icon");
            rorIcon.src = "src/css/assets/graphics/ROR.png";
            rorIcon.alt = "";
            rorIcon.ariaHidden = "true";

            institutionLink.prepend(rorIcon);
            institution.appendChild(institutionLink);
        } else {
            institution.textContent = institutionSource.textContent;
        }
        contributorCard.appendChild(institution);
    }

    // append available contact information:
    const emailSource = contributor.querySelector(".email");
    if (emailSource) {
        const email = document.createElement("address");
        email.textContent = emailSource.textContent;
        contributorCard.appendChild(email);
    }

    return contributorCard;
}

/**
 * Resolves the preferred display name for a contributor.
 *
 * @param {HTMLElement} contributor converted contributor element
 * @returns {string} contributor display name
 */
function getContributorDisplayName(contributor) {
    // prefer an explicitly supplied complete display name:
    const stringName = contributor.querySelector(".string-name");
    if (stringName?.textContent.trim()) {
        return stringName.textContent.trim();
    }

    // require the core structured-name components:
    const givenName = contributor.querySelector(".given-names")
        ?.textContent.trim() || "";
    const surname = contributor.querySelector(".surname")
        ?.textContent.trim() || "";
    if (!givenName || !surname) {
        return "[Prefix] [Given-Names] [Surname] [Suffix]";
    }

    // assemble optional honorific and suffix values around the name:
    const prefix = contributor.querySelector(".prefix")
        ?.textContent.trim() || "";
    const suffix = contributor.querySelector(".suffix")
        ?.textContent.trim() || "";
    const nameParts = [prefix, givenName, surname].filter(Boolean);
    const fullName = nameParts.join(" ");
    const displayName = suffix
        ? fullName + ", " + suffix
        : fullName;

    return displayName;
}

/* ---------------------
 * Content panels
 * --------------------- */

/**
 * Creates the figure, footnote, and reference panels.
 *
 * @param {HTMLElement} htmlWrapper converted article wrapper
 * @returns {void}
 */
function createContentPanels(htmlWrapper) {

    // create panel figures:
    let figureSection = htmlWrapper.querySelector(".figure-section");
    if (figureSection !== null && figureSection.querySelectorAll("figure").length) {
        figureSection = reorderFigureElements(figureSection);
        let panel = createPanel("figures", false, figureSection);
        panelWrapper.appendChild(panel);
        navigationPanelsDocument.push("figures");
    }

    // create panel footnotes:
    let footnoteSection = htmlWrapper.querySelectorAll(".footnotes-section")[0];
    if(footnoteSection) {
        let fnList = document.createElement("ol");
        fnList.classList.add("fn-list");

        let footnotes = footnoteSection.querySelectorAll(".footnote");
        footnotes.forEach(footnote => {
            footnote.setAttribute("tabIndex", "-1"); // add for better keyboard focus
            // enhance footnote:
            addBackLinkAnchorToFootnote(footnote);
            let bibRefs = footnote.querySelectorAll("a.bib-ref");
            titleOfResourcesAsToolTip(bibRefs);
            // append fn to fn-list:
            fnList.appendChild(footnote)
        });
        footnoteSection.appendChild(fnList);
        
        // create panel:
        let panel = createPanel("notes", "Footnotes", footnoteSection);
        panelWrapper.appendChild(panel);
        navigationPanelsDocument.push("notes");
    }

    // create panel references:
    let referenceSection = htmlWrapper.querySelectorAll(".reference-section")[0];
    if(referenceSection) {
        let refList = document.createElement("ul");
        refList.classList.add("ref-list");
        let references = referenceSection.querySelectorAll(".reference");
        references.forEach(reference => {
            // extract zenon-Links out of reference:
            let zenonReference;
            let zenonLink;
            let citation = reference.querySelector(".mixed-citation");
            if(citation !== null) {
                zenonReference = citation.querySelector("a[data-specific-use='zenon']");
                zenonLink = createZenonLink(zenonReference);
                // urlify url-strings in references:
                citation.replaceChildren(webViewContext.linkifyUrls(citation.innerText));
                // re-append zenon-links at the end of reference:
                if(zenonLink) {citation.appendChild(zenonLink);}
            }
            refList.appendChild(reference);
        });
        // add references to ol:
        referenceSection.appendChild(refList);

        // create panel:
        let panel = createPanel("references", "References", referenceSection);
        panelWrapper.appendChild(panel);
        navigationPanelsDocument.push("references");
    }
}

/**
 * Creates a separate Zenon link when the citation provides one.
 *
 * @param {HTMLAnchorElement|null} zenonReference extracted Zenon reference
 * @returns {HTMLAnchorElement|false} separate Zenon link when available
 */
function createZenonLink(zenonReference) {
    
    let zenonLink;
    if(zenonReference !== null) {
        zenonLink = document.createElement("a");
        zenonLink.classList.add("zenon-link");
        zenonLink.target = "_blank";
        zenonLink.href = zenonReference.href;
        zenonLink.textContent = "iDAI.bibligraphy/Zenon";
    }
    else {zenonLink = false;}
    return(zenonLink);
}

/**
 * Creates panels for referenced iDAI.world resources.
 *
 * @param {Object<string, number>} numSupplements reference counts by service
 * @returns {void}
 */
function createSupplementPanels(numSupplements) {

    // create panel for gazetteer locations:
    if(numSupplements["gazetteer"]) {
        let panel = createPanel("gazetteer", "Locations", false);
        appendFetchStateBarToPanel(panel, "gazetteer");

        // prepare list element:
        let externalObjectList = document.createElement("ul");
        externalObjectList.id = "gazetteer-list";
        panel.appendChild(externalObjectList);

        panelWrapper.appendChild(panel);
        navigationPanelsDocument.push("gazetteer");
    }

    // create panel for field objects::
    if(numSupplements["field"]) {
        let panel = createPanel("field", "Objects from iDAI.field", false);
        appendFetchStateBarToPanel(panel, "field");

        // prepare list element:
        let externalObjectList = document.createElement("ul");
        externalObjectList.id = "field-list";
        panel.appendChild(externalObjectList);

        panelWrapper.appendChild(panel);
        navigationPanelsDocument.push("field");
    } 

    // create panel for arachne objects::
    if(numSupplements["arachne"]) {
        let panel = createPanel("arachne", "Objects from iDAI.objects/arachne", false);
        appendFetchStateBarToPanel(panel, "arachne");

        // prepare list element:
        let externalObjectList = document.createElement("ul");
        externalObjectList.id = "arachne-list";
        panel.appendChild(externalObjectList);

        panelWrapper.appendChild(panel);
        navigationPanelsDocument.push("arachne");
    }
}

/**
 * Creates a content panel with an optional title and content element.
 *
 * @param {string} panelName panel identifier
 * @param {string|false} [defaultTitle=false] fallback panel title
 * @param {HTMLElement|false} [content=false] panel content
 * @returns {HTMLElement} configured panel element
 */
function createPanel(panelName, defaultTitle = false, content = false) {

    // create panel element:
    let panel = document.createElement("aside");
    panel.classList.add("panel", "resource-view");
    panel.id = panelName;
    panel.role = "region";
    panel.tabIndex = -1;
    panel.setAttribute("aria-labelledby", "panel-" + panelName);
  
    // add panel content:
    if(content) {panel.appendChild(content);}

    // no panel title for metadata and cover:
    if(panelName === "metadata" || panelName === "cover" ) {
       return(panel);
    }

    // add panel title:
    let title = document.createElement("h3");
    title.classList.add("title", "panel-title", "section-title");
    title.id = "panel-title-" + panelName;
    let givenTitle = panel.querySelector(".title");
    if(givenTitle !== null) {
        title.textContent = givenTitle.textContent;
        givenTitle.remove();
    } else {
        title.textContent = (defaultTitle) ? defaultTitle : "[No title]";
    }
    panel.insertAdjacentElement("afterbegin", title);

    return(panel);
}

/**
 * Creates a summary of article content and supplementary-reference counts.
 *
 * @param {Object<string, number>} numSupplements reference counts by service
 * @returns {HTMLElement} document statistics section
 */
function createDocumentStats(numSupplements) {

    // create section elements:
    let statsSection  = document.createElement("section");
    statsSection .id = "stats-section";

    let statsSectionTitle = document.createElement("h3");
    statsSectionTitle.classList.add("title", "panel-subsection-title");
    statsSectionTitle.textContent = "Document Statistics";
    statsSection.appendChild(statsSectionTitle);

    // get elements to be counted:
    let paragraphs = document.querySelectorAll(".content-paragraph");
    let sections = document.querySelectorAll(".text-body > section");
    let figures = document.querySelectorAll("figure");
    let notes = document.querySelectorAll(".footnote");
    let references = document.querySelectorAll(".reference");

    // count chars of all paragraphs (without whitespace):
    let paragraphAllChars = 0;
    paragraphs.forEach(function(paragraph) {
        paragraphAllChars += paragraph.innerText.trim().length;
    });

    // count chars of all footnotes (without whitespace):
    let footnoteAllChars = 0;
    notes.forEach(function(note) {
        footnoteAllChars += note.innerText.trim().length;
    });

    // count weblinks (exluding links in ref-list and supplementary References):
    let otherWebReferences = document.querySelectorAll("a.ext-ref[data-specific-use='weblink']");

    // add result as table data to infos panel::
    let statsTable = document.createElement("table");
    statsTable.classList.add("stats-table");
    let tableData =
        "<tr><td>Sections:</td><td class='value'>" + sections.length + "</td></tr>" +
        "<tr><td>Paragraphs:</td><td class='value'>" + paragraphs.length + "</td></tr>" +
        "<tr><td>- Characters (with whitespace)</td><td class='value'>" + paragraphAllChars + "</td></tr>" +
        "<tr><td>Foot-/Endnotes:</td><td class='value'>" + notes.length + "</td></tr>" +
        "<tr><td>- Characters (with whitespace)</td><td class='value'>" + footnoteAllChars + "</td></tr>" +
        "<tr><td>Figures:</td><td class='value'>" + figures.length + "</td></tr>" +
        "<tr><td>Bibliographical References:</td><td class='value'>" + references.length + "</td></tr>" +
        "<tr><td>Supplementary References:</td><td class='value'></td></tr>" +
        "<tr><td>- iDAI.gazetteer (Locations):</td><td class='value'>" + numSupplements["gazetteer"] + "</td></tr>" +
        "<tr><td>- iDAI.objects/arachne:</td><td class='value'>" + numSupplements["arachne"] + "</td></tr>" +
        "<tr><td>- iDAI.field:</td><td class='value'>" + numSupplements["field"] + "</td></tr>" +
        "<tr><td>Other Web References:</td><td class='value'>" + otherWebReferences.length + "</td></tr>"
    statsTable.innerHTML = tableData;

    // append table to statsSection:
    statsSection.appendChild(statsTable);

    return(statsSection);
}

/* ---------------------
 * Reference indexing
 * --------------------- */

/**
 * Appends reference-context indexes to target elements.
 *
 * @param {string} elementSelector selector for indexed target elements
 * @param {string} referenceSelector class name of the referencing anchors
 * @returns {void}
 */

function createIndexOfInternalReferences(elementSelector, referenceSelector) {
       
    // get element and referenceIndex by given selectors:
    let elements = document.querySelectorAll(elementSelector);
    let elementsRefIndex = getReferenceIndex(elements, referenceSelector);

    // process each target element:
    elements.forEach(function(element) {
        if(element.id !== null && element.id !== "poster-image") {
            let refIndex = elementsRefIndex[element.id];

            // create details element for displaying results:
            let internalIndexBox = document.createElement("details");
            internalIndexBox.classList.add("internal-index-box");
            internalIndexBox.ariaLabel = "All objects quoted in main text or footnote";
           
            // create summary as button title:
            let internalIndexSummary = document.createElement("summary");
            internalIndexSummary.classList.add("internal-index-summary");
            internalIndexSummary.textContent = "Found in text (" + refIndex.totalNumber + ")";  
            internalIndexBox.appendChild(internalIndexSummary);        
     
            // parse and list positive results in form of quotes:
            if(refIndex.totalNumber !== 0) {
                let list = document.createElement("ul");
                list.ariaLabel = "List of internal references"
                for (let i = 0; i < refIndex.refLinks.length; ++i) {

                    // create elements:
                    let listElement = document.createElement("li");
                    listElement.classList.add("quote-list-entry");
                    listElement.ariaLabel = "Single quote entry"
                    let labelAnchor = document.createElement("a");
                    labelAnchor.classList.add("index-ref");
                    labelAnchor.href = "#" + refIndex.refLinks[i];

                    // define targetPanelName for back-anchor:
                    if(refIndex.quotesTargetSection[i] === "main-text") {
                        labelAnchor.setAttribute("data-target-section", "contents");
                        labelAnchor.title = "Jump to " + refIndex.refLinks[i] + " in main text";
                    } else {
                        labelAnchor.setAttribute("data-target-section", "notes");
                        labelAnchor.title = "Jump to " + refIndex.refLinks[i] + " in footnote section";
                    }
                   
                    let visibleSpan = document.createElement("span");
                    visibleSpan.ariaHidden = true;
                    labelAnchor.appendChild(visibleSpan);

                    let hiddenSpan = document.createElement("span");
                    hiddenSpan.classList.add("screenreader-only");
                    hiddenSpan.textContent = "Jump to " + refIndex.refLinks[i];
                    labelAnchor.appendChild(hiddenSpan);
                    
                    // add clipped text passage from quote:
                    let textQuote = document.createElement("span");
                    textQuote.classList.add("text-quote");
                    textQuote.textContent = "..." + refIndex.quotes[i] + "...";
                    
                    // replace .innerHTML with .textContent to avoid id-collisions:
                    textQuote.innerHTML = textQuote.textContent; 

                    // append list elements:
                    listElement.appendChild(labelAnchor);
                    listElement.appendChild(textQuote);
                    list.appendChild(listElement);
                }
                internalIndexBox.appendChild(list);
            // highlight negative results (to be avoided by editorial policy):
            } else {
                internalIndexSummary.classList.add("warning-box");
            } 
            element.appendChild(internalIndexBox);
         
        }
    });   
}

/**
 * Collects reference links and surrounding text for target elements.
 *
 * @param {NodeListOf<HTMLElement>} elements indexed target elements
 * @param {string} referenceSelector class name of the referencing anchors
 * @returns {Object} reference information keyed by target ID
 */
function getReferenceIndex(elements, referenceSelector) {

    let referenceIndex = {};
    elements.forEach(function(element) {
        // exclude elements with missing ids and poster-image:
        if(element.id !== null && element.id !== "poster-image") {
            // prepare objects:
            let refLinks = [];
            let quotes = [];
            let quotesTargetSection = [];

            // define selector of anchor for given type, e.g. fig-ref:
            let refSelector = "a." + referenceSelector + "[href='#" + element.id + "']";

            // query referenceElements:
            let referenceElements = document.querySelectorAll(refSelector);

            // filter out elements in text-quote-span (containing copies of the original elements):
            referenceElements = Array.from(referenceElements)
                .filter(el => !el.parentElement.classList.contains("text-quote"))

            // process referenceElements:
            if(referenceElements.length) {
                // get links and quotes from closest parent:
                referenceElements.forEach(refElement => {
                    let closestParent = refElement.parentElement || refElement.closest("p");
                    if(closestParent  !== null) {
                        // extract quote from parent element and push to array:
                        let quote = getContextSnippet(refElement, closestParent, 100);
                        quotes.push(quote);
                        // detect parent target section (main-text or footnote):
                        if(/fn-/.test(closestParent.id)) {
                            quotesTargetSection.push("footnote");
                        } else {
                            quotesTargetSection.push("main-text");
                        } 
                    }
                    // push ref-links (anchors):
                    refLinks.push(refElement.id);
                });
            }
            // collect all values as reference stats:
            let referenceStats = {
                "totalNumber": referenceElements.length,
                "refLinks": refLinks,
                "quotes": quotes,
                "quotesTargetSection": quotesTargetSection
            };
            // add reference stats of each element:
            referenceIndex[element.id] = referenceStats;

        }
    });
    return(referenceIndex);
}

/**
 * Extracts a text passage surrounding an internal reference anchor.
 *
 * @param {HTMLAnchorElement} anchor reference anchor
 * @param {HTMLElement} parent text container containing the anchor
 * @param {number} [radius=50] context characters included on each side
 * @returns {string} contextualized reference text
 */
function getContextSnippet(anchor, parent, radius = 50) {
    if (!anchor || !parent) return "";

    if (anchor.tagName.toLowerCase() !== "a") return "";

    let anchorClass = anchor.className;
    if (!anchorClass) return "";

    if (!anchor.matches("a." + anchorClass.split(" ").join("."))) return "";

    if (!parent.contains(anchor)) return "";

    let anchorText = anchor.textContent;

    let rangeBefore = document.createRange();
    rangeBefore.setStart(parent, 0);
    rangeBefore.setEndBefore(anchor);
    let textBefore = rangeBefore.toString();

    let fullText = parent.textContent;

    let index = textBefore.length;

    let start = Math.max(0, index - radius);
    let end = Math.min(fullText.length, index + anchorText.length + radius);

    let snippet = fullText.slice(start, end).trim();

    if (start > 0) snippet = "…" + snippet;
    if (end < fullText.length) snippet = snippet + "…";

    return snippet.replace(anchorText, `<mark>${anchorText}</mark>`);
}

/* ---------------------
 * Panel navigation
 * --------------------- */

/**
 * Creates the table of contents from converted section headings.
 *
 * @param {HTMLElement} htmlWrapper converted article wrapper
 * @returns {HTMLElement} table-of-contents navigation
 */
function createToCByHeadlines(htmlWrapper) {

    let lang = document.documentElement.lang;
    let nav = document.createElement("nav");
    nav.ariaLabel = webViewContext.defaultTitles["contents"][lang];
    let tocList = document.createElement("ul");
    tocList.id = "toc-list";

    let headlines = htmlWrapper.querySelectorAll(".title");
    if (headlines !== null && headlines.length > 0) {
        for (let i = 0; i < headlines.length; ++i) {
            // get level in hierarchy:
            let level = headlines[i].getAttribute("level");
            let levelClass = "level-" + level; 

            // create tocList items and anchors:
            let tocListItem = document.createElement("li");
            tocListItem.classList.add("heading-ref", levelClass);
            let tocEntry = document.createElement("a");
            tocEntry.setAttribute("data-target-section", "contents");
            tocEntry.classList.add("heading-ref-a");
            tocEntry.ariaCurrent = "false";

            // define ids and inline hrefs:
            let titleId = "title-" + i;
            let tocId = "toc-" + i;
            headlines[i].id = titleId;
            tocEntry.id = tocId;
            headlines[i].setAttribute("href", "#" + tocId);
            tocEntry.setAttribute("href", "#" + titleId);
            
            // append content and children:
            tocEntry.innerHTML = headlines[i].innerHTML;
            tocListItem.appendChild(tocEntry);
            tocList.appendChild(tocListItem);    
        }
        // add tocList to generic nav element:
        nav.appendChild(tocList);
    }
    return(nav);
}

/**
 * Creates navigation controls for the available content panels.
 *
 * @param {string[]} navigationPanelsDocument available panel identifiers
 * @returns {void}
 */

function createPanelNavigation(navigationPanelsDocument) {

    // create panelNavigation and panelNavigationList:
    let panelNavigation = document.createElement("nav");
    panelNavigation.id = "panel-navigation";
    panelNavigation.classList.add("panel-navigation");
    panelNavigation.ariaLabel = "Panel navigation";

    let panelNavigationHint = document.createElement("span");
    panelNavigationHint.id = "panel-navigation-hint";
    panelNavigationHint.classList.add("screenreader-only");
    panelNavigationHint.textContent = "Activates the selected article or supplementary content view.";
    panelNavigation.appendChild(panelNavigationHint);

    let panelNavigationList = document.createElement("ul");
    panelNavigationList.classList.add("navigation", "list");
    panelNavigationList.ariaLabel = "navigation list";

    // create elements for each panel name:
    if(navigationPanelsDocument.length > 0) {
        navigationPanelsDocument.forEach((panelName) => { 
            // list elements:
            let li = document.createElement("li");
            li.classList.add("nav-" + panelName);
            li.ariaLabel = "navigation list element";

            // anchor links:
            let anchor = document.createElement("a");
            anchor.classList.add("panel-buttons");
            anchor.id = "b-" + panelName;
            anchor.innerHTML = navIcons[panelName];

            // add web-accessability features:
            let humanReadablePanelName = panelName.replace(/-/g, " ");
            anchor.ariaLabel = "Open " + humanReadablePanelName + " panel";
            anchor.setAttribute("aria-controls", panelName);
            anchor.setAttribute("aria-describedby", "panel-navigation-hint");
            anchor.setAttribute("aria-current", "false");
            anchor.href = "#panel-" + panelName;

            // append elements:
            li.appendChild(anchor);
            panelNavigationList.appendChild(li);
        });
    }
    // append panelNavigation to navHeader:
    panelNavigation.appendChild(panelNavigationList);
    mainHeader.appendChild(panelNavigation);
}

/**
 * Creates state anchors used by CSS-based panel navigation.
 *
 * @param {string[]} panelNames available panel identifiers
 * @returns {DocumentFragment} hidden panel-state anchors
 */
function appendPanelStateAnchors(panelNames) {

    // create document fragment for state-anchor elements:
    let anchorElements = document.createDocumentFragment();

    // create one state-anchor for each panel-name:
    if(panelNames && panelNames.length > 0) {
        panelNames.forEach(panelName => {
            let stateAnchor = document.createElement("span");
            stateAnchor.id = "panel-" + panelName;
            stateAnchor.classList.add("screenreader-only");
            stateAnchor.ariaLabel = "Open " + panelName.replace(/-/g, " ") + " panel";
            stateAnchor.ariaHidden = true;
            stateAnchor.textContent = "Open " + panelName.replace(/-/g, " ") + " panel";
            anchorElements.appendChild(stateAnchor);
        });
    }
    return(anchorElements);
}

/* ---------------------
 * Figure presentation
 * --------------------- */

/**
 * Prepares figures for panel presentation and search.
 *
 * @param {HTMLElement} figureSection section containing article figures
 * @returns {HTMLElement} prepared figure section
 */

function reorderFigureElements(figureSection) {

    let figures = figureSection.querySelectorAll("figure");
    if(figures.length) {
        let figureList = document.createElement("ol");
        figureList.classList.add("figure-list");
        figures.forEach(figure => {
            let img = figure.querySelector("img");
            let altText = figure.querySelector(".alt-text");
            let label = figure.querySelector(".label");
            let figCaption = figure.querySelector("figcaption");
            let attribution = figure.querySelector(".attribution");
            let license = figure.querySelector(".license");
            let licensePara = figure.querySelector(".license-p");
            let licenseUrl = figure.querySelector(".license-url");
         
            // add altText to image and add alt-text to search haystack:
            let searchHaystack = "show-all#";
            if(img !== null && altText !== null) {
                img.alt = altText.textContent;
                searchHaystack += " " + altText.textContent.toLowerCase() + " ";
            }

            // add figCaption text to search haystack:
            if(img !== null && figCaption.querySelector("p") !== null) {
                searchHaystack += figCaption.querySelector("p").textContent.toLowerCase();
            }

            // set data-search-haystack attribute:
            figure.setAttribute("data-search-haystack", searchHaystack);

            // reorder image meta elements:
            if(figCaption !== null) {
                if(label !== null) {
                    figCaption.insertAdjacentElement("afterbegin", label);
                }
                if(attribution !== null) {
                    figCaption.insertAdjacentElement("beforeend", attribution);
                } 
                if(licensePara !== null) {
                    figCaption.insertAdjacentElement("beforeend", licensePara);
                    license.remove();
                }  
                if(licenseUrl !== null) {
                    figCaption.insertAdjacentElement("beforeend", licenseUrl);
                } 
            }

            // use list elements to structure figure listing:
            let figListElement = document.createElement("li");
            figListElement.classList.add("figure-list-element");
            figListElement.appendChild(figure);
            figureList.appendChild(figListElement);
        });
        figureSection.appendChild(figureList)
    }
    return(figureSection);
}

/* ---------------------
 * Supplementary references
 * --------------------- */

/**
 * Appends a fetch-status display to an external-resource panel.
 *
 * @param {HTMLElement} panel div with panel title and content
 * @param {string} dataSourceId external service identifier
 * @returns {void}
 */

function appendFetchStateBarToPanel(panel, dataSourceId) {
    let fetchStateBar = document.createElement("div");
    fetchStateBar.id = "fetch-state-" + dataSourceId;
    fetchStateBar.classList.add("warning-box", "fetch-state");
    panel.appendChild(fetchStateBar); 
}

/**
 * Extracts and classifies supported supplementary-resource links.
 *
 * @param {NodeListOf<HTMLAnchorElement>} anchors supplementary links
 * @returns {Object[]} classified supplementary references
 */
function extractSupplementsLinks(anchors) {

    let selfHost= window.location.host;
    let supplementsLinks = [];
    let uniques = [];
        
    // parse anchors:
    let targetPrefix; 
    for (let i = 0; i < anchors.length; ++i) {
        // exclude empty and internal links:
        if(anchors[i].href !== "" && anchors[i].host !== selfHost) {
            
            // define unique id of referencing anchor:
            let refAnchorId =  "xref-object-" + webViewContext.generateRandomString(4) + i;
            anchors[i].id = refAnchorId;

            // parse url:
            let url = new URL(anchors[i].href);
            let apiRefUrl = getApiRefUrl(url);
            
            if(apiRefUrl.apiUrl) {

                // define target-prefix by apiSource::
                if(/gazetteer/.test(apiRefUrl.apiSource)) {
                    targetPrefix = "gazetteer";
                }
                if(/arachne/.test(apiRefUrl.apiSource)) {
                    targetPrefix = "arachne";
                }
                if(/field/.test(apiRefUrl.apiSource)) {
                    targetPrefix = "field";
                }
               
                // detect uniques apiUrls:
                let isUnique;
                if(!uniques.includes(apiRefUrl.apiUrl)) {
                    isUnique = true;
                    uniques.push(apiRefUrl.apiUrl);
                } else {
                    isUnique = false;
                }

                // define url properties:
                let urlProperties = {
                    'url': url,
                    'apiUrl': apiRefUrl.apiUrl,
                    'apiSource': apiRefUrl.apiSource,
                    'refAnchorId': refAnchorId,
                    "refText": anchors[i].textContent,
                    "targetPrefix": targetPrefix,
                    "isUnique": isUnique,
                    "anchor": anchors[i]
                };
                // collect supplement links:
                supplementsLinks.push(urlProperties);

                // redefine targets of duplicate supplement links anchors:
                supplementsLinks = redefineTargetsOfSupplementLinkAnchors(supplementsLinks);
            }
        }
    }
    return(supplementsLinks);
}

/**
 * Points duplicate supplementary links to their shared rendered target.
 *
 * @param {Object[]} supplementsLinks classified supplementary references
 * @returns {Object[]} references with updated anchors
 */
function redefineTargetsOfSupplementLinkAnchors(supplementLinks) {

    // iterate through supplementLinks:
    supplementLinks.forEach(supplementLink => {     
        let anchor = supplementLink["anchor"];
        let refAnchorId = supplementLink["refAnchorId"];
        let targetPrefix = supplementLink["targetPrefix"];
        let isUnique = supplementLink["isUnique"]; 
        let apiUrl = supplementLink["apiUrl"];

        // find duplicate anchors and point to unique url:
        if(!isUnique) {
            for (const [key, value] of Object.entries(supplementLinks)) {
                if (value.isUnique === true && value.apiUrl === apiUrl) {
                    refAnchorId = value.refAnchorId; // unique anchor
                }
            };
        };
        
        // set #target as href-attribute to anchors:
        anchor.href = "#target-" + targetPrefix + "-" + refAnchorId;
        
        // set target-prefix as data-target-section attribute:
        anchor.setAttribute("data-target-section", targetPrefix);
    });
    return(supplementLinks);
}


/**
 * Counts supplementary references by external service.
 *
 * @param {Object[]} supplementsLinks classified supplementary references
 * @returns {Object<string, number>} reference counts by service
 */
function countSupplementLinkTargets(supplementsLinks) {

    // init object:
    let numSupplements = {
        "arachne": 0,
        "gazetteer": 0,
        "field": 0,
    }
    // count each supplement link:
    supplementsLinks.forEach(supplementLink => {
        if(/gazetteer/.test(supplementLink.apiSource)) {
            numSupplements["gazetteer"] = numSupplements["gazetteer"] + 1;
        }
        if(/arachne/.test(supplementLink.apiSource)) {
            numSupplements["arachne"] = numSupplements["arachne"] + 1;
        }
        if(/field/.test(supplementLink.apiSource)) {
            numSupplements["field"] = numSupplements["field"] + 1;
        }
    });

    return(numSupplements);
}

/**
 * Resolves a public supplementary-resource URL to its service API endpoint.
 *
 * @param {URL} url supplementary-resource URL
 * @returns {Object} API URL and source identifier
 */
function getApiRefUrl(url) {

    let apiRefUrl = {};
    if(url.protocol !== "https") {url.protocol = "https";}

    let objectId;
    switch (true) {
        case (/arachne.dainst.org/.test(url.hostname)):
            apiRefUrl.apiUrl = url.origin + "/data" + url.pathname;
            apiRefUrl.apiSource = "arachne";
            break;
        case (/gazetteer.dainst.org/.test(url.hostname)):
            objectId = url.pathname.split("/")[2];
            if(objectId !== undefined) {
                apiRefUrl.apiUrl = "https://gazetteer.dainst.org/doc/" + objectId; https://gazetteer.dainst.org/doc/search?limit=1types:"archaeological-site"
                apiRefUrl.apiSource = "gazetteer";
            }
            break;
        case (/field.idai.world/.test(url.hostname)):
            objectId = url.pathname.split("/")[3];
            if(objectId !== undefined) {
                apiRefUrl.apiUrl = "https://field.idai.world/api/documents/" + objectId;
                apiRefUrl.apiSource = "field";
            }
            break;
        default:
            apiRefUrl.apiUrl = false;
            apiRefUrl.apiSource = false;
            break;
    }
    return(apiRefUrl);
}

/* ---------------------
 * External data requests
 * --------------------- */

/**
 * Fetches external metadata and adds each result to its reference object.
 *
 * @param {Object[]} supplementsLinks classified supplementary references
 * @returns {Promise<void>}
 */
async function fetchExternalData(supplementsLinks) {

    // fetch external data:
    for (let i = 0; i < supplementsLinks.length; ++i) {
        let apiRefUrl = supplementsLinks[i]["apiUrl"];

        try {
            let response = await fetch(apiRefUrl, {
                headers:{
                    accept: 'application/json'
                }
            });

            if(!response.ok) {
                throw new Error("External service responded with HTTP " + response.status);
            }

            let result = await response.json();

            // check results:
            if(result["code"] === 400 || result["code"] === 300) {
                throw new Error(result["message"] || "External service returned an error");
            }

            supplementsLinks[i]["result"] = result;
            supplementsLinks[i]["error"] = false;

            // display fetch progress state in fetch-state-bar:
            let querySelector = "#fetch-state-" + supplementsLinks[i]["apiSource"];
            let fetchState = "Fetching data from: " + apiRefUrl;
            let fetchStateElement = document.querySelector(querySelector);
            if(fetchStateElement) {
                fetchStateElement.innerText = fetchState;
            }
        }
        catch(error) {
            supplementsLinks[i]["result"] = false;
            supplementsLinks[i]["error"] = error;
            reportExternalDataFailure(
                supplementsLinks[i],
                "External metadata could not be loaded",
                error
            );
        }
    }

    // render external data:
    renderExternalData(supplementsLinks);
}

/**
 * Parses and displays fetched supplementary-resource data.
 *
 * @param {Object[]} supplementsLinks references with fetched results
 * @returns {void}
 */
function renderExternalData(supplementsLinks) {

    // process each supplement link:
    for (let i = 0; i < supplementsLinks.length; ++i) {
        let values = {};
        values["refText"] = (supplementsLinks[i]["refText"] || "").trim();
        values["refAnchorId"] = supplementsLinks[i]["refAnchorId"];
        values["apiUrl"] = supplementsLinks[i]["apiUrl"];
        values["url"] = supplementsLinks[i]["url"];
 
        // check result:
        let result = supplementsLinks[i]["result"];
        values["hasResult"] = (result) ? true : false;

        if(values["hasResult"]) {
            try {
                values["parsed"] = parseExternalData(
                    supplementsLinks[i]["apiSource"],
                    result
                );
            }
            catch(error) {
                values["hasResult"] = false;
                values["parsed"] = false;
                reportExternalDataFailure(
                    supplementsLinks[i],
                    "External data could not be processed",
                    error
                );
            }
        }

        try {
            displayExternalData(supplementsLinks[i]["apiSource"], values);
        }
        catch(error) {
            reportExternalDataFailure(
                supplementsLinks[i],
                "External data could not be displayed",
                error
            );
        }
    }

    // create index of supplement references:
    createIndexOfInternalReferences(".object-visualization", "ext-ref");
}

/**
 * Parses fetched data using its source-specific mapper.
 *
 * @param {string} source external service identifier
 * @param {Object} result fetched service response
 * @returns {Object} parsed external data
 */
function parseExternalData(source, result) {

    switch (source) {
        case "gazetteer":
            return parseGazetteerData(result);
        case "arachne":
            return parseArachneData(result);
        case "field":
            return parseFieldData(result);
        default:
            throw new Error("Unsupported external data source: " + source);
    }
}

/**
 * Delegates parsed data to its source-specific presentation function.
 *
 * @param {string} source external service identifier
 * @param {Object} values parsed data and reference context
 * @returns {void} external data is added to the document
 */
function displayExternalData(source, values) {

    switch (source) {
        case "gazetteer":
            displayGazetteerData(values);
            break;
        case "arachne":
            displayArachneData(values);
            break;
        case "field":
            displayFieldData(values);
            break;
    }
}

/**
 * Reports a structured external-data warning to application diagnostics.
 *
 * @param {Object} supplementLink external reference context
 * @param {string} message diagnostic message
 * @param {Error} error original error
 * @returns {void}
 */
function reportExternalDataFailure(supplementLink, message, error) {

    webViewContext.reportDiagnostic("warning", message, {
        code: "external-data-error",
        service: supplementLink["apiSource"],
        url: supplementLink["apiUrl"],
        refText: supplementLink["refText"],
        refAnchorId: supplementLink["refAnchorId"],
        cause: error
    });
}

/* ---------------------
 * External data mapping
 * --------------------- */

/**
 * Maps an iDAI.gazetteer response to the view's location data.
 *
 * @param {Object} data Gazetteer service response
 * @returns {Object} mapped location data
 */
function parseGazetteerData(data) {

    return {
        "provenance": (data.provenance !== undefined) ? data.provenance: false,
        "location": (data.prefLocation !== undefined) ? data.prefLocation: false,
        "prefName": (data.prefName !== undefined) ? data.prefName: false,
        "gazId":  (data.gazId !== undefined) ? data.gazId: false,
        "url": (data["@id"] !== undefined) ? data["@id"] : false
    };
}

/**
 * Maps an iDAI.objects response to the view's object data.
 *
 * @param {Object} data Arachne service response
 * @returns {Object} mapped object data
 */
function parseArachneData(data) {

    return {
        "type": (data.type !== undefined) ? data.type : false,
        "title": (data.title !== undefined) ? data.title : false,
        "subtitle": (data.subtitle !== undefined) ? data.subtitle : false,
        "images": ( data.images !== undefined) ? data.images : false,
        "url": (data["@id"] !== undefined) ? data["@id"] : false
    };
}

/**
 * Maps an iDAI.field response to the view's field-object data.
 *
 * @param {Object} data Field service response
 * @returns {Object} mapped field-object data
 */
function parseFieldData(data) {

    // parse descriptionObject (has language key):
    let shortDescription = (data.resource.shortDescription !== undefined) ? data.resource.shortDescription : false;
    if(shortDescription[Object.keys(shortDescription)[0]] !== undefined) {
        shortDescription = shortDescription[Object.keys(shortDescription)[0]];
    }
    let group = data.resource.groups.find(group => group.fields.map(field => field.name).includes('isDepictedIn'));
    let targets = group ? group.fields.find(field => field.name === 'isDepictedIn').targets : false;

    let imageSource = false;
    if(targets) {
        // extract first image of resource:
        let categoryName = targets[0].resource.category.name;
        if(categoryName === "Photo" || categoryName === "Drawing") {
            let primaryImageId = targets[0].resource.id;
            let imageApiUrl = "https://field.idai.world/api/images/" + data.project + "/" + primaryImageId + ".jp2";
            let imageSpecs = "/x/full/!500,500/0/default.jpg"; // watch out: https://iiif.io/api/image/2.0/
            imageSource = imageApiUrl + imageSpecs;
        }
    }
    return {
        "project": data.project,
        "shortDescription": shortDescription,
        "imageSource": imageSource
    };
}

/* ---------------------
 * External data presentation
 * --------------------- */

/**
 * Displays a mapped iDAI.gazetteer resource.
 *
 * @param {Object} values parsed data and reference context
 * @returns {void}
 */
function displayGazetteerData(values) {

    let externalObject = createExternalObjectElement("gazetteer");
    let objectName = externalObject.querySelector(".object-name");
    let objectData = externalObject.querySelector(".object-data");
    let objectVisualization = externalObject.querySelector(".object-visualization");
    let dataSourceLink = externalObject.querySelector(".data-source-link"); 

    // enrich elements with parsed data values:
    if(values["hasResult"]) {
        let data = values["parsed"];

        if(values.refText) {
            objectName.innerText = values.refText;
        }
        if(data.prefName.title !== undefined) {
            objectData.innerText = data.prefName.title;
        }
        if(data.url) {
            dataSourceLink.innerText = data.url;
            dataSourceLink.href = data.url;
        }
        if(values["refAnchorId"]) {
            objectVisualization.id = "target-gazetteer-" + values["refAnchorId"];
        }

        // create map:
        let map = document.createElement("div");
        map.id = "map-" + values["refAnchorId"];
        map.classList.add("map");

        // create coordinates element:
        let coordinatesElement = document.createElement("p");
        coordinatesElement.classList.add("coordinates");

        // assign coordinates:
        if(values["parsed"].location) {
            if(values["parsed"].location.coordinates) {
                const coords = values["parsed"].location.coordinates;
                map.setAttribute("longitude" , coords[0]);
                map.setAttribute("latitude" , coords[1]);
                coordinatesElement.textContent = "Long: " + coords[0] + ", Lat: " + coords[1];
                objectVisualization.appendChild(map);
                objectVisualization.appendChild(coordinatesElement);
            }
            else {
                webViewContext.reportDiagnostic("warning", "Place has shape coordinates only", {
                    place: values["parsed"]
                });
            }
        }
    }
    else {
        objectName.classList.add("warning-text");
        objectData.classList.add("warning-box");
        objectName.innerText = "'" + values.refText + "' could not be fetched!";
        objectData.innerText = "Checkout url of xlink:href: " + values["apiUrl"];
    }

    // append elements to #gazetteer-list:
    document.querySelector('#gazetteer-list').appendChild(externalObject);
}

/**
 * Displays a mapped iDAI.objects resource.
 *
 * @param {Object} values parsed data and reference context
 * @returns {void}
 */
function displayArachneData(values) {

    let externalObject = createExternalObjectElement("arachne");
    let objectName = externalObject.querySelector(".object-name");
    let objectData = externalObject.querySelector(".object-data");
    let objectVisualization = externalObject.querySelector(".object-visualization");
    let dataSourceLink = externalObject.querySelector(".data-source-link");

    if(values["hasResult"]) {
        let data = values["parsed"];
        if(values.refText) {
            objectName.innerText = values.refText;
        }
        if(data.title) {
            objectData.innerText = data.title;
            if(data.subtitle) {
                objectData.innerText += ", " + data.subtitle;
            }
            if(data.type) {
                objectData.innerText += ", [" + data.type + "]";
            }
        }
        if(data.url) {
            dataSourceLink.innerText = data.url;
            dataSourceLink.href = data.url;
        }

        if(values["refAnchorId"]) {
            objectVisualization.id = "target-arachne-" + values["refAnchorId"];
        }
        // create object-image:
        let url;
        
        if (data.images && data.images.length) {
            url = "https://arachne.dainst.org/data/image/" + data.images[0].imageId;
            createExternalObjectImage(url, objectVisualization, "iDAI.objects/Arachne");
        }
        // link to arachne for displaying 3D models:
        else if(data.type === "3D-Modelle") {
            objectVisualization.innerText = "[Follow the link to arachne.dainst.org to view the 3D-model]";
        }
        // no visualizations available:
        else {
            objectVisualization.innerText = "[No images available]";
        }
    }
    else {
        objectName.classList.add("warning-text", "warning-box");
        objectName.innerText = "'" + values.refText + "' could not be fetched!";
        objectData.innerText = "Checkout url of xlink:href: " + values["apiUrl"];
    }

    // append elements to #arachne-list:
    document.querySelector('#arachne-list').append(externalObject);
}

/**
 * Displays a mapped iDAI.field resource.
 *
 * @param {Object} values parsed data and reference context
 * @returns {void}
 */
function displayFieldData(values) {

    let externalObject = createExternalObjectElement("field");
    let objectName = externalObject.querySelector(".object-name");
    let objectData = externalObject.querySelector(".object-data");
    let objectVisualization = externalObject.querySelector(".object-visualization");
    let dataSourceLink = externalObject.querySelector(".data-source-link");

    if(values["hasResult"]) {
        let data = values["parsed"];
        if(values.refText) {
            objectName.innerText = values.refText;
        }
        if(data.shortDescription) {
            objectData.innerText = data.shortDescription;
        }
        if(values["url"]) {
            dataSourceLink.innerText = values["url"];
            dataSourceLink.href = values["url"];
        }
        if(values["refAnchorId"]) {
            objectVisualization.id = "target-field-" + values["refAnchorId"];
        }
        // create object-image:
        let url;
        if (data.imageSource) {
            url = data.imageSource;
            createExternalObjectImage(url, objectVisualization, "iDAI.field");
        }
        else {
            objectVisualization.innerText = "[No images available]";
        }
    }
    else {
        objectName.classList.add("warning-text");
        objectData.classList.add("warning-box");
        objectName.innerText = "'" + values.refText + "' could not be fetched!";
        objectData.innerText = "Checkout url of xlink:href: " + values["apiUrl"];
    }

    // append elements to #objects:
    document.querySelector('#field-list').append(externalObject);
}

/**
 * Creates the shared disclosure structure for an external resource.
 *
 * @param {string} source external service identifier
 * @returns {HTMLElement} external-resource list item
 */
function createExternalObjectElement(source) {

    // details-element for html-native open/close option:
    let externalObject = document.createElement("li");
    externalObject.classList.add("external-object");
    if (source) {
        externalObject.classList.add(source);
    }

    // details-element for html-native open/close option:
    let objectDetails = document.createElement("details");
    objectDetails.classList.add("object-details");

    // summary to display the (data) object name:
    let objectName = document.createElement("summary");
    objectName.classList.add("object-name");

    // wrapper div to add specific object data:
    let objectData = document.createElement("div");
    objectData.classList.add("object-data");
    
    // wrapper div to add images and other other visualizations:
    let objectVisualization = document.createElement("div");
    objectVisualization.classList.add("object-visualization");

    // add fetch-state-span to object-visualization container:
    let fetchStateSpan = document.createElement("span");
    fetchStateSpan.classList.add("fetch-state-span");
    objectVisualization.appendChild(fetchStateSpan);
    
    // wrapper div to add data source url:
    let dataSourceInfo = document.createElement("div");
    dataSourceInfo.classList.add("data-source-info");
    let sourceLink = document.createElement("a");
    sourceLink.classList.add("data-source-link");
    sourceLink.target = "_blank";
    sourceLink.ariaLabel = source + " entry (opens in new tab)";
    dataSourceInfo.appendChild(sourceLink);

    // add screenReader notice for better accessability:
    let screenReaderSpan = document.createElement("span");
    screenReaderSpan.classList.add("screenreader-only");
    screenReaderSpan.textContent = "(opens in new tab)";
    dataSourceInfo.appendChild(screenReaderSpan);

    // add all childs:
    objectDetails.appendChild(objectName);
    objectDetails.appendChild(objectData);
    objectDetails.appendChild(dataSourceInfo);
    objectDetails.appendChild(objectVisualization);
    externalObject.appendChild(objectDetails);

    // hide fetchStateBar:
    document.querySelector("#fetch-state-" + source).style.display = "none";

    return(externalObject);
}

/**
 * Fetches and displays an image supplied by an external service.
 *
 * @param {string} url external image URL
 * @param {HTMLElement} objectVisualization target visualization container
 * @param {string} service external service name
 * @returns {Promise<void>}
 */
async function createExternalObjectImage(url, objectVisualization, service) {

    try {
        let fetchStateElement = objectVisualization.querySelector(".fetch-state-span");
        if(fetchStateElement) {
            let fetchState = "[...Fetching data from: " + url + "]...";
            fetchStateElement.textContent = fetchState;
        }

        let response = await fetch(url, {method: 'GET'});
        if(!response.ok) {
            throw new Error("External image responded with HTTP " + response.status);
        }

        let blob = await response.blob();
        let base64data = await readBlobAsDataUrl(blob);
        let objectImage = document.createElement("img");
        objectImage.classList.add("object-image");
        objectImage.loading = "lazy";
        objectImage.onload = function () {
            scaleImage(objectImage);
        };
        objectImage.onerror = function () {
            objectImage.remove();
            displayExternalImageFailure(objectVisualization, service);
            webViewContext.reportDiagnostic("warning", "External image could not be displayed", {
                code: "external-image-error",
                service,
                url
            });
        };
        objectImage.src = base64data;
        objectVisualization.insertAdjacentElement("afterbegin", objectImage);
        fetchStateElement?.remove();
    }
    catch(error) {
        displayExternalImageFailure(objectVisualization, service);
        webViewContext.reportDiagnostic("warning", "External image could not be loaded", {
            code: "external-image-error",
            service,
            url,
            cause: error
        });
    }
}

/**
 * Reads an image blob as a data URL.
 *
 * @param {Blob} blob fetched image data
 * @returns {Promise<string>} image data URL
 */
function readBlobAsDataUrl(blob) {

    return new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.onload = function() {
            resolve(reader.result);
        };
        reader.onerror = function() {
            reject(reader.error || new Error("Could not read external image data"));
        };
        reader.readAsDataURL(blob);
    });
}

/**
 * Displays a warning when an external image is unavailable.
 *
 * @param {HTMLElement} objectVisualization external-resource visualization
 * @param {string} service external service name
 * @returns {void}
 */
function displayExternalImageFailure(objectVisualization, service) {

    let fetchStateElement = objectVisualization.querySelector(".fetch-state-span");
    let message = "The image from " + service + " could not be loaded via REST-API."

    if(fetchStateElement) {
        fetchStateElement.classList.add("warning-text", "warning-box");
        fetchStateElement.textContent = message;
    }
    else {
        let warning = document.createElement("p");
        warning.classList.add("warning-text", "warning-box");
        warning.textContent = message;
        objectVisualization.append(warning);
    }
}

/* ---------------------
 * Accessibility and layout
 * --------------------- */

/**
 * Creates keyboard-accessible links to the primary view regions.
 *
 * @returns {HTMLElement} skip-link navigation
 */
function createSkipLinks() {

    let skipNav = document.createElement("nav");
    skipNav.classList.add("skip-links");
    skipNav.ariaLabel = "Skip links";

    let skipToMainText = document.createElement("a");
    skipToMainText.classList.add("skip-link");
    skipToMainText.href = "#text-content-wrapper";
    skipToMainText.textContent = "Skip to main text";

    let skipToPanelNav = document.createElement("a");
    skipToPanelNav.classList.add("skip-link");
    skipToPanelNav.href = "#panel-navigation";
    skipToPanelNav.textContent = "Skip to panel navigation";

    skipNav.appendChild(skipToMainText);
    skipNav.appendChild(skipToPanelNav);
 
    return(skipNav);
}

/**
 * Adds complete citation text as a tooltip to bibliographic references.
 *
 * @param {NodeListOf<HTMLAnchorElement>} bibRefs bibliographic reference links
 * @returns {void}
 */
function titleOfResourcesAsToolTip(bibRefs) {
  
    bibRefs.forEach(function(bibRef) {
        let refTarget; // href to bibliographic reference (id)
        let target; // bibliographic reference (element)

        if(bibRef.href !== null && bibRef.href) {
            refTarget = bibRef.getAttribute("href");
            target = document.querySelector("#" + CSS.escape(refTarget));
            let bibTitle; // bib reference as full citation
            if(target !== null) {
                bibTitle = target.querySelector("p");
                // trim valid bibTitles:
                if(bibTitle !== null && bibTitle.textContent) {
                    bibTitle = bibTitle.textContent.trim();
                    bibTitle = bibTitle.replace(/[\n\r]+|[\s]{2,}/g, ' ');
                    bibTitle = "Jump to: " + bibTitle;
                } else ( bibTitle = "Jump to: No title found");
                // add bibTitle as tooltip (title-attribute):
                bibRef.title = bibTitle;
            }
            else {
            }
        }
    });
}

/**
 * Adds a backlink from a footnote to its reference in the main text.
 *
 * @param {HTMLElement} footnote footnote element
 * @returns {void}
 */

function addBackLinkAnchorToFootnote(footnote) {

    if(footnote.id !== undefined) {
        if(footnote.querySelector(".label") !== null) {
            let label = footnote.querySelector(".label");
            label.id = footnote.id + "-label";
            footnote.setAttribute("aria-labelledby", label.id);
        }

        let hrefSelector = "[href='#" + footnote.id + "']"; 
        let textToFnAnchor = document.querySelector(".fn-ref" + hrefSelector);
      
        if(textToFnAnchor !== null) {
            let backAnchor = document.createElement("a");
            backAnchor.classList.add("index-ref");
            backAnchor.href = "#" + textToFnAnchor.id;
            backAnchor.title = "Jump back to position in main text";

            let visibleSpan = document.createElement("span");
            visibleSpan.title = "Jump back to position in main text";
            visibleSpan.ariaHidden = true;
            backAnchor.appendChild(visibleSpan);

            let hiddenSpan = document.createElement("span");
            hiddenSpan.classList.add("screenreader-only");
            hiddenSpan.textContent = "Jump back to position in main text";
            backAnchor.appendChild(hiddenSpan);
            
            footnote.insertAdjacentElement("beforeend", backAnchor);
        }
    }
}

/**
 * Adds descriptive title attributes to interactive article references.
 *
 * @returns {void}
 */
 function addTitleAttributesAsAccessablityHelper() {

    let titleAttr;

    // paragraph counters:
    let paraCounters = document.querySelectorAll(".paragraph-counter");
    if(paraCounters.length > 0) {
        paraCounters.forEach(element => {
            element.title = "Paragraph " + element.textContent;
        });
    }

    // fn-refs:
    let fnRefs = document.querySelectorAll(".fn-ref");
    if(fnRefs.length > 0) {
        fnRefs.forEach(element => {
            titleAttr = element.textContent;
            element.title = "Jump to Footnote: " + titleAttr;
        });
    }
    // fig-refs:
    let figRefs = document.querySelectorAll(".fig-ref");
    if(figRefs.length > 0) {
        figRefs.forEach(element => {
            titleAttr = element.textContent;
            element.title = "Jump to Figure: " + titleAttr;
        });
    }

    // ext-refs (only internals):
    let extRefs = document.querySelectorAll(
        ".ext-ref[data-specific-use='extrafeatures']," + 
        ".ext-ref[data-specific-use='extrafeatures']"); 
    if(extRefs.length > 0) {
        let objectType;
        extRefs.forEach(element => {
            objectType = element.getAttribute("data-target-section");
            titleAttr = element.textContent;
            element.title = "Jump to supplementary object (" + titleAttr + ") in side panel";
        });
    }
 }

/**
 * Constrains an image to the current viewport dimensions.
 *
 * @param {HTMLImageElement} img image to scale
 * @returns {void}
 */
function scaleImage(img) {

    let natWidth = img.naturalWidth;
    let natHeight = img.naturalHeight;
    let targetHeight = document.documentElement.clientHeight * 0.9;
    let targetWidth = document.documentElement.clientWidth * 0.5;

    if(natHeight > targetHeight) {
        img.style = "max-width:max-content;max-height:" + targetHeight + "px;";
    }
    else if(natWidth < targetWidth) {
        img.style = "max-height:max-content;max-width:" + natWidth + "px;";
    }
}

/**
 * Adds the publisher homepage link to the panel navigation.
 *
 * @returns {void}
 */
function addDaiHomeLinkToPanelNavigation() {
    
    let homepageLink = document.createElement("a");
    homepageLink.id = "dai-home";
    homepageLink.href = "https://www.dainst.org/forschung/publikationen";
    homepageLink.ariaLabel = "Jump to publisher website (opens in new tab)";
    homepageLink.target = "_blank";
    
    let daiGreif = document.createElement("img");
    daiGreif.id = "logo-img-greif";
    daiGreif.classList.add("logo-img");
    daiGreif.src = "src/css/assets/graphics/greif.png";
    daiGreif.alt = "DAI Greif" 
    homepageLink.appendChild(daiGreif);
    document.querySelector("#panel-navigation").append(homepageLink);
}

/**
 * Adds the control for exchanging the main-text and supplementary panels.
 *
 * @returns {void}
 */
function addLayoutSwitchToDocument() {

    let layoutSwitchInput = document.createElement("input");
    layoutSwitchInput.type = "checkbox";
    layoutSwitchInput.id = "layout-switch-state";
    layoutSwitchInput.classList.add("screenreader-only");
    document.querySelector("#text-content-wrapper").prepend(layoutSwitchInput);

    let layoutSwitchLabel = document.createElement("label");
    layoutSwitchLabel.id = "layout-switch";
    layoutSwitchLabel.setAttribute("for", "layout-switch-state");
    layoutSwitchLabel.ariaLabel = "Switch text and supplementary panel positions";
    layoutSwitchLabel.innerHTML =  "<i class='fa fa-exchange' aria-hidden='true'></i>";
    document.querySelector("#text-content-wrapper").prepend(layoutSwitchLabel);
 
}

/* ---------------------
 * Public API
 * --------------------- */

export const webView = Object.freeze({
    configure: configureWebView,
    render: generateWebView
});
