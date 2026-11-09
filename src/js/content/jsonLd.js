/* ------------------------
 * JSON-LD mapping profile
 * ------------------------ */
/**
 * Documents the supported JATS sources and their Schema.org mapping policy.
 * Paths stay with the mapper so its input contract remains visible in one file.
 */
const JSON_LD_MAPPING_PROFILE = {
    context: "https://schema.org",
    articleType: "ScholarlyArticle",
    authorTypes: ["author"],
    contributorTypes: ["co-author", "editor", "co-editor", "advisory board member"],
    paths: {
        title: "article-meta/title-group/article-title",
        subtitle: "article-meta/title-group/subtitle",
        doi: 'article-meta/article-id[@pub-id-type="doi"]',
        contributors: "article-meta/contrib-group/contrib",
        creationDate: 'article-meta/date[@date-type="created"]',
        publicationDates: [
            'article-meta/pub-date[@date-type="pub"]',
            'article-meta/pub-date[@pub-type="collection"]',
            "article-meta/pub-date"
        ],
        volume: "article-meta/volume",
        issue: "article-meta/issue",
        firstPage: "article-meta/fpage",
        lastPage: "article-meta/lpage",
        onlineLocation: 'article-meta/self-uri[@content-type="online-url"]',
        abstracts: "article-meta/abstract",
        translatedAbstracts: "article-meta/trans-abstract",
        keywordGroups: "article-meta/kwd-group",
        licenses: "article-meta/permissions/license",
        copyrightNotice: "article-meta/permissions/copyright-statement",
        copyrightHolder: "article-meta/permissions/copyright-holder",
        copyrightYear: "article-meta/permissions/copyright-year",
        journalTitle: "journal-meta/journal-title-group/journal-title",
        journalIssns: "journal-meta/issn",
        journalIsbn: 'journal-meta/isbn[@publication-format="print"]',
        journalDoi: 'journal-meta/journal-id[@journal-id-type="doi"]',
        publisher: "journal-meta/publisher"
    }
};

/* ---------------------
 * Scholarly article
 * --------------------- */

/**
 * Creates Schema.org `ScholarlyArticle` JSON-LD from JATS front matter.
 *
 * @param {Element} frontElement JATS `front` element
 * @returns {Object} cleaned Schema.org scholarly-article metadata
 */
export function createScholarlyArticleJsonLd(frontElement) {
    const paths = JSON_LD_MAPPING_PROFILE.paths;

    // map shared publication entities:
    const publisher = mapPublisher(frontElement);
    const periodical = mapPeriodical(frontElement, publisher);

    // map the article identity:
    const title = getText(paths.title, frontElement);
    const subtitle = getText(paths.subtitle, frontElement);
    const doi = normalizeDoi(getText(paths.doi, frontElement));
    const articleIdentifier = doi
        ? createPropertyValue("DOI", doi)
        : undefined;

    // resolve the canonical article location:
    const onlineLocationElement = getNode(
        paths.onlineLocation,
        frontElement
    );
    const onlineLocation = onlineLocationElement
        ? getFirstHttpUrl(
            getXlinkHref(onlineLocationElement),
            onlineLocationElement.textContent
        )
        : "";
    const canonicalUrl = onlineLocation
        || (doi ? `https://doi.org/${doi}` : "");

    // map publication and pagination metadata:
    const language = mapArticleLanguage(frontElement);
    const volumeNumber = getText(paths.volume, frontElement);
    const issueNumber = getText(paths.issue, frontElement);
    const publicationHierarchy = mapPublicationHierarchy(
        periodical,
        volumeNumber,
        issueNumber
    );
    const pageStart = getText(paths.firstPage, frontElement);
    const pageEnd = getText(paths.lastPage, frontElement);
    const dateCreated = mapCreatedDate(frontElement);
    const datePublished = mapPublicationDate(frontElement);

    // map contributors and article content:
    const contributorGroups = mapContributors(frontElement);
    const abstracts = mapAbstracts(frontElement);
    const abstract = abstracts.length === 1 ? abstracts[0] : abstracts;
    const keywords = mapKeywords(frontElement);
    const rights = mapRights(frontElement);

    // assemble the complete scholarly-article representation:
    const scholarlyArticle = {
        "@context": JSON_LD_MAPPING_PROFILE.context,
        "@type": JSON_LD_MAPPING_PROFILE.articleType,
        headline: title,
        name: title,
        alternativeHeadline: subtitle,
        identifier: articleIdentifier,
        url: canonicalUrl,
        inLanguage: language,
        isPartOf: publicationHierarchy,
        pageStart,
        pageEnd,
        dateCreated,
        datePublished,
        author: contributorGroups.authors,
        contributor: contributorGroups.contributors,
        publisher,
        abstract,
        about: keywords,
        ...rights
    };

    // remove incomplete nested values from the final JSON-LD document:
    const jsonLd = removeEmptyValues(scholarlyArticle);

    return jsonLd;
}
/* ---------------------
 * Publication entities
 * --------------------- */

