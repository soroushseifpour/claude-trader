import { useStore } from '../store/useStore.js';

const SPEED_OPTIONS = [
  { label: '15 min', value: 900000 },
  { label: '30 min', value: 1800000 },
  { label: '1 hr', value: 3600000 },
  { label: '2 hr', value: 7200000 },
];

const CAPITAL_OPTIONS = [250, 500, 1000, 2500];

export default function Controls() {
  const isRunning = useStore((s) => s.isRunning);
  const isCycleRunning = useStore((s) => s.isCycleRunning);
  const settings = useStore((s) => s.settings);
  const startTrading = useStore((s) => s.startTrading);
  const stopTrading = useStore((s) => s.stopTrading);
  const setSettings = useStore((s) => s.setSettings);
  const resetAll = useStore((s) => s.resetAll);

  const handleReset = () => {
    if (isRunning) stopTrading();
    if (window.confirm('Reset all trading data? This cannot be undone.')) {
      resetAll(settings.startingCapital);
    }
  };

  const handleCapitalChange = (capital) => {
    if (isRunning) {
      alert('Stop trading before changing starting capital.');
      return;
    }
    setSettings({ startingCapital: capital });
    if (window.confirm(`Change starting capital to $${capital} CAD and reset portfolio?`)) {
      resetAll(capital);
    }
  };

  const apiKeySet = !!import.meta.env.VITE_ANTHROPIC_API_KEY;

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <h3 className="text-gray-400 text-sm uppercase tracking-wider font-medium mb-4">Controls</h3>

      {!apiKeySet && (
        <div className="mb-4 px-3 py-2 bg-red-950/40 border border-red-700 rounded-lg text-red-400 text-xs font-mono">
          ⚠ VITE_ANTHROPIC_API_KEY not set. Add it to your .env file to enable trading.
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        {/* Start/Stop */}
        <button
          onClick={isRunning ? stopTrading : startTrading}
          disabled={!apiKeySet || isCycleRunning}
          className={`px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${
            isRunning
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed'
          }`}
        >
          {isCycleRunning ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse inline-block"></span>
              Thinking...
            </span>
          ) : isRunning ? (
            '⏸ Pause'
          ) : (
            '▶ Start Trading'
          )}
        </button>

        {/* Speed selector */}
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-xs">Interval:</span>
          <div className="flex rounded-lg overflow-hidden border border-gray-600">
            {SPEED_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setSettings({ speed: opt.value });
                  if (isRunning) {
                    stopTrading();
                    setTimeout(() => startTrading(), 100);
                  }
                }}
                className={`px-3 py-1.5 text-xs font-mono transition-colors ${
                  settings.speed === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Capital selector */}
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-xs">Capital:</span>
          <div className="flex rounded-lg overflow-hidden border border-gray-600">
            {CAPITAL_OPTIONS.map((cap) => (
              <button
                key={cap}
                onClick={() => handleCapitalChange(cap)}
                className={`px-3 py-1.5 text-xs font-mono transition-colors ${
                  settings.startingCapital === cap
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                ${cap}
              </button>
            ))}
          </div>
        </div>

        {/* Reset */}
        <button
          onClick={handleReset}
          className="ml-auto px-4 py-2 rounded-lg text-xs text-gray-400 border border-gray-600 hover:border-red-500 hover:text-red-400 transition-colors"
        >
          Reset
        </button>
      </div>

      {isRunning && (
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block"></span>
          Trading active — cycle interval:{' '}
          {settings.speed >= 3600000
            ? `${settings.speed / 3600000}hr`
            : `${settings.speed / 60000}min`}
        </div>
      )}
    </div>
  );
}
