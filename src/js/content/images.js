// Document image preparation
// --------------------------
// Public APIs: process, classify, getRatioClass and getCoverBackgroundUrl

const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * Preloads and classifies all images inside a document container.
 *
 * @param {Document|HTMLElement} container
 * @param {Object} [options]
 * @param {string} [options.sizeClass="medium"]
 * @param {Function|null} [options.onProgress=null]
 * @returns {void}
 */
export function process(container, {
        sizeClass = "medium",
        onProgress = null
    } = {}) {
        container.querySelectorAll("img").forEach(sourceImage => {
            const loadedImage = new Image();
            loadedImage.addEventListener("load", () => {
                const figure = sourceImage.parentElement;
                if (!figure) return;

                if (onProgress) onProgress(figure.id);
                classify(loadedImage, sizeClass);
                sourceImage.className = loadedImage.className;
                figure.className = loadedImage.className;
                figure.dataset.imgWidth = loadedImage.naturalWidth;
                figure.dataset.imgHeight = loadedImage.naturalHeight;
            }, { once: true });
            loadedImage.addEventListener("error", () => {
                sourceImage.alt = "Could not convert image: " + loadedImage.src;
                loadedImage.src = TRANSPARENT_PIXEL;
            }, { once: true });
            loadedImage.src = sourceImage.src;
        });
    }

/**
 * Adds configured size and intrinsic-ratio classes to an image.
 *
 * @param {HTMLImageElement} image
 * @param {string} sizeClass
 * @returns {void}
 */
export function classify(image, sizeClass) {
        if (sizeClass) image.classList.add(sizeClass);
        const ratio = image.naturalWidth / image.naturalHeight;
        const ratioClass = getRatioClass(ratio);
        if (ratioClass) image.classList.add(ratioClass);
    }

/**
 * Resolves a layout class for an image aspect ratio.
 *
 * @param {number} ratio
 * @returns {string|false}
 */
export function getRatioClass(ratio) {
        if (!Number.isFinite(ratio) || ratio <= 0) return false;
        if (ratio > 1.2) return "landscape";
        if (ratio >= 0.8) return "square";
        return "portrait";
    }

/**
 * Builds the CSS background value for a configured cover figure.
 *
 * @param {Document|HTMLElement} container
 * @param {string} coverImageId
 * @returns {string}
 */
export function getCoverBackgroundUrl(container, coverImageId) {
        if (!coverImageId) return "url()";
        const image = container.querySelector("#" + coverImageId + " > img");
        return image?.src ? "url(" + image.src + ")" : "url()";
    }
