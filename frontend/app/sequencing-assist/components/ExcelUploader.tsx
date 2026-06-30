"use client";

import { useRef, useState } from "react";
import type { UploadRawResponse } from "../lib/api";
import { uploadRawExcel } from "../lib/api";

export function ExcelUploader({
  onUploaded,
}: {
  onUploaded: (result: UploadRawResponse) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".xlsx") && !file.name.toLowerCase().endsWith(".xls")) {
      setError("Please upload an Excel (.xlsx) file.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const result = await uploadRawExcel(file);
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

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400 bg-gray-50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <p className="text-sm font-medium text-gray-700">
          Drop a deconvoluted Excel file here, or click to choose
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Expects columns: Monoisotopic Mass, Sum Intensity, Apex RT (or similar names).
        </p>
      </div>

      {uploading && (
        <p className="mt-3 text-sm text-gray-500 animate-pulse">
          Uploading and parsing with Python backend...
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