/**
 * Maps JATS publisher metadata to a Schema.org organization.
 *
 * @param {Element} frontElement JATS front element
 * @returns {Object|undefined} publisher organization or `undefined`
 */
function mapPublisher(frontElement) {
    // locate the publisher metadata within the journal information:
    const publisherElement = getNode(
        JSON_LD_MAPPING_PROFILE.paths.publisher,
        frontElement
    );

    if (!publisherElement) {return undefined;}

    // read the publisher and its optional organizational unit:
    const publisherName = getText("publisher-name", publisherElement);
    const publisherLocation = getNode("publisher-loc", publisherElement);
    const departmentName = publisherLocation
        ? getText("institution", publisherLocation)
        : "";

    // separate postal codes stored together with the city name:
    const city = publisherLocation
        ? getText("city", publisherLocation)
        : "";
    const cityParts = city.match(/^(\d{4,6})\s+(.+)$/);
    const postalCode = cityParts ? cityParts[1] : "";
    const addressLocality = cityParts ? cityParts[2] : city;

    // resolve a publisher URL from the location metadata:
    const linkElement = publisherLocation
        ? getNode('ext-link[@ext-link-type="uri"]', publisherLocation)
        : null;
    const publisherUrl = linkElement
        ? getFirstHttpUrl(
            getXlinkHref(linkElement),
            linkElement.textContent
        )
        : "";

    // map the available publisher metadata:
    const publisher = {
        "@type": "Organization",
        name: publisherName,
        url: publisherUrl,
        department: departmentName ? {
            "@type": "Organization",
            name: departmentName
        } : undefined,
        address: publisherLocation ? {
            "@type": "PostalAddress",
            streetAddress: getText("addr-line", publisherLocation),
            addressLocality,
            postalCode,
            addressCountry: getText("country", publisherLocation)
        } : undefined
    };

    const mappedPublisher = hasMappedProperties(publisher)
        ? publisher
        : undefined;

    return mappedPublisher;
}

/**
 * Maps JATS journal metadata to a Schema.org periodical.
 *
 * @param {Element} frontElement JATS front element
 * @param {Object|undefined} publisher mapped publisher organization
 * @returns {Object|undefined} periodical metadata or `undefined`
 */
function mapPeriodical(frontElement, publisher) {
    const paths = JSON_LD_MAPPING_PROFILE.paths;

    // map the journal title and its repeatable ISSN values:
    const journalTitle = getText(paths.journalTitle, frontElement);
    const journalIssns = getNodes(paths.journalIssns, frontElement)
        .map((element) => normalizeText(element.textContent))
        .filter(Boolean);
    const uniqueJournalIssns = [...new Set(journalIssns)];

    // map additional journal identifiers:
    const journalDoi = normalizeDoi(
        getText(paths.journalDoi, frontElement)
    );
    const journalIsbn = getText(paths.journalIsbn, frontElement);

    // require metadata that identifies the periodical itself:
    const hasPeriodicalIdentity = Boolean(
        journalTitle
        || uniqueJournalIssns.length
        || journalDoi
        || journalIsbn
    );

    if (!hasPeriodicalIdentity) {return undefined;}

    // collect identifiers that do not have a suitable periodical property:
    const identifiers = [
        journalDoi
            ? createPropertyValue("DOI", journalDoi)
            : undefined,
        journalIsbn
            ? createPropertyValue("ISBN", journalIsbn)
            : undefined
    ].filter(Boolean);

    const periodical = {
        "@type": "Periodical",
        name: journalTitle,
        issn: uniqueJournalIssns,
        identifier: identifiers,
        publisher
    };

    return periodical;
}

