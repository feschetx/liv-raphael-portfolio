# Liv and Raphael portfolio dashboard

Public dashboard: https://feschetx.github.io/liv-raphael-portfolio/

The HTML and portfolio-data.json are saved checkpoints generated from the authoritative Excel workbook. Do not change recorded quantities, purchase FX, purchase prices or cost basis when refreshing market prices.

The browser checks the public market-data branch's quotes.json every minute while visible and refreshes on demand, reconnection and returning to the tab. The Refresh market quotes GitHub Actions workflow requests new Samsung, EUR/KRW and EUR/USD quotes about every five minutes. It also preserves and backfills daily stock/ECB FX history and supplies five-minute intraday data. GitHub can delay scheduled jobs; actual feed and quote timestamps are always shown. A feed over 15 minutes old is flagged. Failed or invalid responses preserve the last verified display rather than substituting zeroes. The collector publishes only after market quotes and history are available and valid; no brokerage or Google credentials are needed.

The collector writes to the market-data branch, which does not trigger a website rebuild. Do not merge that branch into main or force-push it. The default GitHub Actions token has repository contents write permission only for the collection job. No long-lived secrets are needed.

The bond value keeps the existing indicative model and 4.35% yield assumption from 7 July 2026. It is not a market bond quote. Both chart views are calculated independently for each child's recorded quantities. Since start uses preserved daily market inputs, with the latest point replaced by current quotes; Intraday uses five-minute stock and FX data and labels its date in Korea Standard Time. Outside stock trading hours the last stock price is carried forward while FX may continue to change. Intraday change is measured from the first available point, not asserted to be the exact market open.

The cloud collector now owns all chart history. The old twice-daily Codex task can remain paused; it is no longer needed to keep the website current. Local Excel price caches are manual archived snapshots; Excel remains authoritative for holdings and purchase terms. Future position changes must be explicitly reflected in portfolio-data.json before publication.

Local verification: node --test tests/*.test.mjs. Fetch a local sample with node scripts/collect-quotes.mjs --output <path> (use --use-system-ca with Node when the local trusted certificate store is needed). Production collection uses --publish in GitHub Actions. Run workflow_dispatch to check the complete hosted collection path.

The HTML generator is D:\Documents Data\Xavier\Family\Portfolio updates\render_dashboard.py. Preserve its live UI fields and script/style links when changing saved snapshots.
