import { normalizeCompiledVersion } from '../../../../helpers/normalizeCompiledVersion';
import { removeVersionPrefix } from '../../../../helpers/removeVersionPrefix';
import type { StoreType } from '../../../services/store.service';
import type { IRenderSystemInfoRow } from '../partials';

function isUnknownVersion(version?: string | null): boolean {
  return version === 'unknown' || version === _('unknown');
}

export function getPostqVersionRow(
  diagnosticsSystemInfo: StoreType['diagnosticsSystemInfo'],
): IRenderSystemInfoRow {
  const loading = diagnosticsSystemInfo.loading;
  const unknown = isUnknownVersion(diagnosticsSystemInfo.postq_version);
  const hasActualVersion =
    Boolean(diagnosticsSystemInfo.postq_latest_version) &&
    !isUnknownVersion(diagnosticsSystemInfo.postq_latest_version);
  const version = normalizeCompiledVersion(diagnosticsSystemInfo.postq_version);
  const isDevVersion = version === 'dev';

  if (loading || unknown || !hasActualVersion || isDevVersion) {
    return {
      key: 'PostQ VPN',
      value: version,
    };
  }

  if (
    removeVersionPrefix(version) !==
    removeVersionPrefix(diagnosticsSystemInfo.postq_latest_version)
  ) {
    return {
      key: 'PostQ VPN',
      value: version,
      tag: {
        label: _('Outdated'),
        kind: 'warning',
      },
    };
  }

  return {
    key: 'PostQ VPN',
    value: version,
    tag: {
      label: _('Latest'),
      kind: 'success',
    },
  };
}
