-- Draft and manually reviewed signed evidence are distinct immutable records.
CREATE TABLE service_contract_drafts (
 quote_id TEXT PRIMARY KEY REFERENCES commercial_quote_versions(id) ON DELETE RESTRICT,
 reference TEXT NOT NULL UNIQUE CHECK(length(reference) BETWEEN 3 AND 80),
 body_json TEXT NOT NULL CHECK(json_valid(body_json) AND json_type(body_json)='object' AND length(body_json)<=16000),
 created_by TEXT NOT NULL REFERENCES admin_users(id),
 created_at TEXT NOT NULL
);
CREATE TRIGGER service_contract_draft_guard BEFORE INSERT ON service_contract_drafts BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM admin_users WHERE id=NEW.created_by AND role='admin' AND is_active=1)
 OR NOT EXISTS(SELECT 1 FROM commercial_quote_versions q JOIN commercial_quote_decisions d ON d.quote_id=q.id JOIN requests r ON r.id=q.request_id WHERE q.id=NEW.quote_id AND d.decision='accept' AND q.status='approved_internal' AND r.status NOT IN ('cancelled','completed'))
 THEN RAISE(ABORT,'service_contract_not_authorized') END;
END;
CREATE TABLE service_contract_signatures (
 quote_id TEXT PRIMARY KEY REFERENCES service_contract_drafts(quote_id) ON DELETE RESTRICT,
 signed_on TEXT NOT NULL,
 evidence_note TEXT NOT NULL CHECK(length(trim(evidence_note)) BETWEEN 15 AND 900),
 r2_key TEXT NOT NULL UNIQUE CHECK(r2_key GLOB 'private-documents/contract-*'),
 filename TEXT NOT NULL,
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 5 AND 8388608),
 reviewed_by TEXT NOT NULL REFERENCES admin_users(id),
 recorded_at TEXT NOT NULL
);
CREATE TRIGGER service_contract_signature_guard BEFORE INSERT ON service_contract_signatures BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM admin_users WHERE id=NEW.reviewed_by AND role='admin' AND is_active=1)
 OR NOT EXISTS(SELECT 1 FROM service_contract_drafts d JOIN commercial_quote_versions q ON q.id=d.quote_id JOIN requests r ON r.id=q.request_id JOIN commercial_quote_decisions a ON a.quote_id=q.id WHERE d.quote_id=NEW.quote_id AND a.decision='accept' AND r.status NOT IN ('cancelled','completed') AND NEW.signed_on>=substr(d.created_at,1,10) AND NEW.signed_on<=substr(NEW.recorded_at,1,10))
 THEN RAISE(ABORT,'service_contract_signature_not_authorized') END;
END;
CREATE TRIGGER service_contract_draft_no_update BEFORE UPDATE ON service_contract_drafts BEGIN SELECT RAISE(ABORT,'service_contract_immutable'); END;
CREATE TRIGGER service_contract_draft_no_delete BEFORE DELETE ON service_contract_drafts BEGIN SELECT RAISE(ABORT,'service_contract_immutable'); END;
CREATE TRIGGER service_contract_signature_no_update BEFORE UPDATE ON service_contract_signatures BEGIN SELECT RAISE(ABORT,'service_contract_signature_immutable'); END;
CREATE TRIGGER service_contract_signature_no_delete BEFORE DELETE ON service_contract_signatures BEGIN SELECT RAISE(ABORT,'service_contract_signature_immutable'); END;
-- Future finance records must be linked to reviewed signed evidence, not merely an accepted quote.
-- Existing financial records are preserved without retroactive assertions.
CREATE TRIGGER service_contract_finance_guard BEFORE INSERT ON business_project_contracts
WHEN NOT EXISTS(SELECT 1 FROM service_contract_signatures s JOIN service_contract_drafts d ON d.quote_id=s.quote_id WHERE s.quote_id=NEW.quote_id AND d.reference=NEW.contract_reference AND s.signed_on=NEW.accepted_on)
BEGIN SELECT RAISE(ABORT,'business_contract_requires_signed_evidence'); END;
