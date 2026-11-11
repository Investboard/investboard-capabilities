# Source-aware instrument research

Use `@investboard/instrument-research` to build a research script or instrument dossier around your own evidence. Inspect historical returns, drawdowns and contribution illustrations, match reported statements before calculating ratios, and compare two exact listings on common weekly observations. Save the declared sources and inputs for a reproducible JSON replay.

The standalone Apache-2.0 TypeScript module has **zero runtime dependencies and no network calls**. It requires no Investboard account, API key, database, worker or ingestion flag. Listing identities, history, statement fragments, capitalization and dated FX come from your application. No provider data, issuer pages, customer records or data redistribution rights are included.

## Run the example

From the repository root with Node 22+ and pnpm 9.15.0:

```sh
pnpm install --frozen-lockfile
pnpm example:research
```

The example uses synthetic GBP and CHF listings, direct GBP-to-CHF FX, and USD financial reports. It illustrates why a statement's reporting currency remains distinct from the security's quote currency and the caller's presentation currency. It also shows incomplete longer-horizon pair coverage, flags the pair's mixed return basis and verifies exact JSON replay.

## Use it in your project

Build a source tarball; registry publication is a separate release step:

```sh
pnpm --filter @investboard/instrument-research build
pnpm --dir packages/instrument-research pack --pack-destination /tmp
# In your application:
pnpm add /tmp/investboard-instrument-research-0.2.0.tgz
```

The ESM package exports these functions and their TypeScript request/result types:

| Function | What it returns |
| --- | --- |
| `evaluateInstrumentResearch(request)` | Independent history and statement readings, plus the original input snapshot |
| `evaluateInstrumentPair(request)` | Common-week correlations for selected 1/3/5/10-year horizons, with coverage and per-side return basis |
| `replayInstrumentResearch(snapshot)` | Research recalculated from saved inputs without current state |
| `replayInstrumentPair(snapshot)` | Pair comparison recalculated from saved inputs without current state |

Also exported: `METHODOLOGY_VERSION`, immutable `LIMITS`, and `ResearchInputError`. Only the package root is a supported import path. See [the runnable example](examples/research.mjs) for a complete request.

## Inputs and identity

`ResearchRequest` declares `asOf` (UTC timestamp), `from` and `to` (calendar dates), `vintage`, `listing`, `reportingCurrency`, `history`, `statements`, `capitalizations`, and `investment`. Use `null` for an unavailable history or unwanted investment illustration; statement/capitalization collections may be empty. Omit unknown numeric statement line items or pass `null`; other fields are explicit, including nullable source dates and URLs. Do not pass JavaScript `undefined`.

`PairRequest` declares `asOf`, `vintage`, two `listings`, their two `series` in the same order, `reportingCurrency` and distinct `horizons` selected from 1, 3, 5 and 10. Each input history declares one basis for its entire supplied series: `price` or `distribution_adjusted`. Do not concatenate differently based or differently scaled segments and label the result adjusted.

A listing is the full tuple `{ symbol, isin, exchange, currency, kind }`, where kind is `stock` or `fund`. Histories, statements and capitalizations must match it exactly. Two venues may share a symbol; a sibling venue or share class cannot substitute for missing history. The module validates identifier shape and declared consistency, not the real-world identity or ISIN check digit. Your application resolves and authenticates sources.

Currencies use caller-declared three-letter uppercase codes. There is no built-in EUR/USD universe. The module does not validate a code against a live currency registry or infer currency from a symbol, country, venue or fund base currency. Listing currency establishes neither economic exposure nor hedging, income policy, holdings overlap, duration or credit quality. No issuer metadata inference is performed.

Each source carries `{ id, revision, observedAt, publishedAt, url }`. IDs and revisions survive in snapshots; they are caller declarations, not signatures or verified content hashes. `publishedAt` and `url` may be null. Publication cannot follow observation; observation cannot follow `asOf`. Daily observations cannot postdate their source observation date. Use UTC ISO timestamps with seconds and optional three-digit milliseconds; dates must be real `YYYY-MM-DD` dates from 1900 onward.

