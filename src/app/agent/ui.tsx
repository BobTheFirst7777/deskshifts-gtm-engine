/** Tiny, plain building blocks for the agent pages: easy for a browsing agent to read and fill. */

export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return (
    <div
      role="status"
      className={`mb-5 whitespace-pre-wrap rounded border px-4 py-3 ${err ? "border-red-400 bg-red-50 text-red-900" : "border-green-500 bg-green-50 text-green-900"}`}
    >
      <b>{err ? "Not saved: " : "Saved. "}</b>
      {err ?? msg}
    </div>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="mb-2 text-2xl font-bold">{children}</h1>;
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-8 text-lg font-bold">{children}</h2>;
}

export function Field({
  label,
  name,
  placeholder,
  required,
  textarea,
  defaultValue,
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  textarea?: boolean;
  defaultValue?: string | null;
}) {
  const cls = "mt-1 w-full rounded border border-zinc-400 px-2 py-1.5";
  return (
    <label className="mb-3 block">
      <span className="font-medium">
        {label}
        {required ? " *" : ""}
      </span>
      {textarea ? (
        <textarea name={name} placeholder={placeholder} required={required} defaultValue={defaultValue ?? undefined} rows={4} className={cls} />
      ) : (
        <input name={name} placeholder={placeholder} required={required} defaultValue={defaultValue ?? undefined} className={cls} />
      )}
    </label>
  );
}

export function Submit({ children, tone = "primary" }: { children: React.ReactNode; tone?: "primary" | "secondary" }) {
  return (
    <button
      type="submit"
      className={
        tone === "primary"
          ? "rounded bg-blue-700 px-4 py-2 font-semibold text-white"
          : "rounded border border-zinc-400 bg-white px-4 py-2 font-semibold text-zinc-800"
      }
    >
      {children}
    </button>
  );
}

export const shortId = (id: string) => `A-${id.slice(0, 8)}`;
