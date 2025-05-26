// src/geometry.js

/**
 * Transforms a point (x, y) using a 2D transformation matrix.
 * @param {number} x - The x-coordinate of the point.
 * @param {number} y - The y-coordinate of the point.
 * @param {number[]} matrix - A 6-element array representing the matrix [a, b, c, d, e, f].
 * @returns {number[]} A 2-element array [transformedX, transformedY].
 */
export function transformPoint(x, y, matrix) {
    if (!matrix || matrix.length !== 6) {
        console.warn('Invalid matrix for transformPoint, using identity.');
        return [x, y];
    }
    const [a, b, c, d, e, f] = matrix;
    return [
        x * a + y * c + e,
        x * b + y * d + f,
    ];
}

/**
 * Multiplies two 2D transformation matrices.
 * m1 * m2
 * @param {number[]} m1 - First matrix [a1, b1, c1, d1, e1, f1].
 * @param {number[]} m2 - Second matrix [a2, b2, c2, d2, e2, f2].
 * @returns {number[]} The resulting matrix.
 */
export function multiplyMatrices(m1, m2) {
    if (!m1 || m1.length !== 6) return m2 || [1, 0, 0, 1, 0, 0];
    if (!m2 || m2.length !== 6) return m1;

    return [
        m1[0] * m2[0] + m1[2] * m2[1], // a = a1*a2 + c1*b2
        m1[1] * m2[0] + m1[3] * m2[1], // b = b1*a2 + d1*b2
        m1[0] * m2[2] + m1[2] * m2[3], // c = a1*c2 + c1*d2
        m1[1] * m2[2] + m1[3] * m2[3], // d = b1*c2 + d1*d2
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4], // e = a1*e2 + c1*f2 + e1
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5], // f = b1*e2 + d1*f2 + f1
    ];
}

const PI = Math.PI;

/**
 * Parses an SVG transform attribute string and returns an affine transformation matrix.
 * @param {string} transformString - The SVG transform attribute value.
 * @returns {number[]} A 6-element array representing the matrix [a, b, c, d, e, f], or identity if empty/invalid.
 */
export function parseTransformAttribute(transformString) {
    let overallMatrix = [1, 0, 0, 1, 0, 0]; // Identity matrix

    if (!transformString) {
        return overallMatrix;
    }

    // Regex to match transform functions (matrix, translate, scale, rotate)
    const transformRegex = /(\w+)\s*\(([^)]+)\)/g;
    let match;
    const transformOps = [];

    while ((match = transformRegex.exec(transformString)) !== null) {
        transformOps.push({ type: match[1].toLowerCase(), params: match[2].trim().split(/[\s,]+/).map(s => parseFloat(s.trim())) });
    }

    for (let i = transformOps.length - 1; i >= 0; i--) {
        const op = transformOps[i];
        let matrix = [1, 0, 0, 1, 0, 0]; 

        switch (op.type) {
            case 'matrix':
                if (op.params.length === 6) {
                    matrix = op.params;
                }
                break;
            case 'translate':
                matrix[4] = op.params[0] || 0;
                if (op.params.length > 1) {
                    matrix[5] = op.params[1] || 0;
                }
                break;
            case 'scale':
                matrix[0] = op.params[0] || 1;
                matrix[3] = (op.params.length > 1 ? op.params[1] : op.params[0]) || 1;
                break;
            case 'rotate':
                const angle = (op.params[0] || 0) * PI / 180;
                const cosA = Math.cos(angle);
                const sinA = Math.sin(angle);
                if (op.params.length === 1) { 
                    matrix = [cosA, sinA, -sinA, cosA, 0, 0];
                } else if (op.params.length === 3) { 
                    const cx = op.params[1];
                    const cy = op.params[2];
                    let t_plus = [1, 0, 0, 1, cx, cy];
                    let r_matrix = [cosA, sinA, -sinA, cosA, 0, 0];
                    let t_minus = [1, 0, 0, 1, -cx, -cy];
                    matrix = multiplyMatrices(t_plus, multiplyMatrices(r_matrix, t_minus));
                }
                break;
        }
        overallMatrix = multiplyMatrices(matrix, overallMatrix); 
    }
    return overallMatrix;
}


