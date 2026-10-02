import express from "express";
import path from "path";
import fs from "fs";
import initSqlJs from "sql.js";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

const app = express();

// Support CLI --port and process.env.PORT
let cliPort: number | null = null;
const portArgIndex = process.argv.indexOf("--port");
if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
  const parsed = parseInt(process.argv[portArgIndex + 1], 10);
  if (!isNaN(parsed) && parsed > 0) {
    cliPort = parsed;
  }
}
const PORT = cliPort || (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);

app.use(express.json());

// Google Sheet Constants
const SHEET_ID = "1MDPNMswRlmoEh5z4sJdS_8hQZQeFbTwxxQH6cMicqw0";
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

// Initialize Google GenAI client safely
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Database & Cache State
let dbInstance: any = null;
let cachedRows: any[] = [];
let lastFetchedTime: string | null = null;
let isFetching = false;
let fetchError: string | null = null;

// CSV Parser Helper
function parseCSV(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;
  
  for (let i = 0; i < csvText.length; i++) {
    const c = csvText[i];
    if (inQuotes) {
      if (c === '"' && csvText[i + 1] === '"') {
        currentCell += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        currentCell += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        currentRow.push(currentCell.trim());
        currentCell = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && csvText[i + 1] === "\n") i++;
        currentRow.push(currentCell.trim());
        if (currentRow.some((x) => x.length > 0)) rows.push(currentRow);
        currentRow = [];
        currentCell = "";
      } else {
        currentCell += c;
      }
    }
  }
  if (currentCell || currentRow.length) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((x) => x.length > 0)) rows.push(currentRow);
  }
  return rows;
}

// Function to fetch and reload data into in-memory SQL database
async function reloadDatabase(): Promise<{ success: boolean; count: number; error?: string }> {
  if (isFetching) {
    return { success: true, count: cachedRows.length };
  }
  isFetching = true;
  try {
    const res = await fetch(SHEET_CSV_URL);
    if (!res.ok) {
      throw new Error(`Failed to fetch Google Sheet: HTTP ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    const parsedRows = parseCSV(text);
    if (parsedRows.length < 2) {
      throw new Error("Google Sheet returned empty or invalid data");
    }

    const dataRows = parsedRows.slice(1);
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    db.run(`
      CREATE TABLE expense_actuals (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "Date" TEXT,
        "Year - Puja" TEXT,
        "Year_Puja" TEXT,
        "Category" TEXT,
        "Sub-Category" TEXT,
        "Sub_Category" TEXT,
        "Amount" REAL,
        "Description" TEXT
      );
    `);

    const stmt = db.prepare(`
      INSERT INTO expense_actuals ("Date", "Year - Puja", "Year_Puja", "Category", "Sub-Category", "Sub_Category", "Amount", "Description")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const cleanedData: any[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i];
      const date = r[0] || "";
      const puja = (r[1] || "").trim();
      const cat = (r[2] || "").trim();
      const subCat = (r[3] || "").trim();
      const amtStr = (r[4] || "").replace(/[$,]/g, "").trim();
      const amt = parseFloat(amtStr) || 0.0;
      const desc = (r[5] || "").trim();

      stmt.run([date, puja, puja, cat, subCat, subCat, amt, desc]);

      cleanedData.push({
        id: i + 1,
        Date: date,
        "Year - Puja": puja,
        Year_Puja: puja,
        Category: cat,
        "Sub-Category": subCat,
        Sub_Category: subCat,
        Amount: amt,
        Description: desc,
      });
    }

    stmt.free();

    dbInstance = db;
    cachedRows = cleanedData;
    lastFetchedTime = new Date().toISOString();
    fetchError = null;
    isFetching = false;

    console.log(`[Database] Loaded ${cleanedData.length} records into in-memory SQLite.`);
    return { success: true, count: cleanedData.length };
  } catch (err: any) {
    isFetching = false;
    fetchError = err.message || String(err);
    console.error("[Database] Error loading Google Sheet:", err);
    return { success: false, count: cachedRows.length, error: fetchError };
  }
}

// Initial load
reloadDatabase();

// Guardrail check for SQL queries
function isSafeSQL(sql: string): { safe: boolean; reason?: string } {
  if (!sql || typeof sql !== "string") {
    return { safe: false, reason: "Empty query provided." };
  }
  const clean = sql.trim().toUpperCase();
  if (!clean.startsWith("SELECT") && !clean.startsWith("WITH")) {
    return { safe: false, reason: "Guardrail Alert: Only SELECT queries are permitted on this dataset." };
  }
  const forbidden = [
    "DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE",
    "CREATE", "REPLACE", "GRANT", "REVOKE", "ATTACH", "DETACH"
  ];
  for (const kw of forbidden) {
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    if (regex.test(sql)) {
      return { safe: false, reason: `Guardrail Alert: Forbidden operation '${kw}' detected. Only read queries are allowed.` };
    }
  }
  return { safe: true };
}

// Helper for robust Gemini API generation with multi-model fallback & backoff
const CANDIDATE_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest"
];

