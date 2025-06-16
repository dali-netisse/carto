#!/usr/bin/env node

import fs from 'fs';

console.log('=== Direction Precision Analysis ===');

try {
  // Check if processed file exists
  if (fs.existsSync('../js-output/LYS-5-processed.json')) {
    console.log('✓ Processed file exists');
    
    const jsOriginal = JSON.parse(fs.readFileSync('../js-output/LYS-5.json', 'utf8'));
    const jsProcessed = JSON.parse(fs.readFileSync('../js-output/LYS-5-processed.json', 'utf8'));
    const plData = JSON.parse(fs.readFileSync('../pl-output/LYS-5.json', 'utf8'));
    
    // Find first direction difference
    function findFirstDirection(obj, path = '') {
      if (typeof obj === 'object' && obj !== null) {
        for (const key in obj) {
          if (key === 'direction' && typeof obj[key] === 'number') {
            return { path: path + '.' + key, value: obj[key] };
          }
          if (obj[key] && typeof obj[key] === 'object') {
            const result = findFirstDirection(obj[key], path + '.' + key);
            if (result) return result;
          }
        }
      }
      return null;
    }
    
    const jsOrigDir = findFirstDirection(jsOriginal);
    const jsProcDir = findFirstDirection(jsProcessed);
    const plDir = findFirstDirection(plData);
    
    if (jsOrigDir && jsProcDir && plDir) {
      console.log('First direction found at:', jsOrigDir.path);
      console.log('JS Original:', jsOrigDir.value);
      console.log('JS Processed:', jsProcDir.value);
      console.log('Perl Original:', plDir.value);
      console.log('Diff (JS Orig vs Perl):', jsOrigDir.value - plDir.value);
      console.log('Diff (JS Proc vs Perl):', jsProcDir.value - plDir.value);
      
      if (Math.abs(jsProcDir.value - plDir.value) < Math.abs(jsOrigDir.value - plDir.value)) {
        console.log('✓ Post-processing improved precision');
      } else if (jsProcDir.value === plDir.value) {
        console.log('✓ Post-processing achieved perfect match');
      } else {
        console.log('⚠ Post-processing did not improve precision');
      }
    }
  } else {
    console.log('✗ Processed file does not exist');
  }
} catch (error) {
  console.error('Error:', error.message);
}
