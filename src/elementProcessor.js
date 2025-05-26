import { IDENTITY_MATRIX, multiplyMatrices, transformPoint } from './geometry.js';
import { normalizeNameForKeyMeetingRooms, normalizeNameForKey } from './configLoader.js';
import { distance, calculatePolygonArea, calculatePolygonPerimeter } from './geometryUtils.js'; // calculatePolygonArea, calculatePolygonPerimeter for point calculation

/**
 * Traverses up from the node to its SVG root, accumulating transformations.
 * Returns the total transformation matrix for the node relative to the SVG canvas.
 * @param {Element} node - The SVG element.
 * @param {object} svgTransformParser - Instance of the SVG transform parser.
 * @returns {Matrix} The accumulated transformation matrix.
 */
export function getFlattenedTransform(node, svgTransformParser) {
  let accumulatedMatrix = [...IDENTITY_MATRIX];
  let current = node;
  const matrices = [];

  while (current && current.tagName && current.tagName.toLowerCase() !== 'svg' && current.tagName.toLowerCase() !== 'html') {
    const transformString = current.getAttribute('transform');
    if (transformString) {
      matrices.push(svgTransformParser.parseTransformAttribute(transformString));
    }
    current = current.parentNode;
  }
  for (let i = matrices.length - 1; i >= 0; i--) {
    accumulatedMatrix = multiplyMatrices(accumulatedMatrix, matrices[i]);
  }
  return accumulatedMatrix;
}

/**
 * Normalizes an ID string by replacing _xDD_ sequences with their character equivalents
 * and underscores (not part of _xDD_) with spaces.
 * @param {string} id - The ID string to normalize.
 * @returns {string} The normalized ID string.
 */
export function normalizeId(id) {
  if (!id) return '';
  let normalized = id;
  normalized = normalized.replace(/_x([0-9A-Fa-f]{2})_/g, (match, hexCode) => {
    return String.fromCharCode(parseInt(hexCode, 16));
  });
  normalized = normalized.replace(/_/g, ' ');
  return normalized.trim();
}

/**
 * Parses an ID string for patterns like x-left, x-offsetX num, x-offsetY num, x-scale num.
 * @param {string} id - The ID string.
 * @returns {object} An object like { id: "cleanedId", showBubble: true/false, bubbleSide: "left", offsetX: 10, ... }.
 */
export function extractAttributesFromId(id) {
    if (!id) return { id: '' };
    const attributes = { id };
    let cleanedId = id;

    if (cleanedId.match(/x-bubble/i)) {
        attributes.showBubble = true; // Boolean true
        cleanedId = cleanedId.replace(/x-bubble/i, '').trim();
    } else {
        // Explicitly set to false if not present, to match Perl's defined behavior for JSON
        attributes.showBubble = false;
    }


    const patterns = {
        bubbleSide: /x-(left|right|top|bottom)/i,
        offsetX: /x-offsetX\s+(-?\d+\.?\d*)/i,
        offsetY: /x-offsetY\s+(-?\d+\.?\d*)/i,
        scale: /x-scale\s+(\d+\.?\d*)/i,
    };

    for (const key in patterns) {
        const match = cleanedId.match(patterns[key]);
        if (match) {
        if (key === 'bubbleSide') {
            attributes[key] = match[1].toLowerCase();
        } else {
            attributes[key] = parseFloat(match[1]);
        }
        cleanedId = cleanedId.replace(patterns[key], '').trim();
        }
    }
    attributes.id = cleanedId.replace(/\s+/g, ' ').trim();
    return attributes;
}


/**
 * Classifies an element and determines its mainClassKey for nesting.
 * @param {string} normalizedIdFromSVG - The normalized ID from the SVG element.
 * @param {string} site - Site ID.
 * @param {string} floor - Floor ID.
 * @param {string} initialType - Original tagName of the SVG element.
 * @param {Map<string, string>} meetingRoomsMap - Loaded meeting rooms map.
 * @param {string} groupName - Name of the parent group (e.g., "Mobilier").
 * @returns {object} { class: string (poi class), name: string, id: string (finalId), mainClassKey: string (for desks/furniture) }
 */
