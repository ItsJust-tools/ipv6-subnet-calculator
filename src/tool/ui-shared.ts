import { DEFAULT_STATE, MAX_HISTORY, type ToolState } from './types';

export const MODES: { value: ToolState['mode']; label: string; hint: string }[] = [
  { value: 'analyze', label: 'Analyze', hint: 'network, range and counts for a CIDR' },
  { value: 'expand', label: 'Expand', hint: 'full and compressed notation' },
  { value: 'split', label: 'Split', hint: 'divide a network into subnets' },
];

/** One-line summary used by the status bar. */
export function summaryText(state = DEFAULT_STATE): string {
  return `${state.address.trim() || 'no address'}/${state.prefix.trim() || '?'}`;
}

/** Joined history texts (debug/tests). */
export function historyText(state = DEFAULT_STATE): string {
  return state.history.map((h) => h.text).join('; ');
}

export { DEFAULT_STATE, MAX_HISTORY };
