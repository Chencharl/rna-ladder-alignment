import { useMemo } from "react";
import { SLOT_INFO, type FileSlot } from "../lib/parse";
import type { LoadedRun } from "../lib/types";
import { Card, EmptyState } from "./ui";

export function ExportPanel({ run }: { run: LoadedRun }) {
  const slots = Object.keys(SLOT_INFO) as FileSlot[];
  const loadedSlots = useMemo(() => slots.filter((s) => run.files[s]), [run.files, slots]);

  function download(file: File) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card title="Export" subtitle="Three formats, three purposes -- use whichever matches what you're doing next.">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-sm">
        <ExportKind
          title="Web dashboard"
          body="This page. Use it for sequencing interpretation -- deciding which reads to trust, spotting conflicts, understanding why a call was made."
        />
        <ExportKind
          title="Excel"
          body="Read_Summary_Review.xlsx, Top_Parallel_Reads.xlsx, Peak_Status.xlsx, Classification_Evidence.xlsx in the pipeline's output folder. Use these for detailed manual, row-by-row review."
        />
        <ExportKind
          title="CSV / JSON"
          body="The files you uploaded here, plus annotated_data.csv and base_calling_report.json. Use these for reproducible downstream analysis or scripting."
        />
      </div>

      {loadedSlots.length === 0 ? (
        <EmptyState>Upload files above to re-download them from here.</EmptyState>
      ) : (
        <div className="space-y-2">
          {loadedSlots.map((slot) => {
            const file = run.files[slot];
            return (
              <div key={slot} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <div className="truncate">
                  <span className="font-medium text-gray-800">{SLOT_INFO[slot].label}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    {file.name} &middot; {(file.size / 1024).toFixed(1)} KB
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => download(file)}
                  className="ml-3 shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-800"
                >
                  Download
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ExportKind({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="font-semibold text-gray-800 mb-1">{title}</div>
      <div className="text-xs text-gray-500">{body}</div>
    </div>
  );
}