export function classifyElement(normalizedIdFromSVG, site, floor, initialType, meetingRoomsMap, groupName) {
  let poiClass = 'unknown'; 
  let name = normalizedIdFromSVG;
  let finalId = normalizedIdFromSVG; 
  let mainClassKey = null; 

  const lowerId = normalizedIdFromSVG.toLowerCase();

  const normalizedMeetingRoomKey = normalizeNameForKeyMeetingRooms(normalizedIdFromSVG);
  if (meetingRoomsMap && meetingRoomsMap.has(normalizedMeetingRoomKey)) {
    poiClass = 'meeting-room';
    name = normalizedIdFromSVG; 
    finalId = meetingRoomsMap.get(normalizedMeetingRoomKey);
  } else {
    if (lowerId.match(/^sdr\s+/i) && groupName === 'Mobilier') { 
        poiClass = 'office_system'; 
        mainClassKey = 'meeting'; 
        name = normalizedIdFromSVG;
    } else if (lowerId.includes('bureau') || lowerId.includes('office') || lowerId.match(/^sdr\s+/i)) {
        poiClass = 'office';
        name = normalizedIdFromSVG;
    } else if (lowerId.includes('meeting') || lowerId.includes('reunion') || lowerId.includes('salle de reunion')) {
        poiClass = 'meeting-room';
        name = normalizedIdFromSVG;
    } else if (lowerId.includes('wc') || lowerId.includes('toilette') || lowerId.includes('restroom')) {
        poiClass = 'restroom';
        name = normalizedIdFromSVG;
    } else if (lowerId.includes('ascenseur') || lowerId.includes('elevator')) {
        poiClass = 'elevator';
        name = normalizedIdFromSVG;
    } else if (lowerId.includes('escalier') || lowerId.includes('stairs')) {
        poiClass = 'stairs';
        name = normalizedIdFromSVG;
    } else if (lowerId.startsWith('desk') || lowerId.includes('poste de travail') || (lowerId.startsWith('postes') && groupName === 'Mobilier')) {
        poiClass = 'desk'; 
        mainClassKey = 'desks'; 
        name = normalizedIdFromSVG;
    } else if (lowerId.startsWith('meuble ') && groupName === 'Mobilier') {
        poiClass = 'furniture'; 
        mainClassKey = normalizeNameForKey(lowerId.substring('meuble '.length)); 
        name = normalizedIdFromSVG;
    } else if (initialType === 'text' && groupName === 'Mobilier') {
        poiClass = 'text_label'; 
        const fontMatch = lowerId.match(/^text\s+([^\s]+)/); // e.g. id="text FONT_STYLE ..."
        mainClassKey = fontMatch ? normalizeNameForKey(fontMatch[1]) : 'text_misc';
        name = normalizedIdFromSVG; 
    } else if (lowerId.includes('poi-') || initialType === 'use') {
        poiClass = lowerId.substring(lowerId.indexOf('poi-') + 4).split(/\s+/)[0] || 'poi-generic';
        if(poiClass.trim() === "") poiClass = 'poi-generic'; // handle cases like "poi- "
        name = normalizedIdFromSVG;
    } else if (lowerId.match(/^(?:point|pt|poi)$/i)) {
        poiClass = 'poi-generic';
        name = normalizedIdFromSVG;
    } else if (groupName === 'Mobilier') { // Default for other Mobilier items
        poiClass = 'furniture';
        mainClassKey = normalizeNameForKey(lowerId) || 'misc_furniture'; // Use normalized ID as key if specific pattern not matched
    }
  }

  if (finalId === normalizedIdFromSVG) {
     const prefix = mainClassKey || poiClass || initialType;
     finalId = `${prefix}-${site}-${floor}-${normalizedIdFromSVG.replace(/[\s:]+/g, '_')}`; // Ensure colons are also replaced
  }
  
  if (!name && initialSvgId) name = initialSvgId; // Fallback name to original SVG ID if normalized one is empty
  if (!name) name = "Unnamed Element";


  return { class: poiClass, name, id: finalId, mainClassKey };
}

