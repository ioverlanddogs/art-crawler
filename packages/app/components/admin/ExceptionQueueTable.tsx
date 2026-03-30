import { EmptyState } from './EmptyState';

export type ExceptionQueueItem = {
  id: string;
  title: string;
  reason: string;
  escalationType: 'policy_miss' | 'low_confidence' | 'conflict' | 'unsupported_case' | 'unknown';
  confidenceBand: string;
  nextAction: string;
};

export function ExceptionQueueTable({ rows, onSelect }: { rows: ExceptionQueueItem[]; onSelect: (id: string) => void }) {
  if (!rows.length) {
    return <EmptyState title="No current exceptions" description="No items are currently classified as escalation/exception candidates." />;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Candidate</th>
            <th>Escalation reason</th>
            <th>Type</th>
            <th>Confidence</th>
            <th>Operator path</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <button type="button" className="link-button" onClick={() => onSelect(row.id)}>
                  {row.title}
                </button>
              </td>
              <td>{row.reason}</td>
              <td>{row.escalationType.replaceAll('_', ' ')}</td>
              <td>{row.confidenceBand}</td>
              <td>{row.nextAction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
