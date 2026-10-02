export interface PujaTransaction {
  id: number;
  Date: string;
  "Year - Puja": string;
  Year_Puja: string;
  Category: string;
  "Sub-Category": string;
  Sub_Category: string;
  Amount: number;
  Description: string;
}

export interface PujaStat {
  name: string;
  total: number;
  count: number;
}

export interface CategoryStat {
  name: string;
  total: number;
  count: number;
}

export interface AppStatus {
  status: "initializing" | "ready" | "error";
  sheetId: string;
  rowCount: number;
  totalSpent: number;
  pujas: PujaStat[];
  categories: CategoryStat[];
  lastFetchedTime: string | null;
  error?: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  reasoning?: string;
  sql?: string;
  columns?: string[];
  values?: any[][];
  rowCount?: number;
  isSingleMetric?: boolean;
  metricLabel?: string;
  singleValue?: any;
  error?: string | null;
}

export interface CodeArtifacts {
  appPy: string;
  requirementsTxt: string;
  codeGs: string;
  sheetId: string;
}
