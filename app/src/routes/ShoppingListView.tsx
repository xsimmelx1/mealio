import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';

export default function ShoppingListView() {
  return (
    <div>
      <ScreenHeader title="Einkaufsliste" subtitle="Aus dem Plan zusammengefasst" />
      <EmptyState
        icon="🛒"
        title="Liste ist leer"
        description="Ab Milestone 8 wird die Liste aus deinem Wochenplan aggregiert — nach Gang gruppiert und abhakbar."
      />
    </div>
  );
}