/**
 * Builds the publication hierarchy containing an article.
 *
 * @param {Object|undefined} periodical mapped periodical
 * @param {string} volumeNumber publication volume
 * @param {string} issueNumber publication issue
 * @returns {Object|undefined} most specific publication container
 */
function mapPublicationHierarchy(periodical, volumeNumber, issueNumber) {
    // place an optional volume inside the periodical:
    const publicationVolume = volumeNumber ? {
        "@type": "PublicationVolume",
        volumeNumber,
        isPartOf: periodical
    } : periodical;

    // place an optional issue inside the volume or periodical:
    const publicationIssue = issueNumber ? {
        "@type": "PublicationIssue",
        issueNumber,
        isPartOf: publicationVolume
    } : publicationVolume;

    return publicationIssue;
}

/* ---------------------
 * Contributor mapping
 * --------------------- */

/**
 * Maps configured JATS contributor types and separates primary authors.
 *
 * @param {Element} frontElement JATS front element
 * @returns {{authors: Object[], contributors: Object[]}} contributor groups
 */
function mapContributors(frontElement) {

    // prepare consts:
    const authors = [];
    const contributors = [];
    const contributorElements = getNodes(
        JSON_LD_MAPPING_PROFILE.paths.contributors,
        frontElement
    );

    // map only contributor roles declared by the mapping profile:
    contributorElements.forEach((contributorElement) => {
        const contributorType = normalizeText(
            contributorElement.getAttribute("contrib-type")
        ).toLowerCase();
        const contributor = mapContributor(contributorElement, frontElement);

        if (!contributor) {return;}

        if (JSON_LD_MAPPING_PROFILE.authorTypes.includes(contributorType)) {
            authors.push(contributor);
        } 
        else if (JSON_LD_MAPPING_PROFILE.contributorTypes.includes(contributorType)) {
            contributors.push(contributor);
        }
    });

    const contributorGroups = { authors, contributors };

    return contributorGroups;
}

/**
 * Maps a JATS contributor to a Schema.org person or organization.
 *
 * @param {Element} contributorElement JATS contributor element
 * @param {Element} frontElement JATS front element
 * @returns {Object|undefined} mapped contributor or `undefined`
 */
function mapContributor(contributorElement, frontElement) {

    // represent collaborative authorship as an organization:
    const collaborationName = getText("collab", contributorElement);
    if (collaborationName) {return { "@type": "Organization", name: collaborationName };}

    // map the contributor's personal identity:
    const givenName = getText("name/given-names", contributorElement);
    const familyName = getText("name/surname", contributorElement);
    const honorificPrefix = getText("name/prefix", contributorElement);
    const name = [honorificPrefix, givenName, familyName].filter(Boolean).join(" ");
    const orcidSource = getText(
        'contrib-id[@contrib-id-type="orcid"]',
        contributorElement
    );
    const orcid = normalizeOrcid(orcidSource);
    const orcidUrl = orcid ? `https://orcid.org/${orcid}` : "";

    // map contact information and all embedded or referenced affiliations:
    const email = getText("email", contributorElement)
        || getText("aff/email", contributorElement)
        || getText("address/email", contributorElement);
    const affiliations = mapAffiliations(contributorElement, frontElement);

    if (!name && !orcid && affiliations.length === 0) {return undefined;}

    const contributor = {
        "@type": "Person",
        name,
        honorificPrefix,
        givenName,
        familyName,
        email,
        identifier: orcid ? createPropertyValue("ORCID", orcid) : undefined,
        sameAs: orcidUrl,
        affiliation: affiliations
    };

    return contributor;
}

/**
 * Maps embedded and referenced affiliations belonging to a contributor.
 *
 * @param {Element} contributorElement JATS contributor element
 * @param {Element} frontElement JATS front element
 * @returns {Object[]} unique Schema.org organizations
 */
