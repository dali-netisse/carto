/**
 * Utility functions for SVG to JSON converter
 */

import sortKeys from "sort-keys";
import { atan2, sqrt, abs } from './perlMath.js';

// ANSI color codes for console output
export const ANSI = {
  reverse: '\x1b[7;31m',
  normal: '\x1b[m'
};

/**
 * Normalize text by removing diacritics and converting to lowercase
 * Equivalent to Perl's NFD normalization and removing combining marks
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
export function normalizeText(text) {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks
    .toLowerCase()
    .replace(/\W/g, ''); // Remove all non-word characters (matches Perl's \W)
}

/**
 * Parse a numeric value, handling undefined and empty strings
 * @param {string|number|undefined} value - Value to parse
 * @param {number} defaultValue - Default value if parsing fails
 * @returns {number} Parsed number
 */
export function parseNumber(value, defaultValue = 0) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Calculate direction using Perl-compatible atan2
 * @param {number} y - Y component
 * @param {number} x - X component  
 * @returns {number} Direction angle in radians with Perl precision
 */
export function calculateDirection(y, x) {
  return atan2(y, x);
}

/**
 * Format a point for output
 * @param {number[]} point - [x, y] coordinates
 * @returns {string} Formatted point string "x,y"
 */
export function formatPoint(point) {
  return `${point[0]},${point[1]}`;
}

/**
 * Format an array of points for output
 * @param {number[][]} points - Array of [x, y] coordinates
 * @returns {string} Space-separated point strings
 */
export function formatPoints(points) {
  return points.map(formatPoint).join(' ');
}

/**
 * Calculate the distance between two points
 * @param {number[]} p1 - First point [x, y]
 * @param {number[]} p2 - Second point [x, y]
 * @returns {number} Distance between points
 */
export function distance(p1, p2) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return sqrt(dx * dx + dy * dy);
}

/**
 * Check if two points are within a threshold distance (Perl-compatible)
 * @param {number[]} p1 - First point [x, y] 
 * @param {number[]} p2 - Second point [x, y]
 * @param {number} threshold - Distance threshold
 * @returns {boolean} True if points should be filtered (too close)
 */
export function pointsAreClose(p1, p2, threshold = 0.4) {
  // Perl logic: filter if dx <= threshold AND dy <= threshold
  // Keep if dx > threshold OR dy > threshold
  const dx = abs(p1[0] - p2[0]);
  const dy = abs(p1[1] - p2[1]);
  return dx <= threshold && dy <= threshold;
}

/**
 * Remove duplicate or too-close points from a polygon (Perl-compatible)
 * @param {number[][]} points - Array of points
 * @param {number} threshold - Distance threshold  
 * @param {boolean} isPolygon - Whether to check first/last point
 * @returns {number[][]} Filtered points
 */
/**
 * Remove duplicate or too-close points from a polygon (Perl-compatible)
 * @param {number[][]} points - Array of points
 * @param {number} threshold - Distance threshold  
 * @param {boolean} isPolygon - Whether to check first/last point
 * @returns {number[][]} Filtered points
 */
export function filterClosePoints(points, threshold = 0.4, isPolygon = true) {
  if (points.length < 2) return points;
  
  const filtered = [];
  let lastPoint = null;
  
  // Apply Perl filtering logic: keep point if no last point OR dx > threshold OR dy > threshold
  for (const point of points) {
    if (!lastPoint || !pointsAreClose(point, lastPoint, threshold)) {
      filtered.push(point);
      lastPoint = point;
    }
    // If pointsAreClose returns true, the point is filtered (not added)
  }
  
  // For polygons, check if last point is too close to first (remove redundant closing point)
  if (isPolygon && filtered.length >= 2) {
    const first = filtered[0];
    const last = filtered[filtered.length - 1];
    if (pointsAreClose(first, last, threshold)) {
      filtered.pop();
    }
  }
  
  return filtered;
}

/**
 * Decode hex escape sequences in strings (e.g., _x2F_ -> /)
 * @param {string} str - String with hex escapes
 * @returns {string} Decoded string
 */
export function decodeHexEscapes(str) {
  return str.replace(/_x([0-9a-fA-F]{2})_/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
}

/**
 * Extract special attributes from ID string
 * @param {string} id - ID string potentially containing attributes
 * @returns {object} Object with cleaned id and extracted attributes
 */
export function extractSpecialAttributes(id) {
  const attributes = {};
  let cleanId = id;
  
  // Extract bubbleSide - must be followed by space or end of string
  const bubbleSideMatch = cleanId.match(/ +x-(left|tl|tr|bl|br)(?= |$)/);
  if (bubbleSideMatch) {
    attributes.bubbleSide = bubbleSideMatch[1];
    cleanId = cleanId.replace(bubbleSideMatch[0], ' ');
  }
  
  // Extract offset and scale attributes
  // Keep these as strings to match Perl behavior - only x,y,width,height,x1,x2,y1,y2 get converted to numbers in Perl
  let match;
  while ((match = cleanId.match(/ +x-(offset[XY]|scale) (-?\d+(?:\.\d+)?)/i))) {
    const [fullMatch, attrName, value] = match;
    attributes[attrName] = value; // Keep as string to match Perl
    cleanId = cleanId.replace(fullMatch, '');
  }
  
  // Clean up any extra spaces - but preserve original spacing for exact Perl compatibility
  cleanId = cleanId.trim();
  
  return { id: cleanId, attributes };
}

/**
 * Create a canonical JSON string (sorted keys, pretty printed, identical to Perl's JSON output)
 * @param {object} obj - Object to stringify
 * @returns {string} JSON string
 */
export function toCanonicalJSON(obj) {
  const sortedOutput = sortKeys(obj, {deep: true});
  const jsonString = JSON.stringify(sortedOutput, null, 3);
  // Match Perl's JSON formatting: add space before colon to match "key" : value format
  // Handle all types of keys including those with special characters
  const formattedJson = jsonString.replace(/"([^"]+)":/g, '"$1" :');
  // Add newline at the end to match Perl's output exactly
  return formattedJson + '\n';
}

/**
 * Deep clone an object
 * @param {object} obj - Object to clone
 * @returns {object} Cloned object
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

 