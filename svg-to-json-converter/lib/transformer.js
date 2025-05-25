/**
 * Coordinate transformation module for SVG to JSON converter
 */

/**
 * Transform a point using a transformation matrix
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number[]} transform - Transformation matrix [a, b, c, d, e, f]
 * @returns {number[]} Transformed point [x, y]
 */
export function transformPoint(x, y, transform) {
  if (!transform) return [x, y];
  
  const [a, b, c, d, e, f] = transform;
  return [
    x * a + y * c + e,
    x * b + y * d + f
  ];
}

/**
 * Parse SVG transform attribute into a transformation matrix
 * @param {string} transformStr - SVG transform attribute value
 * @returns {number[]|null} Transformation matrix [a, b, c, d, e, f] or null
 */
export function parseTransform(transformStr) {
  if (!transformStr) return null;
  
  const transforms = [];
  const transformRegex = /(\w+)\s*\(([^)]+)\)/g;
  let match;
  
  while ((match = transformRegex.exec(transformStr)) !== null) {
    const type = match[1];
    const params = match[2].split(/[,\s]+/).map(Number);
    
    let matrix = null;
    
    switch (type) {
      case 'matrix':
        if (params.length === 6) {
          matrix = params;
        }
        break;
        
      case 'translate':
        matrix = [1, 0, 0, 1, params[0] || 0, params[1] || 0];
        break;
        
      case 'scale':
        matrix = [params[0], 0, 0, params[1] || params[0], 0, 0];
        break;
        
      case 'rotate':
        if (params.length === 1) {
          // Rotate around origin
          const angle = params[0] * Math.PI / 180;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          matrix = [cos, sin, -sin, cos, 0, 0];
        } else if (params.length === 3) {
          // Rotate around a point
          const angle = params[0] * Math.PI / 180;
          const cx = params[1];
          const cy = params[2];
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          
          // Equivalent to translate(-cx,-cy), rotate, translate(cx,cy)
          matrix = [
            cos, sin, -sin, cos,
            cx - cx * cos + cy * sin,
            cy - cx * sin - cy * cos
          ];
        }
        break;
        
      case 'skewX':
        const tanX = Math.tan(params[0] * Math.PI / 180);
        matrix = [1, 0, tanX, 1, 0, 0];
        break;
        
      case 'skewY':
        const tanY = Math.tan(params[0] * Math.PI / 180);
        matrix = [1, tanY, 0, 1, 0, 0];
        break;
    }
    
    if (matrix) {
      transforms.push(matrix);
    }
  }
  
  // Combine multiple transforms
  if (transforms.length === 0) return null;
  if (transforms.length === 1) return transforms[0];
  
  return transforms.reduce(multiplyMatrices);
}

/**
 * Multiply two transformation matrices
 * @param {number[]} m1 - First matrix [a, b, c, d, e, f]
 * @param {number[]} m2 - Second matrix [a, b, c, d, e, f]
 * @returns {number[]} Result matrix
 */
export function multiplyMatrices(m1, m2) {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1
  ];
}

/**
 * Create a transformation matrix from calibration rectangles
 * @param {object} sourceRect - Source rectangle {x, y, width, height}
 * @param {number[]} targetRect - Target rectangle [x, y, width, height]
 * @returns {number[]} Transformation matrix
 */
export function createCalibrationTransform(sourceRect, targetRect) {
  const [nx, ny, nw, nh] = targetRect;
  const { x: x1, y: y1, width, height } = sourceRect;
  
  const a = nw / width;
  const d = nh / height;
  
  return [
    a,
    0,
    0,
    d,
    nx - x1 * a,
    ny - y1 * d
  ];
}

/**
 * Create a special transformation matrix based on site-specific rules
 * @param {object} config - Transformation configuration
 * @returns {number[]} Transformation matrix
 */
export function createSpecialTransform(config) {
  let matrix = [1, 0, 0, 1, 0, 0]; // Identity matrix
  
  if (config.type === 'rotate') {
    const angle = (config.angle || 0) * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const scale = config.scale || 1;
    
    matrix = [scale * cos, scale * sin, -scale * sin, scale * cos, 0, 0];
    
    if (config.translate) {
      matrix[4] = config.translate[0];
      matrix[5] = config.translate[1];
    }
  } else if (config.type === 'scale') {
    const scale = config.scale || 1;
    matrix = [scale, 0, 0, scale, 0, 0];
  } else if (config.type === 'translate') {
    if (config.translate) {
      matrix[4] = config.translate[0];
      matrix[5] = config.translate[1];
    }
  }
  
  return matrix;
}

/**
 * Check if a transformation is the identity matrix
 * @param {number[]} transform - Transformation matrix
 * @returns {boolean} True if identity matrix
 */
export function isIdentityTransform(transform) {
  if (!transform) return true;
  const [a, b, c, d, e, f] = transform;
  return a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0;
}

/**
 * Transform an array of points
 * @param {number[][]} points - Array of [x, y] coordinates
 * @param {number[]} transform - Transformation matrix
 * @returns {number[][]} Transformed points
 */
export function transformPoints(points, transform) {
  if (!transform || isIdentityTransform(transform)) return points;
  
  return points.map(([x, y]) => transformPoint(x, y, transform));
}

/**
 * Get all transforms from a node and its ancestors
 * @param {Element} node - DOM node
 * @returns {number[]|null} Combined transformation matrix
 */
export function getNodeTransforms(node) {
  const transforms = [];
  let element = node;
  
  while (element && element.nodeType === 1) { // ELEMENT_NODE
    const transform = element.getAttribute('transform');
    if (transform) {
      const matrix = parseTransform(transform);
      if (matrix) {
        transforms.unshift(matrix); // Add to beginning (parent transforms first)
      }
    }
    element = element.parentNode;
  }
  
  if (transforms.length === 0) return null;
  if (transforms.length === 1) return transforms[0];
  
  return transforms.reduce(multiplyMatrices);
} 