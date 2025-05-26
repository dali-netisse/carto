import { distance, calculatePolygonArea, calculatePolygonPerimeter } from './geometryUtils.js';
import { SVGPathData, SVGPathDataCommands } from 'svg-pathdata'; // For parsing path for single point check

const PROXIMITY_THRESHOLD = 0.4;
const AREA_PERIMETER_RATIO_THRESHOLD = 0.2; // For non-itinerary/furniture polygons
const MIN_POINTS_ITINERARY_POLYLINE = 2; // For polylines
const MIN_POINTS_ITINERARY_POLYGON = 3; // For polygons that remain polygons (e.g. decor that is an area)
const MIN_POINTS_POLYGON = 3; // Standard minimum for a polygon

/**
 * Parses a string of points (e.g., "x1,y1 x2,y2 ...") into an array of {x, y} objects.
 * @param {string} pointsString - The string from polygon/polyline "points" attribute.
 * @returns {Array<Point>} An array of point objects.
 */
function parsePointsString(pointsString) {
  const points = [];
  if (!pointsString) return points;
  const pairs = pointsString.trim().split(/\s+/);
  for (const pair of pairs) {
    const coords = pair.split(',').map(parseFloat);
    if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
      points.push({ x: coords[0], y: coords[1] });
    }
  }
  return points;
}

/**
 * Converts an array of {x, y} objects back to a points string.
 * Uses toFixed(2) for cleaner output.
 * @param {Array<Point>} pointsArray - An array of point objects.
 * @returns {string} The points string.
 */
function formatPointsString(pointsArray) {
  return pointsArray.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}


export function simplifyPoints(node, isItineraryOrFurniture) {
  const originalPointsString = node.getAttribute('points');
  let points = parsePointsString(originalPointsString);
  const originalPointCount = points.length;

  if (points.length === 0) {
    node.isValid = false;
    node.invalidReason = "No points to process";
    return;
  }

  // 1. Point Proximity Reduction
  if (points.length > 0) {
    const simplifiedPoints = [points[0]];
    for (let i = 1; i < points.length; i++) {
      if (distance(points[i], simplifiedPoints[simplifiedPoints.length - 1]) > PROXIMITY_THRESHOLD) {
        simplifiedPoints.push(points[i]);
      }
    }
    points = simplifiedPoints;
  }
  
  // Use node.currentTagName which reflects changes made by nodeTransformer.js
  const currentTagName = node.currentTagName || node.tagName.toLowerCase();
  const isPolygon = currentTagName === 'polygon';

  // 2. Polygon Closing Point (only for polygons, not for itineraries/furniture that become polylines)
  if (isPolygon && !isItineraryOrFurniture && points.length > 1) {
    // If the last point is very close to the first, remove it to avoid trivial segment.
    if (distance(points[points.length - 1], points[0]) <= PROXIMITY_THRESHOLD) {
      points.pop();
    }
  }
  
  // 3. Validity Checks
  let minPointsForCurrentShape = isPolygon ? MIN_POINTS_POLYGON : MIN_POINTS_ITINERARY_POLYLINE;
  if (isItineraryOrFurniture) {
      minPointsForCurrentShape = isPolygon ? MIN_POINTS_ITINERARY_POLYGON : MIN_POINTS_ITINERARY_POLYLINE;
  }


  if (points.length < minPointsForCurrentShape) {
    node.isValid = false;
    node.invalidReason = `Too few points (${points.length} < ${minPointsForCurrentShape}) for ${currentTagName}`;
    // No point in further processing if too few points
    node.setAttribute('points', formatPointsString(points)); // Update with reduced points anyway
    return;
  }

  if (isPolygon) { // This check is for elements that are currently polygons
    const area = calculatePolygonArea(points); // Assumes points define a closed polygon
    const perimeter = calculatePolygonPerimeter(points); // Assumes points define a closed polygon

    if (perimeter === 0) {
      node.isValid = false;
      node.invalidReason = "Perimeter is zero";
      node.setAttribute('points', formatPointsString(points));
      return;
    }
    // Area/Perimeter check for non-itinerary/furniture polygons
    if (!isItineraryOrFurniture && (area / perimeter) < AREA_PERIMETER_RATIO_THRESHOLD) {
      node.isValid = false;
      node.invalidReason = `Area/Perimeter ratio too small (${(area/perimeter).toFixed(3)} < ${AREA_PERIMETER_RATIO_THRESHOLD})`;
      node.setAttribute('points', formatPointsString(points));
      return;
    }
  }

  // 4. Itinerary Polygon to Polyline Conversion
  if (isItineraryOrFurniture && isPolygon && points.length >= MIN_POINTS_ITINERARY_POLYLINE) {
    // If it's an itinerary item that was a polygon, convert it to a polyline
    // The Perl script implies itineraries are more like paths/routes, even if they define an area.
    // If it's still a polygon here, it means it passed polygon validity checks.
    // Now, ensure it's represented as a closed polyline.
    
    node.nodeName = 'polyline'; // Non-standard DOM change
    node.tagName = 'polyline';  // Non-standard DOM change
    node.currentTagName = 'polyline'; // Update current tag name
    console.log(`Itinerary polygon ${node.getAttribute('id') || ''} converted to polyline.`);

    // Ensure the polyline is explicitly closed if it represents an area
    if (points.length > 0 && distance(points[points.length - 1], points[0]) > PROXIMITY_THRESHOLD) {
      points.push({...points[0]}); // Add a copy of the first point to the end
    }
  }

  node.setAttribute('points', formatPointsString(points));
  node.isValid = true;
  node.simplifiedPointsCount = points.length;
  node.originalPointsCount = originalPointCount;
}


