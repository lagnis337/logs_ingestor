//Importing relevant modules
const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const cors = require("cors");

//Creating pool object to connect with Postgresql server
const pool = new Pool({
  user: "chiragsingal",
  host: "localhost",
  database: "chiragsingal",
  password: "REDACTED",
  port: 5432,
});

//Creating my server
const app = express();
const port = 3000;

app.use(cors());

//Using parser to read json data.
//This middleware is applied after the limit to prevent reading of json before limits are set
app.use(bodyParser.json());

// Endpoint to handle the data upload
app.post("/upload", async (req, res) => {
    try {
    const data = req.body;
    // Insert each JSON object into the target table
    const insertQuery = `INSERT INTO temp_json(json_array) VALUES ('${JSON.stringify(data)}')`;   
    console.log("will run insert query next");
    console.log(data);
    await pool.query(insertQuery);

    //Query to open json objects in another table
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

    console.log("will run open query next");
    await pool.query(openQuery);
    console.log("will run delete query next");
    deleteQuery = `DELETE FROM temp_json`
    await pool.query(deleteQuery);
    // Send a response 
    res
      .status(200)
      .send(`Successfully loaded rows into the table.`);
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

    // Construct the base SQL query
    let sqlQuery = "SELECT * FROM logs_json_opened WHERE 1=1";
    const total_result = await pool.query(sqlQuery);

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

    // Execute the query using database connection pool
    const filter_result = await pool.query(sqlQuery, queryParams);

    const filteredRows = filter_result.rowCount;
    const totalRows = total_result.rowCount;

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

// Function to generate an HTML table from rows
function generateHtmlTable(rows, fRows, tRows) {
  const tableRows = rows.map((row) => {
    return `<tr>
                    <td style="border: 1px solid #dddddd; text-align: center; padding: 8px;">${row.id}</td>
                    <td style="border: 1px solid #dddddd; text-align: center; padding: 8px;">${row.level}</td>
                    <td style="border: 1px solid #dddddd; text-align: center; padding: 8px;">${row.message}</td>
                    <td style="border: 1px solid #dddddd; text-align: center; padding: 8px;">${row.resourceid}</td>
                    <td style="border: 1px solid #dddddd; text-align: center; padding: 8px;">${row.timestamp}</td>
                    <td style="border: 1px solid #dddddd; text-align: center; padding: 8px;">${row.traceid}</td>
                    <td style="border: 1px solid #dddddd; text-align: center; padding: 8px;">${row.spanid}</td>
                    <td style="border: 1px solid #dddddd; text-align: center; padding: 8px;">${row.commit}</td>
                    <td style="border: 1px solid #dddddd; text-align: center; padding: 8px;">${row.parentresourceid}</td>
                </tr>`;
  });

  const htmlTable = `
        <div>
            <p>${fRows} rows loaded out of ${tRows}</p>
        </div>
        <div style="overflow-x: auto;">
            <table style="border-collapse: collapse; width: 100%;">
                <thead>
                    <tr>
                        <th style="border: 1px solid #dddddd; text-align: center; padding: 8px; background-color: #f2f2f2;">ID</th>
                        <th style="border: 1px solid #dddddd; text-align: center; padding: 8px; background-color: #f2f2f2;">Level</th>
                        <th style="border: 1px solid #dddddd; text-align: center; padding: 8px; background-color: #f2f2f2;">Message</th>
                        <th style="border: 1px solid #dddddd; text-align: center; padding: 8px; background-color: #f2f2f2;">ResourceID</th>
                        <th style="border: 1px solid #dddddd; text-align: center; padding: 8px; background-color: #f2f2f2;">Timestamp</th>
                        <th style="border: 1px solid #dddddd; text-align: center; padding: 8px; background-color: #f2f2f2;">TraceID</th>
                        <th style="border: 1px solid #dddddd; text-align: center; padding: 8px; background-color: #f2f2f2;">SpanID</th>
                        <th style="border: 1px solid #dddddd; text-align: center; padding: 8px; background-color: #f2f2f2;">Commit</th>
                        <th style="border: 1px solid #dddddd; text-align: center; padding: 8px; background-color: #f2f2f2;">ParentResourceID</th>
                    </tr>
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

//Endpoint to listen to requests on port 3000
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
