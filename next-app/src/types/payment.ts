export type PaymentStatus = "Completed" | "Pending Approval" | "In Review";

export interface Payment {
  id: string;
  workspaceId: string;
  workspaceTitle: string;
  clientName: string;
  amount: number;
  fee: number;
  netAmount: number;
  /** ISO date, or null when the payment has not settled yet ("Pending"). */
  date: string | null;
  status: PaymentStatus;
  paymentMethod: string;
}
