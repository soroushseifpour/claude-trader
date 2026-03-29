import { useState } from 'react';
import { useStore } from '../store/useStore.js';

const CSV_SUPPORTED = 'showSaveFilePicker' in window;

function ReportCard({ report }) {
  const [expanded, setExpanded] = useState(false);
  const pnlPositive = report.dayPnl >= 0;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header row */}
      <button
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-750 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <span className="text-white font-mono font-semibold text-sm">{report.date}</span>
          <span
            className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
              pnlPositive
                ? 'bg-green-950/60 text-green-400 border border-green-700'
                : 'bg-red-950/60 text-red-400 border border-red-700'
            }`}
          >
            {pnlPositive ? '+' : ''}${report.dayPnl?.toFixed(2)} CAD ({pnlPositive ? '+' : ''}{report.dayPnlPct?.toFixed(2)}%)
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>{report.tradesCount} trade{report.tradesCount !== 1 ? 's' : ''}</span>
          <span className="text-gray-600">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-700 px-4 py-4 space-y-4">
          {/* Portfolio summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">Open</div>
              <div className="text-white font-mono font-bold text-sm">${report.startValue?.toFixed(2)}</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">Close</div>
              <div className="text-white font-mono font-bold text-sm">${report.endValue?.toFixed(2)}</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">Day P&L</div>
              <div className={`font-mono font-bold text-sm ${pnlPositive ? 'text-green-400' : 'text-red-400'}`}>
                {pnlPositive ? '+' : ''}${report.dayPnl?.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Trades */}
          {report.trades && report.trades.length > 0 ? (
            <div>
              <div className="text-gray-400 text-xs uppercase tracking-wider mb-2">Trades</div>
              <div className="space-y-1.5">
                {report.trades.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-gray-900 rounded-lg px-3 py-2 text-xs font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                          t.action === 'BUY'
                            ? 'bg-blue-900 text-blue-300'
                            : 'bg-orange-900 text-orange-300'
                        }`}
                      >
                        {t.action}
                      </span>
                      <span className="text-white">{t.shares}x {t.ticker}</span>
                      <span className="text-gray-400">@ ${t.price?.toFixed(2)} CAD</span>
                    </div>
                    {t.action === 'SELL' && (
                      <span className={t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {t.pnl >= 0 ? '+' : ''}${t.pnl?.toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-xs italic">No trades executed this day.</div>
          )}

          {/* Open positions snapshot */}
          {report.positionsSnapshot && Object.keys(report.positionsSnapshot).length > 0 && (
            <div>
              <div className="text-gray-400 text-xs uppercase tracking-wider mb-2">Positions at Close</div>
              <div className="space-y-1.5">
                {Object.entries(report.positionsSnapshot).map(([ticker, pos]) => (
                  <div
                    key={ticker}
                    className="flex items-center justify-between bg-gray-900 rounded-lg px-3 py-2 text-xs font-mono"
                  >
                    <span className="text-white font-bold">{ticker}</span>
                    <span className="text-gray-400">{pos.shares} shares @ avg ${pos.avgCost?.toFixed(2)}</span>
                    <span className="text-gray-300">~${pos.currentPrice?.toFixed(2)} USD</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Commentary */}
          {report.commentary && (
            <div className="bg-blue-950/30 border border-blue-800/50 rounded-lg px-3 py-2">
              <div className="text-blue-400 text-xs uppercase tracking-wider mb-1">Claude's Commentary</div>
              <p className="text-gray-300 text-xs leading-relaxed italic">"{report.commentary}"</p>
            </div>
          )}

          <div className="text-gray-600 text-xs">Generated at {report.generatedAt}</div>
        </div>
      )}
    </div>
  );
}

export default function DailyReports() {
  const reports = useStore((s) => s.reports);
  const csvStatus = useStore((s) => s.csvStatus);
  const csvFileName = useStore((s) => s.csvFileName);
  const setCSVFile = useStore((s) => s.setCSVFile);
  const [collapsed, setCollapsed] = useState(false);

  const sortedReports = [...(reports || [])].sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700">
      {/* Section header */}
      <button
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-750 transition-colors rounded-xl"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-gray-200 font-semibold text-sm uppercase tracking-wider">
            Daily Reports
          </h3>
          {sortedReports.length > 0 && (
            <span className="bg-blue-700 text-blue-100 text-xs font-bold px-2 py-0.5 rounded-full">
              {sortedReports.length}
            </span>
          )}
        </div>
        <span className="text-gray-500 text-xs">{collapsed ? '▼' : '▲'}</span>
      </button>

      {!collapsed && (
        <div className="px-5 pb-5 space-y-3">
          {/* CSV status bar */}
          <div className="flex items-center justify-between gap-3 min-h-[28px]">
            <div className="text-xs font-mono">
              {!CSV_SUPPORTED && (
                <span className="text-yellow-400">
                  CSV export not supported in this browser — use Chrome or Edge
                </span>
              )}
              {CSV_SUPPORTED && csvStatus === 'connected' && csvFileName && (
                <span className="text-green-400">
                  Saving to: {csvFileName} ✓
                </span>
              )}
              {CSV_SUPPORTED && csvStatus === 'error' && (
                <span className="text-red-400">
                  CSV error — check console for details
                </span>
              )}
            </div>
            {CSV_SUPPORTED && (
              <button
                onClick={(e) => { e.stopPropagation(); setCSVFile(); }}
                className="shrink-0 px-3 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold transition-colors border border-gray-600"
              >
                Set reports file
              </button>
            )}
          </div>

          {sortedReports.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              <div className="text-2xl mb-2">📋</div>
              <p>No daily reports yet.</p>
              <p className="text-xs mt-1 text-gray-600">Reports are generated automatically at market close (4:00 PM ET).</p>
            </div>
          ) : (
            sortedReports.map((report) => (
              <ReportCard key={report.date} report={report} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