function mapAffiliations(contributorElement, frontElement) {

    // collect affiliations embedded directly in the contributor:
    const embeddedElements = [
        ...getNodes("aff", contributorElement),
        ...getNodes("address", contributorElement)
    ];

    // resolve affiliations referenced by one or more JATS IDs:
    const references = getNodes('xref[@ref-type="aff"]', contributorElement);
    const referencedIds = references
        .flatMap((reference) => {
            const referenceIds = normalizeText(
                reference.getAttribute("rid")
            ).split(/\s+/);

            return referenceIds;
        })
        .filter(Boolean);

    // retain shared affiliations referenced by the contributor IDs:
    const referencedElements = getNodes("article-meta/contrib-group/aff", frontElement)
        .filter((element) => referencedIds.includes(element.id));

    // deduplicate XML elements before mapping their organization data:
    const affiliationElements = [
        ...new Set([...embeddedElements, ...referencedElements])
    ];
    const affiliations = affiliationElements
        .map(mapAffiliation)
        .filter(Boolean);

    return affiliations;
}

/**
 * Maps a JATS affiliation or address to a Schema.org organization.
 *
 * @param {Element} affiliationElement JATS affiliation or address element
 * @returns {Object|undefined} affiliation organization or `undefined`
 */
function mapAffiliation(affiliationElement) {

    // map the institution and its optional external identifier:
    const institutionName = getText("institution", affiliationElement)
        || getText("institution-wrap/institution", affiliationElement);
    const idElement = getNode(
        "institution-wrap/institution-id",
        affiliationElement
    );

    // map institution identifiers:
    const identifierSource = idElement ? normalizeText(idElement.textContent) : "";
    const identifierType = idElement
        ? normalizeText(idElement.getAttribute("institution-id-type")).toUpperCase()
        : "";
    const identifier = identifierType === "ROR"
        ? normalizeRor(identifierSource)
        : identifierSource;
    const institutionIdentifier = identifier
        ? createPropertyValue(identifierType || "institution", identifier)
        : undefined;
    const identifierUrl = identifierType === "ROR" && identifier
        ? `https://ror.org/${identifier}`
        : getFirstHttpUrl(identifierSource);

    // map the available postal address components:
    const addressLine = getText("addr-line", affiliationElement);
    const city = getText("city", affiliationElement);
    const country = getText("country", affiliationElement);
    const hasAddress = Boolean(addressLine || city || country);

    // ignore affiliation elements that contain no mappable data:
    if (!institutionName && !identifier && !addressLine && !city && !country) {
        return undefined;
    }

    const affiliation = {
        "@type": "Organization",
        name: institutionName,
        identifier: institutionIdentifier,
        sameAs: identifierUrl,
        address: hasAddress ? {
            "@type": "PostalAddress",
            streetAddress: addressLine,
            addressLocality: city,
            addressCountry: country
        } : undefined
    };

    return affiliation;
}

/* ---------------------
 * Article metadata
 * --------------------- */

/**
 * Maps the JATS creation date to an ISO-style value.
 *
 * @param {Element} frontElement JATS front element
 * @returns {string} creation date or an empty string
 */
function mapCreatedDate(frontElement) {
    const dateElement = getNode(
        JSON_LD_MAPPING_PROFILE.paths.creationDate,
        frontElement
    );

    if (!dateElement) {return "";}

    // prefer an explicit ISO date before assembling separate components:
    const explicitDate = normalizeText(
        dateElement.getAttribute("iso-8601-date")
    );

    // assemble a fallback date from the individual JATS components:
    const componentDate = createDateFromComponents(
        getText("year", dateElement),
        getText("month", dateElement),
        getText("day", dateElement)
    );
    const creationDate = explicitDate || componentDate;

    return creationDate;
}

/**
 * Maps the preferred JATS publication date to an ISO-style value.
 *
 * @param {Element} frontElement JATS front element
 * @returns {string} publication date or an empty string
 */
