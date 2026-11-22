import React from 'react';
import ReactDOM from 'react-dom/client';
import PublicMonitorApp from './components/PublicMonitorApp';
import './styles/app.css';
import './styles/water-v824.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PublicMonitorApp />
  </React.StrictMode>
);