/**
 * Calculates the effective transform for a node and applies it to its geometry attributes.
 * @param {Element} node - The xmldom SVG element node.
 * @param {number[]} parentMatrix - The accumulated transformation matrix from parent elements.
 * @param {string} processingMode - Optional mode (e.g., "itinerary", "furniture").
 * @returns {object|null} A new object representing the transformed geometry, or null if not processable.
 */
export function transformNodeAttributes(node, parentMatrix, processingMode = null) {
    const localTransformString = node.getAttribute('transform');
    const localMatrix = parseTransformAttribute(localTransformString);
    const effectiveMatrix = multiplyMatrices(parentMatrix, localMatrix);

    const nodeType = node.nodeName.toLowerCase();
    const originalId = node.getAttribute('id'); 
    const isItinerary = processingMode === 'itinerary';

    if (nodeType === 'rect') {
        let x = parseFloat(node.getAttribute('x') || 0);
        let y = parseFloat(node.getAttribute('y') || 0);
        let width = parseFloat(node.getAttribute('width') || 0);
        let height = parseFloat(node.getAttribute('height') || 0);
        const isComplexTransform = Math.abs(effectiveMatrix[1]) > 1e-9 || Math.abs(effectiveMatrix[2]) > 1e-9;

        if (isComplexTransform) {
            const p1 = transformPoint(x, y, effectiveMatrix);
            const p2 = transformPoint(x + width, y, effectiveMatrix);
            const p3 = transformPoint(x + width, y + height, effectiveMatrix);
            const p4 = transformPoint(x, y + height, effectiveMatrix);
            let polygonPoints = [p1,p2,p3,p4];
            
            // For polygons originating from rects in itinerary mode, they become polylines
            if (isItinerary) {
                 let cleanedPolyPoints = cleanPoints(polygonPoints, true, isItinerary);
                 if (cleanedPolyPoints.length < 2) return null;
                 return { type: 'polyline', points: cleanedPolyPoints.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' '), originalId };
            }

            // Standard polygon conversion
            let initialCleanedPoints = cleanPoints(polygonPoints, false, false);
            if (initialCleanedPoints.length < 3) return null;
            
            const area = polygonArea(initialCleanedPoints);
            const perimeter = polygonPerimeter(initialCleanedPoints, true);
            if (perimeter === 0 || (area / perimeter < 0.2)) {
                 console.log(`Skipping rect-to-polygon '${originalId}' (mode: ${processingMode}) due to area/perimeter filter.`);
                 return null;
            }
            let finalCleanedPoints = cleanPoints(initialCleanedPoints, true, false);
             if (finalCleanedPoints.length < 3) return null;

            return { type: 'polygon', points: finalCleanedPoints.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' '), originalId };
        } else {
            const [newX, newY] = transformPoint(x, y, effectiveMatrix);
            const [newXPlusWidth, newYPlusHeight] = transformPoint(x + width, y + height, effectiveMatrix);
            return { type: 'rect', x: newX, y: newY, width: newXPlusWidth - newX, height: newYPlusHeight - newY, originalId };
        }
    } else if (nodeType === 'line') {
        let x1 = parseFloat(node.getAttribute('x1') || 0);
        let y1 = parseFloat(node.getAttribute('y1') || 0);
        let x2 = parseFloat(node.getAttribute('x2') || 0);
        let y2 = parseFloat(node.getAttribute('y2') || 0);
        const [newX1, newY1] = transformPoint(x1, y1, effectiveMatrix);
        const [newX2, newY2] = transformPoint(x2, y2, effectiveMatrix);
        return { type: 'line', x1: newX1, y1: newY1, x2: newX2, y2: newY2, originalId };
    } else if (nodeType === 'polygon' || nodeType === 'polyline') {
        const pointsStr = node.getAttribute('points') || '';
        const pointPairs = pointsStr.trim().split(/\s+/);
        let parsedPoints = pointPairs.map(pair => {
            const coords = pair.split(',').map(s => parseFloat(s.trim()));
            return [coords[0], coords[1]];
        }).filter(p => p.length === 2 && !isNaN(p[0]) && !isNaN(p[1]));

        let transformedPoints = parsedPoints.map(p => transformPoint(p[0], p[1], effectiveMatrix));
        
        if (nodeType === 'polygon') {
            let initialCleanedPoints = cleanPoints(transformedPoints, false, isItinerary); 
            const minPointsRequired = isItinerary ? 2 : 3;
            if (initialCleanedPoints.length < minPointsRequired) {
                 console.log(`Skipping polygon '${originalId}' (mode: ${processingMode}) due to insufficient points (${initialCleanedPoints.length}, needed ${minPointsRequired}) after initial clean.`);
                return null;
            }
            if (!isItinerary) { 
                const currentArea = polygonArea(initialCleanedPoints); 
                const currentPerimeter = polygonPerimeter(initialCleanedPoints, true);
                if (currentPerimeter === 0 || (currentArea / currentPerimeter < 0.2)) {
                    console.log(`Skipping polygon '${originalId}' (mode: ${processingMode}) due to area/perimeter ratio filter.`);
                    return null;
                }
            }
            transformedPoints = cleanPoints(initialCleanedPoints, true, isItinerary); 
        } else { // For polylines
            transformedPoints = cleanPoints(transformedPoints, false, isItinerary); 
        }

        const finalType = (nodeType === 'polygon' && isItinerary) ? 'polyline' : nodeType;
        const finalMinPointsRequired = finalType === 'polygon' ? 3 : 2;

        if (transformedPoints.length < finalMinPointsRequired) {
             console.log(`Skipping ${nodeType} as ${finalType} '${originalId}' (mode: ${processingMode}) due to insufficient points (${transformedPoints.length}, needed ${finalMinPointsRequired}) after all cleaning.`);
            return null;
        }
        return { type: finalType, points: transformedPoints.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' '), originalId };
    } else if (nodeType === 'path') {
        const dAttribute = node.getAttribute('inkscape:original-d') || node.getAttribute('d');
        if (!dAttribute) return null;
        const singlePointMatch = dAttribute.match(/^[mM]\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s*[, ]?\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)$/);
        if (singlePointMatch) return null;

        const rawSegments = parsePathD(dAttribute);
        if (!rawSegments || rawSegments.length === 0) return null;
        
        const absoluteSegments = convertPathCommandsToAbsolute(rawSegments);
        
        let transformedPathSegments = [];
        let polygonPoints = [];
        let isPolygonCandidate = true; 
        let currentX = 0, currentY = 0;

        for (const seg of absoluteSegments) {
            let transformedValues = [];
            let cmd = seg.command; 
            const lastValues = seg.values;

            if (lastValues.length > 0) {
                 if (cmd === 'H') currentX = lastValues[lastValues.length - 1];
                 else if (cmd === 'V') currentY = lastValues[lastValues.length - 1];
                 else if (cmd !== 'Z') { 
                    currentX = lastValues[lastValues.length - 2];
                    currentY = lastValues[lastValues.length - 1];
                 }
            }

            switch (cmd) {
                case 'M': case 'L':
                    transformedValues = transformPoint(seg.values[0], seg.values[1], effectiveMatrix);
                    if (isPolygonCandidate) polygonPoints.push([...transformedValues]);
                    break;
                case 'H': 
                    transformedValues = transformPoint(seg.values[0], currentY, effectiveMatrix); 
                    if (isPolygonCandidate) polygonPoints.push([...transformedValues]);
                    cmd = 'L'; 
                    break;
                case 'V': 
                    transformedValues = transformPoint(currentX, seg.values[0], effectiveMatrix); 
                    if (isPolygonCandidate) polygonPoints.push([...transformedValues]);
                    cmd = 'L'; 
                    break;
                case 'C': 
                    transformedValues = [
                        ...transformPoint(seg.values[0], seg.values[1], effectiveMatrix),
                        ...transformPoint(seg.values[2], seg.values[3], effectiveMatrix),
                        ...transformPoint(seg.values[4], seg.values[5], effectiveMatrix),
                    ];
                    isPolygonCandidate = false; polygonPoints = [];
                    break;
                case 'S': case 'Q': 
                    transformedValues = [
                        ...transformPoint(seg.values[0], seg.values[1], effectiveMatrix),
                        ...transformPoint(seg.values[2], seg.values[3], effectiveMatrix),
                    ];
                     if (cmd === 'S' && seg.values.length === 6) { 
                         transformedValues.push(...transformPoint(seg.values[4], seg.values[5], effectiveMatrix));
                     }
                    isPolygonCandidate = false; polygonPoints = [];
                    break;
                 case 'T': 
                    transformedValues = [
                        ...transformPoint(seg.values[0], seg.values[1], effectiveMatrix), 
                        ...transformPoint(seg.values[2], seg.values[3], effectiveMatrix)
                    ];
                    isPolygonCandidate = false; polygonPoints = [];
                    break;
                case 'A':
                    const [endX, endY_A] = transformPoint(seg.values[5], seg.values[6], effectiveMatrix);
                    transformedValues = [...seg.values.slice(0, 5), endX, endY_A];
                    if (effectiveMatrix[0] === effectiveMatrix[3] && effectiveMatrix[1] === 0 && effectiveMatrix[2] === 0) {
                        transformedValues[0] *= effectiveMatrix[0]; 
                        transformedValues[1] *= effectiveMatrix[3]; 
                    }
                    isPolygonCandidate = false; polygonPoints = [];
                    break;
                case 'Z':
                    if (isPolygonCandidate && isItinerary && polygonPoints.length > 0) {
                        // For itineraries, Z means close the polyline by adding first point to end if not already there
                        // cleanPoints with isItinerary=true and isPolygon=true will not remove last point if same as first.
                        // So, if the path was M x,y L ..., Z, polygonPoints will have [M_transformed, L_transformed_pts...].
                        // We want the polyline to explicitly include the M_transformed point at the end.
                        // This is handled by how cleanPoints works for isItinerary=true, isPolygon=true (for closed path)
                    }
                    break;
                default:
                    isPolygonCandidate = false; polygonPoints = [];
                    transformedValues = [...seg.values]; 
                    break;
            }
            transformedPathSegments.push({ command: cmd, values: transformedValues });
        }

        if (isPolygonCandidate && polygonPoints.length > 0) {
            const isClosedPath = transformedPathSegments.length > 0 && transformedPathSegments[transformedPathSegments.length - 1].command === 'Z';
            let cleanedPolyPoints = cleanPoints(polygonPoints, isClosedPath, isItinerary);
            const finalMinPoints = isClosedPath ? (isItinerary ? 2 : 3) : 2;

            if (cleanedPolyPoints.length >= finalMinPoints) {
                if (isClosedPath) { 
                    if (isItinerary) { 
                        return { type: 'polyline', points: cleanedPolyPoints.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' '), originalId };
                    }
                    const area = polygonArea(cleanedPolyPoints);
                    const perimeter = polygonPerimeter(cleanedPolyPoints, true);
                    if (perimeter > 0 && (area / perimeter) >= 0.2) { 
                        return { type: 'polygon', points: cleanedPolyPoints.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' '), originalId };
                    }
                } else { 
                    return { type: 'polyline', points: cleanedPolyPoints.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' '), originalId };
                }
            }
        }
        
        const newPathD = reconstructPathD(transformedPathSegments);
        if (!newPathD || newPathD.length === 0) return null;
        return { type: 'path', d: newPathD, originalId };
    }
    return null; 
}


