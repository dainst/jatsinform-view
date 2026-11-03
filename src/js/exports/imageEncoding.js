// Export image encoding
// ---------------------
// Public APIs: convertAllToWebP and convertToDataUrl
// Browser dependencies: canvas, FileReader, and optionally OffscreenCanvas.

/**
 * Converts selected images inside a container to WebP data URLs.
 * Failed conversions retain the original source and are reported through
 * the optional warning callback.
 *
 * @param {HTMLElement} container
 * @param {Object} [options]
 * @param {string} [options.selector="img"]
 * @param {number} [options.quality=0.8]
 * @param {number} [options.concurrency=4]
 * @param {Function|null} [options.onProgress=null]
 * @param {Function|null} [options.onWarning=null]
 * @returns {Promise<{total: number, converted: number, retained: number}>}
 */
export async function convertAllToWebP(container, {
        selector = "img",
        quality = 0.8,
        concurrency = 4,
        onProgress = null,
        onWarning = null
    } = {}) {
        const images = Array.from(container.querySelectorAll(selector));
        let completed = 0;
        let convertedCount = 0;

        if (onProgress) onProgress(completed, images.length);

        const queue = images.map(image => async () => {
            const converted = await convertToDataUrl(
                image,
                "image/webp",
                quality,
                onWarning
            );
            completed++;
            if (converted) convertedCount++;
            if (onProgress) onProgress(completed, images.length);
        });
        const workerCount = Math.min(
            Math.max(1, Number.isFinite(concurrency) ? Math.floor(concurrency) : 1),
            queue.length
        );
        const workers = Array.from({ length: workerCount }, async () => {
            while (queue.length) {
                const task = queue.shift();
                if (task) await task();
            }
        });

        await Promise.all(workers);
        return {
            total: images.length,
            converted: convertedCount,
            retained: images.length - convertedCount
        };
    }

export async function convertToDataUrl(
        image,
        type = "image/webp",
        quality = 0.8,
        onWarning = null
    ) {
        try {
            const source = image.getAttribute("src") || "";
            if (source.startsWith("data:image/webp;base64,")) return false;

            if (!image.complete || image.naturalWidth === 0) {
                await waitForImage(image);
            }

            const canvas = createCanvasFromImage(image);
            image.src = await canvasToDataUrl(canvas, type, quality);

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

    function waitForImage(image) {
        return new Promise((resolve, reject) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener(
                "error",
                () => reject(new Error("Image could not be loaded")),
                { once: true }
            );
        });
    }

    function createCanvasFromImage(image) {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            throw new Error("Cannot convert an image without valid positive dimensions");
        }

        const canvas = "OffscreenCanvas" in window
            ? new OffscreenCanvas(width, height)
            : Object.assign(document.createElement("canvas"), { width, height });
        const context = canvas.getContext("2d");
        if (!context) throw new Error("A 2D canvas context is unavailable");

        context.drawImage(image, 0, 0, width, height);
        return canvas;
    }

    async function canvasToDataUrl(canvas, type = "image/webp", quality = 0.8) {
        const blob = canvas.convertToBlob
            ? await canvas.convertToBlob({ type, quality })
            : await new Promise(resolve => canvas.toBlob(resolve, type, quality));
        if (!blob) throw new Error("Canvas encoding returned no image data");

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener("load", () => resolve(reader.result), { once: true });
            reader.addEventListener("error", reject, { once: true });
            reader.readAsDataURL(blob);
        });
    }
