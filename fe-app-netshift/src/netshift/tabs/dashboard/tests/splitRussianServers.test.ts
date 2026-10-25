import { describe, expect, it } from 'vitest';
import { isRussianServer, splitRussianServers } from '../sortOutbounds';
import type { NetShift } from '../../../types';

function outbound(displayName: string, type = 'VLESS') {
  return {
    code: displayName,
    displayName,
    latency: 0,
    type,
    selected: false,
  } as NetShift.Outbound;
}

const codes = (items: NetShift.Outbound[]) => items.map((item) => item.code);

describe('isRussianServer', () => {
  it('knows a Russian server by the flag or the name', () => {
    expect(isRussianServer(outbound('🇷🇺 Москва'))).toBe(true);
    expect(isRussianServer(outbound('Россия #1 | БС'))).toBe(true);
    expect(isRussianServer(outbound('РОССИЯ 2'))).toBe(true);
    expect(isRussianServer(outbound('Russia-3'))).toBe(true);
    expect(isRussianServer(outbound('🇫🇮 Финляндия'))).toBe(false);
  });
});

describe('splitRussianServers', () => {
  it('moves the Russian servers last and keeps Auto in front', () => {
    const { main, russian } = splitRussianServers([
      outbound('Auto', 'URLTest'),
      outbound('🇷🇺 Россия #1'),
      outbound('🇫🇮 Финляндия'),
      outbound('🇳🇱 Нидерланды'),
      outbound('Russia 2'),
    ]);

    expect(codes(main)).toEqual(['Auto', '🇫🇮 Финляндия', '🇳🇱 Нидерланды']);
    expect(codes(russian)).toEqual(['🇷🇺 Россия #1', 'Russia 2']);
  });

  it('does not split a list of Russian servers only', () => {
    const items = [outbound('Auto', 'URLTest'), outbound('🇷🇺 Россия #1')];
    const { main, russian } = splitRussianServers(items);

    expect(codes(main)).toEqual(codes(items));
    expect(russian).toEqual([]);
  });

  it('leaves a list without Russian servers alone', () => {
    const items = [outbound('🇫🇮 Финляндия'), outbound('🇩🇪 Германия')];

    expect(splitRussianServers(items)).toEqual({ main: items, russian: [] });
  });
});
