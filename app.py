"""
Puja Expense Chatbot - Streamlit & DuckDB Application
-----------------------------------------------------
An AI-powered chatbot that answers questions on what was spent during last year's Puja
using the Google Spreadsheet "2025 Puja Expense Transactions".

Built with:
- Google GenAI SDK (`google-genai`)
- Streamlit UI (`streamlit`)
- DuckDB in-memory analytical SQL database (`duckdb`)
- Pandas for data manipulation (`pandas`)
"""

import os
import re
import duckdb
import pandas as pd
import streamlit as st
from google import genai
from google.genai import types

# -----------------------------------------------------------------------------
# Configuration & Constants
# -----------------------------------------------------------------------------
SHEET_ID = "1MDPNMswRlmoEh5z4sJdS_8hQZQeFbTwxxQH6cMicqw0"
SHEET_CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv"
CANDIDATE_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash",
    "gemini-flash-latest"
]
GEMINI_MODEL = CANDIDATE_MODELS[0]

# Page configuration
st.set_page_config(
    page_title="2025 Puja Expense Chatbot",
    page_icon="🪔",
    layout="wide",
    initial_sidebar_state="expanded"
)

# -----------------------------------------------------------------------------
# Step 1: Environment Setup & Data Loader
# -----------------------------------------------------------------------------
def get_gemini_api_key() -> str | None:
    """
    Safely retrieves the Gemini API key without raising StreamlitSecretNotFoundError.
    Checks:
    1. Streamlit secrets (safely wrapped in try/except)
    2. OS Environment variable GEMINI_API_KEY
    3. User input in Streamlit sidebar session_state
    """
    # 1. Try Streamlit secrets safely
    try:
        if hasattr(st, "secrets"):
            try:
                if "GEMINI_API_KEY" in st.secrets:
                    val = str(st.secrets["GEMINI_API_KEY"]).strip()
                    if val and val != "YOUR_GEMINI_API_KEY_HERE":
                        return val
            except Exception:
                # Catches StreamlitSecretNotFoundError when no secrets.toml exists
                pass
    except Exception:
        pass

    # 2. Try OS environment variable
    env_val = os.environ.get("GEMINI_API_KEY", "").strip()
    if env_val:
        return env_val

    # 3. Try Streamlit session state (entered via sidebar)
    session_val = st.session_state.get("user_api_key", "").strip()
    if session_val:
        return session_val

    return None

def get_gemini_client() -> genai.Client | None:
    """Initializes and returns the official Google GenAI client if an API key is available."""
    api_key = get_gemini_api_key()
    if not api_key:
        return None
    try:
        return genai.Client(api_key=api_key)
    except Exception as e:
        st.warning(f"Note: Could not initialize Gemini client: {e}")
        return None

@st.cache_data(show_spinner=False)
def load_expense_data(csv_url: str = SHEET_CSV_URL) -> pd.DataFrame:
    """
    Fetches expense data from the public Google Sheet, cleans numeric amounts,
    and standardizes column headers.
    """
    try:
        df = pd.read_csv(csv_url)
        # Drop unnamed empty trailing columns if present
        df = df.loc[:, ~df.columns.str.contains('^Unnamed')]
        
        # Ensure required columns exist
        expected_cols = ['Date', 'Year - Puja', 'Category', 'Sub-Category', 'Amount', 'Description']
        for col in expected_cols:
            if col not in df.columns:
                # Find matching column ignoring case/whitespace
                match = [c for c in df.columns if c.strip().lower() == col.lower()]
                if match:
                    df.rename(columns={match[0]: col}, inplace=True)
                else:
                    st.error(f"Missing required column in Google Sheet: {col}")

        # Clean 'Amount' column into numeric float
        if 'Amount' in df.columns:
            df['Amount'] = (
                df['Amount']
                .astype(str)
                .str.replace('$', '', regex=False)
                .str.replace(',', '', regex=False)
                .str.strip()
            )
            df['Amount'] = pd.to_numeric(df['Amount'], errors='coerce').fillna(0.0)

        # Standardize strings
        for col in ['Year - Puja', 'Category', 'Sub-Category', 'Description']:
            if col in df.columns:
                df[col] = df[col].astype(str).str.strip()

        # Parse Date where possible
        if 'Date' in df.columns:
            df['Date'] = df['Date'].astype(str).str.strip()

        return df
    except Exception as e:
        st.error(f"Error loading data from Google Sheet: {e}")
        return pd.DataFrame()

