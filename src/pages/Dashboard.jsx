import { useMemo, useEffect, useState } from 'react';
import { useStore } from '../store/useStore.js';
import MetricCard from '../components/MetricCard.jsx';
import EquityChart from '../components/EquityChart.jsx';
import OpenPositions from '../components/OpenPositions.jsx';
import TradingLog from '../components/TradingLog.jsx';
import Controls from '../components/Controls.jsx';
import DailyReports from '../components/DailyReports.jsx';
import { formatNextOpen, getTodayET, isMarketOpen } from '../lib/marketHours.js';

export default function Dashboard() {
  const portfolio = useStore((s) => s.portfolio);
  const trades = useStore((s) => s.trades);
  const isRunning = useStore((s) => s.isRunning);
  const isCycleRunning = useStore((s) => s.isCycleRunning);
  const marketOpen = useStore((s) => s.marketOpen);
  const nextMarketOpen = useStore((s) => s.nextMarketOpen);
  const getDayPnl = useStore((s) => s.getDayPnl);
  const getDayPnlPct = useStore((s) => s.getDayPnlPct);
  const githubMode = useStore((s) => s.githubMode);
  const githubLastUpdated = useStore((s) => s.githubLastUpdated);
  const fetchGitHubState = useStore((s) => s.fetchGitHubState);

  const [githubRefreshing, setGithubRefreshing] = useState(false);
  const [nextCycleMin, setNextCycleMin] = useState(null);

  // Fetch GitHub state on mount
  useEffect(() => {
    fetchGitHubState();
  }, [fetchGitHubState]);

  // Auto-refresh every 5 minutes while market is open
  useEffect(() => {
    if (!isMarketOpen()) return;
    const id = setInterval(() => {
      fetchGitHubState();
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchGitHubState]);

  // Calculate minutes until next scheduled bot cycle (on the hour :30 mark, hourly)
  useEffect(() => {
    function calcNext() {
      const now = new Date();
      const minNow = now.getMinutes();
      const secNow = now.getSeconds();
      // Bot runs at :30 past each hour
      const minUntil = minNow < 30
        ? 30 - minNow
        : 90 - minNow;
      const adjustedMin = minUntil - Math.round(secNow / 60);
      setNextCycleMin(Math.max(1, adjustedMin));
    }
    calcNext();
    const id = setInterval(calcNext, 30000);
    return () => clearInterval(id);
  }, []);

  async function handleGitHubRefresh() {
    setGithubRefreshing(true);
    await fetchGitHubState();
    setGithubRefreshing(false);
  }

  const today = getTodayET();
  const dayPnl = getDayPnl();
  const dayPnlPct = getDayPnlPct();

  const metrics = useMemo(() => {
    const pnl = portfolio.totalValue - portfolio.startingCapital;
    const pnlPct = (pnl / portfolio.startingCapital) * 100;
    const sells = trades.filter((t) => t.action === 'SELL');
    const wins = sells.filter((t) => t.outcome === 'WIN');
    const winRate = sells.length > 0 ? (wins.length / sells.length) * 100 : 0;

    return { pnl, pnlPct, winRate, tradeCount: trades.length };
  }, [portfolio, trades]);

  return (
    <div className="space-y-6">
      {/* GitHub Auto-Trading status */}
      <div className={`rounded-xl px-4 py-3 text-sm font-mono border flex items-center justify-between flex-wrap gap-2 ${
        githubMode
          ? 'bg-indigo-950/30 border-indigo-700 text-indigo-200'
          : 'bg-gray-800/40 border-gray-700 text-gray-500'
      }`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full inline-block shrink-0 ${
            githubMode && marketOpen ? 'bg-indigo-400 animate-pulse' : githubMode ? 'bg-indigo-600' : 'bg-gray-600'
          }`}></span>
          <span>
            {githubMode
              ? marketOpen
                ? `Bot Active — next cycle in ~${nextCycleMin ?? '?'}min`
                : 'Bot Standby — Market Closed'
              : 'GitHub Auto-Trading (loading...)'}
          </span>
          {githubLastUpdated && (
            <span className="text-xs text-indigo-400/60 ml-1">
              Last fetched: {new Date(githubLastUpdated).toLocaleTimeString()}
            </span>
          )}
        </div>
        <button
          onClick={handleGitHubRefresh}
          disabled={githubRefreshing}
          className="text-xs px-3 py-1 rounded-lg border border-indigo-700 bg-indigo-900/30 text-indigo-300 hover:bg-indigo-800/40 disabled:opacity-50 transition-colors"
        >
          {githubRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Market status banner */}
      <div className={`rounded-xl px-4 py-2.5 text-sm font-mono border flex items-center justify-between ${
        marketOpen
          ? 'bg-green-950/30 border-green-800 text-green-300'
          : 'bg-gray-800/60 border-gray-700 text-gray-400'
      }`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full inline-block ${marketOpen ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}></span>
          {marketOpen ? 'Market Open — NYSE/NASDAQ (9:30 AM – 4:00 PM ET)' : (
            <span>
              Market Closed
              {nextMarketOpen && (
                <span className="text-gray-500 ml-2">
                  — Opens {formatNextOpen(nextMarketOpen)}
                </span>
              )}
            </span>
          )}
        </div>
        <div className="text-gray-500 text-xs">{today}</div>
      </div>

      {/* Bot status banner */}
      {isRunning && (
        <div className={`rounded-xl px-4 py-2 text-sm font-mono border flex items-center gap-2 ${
          isCycleRunning
            ? 'bg-blue-950/40 border-blue-700 text-blue-300'
            : 'bg-green-950/40 border-green-700 text-green-300'
        }`}>
          <span className={`w-2 h-2 rounded-full inline-block ${isCycleRunning ? 'bg-blue-400 animate-pulse' : 'bg-green-400 animate-pulse'}`}></span>
          {isCycleRunning ? 'Claude is analyzing the market and searching for investment opportunities...' : 'Trading active — waiting for next cycle'}
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <MetricCard
          title="Portfolio Value"
          value={`$${portfolio.totalValue?.toFixed(2)} CAD`}
          subValue={`Started at $${portfolio.startingCapital} CAD`}
        />
        <MetricCard
          title="Cash Balance"
          value={`$${portfolio.cash?.toFixed(2)} CAD`}
          subValue={`${((portfolio.cash / portfolio.totalValue) * 100).toFixed(1)}% of portfolio`}
        />
        <MetricCard
          title="Total P&L"
          value={`${metrics.pnl >= 0 ? '+' : ''}$${metrics.pnl?.toFixed(2)} CAD`}
          subValue={`${metrics.pnlPct >= 0 ? '+' : ''}${metrics.pnlPct?.toFixed(2)}%`}
          positive={metrics.pnl > 0}
          negative={metrics.pnl < 0}
        />
        <MetricCard
          title="Today's P&L"
          value={`${dayPnl >= 0 ? '+' : ''}$${dayPnl?.toFixed(2)} CAD`}
          subValue={`${dayPnlPct >= 0 ? '+' : ''}${dayPnlPct?.toFixed(2)}% today`}
          positive={dayPnl > 0}
          negative={dayPnl < 0}
        />
        <MetricCard
          title="Win Rate"
          value={`${metrics.winRate.toFixed(1)}%`}
          subValue={`${trades.filter((t) => t.outcome === 'WIN').length}W / ${trades.filter((t) => t.outcome === 'LOSS').length}L`}
          positive={metrics.winRate >= 50}
          negative={metrics.winRate < 50 && trades.length > 0}
        />
        <MetricCard
          title="Trade Count"
          value={metrics.tradeCount}
          subValue={`${Object.keys(portfolio.positions).length} open position${Object.keys(portfolio.positions).length !== 1 ? 's' : ''}`}
        />
      </div>

      {/* Equity chart */}
      <EquityChart />

      {/* Two-column: positions + log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OpenPositions />
        <TradingLog />
      </div>

      {/* Controls */}
      <Controls />

      {/* Daily Reports */}
      <DailyReports />
    </div>
  );
}
