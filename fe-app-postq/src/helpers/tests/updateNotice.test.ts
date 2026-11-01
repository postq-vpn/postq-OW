import { describe, expect, it } from 'vitest';
import {
  getOutdatedComponents,
  parseUpdateNotice,
  shouldRefreshUpdateNotice,
} from '../updateNotice';

const answer = {
  enabled: true,
  stale: false,
  checked: 1790000000,
  postq: {
    current_version: '0.9.10',
    latest_version: '0.9.12',
    status: 'outdated',
  },
  sing_box: {
    current_version: '1.12.0',
    latest_version: '1.12.0',
    status: 'latest',
  },
};

describe('parseUpdateNotice', () => {
  it('reads the backend answer', () => {
    const notice = parseUpdateNotice(JSON.stringify(answer));

    expect(notice.enabled).toBe(true);
    expect(notice.postq?.latest_version).toBe('0.9.12');
    expect(notice.sing_box?.status).toBe('latest');
  });

  it('treats missing parts as unknown', () => {
    const notice = parseUpdateNotice({ enabled: true, stale: true });

    expect(notice.postq).toBeNull();
    expect(notice.sing_box).toBeNull();
    expect(notice.checked).toBeNull();
  });

  it('survives garbage', () => {
    expect(parseUpdateNotice('Usage: postq').enabled).toBe(false);
    expect(parseUpdateNotice(null).enabled).toBe(false);
    expect(parseUpdateNotice({ postq: 5 }).postq).toBeNull();
    expect(
      parseUpdateNotice({ postq: { latest_version: 3 } }).postq,
    ).toBeNull();
  });
});

describe('getOutdatedComponents', () => {
  it('lists only what has a newer version', () => {
    expect(getOutdatedComponents(parseUpdateNotice(answer))).toEqual([
      { component: 'postq', current: '0.9.10', latest: '0.9.12' },
    ]);
  });

  it('is empty when everything is current or unknown', () => {
    expect(
      getOutdatedComponents(
        parseUpdateNotice({
          ...answer,
          postq: { ...answer.postq, status: 'latest' },
        }),
      ),
    ).toEqual([]);
    expect(getOutdatedComponents(parseUpdateNotice({}))).toEqual([]);
  });

  it('names both when both are outdated', () => {
    const items = getOutdatedComponents(
      parseUpdateNotice({
        ...answer,
        sing_box: { ...answer.sing_box, status: 'outdated' },
      }),
    );

    expect(items.map((item) => item.component)).toEqual(['postq', 'sing_box']);
  });
});

describe('shouldRefreshUpdateNotice', () => {
  it('refreshes only a stale answer, and only when the notice is on', () => {
    expect(
      shouldRefreshUpdateNotice(
        parseUpdateNotice({ enabled: true, stale: true }),
      ),
    ).toBe(true);
    expect(
      shouldRefreshUpdateNotice(
        parseUpdateNotice({ enabled: true, stale: false }),
      ),
    ).toBe(false);
    expect(
      shouldRefreshUpdateNotice(
        parseUpdateNotice({ enabled: false, stale: true }),
      ),
    ).toBe(false);
  });
});