def init_duckdb(df: pd.DataFrame) -> duckdb.DuckDBPyConnection:
    """Initializes in-memory DuckDB and loads DataFrame into `expense_actuals` table."""
    conn = duckdb.connect(database=":memory:")
    # Register pandas dataframe as DuckDB table
    conn.register("df_expenses", df)
    
    # Create table with normalized column aliases for user-friendly SQL querying
    conn.execute("""
        CREATE OR REPLACE TABLE expense_actuals AS 
        SELECT 
            "Date",
            "Year - Puja" AS "Year - Puja",
            "Year - Puja" AS "Year_Puja",
            "Category",
            "Sub-Category" AS "Sub-Category",
            "Sub-Category" AS "Sub_Category",
            "Amount",
            "Description"
        FROM df_expenses
    """)
    return conn

# -----------------------------------------------------------------------------
# Step 2: Integrating Gemini via google-genai SDK (Text-to-SQL & Reasoning)
# -----------------------------------------------------------------------------
SQL_SYSTEM_INSTRUCTION = """
You are an expert Data Analyst and SQL generator for the 2025 Puja Expense Transactions dataset.
Your job is to translate natural language user questions into valid, optimized DuckDB SQL queries against the `expense_actuals` table.

### Table Schema:
Table Name: `expense_actuals`
Columns:
- `Date` (VARCHAR): Date of the transaction (e.g., '1/22/2025', '10/02/2025').
- `Year_Puja` or `"Year - Puja"` (VARCHAR): Puja event name. Valid values: 'Durga Puja', 'Kali Puja', 'Saraswati Puja', 'All-3 Puja'.
- `Category` (VARCHAR): High-level category (e.g., 'Cultural', 'PujaMerchandise', 'Temple', 'Misc', 'Treasury', 'Decoration', 'Facilities', 'Registration', 'Resources', 'ParkingTransportation', 'VolunteerAppreciation', 'Anandamela', 'ChildandYouth', 'Food', 'Magazine', 'Security').
- `Sub_Category` or `"Sub-Category"` (VARCHAR): Sub category (e.g., 'Program & Entertainment', 'Material', 'Priest Pranami', 'Kick-off meeting', 'Bank Charges', 'In house decoration', 'Lighting decoration', 'Utilities', 'Food', 'Tent', 'HPD', 'Puja Flowers', 'Labor Charges - Facilities', etc.).
- `Amount` (DOUBLE): Numeric expense amount in USD.
- `Description` (VARCHAR): Transaction memo, vendor names, Zelle recipients, details.

### DOMAIN KNOWLEDGE & SPECIALIZED QUERY MAPPINGS:
1. Paid Labor / Workers / Labour:
   - Labor expenses in this dataset are recorded in `Sub_Category` as:
     * 'Labor Charges - Facilities' (under Category 'Resources')
     * 'Labor Charges - Kitchen' (under Category 'Resources')
     * 'Labor Charges - Temple' (under Category 'Resources')
   - DO NOT filter `Category IN ('Temple', 'Facilities', 'Food')` or `Category = 'Temple'` or `Category = 'Facilities'`! In this dataset, all labor is under Category 'Resources'.
   - When asked "How much was spent on paid labor? Give a breakdown by Temple, Facility and Kitchen" (or any variation of labor breakdown):
     SELECT Sub_Category, ROUND(SUM(Amount), 2) AS "Total Amount ($)", COUNT(*) AS "Transactions" FROM expense_actuals WHERE Sub_Category ILIKE '%Labor%' GROUP BY Sub_Category ORDER BY "Total Amount ($)" DESC;
   - When asked for total paid labor overall:
     SELECT ROUND(SUM(Amount), 2) AS "Total Paid Labor ($)" FROM expense_actuals WHERE Sub_Category ILIKE '%Labor%';

2. Priest Pranami & Dakshina:
   - Use: WHERE Sub_Category ILIKE '%Priest%' OR Description ILIKE '%Pranami%'

3. Tents & Staging:
   - Use: WHERE Sub_Category ILIKE '%Tent%' OR Description ILIKE '%Tent%'

### CRITICAL RULES:
1. Return ONLY the raw SQL query. Do NOT include markdown code fences (no ```sql or ```), no preamble, and no explanation.
2. ONLY generate SELECT queries. NEVER generate INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, or TRUNCATE.
3. For case-insensitive text matching on categories or descriptions, use `ILIKE` or `LOWER(col) = LOWER('val')`.
4. When calculating totals, use `SUM(Amount)` and format/round appropriately if needed (e.g., `ROUND(SUM(Amount), 2)`).
5. If the user asks for single metrics (like "total spent on Cultural"), alias the aggregate column clearly (e.g., `SELECT ROUND(SUM(Amount), 2) AS total_amount FROM expense_actuals WHERE Category ILIKE '%Cultural%'`).
6. If the user asks for breakdowns, include `GROUP BY` and `ORDER BY Amount DESC` or `ORDER BY total_amount DESC`.
7. Handle Durga Puja, Kali Puja, Saraswati Puja queries accurately using `Year_Puja` column.
8. If the query cannot be answered from the spreadsheet, return `SELECT 'Information not found in spreadsheet' AS message`.
"""

