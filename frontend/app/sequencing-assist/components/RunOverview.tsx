import type { BaseCallingReport } from "../lib/types";
import { Card, EmptyState, StatCard, fmt } from "./ui";

export function RunOverview({ report }: { report: BaseCallingReport | null }) {
  if (!report) {
    return (
      <Card title="Run Overview" subtitle="High-level summary of the base-calling run.">
        <EmptyState>Upload base_calling_report.json to see run-level stats.</EmptyState>
      </Card>
    );
  }

  const rc = report.read_call_counts;
  const ps = report.peak_status_counts;

  return (
    <Card title="Run Overview" subtitle="High-level summary of the base-calling run.">
      {report.top_parallel_warning && (
        <div className="mb-4 rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <strong>Heads up:</strong> most of the top parallel reads are ambiguous or in conflict.
          Treat the top-ranked reads with extra caution and check the Classification Evidence panel
          before trusting them.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 text-sm">
        <InfoCell label="File" value={report.file_name} />
        <InfoCell label="Runtime" value={`${fmt(report.runtime_seconds, 1)}s`} />
        <InfoCell label="Input peaks" value={String(report.n_points)} />
        <InfoCell label="Blocks" value={report.n_blocks != null ? String(report.n_blocks) : "—"} />
      </div>

      <InfoCell label="Recovered reads" value={String(report.n_chains)} className="mb-5" big />

      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
        Read calls (5′ / 3′ / ambiguous / conflict)
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="5′" value={rc?.["5prime"] ?? 0} colour="bg-blue-50 border-blue-200 text-blue-800" />
        <StatCard label="3′" value={rc?.["3prime"] ?? 0} colour="bg-purple-50 border-purple-200 text-purple-800" />
        <StatCard label="Ambiguous" value={rc?.ambiguous ?? 0} colour="bg-yellow-50 border-yellow-200 text-yellow-800" />
        <StatCard label="Conflict" value={rc?.conflict ?? 0} colour="bg-orange-50 border-red-200 text-orange-800" />
      </div>

      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Peak usage</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Primary used" value={ps?.primary_used ?? 0} colour="bg-green-50 border-green-200 text-green-800" />
        <StatCard label="Ambiguous" value={ps?.ambiguous_retained ?? 0} colour="bg-yellow-50 border-yellow-200 text-yellow-800" />
        <StatCard label="Conflict" value={ps?.conflict_retained ?? 0} colour="bg-orange-50 border-red-200 text-orange-800" />
        <StatCard label="Ref. reused" value={ps?.reference_reused ?? 0} colour="bg-teal-50 border-teal-200 text-teal-800" />
        <StatCard label="Unused" value={ps?.unused ?? 0} colour="bg-gray-50 border-gray-200 text-gray-500" />
      </div>
    </Card>
  );
}

function InfoCell({
  label,
  value,
  className = "",
  big = false,
}: {
  label: string;
  value: string;
  className?: string;
  big?: boolean;
}) {
  return (
    <div className={className}>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-0.5 truncate text-gray-800 ${big ? "text-xl font-bold" : "font-medium"}`} title={value}>
        {value}
      </div>
    </div>
  );
}
