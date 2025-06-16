/**
 * Geometry calculations for SVG to JSON converter
 */

import { sqrt, abs } from './perlMath.js';

/**
 * Calculate the perimeter of a polygon
 * @param {number[][]} points - Array of [x, y] coordinates
 * @returns {number} Perimeter length
 */
export function polygonPerimeter(points) {
  if (points.length < 2) return 0;
  
  let length = 0;
  const n = points.length;
  
  for (let i = 0; i < n; i++) {
    const v1 = points[i];
    const v2 = points[(i + 1) % n];
    const dx = v2[0] - v1[0];
    const dy = v2[1] - v1[1];
    length += sqrt(dx * dx + dy * dy);
  }
  
  return length;
}

/**
 * Calculate the area of a polygon using the shoelace formula
 * @param {number[][]} points - Array of [x, y] coordinates
 * @returns {number} Absolute area
 */
export function polygonArea(points) {
  if (points.length < 3) return 0;
  
  let area = 0;
  const n = points.length;
  
  for (let i = 0; i < n; i++) {
    const v1 = points[i];
    const v2 = points[(i + 1) % n];
    area += v1[0] * v2[1] - v2[0] * v1[1];
  }
  
  return abs(area) / 2;
}

/**
 * Check if a polygon should be filtered based on area/perimeter ratio
 * @param {number[][]} points - Array of [x, y] coordinates
 * @param {number} minRatio - Minimum area/perimeter ratio
 * @returns {boolean} True if polygon should be kept
 */
export function isValidPolygon(points, minRatio = 0.2) {
  if (points.length < 3) return false;
  
  const area = polygonArea(points);
  const perimeter = polygonPerimeter(points);
  
  if (perimeter === 0) return false;
  
  const ratio = area / perimeter;
  return ratio >= minRatio;
}

/**
 * Calculate the centroid of a polygon
 * @param {number[][]} points - Array of [x, y] coordinates
 * @returns {number[]} Centroid [x, y]
 */
export function polygonCentroid(points) {
  if (points.length === 0) return [0, 0];
  
  let cx = 0;
  let cy = 0;
  let area = 0;
  const n = points.length;
  
  for (let i = 0; i < n; i++) {
    const v1 = points[i];
    const v2 = points[(i + 1) % n];
    const a = v1[0] * v2[1] - v2[0] * v1[1];
    area += a;
    cx += (v1[0] + v2[0]) * a;
    cy += (v1[1] + v2[1]) * a;
  }
  
  area = area / 2;
  if (abs(area) < 1e-10) {
    // Degenerate polygon, return average of points
    const sumX = points.reduce((sum, p) => sum + p[0], 0);
    const sumY = points.reduce((sum, p) => sum + p[1], 0);
    return [sumX / n, sumY / n];
  }
  
  const factor = 1 / (6 * area);
  return [cx * factor, cy * factor];
}

/**
 * Calculate bounding box of points
 * @param {number[][]} points - Array of [x, y] coordinates
 * @returns {object} Bounding box {minX, minY, maxX, maxY, width, height}
 */
export function getBoundingBox(points) {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Check if a point is inside a polygon using ray casting algorithm
 * @param {number[]} point - Point [x, y] to test
 * @param {number[][]} polygon - Array of polygon vertices
 * @returns {boolean} True if point is inside polygon
 */
export function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    
    if (((yi > y) !== (yj > y)) && 
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

/**
 * Simplify a polygon by removing collinear points
 * @param {number[][]} points - Array of [x, y] coordinates
 * @param {number} tolerance - Tolerance for collinearity check
 * @returns {number[][]} Simplified polygon
 */
export function simplifyPolygon(points, tolerance = 0.01) {
  if (points.length <= 3) return points;
  
  const simplified = [];
  const n = points.length;
  
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    
    // Check if current point is collinear with prev and next
    const crossProduct = 
      (curr[0] - prev[0]) * (next[1] - prev[1]) - 
      (curr[1] - prev[1]) * (next[0] - prev[0]);
    
    if (Math.abs(crossProduct) > tolerance) {
      simplified.push(curr);
    }
  }
  
  return simplified;
} 