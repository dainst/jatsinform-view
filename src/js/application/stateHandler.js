// Application state and scroll restoration
// ----------------------------------------
// Public APIs: create and restore scroll position

/**
 * Creates a storage adapter with explicit warning and error policies.
 *
 * @param {Object} [options]
 * @param {Function|null} [options.onWarning=null]
 * @param {Function|null} [options.createWriteError=null]
 * @returns {{get: Function, getJson: Function, set: Function, setJson: Function, remove: Function}}
 */
export function create({ onWarning = null, createWriteError = null } = {}) {
        function warn(message, details) {
            if (onWarning) onWarning(message, details);
        }

        function get(key, fallback = null) {
            try {
                const value = window.localStorage.getItem(key);
                return value === null ? fallback : value;
            } catch (error) {
                warn("Could not read browser storage", { key, error });
                return fallback;
            }
        }

        function getJson(key, fallback = null) {
            const value = get(key);
            if (value === null) return fallback;

            try {
                return JSON.parse(value);
            } catch (error) {
                warn("Ignoring malformed browser storage", { key, error });
                return fallback;
            }
        }

        function set(key, value) {
            try {
                window.localStorage.setItem(key, String(value));
            } catch (cause) {
                const message = "Could not write browser storage: " + key;
                const details = { key, cause };
                if (createWriteError) throw createWriteError(message, details);

                const error = new Error(message);
                error.details = details;
                throw error;
            }
        }

        function setJson(key, value) {
            set(key, JSON.stringify(value));
        }

        function remove(key) {
            try {
                window.localStorage.removeItem(key);
            } catch (error) {
                warn("Could not remove browser storage", { key, error });
            }
        }

        return Object.freeze({ get, getJson, remove, set, setJson });
    }

// Scroll restoration and persistence
// ----------------------------------

export function restore({
        getStateProperty,
        writeState,
        restorationTimeout = 10000
    }) {
        document.body.classList.add("blur");
        const storedPosition = getStateProperty("scrollPosition");
        const position = Array.isArray(storedPosition) && storedPosition.length >= 2
            ? storedPosition
            : [0, 0];
        const scrollLeft = toFiniteNumber(position[0]);
        const scrollTop = toFiniteNumber(position[1]);
        const windowHeight = window.innerHeight || document.documentElement.clientHeight;
        const startedAt = Date.now();

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

        const savePosition = debounce(() => {
            const currentTop = window.pageYOffset || document.documentElement.scrollTop;
            const currentLeft = window.pageXOffset || document.documentElement.scrollLeft;
            writeState({
                documentId: getStateProperty("documentId"),
                scrollPosition: [currentLeft, currentTop]
            });
        }, 100);

        window.setTimeout(() => {
            window.addEventListener("scroll", savePosition);
        }, 1000);
    }

    function toFiniteNumber(value) {
        return Number.isFinite(Number(value)) ? Number(value) : 0;
    }

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

    function debounce(callback, wait) {
        let timeoutId = null;
        return function debounced(...args) {
            const context = this;
            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => callback.apply(context, args), wait);
        };
    }
