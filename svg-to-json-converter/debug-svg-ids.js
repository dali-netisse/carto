#!/usr/bin/env node

/**
 * Debug actual SVG IDs from the file
 */

import { loadSVG, createXPath, getElementsByLayer, getAttribute } from './lib/parser.js';

console.log('🔍 SVG ID Debug');
console.log('===============');

try {
  const doc = await loadSVG('../laposte-map-data/src/LYS/Lemnys R+5.svg');
  const xpath = createXPath(doc);
  
  // Get room elements like the main code does
  const roomElements = getElementsByLayer(
    xpath,
    doc,
    ["Salles", "Pièces", "salles"],
    "rect|polygon|path"
  );
  
  console.log(`Found ${roomElements.length} room elements`);
  
  // Check first 10 IDs that match our problematic patterns
  const problematicIds = [];
  
  for (const elem of roomElements) {
    const id = getAttribute(elem, "id");
    if (id && (id.includes('Escalier') || id.includes('Sanitaire'))) {
      problematicIds.push(id);
      if (problematicIds.length >= 10) break;
    }
  }
  
  console.log('\n📋 Problematic IDs found in SVG:');
  problematicIds.forEach((id, index) => {
    console.log(`${index + 1}. "${id}"`);
  });
  
} catch (error) {
  console.error('❌ Error:', error.message);
}
