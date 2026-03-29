import { useStore } from '../store/useStore.js';

const USD_TO_CAD = 1.36;

export default function OpenPositions() {
  const positions = useStore((s) => s.portfolio.positions);
  const refreshPrices = useStore((s) => s.refreshPrices);
  const entries = Object.entries(positions);

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gray-400 text-sm uppercase tracking-wider font-medium">
          Open Positions ({entries.length})
        </h3>
        <button
          onClick={refreshPrices}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded border border-gray-600 hover:border-gray-400"
        >
          Refresh Prices
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="text-gray-500 text-sm py-4 text-center">No open positions</div>
      ) : (
        <div className="space-y-2">
          {entries.map(([ticker, pos]) => {
            const pnl = (pos.currentPrice - pos.avgCost) * pos.shares;
            const pnlCAD = pnl * USD_TO_CAD;
            const pnlPct = ((pos.currentPrice - pos.avgCost) / pos.avgCost) * 100;
            const isProfit = pnl >= 0;
            const positionValueCAD = pos.shares * pos.currentPrice * USD_TO_CAD;

            return (
              <div
                key={ticker}
                className={`flex items-center justify-between rounded-lg px-4 py-3 border ${
                  isProfit
                    ? 'bg-green-950/30 border-green-800/50'
                    : 'bg-red-950/30 border-red-800/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-white text-sm">{ticker}</span>
                  <span className="text-gray-400 text-xs">
                    {pos.shares} shares
                  </span>
                  <span className="text-gray-500 text-xs">
                    avg ${(pos.avgCost * USD_TO_CAD).toFixed(2)} CAD
                  </span>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <div className="font-mono text-sm text-white">
                      ${positionValueCAD.toFixed(2)} CAD
                    </div>
                    <div className="text-xs text-gray-500">
                      @ ${(pos.currentPrice * USD_TO_CAD).toFixed(2)} CAD
                    </div>
                  </div>
                  <div className={`font-mono text-sm font-semibold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                    {isProfit ? '+' : ''}{pnlCAD.toFixed(2)} CAD
                    <br />
                    <span className="text-xs">
                      ({isProfit ? '+' : ''}{pnlPct.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
