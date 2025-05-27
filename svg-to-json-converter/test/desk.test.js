import { describe, test, expect } from '@jest/globals';
import { classifyFurniture, parseDeskIds } from '../lib/classifier.js';
import { processDeskGeometry, extractDeskEndpoints, calculateDeskDirection } from '../lib/deskUtils.js';

describe('Desk Processing Tests', () => {
  // Test cases from the provided SVG file
  const testCases = [
    {
      id: 'poste_B760:I-0.32A0:ECFD',
      expected: {
        type: 'desks',
        office: 'B760',
        indicatorX: -0.32,
        indicatorY: undefined,
        indicatorA: 0,
        width: undefined,
        depth: undefined,
        deskIds: 'ECFD'
      }
    },
    {
      id: 'poste_B761:I1.2-3.6A2:A',
      expected: {
        type: 'desks',
        office: 'B761',
        indicatorX: 1.2,
        indicatorY: -3.6,
        indicatorA: 2,
        width: undefined,
        depth: undefined,
        deskIds: 'A'
      }
    },
    {
      id: 'sdr_B7 CLEOPATRE:6',
      expected: {
        type: 'meeting',
        office: 'B7 CLEOPATRE',
        indicatorX: undefined,
        indicatorY: undefined,
        indicatorA: undefined,
        width: undefined,
        depth: undefined,
        deskIds: '6'
      }
    },
    {
      id: 'poste C720:I-0.33A0:NKOLPM',
      expected: {
        type: 'desks',
        office: 'C720',
        indicatorX: -0.33,
        indicatorY: undefined,
        indicatorA: 0,
        width: undefined,
        depth: undefined,
        deskIds: 'NKOLPM'
      }
    },
    {
      id: 'poste D730:I00A9:PSQTRU',
      expected: {
        type: 'desks',
        office: 'D730',
        indicatorX: 0,
        indicatorY: 0,
        indicatorA: 9,
        width: undefined,
        depth: undefined,
        deskIds: 'PSQTRU'
      }
    }
  ];

  test.each(testCases)('classifyFurniture handles desk ID: $id', ({ id, expected }) => {
    const result = classifyFurniture(id);
    expect(result).toEqual(expected);
  });

  test('parseDeskIds handles ABCD format', () => {
    const result = parseDeskIds('ABCD', 'B720');
    expect(result.length).toBe(4);
    expect(result[0]).toEqual({ position: 1, side: 'G', office: 'B720', desk: 'A' });
    expect(result[1]).toEqual({ position: 1, side: 'D', office: 'B720', desk: 'B' });
    expect(result[2]).toEqual({ position: 2, side: 'G', office: 'B720', desk: 'C' });
    expect(result[3]).toEqual({ position: 2, side: 'D', office: 'B720', desk: 'D' });
  });

  test('parseDeskIds handles 1G=A,2D=B format', () => {
    const result = parseDeskIds('1G=A,2D=B', 'B720');
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({ position: 1, side: 'G', office: 'B720', desk: 'A' });
    expect(result[1]).toMatchObject({ position: 2, side: 'D', office: 'B720', desk: 'B' });
  });

  test('parseDeskIds handles -Z4 format (reverse)', () => {
    const result = parseDeskIds('-Z4', 'B720');
    expect(result.length).toBe(4);
    expect(result[0].desk).toBe('D');
    expect(result[3].desk).toBe('A');
  });

  test('parseDeskIds handles N4 format (alternating)', () => {
    const result = parseDeskIds('N4', 'B720');
    expect(result.length).toBe(4);
    expect(result[0].desk).toBe('A');
    expect(result[1].desk).toBe('C');
    expect(result[2].desk).toBe('B');
    expect(result[3].desk).toBe('D');
  });

  test('parseDeskIds handles R4 format (reverse alternating)', () => {
    const result = parseDeskIds('R4', 'B720');
    expect(result.length).toBe(4);
    expect(result[0].desk).toBe('B');
    expect(result[1].desk).toBe('D');
    expect(result[2].desk).toBe('A');
    expect(result[3].desk).toBe('C');
  });

  test('parseDeskIds handles complex desk IDs', () => {
    const result = parseDeskIds('NKOLPM', 'C720');
    expect(result.length).toBe(6);
    expect(result[0]).toEqual({ position: 1, side: 'G', office: 'C720', desk: 'N' });
    expect(result[1]).toEqual({ position: 1, side: 'D', office: 'C720', desk: 'K' });
    expect(result[2]).toEqual({ position: 2, side: 'G', office: 'C720', desk: 'O' });
    expect(result[3]).toEqual({ position: 2, side: 'D', office: 'C720', desk: 'L' });
    expect(result[4]).toEqual({ position: 3, side: 'G', office: 'C720', desk: 'P' });
    expect(result[5]).toEqual({ position: 3, side: 'D', office: 'C720', desk: 'M' });
  });

  describe('desk geometry processing', () => {
    test('processes vertical line desk', () => {
      const elem = {
        type: 'line',
        x1: 100,
        y1: 100,
        x2: 100,
        y2: 200
      };
      const result = processDeskGeometry(elem);
      expect(result).toEqual({
        point: [100, 100],
        direction: -Math.PI / 2 // -90 degrees, pointing down
      });
    });

    test('processes horizontal line desk', () => {
      const elem = {
        type: 'line',
        x1: 100,
        y1: 100,
        x2: 200,
        y2: 100
      };
      const result = processDeskGeometry(elem);
      expect(result).toEqual({
        point: [100, 100],
        direction: 0 // 0 degrees, pointing right
      });
    });

    test('processes polyline desk', () => {
      const elem = {
        type: 'polyline',
        points: '100,100 200,100 200,200'
      };
      const result = processDeskGeometry(elem);
      expect(result).toEqual({
        point: [100, 100],
        direction: 0 // First segment is horizontal
      });
    });

    test('processes rect desk', () => {
      const elem = {
        type: 'rect',
        x: 100,
        y: 100,
        width: 50,
        height: 30
      };
      const result = processDeskGeometry(elem);
      expect(result).toEqual({
        point: [100, 100],
        direction: 0 // Top edge is horizontal
      });
    });
  });

  describe('desk direction calculation', () => {
    test('calculates vertical direction', () => {
      const points = [[100, 100], [100, 200]];
      const direction = calculateDeskDirection(points);
      expect(direction).toBe(-Math.PI / 2); // -90 degrees
    });

    test('calculates horizontal direction', () => {
      const points = [[100, 100], [200, 100]];
      const direction = calculateDeskDirection(points);
      expect(direction).toBe(0); // 0 degrees
    });

    test('calculates diagonal direction', () => {
      const points = [[100, 100], [200, 200]];
      const direction = calculateDeskDirection(points);
      expect(direction).toBe(Math.PI / 4); // 45 degrees
    });
  });
}); 