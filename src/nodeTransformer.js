import { transformPoint } from './geometry.js';
import { SVGPathData, SVGPathDataTransformer, SVGPathDataConverter } from 'svg-pathdata';

/**
 * Parses a string of points (e.g., "x1,y1 x2,y2 ...") into an array of {x, y} objects.
 * @param {string} pointsString - The string from polygon/polyline "points" attribute.
 * @returns {Array<Point>} An array of point objects.
 */
function parsePointsString(pointsString) {
  const points = [];
  if (!pointsString) return points;
  const pairs = pointsString.trim().split(/\s+/);
  for (const pair of pairs) {
    const coords = pair.split(',').map(parseFloat);
    if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
      points.push({ x: coords[0], y: coords[1] });
    }
  }
  return points;
}

/**
 * Converts an array of {x, y} objects back to a points string.
 * Uses toFixed(2) for cleaner output.
 * @param {Array<Point>} pointsArray - An array of point objects.
 * @returns {string} The points string.
 */
function formatPointsString(pointsArray) {
  return pointsArray.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

/**
 * Applies a transformation matrix to the attributes of an SVG DOM node.
 * If a node's geometry changes type (e.g. rect to polygon), its attributes and potentially
 * nodeName/tagName are updated directly.
 *
 * @param {Element} node - The DOM node to transform (e.g., rect, line, polygon, path).
 * @param {Matrix} matrix - The 6-element transformation matrix [a, b, c, d, e, f].
 */
export function applyTransformToNode(node, matrix) {
  const originalTagName = node.tagName.toLowerCase();
  let currentTagName = originalTagName; // To track if it changes

  switch (originalTagName) {
    case 'rect': {
      let x = parseFloat(node.getAttribute('x') || '0');
      let y = parseFloat(node.getAttribute('y') || '0');
      let width = parseFloat(node.getAttribute('width') || '0');
      let height = parseFloat(node.getAttribute('height') || '0');

      const hasRotationOrSkew = Math.abs(matrix[1]) > 1e-9 || Math.abs(matrix[2]) > 1e-9;

      if (!hasRotationOrSkew) {
        const p1 = transformPoint({ x, y }, matrix);
        node.setAttribute('x', p1.x.toFixed(2));
        node.setAttribute('y', p1.y.toFixed(2));
        node.setAttribute('width', Math.abs(width * matrix[0]).toFixed(2));
        node.setAttribute('height', Math.abs(height * matrix[3]).toFixed(2));
      } else {
        // Convert rect to polygon
        const points = [
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + height },
          { x, y: y + height },
        ].map(p => transformPoint(p, matrix));

        node.removeAttribute('x');
        node.removeAttribute('y');
        node.removeAttribute('width');
        node.removeAttribute('height');
        node.setAttribute('points', formatPointsString(points));
        
        // Direct modification of tagName/nodeName is non-standard but per instructions
        node.nodeName = 'polygon';
        node.tagName = 'polygon'; // xmldom might allow this.
        currentTagName = 'polygon';
        console.log(`Rect ${node.getAttribute('id') || ''} converted to polygon due to rotation/skew.`);
      }
      break;
    }
    case 'line': {
      const x1 = parseFloat(node.getAttribute('x1') || '0');
      const y1 = parseFloat(node.getAttribute('y1') || '0');
      const x2 = parseFloat(node.getAttribute('x2') || '0');
      const y2 = parseFloat(node.getAttribute('y2') || '0');

      const p1 = transformPoint({ x: x1, y: y1 }, matrix);
      const p2 = transformPoint({ x: x2, y: y2 }, matrix);

      node.setAttribute('x1', p1.x.toFixed(2));
      node.setAttribute('y1', p1.y.toFixed(2));
      node.setAttribute('x2', p2.x.toFixed(2));
      node.setAttribute('y2', p2.y.toFixed(2));
      break;
    }
    case 'polygon':
    case 'polyline': {
      const pointsString = node.getAttribute('points');
      const pointsArray = parsePointsString(pointsString);
      const transformedPoints = pointsArray.map(p => transformPoint(p, matrix));
      node.setAttribute('points', formatPointsString(transformedPoints));
      break;
    }
    case 'path': {
      const dAttribute = node.getAttribute('d');
      if (dAttribute) {
        try {
          const pathInstance = new SVGPathData(dAttribute);
          const transformedPath = pathInstance.transform(
            SVGPathDataTransformer(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5])
          );
          node.setAttribute('d', transformedPath.encode());

          const polygonData = SVGPathDataConverter.toPolygon(transformedPath.toAbs());
          // toPolygon returns an array of arrays of points e.g. [[{x,y}, {x,y}], [{x,y}...]] for multi-part paths
          // For simple, single-part paths that can be polygons, it's usually [[{x,y}, {x,y}, ...]]
          if (polygonData && polygonData.length > 0 && polygonData[0].length >= 3) {
             const points = polygonData.flat(); // Flatten array of arrays if necessary
             node.setAttribute('points', formatPointsString(points));
             node.removeAttribute('d');
             
             node.nodeName = 'polygon';
             node.tagName = 'polygon';
             currentTagName = 'polygon';
             console.log(`Path ${node.getAttribute('id') || ''} converted to polygon.`);
          }
        } catch (e) {
          console.warn(`Error transforming path data for node ${node.getAttribute('id') || 'NO_ID'}: ${e.message}. Original d: ${dAttribute}`);
        }
      }
      break;
    }
    case 'circle': {
        let cx = parseFloat(node.getAttribute('cx') || '0');
        let cy = parseFloat(node.getAttribute('cy') || '0');
        let r = parseFloat(node.getAttribute('r') || '0');

        const center = transformPoint({ x: cx, y: cy }, matrix);
        node.setAttribute('cx', center.x.toFixed(2));
        node.setAttribute('cy', center.y.toFixed(2));

        const scaleX = Math.sqrt(matrix[0] * matrix[0] + matrix[1] * matrix[1]);
        node.setAttribute('r', (r * scaleX).toFixed(2));
        // Note: Non-uniform scaling or rotation converts a circle to an ellipse or path.
        // This simplification keeps it a circle, which might be visually inaccurate.
        // Consider converting to ellipse/path if matrix[0]*matrix[3] - matrix[1]*matrix[2] (determinant) is not uniform or if there's shear.
        const det = matrix[0]*matrix[3] - matrix[1]*matrix[2];
        const isUniformScale = Math.abs(matrix[0] - matrix[3]) < 1e-9 && Math.abs(matrix[1]) < 1e-9 && Math.abs(matrix[2]) < 1e-9;
        if (!isUniformScale) {
            // This should ideally convert to an ellipse or path.
            // console.warn(`Circle ${node.getAttribute('id') || ''} transformed with non-uniform scale/rotation may become an ellipse. Kept as circle with averaged radius scaling.`);
        }
        break;
    }
    case 'ellipse': {
        let cx = parseFloat(node.getAttribute('cx') || '0');
        let cy = parseFloat(node.getAttribute('cy') || '0');
        let rx = parseFloat(node.getAttribute('rx') || '0');
        let ry = parseFloat(node.getAttribute('ry') || '0');

        const center = transformPoint({ x: cx, y: cy }, matrix);
        node.setAttribute('cx', center.x.toFixed(2));
        node.setAttribute('cy', center.y.toFixed(2));

        const hasRotationOrSkew = Math.abs(matrix[1]) > 1e-9 || Math.abs(matrix[2]) > 1e-9;
        if (!hasRotationOrSkew) {
            node.setAttribute('rx', Math.abs(rx * matrix[0]).toFixed(2));
            node.setAttribute('ry', Math.abs(ry * matrix[3]).toFixed(2));
        } else {
            console.warn(`Ellipse ${node.getAttribute('id') || ''} with rotation/skew transform should ideally be converted to a path. This is not yet implemented. Radii may be incorrect.`);
            // For now, scale radii by the x and y scale factors of the matrix components, which is an approximation.
            const sx = Math.sqrt(matrix[0]*matrix[0] + matrix[1]*matrix[1]);
            const sy = Math.sqrt(matrix[2]*matrix[2] + matrix[3]*matrix[3]);
            node.setAttribute('rx', (rx * sx).toFixed(2));
            node.setAttribute('ry', (ry * sy).toFixed(2));
        }
        break;
    }
    default:
      break;
  }
  // Store the (potentially new) tag name on the node for the converter to use
  node.currentTagName = currentTagName;
}
