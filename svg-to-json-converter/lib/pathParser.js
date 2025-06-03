/**
 * SVG Path Parser for SVG to JSON converter
 * Parses SVG path data and converts complex paths to simpler forms
 */

import { parseNumber } from './utils.js';

/**
 * Parse an SVG path string into commands and parameters
 * @param {string} pathData - SVG path data string
 * @returns {Array} Array of parsed commands
 */
export function parsePath(pathData) {
  const commands = [];
  let currentCommand = null;
  let currentParams = [];
  
  // Normalize path data
  let path = pathData.trim();
  
  // Regular expression to match commands and numbers
  const commandRegex = /([mMlLhHvVcCsSqQtTaAzZ])/;
  const numberRegex = /(-?\d*\.?\d+(?:e[+-]?\d+)?)/i;
  
  while (path.length > 0) {
    path = path.trim();
    
    // Check for command
    const commandMatch = path.match(/^([mMlLhHvVcCsSqQtTaAzZ])/);
    if (commandMatch) {
      // Save previous command if exists
      if (currentCommand) {
        commands.push({ command: currentCommand, params: currentParams });
      }
      currentCommand = commandMatch[1];
      currentParams = [];
      path = path.slice(1);
      continue;
    }
    
    // Check for number
    const numberMatch = path.match(/^(-?\d*\.?\d+(?:e[+-]?\d+)?)/i);
    if (numberMatch) {
      currentParams.push(parseFloat(numberMatch[1]));
      path = path.slice(numberMatch[0].length);
      // Skip optional comma or space
      path = path.replace(/^[,\s]*/, '');
      continue;
    }
    
    // Skip any other character (shouldn't happen with valid paths)
    if (path.length > 0) {
      console.warn(`Unexpected character in path: ${path[0]}`);
      path = path.slice(1);
    }
  }
  
  // Save last command
  if (currentCommand) {
    commands.push({ command: currentCommand, params: currentParams });
  }
  
  // Post-process to split move commands with multiple coordinate pairs
  const processedCommands = [];
  for (const { command, params } of commands) {
    if ((command === 'M' || command === 'm') && params.length > 2) {
      // First pair is move command
      processedCommands.push({ command, params: [params[0], params[1]] });
      // Subsequent pairs are line commands
      const lineCommand = command === 'M' ? 'L' : 'l';
      const lineParams = params.slice(2);
      if (lineParams.length > 0) {
        processedCommands.push({ command: lineCommand, params: lineParams });
      }
    } else {
      processedCommands.push({ command, params });
    }
  }
  
  return processedCommands;
}

/**
 * Convert parsed path commands to absolute coordinates
 * @param {Array} commands - Parsed path commands
 * @returns {Object} Object with absoluteCommands and metadata
 */
