import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import ConfigMissing from '@/components/ConfigMissing';
import { isSupabaseConfigured } from '@/lib/supabase';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isSupabaseConfigured ? <App /> : <ConfigMissing />}
    </ErrorBoundary>
  </StrictMode>
);
