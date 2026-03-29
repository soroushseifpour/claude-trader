import { useStore } from '../store/useStore.js';

export default function BankruptModal() {
  const isBankrupt = useStore((s) => s.isBankrupt);
  const portfolio = useStore((s) => s.portfolio);
  const trades = useStore((s) => s.trades);
  const resetAll = useStore((s) => s.resetAll);
  const settings = useStore((s) => s.settings);

  if (!isBankrupt) return null;

  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.outcome === 'WIN').length;
  const losses = trades.filter((t) => t.outcome === 'LOSS').length;
  const finalValue = portfolio.totalValue ?? 0;
  const startingCapital = portfolio.startingCapital ?? settings.startingCapital;
  const totalLoss = finalValue - startingCapital;
  const totalLossPct = startingCapital > 0 ? ((totalLoss / startingCapital) * 100).toFixed(2) : '0.00';

  const handleReset = () => {
    if (window.confirm('Reset portfolio and start fresh with $500 CAD?')) {
      resetAll(500);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border-2 border-red-600 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl shadow-red-900/50">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-6xl mb-3">💀</div>
          <h1 className="text-4xl font-black text-red-500 tracking-tight uppercase">
            BANKRUPT
          </h1>
          <p className="text-gray-400 mt-2 text-sm">
            Your portfolio has been wiped out.
          </p>
        </div>

        {/* Stats */}
        <div className="bg-gray-800 rounded-xl p-4 space-y-3 mb-6 border border-gray-700">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Starting Capital</span>
            <span className="text-white font-mono font-bold">${startingCapital.toFixed(2)} CAD</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Final Value</span>
            <span className="text-red-400 font-mono font-bold">${finalValue.toFixed(2)} CAD</span>
          </div>
          <div className="flex justify-between text-sm border-t border-gray-700 pt-3">
            <span className="text-gray-400">Total Loss</span>
            <span className="text-red-400 font-mono font-bold">
              ${totalLoss.toFixed(2)} CAD ({totalLossPct}%)
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Total Trades</span>
            <span className="text-white font-mono">{totalTrades}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Win / Loss</span>
            <span className="font-mono">
              <span className="text-green-400">{wins}W</span>
              {' / '}
              <span className="text-red-400">{losses}L</span>
            </span>
          </div>
        </div>

        {/* Message */}
        <p className="text-center text-gray-500 text-xs mb-6 leading-relaxed">
          All trading has been halted. Claude has run out of capital.
          Review your trades to learn from this session.
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl transition-colors text-sm"
          >
            Start Fresh ($500 CAD)
          </button>
        </div>
      </div>
    </div>
  );
}
