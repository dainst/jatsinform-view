// Figure constellation generation
// -------------------------------
const allTypesettingClasses = [
    ['false', 'float-w-col-2', 'float-w-col-4','float-w-col-6', 'inset', 'regular', 'regular-bottom', 'overmargin', 'overmargin-bottom'],
    ['false', 'float-w-col-2', 'float-w-col-4','float-w-col-6', 'inset', 'regular', 'regular-bottom', 'overmargin', 'overmargin-bottom'],
    ['false', 'float-w-col-2', 'float-w-col-4','float-w-col-6', 'inset', 'regular', 'regular-bottom', 'overmargin', 'overmargin-bottom']
];

// generate each possible typesettingClass constellation:
const constellationKeys = generateFigConstellationKeys(allTypesettingClasses, "#");
console.log("SETUP \n Generate figConstelleationKeys: ", constellationKeys);

let stats;
let json = "[{";
for (let i = 0; i < constellationKeys.length; i++) {

    const splits = constellationKeys[i].split("#");
    const indexFigBefore = 0;
    const indexCurrentFig = 1;
    const indexNextFig = 2;
    let currentFigureSet;
    let nextFigureSet;

    // default:
    currentFigureSet = "[true, false]" + ",";
    nextFigureSet =  "[true, false]";

    // skip false-cases
    if(splits[indexCurrentFig] === "false"
    && splits[indexNextFig] === "false") {
        currentFigureSet = "[false, false]" + ",";
        nextFigureSet = "[false, false]";
    }
    if(splits[indexNextFig] === "false") {
        nextFigureSet = "[false, false]";
    }

    // avoid order: float and overmargin
    if(/float/.test(splits[indexFigBefore])
    && /overmargin/.test(splits[indexCurrentFig])) {
        currentFigureSet = "[false, false]" + ",";
    }
    if(/float/.test(splits[indexCurrentFig])
    && /overmargin/.test(splits[indexNextFig])) {
        currentFigureSet = "[true, false]" + ",";
        nextFigureSet = "[false, false]";
    }
    // avoid order: float and regular
    if(/float/.test(splits[indexFigBefore])
    && /regular/.test(splits[indexCurrentFig])) {
        currentFigureSet = "[false, false]" + ",";
    }
    // avoid order: float and regular
    if(/float/.test(splits[indexCurrentFig])
    && /regular/.test(splits[indexNextFig])) {
        currentFigureSet = "[true, false]" + ",";
        nextFigureSet = "[false, false]";
    }

    // avoid order: float and regular
    if(/float/.test(splits[indexFigBefore])
        && /inset/.test(splits[indexCurrentFig])) {
            currentFigureSet = "[false, false]" + ",";
        }
    // avoid order: float and inset
    if(/float/.test(splits[indexCurrentFig])
    && /inset/.test(splits[indexNextFig])) {
        currentFigureSet = "[true, false]" + ",";
        nextFigureSet = "[false, false]";
    }
    
    // avoid collision of figCaptions (overmargin -> float)
    if(/overmargin/.test(splits[indexFigBefore])
    && /float/.test(splits[indexCurrentFig])) {
        currentFigureSet = "[true, \"regular-bottom\"]" + ",";
    }
    // avoid collision of figCaptions (overmargin -> float)
    if(/overmargin/.test(splits[indexCurrentFig])
    && /float/.test(splits[indexNextFig])) {
        currentFigureSet = "[true, \"overmargin-bottom\"]" + ",";
        nextFigureSet = "[true, false]";
    }
    // avoid collision of figCaptions (overmargin -> overmargin)
    if(/overmargin/.test(splits[indexFigBefore])
    && /overmargin/.test(splits[indexCurrentFig])) {
        currentFigureSet = "[true, \"regular-bottom\"]" + ",";
    }
    // avoid collision of figCaptions (overmargin -> float)
    if(/overmargin/.test(splits[indexCurrentFig])
    && /overmargin/.test(splits[indexNextFig])) {
        currentFigureSet = "[true, \"overmargin-bottom\"]" + ",";
        nextFigureSet = "[true, false]";
    }

    // adjust width-type of floats 
    if(/float-w-col-2/.test(splits[indexFigBefore])
    && /float/.test(splits[indexCurrentFig])) {
        currentFigureSet = "[false, \"float-w-col-2\"]" + ",";
    }
    if(/float-w-col-2/.test(splits[indexCurrentFig])
    && /float/.test(splits[indexNextFig])) {
        nextFigureSet = "[false, \"float-w-col-2\"]";
    }
    if(/float-w-col-4/.test(splits[indexFigBefore])
    && /float/.test(splits[indexCurrentFig])) {
        currentFigureSet = "[false, \"float-w-col-4\"]" + ",";
    }
    if(/float-w-col-4/.test(splits[indexCurrentFig])
    && /float/.test(splits[indexNextFig])) {
        nextFigureSet = "[false, \"float-w-col-4\"]";
    }
    if(/float-w-col-6/.test(splits[indexFigBefore])
    && /float/.test(splits[indexCurrentFig])) {
        currentFigureSet = "[false, \"float-w-col-6\"]" + ",";
    }
    if(/float-w-col-6/.test(splits[indexCurrentFig])
    && /float/.test(splits[indexNextFig])) {
        nextFigureSet = "[false, \"float-w-col-6\"]";
    }

    stats = "\"" + splits.join("#") + "\": {";
    stats += "\"currentFigure\":" + currentFigureSet;
    stats += "\"nextFigure\":" + nextFigureSet;
    stats +=  "},";
    json += stats;
}

json += "}]";
console.log(json);

function generateFigConstellationKeys(array, separator) {

    const result = [];
    let allCasesRest;
    if (array.length === 1) {
        return array[0];
    }
    else {
        allCasesRest = generateFigConstellationKeys(array.slice(1), separator);
        for (let i = 0; i < allCasesRest.length; i++) {
            for (let j = 0; j < array[0].length; j++) {
                result.push(array[0][j] + separator + allCasesRest[i]);
            }
        }
        return result;
    }
}
