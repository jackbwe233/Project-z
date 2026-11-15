import {
  PAPER_KEY, emptyPaper, parsePaper, toCents, money,
  paperSummary, previewPaperTrade, applyPaperTrade, markPaperHolding, normalizeTicker,
} from "./lib/z-paper.js";
import { stockIdentity, researchStock, researchDraft } from "./lib/z-research.js";
import { ExaMcpSearchProvider } from "./lib/exa-search.js";

const $ = id => document.getElementById(id);
const make = (tag, value) => {
  const el = document.createElement(tag);
  if (value !== undefined) el.textContent = String(value);
  return el;
};
const status = (id, message) => { $(id).textContent = message; };
let account = emptyPaper(), draftOrder = null, agentController = null, agentReport = null;
try {
  const raw = localStorage.getItem(PAPER_KEY);
  if (raw) account = parsePaper(JSON.parse(raw));
} catch {
  status("paper-status", "Saved paper account was invalid or inaccessible. A fresh local simulation is shown; no saved data was overwritten.");
}
function saveAccount(next) {
  const valid = parsePaper(next);
  try {
    localStorage.setItem(PAPER_KEY, JSON.stringify(valid));
    account = valid;
    renderPortfolio();
    return true;
  } catch {
    status("paper-status", "Unable to save this simulation. Check browser storage before continuing.");
    return false;
  }
}
function renderPortfolio() {
  const result = paperSummary(account);
  $("paper-cash").textContent = money(result.cashCents);
  $("paper-equity").textContent = money(result.equityCents);
  $("paper-pnl").textContent = money(result.performanceCents);
  $("paper-pnl").classList.toggle("red", result.performanceCents < 0);
  const positions = $("paper-positions"); positions.replaceChildren();
  if (!account.positions.length) {
    const tr = make("tr");
    const td = make("td", "No paper holdings yet.");
    td.colSpan = 5; tr.append(td); positions.append(tr);
  }
  for (const p of account.positions) {
    const row = make("tr");
    const labels = [
      p.symbol, String(p.shares), money(p.costBasisCents),
      money(p.markCents), money(p.shares * p.markCents - p.costBasisCents),
    ];
    for (const text of labels) row.append(make("td", text));
    positions.append(row);
  }
  const history = $("paper-history"); history.replaceChildren();
  if (!account.trades.length) history.append(make("p", "No simulated trades yet."));
  for (const trade of account.trades.slice(0, 30)) {
    const line = make("div"); line.className = "item";
    const title = make("strong", trade.side.toUpperCase() + " · " + trade.shares + " " + trade.symbol +
      " @ " + money(trade.priceCents) + " = " + money(trade.grossCents));
    const detail = make("p", new Date(trade.timestamp).toLocaleString() + " · PAPER ONLY" +
      (trade.side === "sell" ? " · realized simulation P/L " + money(trade.realizedCents) : ""));
    detail.className = "muted";
    line.append(title, detail); history.append(line);
  }
  if (account.trades.length > 30) history.append(make("p", "Showing 30 of " + account.trades.length + " paper trades. Export for full history."));
}
function invalidatePreview() {
  draftOrder = null;
  $("order-preview").hidden = true;
}
$("paper-form").addEventListener("input", invalidatePreview);
$("paper-form").addEventListener("change", invalidatePreview);
$("paper-form").addEventListener("submit", e => {
  e.preventDefault();
  try {
    const order = {
      symbol: normalizeTicker($("paper-symbol").value),
      side: $("paper-side").value,
      shares: Number($("paper-shares").value),
      priceCents: toCents($("paper-price").value),
    };
    const preview = previewPaperTrade(account, order);
    draftOrder = order;
    $("order-description").textContent = "PAPER " + order.side.toUpperCase() + " " + order.shares +
      " " + order.symbol + " at an entered reference price of " + money(order.priceCents) +
      ". Simulated amount: " + money(preview.grossCents) +
      ". Paper cash after: " + money(preview.remainingCashCents) +
      ". No actual market order will be submitted.";
    $("order-preview").hidden = false;
    status("paper-status", "Review the virtual order details. Confirm it only if they are correct.");
  } catch (err) {
    invalidatePreview(); status("paper-status", err.message);
  }
});
$("paper-approve").addEventListener("click", () => {
  if (!draftOrder) return;
  try {
    const next = applyPaperTrade(account, draftOrder);
    if (saveAccount(next)) {
      status("paper-status", "Simulated order recorded. No real trade was made.");
      $("paper-form").reset();
      invalidatePreview();
    }
  } catch (err) { invalidatePreview(); status("paper-status", err.message); }
});
$("paper-cancel").addEventListener("click", () => {
  invalidatePreview();
  status("paper-status", "Simulated order canceled. No portfolio changes made.");
});
$("mark-form").addEventListener("submit", e => {
  e.preventDefault();
  try {
    const next = markPaperHolding(account, $("mark-symbol").value, toCents($("mark-price").value));
    if (saveAccount(next)) {
      status("mark-status", "Updated the simulated valuation only, using the reference price you entered.");
      $("mark-form").reset();
    }
  } catch (err) { status("mark-status", err.message); }
});
$("paper-export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(account, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = make("a"); a.href = url; a.download = "z-paper-simulation.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  status("paper-status", "Exported a local simulation backup.");
});
$("paper-reset").addEventListener("click", () => {
  if (!confirm("Reset your local paper account? All simulated trades, marks and holdings will be erased.")) return;
  const next = emptyPaper();
  if (saveAccount(next)) {
    invalidatePreview();
    status("paper-status", "Paper simulation reset to $100,000 virtual cash.");
  }
});

