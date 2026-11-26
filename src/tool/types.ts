export type Mode = 'analyze' | 'expand' | 'split';

export interface HistoryEntry {
  /** Short human readable description of the calculation. */
  text: string;
  /** ISO timestamp when the entry was saved. */
  createdAt: string;
}

export interface SubnetRange {
  /** Index of the subnet within the split (0-based). */
  index: number;
  /** Network address of the subnet (compressed). */
  network: string;
  /** Last address of the subnet (compressed). */
  last: string;
  /** Prefix length of the subnet. */
  prefix: number;
}

export interface ToolState {
  /** Active mode. */
  mode: Mode;
  /** IPv6 address input (compressed or full). */
  address: string;
  /** Prefix length input as string (0-128). */
  prefix: string;
  /** Number of subnets to split into as string. */
  splitCount: string;
  /** Saved calculation history, newest first. */
  history: HistoryEntry[];
}

export const DEFAULT_STATE: ToolState = {
  mode: 'analyze',
  address: '2001:db8::1',
  prefix: '32',
  splitCount: '4',
  history: [],
};

export const MAX_HISTORY = 20;

/** Lowercase+trim helper. */
function lower(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Parse an IPv6 address (with optional embedded IPv4 tail) into its 8 groups
 * as numbers 0-65535. Returns null on invalid input.
 */
export function parseIPv6(input: string): number[] | null {
  const raw = lower(input);
  if (!raw || raw.length > 45) return null;
  if (!/^[\d:a-f.]+$/.test(raw)) return null;
  if (raw.includes(':::')) return null;

  // Handle embedded IPv4 tail like ::ffff:192.168.0.1
  let v4Tail: number[] | null = null;
  let body = raw;
  const lastColon = raw.lastIndexOf(':');
  const tail = raw.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = tail.split('.');
    if (v4.length !== 4) return null;
    v4Tail = [];
    for (const octet of v4) {
      if (!/^\d{1,3}$/.test(octet)) return null;
      const v = Number(octet);
      if (v > 255) return null;
      v4Tail.push(v);
    }
    body = `${raw.slice(0, lastColon + 1)}ffff:ffff`;
  }

  const hasCompression = body.includes('::');
  const sides = body.split('::');
  if (sides.length > 2) return null;

  const countGroups = (side: string): string[] =>
    side === '' ? [] : side.split(':').filter((g) => g !== '');

  let groups: string[];
  if (hasCompression) {
    const left = countGroups(sides[0] ?? '');
    const right = countGroups(sides[1] ?? '');
    const explicit = left.length + right.length;
    if (explicit > 7) return null;
    groups = [...left, ...Array<string>(8 - explicit).fill('0'), ...right];
  } else {
    groups = countGroups(sides[0] ?? '');
  }
  if (groups.length !== 8) return null;

  const out: number[] = [];
  for (const group of groups) {
    if (group.length > 4 || !/^[0-9a-f]{1,4}$/.test(group)) return null;
    out.push(parseInt(group, 16));
  }
  if (v4Tail) {
    const a = v4Tail[0] ?? 0;
    const b = v4Tail[1] ?? 0;
    const c = v4Tail[2] ?? 0;
    const d = v4Tail[3] ?? 0;
    out[6] = (a << 8) | b;
    out[7] = (c << 8) | d;
  }
  return out;
}

/** Convert a parsed address array back into 8 hex group strings. */
export function groupsToHex(groups: number[]): string[] {
  return groups.map((g) => g.toString(16));
}

/** Expand an IPv6 address to its full 8-group form. */
export function expandAddress(input: string): string | null {
  const groups = parseIPv6(input);
  if (!groups) return null;
  return groupsToHex(groups)
    .map((g) => g.padStart(4, '0'))
    .join(':');
}

/** RFC 5952 recommended string: lowercase, longest zero run replaced with '::'. */
export function compressAddress(input: string): string | null {
  const groups = parseIPv6(input);
  if (!groups) return null;
  const hex = groupsToHex(groups);
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i = 0; i < 8; i += 1) {
    if (hex[i] === '0') {
      if (curStart < 0) curStart = i;
      curLen += 1;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }
  if (bestLen < 2 || bestStart < 0) return hex.join(':');
  const left = hex.slice(0, bestStart).join(':');
  const right = hex.slice(bestStart + bestLen).join(':');
  return `${left}::${right}`;
}

/** Convert 8 groups into a 128-bit BigInt. */
export function toBigInt(groups: number[]): bigint {
  let value = 0n;
  for (const g of groups) value = (value << 16n) | BigInt(g);
  return value;
}

/** Convert a 128-bit BigInt back into 8 groups. */
export function fromBigInt(value: bigint): number[] {
  const out: number[] = [];
  let v = value;
  for (let i = 0; i < 8; i += 1) {
    out.unshift(Number(v & 0xffffn));
    v >>= 16n;
  }
  return out;
}

/** Supported IPv6 prefix bounds. */
export const MIN_PREFIX = 0;
export const MAX_PREFIX = 128;

/** Parse the prefix string into an integer within 0..128. */
export function parsePrefix(input: string): number | null {
  const t = input.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const value = Number(t);
  if (!Number.isInteger(value) || value < MIN_PREFIX || value > MAX_PREFIX) return null;
  return value;
}

