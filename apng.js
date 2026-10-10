/* APNG 해석기: 브라우저 기능에 기대지 않고 직접 프레임을 뽑아냅니다.
 * - parseAPNG(): 순수 함수 (Node에서도 테스트 가능)
 * - decodeAnimated(): 브라우저용. APNG는 직접 합성, GIF/WebP는 ImageDecoder(있을 때) 사용
 */
(function (root) {
  'use strict';
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  let crcTable = null;

  function crc32(buf) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
      }
    }
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const u16 = (b, o) => (b[o] << 8) | b[o + 1];

  function concat(arrs) {
    let n = 0;
    for (const a of arrs) n += a.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const a of arrs) { out.set(a, o); o += a.length; }
    return out;
  }

  function chunkBytes(type, data) {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }

  /** @returns {null | {width,height,plays,frames:[{png,x,y,w,h,delay,dispose,blend}]}} */
  function parseAPNG(buf) {
    for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) return null;
    let off = 8;
    let ihdr = null, actl = null, seenIDAT = false, idatOwner = null, cur = null;
    const shared = [];
    const frames = [];

    while (off + 8 <= buf.length) {
      const len = u32(buf, off);
      const type = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
      const data = buf.subarray(off + 8, off + 8 + len);
      off += 12 + len;

      if (type === 'IHDR') ihdr = data;
      else if (type === 'acTL') actl = { frames: u32(data, 0), plays: u32(data, 4) };
      else if (type === 'fcTL') {
        cur = {
          w: u32(data, 4), h: u32(data, 8), x: u32(data, 12), y: u32(data, 16),
          dn: u16(data, 20), dd: u16(data, 22), dispose: data[24], blend: data[25], parts: []
        };
        frames.push(cur);
      } else if (type === 'IDAT') {
        if (!seenIDAT) { seenIDAT = true; idatOwner = frames.length ? frames[0] : null; }
        if (idatOwner) idatOwner.parts.push(data);
      } else if (type === 'fdAT') {
        if (cur) cur.parts.push(data.subarray(4));
      } else if (type === 'IEND') break;
      else if (!seenIDAT) shared.push(chunkBytes(type, data)); // PLTE, tRNS, gAMA ...
    }

    if (!ihdr || !actl || !frames.length) return null;

    const out = frames.map((f) => {
      const ih = new Uint8Array(ihdr);
      new DataView(ih.buffer).setUint32(0, f.w);
      new DataView(ih.buffer).setUint32(4, f.h);
      const png = concat([
        Uint8Array.from(SIG),
        chunkBytes('IHDR', ih),
        ...shared,
        chunkBytes('IDAT', concat(f.parts)),
        chunkBytes('IEND', new Uint8Array(0))
      ]);
      const den = f.dd === 0 ? 100 : f.dd;
      return { png, x: f.x, y: f.y, w: f.w, h: f.h, delay: Math.max(20, Math.round((f.dn / den) * 1000)), dispose: f.dispose, blend: f.blend };
    });
    return { width: u32(ihdr, 0), height: u32(ihdr, 4), plays: actl.plays, frames: out };
  }

  /* ---------- 브라우저 전용 ---------- */
  async function compositeAPNG(info) {
    const { width: W, height: H } = info;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const frames = [];
    for (const f of info.frames) {
      const bmp = await createImageBitmap(new Blob([f.png], { type: 'image/png' }));
      let saved = null;
      if (f.dispose === 2) saved = ctx.getImageData(0, 0, W, H);
      if (f.blend === 0) ctx.clearRect(f.x, f.y, f.w, f.h);
      ctx.drawImage(bmp, f.x, f.y);
      bmp.close && bmp.close();

      const snap = document.createElement('canvas');
      snap.width = W; snap.height = H;
      snap.getContext('2d').drawImage(c, 0, 0);
      frames.push({ canvas: snap, delay: f.delay });

      if (f.dispose === 1) ctx.clearRect(f.x, f.y, f.w, f.h);
      else if (f.dispose === 2 && saved) ctx.putImageData(saved, 0, 0);
    }
    return { width: W, height: H, frames, kind: 'APNG' };
  }

  async function viaImageDecoder(buf, type) {
    const dec = new ImageDecoder({ data: buf, type });
    await dec.tracks.ready;
    const count = dec.tracks.selectedTrack.frameCount;
    const frames = [];
    let W = 0, H = 0;
    for (let i = 0; i < count; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      W = image.displayWidth; H = image.displayHeight;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      c.getContext('2d').drawImage(image, 0, 0);
      frames.push({ canvas: c, delay: Math.max(20, Math.round((image.duration || 100000) / 1000)) });
      image.close();
    }
    return { width: W, height: H, frames, kind: type.replace('image/', '').toUpperCase() };
  }

  async function decodeAnimated(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf[0] === 137 && buf[1] === 80) {
      const info = parseAPNG(buf);
      if (info) return compositeAPNG(info);
    }
    if ('ImageDecoder' in window && /^image\/(gif|webp|png)$/.test(file.type)) {
      try { return await viaImageDecoder(buf, file.type); } catch (e) { /* 아래 단일 프레임으로 */ }
    }
    const bmp = await createImageBitmap(file);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    return { width: bmp.width, height: bmp.height, frames: [{ canvas: c, delay: 100 }], kind: '정지 이미지' };
  }

  const API = { parseAPNG, decodeAnimated, crc32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.APNG = API;
})(typeof window !== 'undefined' ? window : globalThis);
