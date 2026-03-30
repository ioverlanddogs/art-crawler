export type ScopePreviewRow = {
  id: string;
  title: string;
  source: string;
  confidenceBand: string;
  status: string;
  risk: string;
};

export function ScopePreviewTable({ rows }: { rows: ScopePreviewRow[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Candidate</th>
            <th>Platform</th>
            <th>Confidence</th>
            <th>Status</th>
            <th>Risk notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.title}</td>
              <td>{row.source}</td>
              <td>{row.confidenceBand}</td>
              <td>{row.status}</td>
              <td>{row.risk}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