async function generateWithModelFallback(makeParams: (model: string) => any): Promise<any> {
  if (!ai) {
    throw new Error("GEMINI_API_KEY is not configured. Falling back to local analytical engine.");
  }

  let lastError: any = null;

  for (const model of CANDIDATE_MODELS) {
    try {
      const params = makeParams(model);
      params.model = model;
      // 5-second timeout per candidate model to ensure fast response without hanging
      const generatePromise = ai.models.generateContent(params);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after 5s for model ${model}`)), 5000)
      );
      return await Promise.race([generatePromise, timeoutPromise]);
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || "");
      // Immediately fallback to next model on quota, transient overload or rate limits
      console.warn(`[Gemini API] Note on model ${model}: ${msg.slice(0, 120)}... trying fallback candidate...`);
    }
  }

  throw lastError || new Error("All Gemini models exhausted.");
}

// Local Natural Language to SQL fallback engine
function localNLtoSQL(message: string): {
  reasoning: string;
  sql: string;
  is_single_metric: boolean;
  metric_label: string;
} {
  const q = message.toLowerCase();

  // 1. Identify Target Puja
  let pujaFilter: string | null = null;
  let pujaName = "";
  if (q.includes("durga")) {
    pujaFilter = `Year_Puja = 'Durga Puja'`;
    pujaName = "Durga Puja";
  } else if (q.includes("kali")) {
    pujaFilter = `Year_Puja = 'Kali Puja'`;
    pujaName = "Kali Puja";
  } else if (q.includes("saraswati")) {
    pujaFilter = `Year_Puja = 'Saraswati Puja'`;
    pujaName = "Saraswati Puja";
  } else if (q.includes("all-3") || q.includes("all 3") || q.includes("all three")) {
    pujaFilter = `Year_Puja = 'All-3 Puja'`;
    pujaName = "All-3 Puja";
  }

  // 1.5. Special Intent: Paid Labor / Labor Charges breakdown or total
  if (q.includes("labor") || q.includes("labour") || q.includes("worker") || q.includes("workers") || q.includes("manpower")) {
    if (q.includes("breakdown") || q.includes("break down") || q.includes("temple") || q.includes("facility") || q.includes("kitchen") || q.includes("by")) {
      return {
        reasoning: "Calculating total spend on paid labor categorized into Temple, Facilities, and Kitchen labor charges.",
        sql: `SELECT Sub_Category AS "Labor Type", ROUND(SUM(Amount), 2) AS "Total Amount ($)", COUNT(*) AS "Transactions" FROM expense_actuals WHERE Sub_Category LIKE '%Labor%' GROUP BY Sub_Category ORDER BY "Total Amount ($)" DESC`,
        is_single_metric: false,
        metric_label: "Paid Labor Breakdown",
      };
    }
    return {
      reasoning: "Calculating total expenditure across all paid labor charges in the 2025 Puja dataset.",
      sql: `SELECT ROUND(SUM(Amount), 2) AS "Total Paid Labor ($)" FROM expense_actuals WHERE Sub_Category LIKE '%Labor%'`,
      is_single_metric: true,
      metric_label: "Total Paid Labor",
    };
  }

  // 2. Identify Category
  const categoryMap: Record<string, string> = {
    cultural: "Cultural",
    temple: "Temple",
    pujamerchandise: "PujaMerchandise",
    merchandise: "PujaMerchandise",
    facilities: "Facilities",
    facility: "Facilities",
    decoration: "Decoration",
    decor: "Decoration",
    treasury: "Treasury",
    misc: "Misc",
    miscellaneous: "Misc",
    registration: "Registration",
    resources: "Resources",
    parking: "ParkingTransportation",
    transportation: "ParkingTransportation",
    volunteer: "VolunteerAppreciation",
    anandamela: "Anandamela",
    child: "ChildandYouth",
    youth: "ChildandYouth",
    food: "Food",
    magazine: "Magazine",
    security: "Security",
  };

  let matchedCategory: string | null = null;
  for (const [kw, catName] of Object.entries(categoryMap)) {
    if (q.includes(kw)) {
      matchedCategory = catName;
      break;
    }
  }

  // 3. Identify Specific Sub-Category / Vendor keywords
  let subCatKeyword: string | null = null;
  if (q.includes("priest") || q.includes("pranami") || q.includes("purohit") || q.includes("dakshina")) {
    subCatKeyword = "Priest Pranami";
  } else if (q.includes("tent")) {
    subCatKeyword = "Tent";
  } else if (q.includes("lighting") || q.includes("light")) {
    subCatKeyword = "Lighting";
  } else if (q.includes("sound") || q.includes("audio")) {
    subCatKeyword = "Sound";
  } else if (q.includes("snack") || q.includes("sweets") || q.includes("sweet") || q.includes("food stall")) {
    subCatKeyword = "Snack";
  } else if (q.includes("flower") || q.includes("flowers")) {
    subCatKeyword = "Flower";
  } else if (q.includes("entertainment") || q.includes("program")) {
    subCatKeyword = "Program";
  } else if (q.includes("bank charge") || q.includes("bank fee") || q.includes("zelle fee")) {
    subCatKeyword = "Bank";
  } else if (q.includes("funndu")) {
    subCatKeyword = "Funndu";
  } else if (q.includes("js event")) {
    subCatKeyword = "JS Events";
  } else if (q.includes("zelle")) {
    subCatKeyword = "Zelle";
  }

  // 4. Intent Detection: Comparison across all Pujas
  if (q.includes("compare") || (q.includes("breakdown") && q.includes("puja")) || q.includes("all puja") || q.includes("between puja") || q.includes("each puja")) {
    return {
      reasoning: "Aggregating total expenses, transaction counts, and average spend grouped by each Puja event.",
      sql: `SELECT Year_Puja AS "Puja Event", ROUND(SUM(Amount), 2) AS "Total Spent ($)", COUNT(*) AS "Transactions", ROUND(AVG(Amount), 2) AS "Avg Spend ($)" FROM expense_actuals GROUP BY Year_Puja ORDER BY "Total Spent ($)" DESC`,
      is_single_metric: false,
      metric_label: "Puja Event Comparison",
    };
  }

  // 5. Intent Detection: Category Ranked Breakdown
  if (
    q.includes("by category") ||
    q.includes("all categories") ||
    q.includes("category breakdown") ||
    q.includes("ranked") ||
    (q.includes("categories") && !matchedCategory)
  ) {
    let whereClause = "";
    if (pujaFilter) whereClause = `WHERE ${pujaFilter} `;
    return {
      reasoning: `Calculating total spending for each high-level category${pujaName ? ` for ${pujaName}` : ""}, ranked from highest to lowest.`,
      sql: `SELECT Category, ROUND(SUM(Amount), 2) AS "Total Amount ($)", COUNT(*) AS "Transactions" FROM expense_actuals ${whereClause}GROUP BY Category ORDER BY "Total Amount ($)" DESC`,
      is_single_metric: false,
      metric_label: "Category Breakdown",
    };
  }

  // 6. Intent Detection: Sub-category breakdown within a Category
  if (matchedCategory && (q.includes("sub") || q.includes("breakdown") || q.includes("detail") || q.includes("items") || q.includes("types"))) {
    let whereParts = [`Category = '${matchedCategory}'`];
    if (pujaFilter) whereParts.push(pujaFilter);
    return {
      reasoning: `Breaking down all sub-categories and spending items under the '${matchedCategory}' category${pujaName ? ` for ${pujaName}` : ""}.`,
      sql: `SELECT Sub_Category AS "Sub-Category", ROUND(SUM(Amount), 2) AS "Total ($)", COUNT(*) AS "Transactions" FROM expense_actuals WHERE ${whereParts.join(" AND ")} GROUP BY Sub_Category ORDER BY "Total ($)" DESC`,
      is_single_metric: false,
      metric_label: `${matchedCategory} Sub-Categories`,
    };
  }

  // 7. Intent Detection: Highest / Top Expense Transactions
  if (q.includes("highest") || q.includes("top") || q.includes("largest") || q.includes("most expensive") || q.includes("maximum") || q.includes("max")) {
    let limit = 5;
    const matchLimit = q.match(/top\s*(\d+)/);
    if (matchLimit && matchLimit[1]) {
      limit = parseInt(matchLimit[1], 10);
    }
    const whereParts: string[] = [];
    if (pujaFilter) whereParts.push(pujaFilter);
    if (matchedCategory) whereParts.push(`Category = '${matchedCategory}'`);
    if (subCatKeyword) whereParts.push(`(Sub_Category LIKE '%${subCatKeyword}%' OR Description LIKE '%${subCatKeyword}%')`);
    const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")} ` : "";

    return {
      reasoning: `Retrieving top ${limit} highest-value transactions${pujaName ? ` for ${pujaName}` : ""}${matchedCategory ? ` in ${matchedCategory}` : ""}.`,
      sql: `SELECT Date, Year_Puja AS "Puja Event", Category, Sub_Category AS "Sub-Category", Amount, Description FROM expense_actuals ${whereSql}ORDER BY Amount DESC LIMIT ${limit}`,
      is_single_metric: false,
      metric_label: `Top ${limit} Highest Expenses`,
    };
  }

  // 8. Intent Detection: Specific Sub-category keyword total / list (e.g. Priest Pranami, Tent, Lighting)
  if (subCatKeyword) {
    const whereParts = [`(Sub_Category LIKE '%${subCatKeyword}%' OR Description LIKE '%${subCatKeyword}%')`];
    if (pujaFilter) whereParts.push(pujaFilter);
    if (matchedCategory) whereParts.push(`Category = '${matchedCategory}'`);
    const whereSql = `WHERE ${whereParts.join(" AND ")}`;

    if (q.includes("how much") || q.includes("total") || q.includes("sum") || q.includes("overall")) {
      return {
        reasoning: `Calculating total expenditure for '${subCatKeyword}'${pujaName ? ` during ${pujaName}` : ""}.`,
        sql: `SELECT ROUND(SUM(Amount), 2) AS "Total Amount ($)" FROM expense_actuals ${whereSql}`,
        is_single_metric: true,
        metric_label: `Total for ${subCatKeyword}`,
      };
    }

    return {
      reasoning: `Listing all transactions related to '${subCatKeyword}'${pujaName ? ` for ${pujaName}` : ""}.`,
      sql: `SELECT Date, Year_Puja AS "Puja Event", Category, Sub_Category AS "Sub-Category", Amount, Description FROM expense_actuals ${whereSql} ORDER BY Amount DESC LIMIT 25`,
      is_single_metric: false,
      metric_label: `${subCatKeyword} Transactions`,
    };
  }

  // 9. Intent Detection: Single Category Total
  if (matchedCategory) {
    const whereParts = [`Category = '${matchedCategory}'`];
    if (pujaFilter) whereParts.push(pujaFilter);
    const whereSql = `WHERE ${whereParts.join(" AND ")}`;

    if (q.includes("how much") || q.includes("total") || q.includes("sum") || !q.includes("list")) {
      return {
        reasoning: `Calculating total spending under '${matchedCategory}' category${pujaName ? ` for ${pujaName}` : ""}.`,
        sql: `SELECT ROUND(SUM(Amount), 2) AS "Total Amount ($)" FROM expense_actuals ${whereSql}`,
        is_single_metric: true,
        metric_label: `Total ${matchedCategory} Spend`,
      };
    }

    return {
      reasoning: `Listing transactions for '${matchedCategory}' category${pujaName ? ` in ${pujaName}` : ""}.`,
      sql: `SELECT Date, Year_Puja AS "Puja Event", Category, Sub_Category AS "Sub-Category", Amount, Description FROM expense_actuals ${whereSql} ORDER BY Amount DESC LIMIT 25`,
      is_single_metric: false,
      metric_label: `${matchedCategory} Transactions`,
    };
  }

  // 10. Intent Detection: Single Puja Total
  if (pujaFilter) {
    if (q.includes("list") || q.includes("show transactions") || q.includes("all transactions")) {
      return {
        reasoning: `Listing major transactions for ${pujaName}.`,
        sql: `SELECT Date, Year_Puja AS "Puja Event", Category, Sub_Category AS "Sub-Category", Amount, Description FROM expense_actuals WHERE ${pujaFilter} ORDER BY Amount DESC LIMIT 25`,
        is_single_metric: false,
        metric_label: `${pujaName} Transactions`,
      };
    }
    return {
      reasoning: `Calculating total expenses incurred for ${pujaName}.`,
      sql: `SELECT ROUND(SUM(Amount), 2) AS "Total Amount ($)" FROM expense_actuals WHERE ${pujaFilter}`,
      is_single_metric: true,
      metric_label: `Total ${pujaName} Spend`,
    };
  }

  // 11. Intent Detection: Overall Dataset Total
  if (q.includes("total") || q.includes("overall") || q.includes("how much was spent") || q.includes("entire") || q.includes("all spent")) {
    return {
      reasoning: "Calculating total aggregate expenses across all 2025 Puja events and categories.",
      sql: `SELECT ROUND(SUM(Amount), 2) AS "Total Amount ($)" FROM expense_actuals`,
      is_single_metric: true,
      metric_label: "Total 2025 Puja Spend",
    };
  }

  // 12. Generic fallback search across Description, Category, Sub_Category
  const words = q.replace(/[^a-zA-Z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 2);
  if (words.length > 0) {
    const searchToken = words[0];
    return {
      reasoning: `Searching transactions containing term '${searchToken}'.`,
      sql: `SELECT Date, Year_Puja AS "Puja Event", Category, Sub_Category AS "Sub-Category", Amount, Description FROM expense_actuals WHERE LOWER(Description) LIKE '%${searchToken}%' OR LOWER(Category) LIKE '%${searchToken}%' OR LOWER(Sub_Category) LIKE '%${searchToken}%' ORDER BY Amount DESC LIMIT 20`,
      is_single_metric: false,
      metric_label: `Matches for '${searchToken}'`,
    };
  }

  return {
    reasoning: "Retrieving overview of highest transactions in the 2025 Puja dataset.",
    sql: `SELECT Date, Year_Puja AS "Puja Event", Category, Sub_Category AS "Sub-Category", Amount, Description FROM expense_actuals ORDER BY Amount DESC LIMIT 10`,
    is_single_metric: false,
    metric_label: "Expense Overview",
  };
}

// Deterministic summary generator for instant fallback
function generateDeterministicSummary(
  userQuery: string,
  metricLabel: string,
  isSingleMetric: boolean,
  columns: string[],
  values: any[][]
): string {
  if (!values || values.length === 0) {
    return `No transaction records matching "${userQuery}" were found in the 2025 Puja expense spreadsheet.`;
  }

  if (isSingleMetric && values.length === 1 && values[0].length === 1) {
    const val = values[0][0];
    const formatted = typeof val === "number" ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val) : String(val);
    return `The calculated ${metricLabel || "total"} is ${formatted} based on the recorded 2025 Puja transactions.`;
  }

  if (values.length === 1) {
    return `Found 1 matching transaction record in the 2025 Puja spreadsheet.`;
  }

  // Multiple rows - calculate total if there's a numeric column
  const rowCount = values.length;
  let totalSum = 0;
  let hasAmounts = false;
  values.forEach(row => {
    if (typeof row[1] === "number") {
      totalSum += row[1];
      hasAmounts = true;
    }
  });

  const firstCol = columns[0] || "Item";
  const topItem = String(values[0][0] ?? "");
  const topVal = values[0][1];
  const topValStr = typeof topVal === "number" ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(topVal) : String(topVal ?? "");

  if (hasAmounts && totalSum > 0) {
    const formattedSum = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalSum);
    return `Total spend across all ${rowCount} items is ${formattedSum}. The highest expense item is "${topItem}" with ${topValStr}.`;
  }

  if (topItem && topVal !== undefined) {
    return `Found ${rowCount} records in the dataset. The leading ${firstCol} is "${topItem}" with ${topValStr}.`;
  }

  return `Retrieved ${rowCount} records from the 2025 Puja expense transactions table matching your query.`;
}

