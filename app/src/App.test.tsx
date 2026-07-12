import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from './App';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App shell', () => {
  it('rendert die Bottom-Nav mit allen vier Tabs', async () => {
    renderAt('/plan');
    // App gated auf DB-Init -> Tabs erscheinen erst nach dem Laden.
    expect(await screen.findByRole('navigation', { name: /hauptnavigation/i })).toBeInTheDocument();
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('Liste')).toBeInTheDocument();
    expect(screen.getByText('Favoriten')).toBeInTheDocument();
    expect(screen.getByText('Einstellungen')).toBeInTheDocument();
  });

  it('leitet die Wurzel auf den Wochenplan um', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Wochenplan' })).toBeInTheDocument();
  });

  it('zeigt Onboarding außerhalb des Tab-Layouts (ohne Bottom-Nav)', async () => {
    renderAt('/onboarding');
    expect(await screen.findByRole('heading', { name: /willkommen bei mealio/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /hauptnavigation/i })).not.toBeInTheDocument();
  });
});
