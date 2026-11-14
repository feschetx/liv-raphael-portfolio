export function modelBondPrice(isoDate, annualYield) {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!Number.isFinite(annualYield) || annualYield < 0 || annualYield > 1 || isoDate >= '2028-11-15') throw new Error('Bond model needs review');
  let next;
  if (month < 5 || (month === 5 && day < 15)) next = [year, 5, 15];
  else if (month < 11 || (month === 11 && day < 15)) next = [year, 11, 15];
  else next = [year + 1, 5, 15];
  const previous = next[1] === 5 ? [next[0] - 1, 11, 15] : [next[0], 5, 15];
  const days360 = (a, b) => (b[0] - a[0]) * 360 + (b[1] - a[1]) * 30 + Math.min(b[2], 30) - Math.min(a[2], 30);
  const count = 1 + (2028 - next[0]) * 2 + Math.floor((11 - next[1]) / 6);
  const fraction = days360([year, month, day], next) / 180;
  const coupon = 3.875 / 2;
  let price = 100 / (1 + annualYield / 2) ** (count - 1 + fraction);
  for (let i = 0; i < count; i++) price += coupon / (1 + annualYield / 2) ** (i + fraction);
  return price - coupon * days360(previous, [year, month, day]) / 180;
}

export function validateFeed(feed, now = Date.now()) {
  if (![1,2].includes(feed?.version) || !Number.isFinite(Date.parse(feed.fetchedAt))) throw new Error('Invalid price feed');
  if (Date.parse(feed.fetchedAt) > now + 120000) throw new Error('Price feed timestamp is in the future');
  for (const key of ['samsung', 'eurkrw', 'eurusd', ...(feed.quotes?.nvidia ? ['nvidia'] : [])]) {
    const quote = feed.quotes?.[key];
    const expected = {samsung:['005930.KS','KRW'],eurkrw:['EURKRW=X','KRW'],eurusd:['EURUSD=X','USD'],nvidia:['NVDA','USD']}[key];
    if (quote?.symbol !== expected[0] || quote.currency !== expected[1]) throw new Error('Wrong instrument or currency: ' + key);
    const time = Date.parse(quote?.asOf);
    if (!Number.isFinite(quote?.price) || quote.price <= 0 || !Number.isFinite(time) || time > now + 120000) throw new Error('Missing or invalid quote: ' + key);
    if (now - time > 7 * 86400000) throw new Error('Quote is more than a week old: ' + key);
  }
  if(feed.version===2) {
    if(!Array.isArray(feed.history)||!feed.history.length||!Array.isArray(feed.intraday?.points)||!feed.intraday.points.length)throw new Error('Missing chart history');
    let previous='';
    for(const row of feed.history) {
      if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||row.date<=previous||['samsung','eurkrw','eurusd'].some(key=>!Number.isFinite(row[key])||row[key]<=0))throw new Error('Invalid daily history');
      previous=row.date;
    }
    let prior=-Infinity;
    for(const row of feed.intraday.points) {
      if(!Number.isFinite(row.time)||row.time<=prior||row.time>now+120000||['samsung','eurkrw','eurusd'].some(key=>!Number.isFinite(row[key])||row[key]<=0))throw new Error('Invalid intraday history');
      prior=row.time;
    }
  }
  return feed;
}

export function valuePortfolio(position, quotes, bondYield, valuationDate, valuationTime) {
  for (const key of ['shares', 'stock_cost', 'bond_units', 'bond_cost', 'cash', 'cost']) {
    if (!Number.isFinite(position[key]) || position[key] < 0) throw new Error('Missing holding: ' + key);
  }
  const bondPrice = modelBondPrice(valuationDate, bondYield);
  const days = (Date.parse(valuationDate + 'T00:00:00Z') - Date.parse(position.purchase_date + 'T00:00:00Z')) / 86400000;
  const stock = position.shares * quotes.samsung.price / quotes.eurkrw.price;
  // Preserve the existing tracker's indicative bond valuation convention.
  const bond = position.bond_units * bondPrice / quotes.eurusd.price + position.bond_cost * bondYield * days / 365;
  let nvidia=0, addedCost=0;
  const lots=nvidiaLots(position).filter(lot=>valuationDate>=lot.purchase_date && (valuationTime===undefined || valuationTime>=Date.parse(lot.recorded_at)));
  for(const holding of lots) {
    if(!Number.isFinite(holding.quantity)||holding.quantity<0||!Number.isFinite(holding.cost)||holding.cost<0)throw new Error('Invalid Nvidia holding');
    if(!Number.isFinite(quotes.nvidia?.price)||quotes.nvidia.price<=0)throw new Error('Missing Nvidia quote');
    nvidia+=holding.quantity*quotes.nvidia.price/quotes.eurusd.price;
    addedCost+=holding.cost;
  }
  const invested=position.cost+addedCost;
  const total = stock + bond + position.cash + nvidia;
  return {stock, bond, bondPrice, nvidia, invested, total, gain: total - invested, returnPercent: (total / invested - 1) * 100};
}

export function nvidiaLots(position) {
  return position.nvidia ? (position.nvidia.lots ?? [position.nvidia]) : [];
}

// P&L is unrealised, excludes fees and uses each lot's recorded purchase FX.
export function tradeRows(portfolio,quotes,valuationDate) {
  return Object.entries(portfolio.positions).flatMap(([owner,p])=>{
    const v=valuePortfolio(p,quotes,portfolio.snapshot.bond_yield,valuationDate);
    const rows=[
      {id:owner+'-samsung',owner,asset:'Samsung',date:p.purchase_date,quantity:p.shares,unit:'sh',currency:'KRW',buyPrice:p.stock_buy_price,currentPrice:quotes.samsung.price,cost:p.stock_cost,value:v.stock},
      {id:owner+'-bond',owner,asset:'Alphabet bond 3.875% 2028',date:p.purchase_date,quantity:p.bond_units,unit:'$100 face',currency:'USD',buyPrice:p.bond_buy_price,currentPrice:v.bondPrice,cost:p.bond_cost,value:v.bond,estimated:true},
      ...nvidiaLots(p).filter(l=>l.purchase_date<=valuationDate).map((l,i)=>({id:owner+'-nvda-'+i,owner,asset:'Nvidia (NVDA)',date:l.purchase_date,quantity:l.quantity,unit:'sh',currency:'USD',buyPrice:l.buy_price,currentPrice:quotes.nvidia.price,cost:l.cost,value:l.quantity*quotes.nvidia.price/quotes.eurusd.price,nativePnl:l.quantity*(quotes.nvidia.price-l.buy_price)}))
    ];
    return rows.map(r=>({...r,pnl:r.value-r.cost,returnPercent:(r.value/r.cost-1)*100}));
  }).sort((a,b)=>b.date.localeCompare(a.date)||a.owner.localeCompare(b.owner)||a.asset.localeCompare(b.asset));
}
