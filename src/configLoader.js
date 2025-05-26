import fs from 'fs';

/**
 * Normalizes a string to be used as a key in maps (e.g., for sites-map).
 * - Converts to lowercase.
 * - Applies NFD Unicode normalization to decompose combined characters.
 * - Removes diacritical marks (accents, etc.).
 * - Replaces sequences of non-alphanumeric characters (excluding underscore) with a single underscore.
 * - Trims leading/trailing whitespace and underscores.
 * @param {string} name - The string to normalize.
 * @returns {string} The normalized string.
 */
export function normalizeNameForKey(name) {
  if (typeof name !== 'string') {
    name = String(name);
  }
  let normalized = name.toLowerCase();
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Remove diacritics
  normalized = normalized.replace(/[^\w_]+/g, '_'); // Replace non-alphanumeric (excluding _) with _
  normalized = normalized.replace(/^_+|_+$/g, ''); // Trim leading/trailing underscores
  return normalized.trim(); // Trim whitespace just in case
}

/**
 * Normalizes a meeting room name for use as a key.
 * - Converts to lowercase.
 * - Applies NFD Unicode normalization.
 * - Removes diacritical marks.
 * - Removes all non-word characters (keeps only a-z, 0-9, and _).
 * @param {string} name - The meeting room name to normalize.
 * @returns {string} The normalized string.
 */
export function normalizeNameForKeyMeetingRooms(name) {
  if (typeof name !== 'string') {
    name = String(name);
  }
  let normalized = name.toLowerCase();
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Remove diacritics
  normalized = normalized.replace(/\W/g, ''); // Remove all non-word characters (keeps a-z, 0-9, _)
  return normalized;
}

/**
 * Loads a tab-separated file into a Map.
 * @param {string} filePath - Path to the tab-separated file.
 * @param {function(string): string} normalizeKeyFunction - Function to normalize keys.
 * @returns {Map<string, string>} A Map where keys are from the first column (normalized)
 *                                and values are from the second column.
 * @throws {Error} If the file cannot be read or parsed.
 */
export function loadTabSeparatedMap(filePath, normalizeKeyFunction) {
  const map = new Map();
  let fileContent;
  try {
    fileContent = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    throw error;
  }

  const lines = fileContent.split(/\r?\n/); // Handles both Windows and Unix line endings

  lines.forEach((line, index) => {
    if (line.trim() === '' || line.startsWith('#')) { // Skip empty lines and comments
      return;
    }

    const columns = line.split('\t');
    if (columns.length >= 2) {
      const originalKey = columns[0];
      const value = columns[1]; // Or columns.slice(1).join('\t') if values can contain tabs
      
      if (originalKey === null || originalKey === undefined || originalKey.trim() === '') {
          // console.warn(`Skipping line ${index + 1} in ${filePath} due to empty key.`);
          return;
      }

      const normalizedKey = normalizeKeyFunction(originalKey);

      if (map.has(normalizedKey) && map.get(normalizedKey) !== value) {
        console.warn(`Duplicate normalized key "${normalizedKey}" found in ${filePath}. Value "${map.get(normalizedKey)}" will be overwritten by "${value}". Original key: "${originalKey}"`);
      }
      map.set(normalizedKey, value);
    } else {
      console.warn(`Skipping line ${index + 1} in ${filePath} as it does not have at least two tab-separated columns: "${line}"`);
    }
  });

  return map;
}

/**
 * Loads the sites map from the specified file path.
 * Uses `normalizeNameForKey` for key normalization.
 * @param {string} filePath - Path to the sites-map file.
 * @returns {Map<string, string>} The sites map.
 */
export function loadSitesMap(filePath = 'laposte-map-data/src/sites-map') {
  try {
    return loadTabSeparatedMap(filePath, normalizeNameForKey);
  } catch (error) {
    console.error(`Failed to load sites map from ${filePath}. Returning empty map. Error: ${error.message}`);
    return new Map(); // Return empty map on failure to prevent crash, allow optional file
  }
}

/**
 * Loads the meeting rooms map from the specified file path.
 * Uses `normalizeNameForKeyMeetingRooms` for key normalization.
 * @param {string} filePath - Path to the salles-name-to-id file.
 * @returns {Map<string, string>} The meeting rooms map.
 */
export function loadMeetingRoomsMap(filePath = 'laposte-map-data/src/BRU/salles-name-to-id') {
 // Default path from the example, adjust as necessary
  try {
    return loadTabSeparatedMap(filePath, normalizeNameForKeyMeetingRooms);
  } catch (error) {
    console.error(`Failed to load meeting rooms map from ${filePath}. Returning empty map. Error: ${error.message}`);
    return new Map(); // Return empty map on failure
  }
}

/**
 * Loads and parses a JSON file.
 * @param {string} filePath - Path to the JSON file.
 * @returns {object} The parsed JSON object.
 * @throws {Error} If the file cannot be read or parsed.
 */
export function loadJsonData(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error reading or parsing JSON file ${filePath}:`, error);
    throw error;
  }
}