/**
 * Calculates a reference point (centroid for polygon/polyline, center for rect)
 * @param {Element} node - The DOM node (after transformation).
 * @param {string} currentTagName - The current tag name of the node.
 * @returns {Point | null} The calculated point {x,y} or null.
 */
function calculateReferencePoint(node, currentTagName) {
    if (currentTagName === 'rect') {
        const x = parseFloat(node.getAttribute('x') || '0');
        const y = parseFloat(node.getAttribute('y') || '0');
        const width = parseFloat(node.getAttribute('width') || '0');
        const height = parseFloat(node.getAttribute('height') || '0');
        return { x: x + width / 2, y: y + height / 2 };
    } else if (currentTagName === 'polygon' || currentTagName === 'polyline') {
        const pointsString = node.getAttribute('points');
        if (!pointsString) return null;
        const points = pointsString.split(' ').map(pStr => {
            const coords = pStr.split(',');
            return { x: parseFloat(coords[0]), y: parseFloat(coords[1]) };
        });
        if (points.length === 0) return null;
        
        // Calculate centroid
        let sumX = 0, sumY = 0;
        points.forEach(p => { sumX += p.x; sumY += p.y; });
        return { x: sumX / points.length, y: sumY / points.length };
    } else if (currentTagName === 'text') {
        return { x: parseFloat(node.getAttribute('x') || '0'), y: parseFloat(node.getAttribute('y') || '0') };
    }
    // Add circle, ellipse, line centers if needed
    return null;
}


/**
 * Processes complex IDs for desks or furniture from the "Mobilier" group.
 * @param {string} elementId - The final ID of the element.
 * @param {string} originalSvgIdNoXAttr - The original ID from the SVG element (after x-attr removal but before normalizeId).
 * @param {string} currentClass - The POI class determined by classifyElement.
 * @param {string} mainClassKeyIn - The mainClassKey determined by classifyElement.
 * @param {Element} node - The DOM node, for extracting geometry if needed.
 * @param {string} currentTagName - current tag name of the node.
 * @returns {object} Structured details including point, direction, objects etc.
 */
export function processDeskOrFurnitureDetails(elementId, originalSvgIdNoXAttr, currentClass, mainClassKeyIn, node, currentTagName) {
  const details = {};
  const lowerOriginalId = originalSvgIdNoXAttr.toLowerCase();

  // Default point and direction (placeholders, but ensures fields exist)
  let refPoint = calculateReferencePoint(node, currentTagName);
  details.point = refPoint ? [parseFloat(refPoint.x.toFixed(2)), parseFloat(refPoint.y.toFixed(2))] : [0,0];
  details.direction = 0; // Placeholder, real calculation is complex

  if (mainClassKeyIn === 'meeting' && lowerOriginalId.match(/^sdr\s+/i)) { 
    details.mainClassKey = 'meeting'; 
    const parts = originalSvgIdNoXAttr.split(':'); 
    if (parts.length > 1 && parts[1]) details.indicator = parts[1];
    if (parts.length > 2 && parts[2]) {
        const dims = parts[2].toLowerCase().split('x');
        if (dims.length === 2) {
            const widthVal = parseFloat(dims[0].replace('w',''));
            const depthVal = parseFloat(dims[1].replace('d',''));
            if(!isNaN(widthVal)) details.width = widthVal;
            if(!isNaN(depthVal)) details.depth = depthVal;
        }
    }
    details.objects = []; 
  } else if (mainClassKeyIn === 'desks') {
    details.mainClassKey = 'desks';
    // point and direction are already set with placeholders/calculations
    // Extract width/depth if they are part of the desk's geometry (e.g. rect)
    if (currentTagName === 'rect') {
        details.width = parseFloat(node.getAttribute('width'));
        details.depth = parseFloat(node.getAttribute('height')); // Assuming height is depth for a desk
    }
  } else { 
    details.mainClassKey = mainClassKeyIn || 'misc_furniture';
  }
  
  if (currentTagName === 'text') {
      const textContent = node.textContent ? node.textContent.trim() : "";
      if (textContent) details.text = textContent;
      // details.point is already calculated by calculateReferencePoint
      // Font attributes if needed:
      // if (node.getAttribute('font-family')) details.fontFamily = node.getAttribute('font-family');
      // if (node.getAttribute('font-size')) details.fontSize = node.getAttribute('font-size');
  }

  return details;
}


