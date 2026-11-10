# Stress testing v0.1.0: release review

Reviewer: independent coding agent, separate from the implementation agent. This is an engineering review of the documented calculation scope.

Independent release review, 10 November 2026

Candidate: `53932d6ffcaef6fe9c7dbdd188aeffa8febb6280`, methodology `whole-wealth-currency-replay-v5`.

Score: **9/10 for the pure standalone calculation module. Publication decision: yes for this reviewed scope.** No unresolved material correctness or packaging finding was identified in the final source review. This decision does not certify or close the hosted application feature.

The supported job is a deterministic, hypothetical replay of caller-valued holdings against supplied historical endpoints or named scenario approximations. Review covered runtime request/history validation, quote versus economic currency, explicit unknown exposure, dated price/FX admission, monetary rounding and limits, attribution reconciliation, snapshot replay/version refusal, extracted source provenance, license/notice material, examples and package exports. Supplied evidence is caller-provided, scenario shocks remain approximate, and the package performs no provider fetches, account operations, queue work, tax calculations or predictions.

The earlier findings are resolved:

- Non-JSON Date/boxed/accessor/hidden/sparse metadata is rejected instead of changing financial meaning after JSON storage.
- Pre- and post-scenario wealth is explicitly limited to 1 billion reporting-currency units. The previous extreme-value cent counterexamples are refused; the supported 200-holding boundary reconciles.
- V5 specifies half-up cent products with a bounded correction for floating-point noise around ties. The EUR2.01 at -50% counterexample now returns EUR1.01. Native V3/V4 archives retain their original binary rounding rule rather than being silently reinterpreted as V5.

Independent local verification on the corrected candidate ran 14 selected public-package regressions successfully; 46 other tests in those two files were not selected. A direct runtime check confirmed V5, the 1-billion cap, rejection of the original non-JSON and large-value counterexamples, EUR1.01 midpoint output, and identical JSON replay. All 13 extraction-manifest upstream/export SHA-256 pairs matched the recorded native revision `9f528620808b196ad2e4dcdb7f753cb803905138`. The separate local package report records 123 passing tests; consumer evidence records a standalone tarball installation with no runtime dependencies or workspace symlink, working JavaScript and TypeScript consumption, V5 midpoint behavior and JSON replay. These evidence sets are distinct, not additive claims of unique behaviors.

The native route/version diff at `9f528620808b196ad2e4dcdb7f753cb803905138` was also reviewed. No new material finding was identified: custody-model refusal is restricted to Langzeit, Krisen remains reachable for whole wealth, access gates remain ahead of portfolio reads, current calculations use V5, and retained V3/V4 analyses preserve their original monetary interpretation. Hosted worker completion, deployed state, provider availability and authenticated end-to-end acceptance remain separate open gates. This review accessed no private authenticated fixtures and ran no heavy application suite or remote diagnostics.

Review evidence: `independent-final-targeted-tests.log`, `independent-final-runtime.json`, `independent-final-provenance.json`, `package-tests.json`, `package-parity.json`, and `consumer-smoke.json`, retained locally with this record. Admission into the released catalogue should include a review record tied to the reviewed code revision and methodology, as required by the repository release policy.

Review rebinding: the clean export commit `53932d6ffcaef6fe9c7dbdd188aeffa8febb6280` has exactly the same whole-tree object `13de1edd032a837c01b0d8860321f54e5c2d57b2` as the originally reviewed `92e4d49a2e111787673ad48313dd981d7b2f8f4f`. Independent `git diff --exit-code` and tree-object checks confirmed content equality. The 9/10 decision and existing verification therefore apply unchanged to the clean export, without republishing intermediate candidate history.

## Reproduce

The released package source matches the reviewed source commit above. The release tag `stress-test-v0.1.0` also includes this review and the catalogue entry; those additions do not change the package source.

From a checkout of this repository, use Node 22 or newer and pnpm 9.15.0:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm example
pnpm build
cd packages/stress-test
npm pack
```

Install the tarball in a separate directory to consume the ESM package and TypeScript declarations without workspace links. See the [concise release evidence](stress-test-0.1.0.evidence.json) and [per-file extraction hashes](../packages/stress-test/source-provenance.json). Routine execution logs remain local.
