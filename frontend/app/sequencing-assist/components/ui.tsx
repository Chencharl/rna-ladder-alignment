// Small shared UI primitives, styled to match the existing app's
// StatCard/card/badge conventions (see app/page.tsx).

import { confidenceColor, humanLadderLabel, ladderCallColor, peakStatusColor, PEAK_STATUS_LABEL } from "../lib/labels";

export function Card({
  title,
  subtitle,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 ${className}`}>
      {title && <h2 className="text-lg font-bold text-gray-900">{title}</h2>}
      {subtitle && <p className="mt-1 text-sm text-gray-500 mb-4">{subtitle}</p>}
      {!subtitle && title && <div className="mb-4" />}
      {children}
    </div>
  );
}

export function StatCard({ label, value, colour }: { label: string; value: number | string; colour: string }) {
  return (
    <div className={`rounded-lg border p-3 text-center ${colour}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

export function LadderChip({ call, size = "md" }: { call: string | null | undefined; size?: "sm" | "md" }) {
  const label = humanLadderLabel(call);
  const pad = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm";
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${pad} ${ladderCallColor(call)}`}>
      {label}
    </span>
  );
}

export function PeakStatusChip({ status, size = "md" }: { status: string | null | undefined; size?: "sm" | "md" }) {
  const pad = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm";
  const label = status ? PEAK_STATUS_LABEL[status] ?? status : "—";
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${pad} ${peakStatusColor(status)}`}>
      {label}
    </span>
  );
}

export function ConfidenceChip({ tier }: { tier: string | null | undefined }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${confidenceColor(tier)}`}>
      {tier || "—"}
    </span>
  );
}

export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium mb-4">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`flex-1 py-2 px-3 transition-colors ${
            active === t.id ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {t.label}
          {typeof t.count === "number" && (
            <span className={`ml-1.5 ${active === t.id ? "text-blue-100" : "text-gray-400"}`}>({t.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
      >
        Previous
      </button>
      <span>
        Page {page} of {pageCount}
      </span>
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
      >
        Next
      </button>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
      {children}
    </div>
  );
}

export function fmt(n: number | null | undefined, digits = 3): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}

export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return String(Math.round(n));
}
