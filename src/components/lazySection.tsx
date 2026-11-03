import { lazy, Suspense, type ComponentType } from 'react';

/** Keep the surrounding page and live flow visible while a section downloads. */
export function lazySection<P extends object>(load:()=>Promise<{default:ComponentType<P>}>) {
  const Component=lazy(load) as unknown as ComponentType<P>;
  return function DeferredSection(props:P){
    return <Suspense fallback={<div role="status" aria-live="polite">Cargando sección…</div>}><Component {...props}/></Suspense>;
  };
}
