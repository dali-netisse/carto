// src/objectHandlers.js
import { transformNodeAttributes, multiplyMatrices, parseTransformAttribute } from './geometry.js';
import { normalizeNameForSallesMap } from './sallesNameToIdReader.js'; 

const inkscapeNS = 'http://www.inkscape.org/namespaces/inkscape';

function findGroupElement(svgDoc, groupIds) {
    let groupElement = null;
    for (const id of groupIds) {
        const elById = svgDoc.getElementById(id);
        if (elById) { groupElement = elById; break; }
        const relevantTagsForGroups = ['g']; 
        for (const tagName of relevantTagsForGroups) {
            const elements = svgDoc.getElementsByTagName(tagName);
            for (let i = 0; i < elements.length; i++) {
                if (elements[i].getAttributeNS(inkscapeNS, 'label') === id) {
                    groupElement = elements[i]; break;
                }
            }
            if (groupElement) break;
        }
        if (groupElement) break;
    }
    return groupElement;
}

export function processGenericGroup(svgDoc, groupIds, globalTransform, allowedNodeTypes, processingMode = null) {
    const outputObjects = [];
    if (!svgDoc || !groupIds || !globalTransform || !allowedNodeTypes) {
        console.warn("processGenericGroup: Missing required arguments.");
        return outputObjects;
    }
    const groupElement = findGroupElement(svgDoc, groupIds);
    if (!groupElement) return outputObjects;

    const childNodes = groupElement.childNodes;
    for (let i = 0; i < childNodes.length; i++) {
        const node = childNodes[i];
        if (node.nodeType === 1 && allowedNodeTypes.includes(node.nodeName.toLowerCase())) {
            const transformedAttrs = transformNodeAttributes(node, globalTransform, processingMode);
            if (transformedAttrs) {
                if (processingMode === 'itinerary' && transformedAttrs.class) {
                    delete transformedAttrs.class;
                }
                if (processingMode === 'itinerary' && transformedAttrs.type === 'polygon') {
                    transformedAttrs.type = 'polyline';
                }
                outputObjects.push(transformedAttrs);
            }
        }
    }
    return outputObjects;
}

