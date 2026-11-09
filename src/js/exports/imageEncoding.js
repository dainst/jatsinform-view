/* ---------------------
 * Batch image conversion
 * --------------------- */

// limit concurrent canvas operations to avoid excessive browser workload:
const MAX_CONCURRENT_CONVERSIONS = 4;

/**
 * Converts a collection of selected images to WebP data URLs.
 * Failed conversions retain the original source and are reported through
 * the optional warning callback.
 *
 * @param {NodeListOf<HTMLImageElement>|HTMLImageElement[]} images selected images
 * @param {Object} [options]
 * @param {number} [options.quality=0.8]
 * @param {Function|null} [options.onProgress=null]
 * @param {Function|null} [options.onWarning=null]
 * @returns {Promise<{total: number, converted: number, retained: number}>}
 */

export async function convertAllToWebP(images, 
    {quality = 0.8, onProgress = null, onWarning = null} = {}) {

    // collect the selected images and initialize conversion progress:
    const selectedImages = Array.from(images);
    let completed = 0;
    let convertedCount = 0;

    if (onProgress) onProgress(completed, selectedImages.length);

    // create one conversion task for each image:
    const queue = selectedImages.map(image => async () => {
        try {
            const converted = await convertImageToDataUrl(
                image,
                "image/webp",
                quality,
                onWarning
            );
            if (converted) convertedCount++;
        } finally {
            // count failed conversions so they cannot block export progress:
            completed++;
            if (onProgress) onProgress(completed, selectedImages.length);
        }
    });

    // process the conversion queue with limited concurrency:
    const workerCount = Math.min(
        MAX_CONCURRENT_CONVERSIONS,
        queue.length
    );
    const workers = Array.from({ length: workerCount }, async () => {
        while (queue.length) {
            const task = queue.shift();
            if (task) await task();
        }
    });

    await Promise.all(workers);

    // summarize converted and retained images:
    return {
        total: selectedImages.length,
        converted: convertedCount,
        retained: selectedImages.length - convertedCount
    };
}

/* ---------------------
 * Individual image conversion
 * --------------------- */

/**
 * Replaces an image source with an encoded data URL.
 * The original source is retained and a warning is reported when conversion
 * fails.
 *
 * @param {HTMLImageElement} image image element to convert
 * @param {string} [type="image/webp"] target image MIME type
 * @param {number} [quality=0.8] encoder quality
 * @param {Function|null} [onWarning=null] failed-conversion callback
 * @returns {Promise<boolean>} whether the image was converted
 */
export async function convertImageToDataUrl(image, 
    type = "image/webp", quality = 0.8, onWarning = null) {

    try {
        const source = image.getAttribute("src") || "";

        // skip images already encoded in the requested export format:
        if (source.startsWith(`data:${type}`)) return false;

        // ensure that the source image is available for drawing:
        if (!image.complete) {
            await waitForImage(image);
        }

        // a completed image without dimensions has already failed to load:
        if (image.naturalWidth === 0) {
            throw new Error("Image could not be loaded");
        }

        // draw and encode the source image:
        const canvas = createCanvasFromImage(image);
        image.src = await canvasToDataUrl(canvas, type, quality);

        // preserve the original figure dimensions for exported layouts:
        const figure = image.closest("figure");
        if (figure) {
            figure.dataset.imgWidth = image.naturalWidth;
            figure.dataset.imgHeight = image.naturalHeight;
        }
        return true;

    } catch (error) {
        if (onWarning) {
            onWarning(error, image.currentSrc || image.getAttribute("src") || "");
        }
        return false;
    }
}

/**
 * Waits until an image has loaded or failed and removes obsolete listeners.
 *
 * @param {HTMLImageElement} image image being loaded
 * @returns {Promise<void>}
 */
function waitForImage(image) {
    const imageLoad = new Promise((resolve, reject) => {
        // define load and error handles:
        const handleLoad = () => {
            image.removeEventListener("load", handleLoad);
            image.removeEventListener("error", handleError);
            resolve();
        };
        const handleError = () => {
            image.removeEventListener("load", handleLoad);
            image.removeEventListener("error", handleError);
            reject(new Error("Image could not be loaded"));
        };
        // add the handles:
        image.addEventListener("load", handleLoad, { once: true });
        image.addEventListener("error", handleError, { once: true });

        // settle immediately if loading finished before the listeners attached:
        if (image.complete) {
            if (image.naturalWidth > 0) handleLoad();
            else handleError();
        }
    });

    return imageLoad;
}

/* ---------------------
 * Canvas encoding
 * --------------------- */

/**
 * Draws an image onto a supported canvas implementation.
 *
 * @param {HTMLImageElement} image loaded source image
 * @returns {HTMLCanvasElement|OffscreenCanvas} canvas containing the image
 * @throws {Error} when the image cannot be drawn
 */
function createCanvasFromImage(image) {
    // determine and validate the drawable image dimensions:
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (
        !Number.isFinite(width)
        || !Number.isFinite(height)
        || width <= 0
        || height <= 0
    ) {
        throw new Error("Cannot convert an image without valid positive dimensions");
    }

    // create the supported canvas implementation and draw the image:
    const canvas = "OffscreenCanvas" in window
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement("canvas"), { width, height });
    const context = canvas.getContext("2d");
    if (!context) throw new Error("A 2D canvas context is unavailable");

    context.drawImage(image, 0, 0, width, height);
    return canvas;
}

/**
 * Encodes a canvas and returns its contents as a data URL.
 *
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas source canvas
 * @param {string} [type="image/webp"] target image MIME type
 * @param {number} [quality=0.8] encoder quality
 * @returns {Promise<string>} encoded image data URL
 */
async function canvasToDataUrl(canvas, type = "image/webp", quality = 0.8) {
    // encode the canvas using the available browser API:
    const blob = canvas.convertToBlob
        ? await canvas.convertToBlob({ type, quality })
        : await new Promise(resolve => canvas.toBlob(resolve, type, quality));
    if (!blob) throw new Error("Canvas encoding returned no image data");

    // convert the encoded blob into a data URL:
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve(reader.result), { once: true });
        reader.addEventListener("error", reject, { once: true });
        reader.readAsDataURL(blob);
    });
}
