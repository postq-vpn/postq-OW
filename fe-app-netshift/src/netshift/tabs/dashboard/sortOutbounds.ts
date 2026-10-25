import { NetShift } from '../../types';
import { isGroup } from './latency';

// The server list ordered by delay: the fastest first, servers without a
// measurement (0) last, equal delays keep their order. Group entries such as
// "Fastest" are not servers and stay where they are, in front of the list.
export function sortOutboundsByLatency(
  outbounds: NetShift.Outbound[],
): NetShift.Outbound[] {
  const groups = outbounds.filter(isGroup);
  const servers = outbounds
    .filter((item) => !isGroup(item))
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const left = a.item.latency > 0 ? a.item.latency : Infinity;
      const right = b.item.latency > 0 ? b.item.latency : Infinity;

      if (left === right) {
        return a.index - b.index;
      }

      return left < right ? -1 : 1;
    })
    .map(({ item }) => item);

  return [...groups, ...servers];
}

// PostQ: a Russian server, by its name (the 🇷🇺 flag, "Россия" or "Russia").
// The same names the backend leaves out of the Auto group (postq_auto_members).
export function isRussianServer(outbound: NetShift.Outbound): boolean {
  const name = outbound.displayName.toLowerCase();

  return (
    name.includes('🇷🇺') || name.includes('росси') || name.includes('russia')
  );
}

// PostQ: the list split for the dashboard, like in the PostQ XKeen panel. The
// Russian servers go last, under a "not recommended" line: Auto does not pick
// them. Group entries ("Auto") always stay in the first part.
export function splitRussianServers(outbounds: NetShift.Outbound[]): {
  main: NetShift.Outbound[];
  russian: NetShift.Outbound[];
} {
  const russian = outbounds.filter(
    (item) => !isGroup(item) && isRussianServer(item),
  );

  if (russian.length === outbounds.filter((item) => !isGroup(item)).length) {
    return { main: outbounds, russian: [] };
  }

  return {
    main: outbounds.filter((item) => !russian.includes(item)),
    russian,
  };
}
