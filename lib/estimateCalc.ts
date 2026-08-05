// Shared Total / Paid / Balance Due calculation, extracted 2026-08-05 for
// the Portfolio Tab feature (see "Portfolio Tab - Implementation Plan.md",
// Obsidian vault Current Implement/). Previously this math lived only
// inline in app/dashboard/page.tsx's estimateSummary/paymentsSummary
// useMemo blocks, computed client-side per record once that record's
// Estimate tab was opened. The Portfolio tab needs the exact same math
// computed server-side, in bulk, across every record a user can access --
// if the two implementations drift even slightly, a record's Portfolio
// total would disagree with what that same record's own Estimate tab
// shows, which would undermine trust in both numbers at once. This file
// is the single source of truth for the formula; both the dashboard
// component and app/api/portfolio/summary/route.ts import it.
//
// Formula (unchanged from the original inline version):
// - approvalValue(a): sum of line_items[].line_total if present, else
//   cost_delta.
// - approvedTotal: sum of approvalValue(a) over every approval with
//   status === "approved" (baseline + approved change orders).
// - totalWithTax: approvedTotal, plus tax if the record has a tax_rate set
//   (rounded to cents same as the original).
// - balanceDue: totalWithTax minus the sum of logged payments. Never
//   recomputes totalWithTax based on payments -- the gross contract value
//   never moves, per the confirmed Payments design decision.

export type LineItemForCalc = {
  line_total?: number | string | null;
};

export type ApprovalForCalc = {
  status?: string | null;
  is_baseline?: boolean | null;
  line_items?: LineItemForCalc[] | null;
  cost_delta?: number | string | null;
};

export function approvalValue(a: ApprovalForCalc): number {
  if (Array.isArray(a.line_items) && a.line_items.length > 0) {
    return a.line_items.reduce(
      (sum, li) => sum + (Number(li.line_total) || 0),
      0
    );
  }
  return Number(a.cost_delta) || 0;
}

export function computeApprovedTotal(approvals: ApprovalForCalc[]): number {
  return approvals.reduce((sum, a) => {
    if (a.status !== "approved") return sum;
    return sum + approvalValue(a);
  }, 0);
}

export function computeTaxAndTotal(
  approvedTotal: number,
  taxRate: number | null | undefined
): { taxAmount: number; totalWithTax: number } {
  const rate = taxRate ?? null;
  const taxAmount =
    rate != null ? Math.round(approvedTotal * (rate / 100) * 100) / 100 : 0;
  return { taxAmount, totalWithTax: approvedTotal + taxAmount };
}

export function computeBalanceDue(
  totalWithTax: number,
  paidTotal: number
): number {
  return totalWithTax - paidTotal;
}

export function hasAnyBaseline(approvals: ApprovalForCalc[]): boolean {
  return approvals.some((a) => a.is_baseline);
}

/**
 * One-shot helper for the Portfolio summary route: given a project's
 * approvals (already filtered to non-archived, matching the dashboard's
 * default view) and its logged payments, computes the same
 * totalWithTax/paidTotal/balanceDue/hasBaseline a contractor would see on
 * that record's own Estimate tab.
 */
export function computeProjectFinancials(
  approvals: ApprovalForCalc[],
  payments: { amount?: number | string | null }[],
  taxRate: number | null | undefined
) {
  const approvedTotal = computeApprovedTotal(approvals);
  const { taxAmount, totalWithTax } = computeTaxAndTotal(approvedTotal, taxRate);
  const paidTotal = payments.reduce(
    (sum, p) => sum + (Number(p.amount) || 0),
    0
  );
  const balanceDue = computeBalanceDue(totalWithTax, paidTotal);

  return {
    approvedTotal,
    taxAmount,
    totalWithTax,
    paidTotal,
    balanceDue,
    hasBaseline: hasAnyBaseline(approvals),
  };
}