// System Instruction for Gemini Text-to-SQL
const SQL_SYSTEM_INSTRUCTION = `
You are an expert Data Analyst and SQL generator for the 2025 Puja Expense Transactions dataset.
You translate natural language questions into valid, optimized SQLite / DuckDB SQL queries against the \`expense_actuals\` table.

### Table Schema:
Table Name: \`expense_actuals\`
Columns:
- "Date" (TEXT): Transaction date (e.g., '1/22/2025', '3/27/2025', '10/02/2025').
- "Year_Puja" or "Year - Puja" (TEXT): Puja event name. Values: 'Durga Puja', 'Kali Puja', 'Saraswati Puja', 'All-3 Puja'.
- "Category" (TEXT): High-level category. Values: 'Cultural', 'PujaMerchandise', 'Temple', 'Misc', 'Treasury', 'Decoration', 'Facilities', 'Registration', 'Resources', 'ParkingTransportation', 'VolunteerAppreciation', 'Anandamela', 'ChildandYouth', 'Food', 'Magazine', 'Security'.
- "Sub_Category" or "Sub-Category" (TEXT): Sub categories. Key real-world values in this dataset:
  * Paid Labor / Labor Charges: 'Labor Charges - Facilities', 'Labor Charges - Kitchen', 'Labor Charges - Temple'.
  * Facilities: 'Facility maintenance', 'Utilities', 'Tent', 'HPD', 'Labor Charges - Facilities'.
  * Temple: 'Priest Pranami', 'Puja Flowers', 'Puja Samagree', 'Temple items', 'Labor Charges - Temple'.
  * Food: 'Groceries+ Plates & Others', 'Snacks', 'Sweets', 'Food distribution', 'Labor Charges - Kitchen'.
  * Cultural: 'Program & Entertainment', 'External Artist Care (food & snacks)', 'Alpona Materials'.
  * Treasury / Registration: 'Bank Charges', 'Square Fees', 'Registration supplies'.
- "Amount" (REAL): Expense amount in numeric USD.
- "Description" (TEXT): Transaction notes, vendor names, Zelle reference numbers, descriptions.

### DOMAIN KNOWLEDGE & SPECIALIZED QUERY MAPPINGS:
1. Paid Labor / Workers / Labour:
   - Labor expenses in this dataset are recorded in \`Sub_Category\` as:
     * 'Labor Charges - Facilities' (under Resources/Facilities)
     * 'Labor Charges - Kitchen' (under Food/Resources)
     * 'Labor Charges - Temple' (under Temple/Resources)
   - When asked "How much was spent on paid labor? Give a breakdown by Temple, Facility and Kitchen" (or any variation of labor breakdown):
     SELECT Sub_Category, ROUND(SUM(Amount), 2) AS "Total Amount ($)", COUNT(*) AS "Transactions" FROM expense_actuals WHERE Sub_Category LIKE '%Labor%' GROUP BY Sub_Category ORDER BY "Total Amount ($)" DESC;
   - When asked for total paid labor overall:
     SELECT ROUND(SUM(Amount), 2) AS "Total Paid Labor ($)" FROM expense_actuals WHERE Sub_Category LIKE '%Labor%';

2. Priest Pranami & Dakshina:
   - Use: WHERE Sub_Category LIKE '%Priest%' OR Description LIKE '%Pranami%'

3. Tents & Staging:
   - Use: WHERE Sub_Category LIKE '%Tent%' OR Description LIKE '%Tent%'

### STRICT RULES:
1. ONLY return the structured JSON object with properties:
   - "reasoning": A 1-2 sentence logical plan for what data to retrieve.
   - "sql": A single valid executable SQLite SELECT query.
   - "is_single_metric": Boolean, true if the query returns a single aggregate number (e.g. total sum or count).
   - "metric_label": Name for the metric (e.g., "Paid Labor Breakdown", "Total Durga Puja Spent", "Priest Pranami Total").
2. ALWAYS use "SELECT" queries. NEVER generate INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, or CREATE.
3. For case-insensitive filtering on strings, use "LIKE" (e.g. \`Category LIKE '%Cultural%'\` or \`LOWER(Description) LIKE '%zelle%'\`).
4. Always wrap aggregate amounts with ROUND, e.g. \`ROUND(SUM(Amount), 2) AS "Total Amount ($)"\`.
5. When sorting breakdowns, use \`ORDER BY "Total Amount ($)" DESC\` or \`ORDER BY Amount DESC\`.
6. For specific puja comparisons, group by "Year_Puja".
7. Never invent or hallucinate column names.
8. If the user asks something completely outside the 2025 Puja expense dataset, explain in reasoning and return a query like \`SELECT 'Information not found in spreadsheet' AS message\`.
`;

