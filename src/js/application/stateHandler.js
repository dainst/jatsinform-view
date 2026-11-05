/* ------------------------
 * Browser storage (state)
 * -----------------------*/

/**
 * Creates a storage adapter with explicit warning and error policies.
 *
 * @param {Object} [options]
 * @param {Function|null} [options.onWarning=null]
 * @param {Function|null} [options.createWriteError=null]
 * @returns {{get: Function, getJson: Function, set: Function, setJson: Function, remove: Function}}
 */
export function createStorage({ onWarning = null, createWriteError = null } = {}) {
    const storageContext = { createWriteError, onWarning };

    return Object.freeze({
        get: getStorageValue.bind(null, storageContext),
        getJson: getJsonStorageValue.bind(null, storageContext),
        remove: removeStorageValue.bind(null, storageContext),
        set: setStorageValue.bind(null, storageContext, false),
        setJson: setStorageValue.bind(null, storageContext, true)
    });
}

/**
 * Reads a plain value from browser storage.
 *
 * @param {Object} context storage warning and error policies
 * @param {Function|null} context.onWarning storage warning callback
 * @param {string} key browser-storage key
 * @param {string|null} [fallback=null] value returned when the key is absent or storage cannot be read
 * @returns {string|null} stored value or fallback
 */
function getStorageValue(context, key, fallback = null) {
    try {
        const value = window.localStorage.getItem(key);
        return value === null ? fallback : value;
    } catch (error) {
        context.onWarning?.("Could not read browser storage", { key, error });
        return fallback;
    }
}
/**
 * Reads and parses a JSON value from browser storage.
 *
 * @param {Object} context storage warning and error policies
 * @param {Function|null} context.onWarning storage warning callback
 * @param {string} key browser-storage key
 * @param {*} [fallback=null] value returned when the key is absent, unreadable, or malformed
 * @returns {*} parsed JSON value or fallback
 */
function getJsonStorageValue(context, key, fallback = null) {
    const value = getStorageValue(context, key);
    if (value === null) return fallback;

    try {
        return JSON.parse(value);
    } catch (error) {
        context.onWarning?.("Ignoring malformed browser storage", { key, error });
        return fallback;
    }
}

/**
 * Writes a plain or JSON-serialized value to browser storage.
 *
 * @param {Object} context storage warning and error policies
 * @param {Function|null} context.createWriteError creates an application-specific write error
 * @param {boolean} serializeAsJson whether to serialize the value as JSON
 * @param {string} key browser-storage key
 * @param {*} value plain or JSON-compatible value to store
 * @returns {void}
 * @throws {Error} when the value cannot be serialized or storage cannot be written
 */

function setStorageValue(context, serializeAsJson, key, value) {

    // serialize storage value (string or json)
    const storageValue = serializeAsJson ? JSON.stringify(value) : String(value);

    // set storage value:
    try {
        window.localStorage.setItem(key, storageValue);
    } catch (cause) {
        const message = "Could not write browser storage: " + key;
        const details = { key, cause };
        if (context.createWriteError) {
            throw context.createWriteError(message, details);
        }

        const error = new Error(message);
        error.details = details;
        throw error;
    }
}

/**
 * Removes a value from browser storage.
 *
 * @param {Object} context storage warning and error policies
 * @param {Function|null} context.onWarning storage warning callback
 * @param {string} key browser-storage key to remove
 * @returns {void}
 */

function removeStorageValue(context, key) {
    try {
        window.localStorage.removeItem(key);
    } catch (error) {
        context.onWarning?.("Could not remove browser storage", { key, error });
    }
}

/* ---------------------
 * Scroll state
 * --------------------- */

/**
 * Restores the persisted scroll position and enables position tracking.
 *
 * @param {Object} options
 * @param {Function} options.getStateProperty reads a document-state property
 * @param {Function} options.writeState writes the current document state
 * @param {number} [options.restorationTimeout=10000] maximum restoration wait in milliseconds
 * @returns {void}
 */
export function restoreScrollState({getStateProperty, writeState, restorationTimeout = 10000}) {
    
    // resolve and normalize the persisted scroll position:
    document.body.classList.add("blur");
    const storedPosition = getStateProperty("scrollPosition");
    const position = Array.isArray(storedPosition) && storedPosition.length >= 2
        ? storedPosition
        : [0, 0];
    const scrollLeft = toFiniteNumber(position[0]);
    const scrollTop = toFiniteNumber(position[1]);
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const startedAt = Date.now();

    // restore once the rendered document can reach the saved position:
    const intervalId = window.setInterval(() => {
        const documentHeight = getDocumentHeight();
        const timedOut = Date.now() - startedAt >= restorationTimeout;
        if (!timedOut && scrollTop > 0 && scrollTop > documentHeight - windowHeight) {
            window.scrollTo(scrollLeft, documentHeight);
            return;
        }

        window.scrollTo(scrollLeft, scrollTop);
        window.clearInterval(intervalId);
        window.setTimeout(() => {
            window.scrollTo(scrollLeft, scrollTop);
            document.body.classList.remove("blur");
        }, 100);
    }, 50);

    // debounce persistence of subsequent scroll changes:
    const savePosition = debounce(() => {
        const currentTop = window.pageYOffset || document.documentElement.scrollTop;
        const currentLeft = window.pageXOffset || document.documentElement.scrollLeft;
        writeState({
            documentId: getStateProperty("documentId"),
            scrollPosition: [currentLeft, currentTop]
        });
    }, 100);

    // enable persistence after initial restoration has settled:
    window.setTimeout(() => {
        window.addEventListener("scroll", savePosition);
    }, 1000);
}

/**
 * Converts a value to a finite number or returns zero.
 *
 * @param {*} value value to normalize
 * @returns {number} finite numeric value
 */
function toFiniteNumber(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

/**
 * Returns the greatest measured document height.
 *
 * @returns {number} current document height in pixels
 */
function getDocumentHeight() {
    return Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight,
        document.body.clientHeight,
        document.documentElement.clientHeight
    );
}

/**
 * Creates a callback that runs after calls stop for the configured delay.
 *
 * @param {Function} callback callback to delay
 * @param {number} wait delay in milliseconds
 * @returns {Function} debounced callback
 */
function debounce(callback, wait) {
    let timeoutId = null;
    return function debounced(...args) {
        const context = this;
        window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => callback.apply(context, args), wait);
    };
}
