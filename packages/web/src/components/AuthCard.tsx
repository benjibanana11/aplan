import type { ReactNode } from "react";

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-base font-bold text-white">
            A
          </div>
          <span className="text-xl font-semibold text-slate-900">Aplan</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="mb-6 text-center text-lg font-semibold text-slate-900">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}
