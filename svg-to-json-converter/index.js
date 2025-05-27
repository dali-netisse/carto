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
  classifyObject,
  classifyFurniture,
  parseDeskIds,
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
  const itineraryElements = getElementsByLayer(
    xpath,
    doc,
    ["Lignes de couloir", "lignes de couloir"],
    "polyline|path"
  );
  for (const elem of itineraryElements) {
    const obj = processElement(elem, calibrationTransform);
    if (obj && obj.type === "polyline") {
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
    ["Mobilier", "mobilier"],
    "rect|polygon|path|circle|line|polyline"
  );
  console.log(`Found ${furnitureElements.length} furniture elements`);

  for (const elem of furnitureElements) {
    let id = getAttribute(elem, "id");
    if (!id) continue;

    // Check for inkscape:label if id is generic
    const label = elem.getAttributeNS(NAMESPACES.inkscape, "label");
    if (label && id.match(/^path[-_\s\d]+$/)) {
      id = label;
    }

    console.log(`Processing furniture: ${id}`);

    const furniture = classifyFurniture(id);
    if (!furniture) {
      console.log(`  -> Not classified as furniture`);
      continue;
    }

    console.log(`  -> Classified as ${furniture.type}`);

    if (furniture.type === "desks" || furniture.type === "meeting") {
      console.log(`  -> Desk info: ${JSON.stringify(furniture)}`);
    }

    if (furniture.type === "desks" || furniture.type === "meeting") {
      // Process desk/meeting furniture
      const obj = processElement(elem, calibrationTransform);
      if (!obj) continue;
      console.log(`  -> Process element result: ${JSON.stringify(obj)}`);

      // Calculate point and direction using specialized desk utilities that match the Perl implementation
      const geometryResult = processDeskGeometry(elem, calibrationTransform);
      let point, direction;

      if (geometryResult) {
        point = geometryResult.point;
        direction = geometryResult.direction;
      } else {
        // Fallback to original code for backward compatibility
        if (obj.type === "polyline" && obj.points) {
          const points = parsePolygonPoints(obj.points);
          if (points.length === 2) {
            // Midpoint
            point = [
              (points[0][0] + points[1][0]) / 2,
              (points[0][1] + points[1][1]) / 2,
            ];
            // Direction from first to second point - matches Perl atan2($point2->[1] - $point1->[1], $point2->[0] - $point1->[0])
            direction = Math.atan2(
              points[1][1] - points[0][1],
              points[1][0] - points[0][0]
            );
          } else {
            point = polygonCentroid(points);
            direction = 0;
          }
        } else if (obj.type === "polygon") {
          const points = parsePolygonPoints(obj.points);
          point = polygonCentroid(points);

          // Calculate direction from indicator if available
          if (
            furniture.indicatorX !== undefined &&
            furniture.indicatorY !== undefined
          ) {
            const angle = Math.atan2(
              furniture.indicatorY,
              furniture.indicatorX
            );
            direction = angle + ((furniture.indicatorA || 0) * Math.PI) / 2;
          } else {
            direction = 0;
          }
        } else {
          // For other types, use center
          point = [obj.x || 0, obj.y || 0];
          direction = 0;
        }
      }

      // If indicator values are provided, override the direction calculation
      if (
        furniture.indicatorX !== undefined &&
        furniture.indicatorY !== undefined
      ) {
        const angle = Math.atan2(furniture.indicatorY, furniture.indicatorX);
        direction = angle + ((furniture.indicatorA || 0) * Math.PI) / 2;
      }

      // Parse desk IDs
      const objects = parseDeskIds(
        furniture.deskIds,
        furniture.office,
        furniture.width,
        furniture.depth
      );
      console.log(`Desk ${id} has ${objects.length} desk objects`);

      // Create desk object
      const deskObj = {
        class: furniture.type,
        id: id.toLowerCase(),
        point: [roundTo(point[0]), roundTo(point[1])],
        direction: roundTo(direction),
        objects: objects,
      };
      console.log(`  -> Desk objects: ${JSON.stringify(objects)}`);

      // Add indicator info if available - match Perl property names and rounding
      if (furniture.indicatorX !== undefined)
        deskObj.indicator_x = roundTo(furniture.indicatorX);
      if (furniture.indicatorY !== undefined)
        deskObj.indicator_y = roundTo(furniture.indicatorY);
      if (furniture.indicatorA !== undefined)
        deskObj.indicator_a = furniture.indicatorA;

      console.log(
        `Adding desk to output.desks[${furniture.type}][${deskObj.id}]`
      );
      console.log(`Current output.desks: ${JSON.stringify(output.desks)}`);

      output.desks[furniture.type][deskObj.id] = deskObj;

      console.log(
        `After adding: ${JSON.stringify(
          output.desks[furniture.type][deskObj.id]
        )}`
      );
      console.log(
        `Keys in output.desks[${furniture.type}]: ${Object.keys(
          output.desks[furniture.type]
        )}`
      );
    } else {
      // Other furniture types
      const obj = processElement(elem, calibrationTransform);
      if (!obj) continue;

      obj.class = furniture.class || furniture.type;
      obj.id = id;

      console.log(
        `Adding desk: ${furniture.type} - ${deskObj.id} with ${objects.length} objects`
      );
      if (!output.furniture[furniture.type]) {
        output.furniture[furniture.type] = {};
      }
      output.furniture[furniture.type][id] = obj;
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
  const id = getAttribute(elem, "id");

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

    case "circle":
      const cx = parseFloat(getAttribute(elem, "cx", "0"));
      const cy = parseFloat(getAttribute(elem, "cy", "0"));
      const r = parseFloat(getAttribute(elem, "r", "0"));
      if (r > 0) {
        const center = transformPoint(cx, cy, transform);
        obj = {
          type: "circle",
          x: roundTo(center[0]),
          y: roundTo(center[1]),
          r: roundTo(r),
        };
      }
      break;
  }

  if (obj && id) {
    obj.id = id;
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
