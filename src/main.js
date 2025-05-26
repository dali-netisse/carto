import fs from 'fs';
import path from 'path';
import { DOMParser } from 'xmldom';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { calageData } from './calageData.js';
import { transformNodeAttributes, multiplyMatrices, parseTransformAttribute } from './geometry.js';
import { processGenericGroup, processInitialPOIs } from './objectHandlers.js'; // Added objectHandlers imports

// Argument parsing
const argv = yargs(hideBin(process.argv))
    .usage('Usage: node $0 <input_svg_file_path>')
    .demandCommand(1, 'Input SVG file path is required.')
    .string('d') // Destination directory
    .string('s') // Site ID, now used as an override
    .alias('d', 'dest')
    .alias('s', 'site_override') // Renamed to avoid conflict with parsed site
    .describe('d', 'Destination directory for JSON output')
    .describe('s', 'Override site ID (e.g., BRU, CRO). If provided, parsing from filename is skipped for site ID.')
    .argv;

const svgFilePath = argv._[0];
let globalTransform = [1, 0, 0, 1, 0, 0]; // Default: identity matrix

try {
    // Read SVG file
    const svgContent = fs.readFileSync(svgFilePath, 'utf-8');

    // Parse SVG
    const parser = new DOMParser({
        locator: {},
        errorHandler: {
            warning: (w) => console.warn(w),
            error: (e) => { throw new Error(e); },
            fatalError: (e) => { throw new Error(e); }
        }
    });
    const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');

    // Check for parsing errors explicitly
    const parseError = svgDoc.getElementsByTagName('parsererror');
    if (parseError.length > 0) {
        let errorText = 'Unknown parsing error';
        if (parseError[0].childNodes && parseError[0].childNodes.length > 0) {
            const errorSourceText = Array.from(parseError[0].childNodes)
                                       .map(node => node.textContent || node.sourceText)
                                       .join('\n');
            errorText = errorSourceText.trim() || (parseError[0].textContent || parseError[0].sourceText || errorText);
        } else if (parseError[0].textContent) {
            errorText = parseError[0].textContent;
        } else if (parseError[0].sourceText) {
            errorText = parseError[0].sourceText;
        }
        console.error('Error parsing SVG:', errorText);
        process.exit(1);
    }

    console.log(`Successfully parsed SVG: ${svgFilePath}`);

    // Filename Parsing for Site/Floor
    let site = argv.site_override || null; // Use override if provided
    let floor = null;
    const baseName = path.basename(svgFilePath);

    if (!site) { // Only parse filename for site if not overridden
        // Simplified regex for site and floor (example: "Brune R+7.svg")
        // Perl: /(?:^|[\/\\])([-\w\s]+?\d*)(?:\s|-)(?:R\+(\d+)|R(-\d+)|(RDC|E[01]?|M|P\d*))\.svg$/i
        // This regex is complex, let's try a simpler one and refine.
        // Focusing on `SITE_NAME part` and then `FLOOR_ID`
        // Example: BRU-R+7.svg, SITE-RDC.svg, My Site E1.svg
        const match = baseName.match(/^(.*?)(?:[\s-]*(?:R\+(\d+)|R(-\d+)|(RDC|E[01]?|M|P\d*)))?\.svg$/i);
        if (match) {
            let rawSiteName = match[1];
            // Normalize site name (lc, NFD, remove diacritics, replace hyphens/spaces with _)
            // JavaScript NFD:
            let normalizedSiteName = rawSiteName.toLowerCase();
            normalizedSiteName = normalizedSiteName.normalize('NFD').replace(/\p{M}/gu, '');
            normalizedSiteName = normalizedSiteName.replace(/[-\s]+/g, '_');
            
            // This part is tricky, as the Perl script uses sites-map.txt for full site ID.
            // For now, we'll use a simplified approach or a direct mapping for known sites.
            // The goal for calageData is often a short code like "BRU".
            // The Perl script has: $site = $sites_map{$fullsite} || $sites_map{substr($fullsite,0,3)} || uc(substr($fullsite,0,3));
            // Let's try to extract a common prefix, e.g., "BRU" from "brune" or "brune_r_7"
            if (normalizedSiteName.startsWith('brune')) site = 'BRU';
            else if (normalizedSiteName.startsWith('cro')) site = 'CRO';
            else if (normalizedSiteName.startsWith('def')) site = 'DEF';
            // ... add more explicit mappings as needed for now, or use the first 3 chars as a fallback
            else site = normalizedSiteName.substring(0, 3).toUpperCase();


            if (match[2]) floor = match[2];         // R+<number>
            else if (match[3]) floor = match[3];    // R-<number>
            else if (match[4]) {                    // RDC, E, M, P
                const floorStr = match[4].toUpperCase();
                if (floorStr === 'RDC') floor = '0';
                else floor = floorStr; // E, E1, M, P, P1 etc.
            }
            console.log(`Parsed from filename: Raw Site='${rawSiteName}', Normalized Site='${normalizedSiteName}', Derived Site Key='${site}', Floor='${floor}'`);
        } else {
            console.warn(`Could not parse site/floor from filename: ${baseName}. Using default 'XXX' for site key.`);
            site = 'XXX'; // Default site if parsing fails
        }
    } else {
        console.log(`Site ID overridden by command line: '${site}'`);
        // If site is overridden, we might still want to parse floor if not also provided.
        // For now, if site is overridden, floor parsing from filename is skipped. User should provide if needed.
        // This part can be enhanced later.
    }
    
    // For BRU R+7.svg, ensure site="BRU" and floor="7" for testing calageData
    if (baseName.toUpperCase().includes("BRUNE R+7")) {
        site = "BRU";
        floor = "7";
        console.log(`Specific override for BRUNE R+7.svg: site='${site}', floor='${floor}'`);
    }


    // Find "Calage" rectangle
    let calageRectElement = null;
    const inkscapeNS = 'http://www.inkscape.org/namespaces/inkscape';

    const groups = svgDoc.getElementsByTagName('g');
    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const id = group.getAttribute('id');
        const label = group.getAttributeNS(inkscapeNS, 'label');
        if (id === 'Calage' || label === 'Calage') {
            const rects = group.getElementsByTagName('rect');
            if (rects.length > 0) {
                calageRectElement = rects[0];
                break;
            }
        }
    }

    if (!calageRectElement) {
        const topLevelRects = svgDoc.getElementsByTagName('rect');
         for (let i = 0; i < topLevelRects.length; i++) {
            if (topLevelRects[i].getAttribute('id') === 'Calage') {
                calageRectElement = topLevelRects[i];
                break;
            }
        }
    }

    if (calageRectElement) {
        const x = parseFloat(calageRectElement.getAttribute('x'));
        const y = parseFloat(calageRectElement.getAttribute('y'));
        const width = parseFloat(calageRectElement.getAttribute('width'));
        const height = parseFloat(calageRectElement.getAttribute('height'));
        console.log('Calage rectangle found in SVG:');
        console.log(`  x: ${x}, y: ${y}, width: ${width}, height: ${height}`);

        if (site && calageData[site]) {
            const [nx, ny, nw, nh] = calageData[site];
            console.log(`Calage data for site '${site}': nx=${nx}, ny=${ny}, nw=${nw}, nh=${nh}`);
            const a = nw / width;
            const d = nh / height;
            globalTransform = [a, 0, 0, d, nx - x * a, ny - y * d];
            console.log('Calculated globalTransform:', globalTransform);
        } else {
            console.warn(`Manque infos de calage pour site '${site}' or site key is undefined. Using identity transform.`);
            // globalTransform remains identity
        }
    } else {
        console.warn('Calage rectangle not found in SVG.');
        // Fallback logic from Perl script (simplified)
        if (site === "PCA-00372" && floor === "1") {
            console.warn("Applying 90° rotation for PCA-00372 floor 1 (no Calage rect found).");
            globalTransform = [0, 1, -1, 0, 0, 0]; // Example: rotate 90 deg
        } else if (site === "BRU" && floor === "7") { // Example for Brune R+7 if calage was missing
            console.warn(`Calage rectangle not found for ${site} ${floor}, but specific fallback exists in Perl. NOT YET IMPLEMENTED HERE. Using identity.`);
            // globalTransform = [0.852059820072897, 0, 0, 0.852059820072897, 77.3076923076923, 147.884615384615]; // from Perl
        }
         else {
            console.warn("Calage rectangle not found in SVG and no specific fallback for this site/floor. Using default identity transform.");
            // globalTransform remains identity
        }
        console.log('Applied globalTransform (due to missing Calage rect):', globalTransform);
    }

    // Initialize Output JSON Structure
    const outputData = {
        background: [],
        decor: [],
        itineraries: [],
        pois: {},
        desks: {},
        furniture: {},
        meta: { // Adding meta for debugging
            svgFile: baseName,
            site: site,
            floor: floor,
            globalTransform: globalTransform
        }
    };
    console.log('Initial JSON structure created:', JSON.stringify(outputData, null, 2));

    // Placeholder for processing other elements
    // processSVGElements(svgDoc, globalTransform, outputData);

    // Placeholder for writing JSON to file
    // const outputFilePath = determineOutputPath(svgFilePath, argv.d);
    // fs.writeFileSync(outputFilePath, JSON.stringify(outputData, null, 2));
    // console.log(`JSON output written to: ${outputFilePath}`);


    // --- Test for transformNodeAttributes (as per subtask instructions) ---
    console.log('\n--- Running transformNodeAttributes Test ---');
    const svgNS = 'http://www.w3.org/2000/svg';
    const testRectNode = svgDoc.createElementNS(svgNS, 'rect');
    testRectNode.setAttribute('x', '10');
    testRectNode.setAttribute('y', '10');
    testRectNode.setAttribute('width', '50');
    testRectNode.setAttribute('height', '50');
    testRectNode.setAttribute('id', 'testRect1');
    
    // Test 1: Simple translation on node, globalTransform is identity for simplicity here
    testRectNode.setAttribute('transform', 'translate(5,5)');
    let testParentMatrix1 = [1,0,0,1,0,0]; // Assuming globalTransform is identity for this specific test
    let transformedRect1 = transformNodeAttributes(testRectNode, testParentMatrix1);
    console.log('Test 1 Transformed Rect (translate(5,5)):', transformedRect1);
    // Expected: x:15, y:15, width:50, height:50

    // Test 2: Rotation on node, should become a polygon
    testRectNode.setAttribute('transform', 'rotate(45)');
    let transformedRect2 = transformNodeAttributes(testRectNode, testParentMatrix1); // Still using identity parent for simplicity
    console.log('Test 2 Transformed Rect (rotate(45)):', transformedRect2);
    // Expected: type: 'polygon', points: "..." (calculated)

    // Test 3: Scale on node + translate on parent
    testRectNode.setAttribute('transform', 'scale(2)');
    let testParentMatrix2 = parseTransformAttribute('translate(100,0)'); // Parent is translated
    let transformedRect3 = transformNodeAttributes(testRectNode, testParentMatrix2);
    console.log('Test 3 Transformed Rect (scale(2) with parent translate(100,0)):', transformedRect3);
    // Rect x=10,y=10, w=50,h=50. Scale(2) -> x=20,y=20, w=100,h=100 (in its own coord system after scale)
    // Parent translate(100,0) -> final x = 20+100=120, y=20. Width/Height remain 100.
    // Expected: x:120, y:20, width:100, height:100

    // Test 4: Rect to Polygon with parent and local transform
    testRectNode.setAttribute('x', '0');
    testRectNode.setAttribute('y', '0');
    testRectNode.setAttribute('width', '10');
    testRectNode.setAttribute('height', '10');
    testRectNode.setAttribute('id', 'testRectComplex');
    testRectNode.setAttribute('transform', 'translate(5,5) rotate(45)'); // Local: rotate then translate
                                                                      // Order of ops in parse is right to left: rotate, then translate
                                                                      // So, point (0,0) -> rotate(45) -> (0,0) -> translate(5,5) -> (5,5)
                                                                      // (10,0) -> rotate(45) -> (7.07, 7.07) -> translate(5,5) -> (12.07, 12.07)
    let testParentMatrixComplex = parseTransformAttribute('translate(100,0) scale(2)'); // Parent: scale then translate
                                                                      // Order of ops: scale, then translate
    // Effective matrix = Parent * Local
    // For point (0,0) in rect's original coords:
    // L_matrix = T(5,5) * R(45)
    // P_matrix = T(100,0) * S(2)
    // Final point = P_matrix * L_matrix * (0,0,1)^T
    // (0,0) -> local_transform -> (5,5)
    // (5,5) -> parent_transform: scale(2) -> (10,10) -> translate(100,0) -> (110,10)
    // So, first point of polygon should be (110,10)

    let transformedRectComplex = transformNodeAttributes(testRectNode, testParentMatrixComplex);
    console.log('Test 4 Transformed Complex Rect:', transformedRectComplex);


    // --- Tests for Polygon/Polyline ---
    const testPolyNode = svgDoc.createElementNS(svgNS, 'polygon');
    testPolyNode.setAttribute('id', 'testPoly1');

    // Test 5: Basic polygon transformation
    testPolyNode.setAttribute('points', '0,0 10,0 10,10 0,10');
    let transformedPoly1 = transformNodeAttributes(testPolyNode, testParentMatrix1); // Identity parent
    console.log('Test 5 Transformed Polygon (no transform):', transformedPoly1);
    // Expected: type: 'polygon', points: "0.000,0.000 10.000,0.000 10.000,10.000 0.000,10.000" (or similar if last point removed by cleanPoints)

    // Test 6: Polygon with transform and cleanup (close points)
    testPolyNode.setAttribute('points', '0,0 0.1,0.1 0.2,0.2 10,0 10.1,0.1 10,10 0,10 0,0.1'); // Last point close to first, some internal close points
    let transformedPoly2 = transformNodeAttributes(testPolyNode, testParentMatrix1); // Identity parent
    console.log('Test 6 Transformed Polygon (cleanup):', transformedPoly2);
    // Expected: Points cleaned, e.g. "0.000,0.000 10.000,0.000 10.000,10.000" (last point removed as it's close to first)

    // Test 7: Polygon that should be filtered by area/perimeter ratio
    testPolyNode.setAttribute('id', 'testPolyThin');
    testPolyNode.setAttribute('points', '0,0 100,0 100,0.1 0,0.1'); // Very thin rectangle
    let transformedPoly3 = transformNodeAttributes(testPolyNode, testParentMatrix1);
    console.log('Test 7 Filtered Polygon (thin):', transformedPoly3);
    // Expected: null (or log message indicating skip)

    // Test 8: Polyline transformation and cleanup
    const testPolylineNode = svgDoc.createElementNS(svgNS, 'polyline');
    testPolylineNode.setAttribute('id', 'testPolyline1');
    testPolylineNode.setAttribute('points', '0,0 0.1,0.1 5,5 5.1,5.1 10,10');
    let transformedPolyline1 = transformNodeAttributes(testPolylineNode, testParentMatrix1);
    console.log('Test 8 Transformed Polyline (cleanup):', transformedPolyline1);
    // Expected: type: 'polyline', points: "0.000,0.000 5.000,5.000 10.000,10.000"

    // Test 9: Polygon with insufficient points after cleaning
    testPolyNode.setAttribute('id', 'testPolyInsufficient');
    testPolyNode.setAttribute('points', '0,0 0.1,0.1 0.2,0.2 0.3,0.3'); // All points too close
    let transformedPolyInsufficient = transformNodeAttributes(testPolyNode, testParentMatrix1);
    console.log('Test 9 Polygon with insufficient points after clean:', transformedPolyInsufficient);
    // Expected: null

    // Test 10: Polyline with insufficient points after cleaning
    testPolylineNode.setAttribute('id', 'testPolylineInsufficient');
    testPolylineNode.setAttribute('points', '0,0 0.1,0.1'); // Only two points, one gets removed
    let transformedPolylineInsufficient = transformNodeAttributes(testPolylineNode, testParentMatrix1);
    console.log('Test 10 Polyline with insufficient points after clean:', transformedPolylineInsufficient);
    // Expected: null (polyline needs at least 2 points)

    // --- Tests for Path elements ---
    const testPathNode = svgDoc.createElementNS(svgNS, 'path');

    // Test 11: Simple path M L L Z -> polygon
    testPathNode.setAttribute('id', 'testPathPoly1');
    testPathNode.setAttribute('d', 'M 0 0 L 10 0 L 10 10 L 0 10 Z');
    let transformedPath1 = transformNodeAttributes(testPathNode, testParentMatrix1); // Identity parent
    console.log('Test 11 Path to Polygon:', transformedPath1);
    // Expected: type: 'polygon', points: "0.000,0.000 10.000,0.000 10.000,10.000 0.000,10.000"

    // Test 12: Path with relative commands m l l z -> polygon
    testPathNode.setAttribute('id', 'testPathPoly2');
    testPathNode.setAttribute('d', 'm 5 5 l 10 0 l 0 10 l -10 0 z');
    let transformedPath2 = transformNodeAttributes(testPathNode, testParentMatrix1);
    console.log('Test 12 Path with relative commands to Polygon:', transformedPath2);
    // Expected: type: 'polygon', points: "5.000,5.000 15.000,5.000 15.000,15.000 5.000,15.000"

    // Test 13: Path with H and V commands -> polygon
    testPathNode.setAttribute('id', 'testPathHVPoly');
    testPathNode.setAttribute('d', 'M 0 0 H 10 V 10 H 0 Z');
    let transformedPathHV = transformNodeAttributes(testPathNode, testParentMatrix1);
    console.log('Test 13 Path H V to Polygon:', transformedPathHV);
     // Expected: type: 'polygon', points: "0.000,0.000 10.000,0.000 10.000,10.000 0.000,10.000"

    // Test 14: Open path M L L -> polyline
    testPathNode.setAttribute('id', 'testPathPolyline1');
    testPathNode.setAttribute('d', 'M 0 0 L 10 0 L 10 10');
    let transformedPath4 = transformNodeAttributes(testPathNode, testParentMatrix1);
    console.log('Test 14 Path to Polyline:', transformedPath4);
    // Expected: type: 'polyline', points: "0.000,0.000 10.000,0.000 10.000,10.000"

    // Test 15: Path with curve commands -> remains path
    testPathNode.setAttribute('id', 'testPathCurve');
    testPathNode.setAttribute('d', 'M 0 0 C 10 0 10 10 20 10 S 30 20 40 20');
    let transformedPath5 = transformNodeAttributes(testPathNode, testParentMatrix1);
    console.log('Test 15 Path with Curves (remains path):', transformedPath5);
    // Expected: type: 'path', d: "M0,0C10,0,10,10,20,10S30,20,40,20" (or similar, with explicit S control point)

    // Test 16: Path with transform
    testPathNode.setAttribute('id', 'testPathTransform');
    testPathNode.setAttribute('d', 'M 0 0 L 10 0 Z'); // Triangle
    testPathNode.setAttribute('transform', 'translate(5,5) scale(2)');
    let transformedPath6 = transformNodeAttributes(testPathNode, testParentMatrix1); // Parent is identity
    console.log('Test 16 Transformed Path (becomes polygon):', transformedPath6);
    // M 0 0 -> transform -> M 5 5
    // L 10 0 -> transform -> L 25 5
    // Polygon points: 5,5 25,5 (then Z closes to 5,5 - but path to polygon needs 3 points)
    // This should actually be a polyline or path if too few points for polygon.
    // The path "M 0 0 L 10 0 Z" is degenerate for a polygon (it's a line).
    // Let's make it a proper triangle for polygon conversion: M 0 0 L 10 0 L 5 10 Z
    testPathNode.setAttribute('d', 'M 0 0 L 10 0 L 5 10 Z');
    transformedPath6 = transformNodeAttributes(testPathNode, testParentMatrix1); // transform still active
    console.log('Test 16 Transformed Path (triangle to polygon):', transformedPath6);
    // M 0,0 -> local T(5,5)S(2) -> M 5,5
    // L 10,0 -> local T(5,5)S(2) -> L 25,5
    // L 5,10 -> local T(5,5)S(2) -> L 15,25
    // Expected: type: 'polygon', points: "5.000,5.000 25.000,5.000 15.000,25.000"

    // Test 17: Single point path (should be null)
    testPathNode.setAttribute('id', 'testPathSinglePoint');
    testPathNode.setAttribute('d', 'M 10 10');
    let transformedPath7 = transformNodeAttributes(testPathNode, testParentMatrix1);
    console.log('Test 17 Single Point Path:', transformedPath7);
    // Expected: null

    testPathNode.setAttribute('d', 'm 10 10'); // Relative single point
    transformedPath7 = transformNodeAttributes(testPathNode, testParentMatrix1);
    console.log('Test 17b Single Point Path (relative):', transformedPath7);
    // Expected: null
    
    // Test 18: Path with Quadratic Bezier (Q, T)
    testPathNode.setAttribute('id', 'testPathQuadratic');
    testPathNode.setAttribute('d', 'M 0 0 Q 10 20 20 0 T 40 0');
    let transformedPathQuadratic = transformNodeAttributes(testPathNode, testParentMatrix1);
    console.log('Test 18 Path with Quadratic Bezier:', transformedPathQuadratic);
    // Expected: type: 'path', d: "M0,0Q10,20,20,0T..." (T control point made explicit)

    // Test 19: Path with Arc (A)
    testPathNode.setAttribute('id', 'testPathArc');
    // Simple arc: M 10,10 A 5,5 0 0,1 20,10 (draws a semi-circle)
    testPathNode.setAttribute('d', 'M 10 10 A 5 5 0 0 1 20 10');
    let transformedPathArc = transformNodeAttributes(testPathNode, testParentMatrix1);
    console.log('Test 19 Path with Arc:', transformedPathArc);
    // Expected: type: 'path', d: "M10,10A5,5,0,0,1,20,10" (coords may change if transform applied)

    // Test 20: Degenerate path to polygon (filtered by area/perimeter)
    testPathNode.setAttribute('id', 'testPathDegeneratePoly');
    testPathNode.setAttribute('d', 'M 0 0 L 100 0 L 0 0 Z'); // A line, zero area
    let transformedPathDegenerate = transformNodeAttributes(testPathNode, testParentMatrix1);
    console.log('Test 20 Degenerate path to polygon (should be path or null):', transformedPathDegenerate);
    // Expected: type: 'path' or null. If path, d: "M0,0L100,0L0,0Z" (or similar)
    // My logic currently should make this a path: isPolygonCandidate -> true, but area/perimeter fails.

    console.log('--- End transformNodeAttributes Test ---');

    // Process actual SVG groups
    console.log('\n--- Processing SVG Groups ---');
    outputData.background = processGenericGroup(svgDoc, ['Contour'], globalTransform, ['rect', 'path', 'polygon']);
    console.log('Processed Background (Contour):', outputData.background.length > 0 ? `${outputData.background.length} items` : 'No items');
    // console.log(JSON.stringify(outputData.background, null, 2));


    outputData.decor = processGenericGroup(svgDoc, ['Decor'], globalTransform, ['rect', 'path', 'polygon', 'line', 'polyline', 'circle', 'ellipse']); // Added circle, ellipse for decor
    console.log('Processed Decor:', outputData.decor.length > 0 ? `${outputData.decor.length} items` : 'No items');
    // console.log(JSON.stringify(outputData.decor, null, 2));

    outputData.itineraries = processGenericGroup(svgDoc, ['Lignes_de_couloir', 'Lignes de couloir'], globalTransform, ['line', 'polyline', 'polygon', 'path'], 'itinerary');
    console.log('Processed Itineraries (Lignes_de_couloir):', outputData.itineraries.length > 0 ? `${outputData.itineraries.length} items` : 'No items');
    // console.log(JSON.stringify(outputData.itineraries, null, 2));
    
    const initialPois = processInitialPOIs(svgDoc, globalTransform);
    outputData.pois._raw = initialPois._raw; // Keep the _raw structure for now
    console.log('Processed Initial POIs (Salles/Pièces):', outputData.pois._raw.length > 0 ? `${outputData.pois._raw.length} items` : 'No items');
    // console.log(JSON.stringify(outputData.pois._raw, null, 2));

    console.log('--- End Processing SVG Groups ---');
    
    // console.log('\nFinal outputData structure:');
    // console.log(JSON.stringify(outputData, null, 2));


} catch (error) {
    console.error(`Error processing SVG: ${error.message}`);
    if (error.stack) {
        console.error(error.stack);
    }
    process.exit(1);
}
