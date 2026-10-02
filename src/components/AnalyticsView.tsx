import React from "react";
import { 
  BarChart3, 
  TrendingUp, 
  Layers, 
  Sparkles, 
  ArrowUpRight, 
  DollarSign, 
  PieChart as PieIcon,
  Tag
} from "lucide-react";
import { AppStatus } from "../types";

interface AnalyticsViewProps {
  status: AppStatus | null;
  onAskQuestion: (query: string) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  status,
  onAskQuestion,
}) => {
  const totalSpent = status?.totalSpent || 515771.79;
  const pujas = status?.pujas || [];
  const categories = status?.categories || [];

  const formatCurrency = (val: number): string => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
  };

  const getPujaColor = (name: string) => {
    if (name.includes("Durga")) return { bg: "bg-indigo-600", light: "bg-white", border: "border-slate-200", badge: "bg-indigo-50 text-indigo-800 border-indigo-200" };
    if (name.includes("Kali")) return { bg: "bg-slate-800", light: "bg-white", border: "border-slate-200", badge: "bg-slate-100 text-slate-800 border-slate-200" };
    if (name.includes("Saraswati")) return { bg: "bg-indigo-500", light: "bg-white", border: "border-slate-200", badge: "bg-slate-100 text-slate-700 border-slate-200" };
    return { bg: "bg-slate-700", light: "bg-white", border: "border-slate-200", badge: "bg-slate-100 text-slate-700 border-slate-200" };
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-semibold text-slate-900 tracking-tight">2025 Puja Expense Analytics</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Aggregated financial breakdown across all events, categories, and vendors from the official spreadsheet.
          </p>
        </div>
        <div className="bg-slate-900 text-white px-5 py-3 rounded-xl shadow-xs text-right">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total 2025 Spend</div>
          <div className="text-xl font-black tracking-tight">{formatCurrency(totalSpent)}</div>
        </div>
      </div>

      {/* Puja Event Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {pujas.map((p) => {
          const colors = getPujaColor(p.name);
          const percent = totalSpent > 0 ? ((p.total / totalSpent) * 100).toFixed(1) : "0";
          return (
            <div
              key={p.name}
              className={`${colors.light} border ${colors.border} rounded-2xl p-5 shadow-xs flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-base text-slate-900 flex items-center gap-1.5">
                    <span>{p.name}</span>
                  </span>
                  <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full font-bold border ${colors.badge}`}>
                    {percent}% of budget
                  </span>
                </div>

                <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-1">
                  {formatCurrency(p.total)}
                </div>

                <div className="text-xs text-slate-500 flex items-center gap-2 mb-4">
                  <span>{p.count} recorded transactions</span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mb-4 border border-slate-200">
                  <div
                    className={`${colors.bg} h-1.5 rounded-full transition-all duration-500`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>

              <button
                onClick={() => onAskQuestion(`Show complete breakdown of expenses for ${p.name}`)}
                className="w-full mt-2 py-2 px-3 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
              >
                <span>Explore {p.name} in Chat</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-indigo-600" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Category Breakdown Grid */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-base sm:text-lg text-slate-900">
              Expense by Category (Ranked)
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            {categories.length} Distinct Categories
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2">
          {categories.map((cat, idx) => {
            const pct = totalSpent > 0 ? (cat.total / totalSpent) * 100 : 0;
            return (
              <div
                key={cat.name}
                className="border border-slate-200 rounded-xl p-3.5 hover:border-slate-300 bg-slate-50/50 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-sm text-slate-900">{cat.name}</span>
                    </div>
                    <span className="font-bold text-sm text-slate-900">
                      {formatCurrency(cat.total)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                    <span>{cat.count} transactions</span>
                    <span>{pct.toFixed(1)}% of total</span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden mb-2">
                    <div
                      className="bg-indigo-600 h-1.5 rounded-full"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end pt-1">
                  <button
                    onClick={() => onAskQuestion(`Show details and sub-categories of ${cat.name} expenses`)}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>View {cat.name} details</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
