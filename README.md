# Log Ingestor

A small web service that ingests JSON-formatted application logs into a PostgreSQL database and lets you query them through a browser form using any combination of filters (log level, message text, resource, trace/span IDs, commit, and time ranges).

Built with **Node.js + Express** on the server side and **PostgreSQL** for storage. No front-end framework — the search UI is a single HTML page.

## What it does

1. **Ingest** — `POST /upload` accepts one log entry or an array of entries as JSON, like:

   ```json
   {
     "level": "error",
     "message": "Failed to connect to DB",
     "resourceId": "server-1234",
     "timestamp": "2023-09-15T08:00:00Z",
     "traceId": "abc-xyz-123",
     "spanId": "span-456",
     "commit": "5e5342f",
     "metadata": { "parentResourceId": "server-0987" }
   }
   ```

2. **Unpack** — each entry is staged as raw `JSONB` in a temporary table, then a single SQL statement uses PostgreSQL's JSON operators (`->>`) to flatten the nested document into typed columns in the `logs_json_opened` table. The staging table is cleared afterwards.

3. **Query** — `POST /filters` builds a parameterised `WHERE` clause from whichever filters were supplied and returns the matching rows as an HTML table, together with a count of matched vs. total rows.

```
 JSON logs ──POST /upload──▶ temp_json (JSONB) ──SQL unpack──▶ logs_json_opened (typed columns)
                                                                        │
 Browser form ──POST /filters──▶ dynamic parameterised SELECT ◀─────────┘
```

## Running it

**Prerequisites:** Node.js 18+, PostgreSQL 12+.

```bash
# 1. Install dependencies
npm install

# 2. Create the tables (in whichever database you want to use)
psql -d <your_database> -f schema.sql

# 3. Configure the DB connection
cp .env.example .env      # then edit .env with your credentials

# 4. Start the server
npm start                 # → http://localhost:3000
```

## Trying it out

Load the included sample data (5 log entries):

```bash
npm run seed
# or, by hand:
curl -X POST http://localhost:3000/upload \
     -H 'Content-Type: application/json' \
     --data @sample_logs.json
```

Then open <http://localhost:3000> in a browser and try a few searches:

| Filter                                  | Expected result            |
|-----------------------------------------|----------------------------|
| Level = `error`                         | 2 rows                     |
| Message contains `disk`                 | 1 row (case-insensitive)   |
| Start Date = End Date = `2023-09-16`    | 2 rows                     |
| Resource ID = `server-1234`             | 2 rows                     |
| No filters                              | all 5 rows                 |

You can also query from the command line, since the endpoint accepts both form data and JSON:

```bash
curl -X POST http://localhost:3000/filters -d 'level=error'
curl -X POST http://localhost:3000/filters -H 'Content-Type: application/json' -d '{"message":"disk"}'
```

## Project structure

| File               | Purpose                                                        |
|--------------------|----------------------------------------------------------------|
| `server.js`        | Express app: `/upload`, `/filters`, and the search page        |
| `index.html`       | Search form                                                    |
| `schema.sql`       | Creates the staging and target tables plus indexes             |
| `sample_logs.json` | Sample data for trying the app                                 |
| `.env.example`     | Template for database configuration                            |

## Design notes

- **Parameterised queries throughout.** Filter values and uploaded JSON are passed to `pg` as `$n` parameters, never concatenated into SQL, so quotes or SQL fragments in log messages can't break or hijack a query.
- **Filters are optional and composable.** The `WHERE` clause is built incrementally — each filter that's present appends an `AND` condition and a parameter, so any subset of the 11 filters works.
- **Stage-then-unpack ingestion.** Storing the raw JSON first and flattening it in SQL keeps the Node code simple and lets PostgreSQL do the type conversion (e.g. `::timestamp`).
- **Message search** uses `ILIKE '%term%'` — a case-insensitive substring match. For large volumes this would be replaced with a `tsvector`/GIN full-text index.

## Limitations / what I'd do next

- Results are rendered server-side as an HTML table; a JSON API + pagination would scale better than returning every matching row.
- Ingestion inserts rows one at a time; a bulk `COPY` or multi-row `INSERT` would be much faster for large batches.
- No authentication — the service is intended to be run locally.
- Adding a proper full-text search index on `message`.
