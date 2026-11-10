# Goal cash scheduling

Explore whether a shared cash balance can fund competing goals while protecting a reserve and meeting dated obligations. `@investboard/goal-planning` reserves only the cash needed before later declared capacity arrives. A payment due next year does not automatically lock away its full face value today.

The TypeScript module has no runtime dependencies, network calls, account access or wall clock. Your application supplies dated cash, obligations, goal requests and any starting-capital evidence. It returns a shared exact-cent ledger, each goal's funded contribution stream and a no-growth target gap.

## Run the synthetic example

From the repository root, use Node 22 or newer and pnpm 9.15.0:

```sh
pnpm install --frozen-lockfile
pnpm example:goals
```

The example compares three timing assumptions for the same EUR1,000 cash balance, EUR1,000 reserve, EUR1,000 monthly capacity, EUR500 goal contribution and EUR1,000 dated expense:

| Expense date | Cash result | Goal funding over 12 months |
| --- | --- | --- |
| Month 12 | Every payment and requested contribution fits | EUR6,000 |
| Month 2 | First month's EUR1,000 buffer is needed before the next receipt | EUR5,500 |
| Month 1, before that day's receipt | Expense is late even though same-day capacity settles it | EUR5,500 |

`feasible` describes the requested cash schedule. A feasible EUR6,000 contribution stream can still fall short of a EUR10,000 investment target. No probability of reaching that target is calculated.

## Use it in your project

Build and pack from this checkout:

```sh
pnpm --filter @investboard/goal-planning build
cd packages/goal-planning
npm pack
```

Install the generated archive in your project:

```sh
npm install /path/to/investboard-capabilities/packages/goal-planning/investboard-goal-planning-0.1.0.tgz
```

This is a source distribution with a package build configuration. It is not published to npm, and its snapshot is independent of Investboard's hosted API and saved plans.

```ts
import { planGoalCash, replayGoalCash } from "@investboard/goal-planning";

const result = planGoalCash({
  reportingCurrency: "EUR",
  asOfDate: "2026-01-01",
  unallocatedCash: 1000,
  reserveFloor: 1000,
  monthlyCapacity: 1000,
  obligationsComplete: true,
  paymentsTreatment: "already_netted",
  recurringPayments: [],
  liquidityNeeds: [{ id: "expense", dueDate: "2027-01-01", amount: 1000 }],
  goals: [{
    id: "goal",
    deadline: "2027-01-01",
    monthlyContribution: 500,
    targetAmount: 10000,
    startingCapital: { amount: 0, asOfDate: "2026-01-01", sourceIds: [] },
  }],
});

// result.status === "feasible"
// result.goals[0].fundedTotal === 6000
// result.goals[0].targetGap === 4000 (without growth, fees or tax)
const saved = JSON.stringify(result.snapshot);
const reproduced = replayGoalCash(JSON.parse(saved));
```

## Inputs and unknowns

All fields in the example are required. Empty collections mean no recorded entries; `obligationsComplete` is the caller's explicit assertion that the declared scope includes the relevant obligations.

| Input | Meaning |
| --- | --- |
| `reportingCurrency` | EUR or USD; every monetary input is already converted to this one currency |
| `asOfDate` | Caller-supplied cash observation date, independent of today's clock |
| `unallocatedCash` | Spendable opening cash, excluding goal starting capital and other earmarked wealth; `null` means unknown |
| `reserveFloor` | Cash protected from dated payments and goal contributions; `null` means unknown |
| `monthlyCapacity` | Monthly surplus before goal funding; negative for a living-cost deficit, `null` for unknown |
| `paymentsTreatment` | `already_netted`, `subtract_recorded` or `unknown`; never subtract the same payment twice |
| `recurringPayments` | Unique `id`, `monthlyAmount` (or `null`), inclusive `startDate` and `endDate` (each nullable for open bounds) |
| `liquidityNeeds` | Unique `id`, nonnegative `amount` and `dueDate`; balloon payments belong here explicitly |
| `goals` | Unique `id`, `deadline`, `monthlyContribution`, `targetAmount` and `startingCapital` |

Goal deadline and monthly contribution may be `null`; either makes the shared cash ledger `incomplete`, because its commitments cannot be established. An unknown target or starting capital only withholds that goal's target comparison; its known cash requests can still be scheduled. Zero is a known value.

Recurring payments are sampled on each monthly savings date. With `subtract_recorded`, subtract only entries whose inclusive dates contain that event. An unknown payment blocks the ledger only when it overlaps a modeled monthly event. With `already_netted`, payment amounts are informational. Inconsistent start/end dates are rejected in either mode. This is a monthly model, not a payroll or loan-amortization calendar; it does not infer due days, interest, settlement delays or balloon balances.

