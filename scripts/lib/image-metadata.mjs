// Small, dependency-free helpers for the one privacy rule that matters on a business site that hides
// the owner's home address: no published photo may carry GPS coordinates.

/** Walk a JPEG's marker segments. Returns [{ marker, start, end }] up to the start of scan data. */
function jpegSegments(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const segs = [];
  let i = 2;
  while (i + 4 <= buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    if (marker === 0xda || marker === 0xd9) break; // start of scan / end of image
    const len = buf.readUInt16BE(i + 2);
    segs.push({ marker, start: i, end: i + 2 + len });
    i += 2 + len;
  }
  return segs;
}

function exifHasGps(exif) {
  // exif = bytes after "Exif\0\0": a TIFF structure. GPS data hangs off tag 0x8825 in IFD0.
  if (exif.length < 8) return false;
  const little = exif.toString('latin1', 0, 2) === 'II';
  const u16 = (o) => (little ? exif.readUInt16LE(o) : exif.readUInt16BE(o));
  const u32 = (o) => (little ? exif.readUInt32LE(o) : exif.readUInt32BE(o));
  const ifd = u32(4);
  if (ifd + 2 > exif.length) return false;
  const n = u16(ifd);
  for (let k = 0; k < n; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > exif.length) break;
    if (u16(entry) === 0x8825) return true;
  }
  return false;
}

/** True if the image (JPEG or WebP) carries a GPS block. */
export function hasGps(buf) {
  const segs = jpegSegments(buf);
  if (segs) {
    return segs.some((s) => s.marker === 0xe1 && buf.toString('latin1', s.start + 4, s.start + 10) === 'Exif\0\0' && exifHasGps(buf.subarray(s.start + 10, s.end)));
  }
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    let i = 12;
    while (i + 8 <= buf.length) {
      const id = buf.toString('latin1', i, i + 4);
      const size = buf.readUInt32LE(i + 4);
      if (id === 'EXIF') {
        const body = buf.subarray(i + 8, i + 8 + size);
        const exif = body.toString('latin1', 0, 6) === 'Exif\0\0' ? body.subarray(6) : body;
        if (exifHasGps(exif)) return true;
      }
      i += 8 + size + (size % 2);
    }
  }
  return false;
}

/** Orientation tag (1-8) from a JPEG's EXIF, or 1. */
export function jpegOrientation(buf) {
  const segs = jpegSegments(buf) || [];
  for (const s of segs) {
    if (s.marker !== 0xe1 || buf.toString('latin1', s.start + 4, s.start + 10) !== 'Exif\0\0') continue;
    const exif = buf.subarray(s.start + 10, s.end);
    const little = exif.toString('latin1', 0, 2) === 'II';
    const u16 = (o) => (little ? exif.readUInt16LE(o) : exif.readUInt16BE(o));
    const ifd = little ? exif.readUInt32LE(4) : exif.readUInt32BE(4);
    const n = u16(ifd);
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + k * 12;
      if (u16(e) === 0x0112) return u16(e + 8);
    }
  }
  return 1;
}

/** Remove EXIF and XMP segments from a JPEG without touching the image data (lossless). */
export function stripJpegMetadata(buf) {
  const segs = jpegSegments(buf);
  if (!segs) return buf;
  const drop = segs.filter(
    (s) =>
      s.marker === 0xe1 && (buf.toString('latin1', s.start + 4, s.start + 10) === 'Exif\0\0' || buf.toString('latin1', s.start + 4, s.start + 33).startsWith('http://ns.adobe.com/xap/1.0/')),
  );
  if (!drop.length) return buf;
  const parts = [];
  let cursor = 0;
  for (const s of drop) {
    parts.push(buf.subarray(cursor, s.start));
    cursor = s.end;
  }
  parts.push(buf.subarray(cursor));
  return Buffer.concat(parts);
}
