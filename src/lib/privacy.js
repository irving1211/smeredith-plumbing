// The privacy notice is PUBLISHED by default: Irving approved the wording on Shane's behalf on 2026-10-24, and Google
// Analytics (on for this site) expects a published privacy notice. Published means: the page is indexable, listed in
// sitemap.xml, linked from the footer and from the request form.
// PUBLIC_PRIVACY_PUBLISHED=0 builds it the old "prepared" way (noindex, out of the sitemap, linked from nowhere).
export const isPrivacyPublished = (env) => String(env.PUBLIC_PRIVACY_PUBLISHED ?? '1').trim() !== '0';
