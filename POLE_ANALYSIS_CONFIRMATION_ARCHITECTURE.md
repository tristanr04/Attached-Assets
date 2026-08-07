# Pole Analysis Autofill and Foreman Confirmation

## Non-negotiable boundary

Pole analysis produces a versioned, company-scoped **AI proposal**. It never writes final report facts, safety findings, quantities, rates, charges, completion, or approval. Every proposed field carries confidence and photo evidence. A foreman must accept, edit, or reject every material field before an explicit confirmation can create a confirmed snapshot.

## Required sequence

1. Save the original photo to the active draft report using private authorized storage.
2. Resolve the report using the authenticated company, active report, OCR tag, GPS, timestamp, and mapped location. Ambiguity or conflict stops autofill and requires manual report selection.
3. Run company-scoped retrieval only. The analysis worker receives the resolved company ID and may retrieve only that company's catalogs, standards, work packages, documentation rules, and active contract context.
4. Persist a new immutable analysis version containing the image reference, model and prompt versions, raw structured result, field confidence, evidence, limitations, and requested additional photos.
5. Display the source photo beside the proposed fields. Low-confidence fields require manual selection or a specific additional-photo request.
6. Require accept, edit, or reject for every proposed field and one explicit final confirmation action.
7. In one transaction, verify the report is still draft, the company/report/photo still match, the analysis version is current, and the idempotency key has not been used. Persist the decisions, final confirmed facts, actor, timestamp, and immutable audit record.
8. Company rules may then create separate reviewable billing suggestions. They may not modify the confirmed visual facts or finalize billing.

## Persistence needed before live rollout

- `pole_analysis_runs`: company, report, photo, version, target-match status/evidence, raw result, model/prompt versions, state, timestamps.
- `pole_analysis_fields`: run, field key/value, confidence, evidence, review requirement, requested photo.
- `pole_analysis_decisions`: run/version, field, accept/edit/reject, original and final values, note, actor, timestamp.
- Unique `(photo_id, version)` and idempotency receipt constraints.
- Row-level authorization through report company and foreman ownership; completed-report mutation guard.

Migrations must be additive, preserve existing reports/photos, support repeat-safe deployment, and include rollback guidance that removes only unused analysis tables. No provider or paid service should be activated until the storage, authorization, worker isolation, retry, timeout, and confirmation transaction are implemented and integration-tested.

## Current checkpoint

The executable contract and fictional fixture tests define field allowlists, evidence/confidence requirements, cross-company/report/photo rejection, ambiguous-target blocking, completed-report locking, decision completeness, stale-version rejection, immutable confirmation output, and field-level scoring. Database persistence, worker/provider calls, report autofill UI, authenticated mobile rendering, and real-device photo behavior remain unimplemented and must not be represented as live.
