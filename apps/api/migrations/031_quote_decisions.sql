-- Commercial response, not signature, contract, payment, or authorization to start work.
CREATE TABLE commercial_quote_decisions (
 quote_id TEXT PRIMARY KEY REFERENCES commercial_quote_versions(id) ON DELETE RESTRICT,
 decision TEXT NOT NULL CHECK(decision IN ('accept','changes','reject')),
 note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=1000 AND (decision<>'changes' OR length(trim(note))>=3)),
 source TEXT NOT NULL CHECK(source IN ('customer','staff_evidence')),
 customer_id TEXT REFERENCES customers(id),
 actor_id TEXT REFERENCES admin_users(id),
 evidence TEXT CHECK(evidence IS NULL OR length(trim(evidence)) BETWEEN 12 AND 1000),
 decided_at TEXT NOT NULL,
 cuba_date TEXT NOT NULL,
 CHECK((source='customer' AND customer_id IS NOT NULL AND actor_id IS NULL AND evidence IS NULL) OR
 (source='staff_evidence' AND actor_id IS NOT NULL AND customer_id IS NULL AND evidence IS NOT NULL))
);
CREATE TRIGGER commercial_decision_guard BEFORE INSERT ON commercial_quote_decisions BEGIN
 SELECT CASE WHEN NOT EXISTS(
 SELECT 1 FROM commercial_quote_versions q JOIN requests r ON r.id=q.request_id
 WHERE q.id=NEW.quote_id AND q.status='approved_internal' AND q.valid_until>=NEW.cuba_date AND r.status NOT IN ('cancelled','completed')
 AND ((NEW.source='customer' AND r.customer_id=NEW.customer_id AND EXISTS(SELECT 1 FROM customers c WHERE c.id=NEW.customer_id AND c.is_active=1)
 AND EXISTS(SELECT 1 FROM notifications n WHERE n.id='quote-issued-'||q.id AND n.user_id=NEW.customer_id AND n.user_type='customer')
 AND NOT EXISTS(SELECT 1 FROM commercial_quote_versions v JOIN notifications n ON n.id='quote-issued-'||v.id AND n.user_id=NEW.customer_id AND n.user_type='customer' WHERE v.request_id=q.request_id AND v.version_no>q.version_no))
 OR (NEW.source='staff_evidence' AND EXISTS(SELECT 1 FROM admin_users a WHERE a.id=NEW.actor_id AND a.role='admin' AND a.is_active=1)
 AND NOT EXISTS(SELECT 1 FROM commercial_quote_versions v WHERE v.request_id=q.request_id AND v.version_no>q.version_no AND v.status='approved_internal')))
 AND NOT EXISTS(SELECT 1 FROM commercial_quote_decisions d JOIN commercial_quote_versions v ON v.id=d.quote_id WHERE v.request_id=q.request_id AND d.decision='accept')
 ) THEN RAISE(ABORT,'quote_decision_not_authorized') END;
END;
CREATE TRIGGER quote_decision_no_update BEFORE UPDATE ON commercial_quote_decisions BEGIN SELECT RAISE(ABORT,'quote_decision_immutable'); END;
CREATE TRIGGER quote_decision_no_delete BEFORE DELETE ON commercial_quote_decisions BEGIN SELECT RAISE(ABORT,'quote_decision_immutable'); END;
