import type { UploadRawResponse } from "../lib/api";
import { Card } from "./ui";

export function QCPreview({
  data,
  onRunPipeline,
  pipelineRunning,
}: {
  data: UploadRawResponse;
  onRunPipeline: () => void;
  pipelineRunning: boolean;
}) {
  return (
    <Card title="QC Preview" subtitle="Backend-computed summary from the uploaded Excel file.">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4 text-sm">
        <Field label="File" value={data.filename} />
        <Field label="Total points" value={data.n_points.toLocaleString()} />
        <Field label="Blocks" value={String(data.n_blocks)} />
        <Field label="Mass range" value={`${data.mass_range[0].toFixed(1)} – ${data.mass_range[1].toFixed(1)} Da`} />
        <Field label="RT range" value={`${data.rt_range[0].toFixed(2)} – ${data.rt_range[1].toFixed(2)} min`} />
      </div>

      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
        First 5 parsed rows (M, I, T, block, Rel_I)
      </p>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-400">
              <th className="py-1 pr-3 font-medium">Mass (Da)</th>
              <th className="py-1 pr-3 font-medium">Intensity</th>
              <th className="py-1 pr-3 font-medium">RT (min)</th>
              <th className="py-1 pr-3 font-medium">Block</th>
              <th className="py-1 font-medium">Rel_I</th>
            </tr>
          </thead>
          <tbody>
            {data.preview_rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-1 pr-3 tabular-nums">{r.M.toFixed(4)}</td>
                <td className="py-1 pr-3 tabular-nums">{r.I.toFixed(1)}</td>
                <td className="py-1 pr-3 tabular-nums">{r.T.toFixed(4)}</td>
                <td className="py-1 pr-3 tabular-nums">{r.block}</td>
                <td className="py-1 tabular-nums">{r.Rel_I.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={onRunPipeline}
        disabled={pipelineRunning}
        className={`w-full rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
          pipelineRunning
            ? "bg-gray-200 text-gray-500 cursor-not-allowed"
            : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {pipelineRunning ? "Running pipeline..." : "Run Nested Ladder Pipeline"}
      </button>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-0.5 font-medium text-gray-800 truncate" title={value}>{value}</div>
    </div>
  );
}
