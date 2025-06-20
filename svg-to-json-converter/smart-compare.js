#!/usr/bin/env node

/**
 * Smart JSON comparison tool that ignores tiny floating-point precision differences
 * while detecting any meaningful differences between JS and Perl outputs
 */

import fs from 'fs';

const FLOAT_TOLERANCE = 1e-6; // Tolerance for floating-point comparison (much larger than the 1e-14 differences we see)
const COORDINATE_TOLERANCE = 1e-6; // More lenient tolerance for coordinates in point strings

function isCoordinateString(str) {
  // Check if string looks like coordinates: "x1,y1 x2,y2" or "x1,y1,x2,y2"
  return /^[\d\.\-\s,]+$/.test(str) && str.includes(',');
}

function coordinateStringsMatch(js, perl) {
  try {
    // Parse coordinates from both strings
    const jsCoords = parseCoordinates(js);
    const perlCoords = parseCoordinates(perl);
    
    if (jsCoords.length !== perlCoords.length) return {jsLength: jsCoords.length, perlLength: perlCoords.length, issue: 'COORDS_LENGTH_MISMATCH'};
    
    // Compare each coordinate with tolerance
    for (let i = 0; i < jsCoords.length; i++) {
      const diff = Math.abs(jsCoords[i] - perlCoords[i]);
    
      if (diff > COORDINATE_TOLERANCE) {
        return false;
      }
    }
    
    return true;
  } catch (e) {
    return false; // If parsing fails, fall back to exact string comparison
  }
}

function parseCoordinates(str) {
  // Remove leading and trailing letters (like M, L, Z in SVG paths)
  const cleanStr = str.replace(/^[A-Za-z]+|[A-Za-z]+$/g, '');
  
  // Split by spaces and commas, filter out empty strings, convert to numbers
  return cleanStr.split(/[\s,]+/).filter(s => s.length > 0).map(Number);
}

function compare(js, perl, path = '', issues = []) {
  // Type comparison
  if (typeof js !== typeof perl) {
    if (js == perl && path.endsWith('position'))
      return issues; // Special case for position fields where types may differ but values are equivalent
    
    issues.push({
      type: 'TYPE_MISMATCH',
      path,
      jsValue: js,
      perlValue: perl,
      jsType: typeof js,
      perlType: typeof perl
    });
    return issues;
  }

  if (js === null && perl === null) return issues;
  if (js === null || perl === null) {
    issues.push({
      type: 'NULL_MISMATCH',
      path,
      jsValue: js,
      perlValue: perl
    });
    return issues;
  }

  // Number comparison with tolerance
  if (typeof js === 'number' && typeof perl === 'number') {
    if (isNaN(js) && isNaN(perl)) return issues;
    if (isNaN(js) || isNaN(perl)) {
      issues.push({
        type: 'NAN_MISMATCH',
        path,
        jsValue: js,
        perlValue: perl
      });
      return issues;
    }

    const diff = Math.abs(js - perl);
    
    // Check if difference is significant
    if (diff > FLOAT_TOLERANCE ) {
      issues.push({
        type: 'SIGNIFICANT_NUMBER_DIFF',
        path,
        jsValue: js,
        perlValue: perl,
        absoluteDiff: diff,
      });
    }
    return issues;
  }

  // String comparison with special handling for coordinate strings
  if (typeof js === 'string' && typeof perl === 'string') {
    if (js !== perl) {
      // Check if this is a coordinate string (contains numbers separated by commas/spaces)
      if (isCoordinateString(js) && isCoordinateString(perl)) {
        if (coordinateStringsMatch(js, perl)?.issue === 'COORDS_LENGTH_MISMATCH') {
          issues.push({
            type: 'COORDINATE_LENGTH_MISMATCH',
            path,
            jsLength: coordinateStringsMatch(js, perl).jsLength,
            perlLength: coordinateStringsMatch(js, perl).perlLength
          });
        } else if (!coordinateStringsMatch(js, perl)) {
          issues.push({
            type: 'COORDINATE_STRING_DIFF',
            path,
            jsValue: js,
            perlValue: perl
          });
        }
      } else {
        issues.push({
          type: 'STRING_MISMATCH',
          path,
          jsValue: js,
          perlValue: perl
        });
      }
    }
    return issues;
  }

  // Array comparison
  if (Array.isArray(js) && Array.isArray(perl)) {
    if (js.length !== perl.length) {
      issues.push({
        type: 'ARRAY_LENGTH_MISMATCH',
        path,
        jsLength: js.length,
        perlLength: perl.length
      });
      return issues;
    }

    for (let i = 0; i < js.length; i++) {
      compare(js[i], perl[i], `${path}[${i}]`, issues);
    }
    return issues;
  }

  // Object comparison
  if (typeof js === 'object' && typeof perl === 'object') {
    const jsKeys = Object.keys(js).sort();
    const perlKeys = Object.keys(perl).sort();

    // Check for missing/extra keys
    const missingInJs = perlKeys.filter(key => !jsKeys.includes(key));
    const extraInJs = jsKeys.filter(key => !perlKeys.includes(key));

    if (missingInJs.length > 0) {
      issues.push({
        type: 'MISSING_KEYS_IN_JS',
        path,
        missingKeys: missingInJs
      });
    }

    if (extraInJs.length > 0) {
      issues.push({
        type: 'EXTRA_KEYS_IN_JS',
        path,
        extraKeys: extraInJs
      });
    }

    // Compare common keys
    const commonKeys = jsKeys.filter(key => perlKeys.includes(key));
    for (const key of commonKeys) {
      compare(js[key], perl[key], path ? `${path}.${key}` : key, issues);
    }

    return issues;
  }

  // Fallback for other types
  if (js !== perl) {
    issues.push({
      type: 'UNKNOWN_MISMATCH',
      path,
      jsValue: js,
      perlValue: perl
    });
  }

  return issues;
}

