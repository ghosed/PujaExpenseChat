import React, { useState, useEffect } from "react";
import { Navbar } from "./components/Navbar";
import { ChatView } from "./components/ChatView";
import { DataExplorer } from "./components/DataExplorer";
import { AnalyticsView } from "./components/AnalyticsView";
import { CodeModal } from "./components/CodeModal";
import { AppStatus, ChatMessage } from "./types";

export default function App() {
  const [currentTab, setCurrentTab] = useState<"chat" | "explorer" | "analytics">("chat");
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Initial Chat Welcome Message
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome-msg",
      role: "assistant",
      content:
        "Namaskar! 🙏 I am your 2025 Puja Expense Assistant. Ask me anything about Durga Puja, Kali Puja, Saraswati Puja expenses, vendor payments, or category breakdowns from last year's records.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  // Fetch status on load
  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error("Error fetching system status:", err);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Refresh Google Sheet Data
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showToast(`✅ Synced! Loaded ${data.rowCount} transactions from Google Sheets.`);
        fetchStatus();
      } else {
        showToast(`❌ Sync Error: ${data.error || "Could not re-fetch sheet"}`);
      }
    } catch (err: any) {
      showToast(`❌ Network Error: ${err.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Send Chat Message to Gemini Text-to-SQL backend
  const handleSendMessage = async (queryText: string) => {
    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `asst-${Date.now()}`;

    const newUserMsg: ChatMessage = {
      id: userMsgId,
      role: "user",
      content: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, newUserMsg]);
    setIsLoading(true);

    try {
      // Build conversation history for multi-turn reasoning
      const historyPayload = messages
        .filter((m) => m.id !== "welcome-msg")
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: queryText,
          history: historyPayload,
        }),
      });

      const data = await res.json();

      const newAssistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: data.summary || data.error || "Retrieved expense information from the spreadsheet.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        reasoning: data.reasoning,
        sql: data.sql,
        columns: data.columns,
        values: data.values,
        rowCount: data.rowCount,
        isSingleMetric: data.isSingleMetric,
        metricLabel: data.metricLabel,
        singleValue: data.singleValue,
        error: data.error,
      };

      setMessages((prev) => [...prev, newAssistantMsg]);
    } catch (err: any) {
      const errorAssistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: `I encountered an unexpected issue contacting the server: ${err.message}. Please check your connection and try again.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        error: err.message,
      };
      setMessages((prev) => [...prev, errorAssistantMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        content:
          "Conversation history cleared. 🙏 What would you like to explore next about the 2025 Puja expenses?",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const handleAskFromAnalytics = (query: string) => {
    setCurrentTab("chat");
    setTimeout(() => {
      handleSendMessage(query);
    }, 100);
  };

  return (
    <div className="min-h-screen bg-slate-50/40 text-slate-900 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl border border-slate-800 text-xs font-semibold animate-fade-in flex items-center gap-2">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Navigation Header */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        status={status}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        onOpenCodeModal={() => setIsCodeModalOpen(true)}
      />

      {/* Main Tab Content */}
      <main className="flex-1">
        {currentTab === "chat" && (
          <ChatView
            messages={messages}
            status={status}
            isLoading={isLoading}
            onSendMessage={handleSendMessage}
            onClearChat={handleClearChat}
          />
        )}

        {currentTab === "explorer" && (
          <DataExplorer
            status={status}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
          />
        )}

        {currentTab === "analytics" && (
          <AnalyticsView
            status={status}
            onAskQuestion={handleAskFromAnalytics}
          />
        )}
      </main>

      {/* Standalone Code & Setup Modal */}
      <CodeModal
        isOpen={isCodeModalOpen}
        onClose={() => setIsCodeModalOpen(false)}
      />
    </div>
  );
}
