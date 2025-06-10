#!/usr/bin/env node

/**
 * SVG to JSON Converter
 * Main entry point
 */

import { program } from "commander";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

// Import modules
import {
  loadSVG,
  createXPath,
  getElementsByLayer,
  getCalibrationRect,
  getRectAttributes,
  getAttribute,
  getElementType,
  parsePoints,
  getLineAttributes,
} from "./lib/parser.js";
import {
  parseTransform,
  transformPoint,
  transformPoints,
  getNodeTransforms,
  createCalibrationTransform,
  createSpecialTransform,
  multiplyMatrices,
} from "./lib/transformer.js";
import {
  parsePath,
  pathToAbsolute,
  isPolygonPath,
  pathToPoints,
  transformPathData,
} from "./lib/pathParser.js";
import {
  classifyObject, // Keep classifyObject for rooms
  mapRoomName,
} from "./lib/classifier.js";
import {
  polygonArea,
  polygonPerimeter,
  isValidPolygon,
  polygonCentroid,
} from "./lib/geometry.js";
import {
  normalizeText,
  formatPoints,
  filterClosePoints,
  extractSpecialAttributes,
  toCanonicalJSON,
  ANSI,
  roundTo,
   toPerlCoordinatePrecision,
} from "./lib/utils.js";
import {
  resolveSite,
  getCalibrationRect as getCalibrationRectConfig,
  getIdFixes,
  getSpecialTransform,
  applyIdFix,
  loadMeetingRoomsMap,
} from "./lib/calibration.js";
import {
  processDeskGeometry,
  extractDeskEndpoints,
  calculateDeskDirection,
} from "./lib/deskUtils.js";
import sortKeys from "sort-keys";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Namespace URIs
const NAMESPACES = {
  svg: "http://www.w3.org/2000/svg",
  inkscape: "http://www.inkscape.org/namespaces/inkscape",
};

