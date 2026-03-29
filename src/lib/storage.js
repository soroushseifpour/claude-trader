const KEYS = {
  PORTFOLIO: 'ct_portfolio',
  TRADES: 'ct_trades',
  LOG: 'ct_log',
  EQUITY_CURVE: 'ct_equity_curve',
  SETTINGS: 'ct_settings',
  REPORTS: 'claude_trader_reports',
};

export const DEFAULT_SETTINGS = {
  startingCapital: 500,
  speed: 3600000, // 1 hour in ms (default for investing mode)
  isRunning: false,
};

export const DEFAULT_PORTFOLIO = (startingCapital = 500) => ({
  cash: startingCapital,
  startingCapital,
  positions: {}, // { TICKER: { shares, avgCost, currentPrice } }
  totalValue: startingCapital,
  peakValue: startingCapital,
});

function safeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('localStorage write failed:', e);
  }
}

export const storage = {
  getPortfolio: () => safeGet(KEYS.PORTFOLIO, DEFAULT_PORTFOLIO()),
  setPortfolio: (p) => safeSet(KEYS.PORTFOLIO, p),

  getTrades: () => safeGet(KEYS.TRADES, []),
  setTrades: (t) => safeSet(KEYS.TRADES, t),

  getLog: () => safeGet(KEYS.LOG, []),
  setLog: (l) => safeSet(KEYS.LOG, l),

  getEquityCurve: () => safeGet(KEYS.EQUITY_CURVE, []),
  setEquityCurve: (c) => safeSet(KEYS.EQUITY_CURVE, c),

  getSettings: () => safeGet(KEYS.SETTINGS, DEFAULT_SETTINGS),
  setSettings: (s) => safeSet(KEYS.SETTINGS, s),

  getReports: () => safeGet(KEYS.REPORTS, []),
  setReports: (r) => safeSet(KEYS.REPORTS, r),

  clearAll: () => {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  },
};
