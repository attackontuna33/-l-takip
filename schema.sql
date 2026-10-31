CREATE TABLE IF NOT EXISTS medicines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  time TEXT NOT NULL,
  repeat_minutes INTEGER NOT NULL DEFAULT 30,
  timezone TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint TEXT PRIMARY KEY,
  subscription_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS taken_logs (
  medicine_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  taken_at TEXT NOT NULL,
  PRIMARY KEY (medicine_id, local_date)
);
CREATE TABLE IF NOT EXISTS delivery_state (
  medicine_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_sent_at TEXT NOT NULL,
  PRIMARY KEY (medicine_id, local_date)
);
