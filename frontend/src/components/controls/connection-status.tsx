interface ConnectionStatusProps {
  status: string;
  detail?: string | null;
}

export function ConnectionStatus({ status, detail }: ConnectionStatusProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
      {status}
      {detail ? <span className="text-emerald-900/75">{detail}</span> : null}
    </div>
  );
}
