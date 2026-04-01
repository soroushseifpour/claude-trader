import { create } from 'zustand';
import { storage, DEFAULT_PORTFOLIO } from '../lib/storage.js';
import { runTradingCycle } from '../lib/trader.js';
import { fetchMultiplePrices } from '../lib/prices.js';
import {
  isMarketOpen,
  getNextMarketOpen,
  getNextMarketClose,
  formatNextOpen,
  getTodayET,
  msUntilNextOpen,
  msUntilClose,
} from '../lib/marketHours.js';
import {
  saveReportToCSV,
  loadReportsFromCSV,
  requestPermissionAndLoad,
  pickAndLoadCSV,
} from '../lib/csvReports.js';

const USD_TO_CAD = 1.36;

function calcPortfolioValue(portfolio) {
  const positionValue = Object.values(portfolio.positions).reduce((sum, pos) => {
    return sum + pos.shares * pos.currentPrice * USD_TO_CAD;
  }, 0);
  return portfolio.cash + positionValue;
}

export const useStore = create((set, get) => ({
  // ── Core State ──────────────────────────────────────────────────────────────
  portfolio: storage.getPortfolio(),
  trades: storage.getTrades(),
  log: storage.getLog(),
  equityCurve: storage.getEquityCurve(),
  settings: storage.getSettings(),
  reports: storage.getReports(),

  isRunning: false,
  intervalId: null,
  isCycleRunning: false,

  // Bankruptcy
  isBankrupt: false,

  // CSV persistence
  csvStatus: 'idle', // 'idle' | 'needs-permission' | 'connected' | 'error' | 'unsupported'
  csvFileName: null,

  // Market hours
  marketOpen: isMarketOpen(),
  nextMarketOpen: getNextMarketOpen(),
  nextMarketClose: getNextMarketClose(),

  // Market hours scheduler timer IDs
  _marketCheckId: null,
  _autoOpenId: null,
  _autoCloseId: null,

  // Day tracking: start-of-day portfolio value keyed by ET date string
  dayStartValue: null,
  dayStartDate: null,

  // ── GitHub Auto-Trading ──────────────────────────────────────────────────────
  githubMode: false,
  githubLastUpdated: null,

  // ── Settings ─────────────────────────────────────────────────────────────
  setSettings: (updates) => {
    const newSettings = { ...get().settings, ...updates };
    set({ settings: newSettings });
    storage.setSettings(newSettings);
  },

  // ── Logging ──────────────────────────────────────────────────────────────
  addLog: (entry) => {
    const newEntry = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      ...entry,
    };
    const log = [newEntry, ...get().log].slice(0, 200);
    set({ log });
    storage.setLog(log);
  },

  // ── Reset ────────────────────────────────────────────────────────────────
  resetAll: (startingCapital) => {
    const { stopTrading, stopMarketScheduler } = get();
    stopTrading();
    stopMarketScheduler();

    const capital = startingCapital || get().settings.startingCapital;
    const portfolio = DEFAULT_PORTFOLIO(capital);
    const settings = { ...get().settings, startingCapital: capital, isRunning: false };
    storage.clearAll();
    storage.setSettings(settings);

    const today = getTodayET();
    set({
      portfolio,
      trades: [],
      log: [],
      equityCurve: [{ time: new Date().toLocaleTimeString(), value: capital }],
      settings,
      isRunning: false,
      isBankrupt: false,
      reports: [],
      dayStartValue: capital,
      dayStartDate: today,
    });
    storage.setPortfolio(portfolio);
    storage.setEquityCurve([{ time: new Date().toLocaleTimeString(), value: capital }]);
    storage.setReports([]);

    // Re-init market scheduler
    get().initMarketScheduler();
  },

  // ── Equity curve ─────────────────────────────────────────────────────────
  updateEquityCurve: () => {
    const portfolio = get().portfolio;
    const value = calcPortfolioValue(portfolio);
    const curve = [
      ...get().equityCurve,
      { time: new Date().toLocaleTimeString(), value: parseFloat(value.toFixed(2)) },
    ].slice(-100);
    set({ equityCurve: curve });
    storage.setEquityCurve(curve);
  },

  // ── Day tracking ──────────────────────────────────────────────────────────
  ensureDayStart: () => {
    const today = getTodayET();
    const { dayStartDate, portfolio } = get();
    if (dayStartDate !== today) {
      const currentValue = calcPortfolioValue(portfolio);
      set({ dayStartValue: parseFloat(currentValue.toFixed(2)), dayStartDate: today });
    }
  },

  getDayPnl: () => {
    const { portfolio, dayStartValue } = get();
    const currentValue = calcPortfolioValue(portfolio);
    const start = dayStartValue ?? portfolio.startingCapital;
    return parseFloat((currentValue - start).toFixed(2));
  },

  getDayPnlPct: () => {
    const { portfolio, dayStartValue } = get();
    const currentValue = calcPortfolioValue(portfolio);
    const start = dayStartValue ?? portfolio.startingCapital;
    if (start === 0) return 0;
    return parseFloat((((currentValue - start) / start) * 100).toFixed(2));
  },

  // ── Bankruptcy check ──────────────────────────────────────────────────────
  checkBankruptcy: () => {
    const { portfolio, stopTrading, isBankrupt } = get();
    if (isBankrupt) return false;
    const totalValue = calcPortfolioValue(portfolio);
    if (totalValue <= 1) {
      stopTrading();
      set({ isBankrupt: true });
      get().addLog({ type: 'ERROR', message: 'BANKRUPT — Portfolio value fell below $1 CAD. All trading halted.' });
      return true;
    }
    return false;
  },

  // ── Reports ──────────────────────────────────────────────────────────────
  generateDailyReport: () => {
    const { portfolio, trades, log, dayStartValue, reports } = get();
    const today = getTodayET();

    // Find today's trades
    const todayTrades = trades.filter((t) => {
      if (!t.timestamp) return false;
      const tradeDate = getTodayET(new Date(t.timestamp));
      return tradeDate === today;
    });

    // Find last non-trivial reasoning for commentary
    const lastReasoningLog = [...log].find(
      (l) => (l.type === 'HOLD' || l.type === 'BUY' || l.type === 'SELL') && l.message?.length > 20
    );
    let commentary = '';
    if (lastReasoningLog) {
      const msg = lastReasoningLog.message;
      const dashIdx = msg.indexOf('—');
      const colonIdx = msg.indexOf(':');
      const startIdx = dashIdx !== -1 ? dashIdx + 1 : colonIdx !== -1 ? colonIdx + 1 : 0;
      commentary = msg.slice(startIdx).trim().slice(0, 300);
    }

    const endValue = parseFloat(calcPortfolioValue(portfolio).toFixed(2));
    const startValue = dayStartValue ?? portfolio.startingCapital;
    const dayPnl = parseFloat((endValue - startValue).toFixed(2));
    const dayPnlPct = startValue > 0 ? parseFloat((((dayPnl / startValue) * 100)).toFixed(2)) : 0;

    const report = {
      date: today,
      generatedAt: new Date().toLocaleTimeString(),
      startValue,
      endValue,
      dayPnl,
      dayPnlPct,
      tradesCount: todayTrades.length,
      trades: todayTrades.map((t) => ({
        action: t.action,
        ticker: t.ticker,
        shares: t.shares,
        price: t.price,
        pnl: t.pnl ?? 0,
      })),
      positionsSnapshot: JSON.parse(JSON.stringify(portfolio.positions)),
      commentary,
    };

    // Upsert: replace if same date exists, otherwise prepend
    const existing = reports.filter((r) => r.date !== today);
    const newReports = [report, ...existing];
    set({ reports: newReports });
    storage.setReports(newReports);

    get().addLog({ type: 'THINKING', message: `Daily report generated for ${today}: P&L ${dayPnl >= 0 ? '+' : ''}$${dayPnl} CAD (${dayPnlPct >= 0 ? '+' : ''}${dayPnlPct}%)` });

    // Persist to CSV (async, non-blocking — failures are logged inside saveReportToCSV)
    saveReportToCSV(report).then((handle) => {
      if (handle) {
        set({ csvStatus: 'connected', csvFileName: handle.name });
      }
    }).catch((err) => {
      console.error('[store] CSV save failed:', err);
    });

    return report;
  },

  // ── CSV report persistence ────────────────────────────────────────────────

  /**
   * Called on app load. Tries to read the stored file handle and load reports.
   * Sets csvStatus accordingly so the UI can show banners.
   */
  initCSVReports: async () => {
    const result = await loadReportsFromCSV();
    const { reports } = get();

    if (result.status === 'connected' && result.reports.length > 0) {
      // Merge: CSV rows take precedence for past days; keep any in-memory-only entries too
      const csvByDate = Object.fromEntries(result.reports.map((r) => [r.date, r]));
      const memByDate = Object.fromEntries(reports.map((r) => [r.date, r]));
      const merged = Object.values({ ...memByDate, ...csvByDate });
      merged.sort((a, b) => b.date.localeCompare(a.date));
      set({ reports: merged, csvStatus: 'connected', csvFileName: result.fileName });
      storage.setReports(merged);
    } else {
      set({ csvStatus: result.status, csvFileName: result.fileName ?? null });
    }
  },

  /**
   * Called when the user clicks the "Connect" button in the needs-permission banner.
   */
  reconnectCSV: async () => {
    const result = await requestPermissionAndLoad();
    const { reports } = get();

    if (result.status === 'connected' && result.reports.length > 0) {
      const csvByDate = Object.fromEntries(result.reports.map((r) => [r.date, r]));
      const memByDate = Object.fromEntries(reports.map((r) => [r.date, r]));
      const merged = Object.values({ ...memByDate, ...csvByDate });
      merged.sort((a, b) => b.date.localeCompare(a.date));
      set({ reports: merged, csvStatus: 'connected', csvFileName: result.fileName });
      storage.setReports(merged);
    } else {
      set({ csvStatus: result.status, csvFileName: result.fileName ?? null });
    }
  },

  /**
   * Called when the user clicks "Set reports file" in DailyReports panel.
   * Opens the open-file picker so they can select an existing CSV.
   */
  setCSVFile: async () => {
    const result = await pickAndLoadCSV();
    const { reports } = get();

    if (result.status === 'connected') {
      if (result.reports.length > 0) {
        const csvByDate = Object.fromEntries(result.reports.map((r) => [r.date, r]));
        const memByDate = Object.fromEntries(reports.map((r) => [r.date, r]));
        const merged = Object.values({ ...memByDate, ...csvByDate });
        merged.sort((a, b) => b.date.localeCompare(a.date));
        set({ reports: merged, csvStatus: 'connected', csvFileName: result.fileName });
        storage.setReports(merged);
      } else {
        set({ csvStatus: 'connected', csvFileName: result.fileName });
      }
    } else if (result.status !== 'no-handle') {
      // no-handle means user cancelled — don't change status
      set({ csvStatus: result.status });
    }
  },

  // ── Trade execution ───────────────────────────────────────────────────────
  executeTrade: (decision) => {
    const { portfolio, trades } = get();
    const { action, ticker, shares, price, reasoning } = decision;

    if (action === 'HOLD' || !ticker || shares <= 0) return null;

    const priceCAD = price * USD_TO_CAD;
    const tradeValue = shares * priceCAD;
    let newPortfolio = { ...portfolio };
    let trade = null;

    if (action === 'BUY') {
      if (tradeValue > portfolio.cash) {
        get().addLog({
          type: 'ERROR',
          message: `Insufficient funds for ${shares} ${ticker} @ $${priceCAD.toFixed(2)} CAD (need $${tradeValue.toFixed(2)}, have $${portfolio.cash.toFixed(2)})`,
        });
        return null;
      }

      const existingPos = portfolio.positions[ticker];
      const newShares = (existingPos?.shares || 0) + shares;
      const newAvgCost =
        existingPos
          ? (existingPos.avgCost * existingPos.shares + price * shares) / newShares
          : price;

      newPortfolio = {
        ...portfolio,
        cash: portfolio.cash - tradeValue,
        positions: {
          ...portfolio.positions,
          [ticker]: {
            shares: newShares,
            avgCost: parseFloat(newAvgCost.toFixed(4)),
            currentPrice: price,
          },
        },
      };

      trade = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        action: 'BUY',
        ticker,
        shares,
        price: priceCAD,
        priceUSD: price,
        tradeValue: parseFloat(tradeValue.toFixed(2)),
        pnl: 0,
        outcome: 'OPEN',
        reasoning,
      };

      get().addLog({
        type: 'BUY',
        message: `BUY ${shares} ${ticker} @ $${priceCAD.toFixed(2)} CAD ($${price.toFixed(2)} USD) = $${tradeValue.toFixed(2)} CAD | ${reasoning.slice(0, 100)}`,
      });
    } else if (action === 'SELL') {
      const position = portfolio.positions[ticker];
      if (!position || position.shares < shares) {
        get().addLog({
          type: 'ERROR',
          message: `Cannot sell ${shares} ${ticker} — only own ${position?.shares || 0} shares`,
        });
        return null;
      }

      const pnl = (price - position.avgCost) * shares * USD_TO_CAD;
      const pnlPct = ((price - position.avgCost) / position.avgCost) * 100;
      const outcome = pnl >= 0 ? 'WIN' : 'LOSS';

      const remainingShares = position.shares - shares;
      const newPositions = { ...portfolio.positions };
      if (remainingShares <= 0) {
        delete newPositions[ticker];
      } else {
        newPositions[ticker] = { ...position, shares: remainingShares };
      }

      newPortfolio = {
        ...portfolio,
        cash: portfolio.cash + tradeValue,
        positions: newPositions,
      };

      trade = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        action: 'SELL',
        ticker,
        shares,
        price: priceCAD,
        priceUSD: price,
        tradeValue: parseFloat(tradeValue.toFixed(2)),
        pnl: parseFloat(pnl.toFixed(2)),
        pnlPct: parseFloat(pnlPct.toFixed(2)),
        outcome,
        reasoning,
      };

      get().addLog({
        type: 'SELL',
        message: `SELL ${shares} ${ticker} @ $${priceCAD.toFixed(2)} CAD | P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} CAD (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%) [${outcome}]`,
      });

      const updatedTrades = trades.map((t) => {
        if (t.ticker === ticker && t.action === 'BUY' && t.outcome === 'OPEN') {
          return { ...t, outcome };
        }
        return t;
      });
      set({ trades: updatedTrades });
      storage.setTrades(updatedTrades);
    }

    // Update total value
    const totalValue = calcPortfolioValue(newPortfolio);
    newPortfolio.totalValue = parseFloat(totalValue.toFixed(2));
    newPortfolio.peakValue = Math.max(portfolio.peakValue || portfolio.startingCapital, totalValue);

    set({ portfolio: newPortfolio });
    storage.setPortfolio(newPortfolio);

    if (trade) {
      const newTrades = [...trades, trade];
      set({ trades: newTrades });
      storage.setTrades(newTrades);
    }

    get().updateEquityCurve();

    // Bankruptcy check after every trade
    get().checkBankruptcy();

    return trade;
  },

  // ── Trading cycle ─────────────────────────────────────────────────────────
  runCycle: async () => {
    if (get().isCycleRunning) return;
    if (get().isBankrupt) return;

    set({ isCycleRunning: true });
    get().ensureDayStart();

    try {
      const { portfolio, trades } = get();
      const decision = await runTradingCycle(portfolio, trades, get().addLog);
      if (decision && decision.action !== 'HOLD') {
        get().executeTrade(decision);
      }
      // Also check bankruptcy even on HOLD (prices may have moved)
      get().checkBankruptcy();
    } catch (err) {
      get().addLog({ type: 'ERROR', message: `Cycle error: ${err?.message || err}` });
    } finally {
      set({ isCycleRunning: false });
    }
  },

  // ── Start / Stop trading (manual or scheduled) ────────────────────────────
  startTrading: () => {
    if (get().isRunning) return;
    if (get().isBankrupt) return;
    const speed = get().settings.speed;
    const speedLabel = speed >= 3600000
      ? `${speed / 3600000}hr`
      : speed >= 60000
      ? `${speed / 60000}min`
      : `${speed / 1000}s`;
    get().addLog({ type: 'THINKING', message: `Trading started. Cycle interval: ${speedLabel}` });
    get().ensureDayStart();

    // Run immediately
    get().runCycle();

    const id = setInterval(() => {
      get().runCycle();
    }, speed);

    set({ isRunning: true, intervalId: id });
  },

  stopTrading: () => {
    const { intervalId } = get();
    if (intervalId) clearInterval(intervalId);
    set({ isRunning: false, intervalId: null, isCycleRunning: false });
    get().addLog({ type: 'THINKING', message: 'Trading paused.' });
  },

  // ── Market hours scheduler ────────────────────────────────────────────────
  initMarketScheduler: () => {
    // Clear any existing scheduler timers
    get().stopMarketScheduler();

    const checkAndSchedule = () => {
      const now = new Date();
      const open = isMarketOpen(now);

      set({
        marketOpen: open,
        nextMarketOpen: getNextMarketOpen(now),
        nextMarketClose: getNextMarketClose(now),
      });

      // Schedule auto-open
      if (!open) {
        const msToOpen = msUntilNextOpen(now);
        if (msToOpen > 0 && msToOpen < 24 * 60 * 60 * 1000) {
          const openId = setTimeout(() => {
            const { isRunning, isBankrupt } = get();
            if (!isBankrupt) {
              set({ marketOpen: true, nextMarketClose: getNextMarketClose(new Date()) });
              get().addLog({ type: 'THINKING', message: 'Market opened (9:30 AM ET). Auto-starting trading.' });
              get().ensureDayStart();
              if (!isRunning) {
                get().startTrading();
              }
            }
            // Re-schedule for next cycle
            setTimeout(checkAndSchedule, 5000);
          }, msToOpen);
          set({ _autoOpenId: openId });
        }
      }

      // Schedule auto-close
      if (open) {
        const msToClose = msUntilClose(now);
        if (msToClose > 0 && msToClose < 24 * 60 * 60 * 1000) {
          const closeId = setTimeout(() => {
            set({ marketOpen: false, nextMarketOpen: getNextMarketOpen(new Date()) });
            get().addLog({ type: 'THINKING', message: 'Market closed (4:00 PM ET). Auto-stopping trading and generating report.' });
            get().stopTrading();
            get().generateDailyReport();
            // Re-schedule for next open
            setTimeout(checkAndSchedule, 5000);
          }, msToClose);
          set({ _autoCloseId: closeId });
        }
      }
    };

    checkAndSchedule();

    // Also poll every minute to keep the market status badge fresh
    const pollId = setInterval(() => {
      const now = new Date();
      set({
        marketOpen: isMarketOpen(now),
        nextMarketOpen: getNextMarketOpen(now),
        nextMarketClose: getNextMarketClose(now),
      });
    }, 60000);

    set({ _marketCheckId: pollId });
  },

  stopMarketScheduler: () => {
    const { _marketCheckId, _autoOpenId, _autoCloseId } = get();
    if (_marketCheckId) clearInterval(_marketCheckId);
    if (_autoOpenId) clearTimeout(_autoOpenId);
    if (_autoCloseId) clearTimeout(_autoCloseId);
    set({ _marketCheckId: null, _autoOpenId: null, _autoCloseId: null });
  },

  // ── GitHub state fetch ────────────────────────────────────────────────────
  fetchGitHubState: async () => {
    const base = 'https://raw.githubusercontent.com/soroushseifpour/claude-trader/master/data';
    const ts = Date.now();
    try {
      const [portfolioRes, reportsRes] = await Promise.all([
        fetch(`${base}/portfolio.json?t=${ts}`),
        fetch(`${base}/reports.json?t=${ts}`),
      ]);

      if (!portfolioRes.ok) throw new Error(`portfolio.json fetch failed: ${portfolioRes.status}`);
      if (!reportsRes.ok) throw new Error(`reports.json fetch failed: ${reportsRes.status}`);

      const githubPortfolio = await portfolioRes.json();
      const githubReports = await reportsRes.json();

      set({
        portfolio: githubPortfolio,
        trades: Array.isArray(githubPortfolio.trades) ? githubPortfolio.trades : [],
        log: Array.isArray(githubPortfolio.log) ? githubPortfolio.log : [],
        equityCurve: Array.isArray(githubPortfolio.equityCurve) ? githubPortfolio.equityCurve : [],
        reports: Array.isArray(githubReports) ? githubReports : [],
        isBankrupt: githubPortfolio.isBankrupt ?? false,
        dayStartValue: githubPortfolio.dayStartValue ?? null,
        dayStartDate: githubPortfolio.dayStartDate ?? null,
        githubMode: true,
        githubLastUpdated: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[store] fetchGitHubState failed:', err);
      // Don't set githubMode on failure — keep existing state
    }
  },

  // ── Price refresh ─────────────────────────────────────────────────────────
  refreshPrices: async () => {
    const { portfolio } = get();
    const tickers = Object.keys(portfolio.positions);
    if (tickers.length === 0) return;

    try {
      const prices = await fetchMultiplePrices(tickers);

      const updatedPositions = { ...portfolio.positions };
      for (const [ticker, data] of Object.entries(prices)) {
        if (data && updatedPositions[ticker]) {
          updatedPositions[ticker] = { ...updatedPositions[ticker], currentPrice: data.price };
        }
      }

      const newPortfolio = { ...portfolio, positions: updatedPositions };
      const totalValue = calcPortfolioValue(newPortfolio);
      newPortfolio.totalValue = parseFloat(totalValue.toFixed(2));

      set({ portfolio: newPortfolio });
      storage.setPortfolio(newPortfolio);
    } catch (err) {
      console.error('Failed to refresh prices:', err);
    }
  },
}));
