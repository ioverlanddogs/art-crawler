import Link from 'next/link';

const links = ['dashboard', 'moderation', 'pipeline', 'data', 'discovery', 'config', 'system'];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
      <aside>
        <h3>Artio Admin</h3>
        <ul>
          {links.map((x) => (
            <li key={x}>
              <Link href={`/${x}`}>{x}</Link>
            </li>
          ))}
        </ul>
      </aside>
      <main>{children}</main>
    </div>
  );
}
