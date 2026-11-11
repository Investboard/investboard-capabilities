# Contribution-aware portfolio rebalancing

`@investboard/rebalancing` provides contribution allocation, scenario funding and reproducible comparisons for your own portfolio tools. Supply your own currency precision, capacities, fee declarations and comparison scenarios. The package exports no Investboard product preset.

The TypeScript module has **no runtime dependencies** and makes no network calls. Account access, providers, valuation freshness, tax calculation, execution and persistence belong to the hosting application. It does not select sales or invent instruments.

Read the platform's [rebalancing methodology](https://investboard.com/knowledge/methodology#rebalancing) for the distinction between allocation drift, target ranges and modeled comparisons. The configurable standalone behavior is documented below; this library exports no product preset.

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
npm install /path/to/investboard-capabilities/packages/rebalancing/investboard-rebalancing-0.5.0.tgz
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
    projectionPeriods: 1200, scenarios: 20,
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
| `limits.projectionPeriods`, `scenarios` | Maximum projection period count and comparison alternatives |
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
  purchasePlacement: { mode: "largest_holding" },
  cashDeployment: { mode: "preserve" },
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

A holding may also declare `fund: true` for a fund or ETF and `priced: true` when the host holds a usable current price to buy more of it. Both are optional booleans; an omitted `fund` ranks the holding with single shares and an omitted `priced` ranks it as unpriced. They only choose which holding receives a class purchase; they never change values or targets.

Policy targets are fractions summing to one within `1e-9`, with `0 <= min <= target <= max <= 1`. Unlisted classes have zero target/corridor. Zero total wealth has unknown percentages, represented by `null`.

