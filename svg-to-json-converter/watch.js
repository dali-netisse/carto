#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const chokidar = require("chokidar");
const { execSync } = require("child_process");
const glob = require("glob");

// Define directories to monitor with their destination settings
const dirs = {
  "laposte-map-data/src/BRU": { dests: ["v3"] },
  "laposte-map-data/src/LYS": { dests: ["v3"] },
  "laposte-map-data/src/STR": { dests: ["v3"] },
  "laposte-map-data/src/*-*": { dests: ["v3"] },
  "mapdata-*/src": { dests: ["v3"] },
};

// Terminal colors
const reverse = "\x1b[7;32m";
const normal = "\x1b[m";
console.log(`${reverse}   =====   Watching for changes...${normal}   =====   `);
// Set to track if changes were detected in the current scan
let changeDetected = false;

/**
 * Process an SVG file with the converter for all specified destinations
 * @param {string} filename - Path to the SVG file
 * @param {object} actions - Object containing destination info
 */
function doActions(filename, actions) {
  // Skip hidden files and non-SVG files
  console.log("Processing:", filename);
  if (
    path.basename(filename).startsWith(".") ||
    !filename.toLowerCase().endsWith(".svg")
  ) {
    console.error(`Ignoring ${filename}`);
    return;
  }

  changeDetected = true;
  console.error(
    `${reverse}   =====   Processing ${filename}${normal}   =====   `
  );

  for (const dest of actions.dests) {
    try {
      execSync(
        `bash -c 'map-converter/svg-to-json-converter.pl -d "borne-${dest}/public/data" "${filename}"'`
      );
    } catch (err) {
      console.error(`Error processing ${filename} for ${dest}:`, err.message);
    }
  }

  console.error("\n\n");
}

/**
 * Setup watchers for all directories specified in the dirs object
 */
function setupWatchers() {
  // Create a new watcher instance
  const watcher = chokidar.watch([], {
    persistent: true, // Keep the watcher running
    ignoreInitial: false, // Trigger events for existing files
    ignored: (filePath) => {
      const basename = path.basename(filePath);
      return (
        basename.startsWith(".") ||
        (fs.existsSync(filePath) &&
          fs.lstatSync(filePath).isFile() &&
          !filePath.toLowerCase().endsWith(".svg"))
      );
    }, // Ignore hidden files and non-SVG filesA
    awaitWriteFinish: {
      stabilityThreshold: 500, // Wait for 500ms after the last change
      pollInterval: 100, // Check every 100ms
    },
  });

  // Handle file or directory additions and changes
  watcher
    .on("add", (filePath) => processFile(filePath)) // Process added files
    .on("change", (filePath) => processFile(filePath)) // Process changed files
    .on("addDir", (dirPath) => {
      // No specific action needed for directory addition
      // The watcher will automatically pick up new files in the directory
      console.error(`Directory ${dirPath} has been added to watch list`);
    });

  // Add directories from our configuration to the watcher
  Object.keys(dirs).forEach((dirPattern) => {
    const actions = dirs[dirPattern];

    // Handle glob patterns
    const matches = glob.sync(dirPattern);

    matches.forEach((match) => {
      console.error(`Monitoring ${match}`);
      watcher.add(match);

      // For initial processing of files
      if (fs.existsSync(match) && fs.lstatSync(match).isDirectory()) {
        processDirectory(match, actions);
      } else if (fs.existsSync(match)) {
        doActions(match, actions);
      }
    });
  });

  /**
   * Process a file if it matches our criteria
   * @param {string} filePath - Path to the file
   */
  function processFile(filePath) {
    if (
      path.basename(filePath).startsWith(".") ||
      !filePath.toLowerCase().endsWith(".svg")
    ) {
      return;
    }

    // Find which directory configuration applies to this file
    for (const dirPattern of Object.keys(dirs)) {
      const actions = dirs[dirPattern];

      // Check if file is under any of the monitored directory patterns
      const matches = glob.sync(dirPattern);
      for (const match of matches) {
        if (filePath.startsWith(match) || filePath === match) {
          doActions(filePath, actions);
          break;
        }
      }
    }
  }

  /**
   * Process all existing files in a directory
   * @param {string} dirPath - Directory to process
   * @param {object} actions - Configuration for this directory
   */
  function processDirectory(dirPath, actions) {
    fs.readdirSync(dirPath).forEach((file) => {
      const fullPath = path.join(dirPath, file);

      if (file.startsWith(".")) return;

      if (fs.lstatSync(fullPath).isDirectory()) {
        processDirectory(fullPath, actions);
      } else if (fullPath.toLowerCase().endsWith(".svg")) {
        doActions(fullPath, actions);
      }
    });
  }
}

// Setup the watchers
setupWatchers();

// Main watching loop
setInterval(() => {
  if (changeDetected) {
    try {
      const versionPath = "borne-v3/public/version.json";
      fs.writeFileSync(
        versionPath,
        JSON.stringify({ version: Math.floor(Date.now() / 1000) })
      );
      console.error(`Updated ${versionPath}`);
    } catch (err) {
      console.error("Can't open version.json:", err.message);
    }

    changeDetected = false;
  }
}, 1000);
