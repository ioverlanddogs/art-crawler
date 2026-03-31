import { getMissingDatabaseEnvVars } from '@/lib/runtime-env';

type AdminSetupRequiredProps = {
  title?: string;
  detail?: string;
};

export function AdminSetupRequired({
  title = 'Admin setup required',
  detail = 'Configure database environment variables to enable admin data views.'
}: AdminSetupRequiredProps) {
  const missingVars = getMissingDatabaseEnvVars();

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-900" role="status" aria-live="polite">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm">{detail}</p>
      {missingVars.length > 0 ? (
        <p className="mt-2 text-sm">
          Missing environment variables: <span className="font-mono">{missingVars.join(', ')}</span>
        </p>
      ) : null}
    </section>
  );
}
