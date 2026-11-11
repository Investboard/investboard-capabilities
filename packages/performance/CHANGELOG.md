# Changelog

## 0.4.0 (unreleased)

- Fees booked on their own: a recorded cost with the new optional `standalone: true` is money paid into the book that buys nothing. Its fee enters the flow series on its date as a contribution with no value added, so the time-weighted and money-weighted returns both fall by it, and the wealth bridge counts it in `securityFunding` as well as `recordedFees`. For example, a fee of 10 on the middle valuation date of a 10,000 book that then rises to 11,000 lowers the return from 10% to 9.89%. Previously such a fee was absent from both returns and reappeared as an equal unexplained residual in the bridge. Recorded costs without the marker, such as fees inside a trade, keep their treatment.
- The attribution reports standalone fees at portfolio level in the new optional `recordedCostContribution` and `recordedCostContributionPp`, present only when the request records a standalone fee. They are excluded from the residual and never count as unlinked capital, so the explanation reconciles without an unexplained line.
- One annualization threshold for both returns: a window of at least 365 days annualizes. The time-weighted return previously annualized only beyond 365 days while XIRR annualized from 365, so a window of exactly 365 days now gains an annualized time-weighted return.
- Half-cent rounding of netted transfers: a half-cent tie in a compensated total is judged against the magnitude of the amounts summed. Same-day transfers of +100.005 and -99 now fund 1.01 instead of 1.00, removing a false one-cent gain.
- The methodology becomes `actual-position-performance-v4`, pinned by new evaluations. Snapshots saved as `actual-position-performance-v3` replay under the v3 rules and return the result they were saved with; a v3 request cannot declare a standalone fee. To apply the v4 rules, evaluate `snapshot.request` again and store the new snapshot. v1 and v2 snapshots remain refused.

## 0.3.0

- Methodology v3: scoped NAV, coverage and external transfer funding use one compensated summation of the original amounts with cent rounding applied once. v1 and v2 snapshots are refused.

## 0.2.0

- Methodology v2: corrected XIRR convergence and cent normalization. v1 snapshots are refused.

## 0.1.0

Initial standalone source package with actual-position replay, cash-flow-adjusted returns, holding, price and quote-FX attribution, a wealth bridge, historical fund cost estimates and JSON replay.