## Historical prices and FX

Supply positive finite `{ date, value }` observations for the exact listing. Input order is normalized, but **all duplicate dates are refused**, including identical duplicates. Corrupt, zero or negative prices cause an input error. No predecessor, asset-class proxy, interpolation, backfill or synthetic distribution fills missing data.

For a different reporting currency, supply `fx` with `baseCurrency` equal to listing currency and `quoteCurrency` equal to reporting currency. **One unit of base currency buys `value` units of quote currency; prices multiply by this rate.** The module neither guesses an inverse nor synthesizes cross rates. It uses only the latest rate on or before each price date, with a maximum seven-calendar-day carry. Missing/stale rates remove the affected reporting-currency observations and produce explicit reasons. If the currencies match, `fx` must be null.

History calculations use observations inside `[from, to]` only. Actual first and last dates remain visible; a requested non-trading day may shift execution forward by up to seven days. Full-period metrics are withheld when the boundary lag exceeds seven days, an interior gap exceeds seven days, there are fewer than two observations, or the sample has fewer than `200 × requested calendar years` observations. Coverage describes the supplied daily series, not whether a provider has delivered every exchange session. This is not a weekly/monthly-price calculator.

Available metrics include cumulative return, CAGR after at least 365 observed calendar days, annualized sample volatility scaled to actual observation frequency, and maximum peak-to-trough drawdown with recovery. Sample volatility needs at least two returns (three observations); a valid two-observation window reports its return and drawdown and leaves volatility null. A zero drawdown has no episode dates. Return, volatility, yield and ratio outputs are **fractions**: `0.1` means 10%. CAGR uses actual days / 365.2425. `price` excludes distributions; `distribution_adjusted` trusts the caller's consistent reinvestment-adjusted series. Neither implies after-tax returns or current-rate fee deductions.

## Contribution illustration

An optional `{ lumpSum, monthlyContribution }` overlays fractional-unit purchases on covered reporting-currency history. The lump sum executes on the first observed date. Monthly contributions begin on that same date (month zero), then use anniversaries clamped at month end, executing on the first observation on/after each anniversary, at most seven days later. The output lists actual execution dates and amounts. It withholds the illustration when full-period history coverage is insufficient.

This is a historical illustration with no fees, taxes, spreads, minimum trades, account cash, lot rounding or prediction. Amounts use the reporting currency's units without an imposed cent or euro precision. The total-contribution return is ending value / total contributions − 1 and is not a timing-adjusted return. Zero contributions yield zero ending value, a null total-contribution return (a return on no money is undefined, not 0%) and an explicit missing money-weighted rate.

Annualized money-weighted return solves buy-only XIRR with Actual/365 fixed day count and the terminal value. It is null below 365 days from the first actual contribution, or when a verified root is unavailable within the supported `[-0.999, 10]` annual-rate bracket. Bisection checks the NPV residual instead of accepting a rate clamped to the bracket. Historical price-only illustrations retain their price-only basis.

## Reported statements and valuation

A statement declares its exact listing, kind (`income`, `balance`, `cash_flow`), period end, fiscal year, period (`FY`, `Q1`…`Q4`), **reported currency**, filing date, acceptance timestamp, source and numeric `values`. Unknown dates stay null. Filing/acceptance cannot precede period end or follow observation. Fiscal year and period are explicit, never guessed from the date. Duplicate statement-kind/period/year/currency tuples are refused.

Statements are grouped only when period end, fiscal year, period and reported currency all match. Partial income, balance and cash-flow groups remain independently readable. Statement periods through `to` are returned; `from` limits price history only. Statement amounts are not converted to the requested price reporting currency. Mixed currencies remain distinct groups. Preserve signed values: capex and FCF are neither negated nor reconstructed from another line item.

