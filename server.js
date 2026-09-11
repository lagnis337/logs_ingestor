// Importing relevant modules
require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");

// Creating pool object to connect with PostgreSQL server.
// Connection details come from environment variables (see .env.example)
// so no credentials are stored in the code.
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: Number(process.env.PGPORT) || 5432,
});

// Creating my server
const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors());

// Parse JSON bodies (used by /upload) and HTML form bodies (used by the
// search form on index.html, which posts as application/x-www-form-urlencoded).
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Endpoint to handle the data upload.
// Accepts either a single log object or an array of log objects.
app.post("/upload", async (req, res) => {
  try {
    const data = Array.isArray(req.body) ? req.body : [req.body];

    // Insert each JSON object into the staging table.
    // The JSON is passed as a query parameter ($1) rather than interpolated
    // into the SQL string, so quotes in log messages are handled safely.
    const insertQuery = "INSERT INTO temp_json (json_array) VALUES ($1)";
    for (const entry of data) {
      await pool.query(insertQuery, [JSON.stringify(entry)]);
    }

    // Query to open json objects in another table
    const openQuery = `INSERT INTO logs_json_opened (
    level,
    message,
    resourceId,
    timestamp,
    traceId,
    spanId,
    commit,
    parentResourceId)

    SELECT
    json_array->>'level' AS level,
    json_array->>'message' AS message,
    json_array->>'resourceId' AS resourceId,
    (json_array->>'timestamp')::timestamp AS timestamp,
    json_array->>'traceId' AS traceId,
    json_array->>'spanId' AS spanId,
    json_array->>'commit' AS commit,
    json_array->'metadata'->>'parentResourceId' AS parentResourceId
    FROM
    temp_json`;

    await pool.query(openQuery);

    // Clear the staging table now that the rows have been unpacked
    await pool.query("DELETE FROM temp_json");

    // Send a response
    res
      .status(200)
      .send(`Successfully loaded ${data.length} row(s) into the table.`);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Endpoint to handle filters
app.post("/filters", async (req, res) => {
  try {
    // Retrieve filters from the request body
    const filters = req.body;

    // Total number of rows, shown alongside the filtered count
    const total_result = await pool.query("SELECT COUNT(*) FROM logs_json_opened");

    // Construct the base SQL query
    let sqlQuery = "SELECT * FROM logs_json_opened WHERE 1=1";

    // Create an array to store the parameters (filters)
    const queryParams = [];

    // Check if each filter is provided and add it to the query
    if (filters.level) {
      sqlQuery += " AND level = $" + (queryParams.length + 1);
      queryParams.push(filters.level);
    }

    if (filters.message) {
      sqlQuery += " AND message ILIKE $" + (queryParams.length + 1);
      queryParams.push(`%${filters.message}%`);
    }

    if (filters.resourceId) {
      sqlQuery += " AND resourceId = $" + (queryParams.length + 1);
      queryParams.push(filters.resourceId);
    }

    if (filters.timestamp_start) {
      sqlQuery += " AND timestamp >= $" + (queryParams.length + 1);
      queryParams.push(filters.timestamp_start);
    }

    if (filters.timestamp_end) {
      sqlQuery += " AND timestamp <= $" + (queryParams.length + 1);
      queryParams.push(filters.timestamp_end);
    }

    if (filters.traceId) {
      sqlQuery += " AND traceId = $" + (queryParams.length + 1);
      queryParams.push(filters.traceId);
    }

    if (filters.spanId) {
      sqlQuery += " AND spanId = $" + (queryParams.length + 1);
      queryParams.push(filters.spanId);
    }

    if (filters.commit) {
      sqlQuery += " AND commit = $" + (queryParams.length + 1);
      queryParams.push(filters.commit);
    }

    if (filters.parentResourceId) {
      sqlQuery += " AND parentResourceId = $" + (queryParams.length + 1);
      queryParams.push(filters.parentResourceId);
    }

    if (filters.StartDate) {
      sqlQuery += " AND timestamp::DATE >= $" + (queryParams.length + 1);
      queryParams.push(filters.StartDate);
    }

    if (filters.EndDate) {
      sqlQuery += " AND timestamp::DATE <= $" + (queryParams.length + 1);
      queryParams.push(filters.EndDate);
    }

    sqlQuery += " ORDER BY timestamp";

    // Execute the query using database connection pool
    const filter_result = await pool.query(sqlQuery, queryParams);

    const filteredRows = filter_result.rowCount;
    const totalRows = Number(total_result.rows[0].count);

    // Generate HTML table
    const htmlTable = generateHtmlTable(
      filter_result.rows,
      filteredRows,
      totalRows
    );

    // Send the filtered data as an HTML response
    res.status(200).send(htmlTable);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Escape user-supplied values before putting them into HTML
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Function to generate an HTML table from rows
function generateHtmlTable(rows, fRows, tRows) {
  const cellStyle = "border: 1px solid #dddddd; text-align: center; padding: 8px;";
  const headStyle = cellStyle + " background-color: #f2f2f2;";
  const columns = [
    ["id", "ID"],
    ["level", "Level"],
    ["message", "Message"],
    ["resourceid", "ResourceID"],
    ["timestamp", "Timestamp"],
    ["traceid", "TraceID"],
    ["spanid", "SpanID"],
    ["commit", "Commit"],
    ["parentresourceid", "ParentResourceID"],
  ];

  const tableRows = rows.map((row) => {
    const cells = columns
      .map(([key]) => `<td style="${cellStyle}">${escapeHtml(row[key])}</td>`)
      .join("");
    return `<tr>${cells}</tr>`;
  });

  const headCells = columns
    .map(([, label]) => `<th style="${headStyle}">${label}</th>`)
    .join("");

  const htmlTable = `
        <div>
            <p>${fRows} rows loaded out of ${tRows}</p>
            <p><a href="/">&larr; Back to search</a></p>
        </div>
        <div style="overflow-x: auto;">
            <table style="border-collapse: collapse; width: 100%;">
                <thead>
                    <tr>${headCells}</tr>
                </thead>
                <tbody>
                    ${tableRows.join("")}
                </tbody>
            </table>
        </div>`;

  return htmlTable;
}

// Serve HTML file with the form
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// Endpoint to listen to requests on port 3000
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
