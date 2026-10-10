// Lead-source helpers shared by the contact function and the tests.
// Principle: report what was actually captured. An untagged visit is never labelled "Google organic".

// The tag Shane's Google Business Profile website link should carry. `organic` keeps GA4's default
// channel grouping honest (Organic Search) while the distinct source separates Maps/GBP clicks from
// ordinary search clicks.
export const GBP_UTM = Object.freeze({
  source: 'google-business-profile',
  medium: 'organic',
  campaign: 'gbp-website',
});

export function cleanToken(value, max = 100) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

// Keep origin + path only: query strings can carry search terms or identifiers.
export function cleanReferrer(value) {
  const raw = cleanToken(value, 400);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return (url.origin + url.pathname).slice(0, 300);
  } catch {
    return '';
  }
}

const GOOGLE_HOST = /^(?:[a-z0-9-]+\.)*google\.(?:com|[a-z]{2,3})(?:\.[a-z]{2})?$/;
const SEARCH_HOSTS = /^(?:[a-z0-9-]+\.)*(?:bing\.com|duckduckgo\.com|yahoo\.com|ecosia\.org|brave\.com|startpage\.com)$/;
const SOCIAL_HOSTS = /^(?:[a-z0-9-]+\.)*(?:facebook\.com|instagram\.com|nextdoor\.com|t\.co|pinterest\.com|youtube\.com|linkedin\.com|tiktok\.com)$/;

function hostOf(referrer) {
  try {
    return new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isGbpTag({ source, medium, campaign }) {
  return (
    source === GBP_UTM.source ||
    source === 'gbp' ||
    medium === 'gbp' ||
    // the first-proposed tag, kept so links already pasted into Google keep classifying correctly
    (source === 'google' && campaign.startsWith('gbp'))
  );
}

/**
 * @param {{utmSource?: string, utmMedium?: string, utmCampaign?: string, referrer?: string}} input
 * @returns {{id: string, label: string}}
 */
export function classifySource(input = {}) {
  const source = cleanToken(input.utmSource, 100).toLowerCase();
  const medium = cleanToken(input.utmMedium, 100).toLowerCase();
  const campaign = cleanToken(input.utmCampaign, 100).toLowerCase();

  if (isGbpTag({ source, medium, campaign })) {
    return { id: 'gbp_tagged', label: 'Google Business Profile (tagged profile link)' };
  }
  if (source || medium || campaign) {
    return { id: 'tagged_campaign', label: `Tagged link: ${source || '?'} / ${medium || '?'} / ${campaign || '?'}` };
  }

  const referrer = cleanReferrer(input.referrer);
  const host = hostOf(referrer);
  if (!host) return { id: 'direct_or_unknown', label: 'Direct or unknown (no tag or referrer captured)' };

  if (GOOGLE_HOST.test(host)) {
    return { id: 'google_referral', label: 'Google referral, untagged (search vs. Maps not distinguishable)' };
  }
  if (SEARCH_HOSTS.test(host)) return { id: 'search_referral', label: `Search referral from ${host}` };
  if (SOCIAL_HOSTS.test(host)) return { id: 'social_referral', label: `Social referral from ${host}` };
  return { id: 'site_referral', label: `Referral from ${host}` };
}