// API Routes
app.get("/api/status", (req, res) => {
  if (!dbInstance) {
    return res.json({
      status: "initializing",
      sheetId: SHEET_ID,
      rowCount: 0,
      totalSpent: 0,
      lastFetchedTime: null,
      error: fetchError,
    });
  }

  try {
    const sumRes = dbInstance.exec("SELECT ROUND(SUM(Amount), 2) as total FROM expense_actuals");
    const totalSpent = sumRes[0]?.values[0]?.[0] || 0;

    const pujaRes = dbInstance.exec("SELECT Year_Puja, ROUND(SUM(Amount), 2) as total, COUNT(*) as count FROM expense_actuals GROUP BY Year_Puja ORDER BY total DESC");
    const pujas = (pujaRes[0]?.values || []).map((v: any[]) => ({
      name: v[0],
      total: v[1],
      count: v[2],
    }));

    const catRes = dbInstance.exec("SELECT Category, ROUND(SUM(Amount), 2) as total, COUNT(*) as count FROM expense_actuals GROUP BY Category ORDER BY total DESC");
    const categories = (catRes[0]?.values || []).map((v: any[]) => ({
      name: v[0],
      total: v[1],
      count: v[2],
    }));

    res.json({
      status: "ready",
      sheetId: SHEET_ID,
      rowCount: cachedRows.length,
      totalSpent,
      pujas,
      categories,
      lastFetchedTime,
      error: fetchError,
    });
  } catch (e: any) {
    res.status(500).json({ status: "error", error: e.message });
  }
});

