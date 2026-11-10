# Capability release policy

## Admission

Each capability must have a review record tied to the exact released commit and methodology version. The record must define the investor job, supported scope, limitations, reviewer, date, score, and reproducible evidence. A release requires a score of at least 9/10 and no unresolved material correctness or authorization finding.

Review the capability against these gates:

1. Financial quantities reconcile in explicit units. Missing values, identities and economic exposure stay unknown. Unsupported inputs are refused or clearly marked partial.
2. Methods, approximation, source provenance and historical windows are inspectable. A hypothetical scenario must not become a forecast, probability or claimed investor history.
3. The implementation is small, typed and dependency-conscious, with no app-internal imports or infrastructure dependencies. Public APIs validate their supported input boundary.
4. Meaningful regression tests exercise failure cases and real financial invariants. Type validation and relevant example runs pass on the released source. Inherited or unrun evidence cannot certify a new release.
5. Results are reproducible from documented, pinned inputs. Examples contain synthetic investor data or data whose redistribution is permitted, with provenance retained.
6. An independent code review resolves material findings. The public export contains only reviewed source, examples, documentation and license material; it contains no credentials, account records, private operational configuration or private repository history.
7. Evidence is appropriate to the stated capability. A hosted feature claiming queue, persistence or recovery behavior needs an authorized end-to-end environment check; a pure calculation module must prove that it runs independently.

## Publication

Add a qualified module and its review record to `capabilities.json` in the same change. The catalogue stays empty until a capability meets the admission gates. Do not add experimental or lower-scoring modules to the released catalogue.

Publish a small, explicit source export rather than copying application history. Preserve copyright and source attribution. Changes affecting the meaning of a retained calculation require methodology versioning and a documented compatibility policy.

## Verification costs

Run focused verification locally. This repository does not create scheduled or automatic hosted diagnostic jobs. A new hosted workflow requires explicit project-owner authorization. Store routine output locally and commit only concise, necessary release evidence.