def local_nl_to_duckdb(question: str) -> str:
    """Deterministic natural language to DuckDB SQL generator fallback."""
    q = question.lower().strip()

    # 1. Identify Target Puja
    puja_filter = None
    if "durga" in q:
        puja_filter = "Year_Puja = 'Durga Puja'"
    elif "kali" in q:
        puja_filter = "Year_Puja = 'Kali Puja'"
    elif "saraswati" in q:
        puja_filter = "Year_Puja = 'Saraswati Puja'"
    elif "all-3" in q or "all 3" in q or "all three" in q:
        puja_filter = "Year_Puja = 'All-3 Puja'"

    # 2. Paid Labor breakdown or total
    if any(k in q for k in ["labor", "labour", "worker", "workers", "manpower"]):
        if any(k in q for k in ["breakdown", "break down", "temple", "facility", "kitchen", "by"]):
            return (
                "SELECT Sub_Category AS \"Labor Type\", ROUND(SUM(Amount), 2) AS \"Total Amount ($)\", "
                "COUNT(*) AS \"Transactions\" FROM expense_actuals WHERE Sub_Category ILIKE '%Labor%' "
                "GROUP BY Sub_Category ORDER BY \"Total Amount ($)\" DESC"
            )
        return "SELECT ROUND(SUM(Amount), 2) AS \"Total Paid Labor ($)\" FROM expense_actuals WHERE Sub_Category ILIKE '%Labor%'"

    # 3. Known Categories
    cat_map = {
        "cultural": "Cultural", "temple": "Temple", "merchandise": "PujaMerchandise",
        "facilities": "Facilities", "facility": "Facilities", "decoration": "Decoration",
        "decor": "Decoration", "treasury": "Treasury", "misc": "Misc",
        "registration": "Registration", "resources": "Resources", "parking": "ParkingTransportation",
        "transportation": "ParkingTransportation", "volunteer": "VolunteerAppreciation",
        "anandamela": "Anandamela", "child": "ChildandYouth", "youth": "ChildandYouth",
        "food": "Food", "magazine": "Magazine", "security": "Security"
    }
    matched_cat = None
    for kw, cat in cat_map.items():
        if kw in q:
            matched_cat = cat
            break

    # 4. Specific sub-category / vendor keywords
    sub_cat_keyword = None
    if any(k in q for k in ["priest", "pranami", "purohit", "dakshina"]):
        sub_cat_keyword = "Priest Pranami"
    elif "tent" in q:
        sub_cat_keyword = "Tent"
    elif "lighting" in q or "light" in q:
        sub_cat_keyword = "Lighting"
    elif "sound" in q or "audio" in q:
        sub_cat_keyword = "Sound"
    elif "flower" in q:
        sub_cat_keyword = "Flower"
    elif "entertainment" in q or "program" in q:
        sub_cat_keyword = "Program"
    elif "bank" in q or "zelle" in q:
        sub_cat_keyword = "Bank"

    # 5. Puja comparison
    if "compare" in q or ("breakdown" in q and "puja" in q) or "between puja" in q or "each puja" in q:
        return (
            "SELECT Year_Puja AS \"Puja Event\", ROUND(SUM(Amount), 2) AS \"Total Spent ($)\", "
            "COUNT(*) AS \"Transactions\", ROUND(AVG(Amount), 2) AS \"Avg Spend ($)\" "
            "FROM expense_actuals GROUP BY Year_Puja ORDER BY \"Total Spent ($)\" DESC"
        )

    # 6. Category Breakdown
    if "by category" in q or "all categories" in q or "category breakdown" in q or "ranked" in q:
        where = f"WHERE {puja_filter} " if puja_filter else ""
        return f"SELECT Category, ROUND(SUM(Amount), 2) AS \"Total Amount ($)\", COUNT(*) AS \"Transactions\" FROM expense_actuals {where}GROUP BY Category ORDER BY \"Total Amount ($)\" DESC"

    # 7. Top / Highest Expenses
    if any(k in q for k in ["highest", "top", "largest", "maximum", "max"]):
        limit = 5
        match = re.search(r"top\s*(\d+)", q)
        if match:
            limit = int(match.group(1))
        where_parts = []
        if puja_filter:
            where_parts.append(puja_filter)
        if matched_cat:
            where_parts.append(f"Category = '{matched_cat}'")
        where_clause = f"WHERE {' AND '.join(where_parts)} " if where_parts else ""
        return f"SELECT Date, Year_Puja AS \"Puja Event\", Category, Sub_Category, Amount, Description FROM expense_actuals {where_clause}ORDER BY Amount DESC LIMIT {limit}"

    # 8. Specific Sub-Category Total
    if sub_cat_keyword:
        where_clause = f"WHERE (Sub_Category ILIKE '%{sub_cat_keyword}%' OR Description ILIKE '%{sub_cat_keyword}%')"
        if puja_filter:
            where_clause += f" AND {puja_filter}"
        if "how much" in q or "total" in q or "sum" in q:
            return f"SELECT ROUND(SUM(Amount), 2) AS \"Total for {sub_cat_keyword} ($)\" FROM expense_actuals {where_clause}"
        return f"SELECT Date, Year_Puja AS \"Puja Event\", Category, Sub_Category, Amount, Description FROM expense_actuals {where_clause} ORDER BY Amount DESC LIMIT 25"

    # 9. Matched Category Total
    if matched_cat:
        where_clause = f"WHERE Category = '{matched_cat}'"
        if puja_filter:
            where_clause += f" AND {puja_filter}"
        if "how much" in q or "total" in q or "sum" in q or "breakdown" not in q:
            return f"SELECT ROUND(SUM(Amount), 2) AS \"Total {matched_cat} ($)\" FROM expense_actuals {where_clause}"
        return f"SELECT Sub_Category, ROUND(SUM(Amount), 2) AS \"Total ($)\", COUNT(*) AS \"Transactions\" FROM expense_actuals {where_clause} GROUP BY Sub_Category ORDER BY \"Total ($)\" DESC"

    # 10. Single Puja Total
    if puja_filter:
        return f"SELECT ROUND(SUM(Amount), 2) AS \"Total Spent ($)\" FROM expense_actuals WHERE {puja_filter}"

    # 11. Overall Dataset Total
    if any(k in q for k in ["total", "overall", "how much was spent", "all spent"]):
        return "SELECT ROUND(SUM(Amount), 2) AS \"Total 2025 Puja Spend ($)\" FROM expense_actuals"

    # 12. Fallback search
    words = [w for w in re.sub(r'[^a-zA-Z0-9\s]', '', q).split() if len(w) > 2]
    if words:
        term = words[0]
        return f"SELECT Date, Year_Puja AS \"Puja Event\", Category, Sub_Category, Amount, Description FROM expense_actuals WHERE Description ILIKE '%{term}%' OR Category ILIKE '%{term}%' OR Sub_Category ILIKE '%{term}%' ORDER BY Amount DESC LIMIT 20"

    return "SELECT Date, Year_Puja AS \"Puja Event\", Category, Sub_Category, Amount, Description FROM expense_actuals ORDER BY Amount DESC LIMIT 10"

