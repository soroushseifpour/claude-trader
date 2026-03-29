# Claude Trader — AI Paper Trading Dashboard
### Product Requirements Document (PRD)

---

## Overview

**Claude Trader** is a web-based paper trading dashboard where Claude autonomously researches markets, makes buy/sell decisions, and executes simulated trades using fake money. Users watch in real time and review Claude's full trading history — every trade, its reasoning, and the profit or loss.

---

## Problem Statement

Most AI trading demos are black boxes. Users want to see an AI actually reason through markets, place trades, and be accountable for its wins and losses — all without real money at risk.

---

## Target Users

- Retail investors curious how AI approaches markets
- Developers exploring AI-driven financial agents
- Finance enthusiasts who want an entertaining, educational tool

---

## Core Features

### 1. Autonomous AI Trading Engine
- Claude researches real stock tickers using live web search
- Claude decides **what to buy, how much, and when to sell** — fully autonomous
- Trades execute on a configurable schedule (e.g. every 30s, 1min, 5min)
- All decisions are based on Claude's own analysis — no user input required

### 2. Live Portfolio Dashboard (Homepage)
- **Portfolio Value** — total value of cash + open positions, updated in real time
- **Cash Balance** — how much paper money is available to deploy
- **Total P&L** — cumulative profit or loss since session start, shown in $ and %
- **Win Rate** — percentage of closed trades that were profitable
- **Equity Curve Chart** — line chart showing portfolio value over time

### 3. Trade History Table
Each row in the table shows one completed trade:

| Column | Description |
|---|---|
| Time | Timestamp of the trade |
| Ticker | Stock symbol (e.g. AAPL, TSLA) |
| Action | BUY or SELL |
| Shares | Number of shares traded |
| Price | Price per share at time of trade |
| Trade Value | Total $ value of the transaction |
| P&L | Profit or loss on this trade (SELL trades only) |
| Outcome | WIN / LOSS / OPEN badge |
| Claude's Reasoning | Short explanation of why Claude made this move |

### 4. Open Positions Panel
- Shows all currently held stocks
- Displays: ticker, shares held, average buy price, current price, unrealized P&L
- Color-coded green (profit) / red (loss)

### 5. Claude's Trading Log
- Real-time scrolling feed of Claude's thoughts
- Includes: research notes, market observations, why it passed on a trade, and decision rationale
- Types: `THINKING`, `BUY`, `SELL`, `HOLD`, `ERROR`

### 6. Controls
- **Start / Pause** trading at any time
- **Reset** — wipe the session and start fresh with $10,000
- **Speed selector** — set how often Claude trades (30s / 1min / 2min / 5min)
- **Starting capital selector** — $5K, $10K, $25K, $50K

---

## Technical Architecture

### Frontend
- Single-page application (HTML + JS or React)
- Chart.js for equity curve
- WebSocket or polling for live updates
- Responsive — works on desktop and tablet

### AI Layer
- Calls Anthropic API (`claude-sonnet-4-20250514`) with web search tool enabled
- Claude is given a system prompt defining its role as an autonomous paper trader
- Each trading cycle:
  1. Claude receives current portfolio state + cash balance
  2. Claude searches for market news and prices on 5–10 candidate stocks
  3. Claude returns a structured JSON decision: `{ action, ticker, shares, reasoning }`
  4. App executes the paper trade and updates state

### Data
- Paper prices fetched from a free public API (e.g. Yahoo Finance unofficial, Polygon.io free tier, or Alpha Vantage)
- All trade state stored in `localStorage` so the session persists on refresh
- No backend required — fully client-side

---

## Claude's Trading Persona (System Prompt Summary)

> You are an autonomous paper trader managing a $10,000 portfolio. Your goal is to grow the portfolio. Each cycle, you will receive the current portfolio state. You must search for relevant market news, identify opportunities, and return a single structured trade decision or HOLD. Justify every move. Be bold but not reckless. You track your own mistakes.

---

## Pages / Screens

### `/` — Dashboard
- Metric cards row (Portfolio Value, Cash, P&L, Win Rate, Trade Count)
- Equity curve chart
- Open positions panel
- Live trading log feed

### `/trades` — Trade History
- Full sortable/filterable table of all past trades
- Filter by: outcome (WIN/LOSS/OPEN), ticker, date range
- Summary stats at the top: total trades, total won, total lost, best trade, worst trade

### `/about` — How It Works
- Explains that Claude uses real AI reasoning + live market data
- Clarifies this is paper money only — no real funds involved

---

## Success Metrics

| Metric | Target |
|---|---|
| Session engagement | Users watch for 10+ minutes |
| Trade frequency | At least 1 trade per 2 minutes when running |
| Reasoning quality | Every trade has a 1–3 sentence rationale |
| Performance transparency | Win/loss visible within 1 click of any trade |

---

## Out of Scope (v1)

- Real brokerage integration
- User accounts or multi-user sessions
- Options, crypto, or forex (stocks only in v1)
- Mobile app

---

## Milestones

| Phase | Deliverable | Timeline |
|---|---|---|
| 1 | Static UI mockup (HTML/CSS) | Week 1 |
| 2 | Claude API integration + paper trade engine | Week 2 |
| 3 | Live price feed + trade history table | Week 3 |
| 4 | Polish, localStorage persistence, deploy to Vercel | Week 4 |

---

## Stack Recommendation

- **Frontend**: React + Tailwind CSS
- **AI**: Anthropic API with web search tool
- **Prices**: Polygon.io (free tier) or Alpha Vantage
- **Charts**: Recharts or Chart.js
- **Hosting**: Vercel (free tier)
- **State**: localStorage (no backend needed for v1)

---

*This is a paper trading simulator. No real money is used or at risk.*
