/**
 * Object classifier module for SVG to JSON converter
 * Classifies SVG elements into different types (office, meeting-room, etc.)
 */

import { normalizeText } from "./utils.js";

 
function convertHexToChar(id) {
  // Convert hex sequences like _xXX_ to characters
  return id.replace(/_x([0-9a-f]{2})_/gi, (match, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

/**
 * Classify an object based on its ID
 * @param {string} id - Object ID
 * @param {number} floor - Floor number
 * @returns {Object} Classification result {class, cleanId, name, showBubble}
 */
export function classifyObject(id, floor) {
  let objectClass = null;
  id = convertHexToChar(id); // Convert hex sequences to characters
  id = id.replace(/_/g, " ").trim() // Replace underscores with spaces for readability
  let cleanId = id;
  let name = null;
  let showBubble = undefined;

  let classificationId = id;

  // Terrasse
  if (/^Terrasse/i.test(classificationId)) {
    objectClass = "terrace";
  }

  // Bureaux (Offices)
  else if (/^Bureaux? (.*)$/i.test(classificationId)) {
    objectClass = "office";
    cleanId = classificationId.replace(/^Bureaux? /i, "");
    cleanId = cleanId.replace(/ 1 ?$/g, "");
    cleanId = cleanId.replace(/ +- +/g, ",");
    cleanId = cleanId.replace(/ +et +/g, ",");
    cleanId = cleanId.replace(/([0-6][GS])-([0-9]+)/g, "$1$2");
    cleanId = cleanId.replace(/ /g, "");
  }

  // Openspaces
  else if (/^Openspaces? (.*)$/i.test(classificationId)) {
    objectClass = "openspace";
    cleanId = classificationId.replace(/^Openspaces? /i, "");
    cleanId = cleanId.replace(/ 1 ?$/g, "");
    cleanId = cleanId.replace(/ +- +/g, ",");
    cleanId = cleanId.replace(/ +et +/g, ",");
    cleanId = cleanId.replace(/([0-6][GS])-([0-9]+)/g, "$1$2");
    cleanId = cleanId.replace(/ /g, "");
  }

  // Bureau with floor code
  else if (
    new RegExp(`^Bureau ([A-Z]) ?(${floor}[0-9]{2})$`, "i").test(
      classificationId
    )
  ) {
    objectClass = "office";
    const match = classificationId.match(
      new RegExp(`^Bureau ([A-Z]) ?(${floor}[0-9]{2})$`, "i")
    );
    cleanId = match[1] + match[2];
  }

  // Bureau with floor and section
  else if (
    new RegExp(`^Bureau (${floor}[SG]-[0-9]{2,3})$`, "i").test(classificationId)
  ) {
    objectClass = "office";
    const match = classificationId.match(
      new RegExp(`^Bureau (${floor}[SG]-[0-9]{2,3})$`, "i")
    );
    cleanId = match[1];
    cleanId = cleanId.replace(/ - /g, ",");
  }

  // Openspace with floor code
  else if (
    new RegExp(`^Openspace ([A-Z]) ?(${floor}[0-9]{2})$`, "i").test(
      classificationId
    )
  ) {
    objectClass = "openspace";
    const match = classificationId.match(
      new RegExp(`^Openspace ([A-Z]) ?(${floor}[0-9]{2})$`, "i")
    );
    cleanId = match[1] + match[2];
  }

  // Openspace with floor and section
  else if (
    new RegExp(`^Openspace (${floor}[SG]-[0-9]{2,3})$`, "i").test(
      classificationId
    )
  ) {
    objectClass = "openspace";
    const match = classificationId.match(
      new RegExp(`^Openspace (${floor}[SG]-[0-9]{2,3})$`, "i")
    );
    cleanId = match[1];
    cleanId = cleanId.replace(/ - /g, ",");
  }

  // Office codes like AP301
  else if (
    new RegExp(`^[A-C][IP]${floor}[0-9]{2}$`, "i").test(classificationId)
  ) {
    objectClass = "office";
  }

  // Parking
  else if (/^parking\s*(.*)$/i.test(classificationId)) {
    objectClass = "parking";
    cleanId = classificationId.replace(/^parking\s*/i, "");
  }

  // Meeting rooms
  else if (
    /^Salle de r(?:é|  )ui?nion ([-.\w''\/ ]+)$/i.test(classificationId)
  ) {
    objectClass = "meeting-room";
    const match = classificationId.match(
      /^Salle de r(?:é|  )ui?nion ([-.\w''\/ ]+)$/i
    );
    name = match[1];
    cleanId = match[1];
  }

  // Meeting rooms with floor code
  else if (new RegExp(`^[A-C]${floor} [A-Z ]+$`, "i").test(classificationId)) {
    objectClass = "meeting-room";
  }

  // Bulle
  else if (/^Bulle ([-\w' ]+)$/i.test(classificationId)) {
    objectClass = "bulle";
    const match = classificationId.match(/^Bulle ([-\w' ]+)$/i);
    cleanId = match[1];
  }

  // Chat areas
  else if (
    /^(?:(?:ESPACE (?:DE )?)?CONVIVIALIT(?:E|é|  )|ECHANGES INFORMELS|ECH.? INF.?|(?:Espace|Salle) (?:d')?[eé]changes?|Tisanerie|Tisannerie|Espace salon)/i.test(
      classificationId
    )
  ) {
    objectClass = "chat-area";
    if (/^Tisan*erie$/i.test(classificationId)) {
      showBubble = "1";
    }
  }

  // Stairs
  else if (/^ESC(?:ALIER)?/i.test(classificationId)) {
    objectClass = "stairs";
    // For stairs, preserve the original ID format
    cleanId = id;
  }

  // Elevators
  else if (/^ASCENSEUR/i.test(classificationId)) {
    objectClass = "elevator";
  }

  // Toilets
  else if (/^WC|Sanitaires?/i.test(classificationId)) {
    objectClass = "toilets";
  }

  // Restaurant
  else if (
    /^resto\s+(.*)$/i.test(classificationId) ||
    /^(restaurant.*)$/i.test(classificationId)
  ) {
    objectClass = "resto";
    const match =
      classificationId.match(/^resto\s+(.*)$/i) ||
      classificationId.match(/^(restaurant.*)$/i);
    cleanId = match[1];
  }

  // Courrier
  else if (/^(?:espace|service )?courrier/i.test(classificationId)) {
    objectClass = "courrier";
  }

  // Medical
  else if (
    /^((?:espace|service )?m[eé]dical|infirmerie)/i.test(classificationId)
  ) {
    objectClass = "medical";
  }

  // Concierge
  else if (/^(?:espace|service )?concierge(rie)?/i.test(classificationId)) {
    objectClass = "concierge";
  }

  // Service
  else if (/^service\s+(.*)/i.test(classificationId)) {
    objectClass = "service";
    const match = classificationId.match(/^service\s+(.*)/i);
    cleanId = match[1];
  }

  // PMR refuge (skip for now)
  else if (/^Refuge PMR/i.test(classificationId)) {
    objectClass = "pmr";
    return null; // Skip PMR for now as per Perl script
  }

  // Repro
  else if (
    /^(?:TELECOPIEUR|Tri +\/ +Copie|Triu \/ Copie \/ Repro|Repro|Autre repro|Espace reprographie)/i.test(
      classificationId
    )
  ) {
    objectClass = "repro";
  }

  // Conference
  else if (
    /^(?:auditorium|((espace|salle)( de))?conf[eé]rences?)/i.test(
      classificationId
    )
  ) {
    objectClass = "conference";
  }

  // Silence
  else if (
    /^(?:Espace silence|Silence|Autre espace silence)/i.test(classificationId)
  ) {
    objectClass = "silence";
  }

  // Invisible
  else if (/^Invisible (.*)$/i.test(classificationId)) {
    objectClass = "invisible";
    const match = classificationId.match(/^Invisible (.*)$/i);
    cleanId = match[1];
  }

  // Skip SAS
  else if (/^Autre SAS/i.test(classificationId)) {
    return null;
  }

  // Glass
  else if (/^(Cloison vitr(e|é|  )e|Vitre)/i.test(classificationId)) {
    objectClass = "glass";
  }

  // Other
  else if (
    /^(?:RANGEMENT|LOCAL VDI|COURRIER\/CASIER|TELECOPIEUR|Courrier|Tri +\/ +Copie|Archive|Local technique|Stock|Triu \/ Copie \/ Repro|Local IT|Repro|Cuisine|Local ménage|Autre)/i.test(
      classificationId
    )
  ) {
    objectClass = "other";
  }

  // Espace
  else if (/^Espace ([-.\w' ]+)$/i.test(classificationId)) {
    objectClass = "espace";
    const match = classificationId.match(/^Espace ([-.\w' ]+)$/i);
    cleanId = match[1];
  }

  // Flat color
  else if (/^(flat-[0-9a-f]{6}) (.*)/i.test(classificationId)) {
    const match = classificationId.match(/^(flat-[0-9a-f]{6}) (.*)/i);
    objectClass = match[1];
    cleanId = match[2];
  }

  // Default to other
  else {
    console.warn(`Unknown type: ${classificationId}`);
    objectClass = "other";
  }

  return {
    class: objectClass,
    id: cleanId,
    name: name,
    showBubble: showBubble,
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
  // SDR (meeting room furniture) or Poste/postes (desks)
  // Handle both space and underscore separators
  // This regex matches the Perl regex: /^(SDR|Postes?)\s+([-A-Z0-9. ]+):(?:I([-+]?\d(?:\.\d)?)([-+]?\d(?:\.\d)?)A(\d):)?(?:(\d+)x(\d+):)?\s*(.*)$/i
  if (
    /^(SDR|Postes?|postes?)[\s_]+([-A-Z0-9. ]+):(?:I([-+]?\d(?:\.\d)?)([-+]?\d(?:\.\d)?)A(\d):)?(?:(\d+)x(\d+):)?\s*(.*)$/i.test(
      id
    )
  ) {
    const match = id.match(
      /^(SDR|Postes?|postes?)[\s_]+([-A-Z0-9. ]+):(?:I([-+]?\d(?:\.\d)?)([-+]?\d(?:\.\d)?)A(\d):)?(?:(\d+)x(\d+):)?\s*(.*)$/i
    );
    const [
      ,
      what,
      office,
      indicatorX,
      indicatorY,
      indicatorA,
      width,
      depth,
      deskIds,
    ] = match;

    // Values conversion identical to Perl (explicit casting/conversion with exact same behaviors)
    return {
      // In Perl: $class = what.toUpperCase() === 'SDR' ? 'meeting' : 'desks'
      type: what.toUpperCase() === "SDR" ? "meeting" : "desks",
      office,
      // In Perl: $indicator_x = $3?$3+0:undef - Using unary plus for exact Perl-like conversion
      indicatorX: indicatorX !== undefined ? +indicatorX : undefined,
      // In Perl: $indicator_y = $4?$4+0:undef - Using unary plus for exact Perl-like conversion
      indicatorY: indicatorY !== undefined ? +indicatorY : undefined,
      // In Perl: $indicator_a = $5?$5+0:undef - Using unary plus for exact Perl-like conversion
      indicatorA: indicatorA !== undefined ? +indicatorA : undefined,
      // In Perl: $width = $6 (used directly)
      width: width !== undefined ? +width : undefined,
      // In Perl: $depth = $7 (used directly)
      depth: depth !== undefined ? +depth : undefined,
      deskIds,
    };
  }

  // Meuble (furniture)
  else if (/^meuble\s+([-_\w]+)/i.test(id)) {
    const match = id.match(/^meuble\s+([-_\w]+)/i);
    return {
      type: "furniture",
      class: match[1],
    };
  }

  // Tag
  else if (/^tag\s+([-_\w]+)/i.test(id)) {
    const match = id.match(/^tag\s+([-_\w]+)/i);
    return {
      type: "tag",
      class: match[1],
    };
  }

  // Text
  else if (
    /^(r?text(-top)?)\s+(\S+)\s+(\d+(?:\.\d+)?)\s+(\S+)\s(.*)$/.test(id)
  ) {
    const match = id.match(
      /^(r?text(-top)?)\s+(\S+)\s+(\d+(?:\.\d+)?)\s+(\S+)\s(.*)$/
    );
    const [, textType, topFlag, className, size, color, text] = match;

    return {
      type: "text",
      textType,
      height: topFlag === "-top" ? 1 : 0,
      class: className,
      size: parseFloat(size),
      color,
      text: text.replace(/\\n/g, "\n"),
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
  if (deskIds.includes("=")) {
    const pairs = deskIds.split(/\s*,\s*/);
    for (const pair of pairs) {
      // Using regex to match position + side + desk ID
      // Handling special side indicators: G, D, GX, DX, C
      const match = pair.match(/^(\d+)([GD]X?|C)=(.+)$/i);
      if (match) {
        const [, position, side, desk] = match;
        const obj = {
          position: +position, // Unary plus for exact Perl-like behavior
          side: side.toUpperCase(), // Ensure consistent case like Perl
          office,
          desk,
        };
        if (width !== undefined && depth !== undefined) {
          obj.width = +width; // Unary plus for exact Perl-like behavior
          obj.depth = +depth; // Unary plus for exact Perl-like behavior
        }
        objects.push(obj);
      } else {
        console.error(`Could not match desk id ${pair} in id pattern`);
      }
    }
  }
  // Format: ABCD or Z4 or N4 or R4 or -Z4
  else {
    let deskIdArray = [];

    if (/^(-?)([URNZ]?)(\d+)$/.test(deskIds)) {
      const match = deskIds.match(/^(-?)([URNZ]?)(\d+)$/);
      const [, reverseFlag, layout, countStr] = match;
      const reverse = reverseFlag === "-";
      const layoutType = layout || "Z";
      const count = +countStr; // Unary plus for exact Perl-like behavior

      if (layoutType === "Z") {
        // Simple A, B, C, D... (default layout in Perl)
        for (let i = 0; i < count; i++) {
          deskIdArray.push(String.fromCharCode(65 + i)); // A=65, following Perl's incrementing scheme
        }
      } else if (layoutType === "N") {
        // Alternating pattern - exactly matching Perl implementation:
        // @desk_ids = map { chr(ord('A') + ($_%2) * ($count >> 1) + ($_ >> 1)) } (0 .. ($count-1));
        for (let i = 0; i < count; i++) {
          const index = (i % 2) * Math.floor(count / 2) + Math.floor(i / 2);
          deskIdArray.push(String.fromCharCode(65 + index));
        }
      } else if (layoutType === "R") {
        // Reverse alternating pattern - exactly matching Perl implementation:
        // @desk_ids = map { chr(ord('A') + (($_+1)%2) * ($count >> 1) + ($_ >> 1)) } (0 .. ($count-1));
        for (let i = 0; i < count; i++) {
          const index =
            ((i + 1) % 2) * Math.floor(count / 2) + Math.floor(i / 2);
          deskIdArray.push(String.fromCharCode(65 + index));
        }
      } else if (layoutType === "U") {
        // U layout (same as Z layout in Perl implementation)
        for (let i = 0; i < count; i++) {
          deskIdArray.push(String.fromCharCode(65 + i));
        }
      }

      // Apply reverse if specified with - prefix
      if (reverse) {
        deskIdArray.reverse();
      }
    } else {
      // Direct string like "ABCD"
      deskIdArray = deskIds.split("");
    }

    // Convert to objects - handle placeholder "-" characters
    // In Perl: $index = 0; for my $desk_id (@desk_ids) { if ($desk_id ne "-") { ... } $index++; }
    let index = 0;
    for (const deskId of deskIdArray) {
      if (deskId !== "-") {
        const obj = {
          // Perl: position => ($index >> 1) + 1,
          position: Math.floor(index / 2) + 1,
          // Perl: side => ($index % 2)?"D":"G",
          side: index % 2 ? "D" : "G", // Even indices are 'G', odd are 'D'
          office,
          desk: deskId,
        };
        // Add width and depth if provided
        if (width !== undefined && depth !== undefined) {
          obj.width = +width; // Unary plus for exact Perl-like behavior
          obj.depth = +depth; // Unary plus for exact Perl-like behavior
        }
        objects.push(obj);
      }
      index++;
    }
  }

  return objects;

  return objects;
}
