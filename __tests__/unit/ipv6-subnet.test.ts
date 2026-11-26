import { describe, it, expect } from 'vitest';
import {
  parseIPv6,
  expandAddress,
  compressAddress,
  toBigInt,
  fromBigInt,
  parsePrefix,
  addressType,
  computeSubnet,
  summaryText,
  isState,
  DEFAULT_STATE,
  MAX_HISTORY,
  type ToolState,
} from '@/tool/types';
import { serializeState, deserializeState, withHistory, roundTrips } from '@/tool/tool-definition';

const state = (patch: Partial<ToolState> = {}): ToolState => ({ ...DEFAULT_STATE, ...patch });

describe('parseIPv6', () => {
  it('parses loopback and documentation addresses', () => {
    expect(parseIPv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6('2001:db8::1')).toEqual([0x2001, 0x0db8, 0, 0, 0, 0, 0, 1]);
  });

  it('parses full 8-group addresses', () => {
    expect(parseIPv6('2001:0db8:0000:0000:0000:0000:0000:0001')).toEqual([
      0x2001, 0x0db8, 0, 0, 0, 0, 0, 1,
    ]);
  });

  it('rejects invalid input', () => {
    expect(parseIPv6('')).toBeNull();
    expect(parseIPv6('hello')).toBeNull();
    expect(parseIPv6('2001:db8:::1')).toBeNull();
    expect(parseIPv6('2001:db8:::')).toBeNull();
    expect(parseIPv6('12345::')).toBeNull();
    expect(parseIPv6('zzzz::1')).toBeNull();
    expect(parseIPv6('1:2:3:4:5:6:7:8:9')).toBeNull();
  });

  it('handles embedded IPv4 tails', () => {
    expect(parseIPv6('::ffff:192.168.1.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0101]);
    expect(parseIPv6('::ffff:999.0.0.1')).toBeNull();
    expect(parseIPv6('::ffff:1.2.3')).toBeNull();
  });
});

describe('expandAddress', () => {
  it('expands ::1 to full form', () => {
    expect(expandAddress('::1')).toBe('0000:0000:0000:0000:0000:0000:0000:0001');
  });

  it('expands 2001:db8::1 to full form', () => {
    expect(expandAddress('2001:db8::1')).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
  });

  it('returns null for invalid addresses', () => {
    expect(expandAddress('not-an-ip')).toBeNull();
  });
});

describe('compressAddress', () => {
  it('compresses full form back to RFC 5952 minimal form', () => {
    expect(compressAddress('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1');
  });

  it('compresses the longest zero run only when 2+ groups', () => {
    expect(compressAddress('0:0:1:0:0:0:1:1')).toBe('0:0:1::1:1');
  });

  it('keeps single zero groups literal', () => {
    expect(compressAddress('1:0:2:3:4:5:6:7')).toBe('1:0:2:3:4:5:6:7');
  });

  it('compresses all-zero address', () => {
    expect(compressAddress('0:0:0:0:0:0:0:0')).toBe('::');
  });
});

describe('bigint round trip', () => {
  it('round-trips addresses through BigInt', () => {
    const groups = parseIPv6('2001:db8::1') as number[];
    expect(fromBigInt(toBigInt(groups))).toEqual(groups);
  });

  it('formats loopback as 1n', () => {
    expect(toBigInt(parseIPv6('::1') as number[])).toBe(1n);
  });
});

describe('parsePrefix', () => {
  it('accepts 0-128', () => {
    expect(parsePrefix('0')).toBe(0);
    expect(parsePrefix('128')).toBe(128);
    expect(parsePrefix(' 64 ')).toBe(64);
  });

  it('rejects out-of-range and non-numeric', () => {
    expect(parsePrefix('129')).toBeNull();
    expect(parsePrefix('-1')).toBeNull();
    expect(parsePrefix('abc')).toBeNull();
    expect(parsePrefix('')).toBeNull();
    expect(parsePrefix('3.5')).toBeNull();
  });
});

describe('addressType', () => {
  it('classifies well-known types', () => {
    expect(addressType(parseIPv6('2001:db8::1') as number[])).toBe('Documentation');
    expect(addressType(parseIPv6('fe80::1') as number[])).toBe('Link-local unicast');
    expect(addressType(parseIPv6('fd00::1') as number[])).toBe('Unique local');
    expect(addressType(parseIPv6('ff02::1') as number[])).toBe('Multicast');
    expect(addressType(parseIPv6('::1') as number[])).toBe('Loopback');
    expect(addressType(parseIPv6('::') as number[])).toBe('Unspecified');
    expect(addressType(parseIPv6('2606:4700::1') as number[])).toBe('Global unicast');
  });
});

describe('computeSubnet', () => {
  it('computes network/first/last for 2001:db8::/32', () => {
    const r = computeSubnet('2001:db8::1', '32', '1');
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.network).toBe('2001:db8::');
    expect(r.firstHost).toBe('2001:db8::1');
    expect(r.lastAddress).toBe('2001:db8:ffff:ffff:ffff:ffff:ffff:ffff');
    expect(r.hostBits).toBe(96);
    expect(r.addressType).toBe('Documentation');
  });

  it('reports total addresses for a /120', () => {
    const r = computeSubnet('2001:db8::1', '120', '1');
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.totalAddresses).toBe('256');
  });

  it('splits into 4 equal contiguous subnets', () => {
    const r = computeSubnet('2001:db8::', '32', '4');
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.ranges).toHaveLength(4);
    const first = r.ranges[0];
    const lastRow = r.ranges[3];
    expect(first?.network).toBe('2001:db8::');
    expect(first?.prefix).toBe(34);
    expect(lastRow?.network).toBe('2001:db8:c000::');
    expect((first?.last ?? '').length).toBeGreaterThan(0);
  });

  it('returns structured errors instead of throwing', () => {
    const badAddress = computeSubnet('nope', '64', '1');
    expect(badAddress.valid).toBe(false);
    if (badAddress.valid) return;
    expect(badAddress.error).toContain('Invalid IPv6 address');

    const badPrefix = computeSubnet('2001:db8::1', '999', '1');
    expect(badPrefix.valid).toBe(false);
    if (badPrefix.valid) return;
    expect(badPrefix.error).toContain('Invalid prefix length');

    const badSplit = computeSubnet('2001:db8::1', '64', '999999');
    expect(badSplit.valid).toBe(false);
  });

  it('handles /128 single host', () => {
    const r = computeSubnet('::1', '128', '1');
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.firstHost).toBeNull();
    expect(r.totalAddresses).toBe('1');
  });
});

