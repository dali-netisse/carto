import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import path from 'path';
import fs from 'fs'; // Needed for checking file existence for default paths & output

import * as configLoader from './configLoader.js';
import * as elementProcessor from './elementProcessor.js';
import * as svgParser from './svgParser.js';
import *  as geometry from './geometry.js';
import * as svgTransformParser from './svgTransformParser.js';
import * as nodeTransformer from './nodeTransformer.js';
import * as geometrySimplifier from './geometrySimplifier.js';
// import * as geometryUtils from './geometryUtils.js'; // Not directly used in converter

export async function runConverter(customArgv) {
  // --- 1. Initialization and Configuration Loading ---
  // console.log("--- Initializing Configuration ---"); // Keep logs minimal for testing
  const config = {
    svgTransformParser,
    nodeTransformer,
    geometrySimplifier,
    geometry, // Pass the whole module
    // Data will be loaded next
  };

  const sitesMapPath = customArgv.sitesMapPath || 'laposte-map-data/src/sites-map';
  config.sitesMap = configLoader.loadSitesMap(sitesMapPath);
  config.idFixes = configLoader.loadJsonData(customArgv.idFixesPath || 'data/idFixes.json');
  config.calageData = configLoader.loadJsonData(customArgv.calageDataPath || 'data/calageData.json');
  
  // --- 2. Filename Parsing for Site and Floor ---
  let siteId = customArgv.site; // Use provided site if available
  let floor = customArgv.floor || 'unknown'; // Use provided floor if available
  let siteNameGuess = '';

  const inputFilePath = customArgv.file;
  const filename = path.basename(inputFilePath);
  
  if (!siteId || floor === 'unknown') { // Only parse filename if site or floor not fully specified
    // Adjusted Regex from Perl
    const filenameRegex = /([-\w\s]+?\d*)[-\s](?:R\+(\d+)|R(-\d+)|(RDC|E[01]?|M|P\d*|S\d+|SS\d+))\.svg$/i;
    const match = filename.match(filenameRegex);

    if (match) {
      siteNameGuess = match[1].trim();
      if (floor === 'unknown') { // Only set floor if not overridden
        if (match[2]) floor = match[2];        // R+<floor>
        else if (match[3]) floor = match[3];   // R-<floor> (negative)
        else if (match[4]) floor = match[4].toUpperCase(); // RDC, E0, M, P0 etc.
      }
      // console.log(`Parsed from filename: siteNameGuess="${siteNameGuess}", floor="${floor}"`);
    } else {
      // console.warn(`Could not parse site/floor from filename: ${filename}.`);
      if (!siteId) siteNameGuess = path.basename(path.dirname(inputFilePath));
    }
  }
  
  if (!siteId && siteNameGuess) {
      const normalizedSiteGuess = configLoader.normalizeNameForKey(siteNameGuess);
      if (config.sitesMap.has(normalizedSiteGuess)) {
          siteId = config.sitesMap.get(normalizedSiteGuess);
          // console.log(`Determined siteId="${siteId}" from sites-map for "${siteNameGuess}"`);
      } else {
          siteId = siteNameGuess.toUpperCase().replace(/\s+/g, '_');
          // console.warn(`Site guess "${siteNameGuess}" not in sites-map. Using fallback siteId="${siteId}".`);
      }
  } else if (!siteId) {
      siteId = 'DEFAULT_SITE'; // Ultimate fallback
      // console.warn(`No site specified or guessed. Using fallback siteId="${siteId}".`);
  }
  if (floor === 'unknown') floor = '0'; // Default floor if still unknown
  
  const meetingRoomMapPath = customArgv.meetingRoomsMapPath || `laposte-map-data/src/${siteId}/salles-name-to-id`;
  if (fs.existsSync(meetingRoomMapPath)) {
      config.meetingRoomsMap = configLoader.loadMeetingRoomsMap(meetingRoomMapPath);
  } else {
      // console.warn(`Meeting room map not found: ${meetingRoomMapPath}.`);
      config.meetingRoomsMap = new Map();
  }

  // --- 3. SVG Parsing ---
  // console.log(`\n--- Parsing SVG: ${inputFilePath} ---`);
  const svgContent = fs.readFileSync(inputFilePath, 'utf-8');
  const doc = svgParser.parseSVG(svgContent);

  // --- 4. Global Transformation Matrix Calculation ---
  // console.log("--- Calculating Global Transformation Matrix ---");
  let globalTransformMatrix = [...geometry.IDENTITY_MATRIX];
  const siteCalage = config.calageData[siteId] || config.calageData['DEFAULT_SITE'];
  // let calageSource = "identity (no specific calage found or parse error)";

  if (siteCalage) {
    const floorCalage = (siteCalage.floor_specific && siteCalage.floor_specific[floor]) ? siteCalage.floor_specific[floor] : siteCalage.default;
    if (floorCalage) {
      if (floorCalage.sx && floorCalage.sy && floorCalage.tx !== undefined && floorCalage.ty !== undefined) {
          globalTransformMatrix = [floorCalage.sx, 0, 0, floorCalage.sy, floorCalage.tx, floorCalage.ty];
          // calageSource = `direct matrix from calageData for ${siteId}/${floor}`;
      } else if (floorCalage.x1 !== undefined && floorCalage.X1 !== undefined) {
          const {x1,y1,x2,y2, X1,Y1,X2,Y2} = floorCalage;
          if(x1 !== undefined && y1 !== undefined && x2 !== undefined && y2 !== undefined &&
             X1 !== undefined && Y1 !== undefined && X2 !== undefined && Y2 !== undefined &&
             (x2 - x1) !== 0 && (y2 - y1) !== 0 ) { 
              const scaleX = (X2 - X1) / (x2 - x1);
              const scaleY = (Y2 - Y1) / (y2 - y1); 
              const transX = X1 - x1 * scaleX;
              const transY = Y1 - y1 * scaleY;
              if(isFinite(scaleX) && isFinite(scaleY) && isFinite(transX) && isFinite(transY)) {
                 globalTransformMatrix = [scaleX, 0, 0, scaleY, transX, transY];
                //  calageSource = `derived scale/translate from calageData for ${siteId}/${floor}`;
              } else {
                //  calageSource = `calage data for ${siteId}/${floor} led to non-finite values. Using identity.`;
              }
          } else {
            // calageSource = `calage data for ${siteId}/${floor} incomplete for scale/translate. Using identity.`;
          }
      } else {
        //   calageSource = `calage data for ${siteId}/${floor} no direct matrix or simple params. Using identity.`;
      }
    } else {
        // calageSource = `no default or floor-specific calage for ${siteId}/${floor}. Using identity.`;
    }
  }
  // console.log(`Global Transform Source: ${calageSource}`);
  // console.log("Global Transform Matrix:", globalTransformMatrix);

  // --- 5. Element Processing Loop ---
  // console.log("\n--- Processing SVG Elements ---");
  const finalJsonOutput = {
    background: [],
    decor: [],
    itineraries: [],
    pois: {},
    desks: {},
    furniture: {},
  };

  const groupsToProcess = [
    { name: 'Contour', getter: svgParser.getContourElements, categoryKey: 'background', isList: true },
    { name: 'Decor', getter: svgParser.getDecorElements, categoryKey: 'decor', isList: true },
    { name: 'Lignes_de_couloir', getter: svgParser.getItineraryElements, categoryKey: 'itineraries', isList: true },
    { name: 'Salles', getter: svgParser.getRoomElements, categoryKey: 'pois', isList: false },
    { name: 'Mobilier', getter: svgParser.getFurnitureElements, categoryKey: 'furniture', isList: false },
  ];

  groupsToProcess.forEach(groupCfg => {
    // console.log(`Processing group: ${groupCfg.name}`);
    const elements = groupCfg.getter(doc); 
    
    if (groupCfg.name === 'Mobilier') {
        const textElements = svgParser.getElementsByTagName(doc, 'text');
        elements.push(...textElements);
        // console.log(`Added ${textElements.length} <text> elements to Mobilier group for processing.`);
    }
    // console.log(`Found ${elements.length} raw elements in group ${groupCfg.name}.`);

    elements.forEach(node => {
      const processedElement = elementProcessor.processNode(node, siteId, floor, groupCfg.name, globalTransformMatrix, config);
      
      if (processedElement) {
        const elementId = processedElement.id; 
        const poiClass = processedElement.class; 
        const mainClassKey = processedElement.mainClassKey; 

        delete processedElement.mainClassKey; 

        if (groupCfg.categoryKey === 'itineraries') {
          delete processedElement.class; 
          finalJsonOutput.itineraries.push(processedElement);
        } else if (groupCfg.categoryKey === 'pois') {
          if (!poiClass || poiClass === 'unknown') {
              // console.warn(`POI element ${elementId} has no/unknown class. Skipping or placing in generic.`);
          } else {
              finalJsonOutput.pois[poiClass] = finalJsonOutput.pois[poiClass] || {};
              finalJsonOutput.pois[poiClass][elementId] = processedElement;
          }
        } else if (groupCfg.categoryKey === 'furniture') { 
          if (mainClassKey === 'desks' || mainClassKey === 'meeting') { 
            finalJsonOutput.desks[mainClassKey] = finalJsonOutput.desks[mainClassKey] || {};
            finalJsonOutput.desks[mainClassKey][elementId] = processedElement;
          } else if (mainClassKey) { 
            finalJsonOutput.furniture[mainClassKey] = finalJsonOutput.furniture[mainClassKey] || {};
            finalJsonOutput.furniture[mainClassKey][elementId] = processedElement;
          } else {
            finalJsonOutput.furniture['misc_furniture'] = finalJsonOutput.furniture['misc_furniture'] || {};
            finalJsonOutput.furniture['misc_furniture'][elementId] = processedElement;
          }
          delete processedElement.class; 
        } else if (groupCfg.isList) { 
          delete processedElement.class; 
          finalJsonOutput[groupCfg.categoryKey].push(processedElement);
        }
      }
    });
  });

  return finalJsonOutput;
}


