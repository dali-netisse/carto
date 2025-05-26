import fs from 'fs';
import path from 'path';
import assert from 'assert'; // Using Node.js built-in assert module
import { runConverter } from '../src/converter.js'; // Adjust path as necessary

const SVG_INPUT_PATH = 'laposte-map-data/src/BRU/Brune R+7.svg';
const REFERENCE_JSON_PATH = 'output/BRU-7.json';
const TOLERANCE = 0.1; // Start with a slightly larger tolerance for numeric comparisons

/**
 * Loads and parses a JSON file.
 * @param {string} filePath - Path to the JSON file.
 * @returns {object} The parsed JSON object.
 */
function loadJsonFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error reading or parsing JSON file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Compares two numbers within a given tolerance.
 * @param {number} num1
 * @param {number} num2
 * @param {number} tolerance
 * @returns {boolean} True if numbers are within tolerance, false otherwise.
 */
function compareNumeric(num1, num2, tolerance) {
  if (typeof num1 !== 'number' || typeof num2 !== 'number') return false;
  return Math.abs(num1 - num2) <= tolerance;
}

/**
 * Deeply compares two JavaScript objects/arrays.
 * @param {*} obj1 - First object/array.
 * @param {*} obj2 - Second object/array.
 * @param {number} tolerance - Tolerance for numeric comparisons.
 * @param {string[]} currentPath - Array to track the path for error reporting.
 * @returns {string[]} An array of strings describing differences. Empty if they match.
 */
function deepCompare(obj1, obj2, tolerance, currentPath = []) {
  const differences = [];

  if (typeof obj1 !== typeof obj2) {
    differences.push(`Type mismatch at path '${currentPath.join('.')}': ${typeof obj1} vs ${typeof obj2}`);
    return differences;
  }

  if (obj1 === null || obj2 === null) {
    if (obj1 !== obj2) {
      differences.push(`Null mismatch at path '${currentPath.join('.')}': ${obj1} vs ${obj2}`);
    }
    return differences;
  }

  if (typeof obj1 === 'number') {
    if (!compareNumeric(obj1, obj2, tolerance)) {
      differences.push(`Numeric mismatch at path '${currentPath.join('.')}': ${obj1} vs ${obj2}`);
    }
  } else if (typeof obj1 === 'string' || typeof obj1 === 'boolean') {
    if (obj1 !== obj2) {
      differences.push(`Value mismatch at path '${currentPath.join('.')}': "${obj1}" vs "${obj2}"`);
    }
  } else if (Array.isArray(obj1)) {
    if (obj1.length !== obj2.length) {
      differences.push(`Array length mismatch at path '${currentPath.join('.')}': ${obj1.length} vs ${obj2.length}`);
    } else {
      // Assuming order matters for arrays in this JSON structure
      for (let i = 0; i < obj1.length; i++) {
        differences.push(...deepCompare(obj1[i], obj2[i], tolerance, [...currentPath, `[${i}]`]));
      }
    }
  } else if (typeof obj1 === 'object') {
    const keys1 = Object.keys(obj1).sort();
    const keys2 = Object.keys(obj2).sort();

    if (keys1.join(',') !== keys2.join(',')) {
      const missingInObj2 = keys1.filter(k => !keys2.includes(k));
      const missingInObj1 = keys2.filter(k => !keys1.includes(k));
      if (missingInObj2.length) differences.push(`Keys missing in second object at path '${currentPath.join('.')}': ${missingInObj2.join(', ')}`);
      if (missingInObj1.length) differences.push(`Keys missing in first object at path '${currentPath.join('.')}': ${missingInObj1.join(', ')}`);
    } else {
      for (const key of keys1) {
        differences.push(...deepCompare(obj1[key], obj2[key], tolerance, [...currentPath, key]));
      }
    }
  }
  return differences;
}


