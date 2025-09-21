"use client";

const FTE_OPTIONS = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0];

export default function SingleDoctorFTESelector({
  doctor,
  role = "Algemeen",
  value = 1,
  onChange,
}) {
  if (!doctor) return null;
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2">
        <div className="text-sm text-slate-600">FTE voor</div>
        <div className="text-base font-semibold leading-tight">{doctor}</div>
        <div className="text-xs text-slate-500">{role}</div>
      </div>
      <select
        className="w-full rounded-md border px-2 py-1 text-sm"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {FTE_OPTIONS.map((v) => (
          <option key={v} value={v}>
            {v === 0 ? "0 (niet beschikbaar)" : v.toFixed(1)}
          </option>
        ))}
      </select>
    </div>
  );
}