// Refresh Cache endpoint
app.post("/api/refresh", async (req, res) => {
  const result = await reloadDatabase();
  res.json({
    success: result.success,
    rowCount: result.count,
    lastFetchedTime,
    error: result.error,
  });
});

// Webhook endpoint (compatible with Google Apps Script onEdit)
app.post("/api/webhook/refresh", async (req, res) => {
  console.log("[Webhook] Received Google Sheet sync trigger from Apps Script:", req.body);
  const result = await reloadDatabase();
  res.json({
    received: true,
    success: result.success,
    rowCount: result.count,
    timestamp: new Date().toISOString(),
  });
});

// Full Data endpoint with filtering and pagination
app.get("/api/data", (req, res) => {
  const { puja, category, search, page = "1", limit = "50" } = req.query;
  let filtered = [...cachedRows];

  if (puja && puja !== "all") {
    filtered = filtered.filter((r) => r.Year_Puja.toLowerCase() === String(puja).toLowerCase());
  }
  if (category && category !== "all") {
    filtered = filtered.filter((r) => r.Category.toLowerCase() === String(category).toLowerCase());
  }
  if (search) {
    const q = String(search).toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.Description.toLowerCase().includes(q) ||
        r.Sub_Category.toLowerCase().includes(q) ||
        r.Category.toLowerCase().includes(q) ||
        r.Date.toLowerCase().includes(q)
    );
  }

  const p = parseInt(String(page), 10) || 1;
  const l = parseInt(String(limit), 10) || 50;
  const total = filtered.length;
  const paginated = filtered.slice((p - 1) * l, p * l);

  res.json({
    total,
    page: p,
    limit: l,
    totalPages: Math.ceil(total / l),
    data: paginated,
  });
});

