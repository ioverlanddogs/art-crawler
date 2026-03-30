import { StatusBadge } from './StatusBadge';

type TeamWorkload = {
  team: string;
  open: number;
  atRisk: number;
  overloaded: boolean;
};

export function WorkloadBalanceCard({ teams }: { teams: TeamWorkload[] }) {
  return (
    <div className="stat-card">
      <div className="metric-card-header">
        <p className="stat-label">Team workload balance</p>
        <StatusBadge tone="info">TEAM VIEW</StatusBadge>
      </div>
      <ul className="timeline" aria-label="Team workload">
        {teams.map((team) => (
          <li key={team.team}>
            <p>
              <strong>{team.team}</strong> <StatusBadge tone={team.overloaded ? 'danger' : 'success'}>{team.overloaded ? 'OVERLOADED TEAM' : 'Balanced'}</StatusBadge>
            </p>
            <p className="kpi-note">Open: {team.open} · SLA at risk: {team.atRisk}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
