import fs from 'fs';

/**
 * Reads an SVG file and returns its content as a string.
 *
 * @param {string} filePath - The path to the SVG file.
 * @returns {string} The content of the SVG file.
 * @throws {Error} If the file cannot be read.
 */
export function readSVGFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    throw error;
  }
}
