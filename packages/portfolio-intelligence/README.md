# Portfolio look-through and diversification

Use `@investboard/portfolio-intelligence` to see what a portfolio really owns. Look through equity funds to the companies inside them, merge them with directly held shares, and measure exposures by asset class, sector, country, region and currency. Compare how much two funds hold in common, measure how concentrated the portfolio is in single companies, and read how its holdings moved together over 1, 3, 5 and 10 years. Save the inputs for a reproducible JSON replay.

This is the calculation behind Investboard's X-Ray and Diversification view, published as a standalone Apache-2.0 TypeScript module with **zero runtime dependencies and no network calls**. It requires no Investboard account, API key or database. Holdings, fund constituent lists, security profiles, prices and FX come from your application. No provider data, fund holdings, company profiles or prices are included.

## Run the example

From the repository root with Node 22+ and pnpm 9.15.0:

```sh
pnpm install --frozen-lockfile
pnpm example:intelligence
```

The example analyzes two synthetic portfolios from [`parity/`](parity). In the first, two world funds share most of their companies and one company is also held directly: the example prints each company's share of the whole portfolio, held directly and through each fund, the 76% overlap between the funds, the concentration figures and the five-year weekly correlation. The second has a partly listed fund, a fund with no list and a holding that could not be valued, and shows that each gap stays visible. Both results replay from their saved snapshots.

## Use it in your project

Build a source tarball; registry publication is a separate release step:

```sh
pnpm --filter @investboard/portfolio-intelligence build
pnpm --dir packages/portfolio-intelligence pack --pack-destination /tmp
# In your application:
pnpm add /tmp/investboard-portfolio-intelligence-0.2.0.tgz
```

The ESM package exports these functions and their TypeScript request and result types:

| Function | What it returns |
| --- | --- |
| `analyzePortfolio(request)` | Basis, look-through positions, issuers, dimensions, fund overlap, concentration, coverage and fund treatment, plus the input snapshot |
| `measureCorrelations(request)` | Four correlation windows ending on the last Friday before `asOf`, plus the input snapshot |
| `replayPortfolioAnalysis(snapshot)` | The analysis recalculated from saved inputs |
| `replayCorrelations(snapshot)` | The correlations recalculated from saved inputs |

Also exported: `METHODOLOGY_VERSION`, `CORRELATION_METHODOLOGY_VERSION`, `METHOD_CONSTANTS`, immutable `LIMITS`, `PortfolioInputError`, `validatePortfolioRequest` and `validateCorrelationRequest`. Only the package root is a supported import path.

## Inputs and identity

`PortfolioRequest` declares `asOf`, `baseCurrency`, every holding of the whole portfolio in `holdings` (cash, bonds, gold and crypto included), and optionally `funds`, `securities` and `fundOverrides`.

