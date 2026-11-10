# Contribution-aware portfolio rebalancing

`@investboard/rebalancing` provides contribution allocation, scenario funding and reproducible comparisons for your own portfolio tools. Supply your own currency precision, capacities, fee declarations and comparison scenarios. The package exports no Investboard product preset.

The TypeScript module has **no runtime dependencies** and makes no network calls. Account access, providers, valuation freshness, tax calculation, execution and persistence belong to the hosting application. It does not select sales or invent instruments.

## Run the example

From the repository root, use Node 22 or newer and pnpm 9.15.0:

```sh
pnpm install --frozen-lockfile
pnpm example:rebalancing
```

The synthetic example shows a contribution reaching a 60/40 target, a transfer caused by different supplied sale taxes in two depots, and monthly contributions retained below a trade minimum.

## Use it in your project

```sh
pnpm build
cd packages/rebalancing
npm pack
```

Install the generated tarball in your project:

```sh
npm install /path/to/investboard-capabilities/packages/rebalancing/investboard-rebalancing-0.3.0.tgz
```

This is a source distribution and buildable package, not a published npm release or an Investboard hosted API. Normal `npm pack` rebuilds JavaScript and declarations from source.

## Declare your host policy

Every calculation requires `configuration`. This illustrative host policy chooses two decimals; a JPY application could choose zero, KWD three, and another unit eight. None of these choices are implied by a currency identifier.

```ts
import type { RebalancingConfiguration } from "@investboard/rebalancing";

const configuration: RebalancingConfiguration = {
  money: { decimalPlaces: 2, maximumAmount: 10_000_000_000 },
  limits: {
    holdings: 500, assetClasses: 128, accounts: 256, orders: 256,
    projectionMonths: 1200, scenarios: 20,
    jsonNodes: 100_000, jsonDepth: 32, collectionEntries: 5000, textLength: 256,
  },
  cashAssetClass: "cash",
  // Optional host policies; no currency list or upper return bound is inferred.
  allowedCurrencies: ["EUR", "GBP", "JPY", "KWD"],
  annualReturnRange: { minimum: -1, maximum: 2 },
};
```

| Setting | Meaning |
| --- | --- |
| `money.decimalPlaces` | Minor-unit precision for all money, including fees, taxes and projection rounding |
| `money.maximumAmount` | Maximum input amount and total portfolio plus contribution; projected wealth uses the same bound |
| `limits.holdings`, `assetClasses`, `accounts` | Maximum source rows, distinct held/target/planned classes and account declarations |
| `limits.orders` | Maximum explicit plan orders and default generated order cap |
| `limits.projectionMonths`, `scenarios` | Maximum projection horizon and comparison alternatives |
| `limits.jsonNodes`, `jsonDepth`, `collectionEntries`, `textLength` | Resource budgets for JSON values, nesting, array/object entries and identifiers; include the configuration itself |
| `cashAssetClass` | Class that represents retained funding and reserves |
| `allowedCurrencies` | Optional reporting-currency allow-list; any nonempty identifier is otherwise accepted |
| `annualReturnRange` | Optional host range for annual effective return fractions |

Capacities are nonnegative safe integers; all except accounts/orders must be positive. Size these budgets for your application's resources. The engine also enforces universal representation bounds: `decimalPlaces` is an integer from 0 through 100 (JavaScript's fixed-point conversion range), and scaled amounts/aggregates must fit `MAX_SAFE_MINOR_UNITS`, with exact conversion back to the configured minor units. A higher precision therefore permits a smaller magnitude. The engine rejects imprecise money rather than silently rounding input.

These representation checks, nonnegative money, valid allocation fractions and a return floor of -1 are mathematical invariants. They are independent of host product policy.

## Compare your scenarios

```ts
import { compareRebalance } from "@investboard/rebalancing";

const result = compareRebalance({
  configuration,
  baseCurrency: "EUR",
  holdings: [
    { holdingId: "equity", depotId: "A", assetClass: "equities", value: 70000, currency: "EUR" },
    { holdingId: "bond", depotId: "A", assetClass: "bonds", value: 30000, currency: "EUR" },
  ],
  policy: {
    equities: { min: 0.55, target: 0.6, max: 0.65 },
    bonds: { min: 0.35, target: 0.4, max: 0.45 },
  },
  fundingDepotId: "A",
  accounts: [{ depotId: "A", feePerTrade: 0, minimum: 0, maximum: 0, increment: 0.01 }],
  scenarios: [
    { kind: "baseline", mode: "keep" },
    { kind: "annual addition", mode: "contribution", externalCash: 100000 },
    { kind: "smaller budget", mode: "contribution", externalCash: 1000 },
  ],
});
```