export function simplifyPath(node) {
  const dAttribute = node.getAttribute('d');
  if (!dAttribute) {
    node.isValid = false;
    node.invalidReason = "Path has no 'd' attribute";
    return;
  }

  // Path to polygon conversion is now handled directly in nodeTransformer.js.
  // If node.currentTagName is 'polygon', it means it was converted.
  // This function's main job for paths that remain paths is the single point check.

  if (node.currentTagName === 'path') { // Only process if it's still a path
    try {
      const pathData = new SVGPathData(dAttribute).toAbs().commands;
      
      // Single Point Path Check:
      // A path is considered a single point if it's just "M x y" or "M x y Z" or "M x y L x y Z" etc.
      // More accurately: if all coordinates in drawing commands are effectively the same as the first MoveTo.
      if (pathData.length === 0) {
        node.isValid = false;
        node.invalidReason = "Path has no commands";
        return;
      }

      let firstPoint = null;
      if (pathData[0].type === SVGPathDataCommands.MOVE_TO) {
        firstPoint = { x: pathData[0].x, y: pathData[0].y };
      } else {
        node.isValid = false; // Path must start with M
        node.invalidReason = "Path does not start with MOVE_TO";
        return;
      }

      let isSinglePointPath = true;
      for (let i = 0; i < pathData.length; i++) {
        const cmd = pathData[i];
        // Check coordinates of commands that define points
        if (cmd.type !== SVGPathDataCommands.CLOSE_PATH) {
          // For any coordinate in the command, if it's different from firstPoint, it's not a single point path
          for (const key in cmd) {
            if ((key === 'x' || key === 'y' || key === 'x1' || key === 'y1' || key === 'x2' || key === 'y2') && cmd[key] !== undefined) {
              // Using a threshold for comparing coordinates to the first point
              if ( (key === 'x' && Math.abs(cmd.x - firstPoint.x) > PROXIMITY_THRESHOLD) ||
                   (key === 'y' && Math.abs(cmd.y - firstPoint.y) > PROXIMITY_THRESHOLD) ||
                   (key === 'x1' && Math.abs(cmd.x1 - firstPoint.x) > PROXIMITY_THRESHOLD) ||
                   (key === 'y1' && Math.abs(cmd.y1 - firstPoint.y) > PROXIMITY_THRESHOLD) ||
                   (key === 'x2' && Math.abs(cmd.x2 - firstPoint.x) > PROXIMITY_THRESHOLD) ||
                   (key === 'y2' && Math.abs(cmd.y2 - firstPoint.y) > PROXIMITY_THRESHOLD)
                 ) {
                isSinglePointPath = false;
                break;
              }
            }
          }
        }
        if (!isSinglePointPath) break;
      }


      if (isSinglePointPath) {
        node.isValid = false;
        node.invalidReason = "Path effectively describes a single point or has zero length";
        return;
      }

    } catch (e) {
      node.isValid = false;
      node.invalidReason = `Error parsing path data for single point check: ${e.message}`;
      return;
    }
  }

  // If it was converted to polygon by nodeTransformer, it will be handled by simplifyPoints.
  // If it's still a path and passed the single point check, it's valid for now.
  node.isValid = true; // Or keep it undefined if no specific validation passed for paths yet.
                       // Assuming if it's not invalidated, it's valid.
}