- **Holdings** carry an `id`, a `kind` (`security`, `fund` or `cash`), a name, optional ISIN and ticker, a `value` already in the base currency, the listing currency and an asset class: `equities`, `bonds`, `gold`, `crypto`, `cash`, `alternatives`, `real_estate`, `commodities` or `unknown`. A holding you could not value is passed with `value: null`; it is listed as unvalued and leaves every denominator.
- **Funds** describe fund holdings by `holdingId`: a constituent list (`status: "listed"`, each constituent's weight a fraction of 1), `status: "none_reported"` for a fund that publishes no constituents, or `status: "missing"` when you have no list. A fund may also carry the class its own documents report, sector and country breakdowns, and an index list to read through when it publishes none.
- **Securities** are profiles by ISIN: name, sector, industry, country and class. A profile with `assetClass: null` is a fund's own profile and never describes a directly held line.
- **Fund overrides** by ISIN either correct a fund's class (`heldWhole: false`) or hold it whole in a class (`heldWhole: true`), for example a futures fund whose listed collateral is not its exposure.

Positions are identified by ISIN first and ticker otherwise. The same fund held at two accounts is folded into one fund by ISIN.

## Look-through and the equities-only rule

Only funds that can hold listed companies are looked through. **A cash, bond, gold or crypto fund is never dissolved**, whatever its constituent list says: it stays whole in its class. Each fund is resolved in this order:

| Input | Treatment |
| --- | --- |
| A held-whole override | Held whole in the override's class |
| Stated class cash, bonds, gold or crypto | Held whole, its list never read |
| `missing`, with a `readThrough` list | Looked through the index list; the result names the index and the fund |
| `missing`, no `readThrough` | Pending: its whole value is reported as missing data |
| `none_reported` | Held whole |
| Listed, resolved class cash, bonds, gold or crypto | Held whole in the resolved class |
| Listed, otherwise | Looked through |

The resolved class takes a specific stated class (cash, bonds, gold, crypto, real estate, commodities) over the reported one; a stated `equities`, `alternatives` or `unknown` gives way to the class the fund reports. Real estate is for holdings that own buildings: an ETF of real-estate companies is a stock fund, and a fund labeled "Real Estate" reads as equities. A fund's own listed constituents always win over a read-through list.

A looked-through fund contributes each constituent at fund value × constituent weight. Constituent weights above a total of 1 are scaled down; the uncovered remainder stays as one residual row in the fund's class, and a fund is fully covered at 98%. Constituents and direct holdings with the same identity and class merge into one position whose provenance lists the direct share and each fund's share. A company held through an equity fund and through a fund of another class (real estate, commodities) is one position per class: the equity part carries the sector and region, the other part stays in its class without them. Issuer groups and concentration still count one company. A fund held by a fund stays one position: there is no recursive look-through.

## Exposures

Every weight is a share of the whole valued portfolio, cash included, unless a field says otherwise.

- **Basis** groups the portfolio by asset class **by holding**: each direct holding in its class and each fund whole in its resolved class. It answers what the portfolio holds before looking inside funds.
- **Sector, country and region** describe the equity part only. Their bucket weights are shares of the whole portfolio, their `coverage` is the classified share of the equity part, and unclassified equity stays in an `unknown` bucket, always last. A constituent's profile replaces a fund's reported breakdown dimension by dimension. Sectors are Investboard's eleven sector groups.
- **Listing currency** groups holdings by the currency they trade in. **Economic currency** reads the currencies behind the equity part from countries, and treats a fund whose name declares a currency hedge as hedged into that currency; `hedged` is the hedged share.

## Overlap

Fund-pair overlap is `sum(min(weightA, weightB))` over the companies two funds share: the weight that can be matched security by security between the two separately normalized funds. It is a property of the two funds, not a share of your portfolio. Pairs below 1% are dropped, a fund is never paired with itself, and each pair lists its 20 largest shared companies plus a tail. Funds held whole are never paired.

## Concentration and bounds

Concentration is measured over the equity part, grouped by company: US share classes by their CUSIP prefix, depositary receipts by the verified company name in their profile, and other lines by their normalized company name. A fund's uncovered remainder stays in the denominator, so each company weight is a lower bound and `attributedCoverage` is the share that could be attributed.

`hhi` is the sum of squared company weights and `effectiveIssuers` is its inverse. Below full coverage they are labeled **lower** and **upper** bounds; at full coverage, **exact**. Below 80% attributed coverage both are withheld (`status: "refused"`), unless a single company is measured above 10% of the equity part: a measured concentration is never withheld. `topTenWeight` is the ten largest positions' share of the whole portfolio.

## Coverage and unknowns

`coverage` splits the whole portfolio into `transparent` (looked through, held directly, or cash), `opaqueInherent` (held whole by nature, or a fund's uncovered remainder) and `opaquePending` (funds whose list is missing). `funds` reports each fund's treatment and covered weight.

`status` is `available`, `partial` or `unavailable`. Reason codes: `unvalued_holdings`, `fund_holdings_missing`, `classification_degraded` (at least 20% of the portfolio is classifiable equity and less than half of it has a sector) and `no_valued_holdings`. Missing data is never turned into zero or spread across the known part.

## Correlations

`CorrelationRequest` declares `asOf`, `baseCurrency`, the holdings with their values and price currencies, daily or weekly `closes`, and `fx` where one unit of a currency equals `rateToBase` units of the base currency.

- Closes become weekly closes on Fridays, ending on the last Friday strictly before `asOf`. Returns are week over week.
- A foreign close converts at the latest rate on or before its date, at most four days old; without any rate the holding is excluded as `no_fx`.
- Windows are 52, 156, 260 and 520 weeks. A holding needs returns in 80% of a window's weeks (`short_history`); a constant series is excluded (`flat_series`), never given a coefficient of 0. All pairs share one common sample of weeks.
- A window is `insufficient_history` with fewer than three eligible holdings or below 60% of portfolio value. Excluded value stays in the denominator.
- Each pair has a Pearson coefficient, a Fisher 95% interval and a band: close from 0.7, partial from 0.3, independent from -0.3, otherwise opposite, and undetermined when the interval spans two or more boundaries. Pairs at 0.95 or above are near-duplicates. Groups form by average linkage while the mean correlation between them is at least 0.7. The value-weighted mean correlation, the ten worst weeks and the 5-year versus 1-year band changes are reported.

Historical correlation describes the observed period. It is distinct from holdings overlap and does not predict future diversification.

## Retained evidence and replay

Every result carries a `snapshot` with the methodology version and a copy of the request. `replayPortfolioAnalysis` and `replayCorrelations` refuse a snapshot from another methodology and otherwise recalculate exactly. Results are deep-frozen; the caller's request is never changed.

## Bounds and verification

`LIMITS` permits 2,000 holdings, 500 fund inputs, 10,000 constituents per fund, 50,000 security profiles and values up to `1e12`; correlations accept 200 holdings and 4,000 closes per holding. Invalid input throws `PortfolioInputError` naming the field, including constituent weights given as percentages instead of fractions of 1 and duplicate dates in a series.

From the repository root:

```sh
pnpm exec vitest run packages/portfolio-intelligence
pnpm --filter @investboard/portfolio-intelligence typecheck
pnpm example:intelligence
pnpm format:check
```

The calculation is adapted from Investboard's X-Ray, concentration and diversification engines. The seven synthetic portfolios in [`parity/`](parity) are also run through Investboard's own engine by a parity check in the Investboard application, which fails on any difference in figures; the commit it last matched is recorded in [`capabilities.json`](../../capabilities.json).

## Use it with an AI agent

The [Portfolio Intelligence engine skill](../../skills/portfolio-intelligence-engine) lets a coding agent turn portfolio and fund-holdings files into a request, run this module locally and explain the result. The [Investboard AI toolkit](https://github.com/Investboard/ai-toolkit) has the conversational Portfolio Intelligence skill for files you supply or a connected Investboard account.