function mapPublicationDate(frontElement) {

    // select the first available date according to profile precedence:
    const dateElement = JSON_LD_MAPPING_PROFILE.paths.publicationDates
        .map((path) => getNode(path, frontElement))
        .find(Boolean);

    if (!dateElement) {return "";}

    // prefer an explicit ISO date before assembling separate components:
    const explicitDate = normalizeText(
        dateElement.getAttribute("iso-8601-date")
    );

    // assemble a fallback date from the individual JATS components:
    const componentDate = createDateFromComponents(
        getText("year", dateElement),
        getText("month", dateElement),
        getText("day", dateElement)
    );
    const publicationDate = explicitDate || componentDate;

    return publicationDate;
}
/**
 * Creates the most precise valid date from separate JATS date components.
 * Partial dates containing only a year or year and month are supported.
 *
 * @param {string|null|undefined} year publication year
 * @param {string|null|undefined} month publication month
 * @param {string|null|undefined} day publication day
 * @returns {string} ISO-style publication date or an empty string
 */
function createDateFromComponents(year, month, day) {
    // normalize the individual JATS date components:
    const normalizedYear = normalizeText(year);
    const normalizedMonth = normalizeText(month);
    const normalizedDay = normalizeText(day);

    // a four-digit year is required for every supported date form:
    if (!/^\d{4}$/.test(normalizedYear)) {return "";}

    // start the date with its required year component:
    const dateParts = [normalizedYear];

    // validate and append the optional month component:
    const monthNumber = Number(normalizedMonth);
    const hasValidMonth = /^\d{1,2}$/.test(normalizedMonth)
        && monthNumber >= 1
        && monthNumber <= 12;
    if (hasValidMonth) {dateParts.push(String(monthNumber).padStart(2, "0"));}

    // determine the valid day range for the selected month:
    const maximumDay = hasValidMonth
        ? new Date(Number(normalizedYear), monthNumber, 0).getDate()
        : 0;

    // validate and append the optional day component:
    const dayNumber = Number(normalizedDay);
    const hasValidDay = /^\d{1,2}$/.test(normalizedDay)
        && dayNumber >= 1
        && dayNumber <= maximumDay;

    if (hasValidMonth && hasValidDay) {
        dateParts.push(String(dayNumber).padStart(2, "0"));
    }
    const publicationDate = dateParts.join("-");

    return publicationDate;
}

/**
 * Extracts concise text from a modern or legacy JATS abstract.
 *
 * @param {Element} abstractElement JATS abstract or translated abstract
 * @returns {string} normalized abstract text
 */
function getAbstractText(abstractElement) {

    // locate text explicitly identified by the legacy abstract structure:
    const styledContentElements = [
        ...abstractElement.getElementsByTagNameNS("*", "styled-content")
    ];
    const abstractTextElements = styledContentElements.filter((element) => {
        return element.getAttribute("style-type") === "abstract-text";
    });

    // fall back to the complete content used by modern JATS abstracts:
    const textElements = abstractTextElements.length
        ? abstractTextElements
        : [abstractElement];
    const abstractText = textElements
        .map((element) => normalizeText(element.textContent))
        .filter(Boolean)
        .join(" ");

    return abstractText;
}

/**
 * Maps original and translated JATS abstracts with language metadata.
 *
 * @param {Element} frontElement JATS front element
 * @returns {Array<string|Object>} mapped abstract values
 */
function mapAbstracts(frontElement) {

    const paths = JSON_LD_MAPPING_PROFILE.paths;
    const abstractElements = [
        ...getNodes(paths.abstracts, frontElement),
        ...getNodes(paths.translatedAbstracts, frontElement)
    ];
    const abstracts = [];

    // retain language information when the source declares it:
    abstractElements.forEach((abstractElement) => {
        const text = getAbstractText(abstractElement);
        if (!text) {return;}

        const language = getXmlLanguage(abstractElement);
        const abstract = language
            ? { "@value": text, "@language": language }
            : text;
        abstracts.push(abstract);
    });

    return abstracts;
}

/**
 * Maps JATS keyword groups to Schema.org defined terms.
 *
 * @param {Element} frontElement JATS front element
 * @returns {Object[]} mapped keyword terms
 */
