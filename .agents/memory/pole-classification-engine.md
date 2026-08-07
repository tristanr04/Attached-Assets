---
name: Pole Classification Engine
description: Architecture and gotchas for the 5-axis pole classification engine added to the Photo-to-Job feature
---

## What it is
`artifacts/api-server/src/lib/pole-classification-engine.ts` — pure functions, no DB, 100% testable.

## Five axes
1. `assetPurpose` — streetlight_only | distribution | transmission | communications | joint_use
2. `phaseConfiguration` — none | single_phase | two_phase | three_phase
3. `constructionRole` — tangent | angle | corner | dead_end | terminal | junction | tap | branch | crossing | service | underground_riser
4. `equipmentRole` — multi-value array: light | transformer | transformer_bank | switch | cutout | recloser | sectionalizer | capacitor_bank | regulator | fused_tap
5. `framingConfiguration` — crossarm | armless | vertical | alley_arm | single_arm | double_arm | custom

## Critical design decisions

**tokenSet underscore splitting:**  
The `tokenSet()` helper must replace `_` with space BEFORE stripping other chars. "dead_end" must tokenize to {"dead", "end"} — otherwise catalog keyword matching fails. If you ever refactor tokenSet, the underscore split must come first.
```ts
s.toLowerCase().replace(/_/g, " ").replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
```

**scoreStructureConfig weights:**  
phases=0.45, constructionRole keywords=0.40, framing keywords=0.15  
The role weight must exceed the framing weight or a tangent-with-crossarm config beats a dead-end config when querying dead_end role. Raising framing weight above role weight breaks the dead-end catalog matching test.

**streetlight_only override:**  
`normalizeAssetPurpose` auto-overrides AI's "streetlight_only" → "distribution" (+ "streetlight" in `.also`) when either primary conductors (phaseConfig ≠ "none") or distribution equipment (transformer/switch/cutout/etc.) is present. This is the key streetlight_only vs distribution+streetlight distinction.

## Where results are stored
- `pole_analyses.classificationResult` — jsonb, full ClassificationResult with all 5 axes, per-axis confidence/evidence/needsPhoto/catalogMatch
- `pole_analyses.proposedFields` — extended with 5 new classification fields (same Accept/Edit/Reject flow as core fields)
- `pkb_training_examples` — foreman corrections auto-saved on confirm when any classification axis is edited or rejected

## Vision prompt extension
`VISION_PROMPT` in `pole-capture.ts` now includes a `classification` block with visual-indicator guidance per axis. `max_tokens` was raised from 1500 → 2500 to accommodate the larger response.

## Catalog matching
- `pkbPoleTypesTable.operationalClass` → assetPurpose (+0.60 exact match)
- `pkbStructureConfigsTable.phases` → phaseConfiguration (+0.45 exact match)
- Keyword Jaccard on aliases/searchKeywords/deadEndConfig/guyingRequirements

## Visual fingerprint extension
`extendVisualDescriptionWithClassification(base, result)` appends classification tokens to the visual description stored in `pole_reference_photos.visualDescription`. Called at confirm time so the full confirmed+classification fingerprint is saved, improving future identity engine matches.

## Test coverage
181 tests total (62 new in pole-classification-engine.test.ts) covering:
streetlight-only vs distribution+streetlight, tangent vs angle vs dead_end, joint-use, double circuit, obscured conductors (needsPhoto), partial images, adjacent lookalikes, company-specific naming, catalog matching, extractClassificationCorrections, extendVisualDescriptionWithClassification.

## Frontend
`ClassificationPanel` in `review.tsx` renders 5 `ClassificationAxisCard` components, each with:
- Confidence pill, value badge, evidence (collapsible)
- Catalog match badge (indigo) when PKB entry matched
- NeedsPhoto amber banner with specific photo guidance per axis
- Accept / Edit (select dropdown for enum axes, text input for multi-value) / Reject
- "Accept All" shortcut within the panel
- All 5 classification keys added to FIELD_KEYS so pending count and acceptAll work correctly

**Why:**  
These are independent classification axes that require different visual cues to resolve — keeping them separate (not merged into a single "pole type" field) allows the engine to request targeted photos for individual uncertain axes rather than rejecting the whole analysis.
