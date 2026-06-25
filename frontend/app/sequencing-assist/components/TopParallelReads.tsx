import { useMemo } from "react";
import type { TopParallelRow } from "../lib/types";
import { Card, ConfidenceChip, EmptyState, LadderChip, PeakStatusChip, fmt } from "./ui";

export function TopParallelReads({
  rows,
  selectedReadRank,
  onSelectRead,
}: {
  rows: TopParallelRow[] | null;
  selectedReadRank: number | null;
  onSelectRead: (rank: number) => void;
}) {
  const groups = useMemo(() => {
    if (!rows) return [];
    const byRank = new Map<number, TopParallelRow[]>();
    for (const r of rows) {
      const list = byRank.get(r.read_rank) ?? [];
      list.push(r);
      byRank.set(r.read_rank, list);
    }
    return Array.from(byRank.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([rank, rs]) => ({ rank, rows: rs.sort((a, b) => a.row_position - b.row_position) }));
  }, [rows]);

  return (
    <Card
      title="Top Parallel Reads"
      subtitle="The most important panel: the highest-ranked reads recovered by the algorithm. Start here."
    >
      {groups.length === 0 ? (
        <EmptyState>Upload top_parallel_reads_long.csv to see the top reads.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map((g) => {
            const head = g.rows[0];
            const selected = selectedReadRank === g.rank;
            return (
              <div
                key={g.rank}
                className={`rounded-lg border p-3 ${
                  selected ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-800">Read #{g.rank}</span>
                    <LadderChip call={head.ladder_call} size="sm" />
                    <ConfidenceChip tier={head.confidence_tier} />
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectRead(g.rank)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    Inspect evidence &rarr;
                  </button>
                </div>

                {head.candidate_partner_rank != null && (
                  <p className="text-xs text-gray-500 mb-2">
                    Candidate partner: Read #{head.candidate_partner_rank}
                  </p>
                )}

                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 text-left">
                      <th className="py-1 pr-2 font-medium">#</th>
                      <th className="py-1 pr-2 font-medium">Mass</th>
                      <th className="py-1 pr-2 font-medium">Rel.I</th>
                      <th className="py-1 pr-2 font-medium">RT</th>
                      <th className="py-1 pr-2 font-medium">Call</th>
                      <th className="py-1 font-medium">Peak status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-1 pr-2 text-gray-400">{r.row_position}</td>
                        <td className="py-1 pr-2 tabular-nums">{fmt(r.mass, 2)}</td>
                        <td className="py-1 pr-2 tabular-nums">{fmt(r.rel_i, 3)}</td>
                        <td className="py-1 pr-2 tabular-nums">{fmt(r.rt, 2)}</td>
                        <td className="py-1 pr-2">{r.call}</td>
                        <td className="py-1">
                          <PeakStatusChip status={r.peak_status || null} size="sm" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {(head.evidence_short || head.warning_short) && (
                  <div className="mt-2 space-y-1">
                    {head.evidence_short && (
                      <p className="text-xs text-gray-600">
                        <span className="font-semibold text-gray-500">Evidence: </span>
                        {head.evidence_short}
                      </p>
                    )}
                    {head.warning_short && (
                      <p className="text-xs text-amber-600">
                        <span className="font-semibold">Warning: </span>
                        {head.warning_short}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
