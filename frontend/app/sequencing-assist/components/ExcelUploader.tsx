"use client";

import { useRef, useState } from "react";
import type { UploadRawResponse } from "../lib/api";
import { uploadRawExcel } from "../lib/api";

interface Props {
  // Two-phase local mode: upload immediately and return parsed result
  onUploaded: (result: UploadRawResponse) => void;
  // Vercel mode: just hand the File object back to parent; parent runs analysis
  onFileSelected?: (file: File) => void;
  // Controlled display: when set, shows "ready" state instead of drop zone
  currentFile?: File | null;
  // Parent signals analysis is in progress (disables change-file link)
  isRunning?: boolean;
}

export function ExcelUploader({ onUploaded, onFileSelected, currentFile, isRunning = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sizeNote, setSizeNote] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".xlsx") && !file.name.toLowerCase().endsWith(".xls")) {
      setError("Please upload an Excel (.xlsx) file.");
      return;
    }
    setError(null);

    if (onFileSelected) {
      // Vercel mode: just report the chosen file; parent controls running
      onFileSelected(file);
      return;
    }

    // Two-phase local mode: upload to backend immediately
    const sizeMB = file.size / (1024 * 1024);
    setUploading(true);
    setSizeNote(
      sizeMB > 5
        ? `Large file (${sizeMB.toFixed(1)} MB) — backend will auto-subsample. May take 20–40 s.`
        : null
    );
    try {
      const result = await uploadRawExcel(file);
      setSizeNote(null);
      onUploaded(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    handleFile(fileList[0]);
  }

  // Vercel mode "ready" state — file chosen, waiting for Run button
  if (currentFile && onFileSelected) {
    const sizeMB = (currentFile.size / (1024 * 1024)).toFixed(1);
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-sm font-semibold text-green-800">{currentFile.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{sizeMB} MB — ready to analyze</p>
          </div>
          {!isRunning && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Choose different file
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          uploading
            ? "border-blue-300 bg-blue-50 cursor-wait"
            : dragOver
            ? "border-blue-400 bg-blue-50 cursor-pointer"
            : "border-gray-300 hover:border-gray-400 bg-gray-50 cursor-pointer"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={uploading}
        />
        <p className="text-sm font-medium text-gray-700">
          {uploading ? "Uploading..." : "Drop a deconvoluted Excel file here, or click to choose"}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Expects columns: Monoisotopic Mass, Sum Intensity, Apex RT (or similar names). Any file size.
        </p>
      </div>
      {sizeNote && <p className="mt-3 text-sm text-blue-700 animate-pulse">{sizeNote}</p>}
      {uploading && !sizeNote && (
        <p className="mt-3 text-sm text-gray-500 animate-pulse">Uploading and parsing...</p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
