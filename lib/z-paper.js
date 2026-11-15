/**
 * Project Z paper-trading engine.
 * All balances, prices and fills are simulated, user-supplied and stored locally.
 * There are intentionally NO brokerage credentials, real orders, margin or short sales.
 */
export const PAPER_KEY = "project-z:paper-account:v1";
export const START_CENTS = 100_000_00;
const integer = (n, lo, hi) => Number.isSafeInteger(n) && n >= lo && n <= hi;
export const normalizeTicker = raw => {
  const symbol = String(raw || "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) throw Error("Enter a stock ticker (up to 12 characters).");
  return symbol;
};
export const emptyPaper = () => ({
  initialCents: START_CENTS,
  cashCents: START_CENTS,
  positions: [],
  trades: [],
  watchlist: [],
});
export function toCents(raw) {
  const s = String(raw ?? "").trim();
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(s)) throw Error("Enter a positive price with up to two decimal places.");
  const [dollars, cents = ""] = s.split(".");
  const amount = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
  if (!integer(amount, 1, 100000000)) throw Error("Price must be between $0.01 and $1,000,000.");
  return amount;
}
export const money = cents => (Number(cents) / 100).toLocaleString("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
});
function normalizedOrder(raw) {
  const symbol = normalizeTicker(raw?.symbol);
  const side = raw?.side;
  if (side !== "buy" && side !== "sell") throw Error("Select Buy or Sell.");
  const shares = Number(raw?.shares);
  if (!integer(shares, 1, 10000)) throw Error("Enter a whole-number quantity between 1 and 10,000.");
  const priceCents = raw?.priceCents;
  if (!integer(priceCents, 1, 100000000)) throw Error("Enter a valid positive simulated price.");
  const grossCents = shares * priceCents;
  if (!integer(grossCents, 1, 1000000000000)) throw Error("Simulated order is too large.");
  return { symbol, side, shares, priceCents, grossCents };
}
export function parsePaper(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("Invalid paper portfolio.");
  if (raw.initialCents !== START_CENTS || !integer(raw.cashCents, 0, 1000000000000) ||
      !Array.isArray(raw.positions) || raw.positions.length > 50 ||
      !Array.isArray(raw.trades) || raw.trades.length > 500 ||
      !Array.isArray(raw.watchlist) || raw.watchlist.length > 40) throw Error("Invalid paper portfolio.");
  const seen = new Set();
  const positions = raw.positions.map(p => {
    const symbol = normalizeTicker(p.symbol);
    if (seen.has(symbol)) throw Error("Duplicate paper holding.");
    seen.add(symbol);
    if (!integer(p.shares, 1, 1000000) ||
        !integer(p.costBasisCents, 1, 1000000000000) ||
        !integer(p.markCents, 1, 100000000)) throw Error("Invalid paper holding.");
    return { symbol, shares: p.shares, costBasisCents: p.costBasisCents, markCents: p.markCents };
  });
  const trades = raw.trades.map(t => {
    if (!t || !["buy", "sell"].includes(t.side) || !integer(t.shares, 1, 10000) ||
        !integer(t.priceCents, 1, 100000000) || !integer(t.grossCents, 1, 1000000000000) ||
        !integer(t.realizedCents, -1000000000000, 1000000000000) ||
        !Number.isFinite(Date.parse(t.timestamp))) throw Error("Invalid paper trade history.");
    return {
      id: String(t.id).slice(0, 80), symbol: normalizeTicker(t.symbol),
      side: t.side, shares: t.shares, priceCents: t.priceCents,
      grossCents: t.grossCents, realizedCents: t.realizedCents,
      timestamp: new Date(t.timestamp).toISOString()
    };
  });
  const watchlist = [...new Set(raw.watchlist.map(normalizeTicker))].slice(0, 40);
  return { initialCents: START_CENTS, cashCents: raw.cashCents, positions, trades, watchlist };
}
export function paperSummary(account) {
  const valid = parsePaper(account);
  const holdingsCents = valid.positions.reduce((n, p) => n + p.shares * p.markCents, 0);
  const unrealizedCents = valid.positions.reduce((n, p) => n + p.shares * p.markCents - p.costBasisCents, 0);
  const equityCents = holdingsCents + valid.cashCents;
  return {
    cashCents: valid.cashCents, holdingsCents, equityCents,
    unrealizedCents, performanceCents: equityCents - START_CENTS,
  };
}
export function previewPaperTrade(account, raw) {
  const valid = parsePaper(account);
  const order = normalizedOrder(raw);
  const p = valid.positions.find(p => p.symbol === order.symbol);
  if (order.side === "buy" && valid.cashCents < order.grossCents) throw Error("Not enough simulated cash.");
  if (order.side === "buy" && !p && valid.positions.length >= 50) throw Error("50 holding limit reached.");
  if (order.side === "sell" && (!p || p.shares < order.shares)) throw Error("Cannot sell more paper shares than you hold.");
  if (valid.trades.length >= 500) throw Error("Paper history limit reached. Export and reset to continue.");
  return {
    ...order,
    remainingCashCents: valid.cashCents + (order.side === "buy" ? -order.grossCents : order.grossCents),
    simulated: true,
  };
}
export function applyPaperTrade(account, raw, timestamp = new Date().toISOString()) {
  const preview = previewPaperTrade(account, raw);
  if (!Number.isFinite(Date.parse(timestamp))) throw Error("Invalid trade time.");
  const next = parsePaper(account);
  const { symbol, side, shares, priceCents, grossCents } = preview;
  const p = next.positions.find(p => p.symbol === symbol);
  let realizedCents = 0;
  if (side === "buy") {
    next.cashCents -= grossCents;
    if (p) {
      p.shares += shares;
      p.costBasisCents += grossCents;
      p.markCents = priceCents;
    } else next.positions.push({ symbol, shares, costBasisCents: grossCents, markCents: priceCents });
  } else {
    next.cashCents += grossCents;
    const removedBasis = shares === p.shares
      ? p.costBasisCents : Math.round(p.costBasisCents * shares / p.shares);
    realizedCents = grossCents - removedBasis;
    p.shares -= shares;
    p.costBasisCents -= removedBasis;
    p.markCents = priceCents;
    if (!p.shares) next.positions = next.positions.filter(x => x.symbol !== symbol);
  }
  next.trades.unshift({
    id: globalThis.crypto?.randomUUID?.() || (Date.now() + "-" + Math.random()),
    timestamp: new Date(timestamp).toISOString(),
    symbol, side, shares, priceCents, grossCents, realizedCents,
  });
  return next;
}
export function markPaperHolding(account, symbol, priceCents) {
  const next = parsePaper(account);
  const name = normalizeTicker(symbol);
  if (!integer(priceCents, 1, 100000000)) throw Error("Invalid reference price.");
  const p = next.positions.find(x => x.symbol === name);
  if (!p) throw Error("No simulated shares of " + name + " are held.");
  p.markCents = priceCents;
  return next;
}
