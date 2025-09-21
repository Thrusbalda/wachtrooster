"use client";
import { useEffect, useMemo, useState } from "react";

// FTE options shown in the dropdown
const FTE_OPTIONS = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0];

export default function DoctorFTESelector({ doctors = [], onChange }) {
  // { [doctorId]: number }
  const [fteById, setFteById] = useState({});

  // Load saved selections once
  useEffect(() => {
    try {
      const raw = localStorage.getItem("fteById");
      if (raw) setFteById(JSON.parse(raw));
    } catch {}
  }, []);

  // Persist + notify parent whenever changed
  useEffect(() => {
    try {
      localStorage.setItem("fteById", JSON.stringify(fteById));
    } catch {}
    onChange?.(fteById);
  }, [fteById, onChange]);

  // Compute total FTE for quick feedback
  const totalFTE = useMemo(
    () =>
      doctors.reduce(
        (sum, d) => sum + (Number(fteById[d.id] ?? d.fte ?? 1) || 0),
        0
      ),
    [doctors, fteById]
  );

  return (
    <div className="space-y-3">
      {/* Header row (no big title to avoid duplication with your <summary/>) */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Beschikbaarheid (FTE)</h3>
        <div className="text-sm text-slate-600">
          Totaal: <span className="font-medium">{totalFTE.toFixed(1)}</span> FTE
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {doctors.map((doc) => {
          const current = fteById[doc.id] ?? doc.fte ?? 1;

          return (
            <label
              key={doc.id}
              className="block rounded-xl border bg-white p-3 shadow-sm"
            >
              {/* Name + role */}
              <div className="min-w-0 mb-2">
                <div className="font-medium leading-tight truncate">
                  {doc.name}
                </div>
                <div className="text-xs text-slate-500">
                  {doc.role ?? "Arts"}
                </div>
              </div>

              {/* Full-width select underneath (stacked layout = no overflow) */}
              <select
                className="w-full rounded-md border px-2 py-1 text-sm"
                value={current}
                onChange={(e) =>
                  setFteById((prev) => ({
                    ...prev,
                    [doc.id]: Number(e.target.value),
                  }))
                }
              >
                {FTE_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v === 0 ? "0 (niet beschikbaar)" : v.toFixed(1)}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}
