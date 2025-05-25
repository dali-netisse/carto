# JavaScript Migration Plan for SVG to JSON Converter

## Executive Summary

This document outlines the plan to migrate the Perl SVG to JSON converter to a Node.js implementation. The goal is to maintain 100% compatibility with the existing output while modernizing the codebase and improving maintainability.

## Technology Stack Selection

### Core Dependencies

1. **XML/SVG Parsing**: `@xmldom/xmldom` + `xpath`
   - Reason: Most similar to Perl's XML::LibXML with XPath support
   - Alternative considered: `svg-parser` (rejected due to lack of XPath)

2. **Command Line Parsing**: `commander`
   - Reason: More feature-rich than minimist, similar to Getopt::Std
   - Alternative considered: `yargs` (too heavy for our needs)

3. **File System**: Native Node.js `fs` module with promises
   - Reason: Built-in, performant, and well-maintained

4. **Path Manipulation**: Native Node.js `path` module
   - Reason: Direct equivalent to File::Basename

5. **Unicode Normalization**: `unorm` or native `String.prototype.normalize()`
   - Reason: Built into modern Node.js, equivalent to Unicode::Normalize

6. **JSON Handling**: Native `JSON` object
   - Reason: Built-in and performant

7. **Math Operations**: Native `Math` object
   - Reason: Includes all trigonometric functions needed

### Development Dependencies

1. **Testing**: `jest`
   - Reason: Comprehensive testing framework with good assertion library

2. **Linting**: `eslint`
   - Reason: Industry standard for JavaScript

3. **Type Checking**: `typescript` (for JSDoc type annotations)
   - Reason: Provides type safety without full TypeScript migration

## Architecture Design

### Module Structure

```
svg-to-json-converter/
├── index.js                 # Main entry point
├── lib/
│   ├── parser.js           # SVG parsing logic
│   ├── transformer.js      # Coordinate transformation
│   ├── classifier.js       # Object type classification
│   ├── geometry.js         # Geometric calculations
│   ├── pathParser.js       # SVG path parsing
│   ├── calibration.js      # Calibration data and logic
│   ├── furniture.js        # Furniture/desk processing
│   └── utils.js            # Utility functions
├── config/
│   ├── calibration.json    # Calibration rectangles
│   ├── siteFixes.json      # Site-specific fixes
│   └── objectTypes.json    # Object classification rules
├── test/
│   ├── fixtures/           # Test SVG files
│   ├── expected/           # Expected JSON outputs
│   └── *.test.js          # Test files
└── package.json
```

### Key Design Decisions

1. **Modular Architecture**: Split monolithic Perl script into focused modules
2. **Configuration Externalization**: Move hardcoded values to JSON configs
3. **Promise-Based**: Use async/await for file operations
4. **Functional Approach**: Minimize state, use pure functions where possible
5. **Error Handling**: Use custom error classes for better debugging

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
1. Set up project structure and dependencies
2. Implement command-line interface
3. Create basic file I/O operations
4. Set up testing framework
5. Implement configuration loading

### Phase 2: XML/SVG Parsing (Week 1-2)
1. Implement SVG file parsing
2. Create XPath query wrapper
3. Handle namespaces (svg, inkscape)
4. Extract layers and elements
5. Unit tests for parsing

### Phase 3: Coordinate Transformation (Week 2)
1. Implement transform parsing (matrix, translate, scale, rotate)
2. Create transform composition logic
3. Implement point transformation
4. Handle nested transforms
5. Unit tests with known transforms

### Phase 4: Geometry Processing (Week 3)
1. Implement path parsing (M, L, C, S, Q, A, Z commands)
2. Create polygon simplification
3. Implement area/perimeter calculations
4. Point deduplication logic
5. Unit tests for all path types

### Phase 5: Object Classification (Week 3-4)
1. Implement ID parsing and normalization
2. Create classification rules engine
3. Handle special attributes (bubbleSide, offset, scale)
4. Process desk encoding format
5. Unit tests for classification

### Phase 6: Calibration System (Week 4)
1. Implement calibration rectangle detection
2. Create coordinate system transformation
3. Handle site-specific calibrations
4. Unit tests with multiple sites

### Phase 7: Output Generation (Week 5)
1. Implement JSON structure generation
2. Ensure proper formatting (canonical, pretty)
3. Handle UTF-8 encoding
4. Create output directory structure
5. Integration tests comparing with Perl output

### Phase 8: Site-Specific Fixes (Week 5)
1. Implement ID correction system
2. Add site-specific transformations
3. Create override mechanism
4. Test with all known sites

### Phase 9: Testing and Validation (Week 6)
1. Comprehensive integration tests
2. Performance benchmarking
3. Memory usage analysis
4. Edge case testing
5. Regression test suite

## Critical Implementation Details

### 1. Unicode Handling
```javascript
// Perl: use utf8; use Unicode::Normalize;
// JavaScript equivalent:
const normalizeText = (text) => {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};
```

### 2. Regular Expression Differences
- Perl uses different regex syntax than JavaScript
- Need to carefully convert regex patterns
- Special attention to Unicode property escapes

### 3. Number Precision
- JavaScript uses floating-point for all numbers
- May need to round coordinates to match Perl output
- Consider using decimal.js for critical calculations

### 4. File Encoding
- Ensure UTF-8 encoding throughout
- Use proper encoding options in fs operations

### 5. Error Handling
- Perl's die → throw new Error()
- Perl's warn → console.warn()
- Implement ANSI color codes for warnings

## Testing Strategy

### Unit Tests
- Test each module in isolation
- Mock dependencies
- Cover all code paths
- Test error conditions

### Integration Tests
- Test complete SVG → JSON conversion
- Compare output with Perl-generated JSON
- Use diff tools to identify discrepancies

### Regression Tests
- Create test suite from existing SVG files
- Ensure output matches exactly
- Run on every code change

### Performance Tests
- Benchmark against Perl implementation
- Monitor memory usage
- Test with large SVG files

## Risk Mitigation

### High-Risk Areas
1. **Path Parsing**: Complex regex patterns need careful conversion
2. **Transform Math**: Floating-point precision differences
3. **Unicode Handling**: Different normalization implementations
4. **XPath Queries**: Syntax differences between libraries

### Mitigation Strategies
1. Extensive unit testing for each high-risk area
2. Side-by-side comparison with Perl output
3. Incremental migration with validation at each step
4. Maintain Perl script as reference during development

## Success Criteria

1. **Functional Parity**: 100% identical JSON output for all test files
2. **Performance**: No more than 2x slower than Perl version
3. **Maintainability**: Clear module structure with documentation
4. **Test Coverage**: Minimum 90% code coverage
5. **Error Handling**: Graceful handling of all error conditions

## Maintenance and Documentation

1. **Code Documentation**: JSDoc comments for all functions
2. **README**: Comprehensive usage instructions
3. **Migration Guide**: Document any differences from Perl version
4. **Change Log**: Track all modifications and bug fixes
5. **API Documentation**: Generate from JSDoc comments

## Timeline Summary

- **Week 1**: Infrastructure and parsing setup
- **Week 2**: Transformation system
- **Week 3**: Geometry and classification
- **Week 4**: Calibration and fixes
- **Week 5**: Output generation and integration
- **Week 6**: Testing and validation

Total estimated time: 6 weeks for complete migration with comprehensive testing. 