function decodeHexEncodedChars(str) {
    if (!str) return '';
    return str.replace(/_x([0-9a-f]{2})_/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function processPOIs(svgDoc, globalTransform, siteFloorKey, idFixesSpecific = {}, sallesMap = {}) {
    const poisOutput = {}; 
    const groupIds = ['Salles', 'Pièces', 'pièces']; 
    const allowedPoiElementTypes = ['rect', 'path', 'polygon', 'polyline', 'g', 'use'];
    const groupElement = findGroupElement(svgDoc, groupIds);
    if (!groupElement) return poisOutput;

    const childNodes = groupElement.childNodes;
    for (let i = 0; i < childNodes.length; i++) {
        const node = childNodes[i];
        if (node.nodeType !== 1) continue;

        let elementsToProcessDetails = [];
        if (node.nodeName.toLowerCase() === 'g') {
            const gTransformStr = node.getAttribute('transform');
            const gMatrix = multiplyMatrices(globalTransform, parseTransformAttribute(gTransformStr));
            const subChildNodes = node.childNodes;
            let gHasGeometricChild = false;
            for (let j = 0; j < subChildNodes.length; j++) {
                const subNode = subChildNodes[j];
                if (subNode.nodeType === 1 && allowedPoiElementTypes.includes(subNode.nodeName.toLowerCase()) && subNode.nodeName.toLowerCase() !== 'g') {
                    elementsToProcessDetails.push({ element: subNode, parentMatrix: gMatrix, groupContextNode: node });
                    gHasGeometricChild = true;
                }
            }
             // If a <g> has an ID/label but no direct geometric children were processed, 
             // this implies the <g> itself is the POI, and its first valid geometry is its representation.
            if (!gHasGeometricChild && (node.getAttribute('id') || node.getAttributeNS(inkscapeNS, 'label'))) {
                for (let j = 0; j < subChildNodes.length; j++) {
                    const subNode = subChildNodes[j];
                     if (subNode.nodeType === 1 && allowedPoiElementTypes.includes(subNode.nodeName.toLowerCase()) && subNode.nodeName.toLowerCase() !== 'g') {
                        elementsToProcessDetails.push({ element: subNode, parentMatrix: gMatrix, groupContextNode: node });
                        break; 
                    }
                }
            }
        } else if (node.nodeName.toLowerCase() === 'use') {
            const xlinkHref = node.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || node.getAttribute('href');
            if (xlinkHref && xlinkHref.startsWith('#')) {
                const refId = xlinkHref.substring(1);
                const refElement = svgDoc.getElementById(refId);
                if (refElement) {
                    const useTransformStr = node.getAttribute('transform');
                    const useMatrix = multiplyMatrices(globalTransform, parseTransformAttribute(useTransformStr));
                    if (refElement.nodeName.toLowerCase() === 'g') {
                        const gTransformStr = refElement.getAttribute('transform');
                        const gMatrix = multiplyMatrices(useMatrix, parseTransformAttribute(gTransformStr));
                        const subChildNodes = refElement.childNodes;
                        for (let j = 0; j < subChildNodes.length; j++) {
                            const subNode = subChildNodes[j];
                            if (subNode.nodeType === 1 && allowedPoiElementTypes.includes(subNode.nodeName.toLowerCase()) && subNode.nodeName.toLowerCase() !== 'g') {
                                elementsToProcessDetails.push({ element: subNode, parentMatrix: gMatrix, groupContextNode: node });
                            }
                        }
                    } else if (allowedPoiElementTypes.includes(refElement.nodeName.toLowerCase())) {
                        elementsToProcessDetails.push({ element: refElement, parentMatrix: useMatrix, groupContextNode: node });
                    }
                }
            }
        } else if (allowedPoiElementTypes.includes(node.nodeName.toLowerCase())) {
            elementsToProcessDetails.push({ element: node, parentMatrix: globalTransform, groupContextNode: null });
        }

        for (const item of elementsToProcessDetails) {
            const element = item.element;
            const parentMatrix = item.parentMatrix;
            const groupContextNode = item.groupContextNode || (element.parentNode !== groupElement ? element.parentNode : null);

            const transformedAttrs = transformNodeAttributes(element, parentMatrix);
            if (!transformedAttrs) continue;

            let currentId = element.getAttribute('id');
            const dataName = element.getAttribute('data-name');
            let inkscapeLabel = element.getAttributeNS(inkscapeNS, 'label');

            if (dataName) {
                const normalizedDataName = dataName.replace(/[\s,]+/g, '_');
                if (normalizedDataName === currentId || !currentId) {
                    currentId = dataName; 
                }
            }
            
            if (inkscapeLabel) {
                if (inkscapeLabel.toLowerCase().startsWith('override ')) {
                    currentId = inkscapeLabel.substring(9).trim();
                } else if ((currentId && /^path\d+/.test(currentId)) || !currentId) {
                    currentId = inkscapeLabel.trim();
                }
            }
            
            if (!currentId && groupContextNode) {
                currentId = groupContextNode.getAttribute('id');
                if (!currentId) {
                     inkscapeLabel = groupContextNode.getAttributeNS(inkscapeNS, 'label');
                     if (inkscapeLabel) currentId = inkscapeLabel.trim();
                }
            }

            if (!currentId) continue;
            currentId = currentId.replace(/_+$/, '');
            if (idFixesSpecific && idFixesSpecific[currentId]) {
                currentId = idFixesSpecific[currentId];
            }
            currentId = decodeHexEncodedChars(currentId);
            let idForClassification = currentId.replace(/_/g, ' ');

            const attributePatterns = {
                bubbleSide: /\s+x-(left|right|top|bottom|tl|tr|bl|br)$/i,
                offsetX: /\s+x-offsetX\s+(-?\d+\.?\d*)$/i,
                offsetY: /\s+x-offsetY\s+(-?\d+\.?\d*)$/i,
                scale: /\s+x-scale\s+(\d+\.?\d*)$/i,
            };
            for (const attrKey in attributePatterns) {
                const match = idForClassification.match(attributePatterns[attrKey]);
                if (match) {
                    const val = match[1];
                    transformedAttrs[attrKey] = (attrKey === 'bubbleSide') ? val : parseFloat(val);
                    idForClassification = idForClassification.replace(match[0], '').trim();
                }
            }
            
            let className = 'other';
            let nameAttribute = idForClassification; // Default name
            let finalId = idForClassification.replace(/\s+/g, '_'); // Default finalId

            // POI Classification Logic (Porting if/elsif block)
            const lowerIdForClass = idForClassification.toLowerCase();

            if (/^bureaux? (.*)$/i.test(idForClassification)) {
                className = 'office';
                let officeDetails = idForClassification.match(/^Bureaux? (.*)$/i)[1];
                nameAttribute = officeDetails;
                officeDetails = officeDetails.replace(/ 1 ?$/, ''); 
                officeDetails = officeDetails.replace(/ +- +/g, ',');
                officeDetails = officeDetails.replace(/ +et +/g, ',');
                officeDetails = officeDetails.replace(/\s+/g, ''); 
                finalId = officeDetails;
            } else if (/^salle de r(?:é|e)union ([-.\w'’\/ ]+)$/i.test(idForClassification)) {
                className = 'meeting-room';
                nameAttribute = idForClassification.match(/^salle de r(?:é|e)union ([-.\w'’\/ ]+)$/i)[1];
                const cleanName = normalizeNameForSallesMap(nameAttribute);
                if (sallesMap && sallesMap[cleanName]) {
                    finalId = sallesMap[cleanName];
                } else {
                    console.warn(`POI Classification: No mapping for meeting room name "${nameAttribute}" (cleaned: "${cleanName}") in sallesMap for ${siteFloorKey}. Using original name as part of ID.`);
                    finalId = `meeting-room_${nameAttribute.replace(/[\s\/]+/g, '_')}`;
                }
            } else if (/^sanitaires? (femmes|hommes|mixte|pmr|h\/f|h f)/i.test(idForClassification)) {
                className = 'toilets';
                nameAttribute = idForClassification;
                const typeMatch = idForClassification.match(/^sanitaires? (.*)$/i)[1].toLowerCase();
                if (typeMatch.includes('femmes') || typeMatch.includes('h f') || typeMatch.includes('h/f')) finalId = 'Femmes';
                else if (typeMatch.includes('hommes')) finalId = 'Hommes';
                else if (typeMatch.includes('mixte')) finalId = 'Mixte';
                else if (typeMatch.includes('pmr')) finalId = 'PMR';
                else finalId = typeMatch.replace(/\s/g, '_');
            } else if (lowerIdForClass.startsWith('ascenseur')) {
                className = 'elevator'; finalId = 'Ascenseur'; nameAttribute = idForClassification;
            } else if (lowerIdForClass.startsWith('escalier')) {
                className = 'stairs'; finalId = 'Escalier'; nameAttribute = idForClassification;
            } else if (lowerIdForClass.startsWith('cafétéria') || lowerIdForClass.startsWith('cafet')) {
                className = 'cafeteria'; finalId = 'Cafétéria'; nameAttribute = idForClassification;
            } else if (lowerIdForClass.startsWith('local ménage') || lowerIdForClass.startsWith('local menage')) {
                className = 'utility'; finalId = 'Local_Menage'; nameAttribute = idForClassification;
            } else if (lowerIdForClass.startsWith('local repro') || lowerIdForClass.startsWith('local reprographie')) {
                className = 'utility'; finalId = 'Local_Repro'; nameAttribute = idForClassification;
            } else if (lowerIdForClass.startsWith('local technique') || lowerIdForClass.startsWith('lt') || lowerIdForClass.startsWith('local elec')) {
                className = 'utility'; finalId = 'Local_Technique'; nameAttribute = idForClassification;
            } else if (lowerIdForClass.startsWith('archive')) {
                className = 'archive'; finalId = 'Archive'; nameAttribute = idForClassification;
                 if (/archives (\d+)/i.test(idForClassification)) { // Archives 1, Archives 2
                    finalId = `Archive_${idForClassification.match(/archives (\d+)/i)[1]}`;
                }
            } else if (lowerIdForClass.startsWith('couloir')) {
                className = 'corridor'; finalId = 'Couloir'; nameAttribute = idForClassification;
            } else if (lowerIdForClass.startsWith('palier')) {
                className = 'landing'; finalId = 'Palier'; nameAttribute = idForClassification;
            } else if (idForClassification === "SALLE REUNION DR") { // Specific example from Perl
                className = "meeting-room"; finalId = "Salle_de_réunion_Direction_Régionale"; nameAttribute = "Direction Régionale";
            } else if (idForClassification === "RESP TERRITOIRES ADJOINT") {
                 className = "office"; finalId = "Bureau_Responsable_Territoires_Adjoint"; nameAttribute = "Responsable Territoires Adjoint";
            } else if (idForClassification === "RESP TERRITOIRES") {
                 className = "office"; finalId = "Bureau_Responsable_Territoires"; nameAttribute = "Responsable Territoires";
            }
            // ... Add more classifications based on the Perl script's logic ...

            transformedAttrs.id = finalId.replace(/\s+/g, '_'); // Ensure finalId uses underscores
            transformedAttrs.class = className;
            transformedAttrs.name = nameAttribute.trim();
            
            delete transformedAttrs.inkscapeLabel; 
            // transformedAttrs.originalRawId = currentId; // For debugging if needed

            if (!poisOutput[className]) {
                poisOutput[className] = {};
            }
            if (poisOutput[className][transformedAttrs.id]) {
                // console.warn(`Duplicate POI ID: class='${className}', id='${transformedAttrs.id}'. Overwriting.`);
            }
            poisOutput[className][transformedAttrs.id] = transformedAttrs;
        }
    }
    return poisOutput;
}
