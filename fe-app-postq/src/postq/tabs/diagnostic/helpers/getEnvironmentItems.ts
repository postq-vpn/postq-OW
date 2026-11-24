import { IDiagnosticsChecksItem } from '../../../services';
import { PostQ } from '../../../types';

// The clock may differ from the server's by this much before it is reported:
// TLS tolerates some skew, a few minutes are normal on routers without RTC.
export const CLOCK_SKEW_WARNING_SECONDS = 300;

// Turns the backend facts into the rows of the Environment check.
export function getEnvironmentItems(
  data: PostQ.EnvironmentCheckResult,
): IDiagnosticsChecksItem[] {
  const items: IDiagnosticsChecksItem[] = [];
  const flow = data.flow_offloading;

  if (flow.hardware || flow.software || flow.active) {
    items.push({
      state: 'warning',
      key: _('Flow offloading is enabled'),
      value: _(
        'Established connections can skip the marks PostQ VPN sets: turn it off in Network - Firewall',
      ),
    });
  } else {
    items.push({
      state: 'success',
      key: _('Flow offloading is off'),
      value: '',
    });
  }

  if (!data.clock.plausible) {
    items.push({
      state: 'error',
      key: _('The router clock is not set'),
      value: _('TLS and Reality fail with a wrong time: check NTP'),
    });
  } else if (
    data.clock.skew_seconds !== null &&
    Math.abs(data.clock.skew_seconds) > CLOCK_SKEW_WARNING_SECONDS
  ) {
    items.push({
      state: 'warning',
      key: _('The router clock is off'),
      value: `${Math.round(data.clock.skew_seconds / 60)} ${_('min')}`,
    });
  } else {
    items.push({
      state: 'success',
      key: _('The router clock is right'),
      value: '',
    });
  }

  if (
    data.ipv6.router_has_global &&
    !data.ipv6.postq_enabled &&
    data.ipv6.lan_advertises !== false
  ) {
    items.push({
      state: 'warning',
      key: _('The router has a global IPv6 address, IPv6 handling is off'),
      value: _('Check IPv6 advertisements on the home LAN on the main page'),
    });
  } else {
    items.push({
      state: 'success',
      key: _('IPv6 handling matches the network'),
      value: '',
    });
  }

  if (data.reality && data.reality.rejected > 0) {
    items.push({
      state: 'warning',
      key: _('A server answered with the certificate of another site'),
      value: data.reality.stock_core
        ? _(
            'A Reality server may need a newer client than the stock sing-box core: open Updates, select sing-box and install the extended lite build',
          )
        : _('Check the public key, short id and SNI of the server'),
    });
  }

  return items;
}
