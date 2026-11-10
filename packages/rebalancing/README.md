# Contribution-aware portfolio rebalancing

Compare keeping your portfolio, investing fresh cash, making cash-limited progress, and a sale plan you supply. `@investboard/rebalancing` provides allocation and cash-accounting logic for your own portfolio dashboard or research tools.

The TypeScript module has **no runtime dependencies** and makes no network calls. It adapts Investboard's post-contribution allocation and scenario-funding logic into a standalone API. Account access, data providers, tax calculation, order execution and persistence belong to the hosting application.

## Run the example

From the repository root, use Node 22 or newer and pnpm 9.15.0:

```sh
pnpm install --frozen-lockfile
pnpm example:rebalancing
```

The synthetic example demonstrates three cases:

- EUR100,000 added to a EUR100,000 book at 70/30 buys EUR50,000 in each class and reaches a 60/40 target.
- Equal EUR100 sales with a supplied EUR26.38 tax estimate in only one depot expose a EUR13.19 funding transfer for equal EUR86.81 purchases.
- EUR100 monthly contributions under a EUR1,000 trade minimum remain cash throughout the projection.

## Use it in your project

Build and pack from this checkout:

```sh
pnpm build
cd packages/rebalancing
npm pack
```

Install the generated package from your project:

```sh
npm install /path/to/investboard-capabilities/packages/rebalancing/investboard-rebalancing-0.2.0.tgz
```

This is a source distribution and buildable package. It is not published to the npm registry. The public snapshot format is specific to this package; it is not an Investboard hosted API or saved-draft format.

The normal `npm pack` step rebuilds this package from source, so an old or missing `dist` directory cannot silently determine the packaged calculation behavior.

## Compare alternatives

```ts
import { compareRebalance } from "@investboard/rebalancing";

const result = compareRebalance({
  baseCurrency: "EUR",
  holdings: [
    { holdingId: "equity", depotId: "A", assetClass: "equities", value: 70000, currency: "EUR" },
    { holdingId: "bond", depotId: "A", assetClass: "bonds", value: 30000, currency: "EUR" },
  ],
  policy: {
    equities: { min: 0.55, target: 0.6, max: 0.65 },
    bonds: { min: 0.35, target: 0.4, max: 0.45 },
  },
  contribution: 100000,
  cashLimit: 1000,
  fundingDepotId: "A",
  accounts: [{ depotId: "A", feePerTrade: 0, minimum: 0, maximum: 0, increment: 0.01 }],
});
```

All four alternatives share the same whole-book source and policy:

| Kind | External cash admitted | Behavior |
| --- | --- | --- |
| `keep` | 0 | Shows the existing allocation and reserve |
| `fresh_cash` | `contribution` | Allocates new money against post-contribution shortfalls |
| `partial_cash` | `cashLimit` | Allocates the smaller budget and shows residual drift |
| `sales` | 0 | Assesses the exact caller-supplied `salePlan`; unavailable when none is supplied |

`priority` defaults to `minimize_sales`, preserving that order. `target_alignment` sorts available/conditional alternatives by residual drift before unavailable alternatives. The module reports comparisons, not a recommendation or an instruction to trade.

### Units and source completeness

- Every holding value, contribution, reserve, fee and supplied tax is already in the reporting currency, EUR or USD. No FX conversion is performed. A different holding currency withholds the entire denominator, rather than summing unlike units.
- `holdings` contains 1–200 rows with unique caller-defined holding IDs. Values are nonnegative and cent-rounded. Measured zero is valid; `null` withholds the comparison. The caller supplies the complete book and is responsible for valuation freshness and classification.
- Each input monetary value and total modeled wealth are limited to `MAX_SUPPORTED_WEALTH` (1 billion reporting-currency units). Portfolio plus fresh contribution must stay within that bound. This keeps cent arithmetic within a conservative supported range.
- Policy has 1–32 asset classes. Targets are fractions summing to one within `1e-9`, with `0 <= min <= target <= max <= 1`. Classes outside the policy have zero target and zero corridor. Zero total wealth has no allocation percentages; those row fields remain `null`.
- The engine retains holding identity when choosing an existing allocation, with largest value first and holding ID as the deterministic tie-break. A class without a held instrument has `holdingId: null`. It invents no ticker, price or share quantity. Outputs are monetary allocation intentions, not executable broker orders.

