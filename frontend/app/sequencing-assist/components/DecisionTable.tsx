import { useMemo, useState } from "react";
import { isProblemCall } from "../lib/labels";
import type { DecisionRow, TopParallelRow } from "../lib/types";
import { Card, ConfidenceChip, EmptyState, LadderChip, Pagination, TabBar, fmt } from "./ui";

type TabId = "top" | "primary" | "problems" | "all";
const PAGE_SIZE = 25;

export function DecisionTable({
  decisions,
  topParallel,
  selectedReadRank,
  onSelectRead,
}: {
  decisions: DecisionRow[] | null;
  topParallel: TopParallelRow[] | null;
  selectedReadRank: number | null;
  onSelectRead: (rank: number) => void;
}) {
  const [tab, setTab] = useState<TabId>("top");
  const [page, setPage] = useState(1);

  const topRanks = useMemo(() => {
    if (!topParallel) return new Set<number>();
    return new Set(topParallel.map((r) => r.read_rank));
  }, [topParallel]);

  const buckets = useMemo(() => {
    if (!decisions) return { top: [], primary: [], problems: [], all: [] };
    const all = [...decisions].sort((a, b) => a.read_rank - b.read_rank);
    const top = all.filter((d) => topRanks.has(d.read_rank));
    const primary = all.filter((d) => d.suggested_action === "Use as primary sequencing evidence");
    const problems = all.filter((d) => isProblemCall(d.ladder_call));
    return { top, primary, problems, all };
  }, [decisions, topRanks]);

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "top", label: "Top Parallel", count: buckets.top.length },
    { id: "primary", label: "Primary Evidence", count: buckets.primary.length },
    { id: "problems", label: "Problems", count: buckets.problems.length },
    { id: "all", label: "All Reads", count: buckets.all.length },
  ];

  const rows = buckets[tab];
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function changeTab(t: TabId) {
    setTab(t);
    setPage(1);
  }

  return (
    <Card
      title="Sequencing Decision Table"
      subtitle="What to actually do with each read. Defaults to the reads that matter most -- not every row at once."
    >
      {!decisions ? (
        <EmptyState>Upload sequencing_decision_summary.csv to see suggested actions.</EmptyState>
      ) : (
        <>
          <TabBar tabs={tabs} active={tab} onChange={changeTab} />
          {rows.length === 0 ? (
            <EmptyState>No reads in this view.</EmptyState>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 text-xs">
                      <th className="py-1.5 pr-3 font-medium">Read</th>
                      <th className="py-1.5 pr-3 font-medium">Call</th>
                      <th className="py-1.5 pr-3 font-medium">Confidence</th>
                      <th className="py-1.5 pr-3 font-medium">Priority</th>
                      <th className="py-1.5 pr-3 font-medium">Length</th>
                      <th className="py-1.5 pr-3 font-medium">Mean Rel.I</th>
                      <th className="py-1.5 pr-3 font-medium">Partner</th>
                      <th className="py-1.5 font-medium">Suggested action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((d) => (
                      <tr
                        key={d.read_rank}
                        onClick={() => onSelectRead(d.read_rank)}
                        className={`border-t border-gray-100 cursor-pointer hover:bg-gray-50 ${
                          selectedReadRank === d.read_rank ? "bg-blue-50" : ""
                        }`}
                      >
                        <td className="py-1.5 pr-3 font-semibold text-gray-700">#{d.read_rank}</td>
                        <td className="py-1.5 pr-3">
                          <LadderChip call={d.ladder_call} size="sm" />
                        </td>
                        <td className="py-1.5 pr-3">
                          <ConfidenceChip tier={d.confidence_tier} />
                        </td>
                        <td className="py-1.5 pr-3 text-gray-600">{d.review_priority || "—"}</td>
                        <td className="py-1.5 pr-3 tabular-nums text-gray-600">{d.read_length ?? "—"}</td>
                        <td className="py-1.5 pr-3 tabular-nums text-gray-600">{fmt(d.mean_rel_i, 3)}</td>
                        <td className="py-1.5 pr-3 text-gray-600">
                          {d.candidate_partner_rank != null ? `#${d.candidate_partner_rank}` : "—"}
                        </td>
                        <td className="py-1.5 text-gray-700">{d.suggested_action}</td>
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
