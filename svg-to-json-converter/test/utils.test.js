import { describe, test, expect } from '@jest/globals';
import {
  normalizeText,
  parseNumber,
  roundTo,
  formatPoint,
  formatPoints,
  distance,
  pointsAreClose,
  filterClosePoints,
  decodeHexEscapes,
  extractSpecialAttributes
} from '../lib/utils.js';

describe('normalizeText', () => {
  test('removes diacritics', () => {
    expect(normalizeText('Café')).toBe('cafe');
    expect(normalizeText('Hérault')).toBe('herault');
    expect(normalizeText('Zaïre')).toBe('zaire');
  });

  test('converts to lowercase', () => {
    expect(normalizeText('HELLO')).toBe('hello');
  });

  test('replaces non-word characters with underscore', () => {
    expect(normalizeText('hello world')).toBe('hello_world');
    expect(normalizeText('test-123')).toBe('test_123');
  });

  test('handles empty and null values', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
});

describe('parseNumber', () => {
  test('parses valid numbers', () => {
    expect(parseNumber('123')).toBe(123);
    expect(parseNumber('123.45')).toBe(123.45);
    expect(parseNumber('-123.45')).toBe(-123.45);
    expect(parseNumber('1.23e-4')).toBe(0.000123);
  });

  test('handles invalid values', () => {
    expect(parseNumber('')).toBe(0);
    expect(parseNumber(null)).toBe(0);
    expect(parseNumber(undefined)).toBe(0);
    expect(parseNumber('abc')).toBe(0);
  });

  test('uses default value', () => {
    expect(parseNumber('', 10)).toBe(10);
    expect(parseNumber(null, -1)).toBe(-1);
  });
});

describe('roundTo', () => {
  test('rounds to specified decimals', () => {
    expect(roundTo(1.23456789, 2)).toBe(1.23);
    expect(roundTo(1.23456789, 4)).toBe(1.2346);
    expect(roundTo(1.23456789, 6)).toBe(1.234568);
  });

  test('handles negative numbers', () => {
    expect(roundTo(-1.23456789, 2)).toBe(-1.23);
  });
});

describe('formatPoint', () => {
  test('formats point correctly', () => {
    expect(formatPoint([1.23456789, 2.3456789])).toBe('1.234568,2.345679');
    expect(formatPoint([0, 0])).toBe('0,0');
    expect(formatPoint([-10.5, 20.5])).toBe('-10.5,20.5');
  });
});

describe('formatPoints', () => {
  test('formats multiple points', () => {
    const points = [[0, 0], [10, 20], [30.5, 40.5]];
    expect(formatPoints(points)).toBe('0,0 10,20 30.5,40.5');
  });

  test('handles empty array', () => {
    expect(formatPoints([])).toBe('');
  });
});

describe('distance', () => {
  test('calculates distance correctly', () => {
    expect(distance([0, 0], [3, 4])).toBe(5);
    expect(distance([0, 0], [0, 0])).toBe(0);
    expect(distance([1, 1], [4, 5])).toBe(5);
  });
});

describe('pointsAreClose', () => {
  test('identifies close points', () => {
    expect(pointsAreClose([0, 0], [0.3, 0.3])).toBe(true);
    expect(pointsAreClose([0, 0], [0.5, 0.5])).toBe(false);
    expect(pointsAreClose([10, 20], [10.2, 20.2])).toBe(true);
  });

  test('uses custom threshold', () => {
    expect(pointsAreClose([0, 0], [1, 1], 1.5)).toBe(true);
    expect(pointsAreClose([0, 0], [1, 1], 0.5)).toBe(false);
  });
});

describe('filterClosePoints', () => {
  test('removes duplicate points', () => {
    const points = [[0, 0], [0, 0], [10, 10], [10, 10], [20, 20]];
    const filtered = filterClosePoints(points);
    expect(filtered).toEqual([[0, 0], [10, 10], [20, 20]]);
  });

  test('removes close points', () => {
    const points = [[0, 0], [0.2, 0.2], [10, 10], [10.3, 10.3], [20, 20]];
    const filtered = filterClosePoints(points);
    expect(filtered).toEqual([[0, 0], [10, 10], [20, 20]]);
  });

  test('handles polygon closing', () => {
    const points = [[0, 0], [10, 0], [10, 10], [0, 10], [0.2, 0.2]];
    const filtered = filterClosePoints(points, 0.4, true);
    expect(filtered).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
  });

  test('handles non-polygon', () => {
    const points = [[0, 0], [10, 0], [10, 10], [0, 10], [0.2, 0.2]];
    const filtered = filterClosePoints(points, 0.4, false);
    expect(filtered).toEqual([[0, 0], [10, 0], [10, 10], [0, 10], [0.2, 0.2]]);
  });
});

describe('decodeHexEscapes', () => {
  test('decodes hex escapes', () => {
    expect(decodeHexEscapes('Sanitaires:_H_x2F_F_x2F_PMR')).toBe('Sanitaires:_H/F/PMR');
    expect(decodeHexEscapes('test_x20_space')).toBe('test space');
    expect(decodeHexEscapes('no_escapes')).toBe('no_escapes');
  });
});

describe('extractSpecialAttributes', () => {
  test('extracts bubbleSide', () => {
    const result = extractSpecialAttributes('Ascenseur x-left');
    expect(result.id).toBe('Ascenseur');
    expect(result.attributes.bubbleSide).toBe('left');
  });

  test('extracts offset attributes', () => {
    const result = extractSpecialAttributes('Sanitaires x-offsetX 10 x-offsetY -20');
    expect(result.id).toBe('Sanitaires');
    expect(result.attributes.offsetX).toBe(10);
    expect(result.attributes.offsetY).toBe(-20);
  });

  test('extracts scale', () => {
    const result = extractSpecialAttributes('Object x-scale 1.5');
    expect(result.id).toBe('Object');
    expect(result.attributes.scale).toBe(1.5);
  });

  test('extracts multiple attributes', () => {
    const result = extractSpecialAttributes('Complex x-left x-offsetX 5 x-offsetY 10 x-scale 2');
    expect(result.id).toBe('Complex');
    expect(result.attributes).toEqual({
      bubbleSide: 'left',
      offsetX: 5,
      offsetY: 10,
      scale: 2
    });
  });

  test('handles no attributes', () => {
    const result = extractSpecialAttributes('Simple Object');
    expect(result.id).toBe('Simple Object');
    expect(result.attributes).toEqual({});
  });
}); 