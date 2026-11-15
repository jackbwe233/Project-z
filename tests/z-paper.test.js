import { describe, it, expect } from "vitest";
import {
  START_CENTS, PAPER_KEY, emptyPaper, parsePaper, normalizeTicker, toCents,
  money, paperSummary, previewPaperTrade, applyPaperTrade, markPaperHolding,
} from "../lib/z-paper.js";

describe("Project Z paper-trading sandbox", () => {
  it("starts with fictional $100,000 and no brokerage functionality", () => {
    const state = emptyPaper();
    expect(PAPER_KEY).toMatch(/paper/);
    expect(state.cashCents).toBe(10_000_000);
    expect(START_CENTS).toBe(10_000_000);
    expect(state.positions).toEqual([]);
    expect(state.trades).toEqual([]);
    expect(paperSummary(state).performanceCents).toBe(0);
  });
  it("converts manual prices to integer cents without float errors", () => {
    expect(toCents("125.75")).toBe(12575);
    expect(toCents("0.01")).toBe(1);
    expect(toCents("100")).toBe(10000);
    expect(money(12575)).toBe("$125.75");
    expect(() => toCents("1.999")).toThrow();
    expect(() => toCents("-1")).toThrow();
    expect(() => toCents("abc")).toThrow();
  });
  it("records a reviewed buy, simulated fill and paper cash correctly", () => {
    const a = emptyPaper();
    const order = { symbol:"aapl",side:"buy",shares:10,priceCents:12575 };
    const preview = previewPaperTrade(a, order);
    expect(preview.simulated).toBe(true);
    expect(preview.remainingCashCents).toBe(10000000 - 125750);
    const b = applyPaperTrade(a, order, "2026-11-14T00:00:00.000Z");
    expect(a.trades.length).toBe(0);
    expect(b.positions[0]).toEqual({
      symbol:"AAPL",shares:10,costBasisCents:125750,markCents:12575,
    });
    expect(b.trades[0].grossCents).toBe(125750);
    expect(b.cashCents).toBe(9874250);
    expect(paperSummary(b).performanceCents).toBe(0);
  });
  it("rejects unsupported shorts, overdrafts and nonsensical paper orders", () => {
    const a = emptyPaper();
    expect(() => previewPaperTrade(a, {symbol:"AAPL",side:"sell",shares:1,priceCents:10000})).toThrow(/Cannot sell/);
    expect(() => previewPaperTrade(a, {symbol:"AAPL",side:"buy",shares:10000,priceCents:1000000})).toThrow(/Not enough/);
    expect(() => previewPaperTrade(a, {symbol:"AAPL",side:"buy",shares:-2,priceCents:10000})).toThrow(/quantity/);
    expect(() => previewPaperTrade(a, {symbol:"AAPL",side:"buy",shares:1.1,priceCents:10000})).toThrow(/quantity/);
    expect(() => previewPaperTrade(a, {symbol:"AAPL",side:"buy",shares:1,priceCents:0})).toThrow(/positive/);
    expect(() => normalizeTicker("foo<script>")).toThrow(/ticker/);
  });
  it("sells only held shares, accurately prorates cost basis and records realized paper P/L", () => {
    const a = applyPaperTrade(emptyPaper(), {symbol:"AAPL",side:"buy",shares:10,priceCents:12575});
    const b = applyPaperTrade(a, {symbol:"AAPL",side:"sell",shares:4,priceCents:13000});
    expect(b.positions[0].shares).toBe(6);
    expect(b.positions[0].costBasisCents).toBe(75450);
    expect(b.trades[0].realizedCents).toBe(1700);
    expect(b.cashCents).toBe(9874250 + 52000);
    const c = markPaperHolding(b, "aapl", 15000);
    expect(paperSummary(c).unrealizedCents).toBe(14550);
    const d = applyPaperTrade(c, {symbol:"AAPL",side:"sell",shares:6,priceCents:15000});
    expect(d.positions).toEqual([]);
    expect(d.cashCents).toBe(9874250 + 52000 + 90000);
    expect(d.trades[0].realizedCents).toBe(14550);
  });
  it("requires an existing holding before updating reference prices", () => {
    expect(() => markPaperHolding(emptyPaper(), "TSLA", 20000)).toThrow(/No simulated shares/);
    const b = applyPaperTrade(emptyPaper(), {symbol:"TSLA",side:"buy",shares:2,priceCents:10000});
    const c = markPaperHolding(b,"TSLA",12000);
    expect(paperSummary(c).performanceCents).toBe(4000);
    expect(b.positions[0].markCents).toBe(10000);
  });
  it("accepts valid local backups and rejects corrupted or oversized portfolios", () => {
    const a = applyPaperTrade(emptyPaper(), {symbol:"MSFT",side:"buy",shares:2,priceCents:10000});
    expect(parsePaper(JSON.parse(JSON.stringify(a)))).toEqual(a);
    expect(() => parsePaper({})).toThrow(/Invalid/);
    expect(() => parsePaper({...a,positions:[...a.positions,...a.positions]})).toThrow(/Duplicate/);
    expect(() => parsePaper({...a, trades: Array(501).fill(a.trades[0])})).toThrow(/Invalid/);
  });
});
