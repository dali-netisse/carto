#!/usr/bin/env node

import fs from 'fs';

console.log('Testing direction precision...');

const jsData = JSON.parse(fs.readFileSync('js-output/LYS-5.json', 'utf8'));
const plData = JSON.parse(fs.readFileSync('pl-output/LYS-5.json', 'utf8'));

// Find first furniture item with direction differences
function findDiff(js, pl, path = '') {
  if (typeof js === 'object' && js !== null && typeof pl === 'object' && pl !== null) {
    for (const key in js) {
      if (key === 'direction' && js[key] !== pl[key]) {
        console.log('Direction difference at path:', path + '.' + key);
        console.log('JS value:', js[key]);  
        console.log('Perl value:', pl[key]);
        console.log('Difference:', js[key] - pl[key]);
        return true;
      }
      if (js[key] && pl[key] && typeof js[key] === 'object') {
        if (findDiff(js[key], pl[key], path + '.' + key)) return true;
      }
    }
  }
  return false;
}

findDiff(jsData, plData);
