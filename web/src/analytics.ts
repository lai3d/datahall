// Vercel Web Analytics: cookieless, aggregate page views. Enabled in the Vercel project settings; the
// script is served by the deployment at /_vercel/insights/script.js, so it only runs on production builds.
// The Hobby plan has no custom events, so opening a share link is reported as the page /shared.
import {inject, pageview} from '@vercel/analytics';
import type {BeforeSendEvent} from '@vercel/analytics';
import {LINK_KEY} from './share-link.ts';

// Whether the page was opened with a layout in the hash. Check this before the page writes its own
// layout into the hash (updateShareLink runs during boot).
export const hasShareLink = (hash: string): boolean => new URLSearchParams(hash.replace(/^#/, '')).has(LINK_KEY);

// The URL reported for a page view: no hash (the layout itself) and no query, and share-link visits
// go to a /shared path next to the page so they show up as their own row under Pages
export function reportedUrl(url: string, openedFromShareLink: boolean): string{
  const u = new URL(url);
  u.hash = '';
  u.search = '';
  if (VIRTUAL_PAGES.some(p => u.pathname.endsWith('/' + p))) return u.toString();
  if (openedFromShareLink) u.pathname = u.pathname.replace(/\/?(index\.html)?$/, '/shared');
  return u.toString();
}

// Virtual pages reported with pageview() for milestones (Hobby has no custom events); kept as they are by reportedUrl
const VIRTUAL_PAGES = ['tutorial-done'];

const enabled = () => !import.meta.env.DEV && import.meta.env.MODE !== 'e2e';

// Finishing the tutorial counts as a view of /tutorial-done, so completions show up under Pages
export function reportTutorialDone(): void{
  if (enabled()) pageview({path: '/tutorial-done'});
}

// Scenario completions are counted as virtual pages, like the tutorial; no layout content is sent
export function reportScenarioDone(id: string): void{
  if (enabled()) pageview({path: `/scenario-${id}-done`});
}

export function initAnalytics(openedFromShareLink: boolean): void{
  if (!enabled()) return;
  inject({
    mode: 'production',
    beforeSend: (event: BeforeSendEvent) => ({...event, url: reportedUrl(event.url, openedFromShareLink)}),
  });
}
