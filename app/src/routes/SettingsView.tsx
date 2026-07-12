import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';

export default function SettingsView() {
  return (
    <div>
      <ScreenHeader title="Einstellungen" subtitle="Präferenzen, Preise, Über" />
      <EmptyState
        icon="⚙️"
        title="Einstellungen folgen"
        description="Ab Milestone 3 bearbeitest du hier deine Präferenzen; später Online-Preise, manuelle Preise und Impressum."
      />
    </div>
  );
}
