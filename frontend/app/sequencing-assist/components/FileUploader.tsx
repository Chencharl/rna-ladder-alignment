"use client";

import { useRef, useState } from "react";
import { SLOT_INFO, type FileSlot } from "../lib/parse";
import type { LoadedRun } from "../lib/types";

export function FileUploader({
  run,
  onFiles,
  unmatched,
}: {
  run: LoadedRun;
  onFiles: (files: File[]) => void;
  unmatched: string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const slots = Object.keys(SLOT_INFO) as FileSlot[];
  const haveAnyFile = Object.keys(run.files).length > 0;

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    onFiles(Array.from(fileList));
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
          dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400 bg-gray-50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".json,.csv"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <p className="text-sm font-medium text-gray-700">
          Drop the run's output files here, or click to choose
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Select the JSON/CSV files from the pipeline's output folder &mdash; you can select all of
          them at once, they're matched by filename automatically.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {slots.map((slot) => {
          const info = SLOT_INFO[slot];
          const loaded = !!run.files[slot];
          return (
            <div
              key={slot}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                loaded
                  ? "border-green-200 bg-green-50 text-green-800"
                  : info.required
                  ? "border-gray-200 bg-white text-gray-500"
                  : "border-gray-100 bg-gray-50 text-gray-400"
              }`}
            >
              <span className="truncate">
                {info.label}
                {info.required && !loaded && <span className="ml-1 text-red-400">*</span>}
              </span>
              <span className="ml-2 shrink-0 text-xs font-semibold">
                {loaded ? "Loaded" : info.required ? "Required" : "Optional"}
              </span>
            </div>
          );
        })}
      </div>

      {!haveAnyFile && (
        <p className="mt-3 text-xs text-gray-400">
          * Required for the core panels (Run Overview, Top Parallel Reads, Decision Table). The
          others unlock the Classification Evidence and Peak Status panels.
        </p>
      )}

      {unmatched.length > 0 && (
        <p className="mt-3 text-xs text-amber-600">
          Didn't recognize: {unmatched.join(", ")} &mdash; expected filenames like{" "}
          {Object.values(SLOT_INFO).map((s) => s.filename).join(", ")}.
        </p>
      )}
    </div>
  );
}
