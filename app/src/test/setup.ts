import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { db } from '../db/db';

afterEach(async () => {
  cleanup();
  // Frischer DB-Zustand pro Test (Isolation), IndexedDB via fake-indexeddb.
  await db.delete();
  await db.open();
});