describe('serialization', () => {
  it('round-trips address, prefix and split count', () => {
    const s = state({ address: 'fd00::dead:beef', prefix: '48', splitCount: '8' });
    const restored = deserializeState(JSON.parse(serializeState(s)));
    expect(restored.success).toBe(true);
    if (!restored.success) return;
    expect(restored.data.address).toBe('fd00::dead:beef');
    expect(restored.data.prefix).toBe('48');
    expect(restored.data.splitCount).toBe('8');
    expect(roundTrips(s)).toBe(true);
  });

  it('falls back to defaults for invalid payloads', () => {
    const bad = deserializeState({ mode: 'nonsense', address: 42, history: 'nope' });
    expect(bad.success).toBe(true);
    if (!bad.success) return;
    expect(bad.data.mode).toBe(DEFAULT_STATE.mode);
    expect(bad.data.address).toBe(DEFAULT_STATE.address);
    expect(bad.data.history).toEqual([]);
  });

  it('rejects arrays and primitives', () => {
    expect(deserializeState([1, 2]).success).toBe(false);
    expect(deserializeState('x').success).toBe(false);
    expect(deserializeState(null).success).toBe(false);
  });

  it('caps history at MAX_HISTORY', () => {
    let s = state();
    for (let i = 0; i < MAX_HISTORY + 5; i += 1) {
      s = withHistory(s, `entry-${i}`, new Date(2026, 0, 1, 0, 0, i));
    }
    expect(s.history).toHaveLength(MAX_HISTORY);
    expect(s.history[0]?.text).toBe(`entry-${MAX_HISTORY + 4}`);
  });
});

describe('ui-shared helpers', () => {
  it('summaryText includes address and prefix', async () => {
    const { summaryText: sharedSummary } = await import('@/tool/ui-shared');
    expect(sharedSummary(state())).toBe('2001:db8::1/32');
    expect(sharedSummary(state({ address: ' ' }))).toBe('no address/32');
  });

  it('isState validates mode and strings', () => {
    expect(isState(state())).toBe(true);
    expect(isState({ ...state(), mode: 'bogus' })).toBe(false);
    expect(isState({ mode: 'analyze', address: 'x', prefix: 'y' })).toBe(true);
    expect(isState(null)).toBe(false);
    expect(isState('string')).toBe(false);
  });
});
