/* -----------
 * Images
 * --------- */

// complete failed image preparation with an embedded 1×1 fallback:
const IMAGE_FALLBACK_DATA_URL = 
"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * Preloads and classifies all images inside a document container.
 *
 * @param {Document|HTMLElement} container content containing images to prepare
 * @param {Object} [options]
 * @param {string} [options.sizeClass="medium"] default image size class
 * @param {Function|null} [options.onProgress=null] callback receiving each loaded figure ID
 * @returns {void}
 */
export function prepareImages(container, {sizeClass = "medium", onProgress = null} = {}) {
    // preload each source image to read its intrinsic dimensions:
    container.querySelectorAll("img").forEach(sourceImage => {
        const loadedImage = new Image();

        // classify loaded images and retain their dimensions on the figure:
        loadedImage.addEventListener("load", () => {
            const figure = sourceImage.parentElement;
            if (!figure) return;

            onProgress?.(figure.id);
            classifyImage(loadedImage, sizeClass);
            sourceImage.className = loadedImage.className;
            figure.className = loadedImage.className;
            figure.dataset.imgWidth = loadedImage.naturalWidth;
            figure.dataset.imgHeight = loadedImage.naturalHeight;
        }, { once: true });

        // report failed sources and complete loading with a transparent placeholder:
        loadedImage.addEventListener("error", () => {
            sourceImage.alt = "Could not convert image: " + loadedImage.src;
            loadedImage.src = IMAGE_FALLBACK_DATA_URL;
        }, { once: true });
        loadedImage.src = sourceImage.src;
    });
}

/**
 * Adds configured size and intrinsic-ratio classes to an image.
 *
 * @param {HTMLImageElement} image loaded image to classify
 * @param {string} sizeClass default image size class
 * @returns {void}
 */
function classifyImage(image, sizeClass) {
    if (sizeClass) image.classList.add(sizeClass);
    const ratio = image.naturalWidth / image.naturalHeight;
    const ratioClass = getImageRatioClass(ratio);
    if (ratioClass) image.classList.add(ratioClass);
}

/**
 * Resolves a layout class for an image aspect ratio.
 *
 * @param {number} ratio image width divided by image height
 * @returns {string|false} image ratio class or false for an invalid ratio
 */
function getImageRatioClass(ratio) {
    if (!Number.isFinite(ratio) || ratio <= 0) return false;
    if (ratio > 1.2) return "landscape";
    if (ratio >= 0.8) return "square";
    return "portrait";
}

/**
 * Builds the CSS background value for a configured cover figure.
 *
 * @param {Document|HTMLElement} container content containing the cover figure
 * @param {string} coverImageId cover figure identifier
 * @returns {string} CSS background-image value or an empty URL
 */
export function getCoverBackgroundUrl(container, coverImageId) {
    if (!coverImageId) return "url()";
    const image = container.querySelector("#" + coverImageId + " > img");
    return image?.src ? "url(" + image.src + ")" : "url()";
}
