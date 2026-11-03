import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { WorkspaceProvider } from './state';
import './styles.css';

const desktop = (window as unknown as { creatorCenter?: { platform?: string } }).creatorCenter;
if (desktop?.platform) document.documentElement.dataset.desktopPlatform = desktop.platform;

const root = document.getElementById('root');
if (!root) throw new Error('The app root is missing.');
createRoot(root).render(
  <StrictMode>
    <WorkspaceProvider>
      <App />
    </WorkspaceProvider>
  </StrictMode>,
);
