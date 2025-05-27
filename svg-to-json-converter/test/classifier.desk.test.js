import { classifyFurniture, parseDeskIds } from '../lib/classifier.js';

describe('Desk regex and desk ID parsing', () => {
  test('classifyFurniture matches desk IDs with underscore and space', () => {
    const ids = [
      'poste_B720:I-0.3-3A0:CADB',
      'poste B720:I-0.3-3A0:CADB',
      'Poste_B720:I00A9:GEHF',
      'Poste B720:I00A9:GEHF',
    ];
    ids.forEach(id => {
      const result = classifyFurniture(id);
      expect(result).not.toBeNull();
      expect(result.type).toBe('desks');
      expect(result.office).toBe('B720');
    });
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
}); 