export function pathToAbsolute(commands) {
  const absoluteCommands = [];
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;
  let lastControlX = currentX;
  let lastControlY = currentY;
  
  for (const { command, params } of commands) {
    const absCommand = { command: command.toUpperCase(), params: [] };
    
    switch (command) {
      case 'm': // relative moveto
        for (let i = 0; i < params.length; i += 2) {
          currentX += params[i];
          currentY += params[i + 1];
          absCommand.params.push(currentX, currentY);
          if (i === 0) {
            startX = currentX;
            startY = currentY;
          }
        }
        // Subsequent pairs are treated as lineto
        if (params.length > 2) {
          absCommand.command = 'L';
        }
        break;
        
      case 'M': // absolute moveto
        for (let i = 0; i < params.length; i += 2) {
          currentX = params[i];
          currentY = params[i + 1];
          absCommand.params.push(currentX, currentY);
          if (i === 0) {
            startX = currentX;
            startY = currentY;
          }
        }
        // Subsequent pairs are treated as lineto
        if (params.length > 2) {
          absCommand.command = 'L';
        }
        break;
        
      case 'l': // relative lineto
        for (let i = 0; i < params.length; i += 2) {
          currentX += params[i];
          currentY += params[i + 1];
          absCommand.params.push(currentX, currentY);
        }
        break;
        
      case 'L': // absolute lineto
        for (let i = 0; i < params.length; i += 2) {
          currentX = params[i];
          currentY = params[i + 1];
          absCommand.params.push(currentX, currentY);
        }
        break;
        
      case 'h': // relative horizontal lineto
        for (const dx of params) {
          currentX += dx;
          absCommand.params.push(currentX, currentY);
        }
        absCommand.command = 'L';
        break;
        
      case 'H': // absolute horizontal lineto
        for (const x of params) {
          currentX = x;
          absCommand.params.push(currentX, currentY);
        }
        absCommand.command = 'L';
        break;
        
      case 'v': // relative vertical lineto
        for (const dy of params) {
          currentY += dy;
          absCommand.params.push(currentX, currentY);
        }
        absCommand.command = 'L';
        break;
        
      case 'V': // absolute vertical lineto
        for (const y of params) {
          currentY = y;
          absCommand.params.push(currentX, currentY);
        }
        absCommand.command = 'L';
        break;
        
      case 'c': // relative cubic bezier
        for (let i = 0; i < params.length; i += 6) {
          const x1 = currentX + params[i];
          const y1 = currentY + params[i + 1];
          const x2 = currentX + params[i + 2];
          const y2 = currentY + params[i + 3];
          currentX += params[i + 4];
          currentY += params[i + 5];
          absCommand.params.push(x1, y1, x2, y2, currentX, currentY);
          lastControlX = x2;
          lastControlY = y2;
        }
        break;
        
      case 'C': // absolute cubic bezier
        for (let i = 0; i < params.length; i += 6) {
          const x1 = params[i];
          const y1 = params[i + 1];
          const x2 = params[i + 2];
          const y2 = params[i + 3];
          currentX = params[i + 4];
          currentY = params[i + 5];
          absCommand.params.push(x1, y1, x2, y2, currentX, currentY);
          lastControlX = x2;
          lastControlY = y2;
        }
        break;
        
      case 's': // relative smooth cubic bezier
        for (let i = 0; i < params.length; i += 4) {
          const x1 = 2 * currentX - lastControlX;
          const y1 = 2 * currentY - lastControlY;
          const x2 = currentX + params[i];
          const y2 = currentY + params[i + 1];
          currentX += params[i + 2];
          currentY += params[i + 3];
          absCommand.params.push(x1, y1, x2, y2, currentX, currentY);
          lastControlX = x2;
          lastControlY = y2;
        }
        absCommand.command = 'C';
        break;
        
      case 'S': // absolute smooth cubic bezier
        for (let i = 0; i < params.length; i += 4) {
          const x1 = 2 * currentX - lastControlX;
          const y1 = 2 * currentY - lastControlY;
          const x2 = params[i];
          const y2 = params[i + 1];
          currentX = params[i + 2];
          currentY = params[i + 3];
          absCommand.params.push(x1, y1, x2, y2, currentX, currentY);
          lastControlX = x2;
          lastControlY = y2;
        }
        absCommand.command = 'C';
        break;
        
      case 'q': // relative quadratic bezier
        for (let i = 0; i < params.length; i += 4) {
          const x1 = currentX + params[i];
          const y1 = currentY + params[i + 1];
          currentX += params[i + 2];
          currentY += params[i + 3];
          absCommand.params.push(x1, y1, currentX, currentY);
          lastControlX = x1;
          lastControlY = y1;
        }
        break;
        
      case 'Q': // absolute quadratic bezier
        for (let i = 0; i < params.length; i += 4) {
          const x1 = params[i];
          const y1 = params[i + 1];
          currentX = params[i + 2];
          currentY = params[i + 3];
          absCommand.params.push(x1, y1, currentX, currentY);
          lastControlX = x1;
          lastControlY = y1;
        }
        break;
        
      case 't': // relative smooth quadratic bezier
        for (let i = 0; i < params.length; i += 2) {
          const x1 = 2 * currentX - lastControlX;
          const y1 = 2 * currentY - lastControlY;
          currentX += params[i];
          currentY += params[i + 1];
          absCommand.params.push(x1, y1, currentX, currentY);
          lastControlX = x1;
          lastControlY = y1;
        }
        absCommand.command = 'Q';
        break;
        
      case 'T': // absolute smooth quadratic bezier
        for (let i = 0; i < params.length; i += 2) {
          const x1 = 2 * currentX - lastControlX;
          const y1 = 2 * currentY - lastControlY;
          currentX = params[i];
          currentY = params[i + 1];
          absCommand.params.push(x1, y1, currentX, currentY);
          lastControlX = x1;
          lastControlY = y1;
        }
        absCommand.command = 'Q';
        break;
        
      case 'a': // relative arc
        for (let i = 0; i < params.length; i += 7) {
          const rx = params[i];
          const ry = params[i + 1];
          const rotation = params[i + 2];
          const largeArc = params[i + 3];
          const sweep = params[i + 4];
          currentX += params[i + 5];
          currentY += params[i + 6];
          absCommand.params.push(rx, ry, rotation, largeArc, sweep, currentX, currentY);
        }
        break;
        
      case 'A': // absolute arc
        for (let i = 0; i < params.length; i += 7) {
          const rx = params[i];
          const ry = params[i + 1];
          const rotation = params[i + 2];
          const largeArc = params[i + 3];
          const sweep = params[i + 4];
          currentX = params[i + 5];
          currentY = params[i + 6];
          absCommand.params.push(rx, ry, rotation, largeArc, sweep, currentX, currentY);
        }
        break;
        
      case 'z':
      case 'Z': // closepath
        currentX = startX;
        currentY = startY;
        absCommand.params = [];
        break;
        
      default:
        console.warn(`Unknown path command: ${command}`);
    }
    
    // Reset control point for commands that don't set it
    if (!'cCsS'.includes(command)) {
      lastControlX = currentX;
      lastControlY = currentY;
    }
    
    absoluteCommands.push(absCommand);
  }
  
  return {
    commands: absoluteCommands,
    startX,
    startY,
    endX: currentX,
    endY: currentY
  };
}

