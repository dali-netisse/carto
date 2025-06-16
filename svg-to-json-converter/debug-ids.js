#!/usr/bin/env node

/**
 * Debug ID processing to understand the differences between JS and Perl
 */

import { extractSpecialAttributes } from './lib/utils.js';
import { classifyObject } from './lib/classifier.js';

console.log('🔍 ID Processing Debug');
console.log('======================');

// Test cases based on the differences we see
const testIds = [
  'Escaliers 15 x-left',
  'Escaliers 19 x-scale 0.8',
  'Sanitaires 13 x-left',
  'Escalier A B',
  'Escalier C D'
];

for (const originalId of testIds) {
  console.log(`\n📝 Testing: "${originalId}"`);
  
  // Step 1: Extract special attributes
  const { id: cleanId, attributes } = extractSpecialAttributes(originalId);
  console.log(`   After extractSpecialAttributes: "${cleanId}"`);
  console.log(`   Attributes:`, attributes);
  
  // Step 2: Classify
  const classification = classifyObject(cleanId, 5); // floor 5
  if (classification) {
    console.log(`   After classification: "${classification.id}"`);
    console.log(`   Class: "${classification.class}"`);
  } else {
    console.log(`   Classification failed`);
  }
}

console.log('\n✅ Debug completed');
