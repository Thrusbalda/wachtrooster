"use client";
import { useEffect, useMemo, useState } from "react";

// Options shown in the dropdown
const FTE_OPTIONS = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0];

export default function DoctorFTESelector({ doctors = [], onChange }) {
  // Store chosen FTE per doctor id: { [id]: number }
  const [fteById, setFteById] = useState({});

  // Load saved choices once
  useEffect(() => {
    const raw = localStorage.getItem("fteById");
    if (raw) setFteById(JSON.parse(raw));
  }, []);

  // Save whenever it changes + notify parent
  useEffect(() => {
    localStorage.setItem("fteById", JSON.stringify(fteById));
    onChange?.(fteById);
  }, [fteById, onChange]);

  // Total FTE (just for display)
  const totalFTE = useMemo(
    () => doctors.reduce((sum, d) => sum + (Number(fteById[d.id] ?? d.fte ?? 1) || 0), 0),
    [doctors, fteById]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Beschikbaarheid (FTE)</h2>
        <div className="text-sm text-slate-600">
          Totaal: <span className="font-medium">{totalFTE.toFixed(1)}</span> FTE
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {doctors.map((doc) => {
          const current = fteById[doc.id] ?? doc.fte ?? 1;
          return (
            <label
  key={doc.id}
  className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl border bg-white p-3 shadow-sm"
>
  <div className="min-w-0">
    <div className="font-medium truncate">{doc.name}</div>
    <div className="text-xs text-slate-500">{doc.role ?? "Arts"}</div>
  </div>

  <select
    className="shrink-0 w-24 rounded-md border px-2 py-1 text-sm"
    value={current}
    onChange={(e) =>
      setFteById((prev) => ({ ...prev, [doc.id]: Number(e.target.value) }))
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