const steps = [
  "Find official company filings or results",
  "Look for recent business coverage",
  "Identify risk factors and missing evidence",
  "Prepare a source-linked research draft for review",
];
let stepState = [];
function renderSteps() {
  const root = $("agent-steps");
  root.replaceChildren();
  steps.forEach((title, index) => {
    const row = make("div"); row.className = "step";
    const pill = make("span", String(index + 1)); pill.className = "step-label";
    const desc = make("div");
    const head = make("strong", title);
    const stat = make("p", stepState[index] || "Pending");
    stat.className = "muted"; stat.style.margin = "4px 0";
    desc.append(head, stat); row.append(pill, desc); root.append(row);
  });
}
const setStep = (index, text) => {
  stepState[index] = text;
  renderSteps();
};
const reportProgress = message => status("agent-status", message);
$("agent-form").addEventListener("submit", async e => {
  e.preventDefault();
  if (agentController) return;
  let stock;
  try { stock = stockIdentity($("agent-symbol").value, $("agent-company").value); }
  catch (err) { reportProgress(err.message); return; }
  agentController = new AbortController();
  agentReport = null;
  $("agent-result").hidden = true;
  $("agent-start").disabled = true;
  $("agent-stop").disabled = false;
  stepState = ["Waiting", "Waiting", "Waiting", "Waiting"];
  renderSteps();
  reportProgress("Starting source-based research for " + stock.symbol + "…");
  let count = 0;
  try {
    const source = new ExaMcpSearchProvider();
    const provider = {
      async search(query, opts) {
        const n = count++;
        setStep(n, "Searching…");
        reportProgress("Research step " + (n + 1) + " of 3 for " + stock.symbol + "…");
        try {
          const result = await source.search(query, opts);
          setStep(n, "Search returned. Review sources below.");
          return result;
        } catch (error) {
          setStep(n, "Search unavailable or timed out.");
          throw error;
        }
      },
    };
    const report = await researchStock(stock, provider, {
      signal: agentController.signal, timeoutMs: 18000,
    });
    if (agentController.signal.aborted) throw Error("Stopped");
    agentReport = report;
    const refs = $("agent-sources");
    refs.replaceChildren();
    let sourceCount = 0, errors = 0;
    for (const section of report.sections) {
      const block = make("div"); block.className = "item";
      block.append(make("h3", section.title));
      if (section.error) {
        const warning = make("p", section.error);
        warning.className = "muted"; block.append(warning); errors++;
      }
      for (const sourceItem of section.sources) {
        sourceCount++;
        const link = make("a", sourceItem.title);
        link.href = sourceItem.url; link.target = "_blank"; link.rel = "noopener noreferrer";
        const snippet = make("p", sourceItem.snippet);
        snippet.className = "muted";
        block.append(link, snippet);
      }
      refs.append(block);
    }
    setStep(3, "Draft prepared; waiting for your review.");
    $("agent-draft").value = researchDraft(report);
    $("agent-result").hidden = false;
    reportProgress("Research completed: " + sourceCount + " source(s); " + errors +
      " section(s) missing evidence. No trades placed.");
    if (!sourceCount) status("agent-draft-status", "No usable sources. Try again later; do not treat the draft as researched.");
    else status("agent-draft-status", "Review sources before using the draft. Z won't automatically act on them.");
  } catch (err) {
    reportProgress(agentController.signal.aborted ? "Research stopped. No trades were made." :
      "Research failed. No trades were made: " + err.message);
  } finally {
    agentController = null;
    $("agent-start").disabled = false;
    $("agent-stop").disabled = true;
  }
});
$("agent-stop").addEventListener("click", () => {
  agentController?.abort();
});
window.addEventListener("pagehide", () => { agentController?.abort(); });
$("agent-copy").addEventListener("click", async () => {
  if (!agentReport) return;
  try {
    await navigator.clipboard.writeText($("agent-draft").value);
    status("agent-draft-status", "Research draft copied.");
  } catch {
    $("agent-draft").focus(); $("agent-draft").select();
    status("agent-draft-status", "Select Copy for the highlighted draft.");
  }
});
$("agent-save").addEventListener("click", () => {
  if (!agentReport) return;
  try {
    const existing = JSON.parse(localStorage.getItem("z-notes-v1") || "[]");
    const notes = Array.isArray(existing) ? existing : [];
    notes.unshift({
      id: crypto.randomUUID?.() || String(Date.now()) + Math.random(),
      title: agentReport.symbol + " source research",
      body: $("agent-draft").value,
      updated: new Date().toISOString(),
    });
    localStorage.setItem("z-notes-v1", JSON.stringify(notes.slice(0, 200)));
    status("agent-draft-status", "Saved source-linked draft in Z Notes. No trades placed.");
  } catch {
    status("agent-draft-status", "Could not save the draft. Copy it instead.");
  }
});
$("agent-chat").addEventListener("click", () => {
  if (!agentReport) return;
  const text = $("agent-draft").value;
  if (window.parent !== window) {
    window.parent.postMessage({ type: "z:insert-draft", text }, location.origin);
    return;
  }
  try {
    sessionStorage.setItem("project-z:tool-draft:v1", text);
    location.href = "./index.html?z_start=1";
  } catch { status("agent-draft-status", "Unable to transfer draft. Copy it instead."); }
});
renderSteps();
renderPortfolio();
