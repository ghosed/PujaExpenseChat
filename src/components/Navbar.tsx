import React from "react";
import { 
  Sparkles, 
  RotateCw, 
  ExternalLink, 
  Code2, 
  Table2, 
  MessageSquare, 
  BarChart3,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { AppStatus } from "../types";

interface NavbarProps {
  currentTab: "chat" | "explorer" | "analytics";
  setCurrentTab: (tab: "chat" | "explorer" | "analytics") => void;
  status: AppStatus | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenCodeModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  status,
  isRefreshing,
  onRefresh,
  onOpenCodeModal,
}) => {
  return (
    <header className="border-b border-slate-100 bg-white/95 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-sm shadow-indigo-200">
              <span className="text-sm font-bold">P</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-base sm:text-lg text-slate-900 tracking-tight flex items-center gap-2">
                  Puja Expense Chatbot
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                    2025 Dataset
                  </span>
                </h1>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                AI-Powered Chatbot to Query Puja Transactions and Data Analytics
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/70">
            <button
              id="tab-chat-btn"
              onClick={() => setCurrentTab("chat")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                currentTab === "chat"
                  ? "bg-white text-slate-900 shadow-xs border border-slate-200/60 font-semibold"
                  : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
              }`}
            >
              <MessageSquare className={`w-3.5 h-3.5 ${currentTab === "chat" ? "text-indigo-600" : "text-slate-400"}`} />
              <span>AI Chat</span>
            </button>
            <button
              id="tab-explorer-btn"
              onClick={() => setCurrentTab("explorer")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                currentTab === "explorer"
                  ? "bg-white text-slate-900 shadow-xs border border-slate-200/60 font-semibold"
                  : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
              }`}
            >
              <Table2 className={`w-3.5 h-3.5 ${currentTab === "explorer" ? "text-indigo-600" : "text-slate-400"}`} />
              <span>Data Explorer</span>
            </button>
            <button
              id="tab-analytics-btn"
              onClick={() => setCurrentTab("analytics")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                currentTab === "analytics"
                  ? "bg-white text-slate-900 shadow-xs border border-slate-200/60 font-semibold"
                  : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
              }`}
            >
              <BarChart3 className={`w-3.5 h-3.5 ${currentTab === "analytics" ? "text-indigo-600" : "text-slate-400"}`} />
              <span>Analytics</span>
            </button>
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Live Sheet Status Badge */}
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-slate-50 text-slate-700 border border-slate-200">
              {status?.status === "ready" ? (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  <span className="font-medium text-[11px] text-slate-600">
                    Live ({status.rowCount} rows)
                  </span>
                </>
              ) : status?.status === "initializing" ? (
                <>
                  <RotateCw className="w-3 h-3 text-indigo-600 animate-spin" />
                  <span className="font-medium text-[11px]">Connecting...</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3 h-3 text-rose-600" />
                  <span className="font-medium text-[11px] text-rose-600">Sync Error</span>
                </>
              )}
            </div>

            {/* Refresh Google Sheet Button */}
            <button
              id="refresh-sheet-btn"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Re-fetch latest data from Google Sheet"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
            >
              <RotateCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? "animate-spin" : ""}`} />
              <span className="hidden md:inline">{isRefreshing ? "Syncing..." : "Sync Sheet"}</span>
            </button>

            {/* View Source Google Sheet Link */}
            <a
              id="view-sheet-link"
              href="https://docs.google.com/spreadsheets/d/1MDPNMswRlmoEh5z4sJdS_8hQZQeFbTwxxQH6cMicqw0/edit?usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
              title="Open Google Spreadsheet"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-xs transition-all"
            >
              <span className="hidden sm:inline">Google Sheet</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>

            {/* Code / Artifacts Modal Button */}
            <button
              id="view-code-btn"
              onClick={onOpenCodeModal}
              title="View Python app.py, requirements.txt & Google Apps Script"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition-all cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Code Artifacts</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
