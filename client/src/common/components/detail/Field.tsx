/** A single label/value pair inside a section grid. Renders "—" when empty. */
export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-sm font-medium">{label}</span>
      <span className="break-words">{value ?? "—"}</span>
    </div>
  );
}
