// Scholarly article JSON-LD metadata
// ----------------------------
// Public API: mapJATSFrontToScholarlyArticle(front, json)
// Browser dependencies: DOMParser and XPathResult.

/**
 * Namespace-agnostic JATS <front> -> Schema.org ScholarlyArticle (JSON-LD).
 * - Accepts a <front> Element or an XML string.
 * - Optionally merges into an existing JSON object (second param).
 * - Returns the resulting JSON-LD object.
 */
export function mapJATSFrontToScholarlyArticle(front, json = {}) {
    // Parse to a DOM if given a string
    let frontEl;
    if (typeof front === "string") {
      const parser = new DOMParser();
      const doc = parser.parseFromString(front, "application/xml");
      frontEl = doc.documentElement;
    } else {
      frontEl = front;
    }
    if (!frontEl) return json;
  
    // XPath helpers use local-name() so default JATS namespaces are supported.
    // Turn 'a/b[@attr="v"]/c' into '*[local-name()="a"]/*[local-name()="b"][@attr="v"]/*[local-name()="c"]'
    const lnPath = (p) =>
      p
        .split("/")
        .filter(Boolean)
        .map(seg => {
          // keep predicates as-is
          const m = seg.match(/^([^\[]+)(\[.+\])?$/);
          if (!m) return `*[local-name()="${seg}"]`;
          const [, tag, predicate = ""] = m;
          return `*[local-name()="${tag}"]${predicate}`;
        })
        .join("/");
  
    const xEval = (expr, ctx = frontEl, type = XPathResult.ORDERED_NODE_SNAPSHOT_TYPE) =>
      (ctx.ownerDocument || ctx).evaluate(expr, ctx, null, type, null);
  
    const getText = (path, ctx = frontEl) => {
      const r = xEval(lnPath(path), ctx, XPathResult.STRING_TYPE);
      const v = r && typeof r.stringValue === "string" ? r.stringValue.trim() : "";
      return v;
    };
    const getNode = (path, ctx = frontEl) => {
      const r = xEval(lnPath(path), ctx, XPathResult.FIRST_ORDERED_NODE_TYPE);
      return r.singleNodeValue || null;
    };
    const getNodes = (path, ctx = frontEl) => {
      const r = xEval(lnPath(path), ctx, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE);
      const arr = [];
      for (let i = 0; i < r.snapshotLength; i++) arr.push(r.snapshotItem(i));
      return arr;
    };
    const textOf = (el) => (el ? (el.textContent || "").trim() : "");
  
    // Mapping helpers
    const cleanDOI = (v) => (v || "").trim().replace(/^https?:\/\/doi\.org\//i, "");
    const toISODate = (y, m, d) => {
      if (!y) return "";
      const mm = m ? String(parseInt(m, 10)).padStart(2, "0") : "";
      const dd = d ? String(parseInt(d, 10)).padStart(2, "0") : "";
      return [y.padStart(4, "0"), mm, dd].filter(Boolean).join("-");
    };

    // Matches contribs by type and returns array of Person objects
    function getContribsByType(frontEl, types) {
        // Build XPath OR expression
        const expr = `article-meta/contrib-group/contrib[${types
        .map(t => `@contrib-type='${t}'`)
        .join(" or ")}]`;
        const nodes = getNodes(expr, frontEl);
    
        return nodes.map(c => {
        const given = getText("name/given-names", c);
        const family = getText("name/surname", c);
        const prefix = getText("name/prefix", c);
        const fullName = [prefix, given, family].filter(Boolean).join(" ").trim() || (given || family);
    
        const orcid = getText("contrib-id[@contrib-id-type='orcid']", c) || undefined;
    
        const instName = getText("aff/institution", c) || getText("aff/institution-wrap/institution", c) || undefined;
        const ror      = getText("aff/institution-wrap/institution-id[@institution-id-type='ROR']", c) || undefined;
    
        const addrLine = getText("aff/addr-line", c);
        const city     = getText("aff/city", c);
        const country  = getText("aff/country", c);
        const email    = getText("aff/email", c);
    
        const affiliation = (instName || ror || addrLine || city || country)
            ? {
                "@type": "Organization",
                name: instName || undefined,
                identifier: ror ? { "@type": "PropertyValue", propertyID: "ROR", value: ror } : undefined,
                address: (addrLine || city || country) ? {
                "@type": "PostalAddress",
                streetAddress: addrLine || undefined,
                addressLocality: city || undefined,
                addressCountry: country || undefined,
                } : undefined,
            }
            : undefined;
    
        return {
            "@type": "Person",
            name: fullName || undefined,
            honorificPrefix: prefix || undefined,
            givenName: given || undefined,
            familyName: family || undefined,
            email: email || undefined,
            identifier: orcid ? { "@type": "PropertyValue", propertyID: "ORCID", value: orcid } : undefined,
            sameAs: orcid || undefined,
            affiliation: affiliation || undefined,
        };
        });
    }
  
    // Journal and periodical metadata
    const journalTitle = getText("journal-meta/journal-title-group/journal-title"); // <- FIXED (works w/ or w/o ns)
    const issnOnline = getText('journal-meta/issn[@publication-format="online"]');
    const issnPrint  = getText('journal-meta/issn[@publication-format="print"]');
    const isbnPrint  = getText('journal-meta/isbn[@publication-format="print"]');
    const journalIdDoiUrl = getText('journal-meta/journal-id[@journal-id-type="doi"]');
    const journalDoi = cleanDOI(journalIdDoiUrl) || undefined;
  
    const publisherName = getText("journal-meta/publisher/publisher-name");
    const pubAddrInst   = getText("journal-meta/publisher/publisher-loc/institution");
    const pubAddrLine   = getText("journal-meta/publisher/publisher-loc/addr-line");
    const pubCityRaw    = getText("journal-meta/publisher/publisher-loc/city");
    const pubCountry    = getText("journal-meta/publisher/publisher-loc/country");
    const pubUrl        = getText('journal-meta/publisher/publisher-loc/ext-link[@ext-link-type="uri"]');
  
    let postalCode = "";
    let addressLocality = pubCityRaw;
    const mCity = pubCityRaw.match(/^(\d{4,6})\s+(.+)$/);
    if (mCity) {
      postalCode = mCity[1];
      addressLocality = mCity[2];
    }
  
    const publisher = publisherName
      ? {
          "@type": "Organization",
          name: publisherName,
          url: pubUrl || undefined,
          department: pubAddrInst || undefined,
          address: (pubAddrLine || addressLocality || postalCode || pubCountry) ? {
            "@type": "PostalAddress",
            streetAddress: pubAddrLine || undefined,
            addressLocality: addressLocality || undefined,
            postalCode: postalCode || undefined,
            addressCountry: pubCountry || undefined,
          } : undefined,
        }
      : undefined;
  
    const periodical = (journalTitle || issnOnline || issnPrint || journalDoi || isbnPrint)
      ? {
          "@type": "Periodical",
          name: journalTitle || undefined,
          issn: [issnPrint, issnOnline].filter(Boolean).join(", ") || undefined,
          identifier: [
            journalDoi && { "@type": "PropertyValue", propertyID: "doi", value: journalDoi },
            isbnPrint && { "@type": "PropertyValue", propertyID: "isbn", value: isbnPrint },
          ].filter(Boolean),
          publisher: publisher || undefined,
        }
      : undefined;
  
    // Article metadata
    const articleTitle    = getText("article-meta/title-group/article-title");
    const articleSubtitle = getText("article-meta/title-group/subtitle");
  
    const articleDoiUrl = getText('article-meta/article-id[@pub-id-type="doi"]');
    const articleDOI    = cleanDOI(articleDoiUrl) || undefined;

    // get contributors:
    const authors = getContribsByType(frontEl, ['author']);
    const coauthors = getContribsByType(frontEl, ['co-author']);
    const editors = getContribsByType(frontEl, ['editor']);
  
    // Prefer a 'pub' or 'collection' date, otherwise the first pub-date present
    let pubDateNode =
      getNode('article-meta/pub-date[@date-type="pub"]') ||
      getNode('article-meta/pub-date[@pub-type="collection"]') ||
      getNode("article-meta/pub-date");
    const datePublished = pubDateNode
      ? toISODate(
          getText("year", pubDateNode),
          getText("month", pubDateNode),
          getText("day", pubDateNode)
        )
      : undefined;
  
    const volumeRaw = getText("article-meta/volume"); // might be "65•2024"; keep verbatim
  
    // Canonical URL: try self-uri (online-url), else DOI
    const selfUri = getText('article-meta/self-uri[@content-type="online-url"]');
    const canonicalUrl = selfUri || (articleDOI ? `https://doi.org/${articleDOI}` : undefined);
  
    // Abstract (first <abstract> text); multilingual abstracts → additional entries in 'abstract' as objects
    const abstractEl = getNode("article-meta/abstract");
    const abstractMain = abstractEl ? textOf(abstractEl).replace(/\s+/g, " ").trim() : undefined;
  
    const transAbstractEls = getNodes("article-meta/trans-abstract");
    const abstracts = [];
    if (abstractMain) abstracts.push(abstractMain);
    transAbstractEls.forEach(el => {
      const lang = el.getAttribute("xml:lang") || el.getAttributeNS("http://www.w3.org/XML/1998/namespace", "lang");
      const txt = textOf(el).replace(/\s+/g, " ").trim();
      if (txt) {
        abstracts.push({ "@value": txt, "@language": lang || undefined });
      }
    });
  
    // Keywords → DefinedTerms (preserve lang per group)
    const kwGroups = getNodes("article-meta/kwd-group");
    const aboutTerms = [];
    kwGroups.forEach(grp => {
      const inLang = grp.getAttribute("xml:lang") || grp.getAttributeNS("http://www.w3.org/XML/1998/namespace", "lang") || undefined;
      getNodes("kwd", grp).forEach(kw => {
        const name = textOf(kw);
        if (name) {
          aboutTerms.push({ "@type": "DefinedTerm", name, inLanguage: inLang || undefined });
        }
      });
    });
  
    // Permissions / License
    const licenseOnline = getText('article-meta/permissions/license[@license-type="online"]/license-p[@content-type="terms-of-use"]') ||
                          getText("article-meta/permissions/license/license-p[@content-type='terms-of-use']") ||
                          getText("article-meta/permissions/license"); // may already be a URL
    const copyrightStatement = getText("article-meta/permissions/copyright-statement");
    const copyrightHolder = getText("article-meta/permissions/copyright-holder");
    const copyrightYear   = getText("article-meta/permissions/copyright-year") ||
                            getText("article-meta/permissions/copyright-statement").match(/\b(19|20)\d{2}\b/)?.[0];

  
    // JSON-LD result
    const base = {
      "@context": "https://schema.org",
      "@type": "ScholarlyArticle",
  
      // Identity
      headline: articleTitle || undefined,
      name: articleTitle || undefined,
      alternateHeadline: articleSubtitle || undefined,
  
      // DOI + URL
      identifier: articleDOI
        ? { "@type": "PropertyValue", propertyID: "doi", value: articleDOI }
        : undefined,
      url: canonicalUrl || undefined,
  
      // Publication
      isPartOf: periodical || undefined,
      volumeNumber: volumeRaw || undefined,
      datePublished: datePublished || undefined,
  
      // People
      author: authors.length ? authors : undefined,
      contributor: coauthors.concat(editors).length ? coauthors.concat(editors) : undefined,

      // Publisher
      publisher: publisher || undefined,
  
      // Content
      abstract: abstracts.length === 1 ? abstracts[0] : (abstracts.length ? abstracts : undefined),
      about: aboutTerms.length ? aboutTerms : undefined,
  
      // Rights
      copyrightHolder: copyrightHolder || undefined,
      copyrightYear: copyrightYear || undefined,
      copyrightNotice : copyrightStatement || undefined,
      license: licenseOnline && /^https?:\/\//i.test(licenseOnline) ? licenseOnline : undefined,
      isAccessibleForFree: !!(licenseOnline && /^https?:\/\//i.test(licenseOnline)),
    };
  
    // Merge into incoming json without dropping user-supplied extras.
    Object.keys(base).forEach(k => {
      if (base[k] !== undefined && base[k] !== null && !(Array.isArray(base[k]) && base[k].length === 0)) {
        json[k] = base[k];
      }
    });
  
    return json;
}
