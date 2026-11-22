// Mi Solar V6 — punto de entrada.
import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/app.css';
import './styles/water-v824.css';

const normalizedPath=window.location.pathname.replace(/\/+$/,'')||'/';
const silkBrowser=/Silk\//i.test(window.navigator.userAgent);
const forcePrivateApp=new URLSearchParams(window.location.search).get('app')==='1';

// En Amazon Silk, Mi Solar abre directamente el tablero público permanente.
// ?app=1 conserva una salida explícita para administración desde el mismo equipo.
if(silkBrowser&&normalizedPath==='/'&&!forcePrivateApp)window.location.replace('/monitor');

const publicMonitor=normalizedPath==='/monitor';
const Root=React.lazy(()=>publicMonitor?import('./components/PublicMonitorApp'):import('./App'));
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><React.Suspense fallback={null}><Root/></React.Suspense></React.StrictMode>);
