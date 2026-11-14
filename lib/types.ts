// Shared contract. Drafted by P1 directly from README §6 + §8 — P2 owns this file, edit freely.

export type Category = "elevator_access" | "broken_equipment" | "tech";
export type Priority = "low" | "medium" | "high" | "urgent";
export type Status = "open" | "assigned" | "resolved";

export interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  floors: string[];
}

export interface Issue {
  id: string;
  location_id: string;
  floor: string | null;
  category: Category;
  title: string;
  description: string | null;
  priority: Priority;
  status: Status;
  assigned_team: string | null;
  reporter_count: number;
  before_photo_path: string | null;
  after_photo_path: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

// POST /api/analyze
export interface AnalyzeRequest {
  imageBase64: string;
  mimeType: "image/jpeg";
  locationName: string;
  floor?: string;
  note?: string;
}
export interface AnalyzeResult {
  is_issue: boolean;
  category: Category;
  title: string;
  description: string;
  priority: Priority;
  confidence: number;
}

// POST /api/duplicates
export interface DuplicatesRequest {
  imageBase64: string;
  mimeType: "image/jpeg";
  locationId: string;
  category: string;
}
export interface DuplicateMatch {
  issue_id: string;
  same_issue: boolean;
  confidence: number;
  reason: string;
  title: string;
  reporter_count: number;
  photo_url: string;
}

// POST /api/reports
export interface NewIssueInput {
  locationId: string;
  floor?: string;
  category: Category;
  title: string;
  description?: string;
  priority: Priority;
}
export type ReportRequest = {
  imageBase64: string;
  note?: string;
  aiSuggestion?: object;
  aiUsed: boolean;
} & ({ existingIssueId: string } | { newIssue: NewIssueInput });
export interface ReportResponse {
  issueId: string;
  reporterCount: number;
}
