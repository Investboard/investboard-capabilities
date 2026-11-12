# RA-05 implementation handoff — 12 November 2026

Base: public `origin/main` at `34793a7db3515541b60eb432f7a41787a2bf08dd`.
Candidate: `codex/pi-currency-evidence-20261112`; package **0.3.0**, method **portfolio-intelligence-v3**, both pending review/merge. No publication or deployment.

The convention: listing denominations, country assignments and fund-name hedge hints are not independently verified economic-currency exposure or hedge policy. That qualification must travel with the numbers.

## Acceptance matrix

| Criterion | Source implementation | Execution evidence |
| --- | --- | --- |
| Listing denomination stays separate | `listingCurrency.qualification` names its caller-supplied basis; optional dated provenance retained; CSV refuses absent denomination | UNRUN |
| Geography and name inference stay qualified | Proxy dimension has method, basis, verification/stress flags, weight/coverage denominators and null hedge ratio; individual name hints retain identity and unknown date/ratio | UNRUN |
| Genuine source-backed inputs remain distinct | Strict per-holding exposure/policy basis and dated reference; separate `reportedEconomicCurrency`; never populated from proxy fields | UNRUN |
| Known zero and unknown remain different | Explicit zero entries retained; incomplete vectors leave unknown mass; missing/partial/unknown hedge policy withholds net allocation | UNRUN |
| No evidence pooling or invented revenue/ratios | Evidence bound to original holding id; source assertions remain independently unverified; no provider calls or hedge-ratio invention | UNRUN |
| Meaningful denominators | Source model coverage divides assigned value by valued equity value; weights divide by whole valued portfolio; off-axis/unvalued holdings remain outside the scope | UNRUN |
| Safe stress boundary | Output shapes are disjoint from verified stress input; proxies explicitly ineligible; source-backed single-currency candidates require independent verification; partial/mixed unknown cases unavailable | Authored cross-engine rejection regression, UNRUN |
| Preserve strong existing behavior | Country/name arithmetic, seven parity request files, look-through, overlap, concentration and correlations retained; misleading scalar renamed deliberately | Updated native parity assertions, UNRUN |
| Deliberate historical compatibility | New v3 replay only; older snapshots explicitly refuse with original-package replay / deliberate new evaluation path; no snapshot relabeling | Authored replay regression, UNRUN |
| No account/network/data-rights expansion | Zero runtime dependencies retained, caller-owned sources only, synthetic regressions/examples | Source review only |

## Source review findings and fixes

- The old `hedged` scalar implied verified hedged weight. Replaced with `nameInferredHedgeWeight` and individual qualified hints. Even an ambiguous/partial name can only trigger a disclosed proxy assumption, not verified policy.
- A missing hedge policy could otherwise make reported underlying exposure look like a net unhedged fact. Source model withholds net allocation until the policy is explicitly sourced. Partial hedges are not modeled.
- Source inputs must not be silently ignored or treated as proof. Unsupported nested fields, proxy bases, dates, weights, duplicate currency keys and hedge statuses are rejected; source-backed remains independently unverified.
- CSV ingestion had substituted portfolio base currency for absent listing currency. It now refuses the missing evidence; the valuation unit is not a denomination fact.
- The currency view used by the native app has a different coverage denominator from the raw dimension. Native view qualification explicitly uses whole valued portfolio; raw dimension parity uses valued equity value.
- Existing parity commit `6c48b02978b712a45b9b79481666c8f7e3b31ef0` is retained with an explicit **v2 numeric-only** scope. It is not a v3 receipt.

## Consumers and dependencies

Public types, analyzer/empty results, dimensions, strict input boundary, replay error, example, package/changelog/catalogue metadata, CSV runner, skill instructions and method reference are updated. Native companion branch `codex/pi-native-currency-evidence-20261112` targets website staging and qualifies cache/serve, MCP, allocation assistant, PH005 insight metadata, builder quick/report intelligence and public report currency sections. Native report equity evidence already carries `currencyMethod: domicile_proxy_name_hedges`; its different equity-denominator method is preserved.

Stress arithmetic and its verified-input contract are unchanged. Adapters must independently establish exact identity, source/date and single economic exposure or full target before constructing that contract. The source-backed result is not an admission service.

Website catalogue must advertise **merged 0.2.0/v2** until this public candidate is merged and reviewed into its source pin. It must not advertise 0.3.0/v3 from this branch as available. Native source qualification can merge independently; parity requires both candidates and an authorized fresh build.

## Checks deliberately NOT run

The founder explicitly stopped all execution. Nothing below was executed, directly or indirectly:

- `pnpm exec vitest run packages/portfolio-intelligence skills/portfolio-intelligence-engine`
- `pnpm --filter @investboard/portfolio-intelligence typecheck`
- `pnpm --filter @investboard/portfolio-intelligence build`
- `pnpm example:intelligence`
- `pnpm format:check`
- Native public-engine parity, native tests/types/refactor rules, generated OpenAPI/MCP artefacts, browser/Playwright/Lighthouse, database suites, financial probes/simulations, model/provider/ingestion runs, CI diagnostics.

Only file/source/diff and Git/workflow-trigger metadata inspection was performed. File-editing scripts did not import or run engine code. No old test receipt validates this candidate. This closes the source interpretation gap for review; it does **not** establish behaviorally verified 9/10, new parity, deployed availability or a successful required release check.
