# Portfolio stress testing for your investing engine

Explore how your current portfolio responds to market-crisis scenarios, see which holdings drive the change, and bring the results into your own dashboard, research scripts or portfolio comparison tools.

`@investboard/stress-test` is a standalone TypeScript module from [Investboard](https://investboard.com). It combines named historical scenarios, optional price and FX inputs, holding-level explanations, and reproducible JSON snapshots. It has **no runtime dependencies** and makes no network calls.

See the platform's [stress-test methodology and evidence limits](https://investboard.com/knowledge/methodology#stress-scenarios) for the wider product context. This module's documentation defines its own scenario inputs, configurable assumptions and replay contract.

## What you can build

- A crisis view in your personal portfolio dashboard.
- A comparison of alternative portfolio mixes under the same assumptions.
- A research workflow using price and FX history from your own data sources.
- A saved analysis you can reproduce from its original inputs.

Built-in scenarios contain sourced, rounded approximations. In the ten scenarios since 1999, the USD, GBP, CHF and JPY moves are each currency's move against the euro, computed from the [ECB euro foreign exchange reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html) on the window's first and last day; sector and asset-class figures remain approximations. Results are hypothetical replays, with explicit coverage and unknown states. They do not estimate the probability of a future loss or reproduce your own past investment performance.

## Run from this repository

Use Node 22 or newer and pnpm 9.15.0:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm example
```

The example uses synthetic investor data and demonstrates quote-currency uncertainty and JSON replay.

## Use it in your project

Build a package from this checkout:

```sh
pnpm build
cd packages/stress-test
npm pack
```

Then install the generated tarball from your own project, using the path to your checkout:

```sh
npm install /path/to/investboard-capabilities/packages/stress-test/investboard-stress-test-0.3.0.tgz
```

The module is distributed as source and buildable packages in this repository. It is not currently published to the npm registry.

## Calculate a scenario

```ts
import { BUILT_IN_SCENARIOS, evaluateStressScenario } from "@investboard/stress-test";

const scenario = BUILT_IN_SCENARIOS.find((s) => s.key === "gfc_2008");
if (!scenario) throw new Error("Scenario not found");
const result = evaluateStressScenario({
  baseCurrency: "EUR",
  scenario,
  holdings: [{
    holdingId: "example", ticker: "EXAMPLE", name: "Synthetic global fund",
    isin: "XX0000000001", sector: "Other", assetClass: "equities",
    instrumentType: "fund_etf", currency: "USD", currentValue: 100,
  }],
});
// Partial: economic currency exposure is unknown. The named -57% scenario
// illustration produces EUR43; its currency contribution remains null.
```

Every `currentValue` must already be in the selected reporting currency, rounded to cents. Quote currency does not convert the starting capital. Inputs must contain 1–200 uniquely identified holdings with finite, nonnegative values and positive total wealth. Total wealth before and after the scenario is capped at 1 billion reporting-currency units (`MAX_SUPPORTED_WEALTH`), and at 100 billion for JPY, whose unit is worth about a hundredth of the others (`maxSupportedWealth(baseCurrency)` returns the bound for a currency); this conservative bound keeps cent reconciliation reliable across 200 holdings. Inputs or outcomes above it raise `StressInputError`. Unknown fields and non-JSON metadata are rejected so snapshots retain only the documented inputs. Built-in scenarios are frozen; clone one to edit custom assumptions. Invalid inputs raise `StressInputError`.

## Reporting currencies

`baseCurrency` is EUR, USD, GBP, CHF or JPY. Scenario currency moves are quoted against the euro, so a cash balance in one currency reported in another moves by the ratio of the two gross moves: in `gfc_2008` (USD +0.12, GBP -0.24 against the euro), US dollar cash worth GBP 1,000 at the start of the window ends at GBP 1,473.68 (1.12 / 0.76). Every built-in scenario carries a move for all five. A custom scenario without a move for a non-EUR reporting currency returns `unavailable` with `unsupported_base_currency` and no calculation, never a rate of 1.0. Any other currency code raises `StressInputError`.

## Holdings a scenario cannot model

A holding the scenario has no figure for, and no direct history, is left out rather than shocked by zero: an asset class the scenario does not name and that has no stand-in (`asset_class_not_modeled`), or a verified economic currency the scenario carries no move for (`currency_not_modeled`). The result keeps every holding it can model, sets `status: "partial"` with `unmodeled_holdings_excluded`, and lists each holding left out in `calculation.excludedHoldings` with its ID, ticker, name, value and reason. Every total, fraction, attribution and loss driver then describes the modeled holdings only. `excludedHoldings` is absent when nothing is left out. Only when nothing can be modeled does the result become `unavailable` with `unsupported_scenario_exposure`.

Some classes take a named stand-in figure when the scenario names none for them: `real_estate` and `commodities` take the `alternatives` figure, and `crypto` takes the `equities` (shares) figure, because the crises before crypto existed carry no crypto move and a zero would claim crypto was untouched. A figure the scenario names for the class itself is read first. A stand-in figure is a scenario assumption reported as `asset_class_default`, never direct history.

`absoluteLoss` is a **signed monetary change**: a loss is negative and a gain is positive. Percentage fields and coverage fields are fractions, so `-0.57` means -57%. Holding products round half-up to cents, with a bounded correction for machine-precision noise around half-cent ties (v5); attribution reconciles the portfolio change, including offsets and rounding.

## Currency meaning

| Input | Treatment |
| --- | --- |
| A security's quote currency | Identifies direct price history; never proves economic exposure |
| Missing ISIN/instrument metadata on a cash-classified security | Economic exposure stays unknown |
| Explicit cash verdict: `assetClass: "cash"`, no ISIN, `instrumentType: "cash"` | Cash denomination supplies economic exposure |
| Declared manual cash with `instrumentType: "other"`, `priceSource: "manual"`, and no ISIN | Same cash-denomination treatment |
| `economicCurrency: { currency, hedge, source }` | Caller-supplied verified economic currency or fully hedged target; evidence source is required |

A partial hedge or mixed fund exposure cannot be represented as one verified currency. Leave it unknown. The package validates the shape of supplied evidence; it cannot authenticate a caller's financial claims. `available` means the supplied assumptions support the calculation, not that the inputs have been independently verified.

## Supply direct history

Optional `histories` accept exact ticker, ISIN and quote currency; `basis: "price" | "total"`; positive start/end prices with their actual dates; and a source description. Endpoints must lie within five calendar days of the scenario endpoints and remain ordered. Price-only history reports dividend omission.

When quote currency differs from reporting currency, include `fx.baseCurrency` and `fx.from` / `fx.to`, each with a positive `rate` and `effectiveDate`. Each fixing must precede or equal its price endpoint by at most seven calendar days. Rates convert one quote-currency unit into reporting currency. The price gross return is multiplied by the ratio of end/start FX rates. For example, synthetic USD100→80 prices with 0.9→0.81 USD/EUR fixings produce a 0.72 gross return: an already-EUR100 holding becomes EUR72.

Missing, mismatched, ambiguous or invalid direct evidence never becomes an invented direct return. The result identifies the rejection and falls back to a supported named proxy, with partial status. Unsupported final exposure produces `unavailable`. Coverage is weighted by pre-stress valued wealth.

## Replay and scope

`result.snapshot` is a defensive copy of the original request plus the methodology version. Serialize it and pass it to `replayStressScenario` to reproduce the calculation without current holdings or providers. A snapshot saved as `whole-wealth-currency-replay-v5` (packages 0.1.0 and 0.2.0) replays under its own rules and returns the result it was saved with: no crypto stand-in, EUR or USD reporting only, and `unavailable` when any holding cannot be modeled. To apply the current rules, evaluate `snapshot.request` again and store the new snapshot. Any other methodology is refused. The snapshot contains the complete scenario, so a snapshot saved with earlier built-in figures replays with those figures; to use the current built-in figures, evaluate the saved holdings again with the current `BUILT_IN_SCENARIOS` entry and store the new snapshot. The snapshot is not signed; a hosting application must authenticate and protect stored evidence and implement retention and authorization.

Your application supplies data, renders the results, and manages any storage or account access. The package calculates scenarios and attribution; tax calculations, data fetching and forecasts belong to other tools.

## Assumptions and license

The calculation methodology is versioned as `whole-wealth-currency-replay-v6`. Each built-in scenario includes its assumptions, source links and the date those assumptions were assessed; `provenance.currencyReviewedAt` dates the ECB-derived currency moves where they apply. Changes to built-in figures are listed in the [changelog](CHANGELOG.md). You can inspect them in the [scenario catalogue](src/internal/scenarios/crisis-definitions.ts), or clone a scenario and supply your own assumptions.

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
