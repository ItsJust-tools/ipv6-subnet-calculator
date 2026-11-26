'use client';

import React from 'react';
import { MODES } from '../ui-shared';
import { computeSubnet } from '../tool-definition';
import type { SubnetRange, ToolState } from '../types';

const inputClass =
  'mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

const monoClass = 'font-mono text-xs break-all text-gray-900 dark:text-gray-100';

function CopyButton({
  value,
  testid,
  label = 'Copy',
}: {
  value: string;
  testid?: string;
  label?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
  }, [value]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      data-testid={testid ? `btn-${testid}` : undefined}
      className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
      aria-label="Copy to clipboard"
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}

function ResultRow({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 p-2 dark:border-gray-800"
      data-testid={testid}
    >
      <div className="min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className={`${monoClass} mt-0.5`}>{value}</p>
      </div>
      <CopyButton value={value} testid={testid} />
    </div>
  );
}

function RangesList({ ranges, testid }: { ranges: SubnetRange[]; testid: string }) {
  return (
    <div className="mt-4 space-y-2" data-testid={testid}>
      {ranges.map((r) => (
        <div
          key={r.index}
          className="rounded-md border border-gray-200 p-2 dark:border-gray-800"
          data-testid="subnet-range-row"
        >
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Subnet {r.index} · /{r.prefix}
          </p>
          <p className={`${monoClass} mt-0.5`}>
            {r.network} — {r.last}
          </p>
        </div>
      ))}
    </div>
  );
}

interface CanvasProps {
  state: ToolState;
  onChange?: (state: ToolState) => void;
  onSaveHistory?: (text: string) => void;
}

export const Canvas: React.FC<CanvasProps> = ({ state, onChange, onSaveHistory }) => {
  const patch = (partial: Partial<ToolState>) => onChange?.({ ...state, ...partial });

  const handleSubmit = () => {
    onSaveHistory?.(`Analyzed ${state.address}/${state.prefix}`);
  };

  const result = computeSubnet(state.address, state.prefix, state.splitCount);

  return (
    <div className="p-4" data-testid="ipv6-canvas">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 sm:col-span-2">
          IPv6 address or CIDR base
          <input
            type="text"
            value={state.address}
            onChange={(e) => patch({ address: e.target.value })}
            data-testid="address-input"
            placeholder="2001:db8::1"
            className={`${inputClass} font-mono`}
            aria-label="IPv6 address"
          />
        </label>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
          Prefix length (/0–/128)
          <input
            type="text"
            inputMode="numeric"
            value={state.prefix}
            onChange={(e) => patch({ prefix: e.target.value })}
            data-testid="prefix-input"
            placeholder="64"
            className={inputClass}
            aria-label="Prefix length"
          />
        </label>
      </div>

      <div
        className="mt-3 flex flex-wrap gap-2"
        role="group"
        aria-label="Mode"
        data-testid="mode-select"
      >
        {MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            onClick={() => patch({ mode: mode.value })}
            data-testid={`mode-${mode.value}`}
            className={
              state.mode === mode.value
                ? 'rounded-md bg-violet-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-600'
                : 'rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }
          >
            {mode.label}
          </button>
        ))}
      </div>

      {state.mode === 'split' ? (
        <label className="mt-3 block text-xs font-medium text-gray-700 dark:text-gray-300">
          Split into N subnets (1–256)
          <input
            type="text"
            inputMode="numeric"
            value={state.splitCount}
            onChange={(e) => patch({ splitCount: e.target.value })}
            data-testid="split-input"
            className={inputClass}
            aria-label="Split count"
          />
        </label>
      ) : null}

      <button
        type="button"
        onClick={handleSubmit}
        data-testid="btn-analyze"
        className="mt-4 rounded-md bg-violet-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-600"
      >
        Calculate
      </button>

      {state.mode === 'expand' && result.valid ? (
        <div className="mt-4 space-y-2">
          <ResultRow
            label="Full (expanded) form"
            value={result.expansion}
            testid="result-expanded"
          />
          <ResultRow
            label="Compressed (RFC 5952) form"
            value={result.compressed}
            testid="result-compressed"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400" data-testid="result-type">
            {result.addressType}
          </p>
        </div>
      ) : null}

      {state.mode === 'analyze' && result.valid ? (
        <div className="mt-4 space-y-2" data-testid="analysis-results">
          <ResultRow
            label={`Network address (/${state.prefix.trim()})`}
            value={result.network}
            testid="result-network"
          />
          {result.firstHost ? (
            <ResultRow
              label="First usable host"
              value={result.firstHost}
              testid="result-first-host"
            />
          ) : null}
          {result.lastHost ? (
            <ResultRow label="Last usable host" value={result.lastHost} testid="result-last-host" />
          ) : null}
          <ResultRow
            label="Last address in range"
            value={result.lastAddress}
            testid="result-last-address"
          />
          <div
            className="rounded-md border border-gray-200 p-2 dark:border-gray-800"
            data-testid="result-counts"
          >
            <p className="text-xs text-gray-500 dark:text-gray-400">Totals</p>
            <p className={`${monoClass} mt-0.5`}>
              {result.totalAddresses} total addresses · {result.hostBits} host bits ·{' '}
              {result.addressType}
            </p>
          </div>
        </div>
      ) : null}

      {state.mode === 'split' && result.valid ? (
        <RangesList ranges={result.ranges} testid="split-results" />
      ) : null}

      {!result.valid ? (
        <p
          className="mt-4 text-sm text-red-600 dark:text-red-400"
          data-testid="error-message"
          role="alert"
        >
          {result.error}
        </p>
      ) : null}
    </div>
  );
};

export default Canvas;
