# @investboard/stress-test

Deterministic historical-scenario calculations with explicit currency uncertainty, caller-supplied direct history, reconciled loss attribution, and replayable inputs. The package has **no runtime dependencies**, network calls, account access, or data-provider requirements.

Built-in scenarios contain sourced, rounded approximations. Results are hypothetical replays, not forecasts, probabilities, or the investor's actual historical return.

## Run from this repository

Use Node 22 or newer and pnpm 9.15.0:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm example
```

The example uses synthetic investor data. The package can also be built and installed from a local tarball with `npm pack`; it does not require the Investboard monorepo.

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

Every `currentValue` must already be in the selected reporting currency, rounded to cents. Quote currency does not convert the starting capital. Inputs must contain 1–200 uniquely identified holdings with finite, nonnegative values and positive total wealth. Reporting currencies are EUR and USD. Total wealth before and after the scenario is capped at 1 billion reporting-currency units (`MAX_SUPPORTED_WEALTH`); this conservative bound keeps cent reconciliation reliable across 200 holdings. Inputs or outcomes above it raise `StressInputError`. Unknown fields and non-JSON metadata are rejected so snapshots retain only the documented inputs. Built-in scenarios are frozen; clone one to edit custom assumptions. Invalid inputs raise `StressInputError`; unsupported scenario exposure returns `unavailable` with no calculation.

`absoluteLoss` retains the original engine's name but is a **signed monetary change**: a loss is negative and a gain is positive. Percentage fields and coverage fields are fractions, so `-0.57` means -57%. Holding products round half-up to cents, with a bounded correction for machine-precision noise around half-cent ties (v5); attribution reconciles the portfolio change, including offsets and rounding.

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

`result.snapshot` is a defensive copy of the original request plus the methodology version. Serialize it and pass it to `replayStressScenario` to reproduce the calculation without current holdings or providers. An unsupported methodology is refused. The snapshot is not signed; a hosting application must authenticate and protect stored evidence and implement retention and authorization.

This module contains financial calculation logic. The hosted app's queue, worker, authenticated recovery, database archive, tax context and provider adapters are separate integrations. Their acceptance evidence must not be inferred from these package tests. The package performs no tax-savings calculation and has no forecast/recovery prediction.

## Provenance and license

The financial core and scenario assumptions come from Investboard methodology `whole-wealth-currency-replay-v5`. Each scenario retains its methodology, source links and review date. [source-provenance.json](source-provenance.json) records the reviewed origin and extraction transformations. The public boundary adds runtime validation and caller-supplied history admission.

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
