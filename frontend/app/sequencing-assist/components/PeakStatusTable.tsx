import { useMemo, useState } from "react";
import type { PeakStatus, PeakStatusRow } from "../lib/types";
import { PEAK_STATUS_LABEL } from "../lib/labels";
import { Card, EmptyState, LadderChip, Pagination, PeakStatusChip, fmt } from "./ui";

const PAGE_SIZE = 50;
const ALL_STATUSES: PeakStatus[] = [
  "primary_used",
  "ambiguous_retained",
  "conflict_retained",
  "reference_reused",
  "unused",
];

export function PeakStatusTable({
  rows,
  onSelectRead,
}: {
  rows: PeakStatusRow[] | null;
  onSelectRead: (rank: number) => void;
}) {
  const [activeStatuses, setActiveStatuses] = useState<Set<PeakStatus>>(new Set(ALL_STATUSES));
  const [readFilter, setReadFilter] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const rankFilter = readFilter.trim() === "" ? null : Number(readFilter.trim());
    return rows.filter((r) => {
      if (!activeStatuses.has(r.peak_status)) return false;
      if (rankFilter != null && !Number.isNaN(rankFilter) && r.read_rank !== rankFilter) return false;
      return true;
    });
  }, [rows, activeStatuses, readFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleStatus(s: PeakStatus) {
    setPage(1);
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  return (
    <Card title="Peak Status" subtitle="Every peak in the run and how it was used.">
      {!rows ? (
        <EmptyState>Upload Peak_Status.csv to inspect peak-level usage.</EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {ALL_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className={`text-xs rounded-full px-2.5 py-1 font-medium border transition-opacity ${
                  activeStatuses.has(s) ? "opacity-100" : "opacity-30"
                } ${statusButtonColor(s)}`}
              >
                {PEAK_STATUS_LABEL[s]}
              </button>
            ))}
            <input
              type="text"
              inputMode="numeric"
              placeholder="Filter by read #"
              value={readFilter}
              onChange={(e) => {
                setReadFilter(e.target.value);
                setPage(1);
              }}
              className="ml-auto w-36 rounded-lg border border-gray-200 px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {filtered.length === 0 ? (
            <EmptyState>No peaks match the current filters.</EmptyState>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 text-xs">
                      <th className="py-1.5 pr-3 font-medium">Mass</th>
                      <th className="py-1.5 pr-3 font-medium">Rel. intensity</th>
                      <th className="py-1.5 pr-3 font-medium">RT</th>
                      <th className="py-1.5 pr-3 font-medium">Block</th>
                      <th className="py-1.5 pr-3 font-medium">Status</th>
                      <th className="py-1.5 pr-3 font-medium">Read</th>
                      <th className="py-1.5 pr-3 font-medium">Call</th>
                      <th className="py-1.5 font-medium">Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-1.5 pr-3 tabular-nums">{fmt(r.mass, 2)}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{fmt(r.rel_intensity, 3)}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{fmt(r.rt, 2)}</td>
                        <td className="py-1.5 pr-3 tabular-nums text-gray-500">{r.block}</td>
                        <td className="py-1.5 pr-3">
                          <PeakStatusChip status={r.peak_status} size="sm" />
                        </td>
                        <td className="py-1.5 pr-3">
                          {r.read_rank != null ? (
                            <button
                              type="button"
                              onClick={() => onSelectRead(r.read_rank as number)}
                              className="text-blue-600 hover:underline"
                            >
                              #{r.read_rank}
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-1.5 pr-3">
                          {r.ladder_call ? <LadderChip call={r.ladder_call} size="sm" /> : "—"}
                        </td>
                        <td className="py-1.5 text-gray-500">{r.role || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageCount={pageCount} onChange={setPage} />
            </>
          )}
        </>
      )}
    </Card>
  );
}

function statusButtonColor(s: PeakStatus): string {
  switch (s) {
    case "primary_used":
      return "border-green-300 bg-green-50 text-green-800";
    case "ambiguous_retained":
      return "border-yellow-300 bg-yellow-50 text-yellow-800";
    case "conflict_retained":
      return "border-red-300 bg-orange-50 text-orange-800";
    case "reference_reused":
      return "border-teal-300 bg-teal-50 text-teal-800";
    case "unused":
      return "border-gray-300 bg-gray-50 text-gray-500";
  }
}
