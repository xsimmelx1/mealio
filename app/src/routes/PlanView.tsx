import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';

export default function PlanView() {
  return (
    <div>
      <ScreenHeader title="Wochenplan" subtitle="7 Tage, ein Rezept pro Tag" />
      <EmptyState
        icon="🗓️"
        title="Noch kein Plan"
        description="Ab Milestone 6 kannst du hier einen Wochenplan generieren und einzelne Tage neu würfeln."
      />
    </div>
  );
}