// Helper function to process and classify IDs based on Perl script logic
function processAndClassifyId(id, inkscapeLabel, getParentIdCallback) {
  let processedId = id;

  if (inkscapeLabel) {
    const overrideMatch = inkscapeLabel.match(/^override\s+(.*)$/i);
    if (overrideMatch) {
      processedId = overrideMatch[1];
    } else if (id && id.match(/^path[-_\s\d]+$/)) {
      processedId = inkscapeLabel;
    }
  }

  if (!processedId) return null;

  if (processedId.match(/^line/i)) {
    let currentParentId = getParentIdCallback();
    let depth = 0; // Safety break for deep traversals
    while (currentParentId && depth < 10) {
      if (!currentParentId.match(/^(line|g)/i)) {
        processedId = currentParentId;
        break;
      }
      // As per Perl: die "Could not find named ancestor for $id" if $newid =~ /^mobilier$/i;
      // This check is specific and might need context; for now, we just find non-line/g parent.
      if (currentParentId.match(/^mobilier$/i)) {
         console.warn(`Encountered 'mobilier' ID during parent lookup for ${id}. Stopping.`);
         return null; // Or handle as an error
      }
      currentParentId = getParentIdCallback(true); // true to signal get next parent
      depth++;
    }
    if (processedId.match(/^line/i) || processedId.match(/^g/i) && depth >=10) {
        console.warn(`Could not find suitable named ancestor for ${id}`);
        return null;
    }
  }

  processedId = processedId.replace(/_$/, "");
  processedId = processedId.replace(/_x([0-9a-f]{2})_/gi, (match, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  processedId = processedId.replace(/_/g, " ");

  // Regex-based classification from Perl
  let match;

  // Desk/Meeting room pattern
  match = processedId.match(
    /^(SDR|Postes?)\s+([-A-Z0-9. ]+):(?:I([-+]?\d(?:\.\d)?)([-+]?\d(?:\.\d)?)A(\d):)?(?:(\d+)x(\d+):)?\s*(.*)$/i
  );
  if (match) {
    const [, what, office, indicatorX, indicatorY, indicatorA, width, depth, deskIdsString] = match;
    return {
      originalId: id,
      processedId: processedId,
      where: "desks", // Generic category for desks/meeting rooms
      type: what.toUpperCase() === "SDR" ? "meeting" : "desks",
      office: office.trim(),
      indicatorX: indicatorX ? parseFloat(indicatorX) : undefined,
      indicatorY: indicatorY ? parseFloat(indicatorY) : undefined,
      indicatorA: indicatorA ? parseInt(indicatorA, 10) : undefined,
      itemWidth: width ? parseInt(width, 10) : undefined,
      itemDepth: depth ? parseInt(depth, 10) : undefined,
      deskIdsString: deskIdsString.trim(),
    };
  }

  // Furniture pattern
  match = processedId.match(/^meuble\s+([-_\w]+)/i);
  if (match) {
    return {
      originalId: id,
      processedId: processedId,
      where: "furniture",
      type: match[1].toLowerCase(), // e.g., "armoire"
    };
  }

  // Tag pattern (Perl: $data->{tag}{$class}{$id}) - currently not in JS output structure
  match = processedId.match(/^tag\s+([-_\w]+)/i);
  if (match) {
    console.warn(`${ANSI.yellow}Warning: 'tag' type furniture "${processedId}" found, but not explicitly handled in current JSON structure. Skipping.${ANSI.normal}`);
    return null;
    // If to be handled as generic furniture:
    // return { processedId, where: "furniture", type: `tag-${match[1].toLowerCase()}` };
  }

  // Text pattern (Perl: $data->{text}{$class}{$id})
  match = processedId.match(/^(r?text(-top)?)\s+(\S+)\s+(\d+(?:\.\d+)?)\s+(\S+)\s(.*)$/i);
  if (match) {
    const [, text_type_full, top_modifier, text_class, size, color, text_content] = match;
    return {
      processedId,
      where: "text",
      type: text_class,
      textDetails: {
        text_type: text_type_full,
        isTop: !!(top_modifier && top_modifier === "-top"),
        size: size,
        color: color,
        text: text_content.replace(/\\n/g, "\n"),
      }
    };
  }
  
  console.warn(`${ANSI.yellow}Warning: Unknown furniture ID pattern: "${processedId}" (original: "${id}")${ANSI.normal}`);
  return null;
}

// Helper function to parse desk ID strings based on Perl script logic
function generateDeskObjectsInternal(deskIdsString, office, itemWidth, itemDepth) {
  const objects = [];
  if (deskIdsString.includes("=")) { // Format: 1G=A,1D=B
    const deskIdEntries = deskIdsString.split(/\s*,\s*/);
    for (const entry of deskIdEntries) {
      const match = entry.match(/^(\d+)([GD]X?|C)=(.+)$/i);
      if (match) {
        const [, position, side, desk] = match;
        const obj = {
          position: parseInt(position, 10),
          side: side.toUpperCase(),
          office: office,
          desk: desk,
        };
        if (itemWidth !== undefined && itemDepth !== undefined) {
          obj.width = itemWidth;
          obj.depth = itemDepth;
        }
        objects.push(obj);
      } else {
        console.error(`Could not match desk ID entry "${entry}" in "${deskIdsString}"`);
        // Consider throwing an error like Perl's 'die'
      }
    }
  } else { // Format: -Z4 or N4 or ABCD
    let deskChars = [];
    const layoutMatch = deskIdsString.match(/^(-?)([URNZ]?)(\d+)$/);
    if (layoutMatch) {
      const [, reverseStr, layoutChar, countStr] = layoutMatch;
      const reverse = reverseStr === '-';
      const layout = layoutChar || 'Z';
      const count = parseInt(countStr, 10);
      let currentDeskCharCode = 'A'.charCodeAt(0);

      if (layout.toUpperCase() === 'Z') {
        for (let i = 0; i < count; i++) deskChars.push(String.fromCharCode(currentDeskCharCode + i));
      } else if (layout.toUpperCase() === 'N') {
        for (let i = 0; i < count; i++) {
          deskChars.push(String.fromCharCode('A'.charCodeAt(0) + (i % 2) * Math.floor(count / 2) + Math.floor(i / 2)));
        }
      } else if (layout.toUpperCase() === 'R') {
         for (let i = 0; i < count; i++) {
          deskChars.push(String.fromCharCode('A'.charCodeAt(0) + ((i + 1) % 2) * Math.floor(count / 2) + Math.floor(i / 2)));
        }
      } else { // Fallback to simple character split if layout is unknown but count is present
         deskChars = deskIdsString.split('');
      }
      if (reverse) {
        deskChars.reverse();
      }
    } else {
      deskChars = deskIdsString.split('');
    }

    let index = 0;
    for (const deskChar of deskChars) {
      if (deskChar !== "-") { // Skip placeholders
        const obj = {
          position: Math.floor(index / 2) + 1,
          side: (index % 2) ? "D" : "G",
          office: office,
          desk: deskChar,
        };
        if (itemWidth !== undefined && itemDepth !== undefined) {
          obj.width = itemWidth;
          obj.depth = itemDepth;
        }
        objects.push(obj);
      }
      index++;
    }
  }
  return objects;
}


// Parse command line arguments
program
  .name("svg-to-json-converter")
  .description("Convert SVG floor plans to JSON format")
  .version("1.0.0")
  .option("-d, --output-dir <dir>", "output directory")
  .option("-s, --site <code>", "override site code")
  .argument("<files...>", "SVG files to convert")
  .parse();

const options = program.opts();
const files = program.args;

// Process each file
for (const file of files) {
  try {
    await processFile(file, options);
  } catch (error) {
    console.error(`Error processing ${file}: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Process a single SVG file
 */
async function processFile(filename, options) {
  console.log(`Processing ${filename}...`);

  // Load SVG
  const doc = await loadSVG(filename);
  const xpath = createXPath(doc);

  // Resolve site and floor
  const dir = dirname(filename);
  const { site, floor } = await resolveSite(filename, dir, options.site);

  console.log(`Site: ${site}, Floor: ${floor}`);

  // Load configurations
  const idFixes = await getIdFixes(site, floor);
  const specialTransform = await getSpecialTransform(site, floor);
  const meetingRoomsMap = await loadMeetingRoomsMap(dir);

  // Get calibration
  let calibrationTransform = null;
  const calibrationRect = getCalibrationRect(xpath, doc);

  if (calibrationRect) {
    let rect;
    const elemType = getElementType(calibrationRect);

    // Get transforms from the calibration element and its parents
    const calibrationElementTransform = getNodeTransforms(calibrationRect);

    if (elemType === "rect") {
      rect = getRectAttributes(calibrationRect);
    } else if (elemType === "path") {
      // The Perl script only looks for rect elements, not paths
      // So if we find a path, we should ignore it and use hardcoded calibration
      console.log(
        "Found path element for calibration, but Perl script only uses rect elements"
      );
      rect = null;
    }

    if (rect) {
      // Apply the calibration element's transforms to the rectangle
      if (calibrationElementTransform) {
        const corners = [
          [rect.x, rect.y],
          [rect.x + rect.width, rect.y],
          [rect.x + rect.width, rect.y + rect.height],
          [rect.x, rect.y + rect.height],
        ];
        const transformedCorners = transformPoints(
          corners,
          calibrationElementTransform
        );

        // Recalculate bounding box from transformed corners
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        for (const [x, y] of transformedCorners) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
        rect = {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        };
      }

      const targetRect = await getCalibrationRectConfig(site);

      if (targetRect) {
        calibrationTransform = createCalibrationTransform(rect, targetRect);
        console.log("Using calibration from SVG rect and config");
        console.log("Source rect:", rect);
        console.log("Target rect:", targetRect);
      } else {
        console.warn(
          `${ANSI.reverse}Warning: No calibration data for site ${site}${ANSI.normal}`
        );
      }
    }
  }

  // If no calibration transform was created from SVG rect, use hardcoded calibration
  if (!calibrationTransform) {
    const targetRect = await getCalibrationRectConfig(site);

    if (targetRect) {
      // Use identity source rect when no calibration rect found in SVG
      // This matches the Perl script behavior
      console.warn("Calage not found - using hardcoded calibration");
      calibrationTransform = [1, 0, 0, 1, 0, 0]; // Identity transform
    } else {
      console.warn("No calibration data available");
      calibrationTransform = [1, 0, 0, 1, 0, 0]; // Identity transform
    }
  }

  // Apply special transform if needed
  if (specialTransform) {
    const special = createSpecialTransform(specialTransform);
    if (calibrationTransform) {
      calibrationTransform = multiplyMatrices(calibrationTransform, special);
    } else {
      calibrationTransform = special;
    }
  }

  // Initialize output structure
  const output = {
    background: [],
    decor: [],
    itineraries: [],
    pois: {},
    desks: {
      desks: {},
      meeting: {},
    },
    furniture: {},
    text: {},
  };

  // Process background
  const backgroundElements = getElementsByLayer(
    xpath,
    doc,
    ["Contour", "contour"],
    "rect|polygon|path"
  );
  for (const elem of backgroundElements) {
    const currentId = getAttribute(elem, "id");
    const obj = processElement(elem, calibrationTransform);
    if (obj) {
      output.background.push(obj);
    } else {
      console.warn(
        `${ANSI.reverse}Warning: Element with id "${currentId}" could not be processed as background.${ANSI.normal}`
      );
    }
  }

  // Process decor
  const decorElements = getElementsByLayer(
    xpath,
    doc,
    ["Decor", "Décor", "decor"],
    "rect|polygon|path|line"
  );
  for (const elem of decorElements) {
    const obj = processElement(elem, calibrationTransform);
    if (obj) {
      output.decor.push(obj);
    }
  }

  // Process itineraries
  const itineraryElements = getElementsByLayer(
    xpath,
    doc,
    ["Lignes de couloir", "lignes de couloir"],
    "line|polyline|polygon|path"
  );
  for (const elem of itineraryElements) {
    const obj = processElementItinerary(elem, calibrationTransform);
    if (obj) {
      // Remove class attribute as per Perl logic: delete $_->{"class"}
      delete obj.class;
      output.itineraries.push(obj);
    }
  }

  // Process rooms
  const roomElements = getElementsByLayer(
    xpath,
    doc,
    ["Salles", "Pièces", "salles"],
    "rect|polygon|path"
  );
  for (const elem of roomElements) {
    let id = getAttribute(elem, "id");
    if (!id) continue;

    // Check for inkscape:label if id is generic (like path123)
    const label = elem.getAttributeNS(NAMESPACES.inkscape, "label");
    if (label && id.match(/^path[-_\s\d]+$/)) {
      id = label;
    }

    // Apply ID fixes
    const fixedId = applyIdFix(id, idFixes);
    const { id: cleanId, attributes } = extractSpecialAttributes(fixedId);

    // Classify object
    const classification = classifyObject(cleanId, floor);
    if (!classification) continue;

    // Process element
    const obj = processElement(elem, calibrationTransform);
    if (!obj) continue;

    // Add classification info
    obj.class = classification.class;
    obj.id = classification.id;

    // Handle meeting rooms
    if (classification.class === "meeting-room" && classification.name) {
      const mappedId = mapRoomName(classification.name, meetingRoomsMap);
      if (mappedId) {
        obj.id = mappedId;
      } else {
        console.warn(
          `${ANSI.reverse}Warning: No mapping for meeting room: ${classification.name}${ANSI.normal}`
        );
      }
      obj.name = classification.name;
    }

    // Add special attributes
    if (attributes.bubbleSide) obj.bubbleSide = attributes.bubbleSide;
    if (attributes.offsetX !== undefined) obj.offsetX = attributes.offsetX;
    if (attributes.offsetY !== undefined) obj.offsetY = attributes.offsetY;
    if (attributes.scale !== undefined) obj.scale = attributes.scale;
    if (classification.showBubble) obj.showBubble = true;

    // Add to appropriate category
    if (!output.pois[classification.class]) {
      output.pois[classification.class] = {};
    }
    output.pois[classification.class][obj.id] = obj;
  }

  // Process furniture
  const furnitureElements = getElementsByLayer(
    xpath,
    doc,
    ["Mobilier", "mobilier", "MOBILIER", "MOBILIERS"], // 
    "path|line|polyline" //  
  );
  console.log(`Found ${furnitureElements.length} furniture elements`);
  const processedFurnitureIds = new Set(); // To warn about duplicates like Perl

  for (const elem of furnitureElements) {
    const originalId = getAttribute(elem, "id");
    const inkscapeLabel = elem.getAttributeNS(NAMESPACES.inkscape, "label");

    let currentElemForParent = elem;
    const getParentIdCallback = (getNextParent = false) => {
      if (getNextParent && currentElemForParent) {
        currentElemForParent = currentElemForParent.parentNode;
      }
      if (
        currentElemForParent &&
        currentElemForParent.parentNode &&
        currentElemForParent.parentNode.getAttribute
      ) {
        if (currentElemForParent.parentNode.nodeType === 1) {
          return currentElemForParent.parentNode.getAttribute("id");
        }
      }
      return null;
    };

    const classification = processAndClassifyId(
      originalId,
      inkscapeLabel,
      getParentIdCallback
    );

    if (!classification) {
      // console.log(`  -> Element ${originalId || 'with no ID'} not classified as processable furniture/desk.`);
      continue;
    }
    
    const { processedId, where, type: classifiedType, ...params } = classification;

    if (processedFurnitureIds.has(processedId)) {
        console.warn(`${ANSI.yellow}Warning: Duplicate processed furniture ID "${processedId}" encountered.${ANSI.normal}`);
    }
    processedFurnitureIds.add(processedId);

    console.log(`Processing furniture/desk: ${processedId} (original: ${originalId}), type: ${classifiedType}, where: ${where}`);

    if (where === "desks") { // Covers "desks" and "meeting"
      const baseObj = processDeskGeometryPerl(elem, calibrationTransform); // Get transformed basic geometry
      if (!baseObj) {
        console.warn(`  -> Could not process base geometry for desk: ${processedId}`);
        continue;
      }
      console.log(`  -> Base element processed: ${JSON.stringify(baseObj)}`);

      // Use the result from processDeskGeometryPerl directly - it already matches Perl logic
      let calculatedPoint = baseObj.point;
      let calculatedDirection = baseObj.direction;
      console.log(`  -> Using Perl-style geometry: point ${JSON.stringify(calculatedPoint)}, direction ${calculatedDirection}`);

      // Indicator values from ID are stored as metadata only - they do NOT override the direction
      // The direction should come purely from the geometry (atan2 calculation)
      console.log(`  -> Direction from geometry preserved: ${calculatedDirection}`);

      const deskObjects = generateDeskObjectsInternal(
        params.deskIdsString,
        params.office,
        params.itemWidth,
        params.itemDepth
      );
      console.log(`  -> Generated ${deskObjects.length} desk objects for ${processedId}`);

      const deskOutputObject = {
        class: classifiedType, // "desks" or "meeting"
        id: processedId, // Perl uses the processed ID as key, not lowercased
        point: [calculatedPoint[0], calculatedPoint[1]], // Remove roundTo for full precision
        direction: toPerlCoordinatePrecision(calculatedDirection,14), // Use Perl-like precision for direction
        objects: deskObjects,
      };

      if (params.indicatorX !== undefined) deskOutputObject.indicator_x = params.indicatorX; // Remove roundTo
      if (params.indicatorY !== undefined) deskOutputObject.indicator_y = params.indicatorY; // Remove roundTo
      if (params.indicatorA !== undefined && params.indicatorA !== 0) deskOutputObject.indicator_a = params.indicatorA; // Only include if non-zero

      // Ensure the category exists
      if (!output.desks[classifiedType]) {
        output.desks[classifiedType] = {};
      }
      output.desks[classifiedType][deskOutputObject.id] = deskOutputObject;
      console.log(`  -> Added to output.desks.${classifiedType}.${deskOutputObject.id}`);

    } else if (where === "furniture") {
      // Process furniture items exactly like desks to get point and direction
      const baseObj = processDeskGeometryPerl(elem, calibrationTransform);
      if (!baseObj) {
        console.warn(`  -> Could not process base geometry for furniture: ${processedId}`);
        continue;
      }

      const furnitureOutputObject = {
        class: classifiedType, // e.g., "ecran-orientation"
        id: processedId,
        point: [baseObj.point[0], baseObj.point[1]], // Use same format as desks
        direction: toPerlCoordinatePrecision(baseObj.direction, 14), // Use same precision as desks
        objects: [], // Furniture items have empty objects array like in Perl
      };

      if (!output.furniture[classifiedType]) {
        output.furniture[classifiedType] = {};
      }
      output.furniture[classifiedType][processedId] = furnitureOutputObject;
      console.log(`  -> Added to output.furniture.${classifiedType}.${processedId}`);

    } else if (where === "text") {
      // Process text elements exactly like Perl
      const baseObj = processDeskGeometryPerl(elem, calibrationTransform);
      if (!baseObj) {
        console.warn(`  -> Could not process base geometry for text: ${processedId}`);
        continue;
      }
      
      const textDetails = params.textDetails;
      const textOutputObject = {
        class: classifiedType,
        id: processedId,
        point: [toPerlCoordinatePrecision(baseObj.point[0]), toPerlCoordinatePrecision(baseObj.point[1],6)],
        direction: toPerlCoordinatePrecision(baseObj.direction,14),
        objects: [], // Text elements have empty objects array like in Perl
        text_type: textDetails.text_type,
        text: textDetails.text,
        size: textDetails.size,
        color: textDetails.color,
      };

      // Add height field if it's a "top" text variant
      if (textDetails.isTop) {
        textOutputObject.height = 1;
      }

      // Ensure the category exists
      if (!output.text[classifiedType]) {
        output.text[classifiedType] = {};
      }
      output.text[classifiedType][processedId] = textOutputObject;
      console.log(`  -> Added to output.text.${classifiedType}.${processedId}`);

    } else {
      // This case should ideally be handled by processAndClassifyId returning null
      // or by specific handling for "tag" if they were to be implemented.
      console.log(`  -> Element ${processedId} classified as '${where}', type '${classifiedType}', but not stored.`);
    }
  }

  // Determine output path
  let outputDir = options.outputDir;
  if (!outputDir) {
    outputDir = join(dir, "..", "..", "js-output");
  }

  // Create output directory if needed
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  // Write output
  const outputFile = join(outputDir, `${site}-${floor}.json`);
  const sortedOutput = sortKeys(output, { deep: true });
  await writeFile(outputFile, toCanonicalJSON(sortedOutput), "utf8");

  console.log(`Output written to ${outputFile}`);
}

/**
 * Process an SVG element
 */
function processElement(elem, calibrationTransform) {
  const type = getElementType(elem);
  const originalId = getAttribute(elem, "id"); // Use originalId for the object if not later overridden

  // Get element transforms
  const transforms = getNodeTransforms(elem);
  let transform = calibrationTransform;

  if (transforms) {
    if (transform) {
      transform = multiplyMatrices(transform, transforms);
    } else {
      transform = transforms;
    }
  }

  let obj = null;

  switch (type) {
    case "rect":
      const rect = getRectAttributes(elem);
      const points = [
        [rect.x, rect.y],
        [rect.x + rect.width, rect.y],
        [rect.x + rect.width, rect.y + rect.height],
        [rect.x, rect.y + rect.height],
      ];
      const transformedPoints = transformPoints(points, transform);
      obj = {
        type: "polygon",
        // Use toPerlCoordinatePrecision for rects processed as polygons too
        points: transformedPoints.map(p => `${toPerlCoordinatePrecision(p[0])},${toPerlCoordinatePrecision(p[1], 6)}`).join(" "),
      };
      break;

    case "polygon":
    case "polyline":
      const pointsStr = getAttribute(elem, "points");
      if (pointsStr) {
        let points = parsePolygonPoints(pointsStr);
        if (transform) {
          points = transformPoints(points, transform);
        }


        if (isValidPolygon(points, type === "polygon")) {
          obj = {
            type: type,
            points: points.map(p => `${toPerlCoordinatePrecision(p[0])},${toPerlCoordinatePrecision(p[1],6)}`).join(" ")
          };
        } else {
          // If it's a polyline, or a polygon that didn't pass strict isValidPolygon but might still be valid as a polyline
          if (type === "polyline" && points && points.length >= 2) {
            obj = {
              type: type,
              points: points.map(p => `${toPerlCoordinatePrecision(p[0])},${toPerlCoordinatePrecision(p[1])}`).join(" ")
            };
          } else if (type === "polygon" && points && points.length >=3) {
            // Fallback for polygons that might not be 'valid' by the strict check but should still be outputted
            // This case might need refinement based on how Perl handles "invalid" polygons that are still outputted.
            // For now, assume if it has points, format them.
             obj = {
              type: type,
              points: points.map(p => `${toPerlCoordinatePrecision(p[0])},${toPerlCoordinatePrecision(p[1],6)}`).join(" ")
            };
          }
        }
      } else {
        // No points string
      }
      break;

    case "line":
      const line = getLineAttributes(elem);
      const linePoints = [
        [line.x1, line.y1],
        [line.x2, line.y2],
      ];
      const transformedLine = transformPoints(linePoints, transform);
      obj = {
        type: "polyline", // Lines are converted to polylines
        // Use toPerlCoordinatePrecision for lines processed as polylines
        points: transformedLine.map(p => `${toPerlCoordinatePrecision(p[0])},${toPerlCoordinatePrecision(p[1])}`).join(" "),
      };
      break;

    case "path":
      const d = getAttribute(elem, "d");
      if (d) {
        const parsed = parsePath(d);
        const absolute = pathToAbsolute(parsed);

        if (isPolygonPath(absolute.commands)) {
          const pathPoints = pathToPoints(absolute.commands);
          if (pathPoints.length >= 2) { 
            const transformed = transformPoints(pathPoints, transform);
            // For paths that become polygons/polylines, use filterClosePoints as before
            const filtered = filterClosePoints(transformed, 0.4, type === "polygon" ); // Pass polygon state for closure check
            
            if (filtered.length >= 2) {
              if (filtered.length === 2 || type === "polyline") { // Treat paths that become 2 points as polylines
                obj = {
                  type: "polyline",
                  points: filtered.map(p => `${toPerlCoordinatePrecision(p[0])},${toPerlCoordinatePrecision(p[1])}`).join(" "),
                };
              } else if (filtered.length >= 3 && (type === "polygon" || isValidPolygon(filtered))) { // Check isValidPolygon if it's meant to be a polygon
                obj = {
                  type: "polygon",
                  points: filtered.map(p => `${toPerlCoordinatePrecision(p[0])},${toPerlCoordinatePrecision(p[1], 6)}`).join(" "),
                };
              } else if (filtered.length >=3) { // Fallback to polyline if not a valid polygon but has 3+ points
                 obj = {
                  type: "polyline", 
                  points: filtered.map(p => `${toPerlCoordinatePrecision(p[0])},${toPerlCoordinatePrecision(p[1])}`).join(" "),
                };
              }
            }
          }
        } else {
          // For non-polygon paths, transform path data to absolute coordinates and apply transforms
          const transformedPathData = transformPathData(d, transform);
          obj = {
            type: "path",
            d: transformedPathData,
          };
        }
      }
      break;
  }

  if (obj) {
    if (originalId) {
      obj.id = originalId;
    }
    // Add class attribute if present on the SVG element
    const svgClass = getAttribute(elem, "class");
    if (svgClass && svgClass.trim() !== "") {
      obj.class = svgClass;
    }
  } 

  return obj;
}
 
/**
 * Parse polygon points from string
 */
function parsePolygonPoints(pointsStr) {
  const points = [];
  const pairs = pointsStr.trim().split(/\s+/);

  for (const pair of pairs) {
    const [x, y] = pair.split(",").map(parseFloat);
    if (!isNaN(x) && !isNaN(y)) {
      points.push([x, y]);
    }
  }

  return points;
}

/**
 * Process desk element exactly like Perl - apply transforms first, then extract points
 * This matches the Perl logic: svg_node_to_json($desk2, "furniture"); then extract points
 */
function processDeskGeometryPerl(elem, calibrationTransform) {
  console.log(`\nProcessing desk geometry for element type: ${elem.tagName.toLowerCase()}`);
  console.log(`Element ID: ${elem.getAttribute('id')}`);
  console.log(`Calibration transform: ${JSON.stringify(calibrationTransform)}`);

  // First, apply all transforms like Perl does with svg_node_to_json
  const processedElement = processElement(elem, calibrationTransform);
  if (!processedElement) {
    console.warn("Failed to process element");
    return null;
  }

  console.log(`Processed element: ${JSON.stringify(processedElement)}`);

  const type = processedElement.type;
  let point1, point2;

  if (type === "polygon") {
    // Parse the transformed points string
    const pointsStr = processedElement.points;
    const points = pointsStr.split(' ').map(p => p.split(',').map(Number));
    console.log(`Polygon points after transform: ${JSON.stringify(points)}`);
    
    if (points.length !== 2) {
      console.warn(`Polygon desk does not have exactly 2 points (found ${points.length}). Ignoring.`);
      return null;
    }
    point1 = points[0];
    point2 = points[1];
  } else if (type === "polyline") {
    // Parse the transformed points string  
    const pointsStr = processedElement.points;
    const points = pointsStr.split(' ').map(p => p.split(',').map(Number));
    console.log(`Polyline points after transform: ${JSON.stringify(points)}`);
    
    if (points.length < 2) {
      console.warn(`Polyline desk has less than 2 points (found ${points.length}). Ignoring.`);
      return null;
    }
    point1 = points[0];
    point2 = points[1];
  } else {
    console.warn(`Unsupported desk type after processing: ${type}`);
    return null;
  }

  if (!point1 || !point2) {
    console.warn("Failed to extract points");
    return null;
  }

  console.log(`Extracted points: point1=${JSON.stringify(point1)}, point2=${JSON.stringify(point2)}`);

  // Calculate direction exactly like Perl: atan2($point2->[1] - $point1->[1], $point2->[0] - $point1->[0])
  const direction = Math.atan2(point2[1] - point1[1], point2[0] - point1[0]);
  console.log(`Calculated direction: ${direction}`);

  // Return the desk geometry - use point1 exactly like Perl
  const result = {
    point: point1,
    direction: direction
  };
  console.log(`Final desk geometry: ${JSON.stringify(result)}`);
  return result;
}

/**
 * Process an SVG itinerary element
 */
function processElementItinerary(elem, calibrationTransform) {
  const type = getElementType(elem);
  const originalId = getAttribute(elem, "id");

  // Get element transforms
  const transforms = getNodeTransforms(elem);
  let transform = calibrationTransform;

  if (transforms) {
    if (transform) {
      transform = multiplyMatrices(transform, transforms);
    } else {
      transform = transforms;
    }
  }

  // Create base object
  const obj = {
    id: originalId,
    type: type,
  };

  // Copy relevant attributes
  const classList = getAttribute(elem, "class");
  if (classList) {
    obj.class = classList;
  }

  // Process by type with itinerary-specific logic
  if (type === "line") {
    const { x1, y1, x2, y2 } = getLineAttributes(elem);
    if (transform) {
      const [tx1, ty1] = transformPoint(x1, y1, transform);
      const [tx2, ty2] = transformPoint(x2, y2, transform);
      obj.x1 = toPerlCoordinatePrecision(tx1);
      obj.y1 = toPerlCoordinatePrecision(ty1);
      obj.x2 = toPerlCoordinatePrecision(tx2);
      obj.y2 = toPerlCoordinatePrecision(ty2);
    } else {
      obj.x1 = toPerlCoordinatePrecision(x1);
      obj.y1 = toPerlCoordinatePrecision(y1);
      obj.x2 = toPerlCoordinatePrecision(x2);
      obj.y2 = toPerlCoordinatePrecision(y2);
    }
  } else if (type === "polyline" || type === "polygon") {
    const points = parsePoints(getAttribute(elem, "points"));
    if (!points || points.length < 2) {
      console.error(`Skipping ${elem.toString()}: single point or less`);
      return null;
    }

    let transformedPoints = transform ? transformPoints(points, transform) : points;
    
    // In itinerary mode, if original was polygon, convert to polyline and duplicate first point
    if (type === "polygon") {
      // Add first point to end to close the path (as polyline)
      transformedPoints.push(transformedPoints[0]);
      obj.type = "polyline";
    }

    obj.points = transformedPoints.map(p => `${toPerlCoordinatePrecision(p[0])},${toPerlCoordinatePrecision(p[1])}`).join(" ");
  } else if (type === "path") {
    const d = getAttribute(elem, "d");
    if (!d) return null;

    try {
      // Parse and convert path to points with itinerary-specific logic
      const pathData = parsePath(d);
      const absoluteData = pathToAbsolute(pathData);
      let points = pathToPoints(absoluteData.commands, true); // true = itinerary mode

      if (!points || points.length < 2) {
        console.error(`Skipping ${elem.toString()}: single point or less`);
        return null;
      }

      // Transform points
      let transformedPoints = transform ? transformPoints(points, transform) : points;

      // If original path was a polygon-like path, convert to polyline
      if (isPolygonPath(absoluteData.commands)) {
        // In itinerary mode, don't auto-close, but add explicit line to start if needed
        const first = transformedPoints[0];
        const last = transformedPoints[transformedPoints.length - 1];
        const threshold = 0.4;
        
        // If path was closed (last point near first), add explicit line to first point
        if (Math.abs(last[0] - first[0]) <= threshold && Math.abs(last[1] - first[1]) <= threshold) {
          // Remove the duplicate close point and add explicit first point 
          transformedPoints.pop();
          transformedPoints.push(first);
        }
        obj.type = "polyline";
      } else {
        obj.type = "polyline";
      }

      obj.points = transformedPoints.map(p => `${toPerlCoordinatePrecision(p[0])},${toPerlCoordinatePrecision(p[1])}`).join(" ");
    } catch (error) {
      console.error(`Error processing path ${originalId}:`, error);
      return null;
    }
  } else {
    // Unsupported type for itineraries
    return null;
  }

  return obj;
}
