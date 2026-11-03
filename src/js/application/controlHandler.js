/* ---------------------
 * Application controls
 * --------------------- */
// Routes configured keyboard shortcuts and manage persisted figure interactions.

/* ---------------------
 * Keyboard controls
 * --------------------- */
/**
 * Validates shortcut configuration and attaches its keyup handler.
 *
 * @param {Object} options
 * @param {Document|HTMLElement} options.target event target for keyboard input
 * @param {Object} options.controls application and figure shortcut configuration
 * @param {Object<string, Function>} options.actions application command handlers
 * @param {Function} options.onFigureCommand active-figure command handler
 * @param {Function|null} [options.onWarning=null] configuration warning callback
 * @returns {Function} removes the attached handler
 */
export function attachKeyboardControls({target, controls, 
    actions, onFigureCommand, onWarning = null}) {

    // validate configured shortcuts before attaching the event handler:
    validateShortcutConfiguration(controls, onWarning);

    const keyboardContext = {actions, controls, onFigureCommand, onWarning};
    const handleKeyup = handleKeyboardEvent.bind(null, keyboardContext);

    // attach the handler and return its cleanup operation:
    target.addEventListener("keyup", handleKeyup);
    return () => target.removeEventListener("keyup", handleKeyup);
}

/**
 * Routes a keyboard event to an application or active-figure command.
 *
 * @param {Object} context bound keyboard configuration and command handlers
 * @param {Object} context.controls application and figure shortcut configuration
 * @param {Object<string, Function>} context.actions application command handlers
 * @param {Function} context.onFigureCommand active-figure command handler
 * @param {Function|null} context.onWarning warning callback
 * @param {KeyboardEvent} event keyboard event to route
 * @returns {void}
 */
function handleKeyboardEvent(context, event) {

    // ignore global shortcuts while the user edits content:
    if (event.target instanceof Element && event.target.closest(
        "input, textarea, select, [contenteditable]:not([contenteditable='false'])")) {
        return;
    }

    // stop routing when required shortcut groups are unavailable:
    if (!context.controls?.application || !context.controls?.figure) {
        context.onWarning?.(
            "Keyboard configuration is unavailable",
            { path: "configs/controlKeyList.json" }
        );
        return;
    }

    // dispatch application commands before active-figure commands:
    const applicationCommand = findCommand(context.controls.application, event.key);
    if (applicationCommand) {
        dispatchApplicationCommand(
            applicationCommand,
            context.controls.application,
            context.actions
        );
        return;
    }

    // route remaining shortcuts to active-figure commands:
    const figureCommand = findCommand(context.controls.figure, event.key);
    if (figureCommand) {context.onFigureCommand(figureCommand, context.controls.figure);}
}

/**
 * Finds the configured command assigned to a keyboard key.
 *
 * @param {Object} commands command definitions keyed by command name
 * @param {string} key pressed keyboard key
 * @returns {string|undefined} matching command name
 */
function findCommand(commands, key) {
    return Object.keys(commands).find((name) => {
        return commands[name]?.[0] === key;
    });
}

/**
 * Dispatches a configured application or global figure-size command.
 *
 * @param {string} command configured command name
 * @param {Object} commands application command definitions
 * @param {Object<string, Function>} actions application command handlers
 * @returns {void}
 */
function dispatchApplicationCommand(command, commands, actions) {
    // resolve configured values for parameterized figure-size commands:
    const sizeCommands = {
        setAllFigsToTiny: commands.setAllFigsToTiny?.[1],
        setAllFigsToSmall: commands.setAllFigsToSmall?.[1],
        setAllFigsToMedium: commands.setAllFigsToMedium?.[1],
        setAllFigsToLarge: commands.setAllFigsToLarge?.[1]
    };

    // prefer direct application actions before global figure-size changes:
    if (actions[command]) {
        actions[command]();
    } else if (sizeCommands[command]) {
        actions.setGlobalFigureSize(sizeCommands[command]);
    }
}

/**
 * Validates that every configured shortcut has a keyboard key.
 *
 * @param {Object|null} controlKeyList grouped shortcut configuration
 * @param {Function|null} [onWarning=null] validation warning callback
 * @returns {void}
 */
function validateShortcutConfiguration(controlKeyList, onWarning = null) {
    // inspect every configured application and figure command:
    Object.entries(controlKeyList || {}).forEach(([scope, commands]) => {
        Object.entries(commands || {}).forEach(([name, definition]) => {
            const key = definition?.[0];
            if (typeof key !== "string" || key.length === 0) {
                onWarning?.("Shortcut has no valid key", {
                    command: name,
                    path: "configs/controlKeyList.json",
                    scope});
            }
        });
    });
}

/* ---------------------
 * Figure interaction
 * --------------------- */

/**
 * Creates figure keyboard and resize interactions with injected persistence.
 *
 * @param {Object} options
 * @param {string} options.figureMapKey figure-map storage key
 * @param {string} options.sizeClassKey global figure-size storage key
 * @param {Function} options.readJson reads JSON browser-storage values
 * @param {Function} options.writeJson writes JSON browser-storage values
 * @param {Function} options.writeValue writes plain browser-storage values
 * @param {Function} options.getFigureModelSpecs returns journal figure classes
 * @param {Function} options.applyLayout applies a class to a rendered figure
 * @param {Function|null} [options.onWarning=null] interaction warning callback
 * @returns {{enableResize: Function, handleCommand: Function, setGlobalSize: Function}}
 */
