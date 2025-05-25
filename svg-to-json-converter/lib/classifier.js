/**
 * Object classifier module for SVG to JSON converter
 * Classifies SVG elements into different types (office, meeting-room, etc.)
 */

import { normalizeText } from './utils.js';

/**
 * Classify an object based on its ID
 * @param {string} id - Object ID
 * @param {number} floor - Floor number
 * @returns {Object} Classification result {class, cleanId, name, showBubble}
 */
export function classifyObject(id, floor) {
  let objectClass = null;
  let cleanId = id;
  let name = null;
  let showBubble = false;
  
  // Terrasse
  if (/^Terrasse/i.test(id)) {
    objectClass = 'terrace';
  }
  
  // Bureaux (Offices)
  else if (/^Bureaux? (.*)$/i.test(id)) {
    objectClass = 'office';
    cleanId = id.replace(/^Bureaux? /i, '');
    cleanId = cleanId.replace(/ 1 ?$/g, '');
    cleanId = cleanId.replace(/ +- +/g, ',');
    cleanId = cleanId.replace(/ +et +/g, ',');
    cleanId = cleanId.replace(/([0-6][GS])-([0-9]+)/g, '$1$2');
    cleanId = cleanId.replace(/ /g, '');
  }
  
  // Openspaces
  else if (/^Openspaces? (.*)$/i.test(id)) {
    objectClass = 'openspace';
    cleanId = id.replace(/^Openspaces? /i, '');
    cleanId = cleanId.replace(/ 1 ?$/g, '');
    cleanId = cleanId.replace(/ +- +/g, ',');
    cleanId = cleanId.replace(/ +et +/g, ',');
    cleanId = cleanId.replace(/([0-6][GS])-([0-9]+)/g, '$1$2');
    cleanId = cleanId.replace(/ /g, '');
  }
  
  // Bureau with floor code
  else if (new RegExp(`^Bureau ([A-Z]) ?(${floor}[0-9]{2})$`, 'i').test(id)) {
    objectClass = 'office';
    const match = id.match(new RegExp(`^Bureau ([A-Z]) ?(${floor}[0-9]{2})$`, 'i'));
    cleanId = match[1] + match[2];
  }
  
  // Bureau with floor and section
  else if (new RegExp(`^Bureau (${floor}[SG]-[0-9]{2,3})$`, 'i').test(id)) {
    objectClass = 'office';
    const match = id.match(new RegExp(`^Bureau (${floor}[SG]-[0-9]{2,3})$`, 'i'));
    cleanId = match[1];
    cleanId = cleanId.replace(/ - /g, ',');
  }
  
  // Openspace with floor code
  else if (new RegExp(`^Openspace ([A-Z]) ?(${floor}[0-9]{2})$`, 'i').test(id)) {
    objectClass = 'openspace';
    const match = id.match(new RegExp(`^Openspace ([A-Z]) ?(${floor}[0-9]{2})$`, 'i'));
    cleanId = match[1] + match[2];
  }
  
  // Openspace with floor and section
  else if (new RegExp(`^Openspace (${floor}[SG]-[0-9]{2,3})$`, 'i').test(id)) {
    objectClass = 'openspace';
    const match = id.match(new RegExp(`^Openspace (${floor}[SG]-[0-9]{2,3})$`, 'i'));
    cleanId = match[1];
    cleanId = cleanId.replace(/ - /g, ',');
  }
  
  // Office codes like AP301
  else if (new RegExp(`^[A-C][IP]${floor}[0-9]{2}$`, 'i').test(id)) {
    objectClass = 'office';
  }
  
  // Parking
  else if (/^parking\s*(.*)$/i.test(id)) {
    objectClass = 'parking';
    cleanId = id.replace(/^parking\s*/i, '');
  }
  
  // Meeting rooms
  else if (/^Salle de r(?:é|  )ui?nion ([-.\w''\/ ]+)$/i.test(id)) {
    objectClass = 'meeting-room';
    const match = id.match(/^Salle de r(?:é|  )ui?nion ([-.\w''\/ ]+)$/i);
    name = match[1];
    cleanId = match[1];
  }
  
  // Meeting rooms with floor code
  else if (new RegExp(`^[A-C]${floor} [A-Z ]+$`, 'i').test(id)) {
    objectClass = 'meeting-room';
  }
  
  // Bulle
  else if (/^Bulle ([-\w' ]+)$/i.test(id)) {
    objectClass = 'bulle';
    const match = id.match(/^Bulle ([-\w' ]+)$/i);
    cleanId = match[1];
  }
  
  // Chat areas
  else if (/^(?:(?:ESPACE (?:DE )?)?CONVIVIALIT(?:E|é|  )|ECHANGES INFORMELS|ECH.? INF.?|(?:Espace|Salle) (?:d')?[eé]changes?|Tisanerie|Tisannerie|Espace salon)/i.test(id)) {
    objectClass = 'chat-area';
    if (/^Tisan*erie$/i.test(id)) {
      showBubble = true;
    }
  }
  
  // Stairs
  else if (/^ESC(?:ALIER)?/i.test(id)) {
    objectClass = 'stairs';
  }
  
  // Elevators
  else if (/^ASCENSEUR/i.test(id)) {
    objectClass = 'elevator';
  }
  
  // Toilets
  else if (/^WC|Sanitaires?/i.test(id)) {
    objectClass = 'toilets';
  }
  
  // Restaurant
  else if (/^resto\s+(.*)$/i.test(id) || /^(restaurant.*)$/i.test(id)) {
    objectClass = 'resto';
    const match = id.match(/^resto\s+(.*)$/i) || id.match(/^(restaurant.*)$/i);
    cleanId = match[1];
  }
  
  // Courrier
  else if (/^(?:espace|service )?courrier/i.test(id)) {
    objectClass = 'courrier';
  }
  
  // Medical
  else if (/^((?:espace|service )?m[eé]dical|infirmerie)/i.test(id)) {
    objectClass = 'medical';
  }
  
  // Concierge
  else if (/^(?:espace|service )?concierge(rie)?/i.test(id)) {
    objectClass = 'concierge';
  }
  
  // Service
  else if (/^service\s+(.*)/i.test(id)) {
    objectClass = 'service';
    const match = id.match(/^service\s+(.*)/i);
    cleanId = match[1];
  }
  
  // PMR refuge (skip for now)
  else if (/^Refuge PMR/i.test(id)) {
    objectClass = 'pmr';
    return null; // Skip PMR for now as per Perl script
  }
  
  // Repro
  else if (/^(?:TELECOPIEUR|Tri +\/ +Copie|Triu \/ Copie \/ Repro|Repro|Autre repro|Espace reprographie)/i.test(id)) {
    objectClass = 'repro';
  }
  
  // Conference
  else if (/^(?:auditorium|((espace|salle)( de))?conf[eé]rences?)/i.test(id)) {
    objectClass = 'conference';
  }
  
  // Silence
  else if (/^(?:Espace silence|Silence|Autre espace silence)/i.test(id)) {
    objectClass = 'silence';
  }
  
  // Invisible
  else if (/^Invisible (.*)$/i.test(id)) {
    objectClass = 'invisible';
    const match = id.match(/^Invisible (.*)$/i);
    cleanId = match[1];
  }
  
  // Skip SAS
  else if (/^Autre SAS/i.test(id)) {
    return null;
  }
  
  // Glass
  else if (/^(Cloison vitr(e|é|  )e|Vitre)/i.test(id)) {
    objectClass = 'glass';
  }
  
  // Other
  else if (/^(?:RANGEMENT|LOCAL VDI|COURRIER\/CASIER|TELECOPIEUR|Courrier|Tri +\/ +Copie|Archive|Local technique|Stock|Triu \/ Copie \/ Repro|Local IT|Repro|Cuisine|Local ménage|Autre)/i.test(id)) {
    objectClass = 'other';
  }
  
  // Espace
  else if (/^Espace ([-.\w' ]+)$/i.test(id)) {
    objectClass = 'espace';
    const match = id.match(/^Espace ([-.\w' ]+)$/i);
    cleanId = match[1];
  }
  
  // Flat color
  else if (/^(flat-[0-9a-f]{6}) (.*)/i.test(id)) {
    const match = id.match(/^(flat-[0-9a-f]{6}) (.*)/i);
    objectClass = match[1];
    cleanId = match[2];
  }
  
  // Default to other
  else {
    console.warn(`Unknown type: ${id}`);
    objectClass = 'other';
  }
  
  return {
    class: objectClass,
    id: cleanId,
    name: name,
    showBubble: showBubble
  };
}

/**
 * Process meeting room or espace name mapping
 * @param {string} name - Room name
 * @param {Object} nameToIdMap - Mapping from names to IDs
 * @returns {string|null} Mapped ID or null
 */
export function mapRoomName(name, nameToIdMap) {
  const cleanName = normalizeText(name);
  return nameToIdMap[cleanName] || null;
}

/**
 * Classify furniture/desk object
 * @param {string} id - Furniture ID
 * @returns {Object|null} Classification result or null to skip
 */
export function classifyFurniture(id) {
  // SDR (meeting room furniture)
  if (/^(SDR|Postes?)\s+([-A-Z0-9. ]+):(?:I([-+]?\d(?:\.\d)?)([-+]?\d(?:\.\d)?)A(\d):)?(?:(\d+)x(\d+):)?\s*(.*)$/i.test(id)) {
    const match = id.match(/^(SDR|Postes?)\s+([-A-Z0-9. ]+):(?:I([-+]?\d(?:\.\d)?)([-+]?\d(?:\.\d)?)A(\d):)?(?:(\d+)x(\d+):)?\s*(.*)$/i);
    const [, what, office, indicatorX, indicatorY, indicatorA, width, depth, deskIds] = match;
    
    return {
      type: what.toUpperCase() === 'SDR' ? 'meeting' : 'desks',
      office,
      indicatorX: indicatorX ? parseFloat(indicatorX) : undefined,
      indicatorY: indicatorY ? parseFloat(indicatorY) : undefined,
      indicatorA: indicatorA ? parseInt(indicatorA) : undefined,
      width: width ? parseInt(width) : undefined,
      depth: depth ? parseInt(depth) : undefined,
      deskIds
    };
  }
  
  // Meuble (furniture)
  else if (/^meuble\s+([-_\w]+)/i.test(id)) {
    const match = id.match(/^meuble\s+([-_\w]+)/i);
    return {
      type: 'furniture',
      class: match[1]
    };
  }
  
  // Tag
  else if (/^tag\s+([-_\w]+)/i.test(id)) {
    const match = id.match(/^tag\s+([-_\w]+)/i);
    return {
      type: 'tag',
      class: match[1]
    };
  }
  
  // Text
  else if (/^(r?text(-top)?)\s+(\S+)\s+(\d+(?:\.\d+)?)\s+(\S+)\s(.*)$/.test(id)) {
    const match = id.match(/^(r?text(-top)?)\s+(\S+)\s+(\d+(?:\.\d+)?)\s+(\S+)\s(.*)$/);
    const [, textType, topFlag, className, size, color, text] = match;
    
    return {
      type: 'text',
      textType,
      height: topFlag === '-top' ? 1 : 0,
      class: className,
      size: parseFloat(size),
      color,
      text: text.replace(/\\n/g, '\n')
    };
  }
  
  return null;
}

/**
 * Parse desk IDs string into objects array
 * @param {string} deskIds - Desk IDs string
 * @param {string} office - Office name
 * @param {number} width - Desk width
 * @param {number} depth - Desk depth
 * @returns {Array} Array of desk objects
 */
export function parseDeskIds(deskIds, office, width, depth) {
  const objects = [];
  
  // Format: 1G=A,2D=B
  if (deskIds.includes('=')) {
    const pairs = deskIds.split(/\s*,\s*/);
    for (const pair of pairs) {
      const match = pair.match(/^(\d+)([GD]X?|C)=(.+)$/i);
      if (match) {
        const [, position, side, desk] = match;
        const obj = {
          position: parseInt(position),
          side: side.toUpperCase(),
          office,
          desk
        };
        if (width && depth) {
          obj.width = width;
          obj.depth = depth;
        }
        objects.push(obj);
      }
    }
  }
  // Format: ABCD or Z4 or N4 or R4 or -Z4
  else {
    let deskIdArray = [];
    
    if (/^(-?)([URNZ]?)(\d+)$/.test(deskIds)) {
      const match = deskIds.match(/^(-?)([URNZ]?)(\d+)$/);
      const [, reverseFlag, layout, countStr] = match;
      const reverse = reverseFlag === '-';
      const layoutType = layout || 'Z';
      const count = parseInt(countStr);
      
      if (layoutType === 'Z') {
        // Simple A, B, C, D...
        for (let i = 0; i < count; i++) {
          deskIdArray.push(String.fromCharCode(65 + i)); // A=65
        }
      } else if (layoutType === 'N') {
        // Alternating pattern
        for (let i = 0; i < count; i++) {
          const index = Math.floor(i / 2) + (i % 2) * Math.floor(count / 2);
          deskIdArray.push(String.fromCharCode(65 + index));
        }
      } else if (layoutType === 'R') {
        // Reverse alternating pattern
        for (let i = 0; i < count; i++) {
          const index = Math.floor(i / 2) + ((i + 1) % 2) * Math.floor(count / 2);
          deskIdArray.push(String.fromCharCode(65 + index));
        }
      }
      
      if (reverse) {
        deskIdArray.reverse();
      }
    } else {
      // Direct string like "ABCD"
      deskIdArray = deskIds.split('');
    }
    
    // Convert to objects
    let index = 0;
    for (const deskId of deskIdArray) {
      if (deskId !== '-') {
        const obj = {
          position: Math.floor(index / 2) + 1,
          side: (index % 2) ? 'D' : 'G',
          office,
          desk: deskId
        };
        if (width && depth) {
          obj.width = width;
          obj.depth = depth;
        }
        objects.push(obj);
      }
      index++;
    }
  }
  
  return objects;
} 