### Allocation, limits and retained cash

Positive shortfalls use `target × (current wealth + new net cash) − current class value`. A constrained budget shares these shortfalls proportionally. Largest remainders reconcile cents; reserve gaps use integer-cent subtraction. Cash, including any target cash allocation, remains retained funding.

`cashFloor` defaults to zero. `minTradeSize` defaults to 0.01 and `maxTrades` to 100. Cash, minimum-size exclusions and broker-rejected amounts consume no order slots. The comparison applies account caps and increments first, then ranks surviving amounts largest first with class-name ties resolved deterministically, and admits up to `maxTrades`. Rejected, capped and rounding remainders remain cash in the wealth denominator. The cash floor is a hard funding constraint. Corridors are reported separately: affordable partial progress can be `feasible` while still outside a corridor.

Optional `accounts` are caller declarations keyed by depot ID. `minimum`, `maximum` (zero means no cap), and `increment` apply to monetary amounts; `feePerTrade` is a flat amount or `null` when unknown. Fees are reserved for selected orders only. Fee reservation is conservative when a smaller budget removes an order; any excess reserve remains cash. Quantity increments, spread, slippage, percentage fees, instrument eligibility and actual account balances are not inferred.

`feasible` means the modeled flows satisfy the declared amount constraints and reserve, with known costs and any required transfer confirmed. It is not brokerage or tax verification. Unknown account rules, fees or tax produce `conditional` results. Unknown costs withhold after-wealth, retained cash, allocation rows and reserve outcomes. Insufficient funds or a violated floor produce `unavailable` results.

Incomplete costs do not hide a guaranteed failure. Because all supplied costs are nonnegative, the engine separately retains known fee and tax amounts, including known tax within a depot that also has an unknown sale. If even the most favorable completion of the remaining costs cannot fund the purchases or meet the reserve, the result is `unavailable`. Actual incomplete totals and reserve outcomes still remain `null`.

## Supply a sale plan

The module assesses a plan you choose. It does not select sales or calculate jurisdiction-specific taxes. Extend the request with:

```ts
salePlan: {
  sales: [
    { holdingId: "equity", amount: 10000,
      tax: { amount: 100, source: "My estimate for this exact sale in EUR" } },
  ],
  purchases: [
    { holdingId: "bond", depotId: "A", assetClass: "bonds", amount: 9900 },
  ],
}
```

Every sale names one source holding, appears at most once and cannot exceed its value. A purchase bound to a holding must match that holding's depot and asset class. A class-only purchase uses `holdingId: null`. Tax is either `{ amount, source }` for that exact sale or `null`; a supplied zero needs provenance just like any other estimate. The package validates the data shape, not the truth of the estimate.

Tax follows each holding's depot. It is never split by pooled gross proceeds. `funding` exposes external cash, gross sales, attributed tax, flat fees, purchases, net inflow and any transfer required per depot. `transfersConfirmed: true` acknowledges the transfer assumption; it does not move money. Unknown local tax or fees leave the corresponding transfer amount unknown.

Only the selected external cash and explicit sale proceeds fund new allocations. Existing cash is part of the book and reserve; reallocating it requires an explicit cash sale. Sale scenarios admit no external contribution. Omitted purchases leave the sale proceeds in cash, and:

```text
valueAfter = valueBefore + externalCash - feeCost - taxCost
```

A supplied sale plan is never silently rounded or resized after its tax has been declared. Amount-rule, minimum-size or order-count violations make it unavailable. Review a new plan and matching tax estimates to change those amounts.

