import { DOMParser } from '@xmldom/xmldom';

/**
 * Parses an SVG string into a DOM document.
 * @param {string} svgString - The SVG content as a string.
 * @returns {Document} The parsed DOM document.
 */
export function parseSVG(svgString) {
  const parser = new DOMParser();
  return parser.parseFromString(svgString, 'image/svg+xml');
}

/**
 * Finds an element by its ID.
 * @param {Document} doc - The DOM document.
 * @param {string} id - The ID of the element to find.
 * @returns {Element | null} The found element or null.
 */
export function getElementById(doc, id) {
  return doc.getElementById(id);
}

/**
 * Finds elements by tag name.
 * @param {Document | Element} node - The DOM document or an element to search within.
 * @param {string} tagName - The tag name to search for.
 * @returns {HTMLCollectionOf<Element>} A collection of found elements.
 */
export function getElementsByTagName(node, tagName) {
  return node.getElementsByTagName(tagName);
}

/**
 * Helper to get all child elements of a given node.
 * @param {Element} node - The parent node.
 * @returns {Element[]} An array of child elements.
 */
function getAllChildElements(node) {
  const children = [];
  if (node && node.childNodes) {
    for (let i = 0; i < node.childNodes.length; i++) {
      if (node.childNodes[i].nodeType === 1) { // Node.ELEMENT_NODE
        children.push(node.childNodes[i]);
      }
    }
  }
  return children;
}

/**
 * Helper function to find group elements by various ID or inkscape:label attributes.
 * @param {Document} doc - The DOM document.
 * @param {string[]} ids - An array of possible IDs.
 * @param {string[]} labels - An array of possible inkscape:label values.
 * @returns {Element[]} An array of found group elements.
 */
function findGroups(doc, ids = [], labels = []) {
  const groups = [];
  const allGroups = doc.getElementsByTagName('g');

  for (let i = 0; i < allGroups.length; i++) {
    const g = allGroups[i];
    const id = g.getAttribute('id');
    const label = g.getAttribute('inkscape:label');

    if (ids.includes(id) || labels.includes(label)) {
      groups.push(g);
    }
  }
  // Also check for root elements that might match IDs if no groups are found (e.g. rect with id="Calage")
  ids.forEach(idValue => {
    const elementById = doc.getElementById(idValue);
    if (elementById && elementById.tagName !== 'g' && !groups.includes(elementById)) {
       // This case is more for specific elements like <rect id="Calage"> not in a group
       // The main selection functions below will handle specific element types from groups.
    }
  });
  return groups;
}

/**
 * Selects elements of specified tag names from a list of group elements.
 * @param {Element[]} groups - Array of group elements to search within.
 * @param {string[]} tagNames - Array of tag names to select (e.g., ['rect', 'path']).
 * @returns {Element[]} An array of found elements.
 */
function selectElementsFromGroups(groups, tagNames) {
  const elements = [];
  groups.forEach(group => {
    tagNames.forEach(tagName => {
      const found = group.getElementsByTagName(tagName);
      for (let i = 0; i < found.length; i++) {
        elements.push(found[i]);
      }
    });
  });
  return elements;
}

/**
 * Selects all direct child elements of any type from a list of group elements.
 * @param {Element[]} groups - Array of group elements to search within.
 * @returns {Element[]} An array of found elements.
 */
function selectAllElementsFromGroups(groups) {
  const elements = [];
  groups.forEach(group => {
    const children = getAllChildElements(group);
    elements.push(...children);
  });
  return elements;
}


// Specific selection functions based on Perl script's XPath queries:

/**
 * Gets calibration rectangles.
 * XPath: (//svg:g[@id="Calage" or @inkscape:label="Calage"]//svg:rect|//svg:rect[@id="Calage"])
 * @param {Document} doc - The DOM document.
 * @returns {Element[]} An array of <rect> elements for calibration.
 */
export function getCalageRects(doc) {
  const elements = [];
  const calageGroups = findGroups(doc, ['Calage'], ['Calage']);
  elements.push(...selectElementsFromGroups(calageGroups, ['rect']));

  // Also find <rect id="Calage"> not necessarily in a group
  const directCalageRect = doc.getElementById('Calage');
  if (directCalageRect && directCalageRect.tagName === 'rect' && !elements.includes(directCalageRect)) {
    elements.push(directCalageRect);
  }
  return elements;
}

/**
 * Gets contour elements (rect, path, polygon).
 * XPath: //svg:g[@id="Contour" or @inkscape:label="Contour"]//*[self::svg:rect or self::svg:path or self::svg:polygon]
 * @param {Document} doc - The DOM document.
 * @returns {Element[]} An array of contour elements.
 */
export function getContourElements(doc) {
  const contourGroups = findGroups(doc, ['Contour'], ['Contour']);
  return selectElementsFromGroups(contourGroups, ['rect', 'path', 'polygon']);
}

/**
 * Gets decor elements (rect, path, polygon).
 * XPath: //svg:g[@id="Decor" or @inkscape:label="Decor"]//*[self::svg:rect or self::svg:path or self::svg:polygon]
 * @param {Document} doc - The DOM document.
 * @returns {Element[]} An array of decor elements.
 */
export function getDecorElements(doc) {
  const decorGroups = findGroups(doc, ['Decor'], ['Decor']);
  return selectElementsFromGroups(decorGroups, ['rect', 'path', 'polygon']);
}

/**
 * Gets itinerary elements (line, polyline, polygon, path).
 * XPath: //svg:g[@id="Lignes_de_couloir" or @inkscape:label="Lignes de couloir"]//*[self::svg:line or self::svg:polyline or self::svg:polygon or self::svg:path]
 * @param {Document} doc - The DOM document.
 * @returns {Element[]} An array of itinerary elements.
 */
export function getItineraryElements(doc) {
  const itineraryGroups = findGroups(doc, ['Lignes_de_couloir'], ['Lignes de couloir']);
  return selectElementsFromGroups(itineraryGroups, ['line', 'polyline', 'polygon', 'path']);
}

/**
 * Gets room elements (any element type).
 * XPath: //svg:g[@id="Salles" or @id="Pièces" or @id="pièces" or @inkscape:label="Salles" or @inkscape:label="Pièces" or @inkscape:label="pièces"]//*
 * @param {Document} doc - The DOM document.
 * @returns {Element[]} An array of room elements.
 */
export function getRoomElements(doc) {
  const roomGroups = findGroups(doc, ['Salles', 'Pièces', 'pièces'], ['Salles', 'Pièces', 'pièces']);
  return selectAllElementsFromGroups(roomGroups);
}

/**
 * Gets furniture elements (line, polyline, path).
 * XPath: //svg:g[@id="Mobilier" or @id="mobilier" or @id="MOBILIER" or @id="MOBILIERS" or @inkscape:label="Mobilier" or @inkscape:label="mobilier" or @inkscape:label="MOBILIER" or @inkscape:label="MOBILIERS"]//*[self::svg:line or self::svg:polyline or self::svg:path]
 * @param {Document} doc - The DOM document.
 * @returns {Element[]} An array of furniture elements.
 */
export function getFurnitureElements(doc) {
  const furnitureGroups = findGroups(doc,
    ['Mobilier', 'mobilier', 'MOBILIER', 'MOBILIERS'],
    ['Mobilier', 'mobilier', 'MOBILIER', 'MOBILIERS']
  );
  return selectElementsFromGroups(furnitureGroups, ['line', 'polyline', 'path']);
}