// This block allows the script to be run directly from CLI
// For ES modules, a common way to check if it's the main module:
// import { fileURLToPath } from 'url';
// const __filename = fileURLToPath(import.meta.url);
// if (process.argv[1] === __filename) { ... }
// For simplicity here, we'll assume if not called via test, it's CLI.
// A more robust check might be needed if this script is also imported by other non-test modules.
async function cliMain() {
    const argv = yargs(hideBin(process.argv))
      .option('f', {
        alias: 'file',
        describe: 'Path to the input SVG file',
        type: 'string',
        demandOption: true,
      })
      .option('s', {
        alias: 'site',
        describe: 'Site name (override auto-detection from filename)',
        type: 'string',
      })
      .option('o', {
          alias: 'output',
          describe: 'Output directory for JSON file',
          type: 'string',
      })
      .help()
      .alias('help', 'h')
      .argv;

    try {
        const finalJsonOutput = await runConverter(argv); // Pass parsed argv

        // --- 6. Output JSON ---
        const siteId = finalJsonOutput.site || (argv.s || 'DEFAULT_SITE'); // Re-determine siteId for filename
        const floor = finalJsonOutput.floor || (argv.floor || '0');     // Re-determine floor for filename

        const outputJsonString = JSON.stringify(finalJsonOutput, null, 2);
        const outFilename = argv.output ? path.join(argv.output, `${siteId}-${floor}.json`) : `${siteId}-${floor}.json_output_cli`;

        if (argv.output) {
            try {
                fs.mkdirSync(argv.output, { recursive: true });
                fs.writeFileSync(outFilename, outputJsonString);
                console.log(`\nOutput successfully written to: ${outFilename}`);
            } catch (e) {
                console.error(`Error writing output file ${outFilename}:`, e);
                console.log("\n--- Fallback: Output JSON to Console ---");
                console.log(outputJsonString);
            }
        } else {
            console.log("\n--- Output JSON (no -o specified) ---");
            console.log(outputJsonString);
        }
    } catch (error) {
        console.error('An error occurred during the conversion process:', error.message);
        console.error(error.stack);
        process.exitCode = 1;
    }
}