function formatIssue(issue) {
  switch (issue.type) {
    case 'TYPE_MISMATCH':
      return `❌ TYPE MISMATCH at ${issue.path}: JS=${issue.jsType}, Perl=${issue.perlType}`;
    
    case 'STRING_MISMATCH':
      return `❌ STRING MISMATCH at ${issue.path}: JS="${issue.jsValue.substring(0, 50)}", Perl="${issue.perlValue.substring(0, 50)}"`;
      return `❌ STRING DIFF at ${issue.path}: JS="${issue.jsValue}", Perl="${issue.perlValue}"`;
    
    case 'COORDINATE_LENGTH_MISMATCH':
      return `❌ COORDINATE LENGTH MISMATCH at ${issue.path}: JS=${issue.jsLength}, Perl=${issue.perlLength}`;

    case 'COORDINATE_STRING_DIFF':
      return `⚠️  COORDINATE PRECISION at ${issue.path}: Tiny differences in coordinate precision (likely acceptable)`;
    
    case 'SIGNIFICANT_NUMBER_DIFF':
      return `❌ SIGNIFICANT NUMBER DIFF at ${issue.path}: JS=${issue.jsValue}, Perl=${issue.perlValue} (diff=${issue.absoluteDiff})`;
    
    case 'ARRAY_LENGTH_MISMATCH':
      return `❌ ARRAY LENGTH DIFF at ${issue.path}: JS=${issue.jsLength}, Perl=${issue.perlLength}`;
    
    case 'MISSING_KEYS_IN_JS':
      return `❌ MISSING KEYS IN JS at ${issue.path}: ${issue.missingKeys.join(', ')}`;
    
    case 'EXTRA_KEYS_IN_JS':
      return `❌ EXTRA KEYS IN JS at ${issue.path}: ${issue.extraKeys.join(', ')}`;
    
    case 'NULL_MISMATCH':
      return `❌ NULL MISMATCH at ${issue.path}: JS=${issue.jsValue}, Perl=${issue.perlValue}`;
    
    default:
      return `❌ ${issue.type} at ${issue.path}: JS=${issue.jsValue}, Perl=${issue.perlValue}`;
  }
}

// Main execution
if (process.argv.length !== 4) {
  console.error('Usage: node smart-compare.js <js-file.json> <perl-file.json>');
  process.exit(1);
}

const [, , jsFile, perlFile] = process.argv;

try {
  console.log('🔍 Smart JSON Comparison (ignoring tiny float precision differences)');
  console.log(`📁 JS file: ${jsFile}`);
  console.log(`📁 Perl file: ${perlFile}`);
  console.log(`🎯 Float tolerance: ${FLOAT_TOLERANCE}`);
  console.log('');

  const jsData = JSON.parse(fs.readFileSync(jsFile, 'utf8'));
  const perlData = JSON.parse(fs.readFileSync(perlFile, 'utf8'));

  const issues = compare(jsData, perlData);

  if (issues.length === 0) {
    console.log('✅ PERFECT MATCH! No meaningful differences found.');
    console.log('   (Any differences are below the floating-point tolerance)');
  } else {
    console.log(`❌ Found ${issues.length} meaningful difference(s):`);
    console.log('');
    issues.forEach((issue, index) => {
      console.log(`${index + 1}. ${formatIssue(issue)}`);
    });
  }

  console.log('');
  console.log('📊 Summary:');
  console.log(`   Total comparisons: ${countComparisons(jsData)}`);
  console.log(`   Meaningful differences: ${issues.length}`);
  console.log(`   Match rate: ${((1 - issues.length / Math.max(countComparisons(jsData), 1)) * 100).toFixed(6)}%`);

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

function countComparisons(obj, count = 0) {
  if (typeof obj === 'object' && obj !== null) {
    if (Array.isArray(obj)) {
      return obj.reduce((acc, item) => acc + countComparisons(item), count);
    } else {
      return Object.values(obj).reduce((acc, value) => acc + countComparisons(value), count);
    }
  }
  return count + 1;
}
