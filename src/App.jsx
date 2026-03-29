import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Trades from './pages/Trades.jsx';
import About from './pages/About.jsx';
import BankruptModal from './components/BankruptModal.jsx';
import { useStore } from './store/useStore.js';
import { formatNextOpen } from './lib/marketHours.js';

function MarketStatusBadge() {
  const marketOpen = useStore((s) => s.marketOpen);
  const nextMarketOpen = useStore((s) => s.nextMarketOpen);

  if (marketOpen) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-green-700 bg-green-950/40 text-green-300 text-xs font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
        OPEN
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-red-800 bg-red-950/40 text-red-300 text-xs font-mono">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
      <span className="hidden sm:inline">CLOSED — Opens {nextMarketOpen ? formatNextOpen(nextMarketOpen) : '...'}</span>
      <span className="sm:hidden">CLOSED</span>
    </div>
  );
}

function NavBar() {
  const isRunning = useStore((s) => s.isRunning);
  const isCycleRunning = useStore((s) => s.isCycleRunning);
  const portfolio = useStore((s) => s.portfolio);
  const pnl = portfolio.totalValue - portfolio.startingCapital;

  return (
    <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center">
            <span className="text-white text-sm font-bold">C</span>
          </div>
          <div>
            <span className="text-white font-bold text-lg tracking-tight">Claude Trader</span>
            <span className="text-gray-500 text-xs ml-2 font-mono">investing</span>
          </div>
        </div>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {[
            { to: '/', label: 'Dashboard' },
            { to: '/trades', label: 'Trades' },
            { to: '/about', label: 'About' },
          ].map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        {/* Right side: market status + bot status + value */}
        <div className="flex items-center gap-2 text-xs font-mono">
          {/* Market status badge */}
          <MarketStatusBadge />

          {/* Bot status */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${
              isCycleRunning
                ? 'border-blue-700 bg-blue-950/40 text-blue-300'
                : isRunning
                ? 'border-green-700 bg-green-950/40 text-green-300'
                : 'border-gray-700 bg-gray-800 text-gray-400'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isCycleRunning
                  ? 'bg-blue-400 animate-pulse'
                  : isRunning
                  ? 'bg-green-400 animate-pulse'
                  : 'bg-gray-500'
              }`}
            ></span>
            {isCycleRunning ? 'Thinking' : isRunning ? 'Live' : 'Paused'}
          </div>

          {/* Portfolio value */}
          <div
            className={`hidden md:block font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}
          >
            ${portfolio.totalValue?.toFixed(2)} CAD
          </div>
        </div>
      </div>
    </nav>
  );
}

function CSVPermissionBanner() {
  const csvStatus = useStore((s) => s.csvStatus);
  const reconnectCSV = useStore((s) => s.reconnectCSV);

  if (csvStatus !== 'needs-permission') return null;

  return (
    <div className="bg-blue-950/70 border-b border-blue-800 px-4 py-2 flex items-center justify-between gap-4">
      <span className="text-blue-300 text-sm">
        📂 Saved reports found — click to reconnect your reports file
      </span>
      <button
        onClick={reconnectCSV}
        className="shrink-0 px-3 py-1 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold transition-colors"
      >
        Connect
      </button>
    </div>
  );
}

export default function App() {
  const initMarketScheduler = useStore((s) => s.initMarketScheduler);
  const stopMarketScheduler = useStore((s) => s.stopMarketScheduler);
  const ensureDayStart = useStore((s) => s.ensureDayStart);
  const initCSVReports = useStore((s) => s.initCSVReports);

  useEffect(() => {
    // Initialize day tracking
    ensureDayStart();
    // Start market hours scheduler
    initMarketScheduler();
    // Try to load saved CSV reports
    initCSVReports();

    return () => {
      stopMarketScheduler();
    };
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-900">
        <NavBar />
        <CSVPermissionBanner />
        <main className="max-w-7xl mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/trades" element={<Trades />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </main>
        {/* Bankruptcy modal — rendered at root so it overlays everything */}
        <BankruptModal />
      </div>
    </BrowserRouter>
  );
}
