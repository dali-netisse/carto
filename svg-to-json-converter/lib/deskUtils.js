/**
 * Utility functions for desk furniture processing
 * Helps match Perl implementation of desk-related functionality
 */

import { parsePath, pathToPoints } from "./pathParser.js";
import { transformPoint } from "./transformer.js";
import { toPerlPrecision } from "./utils.js";

/**
 * Extract endpoints from an SVG path or line for desk direction calculation
 * This helps match the Perl implementation which uses first and last points
 * @param {Object} elem - SVG element (path or line)
 * @param {Array|null} transform - Transformation matrix
 * @returns {Array} Array with two points [point1, point2] for direction calculation
 */
export function extractDeskEndpoints(elem, transform) {
  const type = elem.type || elem.nodeName?.toLowerCase();

  if (type === "path" && elem.d) {
    try {
      // Parse path and extract first and last points
      const pathCommands = parsePath(elem.d);
      const pathPoints = pathToPoints(pathCommands);

      if (pathPoints && pathPoints.length >= 2) {
        const firstPoint = pathPoints[0];
        const lastPoint = pathPoints[pathPoints.length - 1];

        // Apply transform if available
        if (transform) {
          const p1 = transformPoint(firstPoint[0], firstPoint[1], transform);
          const p2 = transformPoint(lastPoint[0], lastPoint[1], transform);
          return [p1, p2];
        }

        return [
          [firstPoint[0], firstPoint[1]],
          [lastPoint[0], lastPoint[1]],
        ];
      }
    } catch (e) {
      console.error("Error extracting endpoints from path:", e);
    }
  }

  if (type === "line" || (elem.x1 !== undefined && elem.y1 !== undefined)) {
    const x1 = parseFloat(elem.x1);
    const y1 = parseFloat(elem.y1);
    const x2 = parseFloat(elem.x2);
    const y2 = parseFloat(elem.y2);

    // Apply transform if available
    if (transform) {
      const p1 = transformPoint(x1, y1, transform);
      const p2 = transformPoint(x2, y2, transform);
      return [p1, p2];
    }

    return [
      [x1, y1],
      [x2, y2],
    ];
  }

  if (type === "polyline" && elem.points) {
    const pointsList = elem.points.trim().split(/\s+/);
    if (pointsList.length >= 2) {
      const firstPointStr = pointsList[0];
      const lastPointStr = pointsList[pointsList.length - 1];

      const [x1, y1] = firstPointStr.split(",").map(parseFloat);
      const [x2, y2] = lastPointStr.split(",").map(parseFloat);

      // Apply transform if available
      if (transform) {
        const p1 = transformPoint(x1, y1, transform);
        const p2 = transformPoint(x2, y2, transform);
        return [p1, p2];
      }

      return [
        [x1, y1],
        [x2, y2],
      ];
    }
  }

  return null;
}

/**
 * Calculate desk direction from two points (start and end)
 * Matches the Perl implementation: atan2($point2->[1] - $point1->[1], $point2->[0] - $point1->[0])
 * @param {Array} points - Array of two points [[x1, y1], [x2, y2]]
 * @returns {number} Direction angle in radians
 */
export function calculateDeskDirection(points) {
  if (!points || points.length < 2) return 0;

  const [p1, p2] = points;
  return Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
}

/**
 * Process desk element to extract points and direction
 * @param {Object} elem - SVG element
 * @param {Array} transform - Transformation matrix
 * @returns {Object} Object with point and direction
 */
export function processDeskGeometry(elem, transform) {
  const endpoints = extractDeskEndpoints(elem, transform);
  if (endpoints) {
    const [p1, p2] = endpoints;
    const point = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    const direction = calculateDeskDirection(endpoints);

    return {
      point: [point[0], point[1]], // Remove roundTo for full precision
      direction: toPerlPrecision(direction), // Use Perl-like precision for direction
    };
  }

  return null;
}
