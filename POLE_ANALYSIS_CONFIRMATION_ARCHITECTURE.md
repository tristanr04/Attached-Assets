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

## Pole Identity Engine

Each company owns verified pole profiles containing the stable pole asset ID, pole number/tags, coordinates, project/work-order links, visible framing/equipment/attachment/landmark attributes, and foreman-verified reference photos. Retrieval must filter by company before scoring.

The identity engine ranks candidates from four independently recorded signals: normalized OCR/barcode tags, GPS distance, similarity to current verified photos and visible attributes, and active job context. Stale reference photos are discounted. An exact pole is only an **AI-proposed exact match** when the weighted score is at least 0.82, at least two strong independent signals agree, and the lead over the runner-up is at least 0.12. Confirmation remains mandatory even then.

If those gates fail, the engine returns at most three company-scoped candidates and requests the missing evidence: a close pole-tag photo, location-enabled full-pole photo, second equipment/framing angle, or wider landmark view. It never converts uncertainty into an exact asset ID. Exact image hashes identify duplicate uploads, while re-analysis and confirmation still use version and idempotency protections.

## Pole type and construction classification

Pole type is never one flat label. The structured proposal keeps five independently reviewable axes: asset purpose (including the difference between streetlight-only and distribution-with-light), phase configuration, construction role (tangent, angle, dead-end, junction, tap, and related roles), equipment roles, and framing configuration. Generic visual facts map to the current company's active catalog names and IDs; company-specific naming never changes the underlying evidence.

Each axis requires relevant photo evidence. Phase needs conductor/insulator visibility, framing needs a pole-top/framing view, equipment needs a device view, dead-end/terminal needs termination or guy evidence, and junction/tap/branch needs conductor-direction evidence. Insufficient or obscured views request the exact missing angle. Every classification remains AI-proposed and independently confirmable; it cannot establish safety, work performed, quantities, or charges.

## Persistence needed before live rollout

- `pole_analysis_runs`: company, report, photo, version, target-match status/evidence, raw result, model/prompt versions, state, timestamps.
- `pole_analysis_fields`: run, field key/value, confidence, evidence, review requirement, requested photo.
- `pole_analysis_decisions`: run/version, field, accept/edit/reject, original and final values, note, actor, timestamp.
- `pole_profiles`: company, pole asset ID/number, coordinates, verified tags, project/work-order links, visible attributes, version, timestamps.
- `pole_reference_photos`: profile, private photo, image hash, verified actor/time, optional provider-neutral visual fingerprint reference.
- `pole_identity_candidates`: analysis run, profile, total score, per-signal score/evidence, ranking, duplicate-photo evidence.
- Unique `(photo_id, version)` and idempotency receipt constraints.
- Row-level authorization through report company and foreman ownership; completed-report mutation guard.

Migrations must be additive, preserve existing reports/photos, support repeat-safe deployment, and include rollback guidance that removes only unused analysis tables. No provider or paid service should be activated until the storage, authorization, worker isolation, retry, timeout, and confirmation transaction are implemented and integration-tested.

## Current checkpoint

The executable contracts and fictional fixture tests define field allowlists, evidence/confidence requirements, cross-company/report/photo rejection, conservative multi-signal pole ranking, multi-axis pole construction classification, company-specific type mapping, streetlight/distribution separation, junction evidence gates, adjacent-lookalike ambiguity, specific additional-photo requests, stale-reference discounting, duplicate-photo detection, completed-report locking, decision completeness, stale-version rejection, immutable confirmation output, and field-level scoring. Database persistence, OCR/barcode and visual-fingerprint providers, verified-profile maintenance, worker calls, report autofill UI, authenticated mobile rendering, and real-device photo behavior remain unimplemented and must not be represented as live.
