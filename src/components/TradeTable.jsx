import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore.js';

const OUTCOME_BADGE = {
  WIN: 'bg-green-900/60 text-green-400 border-green-700',
  LOSS: 'bg-red-900/60 text-red-400 border-red-700',
  OPEN: 'bg-blue-900/60 text-blue-400 border-blue-700',
};

export default function TradeTable() {
  const trades = useStore((s) => s.trades);
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');
  const [tickerFilter, setTickerFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const filtered = useMemo(() => {
    return [...trades]
      .reverse()
      .filter((t) => {
        if (outcomeFilter !== 'ALL' && t.outcome !== outcomeFilter) return false;
        if (tickerFilter && !t.ticker.includes(tickerFilter.toUpperCase())) return false;
        return true;
      });
  }, [trades, outcomeFilter, tickerFilter]);

  // Summary stats
  const stats = useMemo(() => {
    const sells = trades.filter((t) => t.action === 'SELL');
    const wins = sells.filter((t) => t.outcome === 'WIN');
    const losses = sells.filter((t) => t.outcome === 'LOSS');
    const bestTrade = sells.reduce((best, t) => (!best || t.pnl > best.pnl ? t : best), null);
    const worstTrade = sells.reduce((worst, t) => (!worst || t.pnl < worst.pnl ? t : worst), null);
    const totalPnl = sells.reduce((sum, t) => sum + (t.pnl || 0), 0);

    return {
      total: trades.length,
      wins: wins.length,
      losses: losses.length,
      open: trades.filter((t) => t.outcome === 'OPEN').length,
      bestTrade,
      worstTrade,
      totalPnl,
      winRate: sells.length > 0 ? ((wins.length / sells.length) * 100).toFixed(1) : '0.0',
    };
  }, [trades]);

  const uniqueTickers = [...new Set(trades.map((t) => t.ticker))].sort();

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Trades', value: stats.total },
          { label: 'Won', value: stats.wins, color: 'text-green-400' },
          { label: 'Lost', value: stats.losses, color: 'text-red-400' },
          { label: 'Open', value: stats.open, color: 'text-blue-400' },
          { label: 'Win Rate', value: `${stats.winRate}%`, color: parseFloat(stats.winRate) >= 50 ? 'text-green-400' : 'text-red-400' },
          {
            label: 'Total P&L',
            value: `${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(2)}`,
            color: stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400',
          },
        ].map((s) => (
          <div key={s.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="text-gray-400 text-xs uppercase tracking-wider">{s.label}</div>
            <div className={`text-xl font-bold font-mono mt-1 ${s.color || 'text-white'}`}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {stats.bestTrade && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-green-950/20 border border-green-800/50 rounded-xl p-4">
            <div className="text-green-400 text-xs uppercase tracking-wider mb-1">Best Trade</div>
            <div className="font-mono text-green-400 font-bold">
              +${stats.bestTrade.pnl?.toFixed(2)} CAD — {stats.bestTrade.ticker}
            </div>
            <div className="text-gray-400 text-xs mt-1 line-clamp-2">{stats.bestTrade.reasoning}</div>
          </div>
          {stats.worstTrade && stats.worstTrade.pnl < 0 && (
            <div className="bg-red-950/20 border border-red-800/50 rounded-xl p-4">
              <div className="text-red-400 text-xs uppercase tracking-wider mb-1">Worst Trade</div>
              <div className="font-mono text-red-400 font-bold">
                ${stats.worstTrade.pnl?.toFixed(2)} CAD — {stats.worstTrade.ticker}
              </div>
              <div className="text-gray-400 text-xs mt-1 line-clamp-2">{stats.worstTrade.reasoning}</div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex rounded-lg overflow-hidden border border-gray-600">
          {['ALL', 'WIN', 'LOSS', 'OPEN'].map((f) => (
            <button
              key={f}
              onClick={() => setOutcomeFilter(f)}
              className={`px-3 py-1.5 text-xs font-mono transition-colors ${
                outcomeFilter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <select
          value={tickerFilter}
          onChange={(e) => setTickerFilter(e.target.value)}
          className="bg-gray-700 border border-gray-600 text-gray-300 text-xs rounded-lg px-3 py-1.5 font-mono"
        >
          <option value="">All Tickers</option>
          {uniqueTickers.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <span className="text-gray-500 text-xs ml-auto">
          {filtered.length} of {trades.length} trades
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center text-gray-500">
          No trades match your filters.
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Time</th>
                  <th className="px-4 py-3 text-left">Ticker</th>
                  <th className="px-4 py-3 text-left">Action</th>
                  <th className="px-4 py-3 text-right">Shares</th>
                  <th className="px-4 py-3 text-right">Price (CAD)</th>
                  <th className="px-4 py-3 text-right">Value (CAD)</th>
                  <th className="px-4 py-3 text-right">P&L</th>
                  <th className="px-4 py-3 text-center">Outcome</th>
                  <th className="px-4 py-3 text-left">Reasoning</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((trade) => (
                  <>
                    <tr
                      key={trade.id}
                      className="border-b border-gray-700/50 hover:bg-gray-750 cursor-pointer transition-colors"
                      onClick={() => setExpandedId(expandedId === trade.id ? null : trade.id)}
                    >
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs whitespace-nowrap">
                        {new Date(trade.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-white">{trade.ticker}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-mono font-bold text-xs ${
                            trade.action === 'BUY' ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          {trade.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-300">{trade.shares}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-300">
                        ${trade.price?.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-300">
                        ${trade.tradeValue?.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {trade.pnl !== undefined && trade.pnl !== 0 ? (
                          <span className={trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-xs font-mono font-semibold px-2 py-0.5 rounded border ${
                            OUTCOME_BADGE[trade.outcome] || OUTCOME_BADGE.OPEN
                          }`}
                        >
                          {trade.outcome}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">
                        {trade.reasoning?.slice(0, 80)}
                        {trade.reasoning?.length > 80 ? '...' : ''}
                      </td>
                    </tr>
                    {expandedId === trade.id && (
                      <tr key={`${trade.id}-expanded`} className="bg-gray-850">
                        <td colSpan={9} className="px-6 py-4 text-gray-300 text-sm border-b border-gray-700/50">
                          <strong className="text-gray-400 block mb-1">Full Reasoning:</strong>
                          {trade.reasoning}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