def generate_deterministic_summary(question: str, df_result: pd.DataFrame) -> str:
    """Generates an accurate, grounded summary directly from the dataframe without needing LLM."""
    if df_result is None or df_result.empty:
        return f"No transaction records matching '{question}' were found in the 2025 Puja expense spreadsheet."

    rows = len(df_result)
    cols = len(df_result.columns)

    if rows == 1 and cols == 1:
        val = df_result.iloc[0, 0]
        col_name = df_result.columns[0]
        if isinstance(val, (int, float)):
            return f"The calculated {col_name} is ${val:,.2f} based on the recorded 2025 Puja transactions."
        return f"The result is {val} based on the recorded 2025 Puja transactions."

    # Look for numeric amount columns to compute total
    amt_col = None
    for col in df_result.columns:
        if "amount" in col.lower() or "total" in col.lower() or col.lower() == "amount":
            if pd.api.types.is_numeric_dtype(df_result[col]):
                amt_col = col
                break

    if amt_col is not None:
        total_sum = df_result[amt_col].sum()
        first_col = df_result.columns[0]
        top_row = df_result.iloc[0]
        top_name = str(top_row[first_col])
        top_amt = top_row[amt_col]
        if isinstance(top_amt, (int, float)):
            return (
                f"Total spend across all {rows} item(s) is ${total_sum:,.2f}. "
                f"The leading {first_col} is '{top_name}' with ${top_amt:,.2f}."
            )

    return f"Retrieved {rows} record(s) from the 2025 Puja expense spreadsheet matching your query."

