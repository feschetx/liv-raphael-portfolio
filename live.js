import {validateFeed, valuePortfolio} from './portfolio-math.js';

const FEED = 'https://raw.githubusercontent.com/feschetx/liv-raphael-portfolio/market-data/quotes.json';
const status = document.getElementById('live-status');
const times = document.getElementById('quote-times');
const checked = document.getElementById('live-checked');
const refreshButton = document.getElementById('refresh-prices');
const money = new Intl.NumberFormat(undefined, {style:'currency', currency:'EUR'});
const price = new Intl.NumberFormat(undefined, {maximumFractionDigits:0});
const time = new Intl.DateTimeFormat(undefined, {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', timeZoneName:'short'});
const signed = (n, percent=false) => (n < 0 ? '−' : n > 0 ? '+' : '') + (percent ? Math.abs(n).toFixed(2) + '%' : money.format(Math.abs(n)));
let portfolio, lastGood, busy = false;

function state(text, mode) {status.textContent = text; status.dataset.state = mode;}
function updateNumber(panel, field, value, text) {
  for (const cell of panel.querySelectorAll(`[data-field="${field}"]`)) {
    cell.textContent = text;
    if (['gain','return','stock-gain','bond-gain'].includes(field)) {
      cell.classList.toggle('neg', value < 0);
      cell.classList.toggle('pos', value > 0);
    }
  }
}
function render(feed) {
  const valuationDate = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Hong_Kong', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
  const totals = [];
  for (const [child, position] of Object.entries(portfolio.positions)) {
    const panel = document.querySelector(`[data-portfolio="${child}"]`);
    if (!panel) throw new Error('Missing portfolio panel');
    const v = valuePortfolio(position, feed.quotes, portfolio.snapshot.bond_yield, valuationDate);
    updateNumber(panel,'total',v.total,money.format(v.total));
    updateNumber(panel,'gain',v.gain,signed(v.gain));
    updateNumber(panel,'return',v.returnPercent,signed(v.returnPercent,true));
    updateNumber(panel,'stock-price',feed.quotes.samsung.price,'₩' + price.format(feed.quotes.samsung.price));
    updateNumber(panel,'stock-value',v.stock,money.format(v.stock));
    updateNumber(panel,'stock-gain',v.stock-position.stock_cost,signed(v.stock-position.stock_cost));
    updateNumber(panel,'bond-price',v.bondPrice,v.bondPrice.toFixed(2) + ' ·model');
    updateNumber(panel,'bond-value',v.bond,money.format(v.bond));
    updateNumber(panel,'bond-gain',v.bond-position.bond_cost,signed(v.bond-position.bond_cost));
    panel.querySelector('[data-field="as-of"]').textContent = 'Latest available quotes';
    totals.push(`${child}: ${money.format(v.total)}`);
  }
  document.getElementById('latest-values').textContent = totals.join(' · ') + ' · bond estimated';
  const q = feed.quotes;
  times.textContent = `Samsung quote: ${time.format(new Date(q.samsung.asOf))}. EUR/KRW: ${time.format(new Date(q.eurkrw.asOf))}. EUR/USD: ${time.format(new Date(q.eurusd.asOf))}. Times shown in your time zone.`;
  const staleFeed = Date.now() - Date.parse(feed.fetchedAt) > 15 * 60000;
  const staleQuotes = Object.values(q).some(quote=>quote.marketOpen && Date.now() - Date.parse(quote.asOf) > 30 * 60000);
  state(staleFeed ? 'Price feed is late — showing last available quotes' : staleQuotes ? 'Market quotes are delayed' : 'Automatic updates on · ' + (q.samsung.marketOpen ? 'Samsung market open' : 'Samsung market closed'), staleFeed || staleQuotes ? 'stale' : 'fresh');
  checked.textContent = 'Feed collected ' + time.format(new Date(feed.fetchedAt)) + '. Last checked ' + time.format(new Date()) + '.';
  document.getElementById('snapshot-date').textContent = `Current holdings use the quotes below. Saved daily history runs through ${portfolio.history.at(-1).date}.`;
}
async function refresh() {
  if (busy) return;
  if (!navigator.onLine) {state('Offline — showing last verified values','offline'); return;}
  busy = true; refreshButton.disabled = true;
  try {
    if (!portfolio) {
      const p = await fetch(new URL('./portfolio-data.json',import.meta.url), {cache:'no-store', signal:AbortSignal.timeout(12000)});
      if (!p.ok) throw new Error('Saved holdings unavailable');
      portfolio = await p.json();
    }
    const response = await fetch(FEED + '?minute=' + Math.floor(Date.now()/60000), {cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer', signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('Price feed unavailable');
    const feed = validateFeed(await response.json());
    if (lastGood && Date.parse(feed.fetchedAt) < Date.parse(lastGood.fetchedAt)) throw new Error('Older feed response');
    render(feed); lastGood = feed;
  } catch (error) {
    state(lastGood ? 'Could not refresh — showing last verified quotes' : 'Could not load live prices — showing saved snapshot','offline');
    checked.textContent = 'Last checked ' + time.format(new Date()) + '. Will retry automatically.';
    console.warn('Portfolio price refresh:', error.message);
  } finally {busy = false; refreshButton.disabled = false;}
}

refreshButton.addEventListener('click',refresh);
window.addEventListener('online',refresh);
window.addEventListener('offline',()=>state('Offline — showing last verified values','offline'));
document.addEventListener('visibilitychange',()=>{if (!document.hidden) refresh();});
setInterval(()=>{if (!document.hidden) refresh();},60000);
refresh();
