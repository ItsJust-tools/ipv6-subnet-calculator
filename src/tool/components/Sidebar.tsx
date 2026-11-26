'use client';

import React from 'react';
import { MODES, summaryText } from '../ui-shared';
import type { ToolState } from '../types';

interface SidebarProps {
  state: ToolState;
  onChange: (next: ToolState) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ state }) => {
  return (
    <div className="h-full space-y-6 overflow-y-auto p-4 text-sm" data-testid="ipv6-sidebar">
      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Modes</h3>
        <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
          {MODES.map((mode) => (
            <li key={mode.value} className="flex justify-between gap-2">
              <span>{mode.label}</span>
              <span className="text-gray-500 dark:text-gray-400">{mode.hint}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Current input</h3>
        <p className="text-xs text-gray-600 dark:text-gray-300" data-testid="sidebar-summary">
          {summaryText(state)}
        </p>
      </div>

      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">History</h3>
        <p className="text-xs text-gray-600 dark:text-gray-300" data-testid="sidebar-history-count">
          {state.history.length} entr{state.history.length === 1 ? 'y' : 'ies'} in history
          {state.history.length > 0 ? ' (newest first)' : ''}
        </p>
        <ul className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
          {state.history.slice(0, 5).map((h, i) => (
            <li key={`${h.createdAt}-${i}`} className="truncate">
              {h.text}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Privacy</h3>
        <p className="text-xs text-gray-600 dark:text-gray-300">
          All IPv6 math runs entirely in your browser. Nothing is uploaded or shared.
        </p>
      </div>

      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Keyboard shortcuts</h3>
        <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
          <li>
            <kbd>Ctrl/Cmd+Enter</kbd> — calculate
          </li>
          <li>
            <kbd>Y</kbd> — copy result
          </li>
        </ul>
      </div>
    </div>
  );
};

export default Sidebar;