def generate_sql_query(client: genai.Client | None, question: str, conversation_history: list) -> str:
    """Translates a user question into executable DuckDB SQL using Gemini with automatic fallback."""
    if not client:
        return local_nl_to_duckdb(question)

    try:
        # Build prompt with conversation context if available
        context_prompt = f"User Question: {question}\n\nTranslate this question into a single executable DuckDB SELECT query against `expense_actuals`."
        if conversation_history:
            history_text = "\n".join([f"{m['role'].capitalize()}: {m['content']}" for m in conversation_history[-3:]])
            context_prompt = f"Previous conversation context:\n{history_text}\n\nFollow-up Question: {question}\n\nGenerate the DuckDB SELECT SQL query:"

        for model_name in CANDIDATE_MODELS:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=context_prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=SQL_SYSTEM_INSTRUCTION,
                        temperature=0.0,
                    ),
                )
                raw_sql = response.text.strip() if response.text else ""
                clean_sql = re.sub(r"^```(sql)?", "", raw_sql, flags=re.IGNORECASE).strip()
                clean_sql = re.sub(r"```$", "", clean_sql).strip()
                if clean_sql:
                    return clean_sql
            except Exception as model_err:
                continue
    except Exception as e:
        pass

    # Seamless fallback to local SQL engine
    return local_nl_to_duckdb(question)

def generate_conversational_summary(client: genai.Client | None, question: str, sql: str, df_result: pd.DataFrame) -> str:
    """Generates a concise 2-sentence conversational explanation with fallback."""
    if not client or df_result is None or df_result.empty:
        return generate_deterministic_summary(question, df_result)

    try:
        result_preview = df_result.head(15).to_string(index=False)
        summary_prompt = f"""
You are the Puja Expense Assistant. 
The user asked: "{question}"
The executed SQL was: {sql}
The exact query result is:
{result_preview}

Summary Guidelines:
1. Provide a concise, clear, and friendly 2-sentence summary answering the user's question directly.
2. Use the exact numbers and totals from the query result. Do NOT guess or hallucinate any numbers.
3. If no rows were returned, state politely that no transactions were found matching the criteria in the 2025 Puja spreadsheet.
"""
        for model_name in CANDIDATE_MODELS:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=summary_prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.2,
                    ),
                )
                if response.text and response.text.strip():
                    return response.text.strip()
            except Exception:
                continue
    except Exception:
        pass

    return generate_deterministic_summary(question, df_result)

