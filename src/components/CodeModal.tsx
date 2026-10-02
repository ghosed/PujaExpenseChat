import React, { useState, useEffect } from "react";
import { 
  X, 
  Copy, 
  Check, 
  FileCode, 
  FileText, 
  Webhook, 
  Terminal, 
  Download,
  BookOpen
} from "lucide-react";
import { CodeArtifacts } from "../types";

interface CodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CodeModal: React.FC<CodeModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<"appPy" | "requirements" | "appsScript" | "guide">("appPy");
  const [artifacts, setArtifacts] = useState<CodeArtifacts | null>(null);
  const [copiedTab, setCopiedTab] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !artifacts) {
      fetch("/api/code-artifacts")
        .then((r) => r.json())
        .then((data) => setArtifacts(data))
        .catch((e) => console.error("Error fetching code artifacts:", e));
    }
  }, [isOpen, artifacts]);

  if (!isOpen) return null;

  const copyCode = (text: string, tabName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTab(tabName);
    setTimeout(() => setCopiedTab(null), 2000);
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shadow-xs">
              <FileCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-slate-900">
                Python Streamlit & Google Apps Script Artifacts
              </h3>
              <p className="text-xs text-slate-500">
                Full standalone code files for local Python / Streamlit execution and Google Sheets Webhook sync.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-100/70 px-5 pt-3 border-b border-slate-200 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab("appPy")}
              className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "appPy"
                  ? "bg-white text-slate-900 border-t border-x border-slate-200 shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <FileCode className="w-3.5 h-3.5 text-indigo-600" />
              <span>app.py (Streamlit)</span>
            </button>
            <button
              onClick={() => setActiveTab("requirements")}
              className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "requirements"
                  ? "bg-white text-slate-900 border-t border-x border-slate-200 shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              <span>requirements.txt</span>
            </button>
            <button
              onClick={() => setActiveTab("appsScript")}
              className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "appsScript"
                  ? "bg-white text-slate-900 border-t border-x border-slate-200 shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <Webhook className="w-3.5 h-3.5 text-indigo-600" />
              <span>Code.gs (Apps Script)</span>
            </button>
            <button
              onClick={() => setActiveTab("guide")}
              className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "guide"
                  ? "bg-white text-slate-900 border-t border-x border-slate-200 shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
              <span>Setup Guide</span>
            </button>
          </div>

          {/* Quick Actions */}
          {activeTab !== "guide" && (
            <div className="flex items-center gap-2 pb-2">
              <button
                onClick={() => {
                  const content =
                    activeTab === "appPy"
                      ? artifacts?.appPy
                      : activeTab === "requirements"
                      ? artifacts?.requirementsTxt
                      : artifacts?.codeGs;
                  if (content) copyCode(content, activeTab);
                }}
                className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 shadow-2xs cursor-pointer transition-all"
              >
                {copiedTab === activeTab ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  if (activeTab === "appPy" && artifacts?.appPy) {
                    downloadFile(artifacts.appPy, "app.py");
                  } else if (activeTab === "requirements" && artifacts?.requirementsTxt) {
                    downloadFile(artifacts.requirementsTxt, "requirements.txt");
                  } else if (activeTab === "appsScript" && artifacts?.codeGs) {
                    downloadFile(artifacts.codeGs, "Code.gs");
                  }
                }}
                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center gap-1 shadow-2xs cursor-pointer transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            </div>
          )}
        </div>

        {/* Code / Content Area */}
        <div className="p-5 flex-1 overflow-y-auto bg-slate-950 text-slate-200 font-mono text-xs leading-relaxed border-t border-slate-800">
          {activeTab === "appPy" && (
            <pre className="whitespace-pre-wrap">{artifacts?.appPy || "Loading app.py..."}</pre>
          )}
          {activeTab === "requirements" && (
            <pre className="whitespace-pre-wrap">
              {artifacts?.requirementsTxt || "Loading requirements.txt..."}
            </pre>
          )}
          {activeTab === "appsScript" && (
            <pre className="whitespace-pre-wrap">{artifacts?.codeGs || "Loading Code.gs..."}</pre>
          )}
          {activeTab === "guide" && (
            <div className="space-y-4 font-sans text-xs sm:text-sm text-slate-200 leading-relaxed">
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-400" />
                  <span>Step 1: Running the Python Streamlit App Locally</span>
                </h4>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-300">
                  <li>Clone or place <code>app.py</code> and <code>requirements.txt</code> in a directory.</li>
                  <li>Install dependencies: <code>pip install -r requirements.txt</code></li>
                  <li>Set your API Key: <code>export GEMINI_API_KEY="your_api_key_here"</code></li>
                  <li>Run Streamlit: <code>streamlit run app.py</code></li>
                  <li>Open <code>http://localhost:8501</code> in your browser!</li>
                </ol>
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                  <Webhook className="w-4 h-4 text-indigo-400" />
                  <span>Step 2: Attaching Google Apps Script Webhook Sync</span>
                </h4>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-300">
                  <li>Open the 2025 Puja Expense Google Sheet.</li>
                  <li>Go to menu <strong>Extensions &gt; Apps Script</strong>.</li>
                  <li>Paste the contents of <code>Code.gs</code> into the script editor.</li>
                  <li>Update <code>WEBHOOK_URL</code> with your app URL ending in <code>/api/webhook/refresh</code>.</li>
                  <li>Click Save 💾. Whenever cells are edited, the script logs to the "Audit Log" sheet and notifies your chatbot to invalidate cache!</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span>Source Sheet ID: <code>1MDPNMswRlmoEh5z4sJdS_8hQZQeFbTwxxQH6cMicqw0</code></span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