// Raw SQL query endpoint (for Data Explorer Sandbox)
app.post("/api/sql-raw", (req, res) => {
  if (!dbInstance) {
    return res.status(503).json({ error: "Database not ready yet." });
  }
  const { sql } = req.body;
  const safety = isSafeSQL(sql);
  if (!safety.safe) {
    return res.status(400).json({ error: safety.reason });
  }

  try {
    const execRes = dbInstance.exec(sql);
    if (!execRes || execRes.length === 0) {
      return res.json({ columns: [], values: [], rowCount: 0 });
    }
    const columns = execRes[0].columns;
    const values = execRes[0].values;
    res.json({
      columns,
      values,
      rowCount: values.length,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Chatbot endpoint: Multi-turn + Text-to-SQL + Execution + Conversational Summary
app.post("/api/chat", async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  if (!dbInstance) {
    await reloadDatabase();
    if (!dbInstance) {
      return res.status(503).json({ error: "Database currently unavailable. Please try again in a few moments." });
    }
  }

  try {
    // 1. Construct prompt for Text-to-SQL
    let contextPrompt = `User Question: "${message}"`;
    if (history && history.length > 0) {
      const recentHistory = history
        .slice(-4)
        .map((m: any) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");
      contextPrompt = `Previous Conversation Context:\n${recentHistory}\n\nCurrent User Question: "${message}"`;
    }

    let reasoning = "Analyzing expense transactions...";
    let sqlQuery = "SELECT * FROM expense_actuals LIMIT 10";
    let isSingleMetric = false;
    let metricLabel = "Total Amount";
    let usedLocalEngine = false;

    // 2. Call Gemini for Text-to-SQL with Model Fallback
    try {
      const sqlResponse = await generateWithModelFallback((modelName) => ({
        contents: contextPrompt,
        config: {
          systemInstruction: SQL_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reasoning: {
                type: Type.STRING,
                description: "Structured analytical plan to answer the question using the database.",
              },
              sql: {
                type: Type.STRING,
                description: "Executable SQLite SELECT query on expense_actuals.",
              },
              is_single_metric: {
                type: Type.BOOLEAN,
                description: "Whether the result is a single aggregate value.",
              },
              metric_label: {
                type: Type.STRING,
                description: "Short label for the single metric if applicable.",
              },
            },
            required: ["reasoning", "sql", "is_single_metric", "metric_label"],
          },
          temperature: 0.1,
        },
      }));

      const parsedJson = JSON.parse(sqlResponse.text?.trim() || "{}");
      reasoning = parsedJson.reasoning || "Analyzing expense transactions...";
      sqlQuery = parsedJson.sql || "SELECT * FROM expense_actuals LIMIT 10";
      isSingleMetric = Boolean(parsedJson.is_single_metric);
      metricLabel = parsedJson.metric_label || "Total Amount";
    } catch (llmErr: any) {
      console.warn("[Chat API] Gemini LLM unavailable or quota exceeded. Using local SQL engine:", llmErr.message);
      usedLocalEngine = true;
      const localResult = localNLtoSQL(message);
      reasoning = `${localResult.reasoning} (Direct in-memory calculation engine)`;
      sqlQuery = localResult.sql;
      isSingleMetric = localResult.is_single_metric;
      metricLabel = localResult.metric_label;
    }

    // 3. Guardrail Check
    const safety = isSafeSQL(sqlQuery);
    if (!safety.safe) {
      return res.json({
        reasoning,
        sql: sqlQuery,
        error: safety.reason,
        columns: [],
        values: [],
        summary: safety.reason,
        isSingleMetric: false,
      });
    }

    // 4. Execute SQL against in-memory SQLite database
    let columns: string[] = [];
    let values: any[][] = [];
    let executionError: string | null = null;

    try {
      const dbResult = dbInstance.exec(sqlQuery);
      if (dbResult && dbResult.length > 0) {
        columns = dbResult[0].columns;
        values = dbResult[0].values;
      }
    } catch (dbErr: any) {
      executionError = dbErr.message || "SQL syntax execution error";
      console.error("[SQL Execution Error]:", dbErr.message, "SQL:", sqlQuery);
      
      // If generated SQL had a syntax error, run local fallback SQL
      if (!usedLocalEngine) {
        try {
          const fallbackRes = localNLtoSQL(message);
          const fbDbResult = dbInstance.exec(fallbackRes.sql);
          if (fbDbResult && fbDbResult.length > 0) {
            columns = fbDbResult[0].columns;
            values = fbDbResult[0].values;
            sqlQuery = fallbackRes.sql;
            reasoning = fallbackRes.reasoning;
            isSingleMetric = fallbackRes.is_single_metric;
            metricLabel = fallbackRes.metric_label;
            executionError = null;
          }
        } catch (fbErr) {
          // keep executionError
        }
      }
    }

    if (executionError) {
      return res.json({
        reasoning,
        sql: sqlQuery,
        error: `SQL Execution Error: ${executionError}`,
        columns: [],
        values: [],
        summary: `I attempted to query the Puja dataset with the generated SQL, but encountered a query error: ${executionError}`,
        isSingleMetric: false,
      });
    }

    // 5. Generate 2-sentence conversational summary grounded in the exact numbers
    let singleValue: any = null;
    if (isSingleMetric && values.length === 1 && values[0].length === 1) {
      singleValue = values[0][0];
    }

    let conversationalSummary = "";

    if (!usedLocalEngine) {
      try {
        const previewData = values.slice(0, 10).map((row) => {
          const obj: Record<string, any> = {};
          columns.forEach((col, idx) => {
            obj[col] = row[idx];
          });
          return obj;
        });

        const summaryPrompt = `
You are the 2025 Puja Expense Assistant.
The user asked: "${message}"
The executed SQL query was: ${sqlQuery}
Query Results (${values.length} rows returned):
${JSON.stringify(previewData, null, 2)}

Instructions:
1. Provide a concise, helpful, and natural 2-sentence conversational summary answering the user's question directly.
2. Use the exact numbers, dollar amounts, and categories from the query result.
3. NEVER guess or hallucinate any numbers or details.
4. If 0 rows were returned, politely inform the user that no matching transactions were found in the 2025 Puja spreadsheet.
`;

        const summaryResponse = await generateWithModelFallback(() => ({
          contents: summaryPrompt,
          config: {
            temperature: 0.2,
          },
        }));

        conversationalSummary = summaryResponse.text?.trim() || "";
      } catch (sumErr) {
        console.warn("[Summary Generation] LLM unavailable, using deterministic summary.");
      }
    }

    if (!conversationalSummary) {
      conversationalSummary = generateDeterministicSummary(
        message,
        metricLabel,
        isSingleMetric,
        columns,
        values
      );
    }

    res.json({
      reasoning,
      sql: sqlQuery,
      columns,
      values,
      rowCount: values.length,
      isSingleMetric,
      metricLabel,
      singleValue,
      summary: conversationalSummary,
      error: null,
    });
  } catch (err: any) {
    console.error("[Chat API Error]:", err);
    // Even in outer catch, try local fallback to deliver great UX!
    try {
      const fb = localNLtoSQL(message);
      const dbResult = dbInstance ? dbInstance.exec(fb.sql) : null;
      let columns: string[] = [];
      let values: any[][] = [];
      if (dbResult && dbResult.length > 0) {
        columns = dbResult[0].columns;
        values = dbResult[0].values;
      }
      const singleValue = fb.is_single_metric && values.length === 1 && values[0].length === 1 ? values[0][0] : null;
      const summary = generateDeterministicSummary(message, fb.metric_label, fb.is_single_metric, columns, values);
      return res.json({
        reasoning: fb.reasoning,
        sql: fb.sql,
        columns,
        values,
        rowCount: values.length,
        isSingleMetric: fb.is_single_metric,
        metricLabel: fb.metric_label,
        singleValue,
        summary,
        error: null,
      });
    } catch (finalErr) {
      res.status(500).json({
        error: err.message || "An unexpected error occurred processing your request.",
        reasoning: "Encountered a server error.",
        sql: "",
        columns: [],
        values: [],
        summary: "I apologize, but I encountered an error while processing your request. Please try again.",
      });
    }
  }
});

// Code Artifacts endpoint for download / view
app.get("/api/code-artifacts", (req, res) => {
  try {
    const appPy = fs.existsSync(path.join(process.cwd(), "app.py"))
      ? fs.readFileSync(path.join(process.cwd(), "app.py"), "utf-8")
      : "";
    const requirementsTxt = fs.existsSync(path.join(process.cwd(), "requirements.txt"))
      ? fs.readFileSync(path.join(process.cwd(), "requirements.txt"), "utf-8")
      : "";
    const codeGs = fs.existsSync(path.join(process.cwd(), "Code.gs"))
      ? fs.readFileSync(path.join(process.cwd(), "Code.gs"), "utf-8")
      : "";

    res.json({
      appPy,
      requirementsTxt,
      codeGs,
      sheetId: SHEET_ID,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Vite Middleware for Development / Static for Production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      if (req.method !== "GET") return next();
      if (req.originalUrl.startsWith("/api")) return next();
      try {
        const indexPath = path.resolve(process.cwd(), "index.html");
        let template = fs.readFileSync(indexPath, "utf-8");
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Puja Chatbot running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