// Basic check to see if this script is the entry point
// This is a simplified check. A more robust one uses import.meta.url.
// For now, if 'test' is in argv[1] it's likely not CLI.
// Or, more simply, only run cliMain if not in a test environment.
if (process.env.NODE_ENV !== 'test') {
    // A common pattern is to check if this module is the main module.
    // For ES modules, this is tricky. A simple way:
    // if (import.meta.url.startsWith('file:') && process.argv[1] === import.meta.filename)
    // For now, this direct call will make it run when imported if not careful.
    // The test runner will import it, so cliMain() should not run automatically.
    // A common workaround is to export runConverter and have a separate cli.js
    // or use the NODE_ENV check.
    // Let's make it so cliMain is NOT called automatically when imported.
    // It should be explicitly called by a CLI entry script or if(require.main === module) for CJS.
    // For now, I will not call cliMain() here directly to make it import-safe.
    // The test script will call runConverter. A separate CLI script would call cliMain.
    // For the purpose of the current task, this is sufficient.
    // If you need to run from CLI: node src/converter.js -f ...
    // Then you'd need to uncomment a call to cliMain() or add the import.meta.url check.
    // For now, to make `npm start` work (if it calls `node src/converter.js`):
    // cliMain(); // This will make it run when `npm start` is used.
    // Let's assume for now `npm start` is not the focus, but direct CLI execution for testing.
    // The test runner will set NODE_ENV=test or similar, or we rely on explicit calls.
}

// To run CLI: node src/converter.js -f path/to/file.svg
// The following makes it executable:
// (async () => {
//   if (process.argv[1] && (process.argv[1] === new URL(import.meta.url).pathname || process.argv[1] === new URL(import.meta.url).href ) ) {
//     cliMain();
//   }
// })();
// This pattern is more robust for ES modules.
// For now, I'll assume tests will import runConverter and CLI usage is separate.
// The `npm test` script will call node with `--test` flag, which runs tests.
// If I need to run `node src/converter.js` directly, I'd add the robust check.
// The test script will call `runConverter` directly.
// The `package.json` start script `node src/main.js` will need `main.js` to call `cliMain`.
// Let's assume `converter.js` is a library and `main.js` is the CLI entry point.
// So, no direct call to `cliMain()` here.
// The task description's `package.json` has "start": "node src/main.js".
// I will assume `src/main.js` is responsible for CLI interaction and calling `runConverter`.
// This file (`converter.js`) will just export `runConverter`.
// The existing `src/main.js` might need to be updated or created if it doesn't exist.
// For this task, I'll assume `src/main.js` is out of scope and focus on `converter.js` exporting `runConverter`.
// The original `converter.js` was directly executable.
// Let's ensure it can still be if needed, but tests call runConverter.

// If this script is run directly:
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    cliMain();
}