Only requested scenarios are returned. `kind` is your unique identifier; it does not select behavior. `mode` selects one of:

| Mode | Behavior |
| --- | --- |
| `keep` | Existing allocation and reserve, with no operations |
| `contribution` | Allocate the scenario's `externalCash` against post-contribution shortfalls |
| `plan` | Assess the exact supplied `plan.sales` and `plan.purchases`, plus `externalCash` |
| `unavailable` | Explicitly withhold this scenario with caller-supplied `reasonCodes` |

Funded scenarios may override `fundingDepotId`. A plan may have zero sales or combine sales and new cash. There is no required four-way workflow or relationship between the budgets of different scenarios. `priority` defaults to `input_order`; `minimize_sales` sorts available/conditional scenarios before unavailable ones and by gross sales, while `target_alignment` sorts by residual drift. Ties retain input order.

### Source completeness and allocation

Every monetary value is already in `baseCurrency`. The engine performs no FX conversion. Any holding with another currency or `value: null` withholds the whole comparison denominator and all calculated alternatives. Measured zero and a complete empty book are valid, including an initial contribution. Holding IDs must be unique; the host supplies the complete book and classifications.

Policy targets are fractions summing to one within `1e-9`, with `0 <= min <= target <= max <= 1`. Unlisted classes have zero target/corridor. Zero total wealth has unknown percentages, represented by `null`.

Positive shortfalls use `target × (current wealth + new net cash) − current class value`. A constrained budget shares them proportionally; largest remainders reconcile minor units. The configured cash class, reserve gaps, skipped minimums and rounding remainders stay in cash. Existing cash belongs to the book and reserve; reallocating it requires an explicit sale of that cash holding.

`cashFloor` defaults to zero, `minTradeSize` to one configured minor unit and `maxTrades` to `configuration.limits.orders`. Account caps and increments are applied before surviving purchases are ranked largest first and capped by order count. Class-name ties are deterministic. The selected existing holding is the largest in its class, then the smallest holding ID; unheld classes use `holdingId: null`. No ticker, price or share quantity is invented.

Corridors are descriptive: affordable partial progress may be feasible while outside a corridor. The cash floor is a hard funding constraint.

## Declare fees and amount rules

Optional `accounts` are declarations keyed by depot ID. `minimum`, `maximum` (zero means uncapped) and positive `increment` apply to monetary order amounts. Choose exactly one fee declaration:

```ts
// Flat fee, or null when unknown:
{ depotId: "A", minimum: 0, maximum: 0, increment: 0.01, feePerTrade: 1 }

// Separate buy/sell schedules; a null side stays unknown:
{
  depotId: "B", minimum: 0, maximum: 0, increment: 0.01,
  fees: {
    buy: { fixed: 0.5, rate: 0.001, minimum: 1, maximum: 10, rounding: "up" },
    sell: null,
  },
}
```

`rate` is a nonnegative fraction of gross order amount. The variable charge is rounded to minor units (`up`, `nearest` with ties up, or `down`), added to `fixed`, then clamped to optional minimum/maximum. A schedule's `maximum: 0` means a zero fee cap. Percentage arithmetic uses the supplied number's decimal representation.

For tiered, instrument-specific or other external fee models, supply an explicit plan with a `fee` on each sale/purchase. A numeric override replaces the account schedule for that order; `fee: null` explicitly means unknown. Omitting `fee` uses account rules. Callbacks are not accepted: snapshots retain replayable JSON data. Missing account amount rules remain conditional even with a supplied fee.

Generated contributions reserve known fees only for selected orders. Reservation is conservative when an order disappears; excess reserve remains cash. Unknown fees are never replaced with zero. Spread, slippage, quantities, instrument eligibility and real account balances are not inferred.

## Supply an explicit plan

Add a scenario such as:

