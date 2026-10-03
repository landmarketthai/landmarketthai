import type { VerificationDimension } from "@/lib/marketplace/verification";

const STATE_STYLE = {
  ok: { icon: "✓", className: "bg-emerald-50 text-emerald-800 border-emerald-100" },
  partial: { icon: "≈", className: "bg-amber-50 text-amber-900 border-amber-100" },
  missing: { icon: "–", className: "bg-slate-50 text-slate-500 border-slate-200" },
} as const;

export default function VerificationChecklist({ dimensions }: { dimensions: VerificationDimension[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {dimensions.map((dimension) => {
        const style = STATE_STYLE[dimension.state];
        return (
          <li key={dimension.key} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${style.className}`}>
            <span aria-hidden="true" className="mt-0.5 w-4 shrink-0 text-center font-black">{style.icon}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold opacity-70">{dimension.title}</div>
              <div className="text-sm font-semibold leading-snug">{dimension.label}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
