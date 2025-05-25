import { describe, test, expect } from '@jest/globals';
import {
  classifyObject,
  mapRoomName,
  classifyFurniture,
  parseDeskIds
} from '../lib/classifier.js';

describe('classifyObject', () => {
  test('classifies terraces', () => {
    const result = classifyObject('Terrasse Sud', 0);
    expect(result.class).toBe('terrace');
    expect(result.id).toBe('Terrasse Sud');
  });

  test('classifies offices', () => {
    let result = classifyObject('Bureau 2G-123', 2);
    expect(result.class).toBe('office');
    expect(result.id).toBe('2G123');

    result = classifyObject('Bureaux 3S-100 - 3S-102', 3);
    expect(result.class).toBe('office');
    expect(result.id).toBe('3S100,3S102');

    result = classifyObject('Bureau B301', 3);
    expect(result.class).toBe('office');
    expect(result.id).toBe('B301');
  });

  test('classifies openspaces', () => {
    const result = classifyObject('Openspace 4G-200', 4);
    expect(result.class).toBe('openspace');
    expect(result.id).toBe('4G200');
  });

  test('classifies meeting rooms', () => {
    const result = classifyObject('Salle de réunion Luxembourg', 0);
    expect(result.class).toBe('meeting-room');
    expect(result.id).toBe('Luxembourg');
    expect(result.name).toBe('Luxembourg');
  });

  test('classifies stairs', () => {
    const result = classifyObject('ESCALIER 2', 0);
    expect(result.class).toBe('stairs');
  });

  test('classifies elevators', () => {
    const result = classifyObject('ASCENSEUR 1', 0);
    expect(result.class).toBe('elevator');
  });

  test('classifies toilets', () => {
    let result = classifyObject('WC Hommes', 0);
    expect(result.class).toBe('toilets');

    result = classifyObject('Sanitaires', 0);
    expect(result.class).toBe('toilets');
  });

  test('classifies chat areas', () => {
    let result = classifyObject('ESPACE CONVIVIALITÉ', 0);
    expect(result.class).toBe('chat-area');

    result = classifyObject('Tisanerie', 0);
    expect(result.class).toBe('chat-area');
    expect(result.showBubble).toBe(true);
  });

  test('classifies services', () => {
    const result = classifyObject('Service Informatique', 0);
    expect(result.class).toBe('service');
    expect(result.id).toBe('Informatique');
  });

  test('skips PMR refuges', () => {
    const result = classifyObject('Refuge PMR', 0);
    expect(result).toBeNull();
  });

  test('classifies unknown as other', () => {
    const result = classifyObject('Something Unknown', 0);
    expect(result.class).toBe('other');
  });
});

describe('mapRoomName', () => {
  test('maps room names correctly', () => {
    const nameToIdMap = {
      'luxembourg': 'uuid-123',
      'salle_des_territoires': 'uuid-456'
    };

    expect(mapRoomName('Luxembourg', nameToIdMap)).toBe('uuid-123');
    expect(mapRoomName('Salle des Territoires', nameToIdMap)).toBe('uuid-456');
    expect(mapRoomName('Unknown Room', nameToIdMap)).toBeNull();
  });
});

describe('classifyFurniture', () => {
  test('classifies desk furniture', () => {
    const result = classifyFurniture('Poste B761:I1.2-3.6A2:4x2:ABCD');
    expect(result).toEqual({
      type: 'desks',
      office: 'B761',
      indicatorX: 1.2,
      indicatorY: -3.6,
      indicatorA: 2,
      width: 4,
      depth: 2,
      deskIds: 'ABCD'
    });
  });

  test('classifies meeting room furniture', () => {
    const result = classifyFurniture('SDR C7 MANDELA:10');
    expect(result).toEqual({
      type: 'meeting',
      office: 'C7 MANDELA',
      indicatorX: undefined,
      indicatorY: undefined,
      indicatorA: undefined,
      width: undefined,
      depth: undefined,
      deskIds: '10'
    });
  });

  test('classifies meuble', () => {
    const result = classifyFurniture('meuble armoire');
    expect(result).toEqual({
      type: 'furniture',
      class: 'armoire'
    });
  });

  test('classifies text', () => {
    const result = classifyFurniture('text-top label 12 #FF0000 Hello\\nWorld');
    expect(result).toEqual({
      type: 'text',
      textType: 'text-top',
      height: 1,
      class: 'label',
      size: 12,
      color: '#FF0000',
      text: 'Hello\nWorld'
    });
  });
});

describe('parseDeskIds', () => {
  test('parses explicit desk assignments', () => {
    const result = parseDeskIds('1G=A,2D=B', 'B761', 4, 2);
    expect(result).toEqual([
      { position: 1, side: 'G', office: 'B761', desk: 'A', width: 4, depth: 2 },
      { position: 2, side: 'D', office: 'B761', desk: 'B', width: 4, depth: 2 }
    ]);
  });

  test('parses simple desk string', () => {
    const result = parseDeskIds('ABCD', 'B761');
    expect(result).toEqual([
      { position: 1, side: 'G', office: 'B761', desk: 'A' },
      { position: 1, side: 'D', office: 'B761', desk: 'B' },
      { position: 2, side: 'G', office: 'B761', desk: 'C' },
      { position: 2, side: 'D', office: 'B761', desk: 'D' }
    ]);
  });

  test('parses Z layout', () => {
    const result = parseDeskIds('Z4', 'B761');
    expect(result).toEqual([
      { position: 1, side: 'G', office: 'B761', desk: 'A' },
      { position: 1, side: 'D', office: 'B761', desk: 'B' },
      { position: 2, side: 'G', office: 'B761', desk: 'C' },
      { position: 2, side: 'D', office: 'B761', desk: 'D' }
    ]);
  });

  test('parses N layout', () => {
    const result = parseDeskIds('N4', 'B761');
    expect(result).toEqual([
      { position: 1, side: 'G', office: 'B761', desk: 'A' },
      { position: 1, side: 'D', office: 'B761', desk: 'C' },
      { position: 2, side: 'G', office: 'B761', desk: 'B' },
      { position: 2, side: 'D', office: 'B761', desk: 'D' }
    ]);
  });

  test('handles reverse layout', () => {
    const result = parseDeskIds('-Z4', 'B761');
    expect(result).toEqual([
      { position: 1, side: 'G', office: 'B761', desk: 'D' },
      { position: 1, side: 'D', office: 'B761', desk: 'C' },
      { position: 2, side: 'G', office: 'B761', desk: 'B' },
      { position: 2, side: 'D', office: 'B761', desk: 'A' }
    ]);
  });

  test('skips dash placeholders', () => {
    const result = parseDeskIds('A-CD', 'B761');
    expect(result).toEqual([
      { position: 1, side: 'G', office: 'B761', desk: 'A' },
      { position: 2, side: 'G', office: 'B761', desk: 'C' },
      { position: 2, side: 'D', office: 'B761', desk: 'D' }
    ]);
  });
}); 