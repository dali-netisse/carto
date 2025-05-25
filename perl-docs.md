# SVG to JSON Converter - Perl Script Documentation

## Overview

The `svg-to-json-converter.pl` script is a Perl program that converts SVG floor plans into JSON format for use in 3D map visualization systems. It processes SVG files created with Inkscape or Adobe Illustrator and generates structured JSON data that can be consumed by map display libraries.

## Key Features

1. **Coordinate Transformation**: Handles different coordinate systems using calibration rectangles
2. **Transform Flattening**: Converts SVG transforms into direct coordinates
3. **Point Optimization**: Removes redundant points from polygons
4. **Object Simplification**: Simplifies certain object types
5. **Object Filtering**: Eliminates unnecessary objects
6. **Object Type Identification**: Recognizes and categorizes different object types

## Dependencies

- `XML::LibXML` - XML parsing and manipulation
- `JSON` - JSON encoding
- `Unicode::Normalize` - Unicode normalization
- `Math::Trig` - Trigonometric functions
- `Getopt::Std` - Command-line option parsing
- `File::Basename` - File path manipulation

## Command Line Usage

```bash
perl svg-to-json-converter.pl [-d output_dir] [-s site_code] svg_file1.svg [svg_file2.svg ...]
```

### Options:
- `-d`: Specify output directory (default: `../data` relative to SVG file)
- `-s`: Override site code detection

## Input File Structure

### Expected Directory Structure:
```
mapdata-<client>/
├── src/
    ├── <SITE-CODE>/
        ├── <Client> <City> <Floor>.svg
        ├── salles-name-to-id
    ├── sites-map
```

### SVG File Naming Convention:
- Format: `<Client/Site> <Floor>.svg`
- Floor codes:
  - `RDC` = Ground floor (0)
  - `R+N` = Floor N
  - `R-N` = Basement N
  - `E0/E1` = Mezzanine levels
  - `M` = Mezzanine
  - `P` = Parking levels

### Required SVG Structure:

1. **Calibration Layer** (`Calage`):
   - Contains a rectangle for coordinate alignment
   - Used to align multiple floors

2. **Background Layer** (`Contour`):
   - Contains building outline polygons

3. **Decoration Layer** (`Decor`):
   - Contains decorative elements

4. **Corridor Lines Layer** (`Lignes de couloir`):
   - Contains navigation paths

5. **Rooms Layer** (`Salles`/`Pièces`):
   - Contains room polygons with IDs

6. **Furniture Layer** (`Mobilier`):
   - Contains desk and furniture markers

## Configuration Files

### sites-map
Maps site names to site codes:
```
site_name	SITE_CODE
```

### salles-name-to-id
Maps room names to unique IDs:
```
Room Name	unique-id-uuid
```

## Core Processing Logic

### 1. File Name Parsing
- Extracts site code and floor number from filename
- Matches against sites-map for site identification

### 2. Calibration System
- Uses predefined calibration rectangles for known sites
- Transforms all coordinates to a unified system
- Supports translation, scaling, and rotation

### 3. Transform Processing
The script handles various SVG transforms:
- `matrix(a,b,c,d,e,f)`
- `translate(x,y)`
- `scale(s)`
- `rotate(angle)`
- `rotate(angle,cx,cy)`

### 4. Object Type Classification

#### Room Types:
- **office**: Individual offices
- **openspace**: Open office areas
- **meeting-room**: Meeting rooms
- **terrace**: Outdoor spaces
- **chat-area**: Break rooms, kitchenettes
- **stairs**: Staircases
- **elevator**: Elevators
- **toilets**: Restrooms
- **resto**: Restaurant/cafeteria
- **medical**: Medical facilities
- **service**: Service areas
- **conference**: Conference rooms
- **silence**: Quiet zones
- **other**: Miscellaneous spaces

#### Furniture Types:
- **desks**: Workstations with position encoding
- **meeting**: Meeting room furniture
- **tag**: Special markers
- **text**: Text labels

### 5. Desk Encoding Format

Desks use a special encoding:
```
Poste <Office>:I<X><Y>A<Angle>:<Width>x<Depth>:<DeskIDs>
```

Example: `Poste B761:I1.2-3.6A2:4x2:ABCD`
- Office: B761
- Indicator position: X=1.2, Y=-3.6
- Angle: 2
- Dimensions: 4x2
- Desk IDs: A, B, C, D

### 6. Path Simplification

The script converts complex paths to simpler forms:
- Paths with only straight lines → Polygons
- Removes points closer than 0.4 units
- Filters polygons with area/perimeter ratio < 0.2

### 7. Special Attributes

Objects can have special attributes:
- `bubbleSide`: Tooltip position (left, tl, tr, bl, br)
- `offsetX/offsetY`: Position offset
- `scale`: Scaling factor
- `showBubble`: Force tooltip display

## Output JSON Structure

```json
{
  "background": [
    {
      "type": "polygon",
      "id": "path123",
      "points": "x1,y1 x2,y2 ..."
    }
  ],
  "decor": [...],
  "itineraries": [
    {
      "type": "polyline",
      "points": "x1,y1 x2,y2 ..."
    }
  ],
  "pois": {
    "office": {
      "B761": {
        "class": "office",
        "id": "B761",
        "type": "polygon",
        "points": "..."
      }
    },
    "meeting-room": {...}
  },
  "desks": {
    "desks": {
      "desk_id": {
        "class": "desks",
        "direction": 3.14159,
        "point": [x, y],
        "objects": [
          {
            "position": 1,
            "side": "G",
            "office": "B761",
            "desk": "A"
          }
        ]
      }
    }
  },
  "furniture": {...}
}
```

## Error Handling

The script includes error handling for:
- Missing calibration data (warns but continues)
- Unsupported transforms (dies with error)
- Invalid desk encoding (dies with error)
- Missing room mappings (warns with reverse video)
- Duplicate IDs (warns but continues)

## Site-Specific Workarounds

The script includes hardcoded fixes for specific sites:
- ID corrections for various La Poste sites
- Special rotations for PCA sites
- Scaling adjustments for specific floors

## Performance Considerations

- Uses `huge => 1` option for XML parsing to handle large files
- Filters out small polygons early to reduce processing
- Caches transformed coordinates

## Known Limitations

1. Only supports 2D transformations
2. Arc transformations in paths don't adjust radius
3. Hardcoded calibration data for known sites
4. Some site-specific workarounds are hardcoded
5. Text elements are not fully processed 