## Allocate a contribution directly

```ts
import { allocateContribution } from "@investboard/rebalancing";

const allocation = allocateContribution({
  positions: [{ assetClass: "equities", value: 70000 }, { assetClass: "bonds", value: 30000 }],
  policy: {
    equities: { min: 0.55, target: 0.6, max: 0.65 },
    bonds: { min: 0.35, target: 0.4, max: 0.45 },
  },
  contribution: 10000,
  cashFloor: 5000,
});
// allocations: EUR5,000 bonds; retainedCash: EUR5,000;
// postContributionValue: EUR110,000.
```

This lower-level helper uses pooled class values without accounts or fees. `proportion` is a share of the contribution; admitted shares need not sum to one when cash is retained.

## Project recurring contributions

`projectContributions` takes `positions`, `policy`, `monthlyContribution`, `months`, optional `cashFloor`/trade preferences and explicit `annualReturns`. Supply an annual effective fraction for every held and target class, **including cash**. No return assumption is supplied by the module.

```ts
import { projectContributions } from "@investboard/rebalancing";

const projection = projectContributions({
  positions: [{ assetClass: "equities", value: 70000 }, { assetClass: "bonds", value: 30000 }],
  policy: {
    equities: { min: 0.55, target: 0.6, max: 0.65 },
    bonds: { min: 0.35, target: 0.4, max: 0.45 },
  },
  monthlyContribution: 100,
  months: 12,
  minTradeSize: 1000,
  annualReturns: { equities: 0, bonds: 0, cash: 0 },
});
// No purchases below the minimum; EUR1,200 new cash is retained.
```

Month 1 starts from the supplied positions, applies `(1 + annualReturn) ** (1/12)` to each class, rounds each class to cents, then admits one new monthly contribution. Every following month re-solves current shortfalls with the same minimum and order-count limits. Skipped amounts remain cash; they are not automatically swept into later purchases. `retainedCash` is the amount retained from that month's new contribution; the cash position shows the accumulated balance.

Projections are pooled class illustrations. They omit broker fees, transfers and tax, use no wall clock and do not predict future returns. Returns are limited to fractions from -1 through 10, horizons to 1–600 months, and projected wealth to the same supported bound. The result retains a defensive copy of every assumption so calling `projectContributions(result.request)` reproduces it.

## Save and replay

```ts
import { replayRebalanceComparison } from "@investboard/rebalancing";

const saved = JSON.stringify(result.snapshot);
const reproduced = replayRebalanceComparison(JSON.parse(saved));
```

Comparisons use `rebalance-comparison-v2`; projections use `contribution-projection-v1`. Unsupported comparison versions are refused. Inputs must be plain JSON data with documented fields: no functions, accessors, symbols, dates, cycles, sparse arrays or non-finite numbers. Omit optional fields instead of passing `undefined`. Malformed inputs raise `RebalanceInputError`; supported inputs with incomplete evidence produce explicit conditional/unavailable results.

Snapshots are defensive copies of the supplied inputs. They are not signed, authenticated or independently verified. Your application manages permissions, storage, retention and any review or save workflow. Replay uses the original evidence, never today's account or provider state.

### Upgrade from 0.1.0

Version 0.2.0 corrects broker admission under an order cap and guaranteed funding/reserve failures with incomplete costs. Those corrections can change comparison results for unchanged inputs, so v1 snapshots are refused by `replayRebalanceComparison` rather than silently relabeled or recomputed.

The request shape is unchanged. To obtain a corrected comparison, explicitly call `compareRebalance(oldSnapshot.request)`, review that new result, and store its v2 snapshot separately. Keep the original result or the exact 0.1.0 package when historical v1 reproduction is needed. Direct contribution allocation and `contribution-projection-v1` behavior are unchanged. See [CHANGELOG.md](CHANGELOG.md).

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