/**
 * Calculates the area of a polygon using the shoelace formula.
 * @param {number[][]} points - An array of [x,y] points.
 * @returns {number} The absolute area of the polygon.
 */
export function polygonArea(points) {
    if (!points || points.length < 3) {
        return 0;
    }
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length]; 
        area += p1[0] * p2[1] - p2[0] * p1[1];
    }
    return Math.abs(area / 2);
}

/**
 * Calculates the perimeter of a polygon or polyline.
 * @param {number[][]} points - An array of [x,y] points.
 * @param {boolean} isPolygon - True if it's a polygon (close the loop), false for polyline.
 * @returns {number} The perimeter.
 */
export function polygonPerimeter(points, isPolygon = true) {
    if (!points || points.length < 2) {
        return 0;
    }
    let perimeter = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i+1];
        perimeter += Math.sqrt(Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2));
    }
    if (isPolygon && points.length > 1) { 
        const pLast = points[points.length - 1];
        const pFirst = points[0];
        perimeter += Math.sqrt(Math.pow(pFirst[0] - pLast[0], 2) + Math.pow(pFirst[1] - pLast[1], 2));
    }
    return perimeter;
}

/**
 * Cleans a list of points by removing points that are too close to the previous kept point
 * and, for polygons, removing the last point if it's too close to the first.
 * @param {number[][]} points - An array of [x,y] coordinate pairs.
 * @param {boolean} isPolygon - True if the points form a polygon.
 * @param {boolean} isItinerary - True if the points are for an itinerary.
 * @returns {number[][]} The cleaned array of points.
 */