export function createFigureInteraction({
    figureMapKey,
    sizeClassKey,
    readJson,
    writeJson,
    writeValue,
    getFigureModelSpecs,
    applyLayout,
    onWarning = null
}) {
    // retain injected operations and mutable timer state in one context:
    const interactionContext = {
        applyLayout,
        figureMapKey,
        getFigureModelSpecs,
        onWarning,
        readJson,
        reloadTimerId: null,
        sizeClassKey,
        writeJson,
        writeValue
    };

    // bind the public operations to the interaction context:
    return Object.freeze({
        enableResize: enableFigureResize.bind(null, interactionContext),
        handleCommand: handleFigureCommand.bind(null, interactionContext),
        setGlobalSize: setGlobalFigureSize.bind(null, interactionContext)
    });
}

/**
 * Replaces a pending reload with one delayed page reload.
 *
 * @param {Object} context figure interaction context
 * @param {number|null} context.reloadTimerId current reload timer identifier
 * @param {number} [delay=2000] delay before reloading in milliseconds
 * @returns {void}
 */
function scheduleReload(context, delay = 2000) {
    // cancel the previous timer so repeated changes produce one reload:
    window.clearTimeout(context.reloadTimerId);
    // reload after timeout:
    context.reloadTimerId = window.setTimeout(() => {
        window.location.reload();
    }, delay);
}

/**
 * Persists a global figure size and schedules document rerendering.
 *
 * @param {Object} context figure interaction context
 * @param {string} context.sizeClassKey global figure-size storage key
 * @param {Function} context.writeValue writes a plain browser-storage value
 * @param {string} sizeClass configured figure size, such as `small` or `medium`
 * @returns {void}
 */
function setGlobalFigureSize(context, sizeClass) {
    context.writeValue(context.sizeClassKey, sizeClass);
    scheduleReload(context);
}

/**
 * Applies a configured keyboard command to the currently active figure.
 *
 * @param {Object} context figure interaction context
 * @param {string} context.figureMapKey figure-map storage key
 * @param {Function} context.readJson reads JSON browser-storage values
 * @param {Function} context.writeJson writes JSON browser-storage values
 * @param {Function} context.getFigureModelSpecs returns journal figure classes
 * @param {Function} context.applyLayout applies a class to a rendered figure
 * @param {Function|null} context.onWarning interaction warning callback
 * @param {string} command configured figure-command name
 * @param {Object} commands figure command definitions
 * @returns {void}
 */
function handleFigureCommand(context, command, commands) {
    // resolve the active figure and its persisted state:
    const figure = document.querySelector(".active")?.closest("figure");
    if (!figure) {return;}

    // read figure map and validate the active figure configuration:
    const figureMap = context.readJson(context.figureMapKey, {});
    const figureState = figureMap[figure.id];
    const figureModelSpecs = context.getFigureModelSpecs();
    if (!figureState || !figureModelSpecs) {
        context.onWarning?.(
            "Active figure configuration is unavailable",
            { figureId: figure.id }
        );
        return;
    }

    // resolve the current and requested layout classes:
    const currentClass = figureState.typesettingClass ||
        Object.keys(figureModelSpecs).find((className) => {
            return figure.classList.contains(className);
        });
    let newClass = commands[command]?.[1];
    if (command === "toTop") {
        newClass = currentClass;
        figureState.positionClass = "onTopOfPage";
    } 
    else if (command === "switchCaption") {
        newClass = commands.switchCaption?.[1]?.[currentClass];
    }

    if (!newClass || !figureModelSpecs[newClass]) {
        return;
    }

    // apply and persist the updated figure layout:
    context.applyLayout(figure, newClass);
    figureState.typesettingClass = newClass;
    figureState.style = false;
    context.writeJson(context.figureMapKey, figureMap);
    scheduleReload(context);
}

/**
 * Enables aspect-ratio-preserving resizing for rendered figures.
 *
 * @param {Object} context figure interaction context
 * @param {Function} interactApi loaded Interact.js API
 * @returns {void}
 */
function enableFigureResize(context, interactApi) {
    // configure figure resizing and bind movement to persisted interaction state:
    interactApi(".resizable").resizable({
        edges: { top: true, left: true, bottom: true, right: true },
        listeners: {
            move: handleResizeMove.bind(null, context)
        },
        modifiers: [
            interactApi.modifiers.aspectRatio({ ratio: "preserve" })
        ]
    });
}

/**
 * Applies a resize movement to a figure and persists its updated inline style.
 *
 * @param {Object} context figure interaction context
 * @param {string} context.figureMapKey figure-map storage key
 * @param {Function} context.readJson reads JSON browser-storage values
 * @param {Function} context.writeJson writes JSON browser-storage values
 * @param {Function|null} context.onWarning interaction warning callback
 * @param {Object} event Interact.js resize movement event
 * @returns {void}
 */
function handleResizeMove(context, event) {
    // resolve persisted figure state before changing the live figure:
    const figureMap = context.readJson(context.figureMapKey, {});
    const figureState = figureMap[event.target.id];
    if (!figureState) {
        context.onWarning?.(
            "Resizable figure is missing map state",
            { figureId: event.target.id }
        );
        return;
    }

    // mark the active page area while the figure is being resized:
    const pagedArea = event.target.closest(".pagedjs_area");
    if (pagedArea) {
        pagedArea.style.border = "1pt dotted violet";
    }

    // update the live figure dimensions and translation:
    const x = (Number.parseFloat(event.target.dataset.x) || 0) +
        event.deltaRect.left;
    const y = (Number.parseFloat(event.target.dataset.y) || 0) +
        event.deltaRect.top;

    Object.assign(event.target.style, {
        width: `${event.rect.width}px`,
        transform: `translate(${x}px, ${y}px)`
    });
    Object.assign(event.target.dataset, { x, y });

    // persist the resized style and delay document rerendering:
    figureState.style = event.target.getAttribute("style");
    context.writeJson(context.figureMapKey, figureMap);
    scheduleReload(context, 5000);
}
