export type Workspace = {
  id: string;
  name: string;
  kind: "personal" | "org";
  auto_approve_limit: number | null;
  min_confidence: number | null;
};

export type Role = "admin" | "accountant" | "employee";

export type ReceiptItem = { name: string; qty?: number; amount: number; category?: string };

export type Receipt = {
  id: string;
  txn_date: string;
  vendor: string | null;
  category: string;
  amount: number;
  source: string;
  status: "approved" | "pending" | "needs_review" | "rejected" | string;
  review_reason: string | null;
  submitter_id: string;
  image_path: string | null;
  note?: string | null;
  edited_at?: string | null;
};

export type ExportRow = {
  txn_date: string;
  txn_time: string | null;
  vendor: string | null;
  category: string;
  amount: number;
  source: string;
  status: string;
  review_reason: string | null;
  ref_no: string | null;
  items: ReceiptItem[] | null;
  note: string | null;
};

export type LineLink = { line_user_id: string; created_at: string };
export type Invite = { code: string; role: string; expires_at: string };
export type LinkCode = { code: string; expires_at: string };

export type MailItem = {
  id: string;
  subject: string;
  from: string;
  ok: boolean;
  vendor: string | null;
  date: string;
  amount: number;
  currency: string;
  category: string;
  items: ReceiptItem[];
  ref: string | null;
  confidence: number;
};
