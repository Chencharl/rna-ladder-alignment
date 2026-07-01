"use client";

import { useRef, useState } from "react";
import type { UploadRawResponse, AnalyzeResponse } from "../lib/api";
import { uploadRawExcel, analyzeFile, IS_VERCEL_MODE } from "../lib/api";

interface Props {
  onUploaded: (result: UploadRawResponse) => void;
  onAnalyzed?: (result: AnalyzeResponse) => void;
  referenceSequence?: string;
}

export function ExcelUploader({ onUploaded, onAnalyzed, referenceSequence = "" }: Props) {
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
    const sizeMB = file.size / (1024 * 1024);
    setUploading(true);
    setError(null);

    if (IS_VERCEL_MODE && onAnalyzed) {
      setSizeNote(
        sizeMB > 5
          ? `Large file (${sizeMB.toFixed(1)} MB) — running full analysis pipeline... This may take 20–60 s.`
          : "Uploading and running full sequencing pipeline..."
      );
      try {
        const result = await analyzeFile(file, referenceSequence);
        setSizeNote(null);
        onAnalyzed(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setUploading(false);
      }
    } else {
      setSizeNote(
        sizeMB > 5
          ? `Large file (${sizeMB.toFixed(1)} MB) — the backend will auto-subsample dense data. This may take 20–40 s.`
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
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    handleFile(fileList[0]);
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
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={(e) => handleFiles(e.target.files)} disabled={uploading} />
        <p className="text-sm font-medium text-gray-700">
          {uploading ? "Processing..." : "Drop a deconvoluted Excel file here, or click to choose"}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Expects columns: Monoisotopic Mass, Sum Intensity, Apex RT (or similar names). Any file size.
        </p>
      </div>

      {sizeNote && (
        <p className="mt-3 text-sm text-blue-700 animate-pulse">{sizeNote}</p>
      )}
      {uploading && !sizeNote && (
        <p className="mt-3 text-sm text-gray-500 animate-pulse">
          {IS_VERCEL_MODE ? "Running pipeline on Vercel..." : "Uploading and parsing with Python backend..."}
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