// Main Test Block
async function runAllTests() {
  console.log("--- Starting Converter Tests ---");

  let referenceOutput;
  try {
    referenceOutput = loadJsonFile(REFERENCE_JSON_PATH);
    console.log("Reference JSON loaded successfully.");
  } catch (e) {
    console.error("Failed to load reference JSON. Halting tests.", e);
    process.exitCode = 1;
    return;
  }

  let jsOutput;
  try {
    // Provide paths for config files relative to where the test is run from (project root)
    // or ensure runConverter can find them using default paths if not provided.
    // The runConverter defaults should work if test is run from project root.
    jsOutput = await runConverter({
        file: SVG_INPUT_PATH,
        // site: 'BRU', // Optional: Let converter parse from filename or use this to override
        // floor: '7',   // Optional
        // sitesMapPath: 'laposte-map-data/src/sites-map', // Default
        // idFixesPath: 'data/idFixes.json', // Default
        // calageDataPath: 'data/calageData.json', // Default
        // meetingRoomsMapPath: `laposte-map-data/src/BRU/salles-name-to-id` // Example for BRU
    });
    console.log("JavaScript converter executed successfully.");
  } catch (e) {
    console.error("JavaScript converter execution failed:", e);
    process.exitCode = 1;
    return;
  }

  // --- Basic Structural Tests ---
  console.log("\n--- Running Basic Structural Tests ---");
  let structuralTestFailed = false;
  try {
    assert.deepStrictEqual(Object.keys(jsOutput).sort(), Object.keys(referenceOutput).sort(), "Top-level keys do not match.");
    console.log("  PASS: Top-level keys match.");

    for (const key of ['background', 'decor', 'itineraries']) {
      assert.strictEqual(jsOutput[key]?.length, referenceOutput[key]?.length, `${key} element count mismatch.`);
      console.log(`  PASS: ${key} element count matches (${referenceOutput[key]?.length}).`);
    }
    
    assert.strictEqual(Object.keys(jsOutput.pois || {}).length, Object.keys(referenceOutput.pois || {}).length, "Number of POI classes mismatch.");
    console.log(`  PASS: Number of POI classes matches (${Object.keys(referenceOutput.pois || {}).length}).`);

    assert.strictEqual(Object.keys(jsOutput.desks || {}).length, Object.keys(referenceOutput.desks || {}).length, "Number of Desk main classes mismatch.");
    console.log(`  PASS: Number of Desk main classes matches (${Object.keys(referenceOutput.desks || {}).length}).`);
    
    assert.strictEqual(Object.keys(jsOutput.furniture || {}).length, Object.keys(referenceOutput.furniture || {}).length, "Number of Furniture main classes mismatch.");
    console.log(`  PASS: Number of Furniture main classes matches (${Object.keys(referenceOutput.furniture || {}).length}).`);

  } catch (error) {
    console.error("  FAIL: Basic structural test failed:", error.message);
    structuralTestFailed = true;
    process.exitCode = 1; // Indicate test failure
  }

  if (structuralTestFailed) {
    console.error("Halting further tests due to structural mismatch.");
    return;
  }


  // --- Deep Comparison Test ---
  console.log(`\n--- Running Deep Comparison (Tolerance: ${TOLERANCE}) ---`);
  const differences = deepCompare(jsOutput, referenceOutput, TOLERANCE);

  if (differences.length === 0) {
    console.log("  PASS: JSON objects match within tolerance.");
    console.log("\nConverter tests passed successfully!");
  } else {
    console.error(`  FAIL: JSON objects do not match. Differences found: ${differences.length}`);
    differences.slice(0, 20).forEach(diff => console.error(`    - ${diff}`)); // Print first 20 diffs
    if (differences.length > 20) {
        console.error(`    ... and ${differences.length - 20} more differences.`);
    }
    process.exitCode = 1; // Indicate test failure
  }
}

// Run the tests
// This structure is for running with `node test/testConverter.js`
// If using Node's built-in test runner (`node --test`), test cases would be defined with `test()`.
// For now, this direct execution is fine.
(async () => {
    try {
        await runAllTests();
    } catch (e) {
        console.error("An unexpected error occurred during testing:", e);
        process.exitCode = 1;
    }
})();
