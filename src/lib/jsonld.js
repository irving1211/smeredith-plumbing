// Serialises structured data for a <script type="application/ld+json"> block. A "<" inside any string (for
// example "</script>") is written as \u003c, which JSON.parse reads back identically but HTML can't misparse.
export const jsonLd = (data) => JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
