import { describe, test, expect } from '@jest/globals';
import {
  parsePath,
  pathToAbsolute,
  isPolygonPath,
  pathToPoints,
  pathToAbsoluteString
} from '../lib/pathParser.js';

describe('parsePath', () => {
  test('parses simple moveto and lineto', () => {
    const result = parsePath('M10,20 L30,40');
    expect(result).toEqual([
      { command: 'M', params: [10, 20] },
      { command: 'L', params: [30, 40] }
    ]);
  });

  test('parses relative commands', () => {
    const result = parsePath('m10,20 l30,40');
    expect(result).toEqual([
      { command: 'm', params: [10, 20] },
      { command: 'l', params: [30, 40] }
    ]);
  });

  test('parses horizontal and vertical lines', () => {
    const result = parsePath('M10,20 H30 V40');
    expect(result).toEqual([
      { command: 'M', params: [10, 20] },
      { command: 'H', params: [30] },
      { command: 'V', params: [40] }
    ]);
  });

  test('parses cubic bezier curves', () => {
    const result = parsePath('M10,20 C30,40 50,60 70,80');
    expect(result).toEqual([
      { command: 'M', params: [10, 20] },
      { command: 'C', params: [30, 40, 50, 60, 70, 80] }
    ]);
  });

  test('parses closepath', () => {
    const result = parsePath('M10,20 L30,40 Z');
    expect(result).toEqual([
      { command: 'M', params: [10, 20] },
      { command: 'L', params: [30, 40] },
      { command: 'Z', params: [] }
    ]);
  });

  test('handles multiple parameters for same command', () => {
    const result = parsePath('M10,20 30,40 50,60');
    expect(result).toEqual([
      { command: 'M', params: [10, 20, 30, 40, 50, 60] }
    ]);
  });

  test('handles scientific notation', () => {
    const result = parsePath('M1e2,2e-1');
    expect(result).toEqual([
      { command: 'M', params: [100, 0.2] }
    ]);
  });

  test('handles negative numbers', () => {
    const result = parsePath('M-10,-20 L-30,-40');
    expect(result).toEqual([
      { command: 'M', params: [-10, -20] },
      { command: 'L', params: [-30, -40] }
    ]);
  });

  test('handles compact notation', () => {
    const result = parsePath('M10,20L30,40L50,60');
    expect(result).toEqual([
      { command: 'M', params: [10, 20] },
      { command: 'L', params: [30, 40] },
      { command: 'L', params: [50, 60] }
    ]);
  });
});

describe('pathToAbsolute', () => {
  test('converts relative moveto', () => {
    const commands = [
      { command: 'm', params: [10, 20] },
      { command: 'l', params: [30, 40] }
    ];
    const result = pathToAbsolute(commands);
    expect(result.commands).toEqual([
      { command: 'M', params: [10, 20] },
      { command: 'L', params: [40, 60] }
    ]);
    expect(result.startX).toBe(10);
    expect(result.startY).toBe(20);
    expect(result.endX).toBe(40);
    expect(result.endY).toBe(60);
  });

  test('converts horizontal and vertical lines', () => {
    const commands = [
      { command: 'M', params: [10, 20] },
      { command: 'h', params: [30] },
      { command: 'v', params: [40] }
    ];
    const result = pathToAbsolute(commands);
    expect(result.commands).toEqual([
      { command: 'M', params: [10, 20] },
      { command: 'L', params: [40, 20] },
      { command: 'L', params: [40, 60] }
    ]);
  });

  test('handles closepath', () => {
    const commands = [
      { command: 'M', params: [10, 20] },
      { command: 'L', params: [30, 40] },
      { command: 'z', params: [] }
    ];
    const result = pathToAbsolute(commands);
    expect(result.commands[2]).toEqual({ command: 'Z', params: [] });
    expect(result.endX).toBe(10);
    expect(result.endY).toBe(20);
  });

  test('converts smooth cubic bezier', () => {
    const commands = [
      { command: 'M', params: [10, 20] },
      { command: 'C', params: [20, 30, 30, 40, 40, 50] },
      { command: 's', params: [20, 20, 30, 30] }
    ];
    const result = pathToAbsolute(commands);
    expect(result.commands[2]).toEqual({
      command: 'C',
      params: [50, 60, 60, 70, 70, 80]
    });
  });
});

describe('isPolygonPath', () => {
  test('identifies polygon paths', () => {
    const commands = [
      { command: 'M', params: [10, 20] },
      { command: 'L', params: [30, 40] },
      { command: 'L', params: [50, 60] },
      { command: 'Z', params: [] }
    ];
    expect(isPolygonPath(commands)).toBe(true);
  });

  test('rejects paths with curves', () => {
    const commands = [
      { command: 'M', params: [10, 20] },
      { command: 'C', params: [20, 30, 30, 40, 40, 50] }
    ];
    expect(isPolygonPath(commands)).toBe(false);
  });

  test('rejects paths with arcs', () => {
    const commands = [
      { command: 'M', params: [10, 20] },
      { command: 'A', params: [10, 10, 0, 0, 1, 30, 40] }
    ];
    expect(isPolygonPath(commands)).toBe(false);
  });
});

describe('pathToPoints', () => {
  test('extracts points from path', () => {
    const commands = [
      { command: 'M', params: [10, 20] },
      { command: 'L', params: [30, 40] },
      { command: 'L', params: [50, 60] },
      { command: 'Z', params: [] }
    ];
    const points = pathToPoints(commands);
    expect(points).toEqual([
      [10, 20],
      [30, 40],
      [50, 60]
    ]);
  });

  test('handles multiple points in single command', () => {
    const commands = [
      { command: 'M', params: [10, 20, 30, 40] },
      { command: 'L', params: [50, 60, 70, 80] }
    ];
    const points = pathToPoints(commands);
    expect(points).toEqual([
      [10, 20],
      [30, 40],
      [50, 60],
      [70, 80]
    ]);
  });
});

describe('pathToAbsoluteString', () => {
  test('converts path to absolute string', () => {
    const path = 'm10,20 l30,40 z';
    const result = pathToAbsoluteString(path);
    expect(result).toBe('M10,20L40,60Z');
  });

  test('preserves already absolute paths', () => {
    const path = 'M10,20 L30,40 Z';
    const result = pathToAbsoluteString(path);
    expect(result).toBe('M10,20L30,40Z');
  });
}); 