export function cleanPoints(points, isPolygon, isItinerary = false) {
    if (!points || points.length === 0) return [];

    const threshold = 0.4; 
    let cleaned = [];
    
    if (points.length > 0) {
        if (typeof points[0][0] === 'number' && typeof points[0][1] === 'number' &&
            !isNaN(points[0][0]) && !isNaN(points[0][1])) {
            cleaned.push([...points[0]]); 
            let lastKeptPoint = points[0];

            for (let i = 1; i < points.length; i++) {
                const currentPoint = points[i];
                 if (typeof currentPoint[0] !== 'number' || typeof currentPoint[1] !== 'number' ||
                    isNaN(currentPoint[0]) || isNaN(currentPoint[1])) {
                    continue; 
                }
                if (Math.abs(lastKeptPoint[0] - currentPoint[0]) > threshold || 
                    Math.abs(lastKeptPoint[1] - currentPoint[1]) > threshold) {
                    cleaned.push([...currentPoint]); 
                    lastKeptPoint = currentPoint;
                }
            }
        } else if (points.length > 0) {
            // console.warn("First point is invalid in cleanPoints:", points[0]);
        }
    }

    // For polygons (but NOT for itineraries), if the last point is very close to the first, remove it.
    if (isPolygon && !isItinerary && cleaned.length >= 2) {
        const firstPoint = cleaned[0];
        const lastPoint = cleaned[cleaned.length - 1];
        if (Math.abs(lastPoint[0] - firstPoint[0]) <= threshold &&
            Math.abs(lastPoint[1] - firstPoint[1]) <= threshold) {
            cleaned.pop(); 
        }
    }
    return cleaned;
}