/**
 * Processes a single SVG node: applies transformations, simplifications, and extracts data.
 * @param {Element} node - The SVG DOM node.
 * @param {string} site - Site ID.
 * @param {string} floor - Floor ID.
 * @param {string} groupName - Name of the parent group (e.g., "Salles", "Mobilier").
 * @param {Matrix} globalTransformMatrix - The global transformation matrix for the current SVG.
 * @param {object} config - Configuration object with maps, data, and utility instances.
 * @returns {object | null} Processed element data or null if invalid.
 */
export function processNode(node, site, floor, groupName, globalTransformMatrix, config) {
  const {
    idFixes, meetingRoomsMap, 
    svgTransformParser, nodeTransformer, geometrySimplifier
  } = config;

  let initialSvgId = node.getAttribute('id') || node.getAttribute('inkscape:label');
  if (!initialSvgId && node.getAttribute('xlink:href')) {
    initialSvgId = node.getAttribute('xlink:href').replace(/^#/, '');
  }
  const nodeTagName = node.tagName.toLowerCase();
  if (!initialSvgId && nodeTagName === 'text') { 
    let textContent = node.textContent ? node.textContent.substring(0,10).trim().replace(/\s+/g,'_') : 'unnamed';
    initialSvgId = `text_${textContent}_${Math.random().toString(36).substr(2, 5)}`; // Ensure some uniqueness
  }

  if (!initialSvgId) return null;

  const siteFloorKey = `${site}-${floor}`;
  const floorFixes = idFixes[siteFloorKey] || idFixes[`${site}-default`] || {};
  const idAfterFixes = floorFixes[initialSvgId] || initialSvgId;

  const parsedIdAttrs = extractAttributesFromId(idAfterFixes);
  const idForClassification = parsedIdAttrs.id; // This ID (SVG ID after fixes and x-attr removal) is used for classification.
  
  if (!idForClassification) return null;
  const normalizedIdForClassification = normalizeId(idForClassification); // Normalize it for some lookups/consistency.

  const classification = classifyElement(normalizedIdForClassification, site, floor, nodeTagName, meetingRoomsMap, groupName);
  const finalElementId = classification.id;
  const poiClass = classification.class; 
  let elementName = classification.name; 
  const mainClassKey = classification.mainClassKey; 

  const elementMatrix = getFlattenedTransform(node, svgTransformParser);
  const finalMatrix = multiplyMatrices(globalTransformMatrix, elementMatrix);
  nodeTransformer.applyTransformToNode(node, finalMatrix);

  const currentTagName = node.currentTagName || nodeTagName;
  const isItinerary = (groupName === 'Lignes_de_couloir');
  const isFurnitureGroup = (groupName === 'Mobilier');

  if (currentTagName === 'polygon' || currentTagName === 'polyline') {
    geometrySimplifier.simplifyPoints(node, isItinerary || isFurnitureGroup);
  } else if (currentTagName === 'path') {
    geometrySimplifier.simplifyPath(node);
  } else { 
    node.isValid = true;
  }

  if (!node.isValid) return null;

  const outputElement = { id: finalElementId };
  if (elementName) { 
    outputElement.name = elementName;
  }
  
  // POI class (e.g. "office", "meeting-room") for elements not desks/furniture or specific other types
  if (groupName !== 'Mobilier' && groupName !== 'Lignes_de_couloir' && groupName !== 'Decor' && groupName !== 'Contour') {
    if (poiClass && poiClass !== 'unknown') { // Only add class if it's known and relevant
        outputElement.class = poiClass;
    }
  }

  for (const attrKey in parsedIdAttrs) {
    if (attrKey !== 'id' && parsedIdAttrs[attrKey] !== undefined && 
        (typeof parsedIdAttrs[attrKey] === 'boolean' || //booleans always included
         (typeof parsedIdAttrs[attrKey] === 'string' && parsedIdAttrs[attrKey] !== "") ||
         (typeof parsedIdAttrs[attrKey] === 'number' && !isNaN(parsedIdAttrs[attrKey])) 
        )
       ) {
      outputElement[attrKey] = parsedIdAttrs[attrKey];
    }
  }
  
  outputElement.type = currentTagName; // Set geometric type for output
  switch (currentTagName) {
    case 'polygon': case 'polyline':
      if(node.getAttribute('points')) outputElement.points = node.getAttribute('points'); break;
    case 'path':
      if(node.getAttribute('d')) outputElement.d = node.getAttribute('d'); break;
    case 'rect': 
      outputElement.x = parseFloat(node.getAttribute('x'));
      outputElement.y = parseFloat(node.getAttribute('y'));
      outputElement.width = parseFloat(node.getAttribute('width'));
      outputElement.height = parseFloat(node.getAttribute('height'));
      break;
    case 'line':
      outputElement.x1 = parseFloat(node.getAttribute('x1'));
      outputElement.y1 = parseFloat(node.getAttribute('y1'));
      outputElement.x2 = parseFloat(node.getAttribute('x2'));
      outputElement.y2 = parseFloat(node.getAttribute('y2'));
      break;
    // No 'text' case here for geometry, text handled in processDeskOrFurnitureDetails if it's furniture.
    // If text can be a standalone POI, it would need geometry handling here too.
  }
  // Remove geometric fields if they are empty (e.g. points="", d="")
  if (outputElement.points === "") delete outputElement.points;
  if (outputElement.d === "") delete outputElement.d;


  if (mainClassKey) {
    outputElement.mainClassKey = mainClassKey; // For routing in converter.js
  }
  
  if (isFurnitureGroup) {
    // Pass idForClassification (SVG ID after fixes, before normalization for classification)
    // to processDeskOrFurnitureDetails, as it might be used for specific parsing rules.
    const furnitureDetails = processDeskOrFurnitureDetails(finalElementId, idForClassification, poiClass, mainClassKey, node, currentTagName);
    for (const key in furnitureDetails) {
        if (key !== 'id' && key !== 'name' && key !== 'type' && furnitureDetails[key] !== undefined) {
            // Ensure not to add empty strings from details, unless specifically allowed
            if ((typeof furnitureDetails[key] === 'string' && furnitureDetails[key] !== "") || typeof furnitureDetails[key] !== 'string') {
                 outputElement[key] = furnitureDetails[key];
            }
        }
    }
    if (furnitureDetails.mainClassKey) outputElement.mainClassKey = furnitureDetails.mainClassKey;
  }
  
  if (isItinerary && outputElement.class) {
      delete outputElement.class;
  }

  // Final check: ensure essential geometric type info is present
  if (!outputElement.points && !outputElement.d && !outputElement.width && !outputElement.x1 && currentTagName !== 'text') {
      // If no geometry and not text, it might be invalid unless it's a group-only POI
      // This depends on how BRU-7.json handles POIs that are just points without explicit geometry elements
      // For now, assume such POIs might be valid if they have a name/id.
  }


  return outputElement;
}
