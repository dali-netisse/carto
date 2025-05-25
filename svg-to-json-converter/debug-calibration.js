import { loadSVG, createXPath, getCalibrationRect, getAttribute, getElementType } from './lib/parser.js';
import { parsePath, pathToAbsolute, pathToPoints } from './lib/pathParser.js';

const doc = await loadSVG('../laposte-map-data/src/BRU/Brune R+7.svg');
const xpath = createXPath(doc);
const calibrationRect = getCalibrationRect(xpath, doc);

if (calibrationRect) {
  const elemType = getElementType(calibrationRect);
  console.log('Calibration element type:', elemType);
  
  if (elemType === 'path') {
    const d = getAttribute(calibrationRect, 'd');
    console.log('Path d:', d);
    
    const parsed = parsePath(d);
    const absolute = pathToAbsolute(parsed);
    const points = pathToPoints(absolute.commands);
    
    console.log('Points:', points);
    
    if (points.length >= 4) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of points) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      console.log('Bounding box:', { x: minX, y: minY, width: maxX - minX, height: maxY - minY });
      console.log('Target calibration:', [90.811, 173.738, 1079.809, 791.261]);
    }
  }
} 