/**
 * Check if a path contains only straight lines (can be converted to polygon)
 * @param {Array} commands - Absolute path commands
 * @returns {boolean} True if path is a polygon
 */
export function isPolygonPath(commands) {
  let moveCount = 0;
  
  for (const { command } of commands) {
    if (command === 'M') {
      moveCount++;
      // Multiple subpaths (multiple M commands) disqualify from being a polygon
      if (moveCount > 1) {
        return false;
      }
    } else if (!['L', 'Z'].includes(command)) {
      // Any command other than M, L, Z disqualifies from being a polygon
      // This includes curves (C, S, Q, T), arcs (A), etc.
      return false;
    }
  }
  return true;
}

/**
 * Extract points from a path that contains only straight lines
 * @param {Array} commands - Absolute path commands
 * @param {boolean} itineraryMode - If true, handle Z commands like itinerary mode in Perl
 * @returns {Array} Array of [x, y] points
 */
export function pathToPoints(commands, itineraryMode = false) {
  const points = [];
  let startPoint = null;
  
  for (const { command, params } of commands) {
    if (command === 'M') {
      for (let i = 0; i < params.length; i += 2) {
        const point = [params[i], params[i + 1]];
        points.push(point);
        if (i === 0) startPoint = point; // Remember start point for Z command
      }
    } else if (command === 'L') {
      for (let i = 0; i < params.length; i += 2) {
        points.push([params[i], params[i + 1]]);
      }
    } else if (command === 'Z' && itineraryMode && startPoint) {
      // In itinerary mode, Z command adds explicit line back to start point
      points.push([startPoint[0], startPoint[1]]);
    }
    // Regular mode: Z command doesn't add points
  }
  
  return points;
}

/**
 * Convert a path string to a new path string with absolute coordinates
 * @param {string} pathData - SVG path data string
 * @returns {string} New path string with absolute coordinates
 */
