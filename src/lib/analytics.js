// Google Analytics 4 for this site. ON by default (decided 2026-10-24, "should have been on from day one"): the property id
// lives here so every build carries it, instead of depending on someone remembering a build setting.
//  - PUBLIC_GA4_ID overrides the id for a one-off build; the value "off" turns Google Analytics off for that build.
//  - Hits are only SENT from the production hostnames below. Local dev, test runs (127.0.0.1) and preview URLs
//    (*.pages.dev) load the page but never talk to Google, so they cannot put fake visits in the real property.
//    PUBLIC_GA4_HOSTS (comma list) overrides the hostnames; the browser tests use it to exercise the wiring.
//  - PUBLIC_GTM_ID still wins if set (Tag Manager replaces direct gtag).
export const GA4_DEFAULT_ID = 'G-27Q90RBC50'; // property "S. Meredith Plumbing and Heating", created under irvingcarrion.17
export const GA4_DEFAULT_HOSTS = ['smeredithplumbing.com', 'www.smeredithplumbing.com'];

export function analyticsConfig(env) {
  const raw = String(env.PUBLIC_GA4_ID ?? '').trim();
  const id = raw.toLowerCase() === 'off' ? '' : raw || GA4_DEFAULT_ID;
  const hosts = String(env.PUBLIC_GA4_HOSTS || GA4_DEFAULT_HOSTS.join(','))
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return { id, hosts };
}
