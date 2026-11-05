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
  if (feed?.version !== 1 || !Number.isFinite(Date.parse(feed.fetchedAt))) throw new Error('Invalid price feed');
  if (Date.parse(feed.fetchedAt) > now + 120000) throw new Error('Price feed timestamp is in the future');
  for (const key of ['samsung', 'eurkrw', 'eurusd']) {
    const quote = feed.quotes?.[key];
    const expected = {samsung:['005930.KS','KRW'],eurkrw:['EURKRW=X','KRW'],eurusd:['EURUSD=X','USD']}[key];
    if (quote?.symbol !== expected[0] || quote.currency !== expected[1]) throw new Error('Wrong instrument or currency: ' + key);
    const time = Date.parse(quote?.asOf);
    if (!Number.isFinite(quote?.price) || quote.price <= 0 || !Number.isFinite(time) || time > now + 120000) throw new Error('Missing or invalid quote: ' + key);
    if (now - time > 7 * 86400000) throw new Error('Quote is more than a week old: ' + key);
  }
  return feed;
}

export function valuePortfolio(position, quotes, bondYield, valuationDate) {
  for (const key of ['shares', 'stock_cost', 'bond_units', 'bond_cost', 'cash', 'cost']) {
    if (!Number.isFinite(position[key]) || position[key] < 0) throw new Error('Missing holding: ' + key);
  }
  const bondPrice = modelBondPrice(valuationDate, bondYield);
  const days = (Date.parse(valuationDate + 'T00:00:00Z') - Date.parse(position.purchase_date + 'T00:00:00Z')) / 86400000;
  const stock = position.shares * quotes.samsung.price / quotes.eurkrw.price;
  // Preserve the existing tracker's indicative bond valuation convention.
  const bond = position.bond_units * bondPrice / quotes.eurusd.price + position.bond_cost * bondYield * days / 365;
  const total = stock + bond + position.cash;
  return {stock, bond, bondPrice, total, gain: total - position.cost, returnPercent: (total / position.cost - 1) * 100};
}