/**
 * Parses an SVG path 'd' attribute string into a sequence of command objects.
 * @param {string} dAttributeString - The SVG path 'd' attribute value.
 * @returns {object[]} An array of command objects, e.g., { command: 'M', values: [10, 20] }.
 */
export function parsePathD(dAttributeString) {
    if (!dAttributeString) return [];
    const regex = /([MmLlHhVvCcSsQqTtAaZz])\s*((?:[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?\s*,?\s*)*)/gi;
    const segments = [];
    let match;
    while ((match = regex.exec(dAttributeString)) !== null) {
        const command = match[1];
        const valuesString = match[2] ? match[2].trim() : '';
        let values = [];
        if (valuesString) {
            values = valuesString
                .split(/[\s,]+/)
                .filter(v => v.length > 0)
                .map(parseFloat)
                .filter(v => !isNaN(v)); 
        }
        segments.push({ command, values });
    }
    return segments;
}


/**
 * Converts relative SVG path commands to absolute ones.
 * @param {object[]} segments - Array of path command objects from parsePathD.
 * @returns {object[]} A new array of segments with all commands converted to absolute.
 */
export function convertPathCommandsToAbsolute(segments) {
    const absoluteSegments = [];
    let currentX = 0;
    let currentY = 0;
    let subpathStartX = 0;
    let subpathStartY = 0;
    let lastControlX = 0;
    let lastControlY = 0;

    for (const seg of segments) {
        const { command, values } = seg;
        let newValues = [...values]; 

        switch (command) {
            case 'm': 
                for (let i = 0; i < newValues.length; i += 2) {
                    newValues[i] += currentX; newValues[i+1] += currentY;
                    if (i === 0) { currentX = newValues[i]; currentY = newValues[i+1]; subpathStartX = currentX; subpathStartY = currentY; }
                    absoluteSegments.push({ command: (i===0 ? 'M' : 'L'), values: [newValues[i], newValues[i+1]] });
                }
                lastControlX = currentX; lastControlY = currentY;
                continue; 
            case 'M':
                for (let i = 0; i < newValues.length; i += 2) {
                     if (i === 0) { currentX = newValues[i]; currentY = newValues[i+1]; subpathStartX = currentX; subpathStartY = currentY;
                        absoluteSegments.push({ command: 'M', values: [newValues[i], newValues[i+1]] });
                    } else { currentX = newValues[i]; currentY = newValues[i+1];
                        absoluteSegments.push({ command: 'L', values: [newValues[i], newValues[i+1]] });
                    }
                }
                lastControlX = currentX; lastControlY = currentY;
                continue;
            case 'l': 
                for (let i = 0; i < newValues.length; i += 2) {
                    newValues[i] += currentX; newValues[i+1] += currentY; currentX = newValues[i]; currentY = newValues[i+1];
                    absoluteSegments.push({ command: 'L', values: [newValues[i], newValues[i+1]] });
                }
                lastControlX = currentX; lastControlY = currentY;
                continue;
            case 'L':
                for (let i = 0; i < newValues.length; i += 2) {
                    currentX = newValues[i]; currentY = newValues[i+1];
                    absoluteSegments.push({ command: 'L', values: [newValues[i], newValues[i+1]] });
                }
                lastControlX = currentX; lastControlY = currentY;
                continue;
            case 'h': 
                for (let i = 0; i < newValues.length; ++i) {
                    newValues[i] += currentX; currentX = newValues[i];
                    absoluteSegments.push({ command: 'H', values: [newValues[i]] });
                }
                lastControlX = currentX; lastControlY = currentY;
                continue;
            case 'H':
                for (let i = 0; i < newValues.length; ++i) {
                    currentX = newValues[i];
                    absoluteSegments.push({ command: 'H', values: [newValues[i]] });
                }
                lastControlX = currentX; lastControlY = currentY;
                continue;
            case 'v': 
                for (let i = 0; i < newValues.length; ++i) {
                    newValues[i] += currentY; currentY = newValues[i];
                    absoluteSegments.push({ command: 'V', values: [newValues[i]] });
                }
                lastControlX = currentX; lastControlY = currentY;
                continue;
            case 'V':
                 for (let i = 0; i < newValues.length; ++i) {
                    currentY = newValues[i];
                    absoluteSegments.push({ command: 'V', values: [newValues[i]] });
                }
                lastControlX = currentX; lastControlY = currentY;
                continue;
            case 'c': 
                for (let i = 0; i < newValues.length; i += 6) {
                    newValues[i] += currentX; newValues[i+1] += currentY; newValues[i+2] += currentX; newValues[i+3] += currentY; newValues[i+4] += currentX; newValues[i+5] += currentY;
                    lastControlX = newValues[i+2]; lastControlY = newValues[i+3]; currentX = newValues[i+4]; currentY = newValues[i+5];
                    absoluteSegments.push({ command: 'C', values: newValues.slice(i, i+6) });
                }
                continue;
            case 'C':
                for (let i = 0; i < newValues.length; i += 6) {
                    lastControlX = newValues[i+2]; lastControlY = newValues[i+3]; currentX = newValues[i+4]; currentY = newValues[i+5];
                    absoluteSegments.push({ command: 'C', values: newValues.slice(i, i+6) });
                }
                continue;
            case 's': 
                 for (let i = 0; i < newValues.length; i += 4) {
                    const prevSegAbs = absoluteSegments.length > 0 ? absoluteSegments[absoluteSegments.length-1] : null;
                    const c1x = (prevSegAbs && (prevSegAbs.command === 'C' || prevSegAbs.command === 'S')) ? (2 * currentX - lastControlX) : currentX;
                    const c1y = (prevSegAbs && (prevSegAbs.command === 'C' || prevSegAbs.command === 'S')) ? (2 * currentY - lastControlY) : currentY;
                    const c2x = newValues[i] + currentX; const c2y = newValues[i+1] + currentY;
                    const endX = newValues[i+2] + currentX; const endY = newValues[i+3] + currentY;
                    absoluteSegments.push({ command: 'S', values: [c1x, c1y, c2x, c2y, endX, endY] });
                    lastControlX = c2x; lastControlY = c2y; currentX = endX; currentY = endY;
                }
                continue;
            case 'S':
                for (let i = 0; i < newValues.length; i += 4) {
                    const prevSegAbs = absoluteSegments.length > 0 ? absoluteSegments[absoluteSegments.length-1] : null;
                    let c1x = (prevSegAbs && (prevSegAbs.command === 'C' || prevSegAbs.command === 'S')) ? (2 * currentX - lastControlX) : currentX;
                    let c1y = (prevSegAbs && (prevSegAbs.command === 'C' || prevSegAbs.command === 'S')) ? (2 * currentY - lastControlY) : currentY;
                    lastControlX = newValues[i]; lastControlY = newValues[i+1]; currentX = newValues[i+2]; currentY = newValues[i+3];
                    absoluteSegments.push({ command: 'S', values: [c1x, c1y, newValues[i], newValues[i+1], newValues[i+2], newValues[i+3]] });
                }
                continue;
            case 'q': 
                for (let i = 0; i < newValues.length; i += 4) {
                    newValues[i] += currentX; newValues[i+1] += currentY; newValues[i+2] += currentX; newValues[i+3] += currentY;
                    lastControlX = newValues[i]; lastControlY = newValues[i+1]; currentX = newValues[i+2]; currentY = newValues[i+3];
                    absoluteSegments.push({ command: 'Q', values: newValues.slice(i, i+4) });
                }
                continue;
            case 'Q':
                for (let i = 0; i < newValues.length; i += 4) {
                    lastControlX = newValues[i]; lastControlY = newValues[i+1]; currentX = newValues[i+2]; currentY = newValues[i+3];
                    absoluteSegments.push({ command: 'Q', values: newValues.slice(i, i+4) });
                }
                continue;
            case 't': 
                for (let i = 0; i < newValues.length; i += 2) {
                    const prevSegAbs = absoluteSegments.length > 0 ? absoluteSegments[absoluteSegments.length-1] : null;
                    const c1x = (prevSegAbs && (prevSegAbs.command === 'Q' || prevSegAbs.command === 'T')) ? (2 * currentX - lastControlX) : currentX;
                    const c1y = (prevSegAbs && (prevSegAbs.command === 'Q' || prevSegAbs.command === 'T')) ? (2 * currentY - lastControlY) : currentY;
                    const endX = newValues[i] + currentX; const endY = newValues[i+1] + currentY;
                    absoluteSegments.push({ command: 'T', values: [c1x, c1y, endX, endY] });
                    lastControlX = c1x; lastControlY = c1y; currentX = endX; currentY = endY;
                }
                continue;
            case 'T':
                 for (let i = 0; i < newValues.length; i += 2) {
                    const prevSegAbs = absoluteSegments.length > 0 ? absoluteSegments[absoluteSegments.length-1] : null;
                    let c1x = (prevSegAbs && (prevSegAbs.command === 'Q' || prevSegAbs.command === 'T')) ? (2 * currentX - lastControlX) : currentX;
                    let c1y = (prevSegAbs && (prevSegAbs.command === 'Q' || prevSegAbs.command === 'T')) ? (2 * currentY - lastControlY) : currentY;
                    currentX = newValues[i]; currentY = newValues[i+1];
                    absoluteSegments.push({ command: 'T', values: [c1x, c1y, currentX, currentY] });
                    lastControlX = c1x; lastControlY = c1y;
                }
                continue;
            case 'a': 
            case 'A': 
                for (let i = 0; i < newValues.length; i += 7) {
                    if (command === 'a') { newValues[i+5] += currentX; newValues[i+6] += currentY; }
                    currentX = newValues[i+5]; currentY = newValues[i+6];
                    absoluteSegments.push({ command: 'A', values: newValues.slice(i, i+7) });
                }
                lastControlX = currentX; lastControlY = currentY;
                continue;
            case 'Z': case 'z':
                absoluteSegments.push({ command: 'Z', values: [] });
                currentX = subpathStartX; currentY = subpathStartY;
                lastControlX = currentX; lastControlY = currentY;
                continue;
            default: 
                console.warn(`Unknown path command: ${command}`);
                absoluteSegments.push({ command, values }); 
        }
    }
    return absoluteSegments;
}

/**
 * Reconstructs an SVG path 'd' attribute string from an array of command objects.
 * Coordinates are formatted to 3 decimal places.
 * @param {object[]} segments - Array of path command objects (assumed to be absolute).
 * @returns {string} The reconstructed 'd' attribute string.
 */
export function reconstructPathD(segments) {
    let d = '';
    for (const seg of segments) {
        d += seg.command;
        if (seg.values && seg.values.length > 0) {
            d += seg.values.map(v => {
                const rounded = Math.round(v * 1000) / 1000;
                return rounded;
            }).join(','); 
        }
    }
    return d;
}
