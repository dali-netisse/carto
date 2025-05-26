import {
  IDENTITY_MATRIX,
  multiplyMatrices,
  createTranslationMatrix,
  createScalingMatrix,
  createRotationMatrix,
  createRotationMatrixAroundPoint,
} from './geometry.js';

/**
 * Parses a string of numbers, typically from SVG transform attributes.
 * Handles comma, space, or mixed separators.
 * @param {string} argString - The string of numbers (e.g., "10,20", "10 20", "10, 20").
 * @returns {number[]} An array of parsed numbers.
 */
function parseNumericArguments(argString) {
  if (!argString) return [];
  // Replace commas with spaces, then split by one or more spaces, then parse to float.
  return argString.trim().replace(/,/g, ' ').split(/\s+/).map(parseFloat).filter(n => !isNaN(n));
}

/**
 * Parses an SVG `transform` attribute string and returns a single combined transformation matrix.
 * Transforms are applied from right to left as they appear in the string.
 *
 * @param {string | null} transformString - The SVG transform attribute value.
 * @returns {Matrix} The combined transformation matrix.
 */
export function parseTransformAttribute(transformString) {
  if (!transformString || transformString.trim() === '') {
    return [...IDENTITY_MATRIX];
  }

  // Regex to match transform functions and their arguments
  // Example: "translate(10, 20) scale(2) rotate(45 100 100)"
  // It will match "translate(10,20)", "scale(2)", "rotate(45 100 100)"
  const transformRegex = /(\w+)\s*\(([^)]*)\)/g;
  const transforms = [];
  let match;

  // Extract all transform functions from the string
  while ((match = transformRegex.exec(transformString)) !== null) {
    transforms.push({
      type: match[1].toLowerCase(),
      args: parseNumericArguments(match[2]),
    });
  }

  // Initialize with identity matrix
  let combinedMatrix = [...IDENTITY_MATRIX];

  // Apply transforms from right to left (SVG standard)
  // So, iterate through the collected transforms in reverse order
  for (let i = transforms.length - 1; i >= 0; i--) {
    const { type, args } = transforms[i];
    let matrix = [...IDENTITY_MATRIX];

    switch (type) {
      case 'matrix':
        if (args.length === 6) {
          matrix = [args[0], args[1], args[2], args[3], args[4], args[5]];
        } else {
          console.warn(`Invalid arguments for matrix: ${args}`);
        }
        break;
      case 'translate':
        if (args.length === 1) {
          matrix = createTranslationMatrix(args[0], 0);
        } else if (args.length === 2) {
          matrix = createTranslationMatrix(args[0], args[1]);
        } else {
          console.warn(`Invalid arguments for translate: ${args}`);
        }
        break;
      case 'scale':
        if (args.length === 1) {
          matrix = createScalingMatrix(args[0], args[0]); // Scale equally if sy is not provided
        } else if (args.length === 2) {
          matrix = createScalingMatrix(args[0], args[1]);
        } else {
          console.warn(`Invalid arguments for scale: ${args}`);
        }
        break;
      case 'rotate':
        if (args.length === 1) {
          matrix = createRotationMatrix(args[0]); // Rotate around (0,0)
        } else if (args.length === 3) {
          matrix = createRotationMatrixAroundPoint(args[0], args[1], args[2]);
        } else {
          console.warn(`Invalid arguments for rotate: ${args}`);
        }
        break;
      // skewX and skewY are not explicitly required by the task description's focus
      // but could be added here if needed.
      // case 'skewx': ... break;
      // case 'skewy': ... break;
      default:
        console.warn(`Unsupported transform type: ${type}`);
        continue; // Skip unsupported transform types
    }
    combinedMatrix = multiplyMatrices(matrix, combinedMatrix); // Current transform * accumulated
  }

  return combinedMatrix;
}