| Ratio | Definition and admission |
| --- | --- |
| Net margin | Same-period net income / positive revenue |
| Debt/equity | Same-period debt / positive equity |
| P/E | Positive period-matched capitalization / positive **annual** net income |
| P/B | Positive period-matched capitalization / positive same-period equity |
| FCF yield | Signed **annual** FCF / positive period-matched capitalization |

`PeriodCapitalization` is an aggregate value for that exact listing, period end, fiscal year and reported currency. A current quote or differently dated/currency capitalization is not substituted; per-share split assumptions are avoided. Quarterly earnings and cash flows are not annualized, summed into an implicit TTM, or used for annual valuation ratios. Losses and unknown/nonpositive denominators retain raw values while affected ratios remain null with reasons. Provider-defined ratios are not accepted as calculated evidence.

## Pair comparison

For each requested horizon, the engine samples completed Friday closes. A close can carry at most three calendar days within that week. A missing weekly close invalidates both the return into that week and the next return; the engine never bridges the hole. It then computes Pearson correlation on **common observed weekly returns** in the same reporting currency. The result retains each side's basis, common count, expected Friday-grid count, coverage, first/last shared dates, reasons and a Fisher 95% interval.

When one series declares `price` and the other `distribution_adjusted`, the result carries the pair-level reason `mixed_return_basis`. The coefficient is still calculated, but the price-only side omits the distributions the adjusted side reinvests, so the two return series are not like for like. Supply both sides on one basis to compare them without this warning.

A coefficient is withheld below 40 common returns, below 80% common coverage, for a boundary gap over 14 days, for over three consecutive missing common weeks, or for zero variance. Longer horizons do not backfill pre-inception history. The interval is a descriptive approximation; the inputs do not establish independence, stationarity or predictive validity. A pair coefficient is not holdings overlap, whole-portfolio covariance, economic currency exposure, suitability or a forecast.

## Retained evidence and replay

Use `vintage: "retained"` for the input snapshot known to your application by `asOf`. `to` can be historical while the sources contain later retained revisions; source observation and publication stamps remain separate. A filing date does not establish which revision was publicly available then.

`vintage: "original_public"` always returns an explicit unavailable reason. This package supplies no original-filing archive or public-information-time reconstruction. An application must obtain genuine archives and define that separate methodology before making such claims.

Snapshots carry methodology `instrument-research-v2` and complete validated input data, including source revisions and FX. They are cloned independently of original inputs and result fragments. Replay validates the saved request and refuses an unknown methodology. A saved `instrument-research-v1` snapshot replays under version 1 rules and returns the result it was saved with: a zero-contribution return of `0` and no `mixed_return_basis` reason. To apply version 2, evaluate the saved request again and store the new snapshot. See the [changelog](CHANGELOG.md). It reproduces the supplied calculation; it does not prove authenticity, source rights, immutable storage, or compatibility with a future methodology. Your application controls persistence, access, authentication and retrieval.

## Bounds and verification

`LIMITS` permits up to 50,000 points per price/FX series, 300 statement fragments, 100 capitalizations and a 100-year price window. Prices/FX lie in `[1e-9, 1e12]`; signed statement amounts have absolute magnitude at most `1e15`. Investment inputs are zero or within `[1e-9, 1e12]`; contributed totals and ending values are bounded by `1e12`. Plain JSON inspection limits depth to 16 and nodes to 1,000,000, and rejects cycles, accessors, sparse arrays, non-finite numbers, unsupported fields and non-JSON prototypes. A computed non-finite ratio is refused.

From the repository root:

```sh
pnpm exec vitest run packages/instrument-research/test --maxWorkers=1
pnpm --filter @investboard/instrument-research typecheck
pnpm example:research
pnpm format:check
```

The source calculations are adapted from Investboard's reference analytics, drawdown, reported-fundamentals and contribution-timing modules. Public currency/identity adapters, validation, strict calendar-window selection and buy-only bracketed XIRR are designed for standalone use. Synthetic regression cases cover missing data, independent statement fragments, exact identity, signed ratios, FX direction/timing, common-week gaps, month-end execution, refusal states and defensive replay. The module makes no live provider-coverage claim.
