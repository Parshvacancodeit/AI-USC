// P1. Reads GPS latitude/longitude from a JPEG's EXIF block, if the camera wrote it.
// Many phones strip location from photos shared to websites, so callers must have a fallback.

export async function readPhotoGps(file: File): Promise<{ lat: number; lng: number } | null> {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xffd8) return null; // not a JPEG
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off);
      const size = v.getUint16(off + 2);
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
      if ((marker & 0xff00) !== 0xff00) return null;
      off += 2 + size;
    }
  } catch {}
  return null;
}

function parseTiff(v: DataView, t: number) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = (o: number) => v.getUint16(o, le);
  const u32 = (o: number) => v.getUint32(o, le);
  const ifd0 = t + u32(t + 4);
  let gpsIfd = 0;
  for (let i = 0, n = u16(ifd0); i < n; i++) {
    const e = ifd0 + 2 + i * 12;
    if (u16(e) === 0x8825) gpsIfd = t + u32(e + 8);
  }
  if (!gpsIfd) return null;
  const tags: Record<number, number | string> = {};
  for (let i = 0, n = u16(gpsIfd); i < n; i++) {
    const e = gpsIfd + 2 + i * 12;
    const tag = u16(e);
    if (tag === 1 || tag === 3) tags[tag] = String.fromCharCode(v.getUint8(e + 8));
    if (tag === 2 || tag === 4) {
      const p = t + u32(e + 8);
      const r = (k: number) => u32(p + k * 8) / (u32(p + k * 8 + 4) || 1);
      tags[tag] = r(0) + r(1) / 60 + r(2) / 3600;
    }
  }
  if (typeof tags[2] !== "number" || typeof tags[4] !== "number") return null;
  const lat = (tags[1] === "S" ? -1 : 1) * tags[2];
  const lng = (tags[3] === "W" ? -1 : 1) * tags[4];
  return lat || lng ? { lat, lng } : null;
}

/** Distance in meters. */
export function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
