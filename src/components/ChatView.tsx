import React, { useState, useRef, useEffect } from "react";
import { 
  Send, 
  Sparkles, 
  Database, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Download, 
  Trash2, 
  ArrowRight,
  ShieldCheck,
  Search,
  Zap,
  Info
} from "lucide-react";
import { ChatMessage, AppStatus } from "../types";

interface ChatViewProps {
  messages: ChatMessage[];
  status: AppStatus | null;
  isLoading: boolean;
  onSendMessage: (query: string) => void;
  onClearChat: () => void;
}

const SAMPLE_QUERIES = [
  "What was the total spent on Durga Puja?",
  "Show breakdown of Cultural expenses",
  "How much was spent on Priest Pranami?",
  "Top 5 highest expense transactions in 2025",
  "List all Temple expenses with date and amount",
  "Compare expenses between Durga Puja, Kali Puja and Saraswati Puja",
  "What were the expenses for snacks, sweets and food stalls?",
  "Show all transactions paid to Funndu LLC or JS Events",
];

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  status,
  isLoading,
  onSendMessage,
  onClearChat,
}) => {
  const [inputQuery, setInputQuery] = useState("");
  const [expandedSql, setExpandedSql] = useState<Record<string, boolean>>({});
  const [copiedSqlId, setCopiedSqlId] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState<Record<string, string>>({});
  const [tablePage, setTablePage] = useState<Record<string, number>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim() || isLoading) return;
    onSendMessage(inputQuery.trim());
    setInputQuery("");
  };

  const handleSampleClick = (query: string) => {
    if (isLoading) return;
    onSendMessage(query);
  };

  const toggleSql = (id: string) => {
    setExpandedSql((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSqlId(id);
    setTimeout(() => setCopiedSqlId(null), 2000);
  };

  const formatCurrency = (val: any): string => {
    if (typeof val === "number") {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
    }
    if (typeof val === "string" && !isNaN(Number(val))) {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(val));
    }
    return String(val ?? "");
  };

  const exportTableCSV = (msg: ChatMessage) => {
    if (!msg.columns || !msg.values) return;
    const header = msg.columns.join(",");
    const rows = msg.values.map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? "");
          return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(",")
    );
    const csvContent = "data:text/csv;charset=utf-8," + [header, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `puja_query_${msg.id.slice(0, 6)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-5xl mx-auto px-4 sm:px-6 py-4">
      {/* Top Banner / Dataset Overview */}
      {messages.length <= 1 && (
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 sm:p-5 mb-4 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-md bg-indigo-600/10 border border-indigo-200 flex items-center justify-center text-indigo-600 font-bold text-xs">
                  AI
                </div>
                <h2 className="font-semibold text-base sm:text-lg text-slate-900">
                  2025 Puja Expense Assistant
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
                Directly connected to the official Google Sheet <strong>“2025 Puja Expense Transactions”</strong>. 
                Ask natural questions; I will generate safe SQL, query DuckDB / SQLite in-memory, and calculate exact aggregations.
              </p>
            </div>
            {status && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 w-full sm:w-auto shrink-0">
                <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-2xs">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Spend</div>
                  <div className="text-sm font-bold text-slate-900">
                    {formatCurrency(status.totalSpent)}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-2xs">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Transactions</div>
                  <div className="text-sm font-bold text-slate-900">{status.rowCount}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center col-span-2 sm:col-span-1 shadow-2xs">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Events</div>
                  <div className="text-xs font-semibold text-slate-900">Durga, Kali, Saraswati</div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Starter Suggestions */}
          <div className="mt-4 pt-3 border-t border-slate-200/80">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-indigo-600" />
              <span>Suggested Queries</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_QUERIES.slice(0, 6).map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSampleClick(q)}
                  disabled={isLoading}
                  className="text-xs bg-white hover:bg-slate-100/80 text-slate-700 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <span>{q}</span>
                  <ArrowRight className="w-3 h-3 text-slate-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages Container */}
      <div className="flex-1 overflow-y-auto space-y-5 pr-1 mb-3">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const isExpanded = expandedSql[msg.id] ?? false;
          const search = tableSearch[msg.id] || "";
          const page = tablePage[msg.id] || 1;
          const rowsPerPage = 5;

          // Filter rows if user is searching inside table
          let displayValues = msg.values || [];
          if (search && msg.columns) {
            displayValues = displayValues.filter((row) =>
              row.some((cell) => String(cell).toLowerCase().includes(search.toLowerCase()))
            );
          }
          const totalPages = Math.ceil(displayValues.length / rowsPerPage) || 1;
          const paginatedRows = displayValues.slice((page - 1) * rowsPerPage, page * rowsPerPage);

          return (
            <div
              key={msg.id}
              className={`flex items-start gap-3.5 ${isUser ? "flex-row-reverse self-end" : "justify-start"} max-w-[90%] sm:max-w-[85%] ${isUser ? "ml-auto" : "mr-auto"}`}
            >
              {/* Avatar */}
              {isUser ? (
                <div className="w-8 h-8 rounded-full bg-slate-900 shrink-0 border border-slate-800 flex items-center justify-center text-[10px] text-white font-bold">
                  DEV
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-slate-100 shrink-0 flex items-center justify-center border border-slate-200">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                </div>
              )}

              {/* Message Bubble & Metadata */}
              <div className="space-y-1.5 flex-1 min-w-0">
                <div
                  className={`p-4 sm:p-5 text-[14px] leading-relaxed transition-all ${
                    isUser
                      ? "bg-indigo-600 rounded-3xl rounded-tr-none text-white shadow-md shadow-indigo-200/50"
                      : "bg-slate-50 rounded-3xl rounded-tl-none border border-slate-100 text-slate-700 shadow-xs"
                  }`}
                >
                  {/* User Message */}
                  {isUser ? (
                    <div>{msg.content}</div>
                  ) : (
                    <div className="space-y-3">
                      {/* Structured Reasoning Disclosure */}
                      {msg.reasoning && (
                        <div className="flex items-start gap-2 bg-white/90 border border-slate-200/80 rounded-xl p-3 text-xs text-slate-600 shadow-2xs">
                          <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-slate-800 mr-1">Query Logic:</span>
                            <span className="text-slate-600">{msg.reasoning}</span>
                          </div>
                        </div>
                      )}

                      {/* Conversational Summary */}
                      <div className="text-slate-800 leading-relaxed font-normal">
                        {msg.content}
                      </div>

                      {/* Single Metric Card Display */}
                      {msg.isSingleMetric && msg.singleValue !== undefined && msg.singleValue !== null && (
                        <div className="bg-white border border-slate-200 rounded-2xl p-4 my-2 text-center shadow-xs">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                            {msg.metricLabel || "Total Calculated"}
                          </div>
                          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                            {formatCurrency(msg.singleValue)}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Verified analytical calculation from table records</span>
                          </div>
                        </div>
                      )}

                      {/* Multi-row Data Table Display */}
                      {!msg.isSingleMetric && msg.columns && msg.columns.length > 0 && msg.values && msg.values.length > 0 && (
                        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white mt-3 shadow-2xs">
                          {/* Table Header Controls */}
                          <div className="bg-slate-50 px-3.5 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                              <Database className="w-3.5 h-3.5 text-indigo-600" />
                              <span>
                                Result Set ({msg.values.length} {msg.values.length === 1 ? "row" : "rows"})
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {/* Search within table */}
                              {msg.values.length > 5 && (
                                <div className="relative">
                                  <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                                  <input
                                    type="text"
                                    placeholder="Filter rows..."
                                    value={search}
                                    onChange={(e) => {
                                      setTableSearch((prev) => ({ ...prev, [msg.id]: e.target.value }));
                                      setTablePage((prev) => ({ ...prev, [msg.id]: 1 }));
                                    }}
                                    className="text-xs pl-6 pr-2 py-1 bg-white border border-slate-200 rounded-md focus:outline-hidden focus:border-indigo-500 w-28 sm:w-36 text-slate-800 placeholder:text-slate-400"
                                  />
                                </div>
                              )}
                              {/* Export CSV Button */}
                              <button
                                onClick={() => exportTableCSV(msg)}
                                title="Export table as CSV"
                                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-md transition-all cursor-pointer font-medium shadow-2xs"
                              >
                                <Download className="w-3 h-3 text-slate-500" />
                                <span className="hidden sm:inline">CSV</span>
                              </button>
                            </div>
                          </div>

                          {/* Scrollable Table */}
                          <div className="overflow-x-auto max-h-72">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-slate-100/70 border-b border-slate-200">
                                  {msg.columns.map((col, idx) => (
                                    <th
                                      key={idx}
                                      className="px-3.5 py-2 font-semibold text-slate-800 whitespace-nowrap"
                                    >
                                      {col.replace(/_/g, " ").replace(/"/g, "")}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {paginatedRows.map((row, rIdx) => (
                                  <tr key={rIdx} className="hover:bg-slate-50/80 transition-colors">
                                    {row.map((cell, cIdx) => {
                                      const colName = msg.columns![cIdx] || "";
                                      const isAmountCol =
                                        colName.toLowerCase().includes("amount") ||
                                        colName.toLowerCase().includes("total") ||
                                        colName.toLowerCase().includes("spent");
                                      const cellVal = cell;
                                      return (
                                        <td
                                          key={cIdx}
                                          className={`px-3.5 py-2 text-slate-700 whitespace-nowrap ${
                                            isAmountCol && typeof cellVal === "number" ? "font-semibold text-slate-900" : ""
                                          }`}
                                        >
                                          {isAmountCol && typeof cellVal === "number"
                                            ? formatCurrency(cellVal)
                                            : String(cellVal ?? "")}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Table Pagination Footer */}
                          {displayValues.length > rowsPerPage && (
                            <div className="px-3.5 py-2 bg-slate-50/70 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                              <div>
                                Showing {(page - 1) * rowsPerPage + 1} -{" "}
                                {Math.min(page * rowsPerPage, displayValues.length)} of {displayValues.length}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  disabled={page <= 1}
                                  onClick={() => setTablePage((prev) => ({ ...prev, [msg.id]: page - 1 }))}
                                  className="px-2.5 py-0.5 rounded border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50 text-slate-700 cursor-pointer shadow-2xs text-[11px]"
                                >
                                  Prev
                                </button>
                                <span className="px-1 text-slate-800 font-medium text-[11px]">
                                  {page}/{totalPages}
                                </span>
                                <button
                                  disabled={page >= totalPages}
                                  onClick={() => setTablePage((prev) => ({ ...prev, [msg.id]: page + 1 }))}
                                  className="px-2.5 py-0.5 rounded border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50 text-slate-700 cursor-pointer shadow-2xs text-[11px]"
                                >
                                  Next
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Expandable Show Generated SQL Drawer */}
                      {msg.sql && (
                        <div className="pt-1">
                          <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-100/50">
                            <button
                              onClick={() => toggleSql(msg.id)}
                              className="w-full px-3.5 py-2 flex items-center justify-between text-xs font-medium text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
                            >
                              <div className="flex items-center gap-1.5">
                                <Database className="w-3.5 h-3.5 text-indigo-600" />
                                <span className="font-semibold text-slate-800">Generated SQL Query</span>
                              </div>
                              <div className="flex items-center gap-1 text-slate-500">
                                <span>{isExpanded ? "Collapse" : "Expand"}</span>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="p-3.5 bg-slate-950 text-slate-100 text-xs font-mono border-t border-slate-800 overflow-x-auto relative">
                                <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-slate-800 text-[11px] text-slate-400">
                                  <span>In-Memory Table: `expense_actuals`</span>
                                  <button
                                    onClick={() => copyToClipboard(msg.sql!, msg.id)}
                                    className="flex items-center gap-1 px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] transition-all cursor-pointer"
                                  >
                                    {copiedSqlId === msg.id ? (
                                      <>
                                        <Check className="w-3 h-3 text-emerald-400" />
                                        <span>Copied</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3" />
                                        <span>Copy SQL</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                                <pre className="whitespace-pre-wrap leading-relaxed text-slate-200">{msg.sql}</pre>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Micro Timestamp / Role Subtitle */}
                <div className={`text-[10px] font-medium text-slate-400 ${isUser ? "text-right mr-1" : "ml-1"}`}>
                  {isUser ? "USER" : "SYSTEM BOT"} • {msg.timestamp || "JUST NOW"}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading Assistant Animation */}
        {isLoading && (
          <div className="flex items-start gap-3.5 justify-start max-w-[85%]">
            <div className="w-8 h-8 rounded-lg bg-slate-100 shrink-0 flex items-center justify-center border border-slate-200 animate-pulse">
              <Sparkles className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-3xl rounded-tl-none p-4 shadow-xs text-slate-700">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600 mb-2">
                <span>Generating SQL query and calculating aggregation...</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <div className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Sticky Chat Input Bar */}
      <div className="pt-3 border-t border-slate-100 bg-white">
        <form onSubmit={handleSubmit} className="relative flex items-center max-w-4xl mx-auto w-full">
          {messages.length > 1 && (
            <button
              type="button"
              onClick={onClearChat}
              title="Clear conversation history"
              className="mr-2 p-3.5 rounded-2xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 border border-slate-200 shrink-0 cursor-pointer transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          <div className="relative flex-1">
            <input
              ref={inputRef}
              id="chat-input"
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Query 2025 Puja transactions or ask financial questions..."
              disabled={isLoading}
              className="w-full pl-5 pr-28 py-3.5 bg-slate-100/60 border border-slate-200 rounded-2xl focus:outline-hidden focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 text-sm text-slate-900 placeholder:text-slate-400 transition-all"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              <button
                id="send-chat-btn"
                type="submit"
                disabled={!inputQuery.trim() || isLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-indigo-200/50 flex items-center gap-1.5 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </div>
          </div>
        </form>

        <div className="mt-3 flex justify-center">
          <div className="flex items-center gap-3 text-[10px] text-slate-400 uppercase tracking-widest">
            <span>Read-Only SQLite Engine</span>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <span>444 Transactions</span>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <span>Sheet Live Sync</span>
          </div>
        </div>
      </div>
    </div>
  );
};
