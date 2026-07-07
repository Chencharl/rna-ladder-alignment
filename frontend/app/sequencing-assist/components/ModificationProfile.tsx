"use client";

import { useMemo } from "react";
import type { ModCount } from "../lib/api";
import { Card, EmptyState } from "./ui";

// Colour categories for the stacked frequency bar
function ntColor(nt: string, isUnknown: boolean): string {
  if (isUnknown) return "#9ca3af";          // gray — unresolved
  if (["A", "U", "G", "C"].includes(nt)) return "#93c5fd"; // light blue — canonical
  // Modification colours by nucleoside base
  if (nt.includes("A") || nt.includes("I") || nt.includes("i6") || nt.includes("t6") || nt.includes("ms2") || nt === "Ar(p)" || nt === "yW" || nt === "o2yW") return "#fca5a5";   // red family — A-derived
  if (nt.includes("G") || nt.includes("Q") || nt === "archaeosine") return "#6ee7b7";  // green — G-derived
  if (nt.includes("U") || nt === "D" || nt.includes("s2U") || nt.includes("mo5") || nt.includes("mnm") || nt.includes("ncm") || nt.includes("mcm") || nt.includes("cmo") || nt.includes("cmnm") || nt.includes("acp") || nt.includes("tm5")) return "#fde68a"; // yellow — U-derived
  return "#c4b5fd"; // purple — C-derived or other
}

export function ModificationProfile({ counts }: { counts: ModCount[] | null }) {
  const { modified, canonical, total, topMods } = useMemo(() => {
    if (!counts || counts.length === 0) return { modified: 0, canonical: 0, total: 0, topMods: [] };
    const canonical = counts.filter((c) => c.is_canonical).reduce((s, c) => s + c.count, 0);
    const modified = counts.filter((c) => !c.is_canonical && !c.is_unknown).reduce((s, c) => s + c.count, 0);
    const total = counts.reduce((s, c) => s + c.count, 0);
    const topMods = counts
      .filter((c) => !c.is_canonical && !c.is_unknown)
      .slice(0, 12);
    return { modified, canonical, total, topMods };
  }, [counts]);

  if (!counts || counts.length === 0) {
    return (
      <Card title="Decoded Modification Profile" subtitle="Run analysis to see modification frequency across candidate reads.">
        <EmptyState>No modification data available.</EmptyState>
      </Card>
    );
  }

  const modPct = total > 0 ? (modified / total * 100).toFixed(1) : "0";
  const canonPct = total > 0 ? (canonical / total * 100).toFixed(1) : "0";
  const maxCount = topMods.length > 0 ? topMods[0].count : 1;

  return (
    <Card
      title="Decoded Modification Profile"
      subtitle={`${total.toLocaleString()} positions decoded across all candidate reads: ${modPct}% modified, ${canonPct}% canonical (A/U/G/C). Isobaric pairs shown with slash notation — orthogonal validation needed to resolve identity.`}
    >
      {/* ── Stacked proportion bar ── */}
      <div className="mb-4">
        <div className="flex rounded-full overflow-hidden h-4 w-full">
          {total > 0 && (
            <>
              <div
                style={{ width: `${canonical / total * 100}%` }}
                className="bg-blue-300"
                title={`Canonical (A/U/G/C): ${canonical.toLocaleString()} positions (${canonPct}%)`}
              />
              <div
                style={{ width: `${modified / total * 100}%` }}
                className="bg-amber-400"
                title={`Modified: ${modified.toLocaleString()} positions (${modPct}%)`}
              />
              {total - canonical - modified > 0 && (
                <div
                  style={{ width: `${(total - canonical - modified) / total * 100}%` }}
                  className="bg-gray-300"
                  title="Unresolved mass deltas"
                />
              )}
            </>
          )}
        </div>
        <div className="flex gap-4 mt-1.5 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-300 inline-block" />
            Canonical ({canonPct}%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            Modified ({modPct}%)
          </span>
          {total - canonical - modified > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" />
              Unresolved ({((total - canonical - modified) / total * 100).toFixed(1)}%)
            </span>
          )}
        </div>
      </div>

      {/* ── Top modifications horizontal bars ── */}
      {topMods.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Top modifications (by position count)
          </p>
          {topMods.map((m) => (
            <div key={m.nt} className="flex items-center gap-2">
              <div className="w-24 shrink-0 text-xs font-mono text-gray-700 truncate" title={m.nt}>
                {m.nt}
              </div>
              <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(m.count / maxCount) * 100}%`,
                    backgroundColor: ntColor(m.nt, m.is_unknown),
                  }}
                />
              </div>
              <div className="w-8 text-right text-xs tabular-nums text-gray-600">{m.count}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">
          No non-canonical modifications identified in reads ≥ minimum length. All positions decoded as canonical A/U/G/C.
        </p>
      )}

      <p className="text-xs text-gray-400 mt-3">
        Counts include every decoded position across all candidate reads above the minimum length threshold.
        A single tRNA modification site will be counted once per read that covers it.
      </p>
    </Card>
  );
}
