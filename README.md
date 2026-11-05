# Liv and Raphael portfolio dashboard

Public dashboard: https://feschetx.github.io/liv-raphael-portfolio/

The HTML and portfolio-data.json are saved checkpoints generated from the authoritative Excel workbook. Do not change recorded quantities, purchase FX, purchase prices or cost basis when refreshing market prices.

The browser loads live.js and portfolio-math.js, checks the public market-data branch's quotes.json every minute while visible, and refreshes on demand, reconnection and returning to the tab. The Refresh market quotes GitHub Actions workflow requests new Samsung, EUR/KRW and EUR/USD quotes about every five minutes. GitHub can delay scheduled jobs; actual feed and quote timestamps are always shown. A feed over 15 minutes old is flagged. Failed or invalid responses preserve the last verified display rather than substituting zeroes. The collector publishes only after all three public quotes validate, and never needs brokerage or Google account credentials.

The collector writes to the market-data branch, which does not trigger a website rebuild. Do not merge that branch into main or force-push it. The default GitHub Actions token has repository contents write permission only for the collection job. No long-lived secrets are needed.

The live bond value keeps the existing indicative model and 4.35% yield assumption from 7 July 2026. It is not a market bond quote. The saved historical chart is clearly dated and is maintained by the separate twice-daily snapshot task; live holdings are recalculated from the latest quote feed without rewriting historical points.

Local verification: node --test tests/portfolio-math.test.mjs. Fetch a local sample with node scripts/collect-quotes.mjs --output <path>. Production collection uses --publish in GitHub Actions. Run workflow_dispatch to check the complete hosted collection path.

The HTML generator is D:\Documents Data\Xavier\Family\Portfolio updates\render_dashboard.py. Preserve its live UI fields and script/style links when changing saved snapshots.
