/**
 * SVG Parser module for SVG to JSON converter
 * Handles XML parsing and element extraction
 */

import { DOMParser } from '@xmldom/xmldom';
import xpath from 'xpath';
import { readFile } from 'fs/promises';

// Namespace URIs
const NAMESPACES = {
  svg: 'http://www.w3.org/2000/svg',
  inkscape: 'http://www.inkscape.org/namespaces/inkscape'
};

/**
 * Load and parse an SVG file
 * @param {string} filename - Path to SVG file
 * @returns {Document} Parsed XML document
 */
export async function loadSVG(filename) {
  const content = await readFile(filename, 'utf8');
  const parser = new DOMParser();
  return parser.parseFromString(content, 'image/svg+xml');
}

/**
 * Create an XPath evaluator with namespace support
 * @param {Document} doc - XML document
 * @returns {Function} XPath query function
 */
export function createXPath(doc) {
  const select = xpath.useNamespaces(NAMESPACES);
  return (expression, node = doc) => select(expression, node);
}

/**
 * Get elements by layer name
 * @param {Function} xpathQuery - XPath query function
 * @param {Document} doc - XML document
 * @param {string|Array} layerNames - Layer name(s) to search for
 * @param {string} elementTypes - Element types to find (e.g., 'rect', 'path')
 * @returns {Array} Array of found elements
 */
export function getElementsByLayer(xpathQuery, doc, layerNames, elementTypes) {
  const names = Array.isArray(layerNames) ? layerNames : [layerNames];
  const types = elementTypes.split('|').map(t => `svg:${t}`).join(' or self::');
  
  const expressions = [];
  for (const name of names) {
    // Search by id attribute
    expressions.push(`//svg:g[@id="${name}"]//*[self::${types}]`);
    // Search by inkscape:label attribute
    expressions.push(`//svg:g[@inkscape:label="${name}"]//*[self::${types}]`);
  }
  
  const results = [];
  for (const expr of expressions) {
    const nodes = xpathQuery(expr);
    results.push(...nodes);
  }
  
  // Remove duplicates
  return [...new Set(results)];
}

/**
 * Get calibration rectangle
 * @param {Function} xpathQuery - XPath query function
 * @param {Document} doc - XML document
 * @returns {Element|null} Calibration rectangle element
 */
export function getCalibrationRect(xpathQuery, doc) {
  // Try different ways to find calibration rectangle
  const expressions = [
    '//svg:g[@id="Calage" or @inkscape:label="Calage"]//svg:rect',
    '//svg:g[@id="Calage" or @inkscape:label="Calage"]//svg:path',
    '//svg:rect[@id="Calage"]',
    '//svg:rect[@inkscape:label="rect-2asc"]',
    '//svg:path[@inkscape:label="rect-2asc"]'
  ];
  
  for (const expr of expressions) {
    const nodes = xpathQuery(expr);
    if (nodes.length > 0) {
      return nodes[0];
    }
  }
  
  return null;
}

/**
 * Get attribute value with fallback
 * @param {Element} element - DOM element
 * @param {string} name - Attribute name
 * @param {*} defaultValue - Default value if attribute not found
 * @returns {string} Attribute value
 */
export function getAttribute(element, name, defaultValue = '') {
  return element.getAttribute(name) || defaultValue;
}

/**
 * Get numeric attribute value
 * @param {Element} element - DOM element
 * @param {string} name - Attribute name
 * @param {number} defaultValue - Default value if attribute not found
 * @returns {number} Numeric attribute value
 */
export function getNumericAttribute(element, name, defaultValue = 0) {
  const value = element.getAttribute(name);
  if (!value) return defaultValue;
  const num = parseFloat(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Parse points attribute from polygon/polyline
 * @param {string} pointsStr - Points attribute value
 * @returns {Array} Array of [x, y] coordinates
 */
export function parsePoints(pointsStr) {
  if (!pointsStr) return [];
  
  // Normalize whitespace and ensure comma separation
  let normalized = pointsStr.trim().replace(/\s+/g, ' ');
  
  // Handle space-separated coordinate pairs
  normalized = normalized.replace(/(-?\d*\.?\d+)\s+(-?\d*\.?\d+)/g, '$1,$2');
  
  // Split into coordinate pairs
  const pairs = normalized.split(/\s+/);
  const points = [];
  
  for (const pair of pairs) {
    const [x, y] = pair.split(',').map(parseFloat);
    if (!isNaN(x) && !isNaN(y)) {
      points.push([x, y]);
    }
  }
  
  return points;
}

/**
 * Get rectangle attributes
 * @param {Element} rect - Rectangle element
 * @returns {Object} Rectangle attributes {x, y, width, height}
 */
export function getRectAttributes(rect) {
  return {
    x: getNumericAttribute(rect, 'x', 0),
    y: getNumericAttribute(rect, 'y', 0),
    width: getNumericAttribute(rect, 'width', 0),
    height: getNumericAttribute(rect, 'height', 0)
  };
}

/**
 * Get line attributes
 * @param {Element} line - Line element
 * @returns {Object} Line attributes {x1, y1, x2, y2}
 */
export function getLineAttributes(line) {
  return {
    x1: getNumericAttribute(line, 'x1', 0),
    y1: getNumericAttribute(line, 'y1', 0),
    x2: getNumericAttribute(line, 'x2', 0),
    y2: getNumericAttribute(line, 'y2', 0)
  };
}

/**
 * Get all parent transforms for an element
 * @param {Element} element - DOM element
 * @returns {Array} Array of transform strings from parent to child
 */
export function getParentTransforms(element) {
  const transforms = [];
  let current = element;
  
  while (current && current.nodeType === 1) { // ELEMENT_NODE
    const transform = current.getAttribute('transform');
    if (transform) {
      transforms.unshift(transform); // Add to beginning (parent first)
    }
    current = current.parentNode;
  }
  
  return transforms;
}

/**
 * Clone element and clean attributes
 * @param {Element} element - Element to clone
 * @param {Array} attributesToRemove - Attributes to remove
 * @returns {Element} Cloned element
 */
export function cloneAndClean(element, attributesToRemove = ['clip-path', 'fill', 'stroke']) {
  const clone = element.cloneNode(true);
  
  for (const attr of attributesToRemove) {
    clone.removeAttribute(attr);
  }
  
  return clone;
}

/**
 * Get element type (tag name without namespace)
 * @param {Element} element - DOM element
 * @returns {string} Element type
 */
export function getElementType(element) {
  return element.nodeName.toLowerCase().replace(/^.*:/, '');
}

/**
 * Check if element has valid dimensions
 * @param {Element} element - DOM element
 * @returns {boolean} True if element has valid dimensions
 */
export function hasValidDimensions(element) {
  const type = getElementType(element);
  
  if (type === 'rect') {
    const width = getNumericAttribute(element, 'width', 0);
    const height = getNumericAttribute(element, 'height', 0);
    return width > 0 && height > 0;
  }
  
  if (type === 'line') {
    const x1 = getNumericAttribute(element, 'x1', 0);
    const y1 = getNumericAttribute(element, 'y1', 0);
    const x2 = getNumericAttribute(element, 'x2', 0);
    const y2 = getNumericAttribute(element, 'y2', 0);
    return x1 !== x2 || y1 !== y2;
  }
  
  if (type === 'polygon' || type === 'polyline') {
    const points = element.getAttribute('points');
    return points && points.trim().length > 0;
  }
  
  if (type === 'path') {
    const d = element.getAttribute('d');
    return d && d.trim().length > 0;
  }
  
  return true;
} 