import React, { useState, useEffect } from "react";
import { 
  Search, 
  Filter, 
  Download, 
  Database, 
  Play, 
  RotateCw, 
  Terminal, 
  AlertCircle, 
  CheckCircle2, 
  Sparkles,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { AppStatus, PujaTransaction } from "../types";

interface DataExplorerProps {
  status: AppStatus | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}

const PRESET_SQL_QUERIES = [
  {
    name: "Total Spend by Puja",
    sql: "SELECT Year_Puja, ROUND(SUM(Amount), 2) AS Total_Spent, COUNT(*) AS Transactions FROM expense_actuals GROUP BY Year_Puja ORDER BY Total_Spent DESC",
  },
  {
    name: "Top 10 Largest Transactions",
    sql: "SELECT Date, Year_Puja, Category, Sub_Category, Amount, Description FROM expense_actuals ORDER BY Amount DESC LIMIT 10",
  },
  {
    name: "Category Summary Breakdown",
    sql: "SELECT Category, ROUND(SUM(Amount), 2) AS Total_Amount, COUNT(*) AS Items FROM expense_actuals GROUP BY Category ORDER BY Total_Amount DESC",
  },
  {
    name: "Temple & Priest Expenses",
    sql: "SELECT Date, Year_Puja, Sub_Category, Amount, Description FROM expense_actuals WHERE Category = 'Temple' OR Sub_Category LIKE '%Priest%' ORDER BY Amount DESC",
  },
  {
    name: "Food & Catering Breakdown",
    sql: "SELECT Sub_Category, ROUND(SUM(Amount), 2) AS Total_Amount, COUNT(*) AS Count FROM expense_actuals WHERE Category = 'Food' GROUP BY Sub_Category ORDER BY Total_Amount DESC",
  },
];

export const DataExplorer: React.FC<DataExplorerProps> = ({
  status,
  onRefresh,
  isRefreshing,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<"table" | "sql">("table");
  
  // Table View State
  const [data, setData] = useState<PujaTransaction[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPuja, setSelectedPuja] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // SQL Sandbox State
  const [customSql, setCustomSql] = useState(PRESET_SQL_QUERIES[0].sql);
  const [sqlLoading, setSqlLoading] = useState(false);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlResult, setSqlResult] = useState<{ columns: string[]; values: any[][]; rowCount: number } | null>(null);

  // Fetch paginated table data
  const fetchData = async () => {
    setLoadingData(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "25",
        puja: selectedPuja,
        category: selectedCategory,
        search: searchQuery,
      });
      const res = await fetch(`/api/data?${params.toString()}`);
      const json = await res.json();
      setData(json.data || []);
      setTotalPages(json.totalPages || 1);
      setTotalRecords(json.total || 0);
    } catch (e) {
      console.error("Error fetching transactions:", e);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, selectedPuja, selectedCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchData();
  };

  // Run Custom SQL in Sandbox
  const handleExecuteSql = async () => {
    if (!customSql.trim() || sqlLoading) return;
    setSqlLoading(true);
    setSqlError(null);
    try {
      const res = await fetch("/api/sql-raw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: customSql }),
      });
      const json = await res.json();
      if (res.ok) {
        setSqlResult(json);
      } else {
        setSqlError(json.error || "Failed to execute SQL query");
        setSqlResult(null);
      }
    } catch (err: any) {
      setSqlError(err.message || "Network error");
    } finally {
      setSqlLoading(false);
    }
  };

  // Export full table data
  const exportFullCSV = async () => {
    try {
      const res = await fetch("/api/data?limit=1000");
      const json = await res.json();
      const rows: any[] = json.data || [];
      if (rows.length === 0) return;

      const headers = ["Date", "Year - Puja", "Category", "Sub-Category", "Amount", "Description"];
      const csvLines = [
        headers.join(","),
        ...rows.map((r) =>
          [
            `"${r.Date}"`,
            `"${r["Year - Puja"]}"`,
            `"${r.Category}"`,
            `"${r["Sub-Category"]}"`,
            r.Amount,
            `"${(r.Description || "").replace(/"/g, '""')}"`,
          ].join(",")
        ),
      ];

      const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "2025_puja_expense_transactions.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Export error:", err);
    }
  };

  const formatCurrency = (val: number): string => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900 tracking-tight">
              Live Spreadsheet Data Explorer
            </h2>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200">
              {status?.rowCount || 444} Records Loaded
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Explore all transactions or write custom SQL directly against the in-memory DuckDB / SQLite table.
          </p>
        </div>

        {/* Tab switch & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-slate-100/80 p-1 rounded-xl border border-slate-200/70 flex items-center">
            <button
              onClick={() => setActiveSubTab("table")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeSubTab === "table"
                  ? "bg-white text-slate-900 shadow-xs border border-slate-200/60"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Spreadsheet View
            </button>
            <button
              onClick={() => {
                setActiveSubTab("sql");
                if (!sqlResult) handleExecuteSql();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === "sql"
                  ? "bg-white text-slate-900 shadow-xs border border-slate-200/60"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-indigo-600" />
              <span>SQL Sandbox</span>
            </button>
          </div>

          <button
            onClick={exportFullCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-medium transition-all shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => {
              onRefresh();
              fetchData();
            }}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Sync Sheet</span>
          </button>
        </div>
      </div>

      {/* SUB TAB 1: SPREADSHEET TABLE VIEW */}
      {activeSubTab === "table" && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
          {/* Filters Bar */}
          <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {/* Search Input */}
            <div className="relative sm:col-span-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search vendor, description, or notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden transition-colors"
              />
            </div>

            {/* Puja Filter */}
            <div>
              <select
                value={selectedPuja}
                onChange={(e) => {
                  setSelectedPuja(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-hidden transition-colors"
              >
                <option value="all">All Puja Events</option>
                <option value="Durga Puja">Durga Puja</option>
                <option value="Kali Puja">Kali Puja</option>
                <option value="Saraswati Puja">Saraswati Puja</option>
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-hidden transition-colors"
              >
                <option value="all">All Categories</option>
                {status?.categories?.map((cat) => (
                  <option key={cat.name} value={cat.name}>
                    {cat.name} ({cat.count})
                  </option>
                ))}
              </select>
            </div>
          </form>

          {/* Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/70 border-b border-slate-200">
                    <th className="px-3.5 py-2.5 font-semibold text-slate-800">#</th>
                    <th className="px-3.5 py-2.5 font-semibold text-slate-800">Date</th>
                    <th className="px-3.5 py-2.5 font-semibold text-slate-800">Puja Event</th>
                    <th className="px-3.5 py-2.5 font-semibold text-slate-800">Category</th>
                    <th className="px-3.5 py-2.5 font-semibold text-slate-800">Sub-Category</th>
                    <th className="px-3.5 py-2.5 font-semibold text-slate-800 text-right">Amount</th>
                    <th className="px-3.5 py-2.5 font-semibold text-slate-800">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingData ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-500">
                        <RotateCw className="w-6 h-6 animate-spin mx-auto text-indigo-600 mb-2" />
                        <span>Loading transactions from memory store...</span>
                      </td>
                    </tr>
                  ) : data.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-500">
                        No transactions found matching the selected filters.
                      </td>
                    </tr>
                  ) : (
                    data.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3.5 py-2.5 text-slate-400 font-mono text-[11px]">{row.id}</td>
                        <td className="px-3.5 py-2.5 text-slate-700 whitespace-nowrap">{row.Date}</td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              row["Year - Puja"].includes("Durga")
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : row["Year - Puja"].includes("Kali")
                                ? "bg-rose-50 text-rose-800 border-rose-200"
                                : "bg-indigo-50 text-indigo-800 border-indigo-200"
                            }`}
                          >
                            {row["Year - Puja"]}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-900 font-medium whitespace-nowrap">{row.Category}</td>
                        <td className="px-3.5 py-2.5 text-slate-700 whitespace-nowrap">{row["Sub-Category"]}</td>
                        <td className="px-3.5 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">
                          {formatCurrency(row.Amount)}
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-600 text-xs max-w-xs truncate" title={row.Description}>
                          {row.Description}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="bg-slate-50/80 px-4 py-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
              <div>
                Showing <strong>{(page - 1) * 25 + 1}</strong> to{" "}
                <strong>{Math.min(page * 25, totalRecords)}</strong> of <strong>{totalRecords}</strong> transactions
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={page <= 1 || loadingData}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium disabled:opacity-40 hover:bg-slate-50 transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>
                <span className="px-2 font-semibold text-slate-800">
                  Page {page} of {totalPages}
                </span>
                <button
                  disabled={page >= totalPages || loadingData}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium disabled:opacity-40 hover:bg-slate-50 transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB TAB 2: SQL SANDBOX */}
      {activeSubTab === "sql" && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-base text-slate-900 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-600" />
                <span>Direct SQL Query Sandbox</span>
              </h3>
              <p className="text-xs text-slate-500">
                Execute custom `SELECT` queries on the loaded table `expense_actuals` with instant SQL engine execution.
              </p>
            </div>
          </div>

          {/* Quick Preset Queries */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Preset SQL Templates:</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_SQL_QUERIES.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCustomSql(preset.sql);
                  }}
                  className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition-all cursor-pointer shadow-2xs"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Code Editor Area */}
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 text-slate-100 font-mono text-xs shadow-inner">
            <div className="bg-slate-900 px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-slate-400 text-[11px]">
              <span>DuckDB / SQLite SQL Syntax</span>
              <span>Table: `expense_actuals`</span>
            </div>
            <textarea
              value={customSql}
              onChange={(e) => setCustomSql(e.target.value)}
              rows={4}
              placeholder="SELECT Category, SUM(Amount) FROM expense_actuals GROUP BY Category..."
              className="w-full p-3.5 bg-transparent text-slate-100 focus:outline-hidden font-mono text-xs leading-relaxed resize-y"
            />
          </div>

          {/* Run Button */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleExecuteSql}
              disabled={sqlLoading || !customSql.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-200/50 flex items-center gap-1.5 disabled:opacity-50 transition-all cursor-pointer"
            >
              {sqlLoading ? (
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>{sqlLoading ? "Executing..." : "Execute Query"}</span>
            </button>

            {sqlResult && (
              <div className="text-xs text-emerald-800 font-semibold flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Returned {sqlResult.rowCount} rows</span>
              </div>
            )}
          </div>

          {/* Error display */}
          {sqlError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Query Failed</div>
                <div>{sqlError}</div>
              </div>
            </div>
          )}

          {/* Result Table */}
          {sqlResult && sqlResult.columns && sqlResult.columns.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/70 border-b border-slate-200">
                      {sqlResult.columns.map((col, idx) => (
                        <th key={idx} className="px-3.5 py-2 font-semibold text-slate-800 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sqlResult.values.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50/80">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="px-3.5 py-2 text-slate-700 whitespace-nowrap">
                            {typeof cell === "number" && (sqlResult.columns[cIdx].toLowerCase().includes("amount") || sqlResult.columns[cIdx].toLowerCase().includes("total") || sqlResult.columns[cIdx].toLowerCase().includes("spent"))
                              ? formatCurrency(cell)
                              : String(cell ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
