import { useEffect, useState } from 'react';

export type Route =
  | 'overview'
  | 'planner'
  | 'community'
  | 'media'
  | 'about'
  | 'settings';

const ROUTES: Route[] = ['overview', 'planner', 'community', 'media', 'about', 'settings'];

export function readRoute(): Route {
  const value = window.location.hash.replace(/^#\/?/, '');
  return (ROUTES as string[]).includes(value) ? (value as Route) : 'overview';
}

export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  function navigate(next: Route) {
    window.location.hash = `/${next}`;
    setRoute(next);
  }
  return [route, navigate];
}