Positive shortfalls use `target × (current wealth + new net cash) − current class value`. A constrained budget shares them proportionally; largest remainders reconcile minor units. The configured cash class, reserve gaps, skipped minimums and rounding remainders stay in cash. In a comparison, a class share below the smallest order its accounts admit is first consolidated into other orders, as described under [consolidation and routing](#consolidate-small-amounts-and-route-orders). The host chooses whether existing cash remains in the reserve book or is available to fund allocations, as described below.

`cashFloor` defaults to zero, `minTradeSize` to one configured minor unit and `maxTrades` to `configuration.limits.orders`. Account caps and increments are applied before the selected placement policy orders surviving purchases and applies the order-count cap. Largest-holding mode uses largest-amount admission with deterministic class-name ties. With `purchasePlacement: { mode: "largest_holding" }`, the holding that receives a class purchase is ranked, independent of input order:

1. A holding declared `priced: true` before one without a usable price.
2. A holding declared `fund: true` before a single share.
3. The larger value.
4. The smaller holding ID, in code-unit order. IDs are unique, so this settles every tie.

Without declarations this is the largest holding, then the smallest holding ID. Unheld classes use `holdingId: null`. No ticker, price or share quantity is invented.

### Choose purchase placement

Placement is required; the package has no implicit placement preset. Use largest-holding mode as above or supply ordered routes:

```ts
purchasePlacement: {
  mode: "ordered_routes",
  routes: [
    { assetClass: "equities", holdingId: "preferred", depotId: "B" },
    { assetClass: "equities", holdingId: "overflow", depotId: "C" },
    { assetClass: "bonds", holdingId: null, depotId: "B" },
  ],
}
```

Routes bind to matching held class/depot identities, or use `null` for a class allocation. For each class, rejected, capped and rounded amounts spill to its next route. Across classes, route order controls admission under `maxTrades`. Unrouted classes and amounts beyond all route capacities stay cash. Largest-holding mode keeps largest-amount order admission. Account `maximum` remains a per-order cap; routing can create multiple orders in one class, each with its own fee.

### Consolidate small amounts and route orders

Generated contributions avoid leaving cash idle that an order could take:

- **Admission.** An account admits an order amount that is a multiple of its `increment`, at least its `minimum` and `minTradeSize`, within its `maximum`, and larger than its known buy fee: an order may not cost what it buys. An unknown fee does not block admission; it keeps the scenario conditional.
- **Consolidation.** When a class share is below the smallest order any account for that class admits, the stranded share with the smallest need leaves the split (on equal need, the later class name) and the budget is split again over the remaining classes. This repeats until every share forms an order or no class is left. The consolidated orders replace the plain split only when they do not move the book further from target, measured as the sum of absolute deviations from target values with retained money counted as cash.
- **Routing.** In largest-holding mode the class purchase first goes to the account of the ranked holding. Amounts that account refuses or caps continue to the other accounts that hold the class: declared accounts by their buy fee for that amount, lowest first, then by depot ID, and accounts without declared rules last. Each account buys its own best-ranked holding of the class. A purchase in an account without declared rules stays conditional (`account_rules_unknown`). Ordered routes keep the host's order and add only the fee rule.
- **Leftover.** Only money that no admissible order can take after consolidation and routing is reported, as `uninvestedCash` (part of `cashRetained`) with `uninvested_below_order_minimum` and/or `uninvested_above_order_maximum`. Such a scenario is `conditional`, never `feasible`. The reserve top-up, a target cash share, reserved fees, increment rounding below one step after an order, classes the host routes nowhere and orders beyond `maxTrades` are host policy or rounding, not a leftover.

For example, with holdings of 5,000 equities, 1,000 bonds and 1,000 gold, a 50/25/25 target and a 500 account minimum, a contribution of 600 splits into 300 for bonds and 300 for gold. Neither forms an order, so the engine buys 600 of bonds instead. A contribution of 400 forms no order under that minimum; it is reported as 400 of `uninvestedCash`.

### Choose existing-cash funding

Every comparison declares `cashDeployment`. `{ mode: "preserve" }` keeps existing cash outside the funding budget. Alternatively:

```ts
cashDeployment: { mode: "deploy_excess", holdingIds: ["cash-B", "cash-A"] }
```

The ordered, unique source IDs must name cash holdings. Only these sources can release cash, and aggregate releases cannot reduce the whole book's cash below `cashFloor`. Unlisted cash still counts toward that pooled reserve. Explicit cash sales reduce the amount releasable from the same holding, preventing double use. A `keep` scenario never releases cash.

`cashReleases` records each source amount and `existingCashReleased` reports its sum, separately from `externalCash` and gross sales. Released cash enters the scenario's funding budget without a security order, sale tax or withdrawal fee. Unspent released amounts remain cash. The ledger records budget availability, not executed withdrawals. Sources declare spendable cash balances; model securities that need liquidation and their costs as explicit sales. Depot funding and required transfers include these amounts; cross-depot funding still requires transfer confirmation.

Corridors are descriptive: affordable partial progress may be feasible while outside a corridor. The cash floor is a hard funding constraint for every scenario that would lower the reserve: if even the largest possible reserve after a scenario is below the floor and below the reserve before it, the scenario is `unavailable` (`reserve_shortfall`). A reserve that already sits below the floor does not make the book unusable: a `keep` scenario, or fresh cash that raises the reserve without reaching the floor, is `conditional` (`reserve_floor_not_reached`) and states `reserveShortfall`, the floor minus `reserveAfter`, when the reserve is known.

## Declare fees and amount rules

Optional `accounts` are declarations keyed by depot ID. `minimum`, `maximum` (zero means uncapped) and positive `increment` apply to monetary order amounts. The `AccountRules` type requires exactly one fee declaration. Declare an unknown flat fee as `feePerTrade: null`, or use null schedule sides; do not omit both models. Choose one:

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

The scenario's external cash, explicit sale proceeds and selected existing-cash releases fund purchases. Existing cash is an internal funding source and never increases modeled wealth. Omitted purchases leave proceeds in cash. With known costs:

```text
valueAfter = valueBefore + externalCash - feeCost - taxCost
```

Explicit orders are never silently rounded or resized after tax/fee estimates have been supplied. Amount-rule or preference violations make a scenario unavailable. An input exceeding configured structural capacities is rejected.

`feasible` means declared modeled constraints and reserve are satisfied with known costs and confirmed required transfers, and no generated order amount stays uninvested. Unknown rules/costs produce `conditional`; unknown costs withhold after-wealth, retained cash, rows and reserve outcomes. Guaranteed funding/reserve failures remain `unavailable`, even with other unknown costs: known nonnegative cost components establish a lower bound. Actual incomplete totals remain `null`.

## Allocate and project directly

`allocateContribution({ configuration, positions, policy, contribution, cashDeployment, cashFloor?, minTradeSize?, maxTrades? })` returns pooled class allocations, retained cash and post-contribution wealth, without account rules or fees. `cashDeployment` is required: `preserve` or `deploy_excess`. The latter releases pooled cash above `cashFloor`. `existingCashReleased` reports that amount; `proportion` is each allocation's share of the contribution plus released cash. `retainedCash` is the unspent funding budget, including unspent released cash. Post-contribution wealth adds only new contributions; admitted shares need not sum to one.

```ts
import { projectContributions } from "@investboard/rebalancing";

const projection = projectContributions({
  configuration,
  positions: [{ assetClass: "equities", value: 70000 }, { assetClass: "bonds", value: 30000 }],
  policy: result.snapshot.request.policy,
  cashSweep: "retain",
  contributions: 100, periods: 12, periodsPerYear: 12, minTradeSize: 1000,
  annualReturns: { equities: 0, bonds: 0, cash: 0 },
});
// All 12 contributions remain cash below the minimum.
```

`cashSweep` is required: `retain` keeps skipped cash outside future deployment budgets; `reinvest_excess` makes accumulated cash above the floor available each period. For example, contributions of 100 under a 150 minimum remain cash in period one and can fund a 200 allocation in period two when sweeping is selected. Existing cash is subtracted from its original position before allocations/retained budget are added back, so it is never counted twice.

`periodsPerYear` chooses cadence (12 monthly, 4 quarterly, 52 weekly, or another positive integer). `periods` is bounded by `configuration.limits.projectionPeriods`. `contributions` is one constant amount or an array with exactly one amount per period. `annualReturns` is one class map or an equally long array of class maps. Supply annual-effective fractions for every held/target class and the configured cash class in every map. Each period applies `(1 + annualReturn) ** (1 / periodsPerYear)` before adding its contribution. No return or cadence is inferred.

For changing assumptions, use inputs such as `contributions: [100, 200]` and `annualReturns: [{ equities: 0.04, bonds: 0.02, cash: 0 }, { equities: -0.1, bonds: 0.01, cash: 0 }]` with `periods: 2`. Dates and market paths belong to the host. Each timeline entry records its `period`, `contribution`, `existingCashReleased`, total value and positions.

Projections omit broker fees, transfers and taxes and use no wall clock. Horizon, wealth and optional return bounds come from your configuration; returns must remain finite and at least -1. `retainedCash` is the unspent period funding budget, which can include swept cash. `projectContributions(projection.request)` reproduces the result.

## Save, replay and upgrade

```ts
import { replayRebalanceComparison } from "@investboard/rebalancing";
const saved = JSON.stringify(result.snapshot);
const reproduced = replayRebalanceComparison(JSON.parse(saved));
```

Comparisons use `rebalance-comparison-v5`; projections use `contribution-projection-v3`. Snapshots defensively copy all inputs, including host configuration, fee declarations and scenario choices. They are not signed or independently verified. Your host owns access, storage and review workflows.

A saved `rebalance-comparison-v4` snapshot replays under the rules it was saved with and returns its original v4 result: no consolidation, routing to other accounts, fee admission rule, leftover report or reserve shortfall statement. It cannot carry `fund` or `priced` declarations. To apply the current rules, call `compareRebalance(savedSnapshot.request)` and store the new v5 snapshot separately.

Inputs must be plain JSON data: no functions, accessors, symbols, dates, cycles, sparse arrays or non-finite numbers. Omit optional fields instead of passing `undefined`. Invalid inputs raise `RebalanceInputError`. Incomplete supported evidence produces conditional/unavailable results.

**0.4.0 is a breaking API change.** From 0.3.0, add `purchasePlacement` and `cashDeployment` to comparisons and `cashDeployment` to direct allocations. To preserve the prior public behavior, explicitly choose largest-holding placement and preserved cash. Add `cashSweep: "retain"` to preserve the prior projection policy. No product defaults are supplied by the library.

Rename configured `limits.projectionMonths` to `limits.projectionPeriods`. Map projection `months` to `periods`, `monthlyContribution` to `contributions`, and set `periodsPerYear: 12` to preserve monthly cadence. Rename timeline `month` to `period`. Single return maps remain supported, alongside period paths.

Comparison v1/v2/v3 replay is refused. Explicitly migrate the stored request, choose policies, calculate and review a new v5 result, and store it separately. Keep original results and the exact prior package for historical reproduction. For 0.1/0.2 requests, also supply a host configuration and map old root contribution/cashLimit/salePlan fields to explicit scenarios. See [CHANGELOG.md](CHANGELOG.md).

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
