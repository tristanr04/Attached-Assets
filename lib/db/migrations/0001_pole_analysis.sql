BEGIN;

CREATE TABLE IF NOT EXISTS pole_profiles (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_key text NOT NULL,
  pole_number text,
  location_label text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  project_id integer REFERENCES projects(id) ON DELETE SET NULL,
  work_order_ref text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  visual_attributes jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pole_profiles_latitude_range CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT pole_profiles_longitude_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE UNIQUE INDEX IF NOT EXISTS pole_profiles_company_asset_key_uq ON pole_profiles(company_id, asset_key);
CREATE UNIQUE INDEX IF NOT EXISTS pole_profiles_company_id_uq ON pole_profiles(company_id, id);

CREATE TABLE IF NOT EXISTS pole_type_catalog_items (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  axis text NOT NULL CHECK (axis IN ('asset_purpose', 'phase_configuration', 'construction_role', 'equipment_role', 'framing_configuration')),
  code text NOT NULL,
  name text NOT NULL,
  generic_values jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pole_type_catalog_company_axis_code_uq ON pole_type_catalog_items(company_id, axis, code);

CREATE TABLE IF NOT EXISTS pole_reference_photos (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pole_profile_id integer NOT NULL,
  photo_id integer NOT NULL REFERENCES photos(id),
  image_sha256 text NOT NULL CHECK (image_sha256 ~ '^[0-9a-fA-F]{64}$'),
  visual_fingerprint jsonb,
  verified_by_user_id integer NOT NULL REFERENCES users(id),
  verified_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pole_reference_photos_company_profile_fk FOREIGN KEY (company_id, pole_profile_id) REFERENCES pole_profiles(company_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS pole_reference_photos_profile_photo_uq ON pole_reference_photos(pole_profile_id, photo_id);
CREATE UNIQUE INDEX IF NOT EXISTS pole_reference_photos_company_hash_uq ON pole_reference_photos(company_id, image_sha256);

CREATE TABLE IF NOT EXISTS pole_analysis_runs (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  report_id integer NOT NULL REFERENCES daily_reports(id),
  photo_id integer NOT NULL REFERENCES photos(id),
  analysis_key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'ai_proposed' CHECK (status IN ('ai_proposed', 'foreman_confirmed', 'rejected', 'failed')),
  target_match text NOT NULL CHECK (target_match IN ('confirmed', 'ambiguous', 'conflict', 'no_match')),
  selected_pole_profile_id integer,
  model_provider text NOT NULL,
  model_name text NOT NULL,
  model_version text NOT NULL,
  prompt_version text NOT NULL,
  raw_result jsonb NOT NULL,
  target_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  CONSTRAINT pole_analysis_runs_company_profile_fk FOREIGN KEY (company_id, selected_pole_profile_id) REFERENCES pole_profiles(company_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS pole_analysis_runs_photo_version_uq ON pole_analysis_runs(photo_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS pole_analysis_runs_company_idempotency_uq ON pole_analysis_runs(company_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS pole_analysis_runs_company_analysis_key_version_uq ON pole_analysis_runs(company_id, analysis_key, version);
CREATE UNIQUE INDEX IF NOT EXISTS pole_analysis_runs_company_id_uq ON pole_analysis_runs(company_id, id);

CREATE TABLE IF NOT EXISTS pole_analysis_candidates (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  analysis_run_id integer NOT NULL,
  pole_profile_id integer NOT NULL,
  rank integer NOT NULL CHECK (rank BETWEEN 1 AND 3),
  score numeric(5,4) NOT NULL CHECK (score BETWEEN 0 AND 1),
  signal_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT pole_analysis_candidates_company_run_fk FOREIGN KEY (company_id, analysis_run_id) REFERENCES pole_analysis_runs(company_id, id) ON DELETE CASCADE,
  CONSTRAINT pole_analysis_candidates_company_profile_fk FOREIGN KEY (company_id, pole_profile_id) REFERENCES pole_profiles(company_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS pole_analysis_candidates_run_profile_uq ON pole_analysis_candidates(analysis_run_id, pole_profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS pole_analysis_candidates_run_rank_uq ON pole_analysis_candidates(analysis_run_id, rank);

CREATE TABLE IF NOT EXISTS pole_analysis_fields (
  id serial PRIMARY KEY,
  analysis_run_id integer NOT NULL REFERENCES pole_analysis_runs(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  proposed_value jsonb NOT NULL,
  confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_requirement text NOT NULL CHECK (review_requirement IN ('foreman_review', 'manual_selection', 'additional_photo')),
  additional_photo_request text
);
CREATE UNIQUE INDEX IF NOT EXISTS pole_analysis_fields_run_field_uq ON pole_analysis_fields(analysis_run_id, field_key);

CREATE TABLE IF NOT EXISTS pole_analysis_decisions (
  id serial PRIMARY KEY,
  analysis_run_id integer NOT NULL REFERENCES pole_analysis_runs(id),
  field_key text NOT NULL,
  action text NOT NULL CHECK (action IN ('accept', 'edit', 'reject')),
  original_value jsonb NOT NULL,
  final_value jsonb,
  note text,
  actor_user_id integer NOT NULL REFERENCES users(id),
  decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pole_analysis_decisions_run_field_uq ON pole_analysis_decisions(analysis_run_id, field_key);

COMMIT;