```ts
{
  kind: "reviewed proposal", mode: "plan", externalCash: 100,
  plan: {
    sales: [{ holdingId: "equity", amount: 10000,
      tax: { amount: 100, source: "My estimate for this exact sale in EUR" } }],
    purchases: [{ holdingId: "bond", depotId: "A", assetClass: "bonds", amount: 10000 }],
  },
}
```

Each sale names one source holding, appears at most once and cannot exceed its value. Bound purchases must match their holding's depot/class. Cash is retained funding, not a purchase. Sale tax is `{ amount, source }` for that exact sale or `null`; even a zero estimate requires provenance. The package validates the declaration, not its truth.

Tax and per-order fees follow the holding's depot. `funding` exposes external cash, gross sales, attributed taxes/fees, purchases, net inflow and required transfers per depot. `transfersConfirmed: true` acknowledges that assumption without moving money. Unknown local costs withhold the corresponding transfer amount.

Only the scenario's external cash and explicit sale proceeds fund purchases. Omitted purchases leave proceeds in cash. With known costs:

```text
valueAfter = valueBefore + externalCash - feeCost - taxCost
```

Explicit orders are never silently rounded or resized after tax/fee estimates have been supplied. Amount-rule or preference violations make a scenario unavailable. An input exceeding configured structural capacities is rejected.

`feasible` means declared modeled constraints and reserve are satisfied with known costs and confirmed required transfers. Unknown rules/costs produce `conditional`; unknown costs withhold after-wealth, retained cash, rows and reserve outcomes. Guaranteed funding/reserve failures remain `unavailable`, even with other unknown costs: known nonnegative cost components establish a lower bound. Actual incomplete totals remain `null`.

## Allocate and project directly

`allocateContribution({ configuration, positions, policy, contribution, cashFloor?, minTradeSize?, maxTrades? })` returns pooled class allocations, retained cash and post-contribution wealth, without account rules or fees. `proportion` is each allocation's share of the contribution; admitted shares need not sum to one.

```ts
import { projectContributions } from "@investboard/rebalancing";

const projection = projectContributions({
  configuration,
  positions: [{ assetClass: "equities", value: 70000 }, { assetClass: "bonds", value: 30000 }],
  policy: result.snapshot.request.policy,
  monthlyContribution: 100, months: 12, minTradeSize: 1000,
  annualReturns: { equities: 0, bonds: 0, cash: 0 },
});
// All 12 contributions remain cash below the minimum.
```

Supply explicit annual effective fractions for every held/target class and the configured cash class. There are no default returns. Each month applies `(1 + annualReturn) ** (1/12)`, rounds each class to configured minor units, adds one contribution and re-solves shortfalls. Retained cash accumulates but is not automatically swept into subsequent purchases.

Projections omit broker fees, transfers and taxes, use no wall clock and predict no returns. Horizon, wealth and optional return bounds come from your configuration; returns must always be finite and at least -1. `retainedCash` is new cash retained that month. `projectContributions(projection.request)` reproduces the result.

## Save, replay and upgrade

```ts
import { replayRebalanceComparison } from "@investboard/rebalancing";
const saved = JSON.stringify(result.snapshot);
const reproduced = replayRebalanceComparison(JSON.parse(saved));
```

Comparisons use `rebalance-comparison-v3`; projections use `contribution-projection-v2`. Snapshots defensively copy all inputs, including host configuration, fee declarations and scenario choices. They are not signed or independently verified. Your host owns access, storage and review workflows.

Inputs must be plain JSON data: no functions, accessors, symbols, dates, cycles, sparse arrays or non-finite numbers. Omit optional fields instead of passing `undefined`. Invalid inputs raise `RebalanceInputError`. Incomplete supported evidence produces conditional/unavailable results.

**0.3.0 is a breaking API change.** Add `configuration` to allocation/projection requests. For comparison requests, remove root `contribution`, `cashLimit` and `salePlan`, and map them to explicit contribution/plan scenarios as shown above. If you want the former four kinds, declare those four IDs yourself and use an unavailable scenario when no sale plan exists.

Comparison v1/v2 replay is refused. Explicitly migrate the stored request, choose the host policy, calculate and review a new v3 result, and store it separately. Keep the original result and exact prior package for historical reproduction. Projection requests also need explicit configuration to be recalculated under v2. See [CHANGELOG.md](CHANGELOG.md).

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
