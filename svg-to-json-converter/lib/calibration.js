/**
 * Calibration module for SVG to JSON converter
 * Handles site-specific calibration and transformations
 */

import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load calibration data
let calibrationData = null;
let siteFixesData = null;

/**
 * Load calibration configuration
 * @returns {Object} Calibration data
 */
export async function loadCalibrationData() {
  if (!calibrationData) {
    const configPath = join(__dirname, '..', 'config', 'calibration.json');
    const content = await readFile(configPath, 'utf8');
    calibrationData = JSON.parse(content);
  }
  return calibrationData;
}

/**
 * Load site fixes configuration
 * @returns {Object} Site fixes data
 */
export async function loadSiteFixes() {
  if (!siteFixesData) {
    const configPath = join(__dirname, '..', 'config', 'siteFixes.json');
    const content = await readFile(configPath, 'utf8');
    siteFixesData = JSON.parse(content);
  }
  return siteFixesData;
}

/**
 * Get calibration rectangle for a site
 * @param {string} site - Site code
 * @returns {Array|null} Calibration rectangle [x, y, width, height]
 */
export async function getCalibrationRect(site) {
  const data = await loadCalibrationData();
  return data[site] || null;
}

/**
 * Get ID fixes for a site and floor
 * @param {string} site - Site code
 * @param {string|number} floor - Floor number
 * @returns {Object} ID fixes mapping
 */
export async function getIdFixes(site, floor) {
  const data = await loadSiteFixes();
  const key = `${site}-${floor}`;
  return data.idFixes?.[key] || {};
}

/**
 * Get special transform for a site and floor
 * @param {string} site - Site code
 * @param {string|number} floor - Floor number
 * @returns {Object|null} Special transform configuration
 */
export async function getSpecialTransform(site, floor) {
  const data = await loadSiteFixes();
  const key = `${site}-${floor}`;
  return data.specialTransforms?.[key] || null;
}

/**
 * Apply ID fixes to an ID
 * @param {string} id - Original ID
 * @param {Object} fixes - ID fixes mapping
 * @returns {string} Fixed ID
 */
export function applyIdFix(id, fixes) {
  return fixes[id] || id;
}

/**
 * Parse filename to extract site and floor
 * @param {string} filename - SVG filename
 * @returns {Object|null} {site, floor} or null if not matched
 */
export function parseFilename(filename) {
  // Match patterns like "Brune R+7.svg" or "Vermeg Paris RDC.svg"
  const match = filename.match(/(?:^|[\/\\])([-\w\s]+?\d*)(?:\s|-)(?:R\+(\d+)|R(-\d+)|(RDC|E[01]?|M|P\d*))\.svg$/i);
  
  if (!match) {
    return null;
  }
  
  let floor = match[2] || match[3] || match[4];
  
  // Convert floor codes to numbers
  if (floor === 'RDC') {
    floor = 0;
  } else if (floor && floor.match(/^E(\d*)$/)) {
    // Mezzanine levels
    const level = match[1] || '0';
    floor = `E${level}`;
  } else if (floor && floor.match(/^P(\d*)$/)) {
    // Parking levels
    const level = match[1] || '';
    floor = `P${level}`;
  } else if (floor === 'M') {
    // Mezzanine
    floor = 'M';
  } else {
    floor = parseInt(floor);
  }
  
  return { 
    siteName: match[1].trim(),
    floor: floor
  };
}

/**
 * Load sites mapping from sites-map file
 * @param {string} dir - Directory containing the SVG file
 * @returns {Object} Sites mapping
 */
export async function loadSitesMap(dir) {
  const sitesMapPath = join(dir, '..', 'sites-map');
  const sites = {};
  
  try {
    const content = await readFile(sitesMapPath, 'utf8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Remove comments
      const cleanLine = trimmed.replace(/\s*#.*$/, '');
      if (!cleanLine) continue;
      
      // Split by tab or space
      let [name, id] = cleanLine.split('\t');
      if (!id && cleanLine.includes(' ')) {
        console.warn('Warning: sites-map uses space as separator');
        [name, id] = cleanLine.split(' ');
      }
      
      if (name && id) {
        // Normalize name
        const normalizedName = name.trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\W+/g, '_');
        
        sites[normalizedName] = id.trim();
      }
    }
  } catch (error) {
    // Sites map file not found is not an error
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  
  return sites;
}

/**
 * Resolve site code from filename and sites map
 * @param {string} filename - SVG filename
 * @param {string} dir - Directory containing the SVG file
 * @param {string} overrideSite - Optional site override
 * @returns {Object} {site, floor}
 */
export async function resolveSite(filename, dir, overrideSite) {
  const parsed = parseFilename(filename);
  if (!parsed) {
    throw new Error(`Can't match filename ${filename}!`);
  }
  
  const { siteName, floor } = parsed;
  
  if (overrideSite) {
    return { site: overrideSite, floor };
  }
  
  const sitesMap = await loadSitesMap(dir);
  
  // Normalize site name
  const normalizedSite = siteName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-\s]+/g, '_');
  
  // Check for EDS pattern (site_number)
  if (normalizedSite.match(/^(\w+)_(\d+)(?:_|$)/)) {
    const [, baseSite, eds] = normalizedSite.match(/^(\w+)_(\d+)(?:_|$)/);
    let site = sitesMap[baseSite];
    if (site) {
      site = site.replace('$1', eds);
      return { site, floor };
    }
  }
  
  // Direct lookup
  const site = sitesMap[normalizedSite];
  if (!site) {
    throw new Error(`Can't match site ${normalizedSite}!`);
  }
  
  return { site, floor };
}

/**
 * Load meeting rooms mapping from salles-name-to-id file
 * @param {string} dir - Directory containing the SVG file
 * @returns {Object} Meeting rooms mapping
 */
export async function loadMeetingRoomsMap(dir) {
  const mapPath = join(dir, 'salles-name-to-id');
  const roomsMap = {};
  
  try {
    const content = await readFile(mapPath, 'utf8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Remove comments
      const cleanLine = trimmed.replace(/\s*#.*$/, '');
      if (!cleanLine) continue;
      
      // Split by tab
      const [name, id] = cleanLine.split('\t');
      
      if (name && id) {
        // Normalize name
        const normalizedName = name.trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\W/g, '');
        
        roomsMap[normalizedName] = id.trim();
      }
    }
  } catch (error) {
    // Meeting rooms map file not found is not an error
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  
  return roomsMap;
} 