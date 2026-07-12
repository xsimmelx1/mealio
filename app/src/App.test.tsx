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
  it('rendert die Bottom-Nav mit allen vier Tabs', () => {
    renderAt('/plan');
    const nav = screen.getByRole('navigation', { name: /hauptnavigation/i });
    expect(nav).toBeInTheDocument();
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('Liste')).toBeInTheDocument();
    expect(screen.getByText('Favoriten')).toBeInTheDocument();
    expect(screen.getByText('Einstellungen')).toBeInTheDocument();
  });

  it('leitet die Wurzel auf den Wochenplan um', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Wochenplan' })).toBeInTheDocument();
  });

  it('zeigt Onboarding außerhalb des Tab-Layouts (ohne Bottom-Nav)', () => {
    renderAt('/onboarding');
    expect(screen.getByRole('heading', { name: /willkommen bei mealio/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /hauptnavigation/i })).not.toBeInTheDocument();
  });
});