export function pathToAbsoluteString(pathData) {
  const parsed = parsePath(pathData);
  const { commands } = pathToAbsolute(parsed);
  
  let result = '';
  for (const { command, params } of commands) {
    result += command;
    for (let i = 0; i < params.length; i++) {
      if (i > 0) result += ',';
      result += params[i];
    }
  }
  
  return result;
}

/**
 * Transform path data by converting to absolute coordinates and applying transforms
 * @param {string} pathData - SVG path data string
 * @param {number[]|null} transform - Transformation matrix [a, b, c, d, e, f]
 * @returns {string} Transformed path string with absolute coordinates
 */
export function transformPathData(pathData, transform) {
  const parsed = parsePath(pathData);
  const { commands } = pathToAbsolute(parsed);
  
  let result = '';
  for (const { command, params } of commands) {
    result += command;
    
    if (command === 'M' || command === 'L') {
      // Transform coordinate pairs
      for (let i = 0; i < params.length; i += 2) {
        const x = params[i];
        const y = params[i + 1];
        
        if (transform) {
          const [a, b, c, d, e, f] = transform;
          const transformedX = x * a + y * c + e;
          const transformedY = x * b + y * d + f;
          result += transformedX + ',' + transformedY;
        } else {
          result += x + ',' + y;
        }
        
        if (i < params.length - 2) result += 'L';
      }
    } else if (command === 'C') {
      // Transform cubic bezier control points and end point
      for (let i = 0; i < params.length; i += 6) {
        const points = [
          [params[i], params[i + 1]],     // first control point
          [params[i + 2], params[i + 3]], // second control point  
          [params[i + 4], params[i + 5]]  // end point
        ];
        
        const transformedPoints = [];
        for (const [x, y] of points) {
          if (transform) {
            const [a, b, c, d, e, f] = transform;
            const transformedX = x * a + y * c + e;
            const transformedY = x * b + y * d + f;
            transformedPoints.push([transformedX, transformedY]);
          } else {
            transformedPoints.push([x, y]);
          }
        }
        
        result += transformedPoints.map(p => p.join(',')).join(',');
        if (i < params.length - 6) result += ',';
      }
    } else if (command === 'Q') {
      // Transform quadratic bezier control point and end point
      for (let i = 0; i < params.length; i += 4) {
        const points = [
          [params[i], params[i + 1]],     // control point
          [params[i + 2], params[i + 3]]  // end point
        ];
        
        const transformedPoints = [];
        for (const [x, y] of points) {
          if (transform) {
            const [a, b, c, d, e, f] = transform;
            const transformedX = x * a + y * c + e;
            const transformedY = x * b + y * d + f;
            transformedPoints.push([transformedX, transformedY]);
          } else {
            transformedPoints.push([x, y]);
          }
        }
        
        result += transformedPoints.map(p => p.join(',')).join(',');
        if (i < params.length - 4) result += ',';
      }
    } else if (command === 'A') {
      // Transform arc end point (note: proper arc transformation would need more complex math)
      for (let i = 0; i < params.length; i += 7) {
        const rx = params[i];
        const ry = params[i + 1];
        const rotation = params[i + 2];
        const largeArc = params[i + 3];
        const sweep = params[i + 4];
        const x = params[i + 5];
        const y = params[i + 6];
        
        let transformedX = x;
        let transformedY = y;
        if (transform) {
          const [a, b, c, d, e, f] = transform;
          transformedX = x * a + y * c + e;
          transformedY = x * b + y * d + f;
        }
        
        result += `${rx},${ry},${rotation},${largeArc},${sweep},${transformedX},${transformedY}`;
        if (i < params.length - 7) result += ',';
      }
    } else if (command === 'Z') {
      // Z command has no parameters
      // result already has 'Z'
    } else {
      // For other commands, just append parameters as-is (shouldn't happen with our current parser)
      result += params.join(',');
    }
  }
  
  return result;
}