function mapKeywords(frontElement) {

    const keywordGroups = getNodes(
        JSON_LD_MAPPING_PROFILE.paths.keywordGroups,
        frontElement
    );

    const keywords = [];
    keywordGroups.forEach((keywordGroup) => {
        // preserve the language declared by each keyword group:
        const language = getXmlLanguage(keywordGroup);
        const keywordElements = getNodes("kwd", keywordGroup);

        // map each non-empty keyword to a Schema.org defined term:
        keywordElements.forEach((keywordElement) => {
            const name = normalizeText(keywordElement.textContent);

            if (name) {
                const keywordName = language ? {
                    "@value": name,
                    "@language": language
                } : name;

                keywords.push({
                    "@type": "DefinedTerm",
                    name: keywordName
                });
            }
        });
    });

    return keywords;
}

/**
 * Maps JATS copyright and license information.
 *
 * @param {Element} frontElement JATS front element
 * @returns {Object} Schema.org rights metadata
 */
function mapRights(frontElement) {

    const paths = JSON_LD_MAPPING_PROFILE.paths;

    // map copyright information and derive a year when necessary:
    const copyrightNotice = getText(paths.copyrightNotice, frontElement);
    const copyrightYearValue = getText(paths.copyrightYear, frontElement)
        || copyrightNotice.match(/\b(?:19|20)\d{2}\b/)?.[0];
    const copyrightYear = /^\d{4}$/.test(copyrightYearValue)
        ? Number(copyrightYearValue)
        : undefined;
    const copyrightHolderName = getText(paths.copyrightHolder, frontElement);
    const copyrightHolder = copyrightHolderName ? {
        "@type": "Organization",
        name: copyrightHolderName
    } : undefined;

    // resolve license URLs and identify an explicit open-access declaration:
    const licenseElements = getNodes(paths.licenses, frontElement);
    const license = licenseElements
        .map((licenseElement) => getFirstHttpUrl(
            getXlinkHref(licenseElement),
            getText("license_ref", licenseElement),
            getText(
                'license-p[@content-type="terms-of-use"]',
                licenseElement
            ),
            licenseElement.textContent
        ))
        .find(Boolean) || "";

    // detect open access only when it is declared by the JATS license type:
    const hasOpenAccessLicense = licenseElements.some((licenseElement) => {
        const licenseType = normalizeText(
            licenseElement.getAttribute("license-type")).toLowerCase();
        return licenseType === "open-access";
    });

    const rights = {
        copyrightHolder,
        copyrightYear,
        copyrightNotice,
        license,
        isAccessibleForFree: hasOpenAccessLicense ? true : undefined
    };

    return rights;
}

/**
 * Returns the language declared by the JATS front matter or article.
 *
 * @param {Element} frontElement JATS front element
 * @returns {string} article language or an empty string
 */
function mapArticleLanguage(frontElement) {
    const articleElement = frontElement.parentElement;
    const frontLanguage = getXmlLanguage(frontElement);
    const articleLanguage = articleElement
        ? getXmlLanguage(articleElement) : "";
    const language = frontLanguage || articleLanguage;

    return language;
}

/* ---------------------
 * JSON-LD helpers
 * --------------------- */

/**
 * Creates a Schema.org property-value identifier.
 *
 * @param {string} propertyId identifier scheme, such as DOI or ORCID
 * @param {string} value identifier value
 * @returns {Object} Schema.org `PropertyValue`
 */
function createPropertyValue(propertyId, value) {
    const propertyValue = {
        "@type": "PropertyValue",
        propertyID: propertyId,
        value
    };

    return propertyValue;
}

/**
 * Checks whether a typed entity contains data beyond its Schema.org type.
 *
 * @param {Object} entity mapped Schema.org entity
 * @returns {boolean} whether the entity contains mapped source data
 */
function hasMappedProperties(entity) {
    // disregard empty values before inspecting the entity:
    const cleanedEntity = removeEmptyValues(entity);
    const mappedProperties = Object.keys(cleanedEntity)
        .filter((property) => property !== "@type");
    const hasMappedProperty = mappedProperties.length > 0;

    return hasMappedProperty;
}

