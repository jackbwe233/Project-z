/* Charts are external, informational widgets. They never create or price Z paper orders. */
const el = id => document.getElementById(id);
const host = el("z-chart-frame");
const status = el("z-chart-status");
const symbolField = el("z-chart-symbol");
const exchangeField = el("z-chart-exchange");
const load = el("z-chart-load");
let generation = 0;
function chartSymbol() {
  const raw = symbolField.value.trim().toUpperCase();
  if (!/^[A-Z0-9.^:-]{1,24}$/.test(raw)) throw Error("Enter a valid ticker, like AAPL or NYSE:IBM.");
  const value = raw.includes(":") ? raw : exchangeField.value + ":" + raw;
  return value;
}
function mountChart() {
  let symbol;
  try { symbol = chartSymbol(); } catch(error) { status.textContent=error.message; return; }
  const current = ++generation;
  load.disabled = true;
  status.textContent = "Loading " + symbol + ". The chart provides its own timeframe, candle/line, indicator, and drawing controls.";
  host.replaceChildren();
  const wrapper = document.createElement("div");
  wrapper.className = "tradingview-widget-container";
  const widget = document.createElement("div");
  widget.className = "tradingview-widget-container__widget";
  widget.style.height = "100%";
  widget.style.width = "100%";
  wrapper.append(widget);
  const script = document.createElement("script");
  script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  script.type = "text/javascript";
  script.async = true;
  script.textContent = JSON.stringify({
    autosize:true, symbol, interval:"D", timezone:"Etc/UTC", theme:"dark",
    style:"1", locale:"en", backgroundColor:"#080f1c",
    gridColor:"rgba(120,160,210,0.08)", allow_symbol_change:true,
    hide_side_toolbar:false, hide_top_toolbar:false, withdateranges:true,
    hide_legend:false, hide_volume:false, save_image:true, studies:[],
  });
  script.onerror = () => { if(current===generation) status.textContent = "Chart couldn't load. Check your connection or open the symbol directly on TradingView."; };
  script.onload = () => { if(current===generation) status.textContent = "Chart loaded for " + symbol + ". Prices may be delayed. Use TradingView's built-in chart tools."; };
  wrapper.append(script);
  host.append(wrapper);
  const fallback = document.createElement("a");
  fallback.href = "https://www.tradingview.com/chart/?symbol=" + encodeURIComponent(symbol);
  fallback.target = "_blank"; fallback.rel = "noopener noreferrer";
  fallback.textContent = "Open full chart on TradingView";
  fallback.className = "z-chart-fallback";
  host.after(fallback);
  host.parentElement.querySelectorAll(".z-chart-fallback").forEach((item,index)=>{if(index>0)item.remove();});
  load.disabled = false;
}
load.addEventListener("click", mountChart);
symbolField.addEventListener("keydown", event => { if(event.key==="Enter") { event.preventDefault(); mountChart(); } });
mountChart();