Starting capital has `amount`, `asOfDate` and unique caller-defined `sourceIds`. Positive capital needs at least one source identity. It must be observed on the request's date to support a no-growth outcome. If any source identity appears under several goals, their capital outcomes are withheld rather than counted twice. Your application supplies complete constituent identities and verifies ownership, valuation quality and FX. The module cannot detect an omitted or renamed duplicate. Starting capital never funds this cash ledger.

## Timing and allocation

Monthly capacity arrives on anniversaries of the original observation day, clamped independently to month end in UTC. January 31 gives February 28 or 29, then March 31. Month 1 is the first anniversary; there is no observation-day receipt and no partial-month contribution. Each goal stops receiving contributions at its own last full anniversary on or before its deadline. Later liquidity needs extend the cash timeline, not the earlier goal's contributions. Recurring payments alone do not extend the horizon.

At each date:

1. Pay dated needs from cash above the reserve. Record any due-time shortfall as arrears.
2. Apply the signed net monthly capacity, if this is a savings event. Compulsory negative capacity may erode the reserve. Unfunded deficits become explicit `obligationsShortfall` and arrears, rather than negative cash.
3. Settle arrears from cash above the floor. A late payment remains a due-time shortfall even when settled later that day.
4. Retain the floor and the minimum buffer needed for future mandatory costs before later capacity arrives.
5. Share remaining cash proportionally among that month's goal requests, in integer cents. Largest remainders receive spare cents; code-point goal identity breaks equal ties independently of input order and locale.

The backward buffer recurrence in cents is:

```text
requiredBefore = datedPayment + max(0, requiredAfter - netMonthlyCapacity)
```

It protects dated payments before same-day receipts. Future capacity reduces the buffer only where it arrives in time. The forward ledger consumes each actual receipt once. Future requirements cover mandatory expenses and negative capacity, not future voluntary goal requests. Missed goal contributions are not automatically caught up, and leftover cash is not automatically swept into a goal. There is no goal priority or borrowing facility.

## Read the result

`status` is `incomplete` when declarations are unknown or aggregate amounts exceed the supported range, `constrained` when a request is underfunded, a payment is late, or the reserve is breached, and otherwise `feasible`. These are cash-feasibility states, not target-achievement ratings. `reasonCodes` identify missing declarations or range/floor problems. Constrained events and goal requests are identified in the ledger itself.

Each row reports `date`, `month` (1-based, or `null` for a payment-only date), signed `netCapacity`, remaining `cash`, `allocations` with requested/funded amounts, `liquidityPaid` including arrears settlements, `liquidityShortfall` at the due time, `obligationsShortfall`, `overduePayments`, `futureCommitmentReserve` and `availableCash`.

The future buffer is part of the cash balance, not an extra expense. Free cash excludes floor, future buffer and arrears. In cents, every row preserves:

```text
cashAfter = cashBefore + netCapacity + obligationsShortfall
            - liquidityPaid - sum(goalFunding)
```

Each goal reports requested/funded totals, current capital, a no-growth outcome, target gap and its own reason codes. Missing outcomes remain `null`. To compose an investment-return model, supply each row's `allocations[].funded` at its actual month/date to your projection engine. Do not replace this stream with the requested monthly amount. A target is a nominal deadline amount; your application supplies any inflation adjustment and its assumptions. The package supplies no return, tax, fee or inflation model, probability, valuation refresh or recommendation.

## Limits, admission and replay

Amounts have at most two decimals. Individual absolute values are at most `LIMITS.amount` (1 billion currency units); only capacity may be negative. Opening cash plus all positive net receipts, total dated needs, total requested contributions, and each goal's starting capital plus requested contributions must separately stay within that bound. Future buffers, event net capacity and arrears have the same bound. Aggregate excess returns `incomplete` with no partial ledger. Cash and funds use integer cents; proportional products use internal `BigInt`, never serialized big integers.

Requests admit up to 100 goals, 500 dated needs, 100 recurring payments and 600 months. Dates are real ISO `YYYY-MM-DD` calendar dates from 1900 onward. Observation dates stop at 9949-12-31 so a 50-year horizon remains representable. Goal and due dates must lie between the observation date and its 600-month anniversary. Past obligations must be reflected in the declared opening state; future-valued capital is rejected.

Inputs must be plain JSON data with documented fields and bounded collections: no undefined fields, accessors, symbols, sparse arrays, cycles, class instances, dates or non-finite numbers. Invalid shapes, fractional cents, duplicate identities, impossible dates and unsupported versions throw `GoalCashInputError`. Known but incomplete evidence returns explicit unknowns.

Snapshots retain a defensive copy of inputs under `goal-cash-schedule-v1`. Replay recalculates from that evidence without contacting providers or reading the clock. Save serialized snapshots before mutating returned objects. They are not signed, authenticated or independently verified. Permission checks, source validation, persistence and retention belong to the host.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
