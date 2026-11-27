-- Canjes atómicos: una única inserción valida saldo/stock y los descuenta.
CREATE TRIGGER IF NOT EXISTS reward_validate_redemption BEFORE INSERT ON reward_redemptions
BEGIN
  SELECT CASE WHEN (SELECT COALESCE(balance, 0) FROM customer_points WHERE customer_id = NEW.customer_id) IS NULL
    THEN RAISE(ABORT, 'insufficient_points') END;
  SELECT CASE WHEN COALESCE((SELECT balance FROM customer_points WHERE customer_id = NEW.customer_id), 0) < NEW.points_spent
    THEN RAISE(ABORT, 'insufficient_points') END;
  SELECT CASE WHEN (SELECT id FROM reward_catalog WHERE id = NEW.reward_id AND is_active = 1) IS NULL
    THEN RAISE(ABORT, 'reward_unavailable') END;
  SELECT CASE WHEN (SELECT stock_quantity FROM reward_catalog WHERE id = NEW.reward_id) <= 0
    THEN RAISE(ABORT, 'out_of_stock') END;
END;
CREATE TRIGGER IF NOT EXISTS reward_apply_redemption AFTER INSERT ON reward_redemptions
BEGIN
  UPDATE customer_points SET balance = balance - NEW.points_spent, total_spent = total_spent + NEW.points_spent, updated_at = datetime('now') WHERE customer_id = NEW.customer_id;
  UPDATE reward_catalog SET stock_quantity = stock_quantity - 1 WHERE id = NEW.reward_id AND stock_quantity IS NOT NULL;
END;
