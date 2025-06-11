/**
 * Utility functions for SVG to JSON converter
 */

import sortKeys from "sort-keys";

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
 * Round a number to a specified number of decimal places
 * @param {number} num - Number to round
 * @param {number} decimals - Number of decimal places
 * @returns {number} Rounded number
 */
export function roundTo(num, decimals = 6) {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * Match Perl's floating-point precision exactly
 * Perl uses different precision for different types of values:
 * - Direction values: 14 decimal places (from atan2 output)
 * - Coordinate values: typically 4 decimal places for final output
 * @param {number} num - Number to format
 * @param {number} maxDecimalPlaces - Maximum decimal places (4 for coordinates, 14 for directions)
 * @returns {number} Number with Perl-like precision
 */
export function toPerlCoordinatePrecision(num, maxDecimalPlaces = 4) {
  if (!isFinite(num)) return num;
  
  // For special direction values like π/2, handle exactly as Perl does
  if (maxDecimalPlaces === 14) {
    // For direction values, use string truncation to match Perl's atan2 behavior
    const str = num.toString();
    if (str.includes('.')) {
      const parts = str.split('.');
      if (parts[1].length > 13) {
        // Truncate to 13 decimal places to match Perl's atan2 output
        return parseFloat(parts[0] + '.' + parts[1].substring(0, 13));
      }
    }
    return num;
  }
  
  // For coordinate values, round to maxDecimalPlaces to match Perl's output
  const factor = Math.pow(10, maxDecimalPlaces);
  return Math.round(num * factor) / factor;
}

/**
 * Match Perl's direction calculation precision exactly
 * Perl's atan2 outputs 14 decimal places
 * @param {number} y - Y component
 * @param {number} x - X component  
 * @returns {number} Direction angle in radians with Perl-like precision
 */
export function toPerlDirectionPrecision(y, x) {
  const direction = Math.atan2(y, x);
  return toPerlCoordinatePrecision(direction, 14);
}

/**
 * Format a point for output
 * @param {number[]} point - [x, y] coordinates
 * @returns {string} Formatted point string "x,y"
 */
export function formatPoint(point) {
  return `${toPerlCoordinatePrecision(point[0])},${toPerlCoordinatePrecision(point[1])}`;
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
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if two points are within a threshold distance
 * @param {number[]} p1 - First point [x, y]
 * @param {number[]} p2 - Second point [x, y]
 * @param {number} threshold - Distance threshold
 * @returns {boolean} True if points are within threshold
 */
export function pointsAreClose(p1, p2, threshold = 0.4) {
  return Math.abs(p1[0] - p2[0]) <= threshold && 
         Math.abs(p1[1] - p2[1]) <= threshold;
}

/**
 * Remove duplicate or too-close points from a polygon
 * @param {number[][]} points - Array of points
 * @param {number} threshold - Distance threshold
 * @param {boolean} isPolygon - Whether to check first/last point
 * @returns {number[][]} Filtered points
 */
export function filterClosePoints(points, threshold = 0.4, isPolygon = true) {
  if (points.length < 2) return points;
  
  const filtered = [];
  let lastPoint = null;
  
  for (const point of points) {
    if (!lastPoint || !pointsAreClose(point, lastPoint, threshold)) {
      filtered.push(point);
      lastPoint = point;
    }
  }
  
  // For polygons, check if last point is too close to first
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
  let match;
  while ((match = cleanId.match(/ +x-(offset[XY]|scale) (-?\d+(?:\.\d+)?)/i))) {
    const [fullMatch, attrName, value] = match;
    attributes[attrName] = parseNumber(value);
    cleanId = cleanId.replace(fullMatch, '');
  }
  
  // Clean up any extra spaces
  cleanId = cleanId.replace(/\s+/g, ' ').trim();
  
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

 