/** Classify an IPv6 address by its well-known type. */
export function addressType(groups: number[]): string {
  const value = toBigInt(groups);
  if (value >> 120n === 0xffn) return 'Multicast';
  const top = (value >> 112n) & 0xffffn;
  if (top === 0xfe80n) return 'Link-local unicast';
  if ((top & 0xfe00n) === 0xfc00n) return 'Unique local';
  if (value === 1n) return 'Loopback';
  if (value === 0n) return 'Unspecified';
  if (value >> 96n === 0x20010db8n) return 'Documentation';
  if (value >> 112n === 0x2002n) return '6to4';
  // 2001:0000::/23 up to 2001:ffff handled via top 32 bits for clarity: 2606:4700 etc.
  const top32 = value >> 96n;
  const top16of32 = top32 >> 16n;
  if (top16of32 >= 0x2001n && top16of32 <= 0x26ffn) {
    return 'Global unicast';
  }
  return 'Other / reserved';
}

export interface SubnetResult {
  valid: true;
  groups: number[];
  expansion: string;
  compressed: string;
  network: string;
  firstHost: string | null;
  lastHost: string | null;
  lastAddress: string;
  totalAddresses: string;
  hostBits: number;
  addressType: string;
  ranges: SubnetRange[];
}

export interface SubnetError {
  valid: false;
  error: string;
}

/**
 * Compute all analysis values for a given address + prefix + split count.
 * Returns a structured error for invalid input instead of throwing.
 */
export function computeSubnet(
  address: string,
  prefixInput: string,
  splitInput: string
): SubnetResult | SubnetError {
  const groups = parseIPv6(address);
  if (!groups) return { valid: false, error: `Invalid IPv6 address: ${address.trim()}` };
  const prefix = parsePrefix(prefixInput);
  if (prefix === null) {
    return { valid: false, error: `Invalid prefix length: ${prefixInput.trim()}` };
  }

  const splitCountRaw = splitInput.trim() === '' ? '1' : splitInput.trim();
  if (
    !/^\d{1,3}$/.test(splitCountRaw) ||
    Number(splitCountRaw) < 1 ||
    Number(splitCountRaw) > 256
  ) {
    return { valid: false, error: `Invalid split count: ${splitCountRaw}` };
  }
  const splitCount: number = Number(splitCountRaw);

  const value = toBigInt(groups);
  const hostBits = BigInt(MAX_PREFIX - prefix);
  let networkValue = value;
  if (prefix < 128) {
    const mask = ((1n << 128n) - 1n) << hostBits;
    networkValue = value & mask;
  }
  const maxValue = networkValue | ((1n << hostBits) - 1n);

  const total = 1n << hostBits;
  const firstHostBigInt = hostBits > 1n ? networkValue + 1n : networkValue;
  const lastHostBigInt = hostBits > 0n ? maxValue - 1n : maxValue;
  const showRange = hostBits > 0n;

  const splitBits = splitCount <= 1 ? 0n : BigInt(Math.ceil(Math.log2(splitCount)));
  const actualSubnets = splitCount <= 1 ? 1 : 1 << Number(splitBits);
  const ranges: SubnetRange[] = [];
  if (actualSubnets > 1) {
    const subnetBits = hostBits - splitBits;
    for (let i = 0n; i < BigInt(actualSubnets); i += 1n) {
      const base = networkValue + (i << subnetBits);
      const top = base + ((1n << subnetBits) - 1n);
      const baseHex = groupsToHex(fromBigInt(base)).join(':');
      const topHex = groupsToHex(fromBigInt(top)).join(':');
      ranges.push({
        index: Number(i),
        network: baseHex.length > 0 ? (compressAddress(baseHex) ?? '') : '',
        last: topHex.length > 0 ? (compressAddress(topHex) ?? '') : '',
        prefix: MAX_PREFIX - Number(subnetBits),
      });
    }
  }

  const hexJoin = (v: bigint): string => {
    const hexJoined = groupsToHex(fromBigInt(v)).join(':');
    return compressAddress(hexJoined) ?? '';
  };

  return {
    valid: true,
    groups,
    expansion: expandAddress(address) ?? '',
    compressed: compressAddress(address) ?? '',
    network: hexJoin(networkValue),
    firstHost: showRange ? hexJoin(firstHostBigInt) : null,
    lastHost: showRange ? hexJoin(lastHostBigInt) : null,
    lastAddress: hexJoin(maxValue),
    totalAddresses: total.toLocaleString('en-US'),
    hostBits: Number(hostBits),
    addressType: addressType(groups),
    ranges,
  };
}

/** One-line summary used by the status bar and the copy action. */
export function summaryText(state: ToolState): string {
  const result = computeSubnet(state.address, state.prefix, state.splitCount);
  if (!result.valid) return `invalid: ${result.error}`;
  return `${result.compressed}/${state.prefix.trim()} · ${result.addressType} · ${result.totalAddresses} addresses`;
}

/** True when the object looks like tool state (used by deserialize guards). */
export function isState(value: unknown): value is ToolState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<ToolState>;
  return (
    (v.mode === 'analyze' || v.mode === 'expand' || v.mode === 'split') &&
    typeof v.address === 'string' &&
    typeof v.prefix === 'string'
  );
}

export { lower as normalizeLower };
