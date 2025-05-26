/**
 * @fileoverview Utility functions for geometric calculations.
 */

/**
 * Represents a 2D point.
 * @typedef {Object} Point
 * @property {number} x - The x-coordinate.
 * @property {number} y - The y-coordinate.
 */

/**
 * Calculates the Euclidean distance between two points.
 * @param {Point} p1 - The first point.
 * @param {Point} p2 - The second point.
 * @returns {number} The distance between p1 and p2.
 */
export function distance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates the perimeter of a polygon defined by an array of points.
 * If the polygon is not explicitly closed (last point !== first point),
 * the segment connecting the last and first points is included.
 * @param {Point[]} pointsArray - An array of points [{x,y}, ...].
 * @returns {number} The perimeter of the polygon.
 */
export function calculatePolygonPerimeter(pointsArray) {
  if (!pointsArray || pointsArray.length < 2) {
    return 0;
  }

  let perimeter = 0;
  for (let i = 0; i < pointsArray.length - 1; i++) {
    perimeter += distance(pointsArray[i], pointsArray[i + 1]);
  }

  // Add the distance from the last point to the first point if it's a polygon (more than 2 points)
  // or if it's an open polyline with at least 2 points, this loop structure is fine.
  // For polygons specifically, this closes it.
  if (pointsArray.length > 1) {
     // If it's meant to be a closed polygon, ensure the closing segment is counted.
     // The simplifyPoints logic will handle if the last point is a duplicate of the first.
     // Here, we assume pointsArray represents the vertices in order.
     if (pointsArray[0].x !== pointsArray[pointsArray.length -1].x || pointsArray[0].y !== pointsArray[pointsArray.length -1].y ) {
        perimeter += distance(pointsArray[pointsArray.length - 1], pointsArray[0]);
     }
  }
  return perimeter;
}

/**
 * Calculates the area of a polygon defined by an array of points using the Shoelace formula.
 * Assumes the points are ordered (clockwise or counter-clockwise).
 * @param {Point[]} pointsArray - An array of points [{x,y}, ...].
 * @returns {number} The area of the polygon. Returns a positive value.
 */
export function calculatePolygonArea(pointsArray) {
  if (!pointsArray || pointsArray.length < 3) {
    return 0; // A polygon needs at least 3 points
  }

  let area = 0;
  for (let i = 0; i < pointsArray.length; i++) {
    const p1 = pointsArray[i];
    const p2 = pointsArray[(i + 1) % pointsArray.length]; // Next point, wraps around
    area += (p1.x * p2.y - p2.x * p1.y);
  }

  return Math.abs(area / 2);
}