# -----------------------------------------------------------------------------
# Guardrail Checker
# -----------------------------------------------------------------------------
def is_safe_sql(sql: str) -> tuple[bool, str]:
    """Ensures SQL is strictly a read-only SELECT query."""
    if not sql:
        return False, "Empty SQL query generated."
    
    cleaned = sql.strip().upper()
    if not (cleaned.startswith("SELECT") or cleaned.startswith("WITH")):
        return False, "Guardrail Alert: Only SELECT queries are permitted on the Puja dataset."
    
    forbidden_keywords = [
        "DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE", 
        "CREATE", "REPLACE", "GRANT", "REVOKE", "EXEC", "EXECUTE"
    ]
    for kw in forbidden_keywords:
        pattern = r"\b" + kw + r"\b"
        if re.search(pattern, cleaned):
            return False, f"Guardrail Alert: Forbidden operation '{kw}' detected. Only read queries are allowed."
            
    return True, ""

# -----------------------------------------------------------------------------
# Step 3: Streamlit UI & Chat Interface
# -----------------------------------------------------------------------------
def main():
    # Sidebar
    with st.sidebar:
        st.title("🪔 2025 Puja Expenses")
        st.markdown("### Source Spreadsheet")
        st.markdown(
            f"[Open Google Sheet ↗](https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?usp=sharing)",
            help="Opens the 2025 Puja Expense Transactions Google Sheet"
        )
        
        st.divider()
        
        # Refresh Data Button
        if st.button("🔄 Refresh Data", use_container_width=True):
            st.cache_data.clear()
            st.success("Cache cleared! Re-fetching latest spreadsheet data...")
            st.rerun()

        # Gemini API Key Status / Configuration
        st.divider()
        st.markdown("### 🔑 Gemini AI Settings")
        active_key = get_gemini_api_key()
        if active_key:
            st.success("Gemini API Key active", icon="✅")
        else:
            st.info("No API key detected. Running in fast analytical mode. Enter an optional key below for Gemini LLM reasoning.", icon="ℹ️")

        user_key_input = st.text_input(
            "Gemini API Key",
            value=st.session_state.get("user_api_key", ""),
            type="password",
            placeholder="Paste AI Studio API key...",
            help="To persist without entering each time, create .streamlit/secrets.toml with: GEMINI_API_KEY = \"your_key\" or set the GEMINI_API_KEY environment variable."
        )
        if user_key_input != st.session_state.get("user_api_key", ""):
            st.session_state["user_api_key"] = user_key_input
            st.rerun()

        st.divider()

        # Load data
        with st.spinner("Connecting to Google Sheets..."):
            df = load_expense_data()
            if not df.empty:
                conn = init_duckdb(df)
                total_spent = df['Amount'].sum()
                total_tx = len(df)
                pujas = df['Year - Puja'].nunique()
                categories = df['Category'].nunique()
                
                st.markdown("### 📊 Dataset Overview")
                col1, col2 = st.columns(2)
                col1.metric("Total Spent", f"${total_spent:,.2f}")
                col2.metric("Transactions", f"{total_tx:,}")
                
                col3, col4 = st.columns(2)
                col3.metric("Events", f"{pujas}")
                col4.metric("Categories", f"{categories}")
                
                st.divider()
                st.markdown("### 💡 Sample Questions")
                sample_queries = [
                    "How much was spend on paid labor? Give a breakdown by Temple, Facility and Kitchen",
                    "What was the total spent on Durga Puja?",
                    "Show breakdown of Cultural expenses",
                    "How much was spent on Priest Pranami?",
                    "Top 5 highest expense transactions",
                    "List all Temple expenses",
                    "Compare expenses: Durga Puja vs Kali Puja"
                ]
                for q in sample_queries:
                    if st.button(q, key=f"btn_{q}", use_container_width=True):
                        st.session_state["pending_query"] = q
                        st.rerun()
            else:
                st.error("Unable to load data from Google Sheets. Please verify the URL.")
                return

    # Main Chat Area
    st.subheader("💬 Puja Expense AI Assistant")
    st.caption("Ask any question about 2025 Puja expenses. The assistant translates your questions to DuckDB SQL and queries the live spreadsheet.")

    # Initialize session state for conversation
    if "messages" not in st.session_state:
        st.session_state.messages = [
            {
                "role": "assistant",
                "content": "Namaskar! 🙏 I am your 2025 Puja Expense Assistant. Ask me anything about Durga Puja, Kali Puja, Saraswati Puja costs, vendor payments, or category breakdowns.",
                "sql": None,
                "df": None,
                "is_single_metric": False,
            }
        ]

    # Render Chat History
    for msg in st.session_state.messages:
        with st.chat_message(msg["role"]):
            st.write(msg["content"])
            
            # Show SQL if available
            if msg.get("sql"):
                with st.expander("🔍 Show Generated SQL", expanded=False):
                    st.code(msg["sql"], language="sql")
            
            # Show DataFrame / Metric if available
            if msg.get("df") is not None and not msg["df"].empty:
                df_to_show = msg["df"]
                if msg.get("is_single_metric") and len(df_to_show) == 1 and len(df_to_show.columns) == 1:
                    val = df_to_show.iloc[0, 0]
                    col_name = df_to_show.columns[0]
                    if isinstance(val, (int, float)):
                        st.metric(label=col_name.replace("_", " ").title(), value=f"${val:,.2f}")
                    else:
                        st.metric(label=col_name.replace("_", " ").title(), value=str(val))
                else:
                    st.dataframe(df_to_show, use_container_width=True)

    # Handle incoming user query
    user_query = st.chat_input("Ask a question about Puja expenses...")
    if "pending_query" in st.session_state and st.session_state["pending_query"]:
        user_query = st.session_state.pop("pending_query")

    if user_query:
        # Append User Message
        st.session_state.messages.append({"role": "user", "content": user_query})
        with st.chat_message("user"):
            st.write(user_query)

        # Assistant Processing
        with st.chat_message("assistant"):
            with st.spinner("Analyzing spreadsheet & generating SQL query..."):
                client = get_gemini_client()
                
                # Step A: Text-to-SQL
                sql = generate_sql_query(
                    client=client, 
                    question=user_query, 
                    conversation_history=st.session_state.messages[:-1]
                )
                
                # Step B: Guardrail Check
                is_safe, error_msg = is_safe_sql(sql)
                
                if not is_safe:
                    st.error(error_msg)
                    st.session_state.messages.append({
                        "role": "assistant",
                        "content": error_msg,
                        "sql": sql,
                        "df": None,
                        "is_single_metric": False
                    })
                else:
                    # Step C: Execution against DuckDB
                    try:
                        result_df = conn.execute(sql).df()
                        
                        # Determine if single metric
                        is_single_metric = (len(result_df) == 1 and len(result_df.columns) == 1)
                        
                        # Step D: Conversational Summary
                        summary = generate_conversational_summary(
                            client=client,
                            question=user_query,
                            sql=sql,
                            df_result=result_df
                        )
                        
                        # Display in current message
                        st.write(summary)
                        
                        with st.expander("🔍 Show Generated SQL", expanded=False):
                            st.code(sql, language="sql")
                            
                        if not result_df.empty:
                            if is_single_metric:
                                val = result_df.iloc[0, 0]
                                col_name = result_df.columns[0]
                                if isinstance(val, (int, float)):
                                    st.metric(label=col_name.replace("_", " ").title(), value=f"${val:,.2f}")
                                else:
                                    st.metric(label=col_name.replace("_", " ").title(), value=str(val))
                            else:
                                st.dataframe(result_df, use_container_width=True)
                        else:
                            st.info("No records found in spreadsheet matching your criteria.")

                        # Save to session state
                        st.session_state.messages.append({
                            "role": "assistant",
                            "content": summary,
                            "sql": sql,
                            "df": result_df,
                            "is_single_metric": is_single_metric
                        })
                    except Exception as exec_err:
                        err_text = f"SQL Execution Error: {exec_err}"
                        st.error(err_text)
                        with st.expander("🔍 Show Attempted SQL"):
                            st.code(sql, language="sql")
                        st.session_state.messages.append({
                            "role": "assistant",
                            "content": f"I encountered an issue executing the query: {exec_err}",
                            "sql": sql,
                            "df": None,
                            "is_single_metric": False
                        })

if __name__ == "__main__":
    main()
