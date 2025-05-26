# Perl Script Documentation

## Overview

*   **Script Name:** `svg-to-json-converter.pl`
*   **Purpose:** Converts SVG map files (editable in AI or Inkscape) into JSON format for map display libraries.
*   **Key functionalities:** Handles different coordinate systems via "Calage" rectangle, flattens transforms, cleans polygon points, simplifies objects, identifies and processes various map elements (background, decor, POIs, itineraries, furniture).

## Command-Line Usage

*   **Basic syntax:** `perl svg-to-json-converter.pl [options] <input_svg_file_path>`
*   **Options:**
    *   `-d <dir>`: Specify destination directory for JSON output. Defaults to `../../data` relative to the SVG file's directory.
    *   `-s <site_id>`: Override site ID (otherwise derived from filename and `sites-map`).

## Dependencies

*   `XML::LibXML` (for SVG parsing)
*   `JSON` (for JSON output)
*   `strict`, `utf8`, `Unicode::Normalize`, `Math::Trig`, `Getopt::Std`, `File::Basename`, `Data::Dumper` (standard Perl modules)

## Input SVG Structure and Interpretation

*   The script expects specific group IDs (`Calage`, `Contour`, `Decor`, `Lignes_de_couloir`, `Salles`/`Pièces`, `Mobilier`) or `inkscape:label` attributes for these groups.
*   Key attributes used: `id`, `transform`, `d`, `points`, `inkscape:label`, `data-name`.
*   The "Calage" rectangle (`<rect>` usually within a `<g id="Calage">`) is important for coordinate normalization.

## Auxiliary Data Files

*   **`salles-name-to-id`:**
    *   Location: Same directory as the input SVG file.
    *   Format: Tab-separated values (`normalized_room_name	room_id`).
    *   Purpose: Maps cleaned room names to specific IDs.
*   **`sites-map`:**
    *   Location: Expected at `../sites-map` relative to the input SVG's directory.
    *   Format: Tab-separated values (`normalized_site_name_pattern	site_id_template`).
    *   Purpose: Maps cleaned site name (from SVG filename) to a site ID, potentially with placeholders.

## Hardcoded Data & Special Logic

*   The script contains significant hardcoded data:
    *   `%calage`: A hash mapping site IDs to specific calibration rectangle coordinates if the "Calage" SVG element isn't found or used.
    *   `%id_fixes`: A hash for correcting or overriding IDs for specific elements based on site and floor.
    *   Specific transformation fallbacks for certain site/floor combinations if "Calage" is not processed.
*   Complex regex patterns are used for parsing element IDs and `inkscape:label`s to determine types and properties.

## Output JSON Structure

*   Root object: `{}`
*   Key sections:
    *   `background`: Array of geometry objects.
    *   `decor`: Array of geometry objects.
    *   `itineraries`: Array of geometry objects (lines, polylines).
    *   `pois`: Object mapping POI types (e.g., `office`, `meeting-room`) to objects, where each key is a POI ID and value is the geometry object.
    *   `desks`: Object, typically with a `desks` sub-object, containing desk group information.
    *   `furniture`: Object containing other furniture items.
*   Common properties for geometry objects: `type` (rect, polygon, path, etc.), `id`, `points`, `d`, coordinates (`x`, `y`, `width`, `height`, etc.).
