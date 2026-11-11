# Explain portfolio performance in your own engine

`@investboard/performance` turns caller-supplied portfolio history into cash-flow-adjusted returns, holding contributions, separate price and quote-currency effects, a monetary wealth bridge, and an estimate of embedded fund expenses. Save the inputs as JSON to reproduce the result later.

The module is standalone TypeScript from [Investboard](https://investboard.com), under Apache License 2.0. It has no runtime dependencies, makes no network calls, and needs no account or API key. All examples and test data are synthetic.

For the platform's related measurement conventions, see [return measurement](https://investboard.com/knowledge/methodology#rendite-messung) and [costs and after-tax performance](https://investboard.com/knowledge/methodology#costs-and-tax-returns). This module's API and accounting rules below remain the reference for caller-supplied history.

## Run it locally

Use Node 22 or newer and pnpm 9.15.0 from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @investboard/performance typecheck
pnpm exec vitest run packages/performance/test --maxWorkers=1
pnpm example:performance
```

The example values one synthetic USD fund in GBP. USD100 to USD110 with GBP-per-USD rates of 0.8 to 0.9 turns GBP80 into GBP99. The independently calculated monetary effects are GBP8.50 from local price and GBP10.50 from quote FX. The return is 23.75%.

## Use it in your project

This module is distributed as source in this repository. It is not published to the npm registry. Build and pack it:

```sh
pnpm --filter @investboard/performance build
cd packages/performance
npm pack
```

Install the generated tarball in your application:

```sh
npm install /path/to/investboard-capabilities/packages/performance/investboard-performance-0.4.0.tgz
```

The package provides ESM JavaScript and TypeScript declarations through its root export. Its two calculation functions are `evaluatePerformance(request)` and `replayPerformance(snapshot)`. It also exports `PerformanceInputError`, `METHODOLOGY_VERSION`, `LIMITS`, and the public [types](src/types.ts).

```ts
import { evaluatePerformance, replayPerformance } from "@investboard/performance";

const result = evaluatePerformance({
  reportingCurrency: "EUR",
  asOfDate: "2026-01-05",
  ledgerComplete: true,
  snapshots: [
    { date: "2026-01-01", value: 100 },
    { date: "2026-01-05", value: 110 },
  ],
  positions: [{
    id: "example", label: "Synthetic fund", quoteCurrency: "EUR",
    currentQuantity: 1, anchorDate: "2026-01-01",
    priceSource: "Synthetic example, unadjusted closes",
    prices: [
      { date: "2026-01-01", value: 100 },
      { date: "2026-01-05", value: 110 },
    ],
    annualExpenseRatio: 0.01,
  }],
  effects: [{
    id: "initial", holdingId: "example", date: "2026-01-01",
    type: "buy", quantity: 1,
  }],
  cashFlows: [],
  recordedCosts: [],
});

if (result.calculation) {
  console.log(result.calculation.timeWeightedReturn.twr); // approximately 0.10
  console.log(result.calculation.attribution.holdings);
  console.log(result.calculation.coverage);
}
const saved = JSON.stringify(result.snapshot);
const replay = replayPerformance(JSON.parse(saved));
```

## Define the book before supplying data

All snapshots, funding flows, dividends and recorded costs must describe **the same holdings book in one reporting currency**. This engine uses post-flow, holdings-only NAV: distributed dividends are absent from NAV and supplied separately as gross income. If your NAV includes earned cash or reinvested income, normalize that accounting before calling the engine, so income is counted once.

The public names `buy` and `sell` describe security funding into and out of the modeled book. They do not mean every brokerage order is external investor capital. A rotation within the book needs opposite holding funding legs that net to zero. If cash is itself a modeled position, account for its opposite leg too. Use the actual execution amounts for trade funding; execution-versus-close differences may remain in the residual.

| Input | Meaning |
| --- | --- |
| `reportingCurrency` | Uppercase three-letter code; every monetary total is already expressed in this currency |
| `asOfDate` | Date represented by every `currentQuantity`; history may end earlier |
| `ledgerComplete` | Explicit caller assertion that supplied history is complete; `false` refuses calculation |
| `snapshots` | Ordered, unique, post-flow NAV observations; first and last define the measured window |
| `positions` | Include sold and closed holdings, not only today's positive positions |
| `effects` | Complete position-effect ledger through `asOfDate`, including effects after the measured window |
| `cashFlows` | Funding and gross distributed income; amounts are nonnegative and the type supplies the direction |
| `recordedCosts` | Optional dated fees and taxes; omitted means unknown, `[]` means no recorded costs, `taxes: null` preserves unknown taxes, `standalone: true` marks a fee booked on its own |
| `scopeHoldingIds` | Optional fixed historical basket; NAV and flows are rebuilt before every metric is calculated |

For an in-window buy or sell effect after the opening date, supply a cash flow with the **same ID, holding, type and date**. Opening-date funding is already embedded in the first NAV and is excluded from return funding; opening-date dividends remain income. A flow with no known holding uses explicit `holdingId: null`. Such capital lowers coverage or makes it unknown; it is never silently assigned to a holding.

Caller-selected baskets can represent asset classes or depots. Classification and identity evidence belong to the caller. The engine selects a fixed set of IDs, including their closed history; it does not claim historical look-through classification. A selected basket requires complete valuations and assignable flows and costs. Otherwise it returns `scope_history_missing`, rather than combining selected NAV with whole-book returns. `calculation.scope.navBasis` distinguishes supplied NAV from reconstructed basket NAV.

## Fees booked on their own

A recorded cost normally describes a fee or tax inside a trade, already part of that trade's funding amount; it explains part of the result in the wealth bridge and never enters the returns again. A fee booked on its own, such as a custody or account fee, is different: it is money paid into the book that buys nothing. Mark it with `standalone: true`. The engine adds its `fees` to the flow series on its date as a contribution with no value added, so the time-weighted and money-weighted returns both fall by it. For example, a fee of 10 paid on the middle valuation date of a 10,000 book that then rises to 11,000 turns a 10% return into 0.999 × 1.1 - 1 = 9.89%. The wealth bridge counts it in `securityFunding` and `recordedFees`, so the investment result carries it and the recorded fee explains it with no residual. The attribution reports it at portfolio level as `recordedCostContribution` (and `recordedCostContributionPp`), never as unlinked capital or residual; the field is present only when the request records a standalone fee. A standalone fee dated on the opening snapshot falls before the measured window, like opening-date funding. Its `taxes` keep the ordinary treatment. In a selected basket, a standalone fee follows the holding it names; one with `holdingId: null` makes the basket return `scope_history_missing`, like any unassigned cost.

## Position, price and FX evidence

The current quantity and full ledger form an affine replay: `current = a × opening + b`. Splits multiply quantities; buys, sells and signed transfers change them. The engine solves for opening quantity and reconstructs post-effect quantities at the union of snapshot, flow and effect dates. Same-day effects follow `order`, or input order when absent; splits apply first. Replay uses eight-decimal quantity rounding and a 1e-7 reconciliation tolerance.

A nonzero unexplained opening balance retains `opening_balance` provenance and partial status. It may predate the imported ledger or reflect an edit; the engine cannot distinguish these cases. `anchorDate` is the earliest defensible date for this balance. Negative histories, unreconciled quantities and unsupported mergers are excluded from named holding attribution. Their economic effects remain unexplained.

Use **unadjusted closes** consistent with explicit split effects. Split-adjusted prices plus a split ledger would count the action twice. Prices must be positive, finite and in quote currency, with a `priceSource`. Foreign positions require a dated `fxRates` series and `fxSource`; each rate converts **one quote-currency unit into reporting currency**. Prices and FX can carry backward evidence for at most seven calendar days, never look ahead. There is no spot-rate or foreign 1:1 fallback. Same-currency conversion is exactly 1. These are quote-FX effects, not a fund's underlying economic currency exposure.

Positions with no exposure during the measured window require no price or FX history. Holdings with exposure and missing observations retain explicit valuation gaps. Source labels and a complete-ledger flag are caller assertions; validation cannot authenticate them.

## Custody transfers

An unpaired signed `transfer` effect crosses the book's boundary. The engine values it as security funding from transferred units, dated price and dated FX. Two equal, opposite effects can share a `transferGroup` for an internal custody movement. They must share a date, declared `instrumentId` and quote currency, and involve distinct positions. Both sides need consistent independent valuation evidence. Balanced generated funding sums to zero for the whole book.

Every in-window transfer after the opening date requires an **observed NAV boundary** on its date. Missing boundaries or valuation evidence produce `transfer_valuation_missing` with no calculation. The engine does not insert carried NAV to make a transfer look supported. Transfer funding is generated automatically; do not also supply it in `cashFlows`. Selecting one side of a pair makes the movement external to the selected basket.

Monetary boundaries use symmetric half-away-from-zero cent rounding, correcting only machine-precision noise around half-cent ties. Scoped NAV, coverage and external transfer funding use the same compensated summation of original reporting-currency amounts, with cent rounding applied once to the total. Each amount carries its own binary representation error into that total, so a half-cent tie is judged against the combined magnitude of the amounts: same-day transfers of +100.005 and -99 fund 1.01, not 1.00. This preserves small net amounts amid large offsetting flows. Original prices, FX rates, allocation remainders and expense estimates retain their precision. Cent grain is allocated by largest fractional remainder, with effect IDs resolving ties deterministically. Each transfer's `value` is nonnegative. Its `roundingAdjustment` is that value minus the independently rounded magnitude, including for outgoing transfers. Internal pairs retain equal, opposite funding. Book rounding can remain in the wealth bridge and return attribution residuals.

## Read the result

`status: "available"` means the supplied evidence supports the calculation under this methodology. `partial` retains calculable returns alongside explicit limitations. `unavailable` has `calculation: null`, for example for incomplete ledgers, unsupported scope history, missing transfer evidence, insufficient observations or undefined return subperiods. Invalid inputs throw `PerformanceInputError`.

| Output | Interpretation |
| --- | --- |
| `timeWeightedReturn` | Modified Dietz return, geometrically linked at funding boundaries, including distributed dividends |
| `moneyWeightedReturn` | Annualized XIRR including opening wealth, in-window funding and income, and terminal wealth |
| `attribution` | Frongello-linked holding contributions, recorded standalone fees, explicit residual, and optional independent price/FX contributions |
| `currencyAttribution` | Holding contributions grouped by quote currency, distinct from the FX effect |
| `coverage.fraction` | Historical capital-days coverage, or `null` when the denominator is unknown |
| `fundCostEstimate` | Current recorded fund rates applied to actual historical exposure, never deducted again from observed returns |
| `wealthBridge` | Opening wealth + net external flows + investment result = closing wealth, with price, FX, distributed income, recorded costs and residual |
| `positions`, `replay`, `transfers` | Inclusion decisions, opening-balance provenance, reconstructed quantities and transfer valuation evidence |

Returns and coverage fractions use decimal units: `0.10` means 10%. Named fields ending in `Pct` use percent and `Pp` use percentage points. Contributions sum with any recorded standalone fees and the residual to the official return; the residual is never redistributed across named holdings. A reconciliation identity alone cannot prove that the input prices, exchange rates or dates are correct.

Modified Dietz is an approximation when capital arrives between observed valuations. Sparse snapshot history remains flagged. Both returns annualize a window of at least 365 days and withhold annualization below it. TWR annualization uses a 365.25-day exponent. XIRR uses Act/365F, searches rates between -99.9% and 1000%, and reports failure rather than inventing a rate. Irregular cash flows may have multiple mathematical roots; the selected root is not guaranteed unique.

XIRR nets same-day flows and terminal wealth in exact cents before solving. Neutral turnover cannot inflate the convergence tolerance. A Newton step blocked by a rate bound does not establish convergence; a successful rate must pass the net-flow NPV check.

Expense coverage integrates actual positions across dated changes. Intervals longer than seven days do not justify an expense estimate. Unknown rates, unknown capital and excluded holdings remain visible. A known rate of `0` is different from an unknown rate. Estimate confidence is capped at medium because rates are current recorded rates, not observed historical charges. Fund expenses are already embedded in NAV returns. The wealth bridge does not subtract the estimate. Its monetary price and FX effects use opening units and independent symmetric products; split intervals, missing evidence, execution differences and other unsupported effects remain residual.

## Limits and replay compatibility

Inputs must be plain JSON data. Unknown fields, explicit `undefined`, accessors, custom prototypes, cycles, sparse arrays and non-finite values are refused. Dates must be real `YYYY-MM-DD` dates from 1900 onward. Snapshot and history dates must be unique and ascending. Future observations beyond `asOfDate` are rejected. Reporting-currency inputs use two decimal places.

`LIMITS` caps each request at 200 positions, 5,000 snapshots, 10,000 combined effects/flows/cost rows, 100,000 combined price/FX points and one million position/date cells. Supplied and calculated wealth is capped at one billion reporting-currency units; quantities at one billion; FX rates at one million. This version assumes two-decimal accounting units, including for currencies whose native minor-unit conventions differ. It is not arbitrary-precision accounting.

`result.snapshot` defensively copies the complete request, including basket selection, and pins `actual-position-performance-v4`. `replayPerformance` validates the saved version and recalculates only those inputs under that version's rules. It refuses unsupported methodology versions. Snapshots are unsigned and may contain sensitive caller-supplied history; storage, access control and retention belong to your application. No provider, authentication, database, account, app UI or hosted-service implementation is included.

Package 0.4.0 introduces methodology v4: standalone fees, one 365-day annualization threshold for both returns, and half-cent ties judged against the summed amounts. A saved v3 snapshot still replays under the v3 rules and returns the result it was saved with: the time-weighted return annualizes only beyond 365 days, transfer ties are judged against the net, and a v3 request cannot declare a standalone fee. To apply the v4 rules to saved inputs, call `evaluatePerformance(savedSnapshot.request)` and retain the new v4 snapshot. v1 and v2 snapshots remain refused with `PerformanceInputError`. See the [changelog](CHANGELOG.md).

The pure return, position-replay and attribution algorithms are adapted from Investboard's performance engine. The public request validation, evidence assembly and package boundary are independently maintained here. Future calculation changes require a compatibility decision for saved methodology versions.

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