/**
 * Removes empty properties and array entries from a JSON-LD value.
 * The supplied value is not modified.
 *
 * @param {*} value JSON-LD value to clean
 * @returns {*} recursively cleaned value
 */
function removeEmptyValues(value) {
    let cleanedValue = value;

    // clean array entries and discard entries without usable data:
    if (Array.isArray(value)) {
        cleanedValue = value
            .map((item) => removeEmptyValues(item))
            .filter((item) => !isEmptyValue(item));
    }

    // clean object properties and retain only properties with usable data:
    else if (value && typeof value === "object") {
        const cleanedObject = {};
        Object.entries(value).forEach(([property, propertyValue]) => {
            const cleanedPropertyValue = removeEmptyValues(propertyValue);

            if (!isEmptyValue(cleanedPropertyValue)) {
                cleanedObject[property] = cleanedPropertyValue;
            }
        });
        cleanedValue = cleanedObject;
    }

    return cleanedValue;
}

/**
 * Checks whether a JSON-LD value contains no usable data.
 * Meaningful falsy values such as `false` and `0` are retained.
 *
 * @param {*} value JSON-LD value to inspect
 * @returns {boolean} whether the value is empty
 */
function isEmptyValue(value) {
    // classify the value according to the supported empty forms:
    const isMissing = value === undefined || value === null;
    const isEmptyString = value === "";
    const isEmptyArray = Array.isArray(value) && value.length === 0;
    const isEmptyObject = value !== null
        && typeof value === "object"
        && !Array.isArray(value)
        && Object.keys(value).length === 0;

    const isEmpty = isMissing
        || isEmptyString
        || isEmptyArray
        || isEmptyObject;

    return isEmpty;
}

/* ---------------------
 * Value normalization
 * --------------------- */

/**
 * Collapses whitespace and trims a text value.
 *
 * @param {string|null|undefined} value source text
 * @returns {string} normalized text or an empty string
 */
function normalizeText(value) {
    const text = value || "";
    const normalizedText = text.replace(/\s+/g, " ").trim();

    return normalizedText;
}

/**
 * Converts a DOI or DOI resolver URL into a bare DOI value.
 *
 * @param {string|null|undefined} value DOI or DOI URL
 * @returns {string} normalized DOI or an empty string
 */
function normalizeDoi(value) {
    // normalize the source before removing a possible resolver URL:
    const normalizedValue = normalizeText(value);
    const doi = normalizedValue.replace(
        /^https?:\/\/(?:dx\.)?doi\.org\//i,
        ""
    );
    return doi;
}

/**
 * Converts an ORCID or ORCID resolver URL into a bare identifier.
 *
 * @param {string|null|undefined} value ORCID or ORCID URL
 * @returns {string} normalized ORCID or an empty string
 */
function normalizeOrcid(value) {
    const normalizedValue = normalizeText(value);
    const orcid = normalizedValue.replace(
        /^https?:\/\/(?:www\.)?orcid\.org\//i,
        ""
    );

    return orcid;
}

/**
 * Converts a ROR identifier or resolver URL into a bare identifier.
 *
 * @param {string|null|undefined} value ROR identifier or ROR URL
 * @returns {string} normalized ROR identifier or an empty string
 */
function normalizeRor(value) {
    const normalizedValue = normalizeText(value);
    const ror = normalizedValue.replace(
        /^https?:\/\/(?:www\.)?ror\.org\//i,
        ""
    );

    return ror;
}

/**
 * Returns the first supplied value containing only an HTTP or HTTPS URL.
 *
 * @param {...string} values possible URL values
 * @returns {string} first matching URL or an empty string
 */
function getFirstHttpUrl(...values) {
    // normalize all candidates before checking their complete URL form:
    const normalizedValues = values.map(normalizeText);
    const url = normalizedValues.find(
        (value) => /^https?:\/\/\S+$/i.test(value)
    ) || "";

    return url;
}

/* ---------------------
 * XML and XPath access
 * --------------------- */

/**
 * Converts a simple JATS element path into a namespace-independent XPath.
 * Element predicates are retained unchanged.
 *
 * @param {string} path JATS element path
 * @returns {string} namespace-independent XPath expression
 */
