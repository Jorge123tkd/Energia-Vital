-- Migración 002: Sistema de clientes, sorteos, recompensas y verificación
-- Añade columnas a customers y admin_users, crea nuevas tablas.

-- === ALTER TABLE customers (telegram_chat_id ya existe en 001) ===
ALTER TABLE customers ADD COLUMN role TEXT NOT NULL DEFAULT 'customer';
ALTER TABLE customers ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN password_hash TEXT;
ALTER TABLE customers ADD COLUMN telegram_username TEXT;

-- === ALTER TABLE admin_users ===
ALTER TABLE admin_users ADD COLUMN telegram_chat_id TEXT;
ALTER TABLE admin_users ADD COLUMN telegram_username TEXT;
ALTER TABLE admin_users ADD COLUMN telegram_linked_at TEXT;

-- === phone_verifications ===
CREATE TABLE IF NOT EXISTS phone_verifications (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_phone ON phone_verifications(phone);

-- === telegram_links ===
CREATE TABLE IF NOT EXISTS telegram_links (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  link_code TEXT NOT NULL UNIQUE,
  used INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE INDEX IF NOT EXISTS idx_telegram_links_code ON telegram_links(link_code);

-- === giveaways ===
CREATE TABLE IF NOT EXISTS giveaways (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  prize TEXT NOT NULL,
  prize_image_url TEXT,
  entry_type TEXT NOT NULL DEFAULT 'any' CHECK (entry_type IN ('any','telegram','phone','customer')),
  requires_email INTEGER NOT NULL DEFAULT 0,
  requires_phone INTEGER NOT NULL DEFAULT 0,
  requires_telegram INTEGER NOT NULL DEFAULT 0,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  max_participants INTEGER,
  max_winner_entries INTEGER NOT NULL DEFAULT 1,
  num_winners INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','ended','cancelled')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_giveaways_status ON giveaways(status);
CREATE INDEX IF NOT EXISTS idx_giveaways_dates ON giveaways(start_date, end_date);

-- === giveaway_participants ===
CREATE TABLE IF NOT EXISTS giveaway_participants (
  id TEXT PRIMARY KEY,
  giveaway_id TEXT NOT NULL,
  customer_id TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  entry_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE INDEX IF NOT EXISTS idx_giveaway_participants_giveaway ON giveaway_participants(giveaway_id);
CREATE INDEX IF NOT EXISTS idx_giveaway_participants_customer ON giveaway_participants(customer_id);

-- === giveaway_winners ===
CREATE TABLE IF NOT EXISTS giveaway_winners (
  id TEXT PRIMARY KEY,
  giveaway_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  customer_id TEXT,
  position INTEGER NOT NULL,
  prize TEXT NOT NULL,
  notified INTEGER NOT NULL DEFAULT 0,
  claimed INTEGER NOT NULL DEFAULT 0,
  claimed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id) REFERENCES giveaway_participants(id)
);
CREATE INDEX IF NOT EXISTS idx_giveaway_winners_giveaway ON giveaway_winners(giveaway_id);

-- === reward_catalog ===
CREATE TABLE IF NOT EXISTS reward_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  cost INTEGER NOT NULL,
  stock_quantity INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- === reward_redemptions ===
CREATE TABLE IF NOT EXISTS reward_redemptions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  reward_id TEXT NOT NULL,
  points_spent INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','redeemed','cancelled')),
  redemption_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (reward_id) REFERENCES reward_catalog(id)
);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_customer ON reward_redemptions(customer_id);

-- === customer_points ===
CREATE TABLE IF NOT EXISTS customer_points (
  customer_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- === notifications ===
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_type TEXT NOT NULL DEFAULT 'customer' CHECK (user_type IN ('customer','admin')),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, user_type);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);

-- === ticket_assignments ===
CREATE TABLE IF NOT EXISTS ticket_assignments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  assignee_id TEXT NOT NULL,
  assignee_type TEXT NOT NULL DEFAULT 'admin' CHECK (assignee_type IN ('admin','customer')),
  assigned_by TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ticket_assignments_ticket ON ticket_assignments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_assignments_assignee ON ticket_assignments(assignee_id, assignee_type);

