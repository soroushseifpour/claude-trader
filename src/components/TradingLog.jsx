import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore.js';

const LOG_STYLES = {
  THINKING: { color: 'text-blue-400', bg: 'bg-blue-950/20', label: '🤔 THINK' },
  BUY: { color: 'text-green-400', bg: 'bg-green-950/20', label: '🟢 BUY' },
  SELL: { color: 'text-red-400', bg: 'bg-red-950/20', label: '🔴 SELL' },
  HOLD: { color: 'text-yellow-400', bg: 'bg-yellow-950/20', label: '⏸ HOLD' },
  ERROR: { color: 'text-red-500', bg: 'bg-red-950/30', label: '⚠ ERROR' },
};

export default function TradingLog() {
  const log = useStore((s) => s.log);
  const bottomRef = useRef(null);
  const containerRef = useRef(null);

  // Auto-scroll to top (newest entries are at top)
  // Actually log is newest-first, so no scrolling needed

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <h3 className="text-gray-400 text-sm uppercase tracking-wider font-medium mb-4">
        Trading Log ({log.length})
      </h3>
      <div
        ref={containerRef}
        className="h-72 overflow-y-auto space-y-1 pr-1"
      >
        {log.length === 0 ? (
          <div className="text-gray-500 text-sm py-4 text-center">
            No activity yet. Start trading to see logs.
          </div>
        ) : (
          log.map((entry) => {
            const style = LOG_STYLES[entry.type] || LOG_STYLES.THINKING;
            return (
              <div
                key={entry.id}
                className={`flex gap-3 items-start rounded-lg px-3 py-2 text-xs ${style.bg}`}
              >
                <span className="text-gray-500 font-mono shrink-0 w-16">{entry.timestamp}</span>
                <span className={`font-mono font-bold shrink-0 w-16 ${style.color}`}>
                  {style.label.replace(/[^\w\s]/g, '').trim().slice(0, 6)}
                </span>
                <span className={`font-mono ${style.color} break-all leading-relaxed`}>
                  {entry.message}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
