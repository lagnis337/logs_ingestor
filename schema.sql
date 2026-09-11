-- Run once against your database:  psql -d <your_db> -f schema.sql

-- Staging table: raw JSON log entries land here first.
CREATE TABLE IF NOT EXISTS temp_json (
    json_array JSONB NOT NULL
);

-- Target table: one row per log entry with the JSON fields unpacked
-- into typed columns so they can be filtered and indexed.
CREATE TABLE IF NOT EXISTS logs_json_opened (
    id               SERIAL PRIMARY KEY,
    level            TEXT,
    message          TEXT,
    resourceId       TEXT,
    timestamp        TIMESTAMP,
    traceId          TEXT,
    spanId           TEXT,
    commit           TEXT,
    parentResourceId TEXT
);

-- Indexes on the columns most commonly filtered on.
CREATE INDEX IF NOT EXISTS logs_level_idx     ON logs_json_opened (level);
CREATE INDEX IF NOT EXISTS logs_timestamp_idx ON logs_json_opened (timestamp);
CREATE INDEX IF NOT EXISTS logs_traceid_idx   ON logs_json_opened (traceId);
