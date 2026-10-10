/* 애니메이션 WebP 조립기 (의존성 없음)
 * 브라우저가 프레임별로 만들어 준 정지 WebP들을 하나의 움직이는 WebP로 묶습니다.
 * 투명 배경이 그대로 유지돼요.
 */
(function (root) {
  'use strict';

  const ascii = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  const le32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

  function concat(arrs) {
    let n = 0;
    for (const a of arrs) n += a.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const a of arrs) { out.set(a, o); o += a.length; }
    return out;
  }

  function parseChunks(u8) {
    if (ascii(u8, 0) !== 'RIFF' || ascii(u8, 8) !== 'WEBP') throw new Error('WebP 프레임이 아니에요.');
    const chunks = [];
    let off = 12;
    while (off + 8 <= u8.length) {
      const type = ascii(u8, off);
      const size = le32(u8, off + 4);
      chunks.push({ type, data: u8.subarray(off + 8, off + 8 + size) });
      off += 8 + size + (size & 1);
    }
    return chunks;
  }

  function writeChunk(type, data) {
    const pad = data.length & 1;
    const out = new Uint8Array(8 + data.length + pad);
    for (let i = 0; i < 4; i++) out[i] = type.charCodeAt(i);
    new DataView(out.buffer).setUint32(4, data.length, true);
    out.set(data, 8);
    return out;
  }

  function put24(a, o, v) { a[o] = v & 255; a[o + 1] = (v >> 8) & 255; a[o + 2] = (v >> 16) & 255; }

  /**
   * @param {{width:number,height:number,loop?:number,frames:{data:Uint8Array,duration:number}[]}} o
   * duration은 ms, loop 0 = 무한 반복
   */
  function muxAnimatedWebP({ width, height, frames, loop = 0 }) {
    const anmf = frames.map((f) => {
      const payload = [];
      for (const c of parseChunks(f.data)) {
        if (c.type === 'ALPH' || c.type === 'VP8 ' || c.type === 'VP8L') payload.push(writeChunk(c.type, c.data));
      }
      if (!payload.length) throw new Error('프레임에서 이미지 데이터를 찾지 못했어요.');
      const hdr = new Uint8Array(16);
      put24(hdr, 6, width - 1);
      put24(hdr, 9, height - 1);
      put24(hdr, 12, Math.max(0, Math.min(0xffffff, Math.round(f.duration))));
      hdr[15] = 0b10; // 블렌딩 없이 덮어쓰기(프레임이 캔버스 전체를 덮음), 폐기 없음
      return writeChunk('ANMF', concat([hdr, ...payload]));
    });

    const vp8x = new Uint8Array(10);
    vp8x[0] = 0x12; // 애니메이션 + 알파
    put24(vp8x, 4, width - 1);
    put24(vp8x, 7, height - 1);

    const anim = new Uint8Array(6); // 배경색 투명, 반복 횟수
    anim[4] = loop & 255;
    anim[5] = (loop >> 8) & 255;

    const body = concat([
      Uint8Array.from([0x57, 0x45, 0x42, 0x50]), // 'WEBP'
      writeChunk('VP8X', vp8x),
      writeChunk('ANIM', anim),
      ...anmf
    ]);
    const head = new Uint8Array(8);
    head.set([0x52, 0x49, 0x46, 0x46]); // 'RIFF'
    new DataView(head.buffer).setUint32(4, body.length, true);
    return concat([head, body]);
  }

  const API = { muxAnimatedWebP, parseChunks };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.WebPMux = API;
})(typeof window !== 'undefined' ? window : globalThis);