function createLocalNameXPath(path) {
    // process each element in the supplied JATS path:
    const xpathSegments = path
        .split("/")
        .filter(Boolean)
        .map((segment) => {
            // separate the element name from an optional XPath predicate:
            const match = segment.match(/^([^\[]+)(\[.+\])?$/);

            // retain an unexpected segment through a namespace-independent fallback:
            if (!match) {return `*[local-name()="${segment}"]`;}

            const tagName = match[1];
            const predicate = match[2] || "";

            // make the element namespace-independent and retain its predicate:
            return `*[local-name()="${tagName}"]${predicate}`;
        });

    // rebuild the complete XPath from the converted segments:
    const xpath = xpathSegments.join("/");

    return xpath;
}

/**
 * Evaluates a JATS element path relative to an XML node.
 *
 * @param {string} path JATS element path
 * @param {Node} contextNode node from which the search starts
 * @param {number} resultType requested XPath result type
 * @returns {XPathResult} evaluated XPath result
 */
function evaluatePath(path, contextNode, resultType) {
    // use the XML document that owns the supplied context node:
    const documentNode = contextNode.ownerDocument || contextNode;

    // convert the JATS path before passing it to the browser XPath API:
    const xpath = createLocalNameXPath(path);

    // local-name() paths do not require a namespace resolver:
    const namespaceResolver = null;

    // create a new XPath result instead of reusing an existing one:
    const reusableResult = null;

    const result = documentNode.evaluate(xpath,
        contextNode,
        namespaceResolver,
        resultType,
        reusableResult
    );

    return result;
}

/**
 * Returns normalized text from the first node matching a JATS path.
 *
 * @param {string} path JATS element path
 * @param {Node} contextNode node from which the search starts
 * @returns {string} normalized text or an empty string
 */
function getText(path, contextNode) {
    // evaluate the path as a text value:
    const result = evaluatePath(
        path,
        contextNode,
        XPathResult.STRING_TYPE
    );

    // normalize whitespace from the XML text:
    const text = normalizeText(result.stringValue);

    return text;
}

/**
 * Returns the first node matching a JATS path.
 *
 * @param {string} path JATS element path
 * @param {Node} contextNode node from which the search starts
 * @returns {Node|null} first matching node or `null`
 */
function getNode(path, contextNode) {
    // evaluate the path for its first matching node:
    const result = evaluatePath(
        path,
        contextNode,
        XPathResult.FIRST_ORDERED_NODE_TYPE
    );

    const node = result.singleNodeValue || null;
    return node;
}

/**
 * Returns all nodes matching a JATS path in document order.
 *
 * @param {string} path JATS element path
 * @param {Node} contextNode node from which the search starts
 * @returns {Node[]} matching nodes or an empty array
 */
function getNodes(path, contextNode) {
    // evaluate the path as an ordered snapshot of matching nodes:
    const result = evaluatePath(
        path,
        contextNode,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE
    );
    const nodes = [];

    // transfer the XPath snapshot into a regular array for its callers:
    for (let index = 0; index < result.snapshotLength; index += 1) {
        nodes.push(result.snapshotItem(index));
    }
    return nodes;
}

/**
 * Returns the language declared by an XML `xml:lang` attribute.
 *
 * @param {Element} element XML element
 * @returns {string} language code or an empty string
 */
function getXmlLanguage(element) {
    const xmlNamespace = "http://www.w3.org/XML/1998/namespace";

    // prefer namespace-aware access and support prefixed attributes as fallback:
    const language = element.getAttributeNS(xmlNamespace, "lang")
        || element.getAttribute("xml:lang")
        || "";

    return language;
}

/**
 * Returns the target declared by an XML `xlink:href` attribute.
 *
 * @param {Element} element XML element
 * @returns {string} link target or an empty string
 */
function getXlinkHref(element) {
    const xlinkNamespace = "http://www.w3.org/1999/xlink";

    // prefer namespace-aware access and support prefixed attributes as fallback:
    const href = element.getAttributeNS(xlinkNamespace, "href")
        || element.getAttribute("xlink:href")
        || "";

    return href;
}

