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

  // Text pattern (Perl: $data->{text}{$class}{$id}) - currently not in JS output structure
  match = processedId.match(/^(r?text(-top)?)\s+(\S+)\s+(\d+(?:\.\d+)?)\s+(\S+)\s(.*)$/i);
  if (match) {
    console.warn(`${ANSI.yellow}Warning: 'text' type furniture "${processedId}" found, but not explicitly handled in current JSON structure. Skipping.${ANSI.normal}`);
    return null;
    // const [, text_type_full, top_modifier, text_class, size, color, text_content] = match;
    // return {
    //   processedId,
    //   where: "text", // Needs a decision on where to store this
    //   type: text_class,
    //   textDetails: {
    //     type: text_type_full,
    //     isTop: !!(top_modifier && top_modifier === "-top"),
    //     size: parseFloat(size),
    //     color: color,
    //     text: text_content.replace(/\\n/g, "\n"),
    //   }
    // };
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
  };

  // Process background
  const backgroundElements = getElementsByLayer(
    xpath,
    doc,
    ["Contour", "contour"],
    "rect|polygon|path"
  );
  for (const elem of backgroundElements) {
    const obj = processElement(elem, calibrationTransform);
    if (obj) {
      output.background.push(obj);
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
  // const itineraryElements = getElementsByLayer(
  //   xpath,
  //   doc,
  //   ["Lignes de couloir", "lignes de couloir"],
  //   "polyline|path"
  // );
  // for (const elem of itineraryElements) {
  //   const obj = processElement(elem, calibrationTransform);
  //   if (obj && obj.type === "polyline") {
  //     output.itineraries.push(obj);
  //   }
  // }

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
        point: [roundTo(calculatedPoint[0]), roundTo(calculatedPoint[1])],
        direction: roundTo(calculatedDirection),
        objects: deskObjects,
      };

      if (params.indicatorX !== undefined) deskOutputObject.indicator_x = roundTo(params.indicatorX);
      if (params.indicatorY !== undefined) deskOutputObject.indicator_y = roundTo(params.indicatorY);
      if (params.indicatorA !== undefined) deskOutputObject.indicator_a = params.indicatorA; // Integer

      // Ensure the category exists
      if (!output.desks[classifiedType]) {
        output.desks[classifiedType] = {};
      }
      output.desks[classifiedType][deskOutputObject.id] = deskOutputObject;
      console.log(`  -> Added to output.desks.${classifiedType}.${deskOutputObject.id}`);

    } else if (where === "furniture") {
      const obj = processElement(elem, calibrationTransform);
      if (!obj) {
        console.warn(`  -> Could not process base geometry for furniture: ${processedId}`);
        continue;
      }

      obj.class = classifiedType; // e.g., "armoire"
      obj.id = processedId; // Already processed

      if (!output.furniture[classifiedType]) {
        output.furniture[classifiedType] = {};
      }
      output.furniture[classifiedType][processedId] = obj;
      console.log(`  -> Added to output.furniture.${classifiedType}.${processedId}`);

    } else {
      // This case should ideally be handled by processAndClassifyId returning null
      // or by specific handling for "tag", "text" if they were to be implemented.
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
        points: formatPoints(transformedPoints),
      };
      break;

    case "polygon":
      const polygonPoints = parsePoints(getAttribute(elem, "points"));
      if (polygonPoints.length >= 3) {
        const transformed = transformPoints(polygonPoints, transform);
        const filtered = filterClosePoints(transformed);
        if (filtered.length >= 3 && isValidPolygon(filtered)) {
          obj = {
            type: "polygon",
            points: formatPoints(filtered),
          };
        }
      }
      break;

    case "polyline":
      const polylinePoints = parsePoints(getAttribute(elem, "points"));
      if (polylinePoints.length >= 2) {
        const transformed = transformPoints(polylinePoints, transform);
        const filtered = filterClosePoints(transformed, 0.4, false);
        if (filtered.length >= 2) {
          obj = {
            type: "polyline",
            points: formatPoints(filtered),
          };
        }
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
        type: "polyline",
        points: formatPoints(transformedLine),
      };
      break;

    case "path":
      const d = getAttribute(elem, "d");
      if (d) {
        const parsed = parsePath(d);
        const absolute = pathToAbsolute(parsed);

        if (isPolygonPath(absolute.commands)) {
          const pathPoints = pathToPoints(absolute.commands);
          if (pathPoints.length >= 3) {
            const transformed = transformPoints(pathPoints, transform);
            const filtered = filterClosePoints(transformed);
            if (filtered.length >= 3 && isValidPolygon(filtered)) {
              obj = {
                type: "polygon",
                points: formatPoints(filtered),
              };
            }
          }
        } else {
          // For non-polygon paths, keep as path
          obj = {
            type: "path",
            d: d,
          };
        }
      }
      break;


  }

  if (obj && originalId) { // Changed id to originalId here
    obj.id = originalId; // The ID set here is the raw one from SVG, can be overridden later
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
 * Extracts points and calculates direction for desks based on Perl logic.
 * Handles specific cases like 2-point polygons or lines.
 */
function processDeskGeometryPerl(elem, calibrationTransform) {
  const type = elem.tagName.toLowerCase();
  let point1, point2;

  console.log(`\nProcessing desk geometry for element type: ${type}`);
  console.log(`Element ID: ${elem.getAttribute('id')}`);
  console.log(`Calibration transform: ${JSON.stringify(calibrationTransform)}`);

  // Get element transforms including parent transforms
  const transforms = getNodeTransforms(elem);
  let transform = calibrationTransform;
  if (transforms) {
    console.log(`Element transforms: ${JSON.stringify(transforms)}`);
    if (transform) {
      transform = multiplyMatrices(transform, transforms);
      console.log(`Combined transform: ${JSON.stringify(transform)}`);
    } else {
      transform = transforms;
    }
  }

  if (type === "polygon") {
    const points = parsePoints(getAttribute(elem, "points"));
    console.log(`Polygon points before transform: ${JSON.stringify(points)}`);
    if (points.length === 2) {
      // Perl expects exactly 2 points for desks
      point1 = transformPoint(points[0][0], points[0][1], transform);
      point2 = transformPoint(points[1][0], points[1][1], transform);
      console.log(`Transformed points: point1=${JSON.stringify(point1)}, point2=${JSON.stringify(point2)}`);
    } else {
      console.warn(`Polygon desk does not have exactly 2 points (found ${points.length}). Ignoring.`);
      return null;
    }
  } else if (type === "line") {
    const line = getLineAttributes(elem);
    console.log(`Line attributes before transform: ${JSON.stringify(line)}`);
    point1 = transformPoint(line.x1, line.y1, transform);
    point2 = transformPoint(line.x2, line.y2, transform);
    console.log(`Transformed points: point1=${JSON.stringify(point1)}, point2=${JSON.stringify(point2)}`);
  } else if (type === "path") {
    const d = getAttribute(elem, "d");
    if (!d) {
      console.warn("Path element has no 'd' attribute");
      return null;
    }
    console.log(`Path data: ${d}`);

    // Parse the path and convert to absolute coordinates
    const parsed = parsePath(d);
    const absolute = pathToAbsolute(parsed);
    console.log(`Parsed path commands: ${JSON.stringify(absolute.commands)}`);

    // For desk paths, we expect simple lines (M + H/V/L)
    if (absolute.commands.length >= 2) {
      const start = absolute.commands[0]; // Should be M
      const end = absolute.commands[1]; // Should be H/V/L
      
      if (start.command === 'M') {
        // Extract coordinates from params array
        const [startX, startY] = start.params;
        console.log(`Path start point before transform: [${startX},${startY}]`);
        
        point1 = transformPoint(startX, startY, transform);
        console.log(`Path start point after transform: ${JSON.stringify(point1)}`);
        
        // Handle horizontal/vertical lines
        if (end.command === 'H') {
          const [endX] = end.params;
          point2 = transformPoint(endX, startY, transform);
          console.log(`Horizontal line end point: ${JSON.stringify(point2)}`);
        } else if (end.command === 'V') {
          const [endY] = end.params;
          point2 = transformPoint(startX, endY, transform);
          console.log(`Vertical line end point: ${JSON.stringify(point2)}`);
        } else if (end.command === 'L') {
          const [endX, endY] = end.params;
          point2 = transformPoint(endX, endY, transform);
          console.log(`Line end point: ${JSON.stringify(point2)}`);
        } else {
          console.warn(`Unexpected end command ${end.command} in desk path`);
          return null;
        }
      } else {
        console.warn(`Path doesn't start with Move command (found ${start.command})`);
        return null;
      }
    } else {
      console.warn(`Path has too few commands (found ${absolute.commands.length})`);
      return null;
    }
  } else {
    console.warn(`Unsupported desk type: ${type}`);
    return null;
  }

  if (!point1 || !point2) {
    console.warn("Failed to calculate points");
    return null;
  }

  // Calculate initial direction from the line
  let direction = Math.atan2(point2[1] - point1[1], point2[0] - point1[0]);
  console.log(`Calculated direction: ${direction}`);

  // Return the desk geometry
  const result = {
    point: point1,
    direction: direction
  };
  console.log(`Final desk geometry: ${JSON.stringify(result)}`);
  return result;
}
