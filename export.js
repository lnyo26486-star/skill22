/* 내보내기: 투명 애니메이션 WebP, 투명 WebM */
(function (g) {
  'use strict';

  /**
   * 프레임을 하나씩 그려 WebP로 만든 뒤 애니메이션 WebP로 묶습니다. (브라우저가 달라도 결과가 같아요)
   * getFrame(i, ctx, canvas)는 프레임을 그리고 그 프레임의 표시 시간(ms)을 돌려줘야 해요.
   */
  async function encodeWebP({ width, height, count, getFrame, quality = 0.9, onProgress }) {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const ctx = c.getContext('2d');
    const frames = [];
    for (let i = 0; i < count; i++) {
      ctx.clearRect(0, 0, width, height);
      const delay = await getFrame(i, ctx, c);
      const blob = await new Promise((r) => c.toBlob(r, 'image/webp', quality));
      if (!blob || blob.type !== 'image/webp') {
        throw new Error('이 브라우저는 WebP 인코딩을 지원하지 않아요. Chrome, Edge, Firefox에서 열어 주세요.');
      }
      frames.push({ data: new Uint8Array(await blob.arrayBuffer()), duration: Math.max(1, Math.round(delay)) });
      if (onProgress) onProgress((i + 1) / count);
    }
    const bytes = WebPMux.muxAnimatedWebP({ width, height, frames, loop: 0 });
    return new Blob([bytes], { type: 'image/webp' });
  }

  /**
   * 캔버스를 실시간으로 녹화해 WebM으로 저장합니다. 투명 배경 유지는 Chrome/Edge에서 확인됐어요.
   * 녹화 중에는 이 탭을 보이는 상태로 두어야 해요 (탭을 숨기면 화면 갱신이 멈춰요).
   */
  function recordWebM({ width, height, durationMs, fps = 30, codec = 'vp9', bitrate = 8000000, draw, onProgress }) {
    return new Promise((resolve, reject) => {
      if (!window.MediaRecorder) return reject(new Error('이 브라우저는 영상 녹화를 지원하지 않아요.'));
      const wanted = codec === 'vp8' ? 'video/webm;codecs=vp8' : 'video/webm;codecs=vp9';
      const mime = [wanted, 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
      if (!mime) return reject(new Error('WebM 녹화를 지원하지 않는 브라우저예요.'));

      const c = document.createElement('canvas');
      c.width = width; c.height = height;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, width, height);
      draw(0, ctx);

      const stream = c.captureStream(fps);
      let rec;
      try {
        rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
      } catch (e) { return reject(e); }
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onerror = (e) => reject((e && e.error) || new Error('녹화에 실패했어요.'));
      rec.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      rec.start();

      const t0 = performance.now();
      let stopping = false;
      const tick = () => {
        const el = performance.now() - t0;
        const t = Math.min(el, durationMs);
        ctx.clearRect(0, 0, width, height);
        draw(t, ctx);
        if (onProgress) onProgress(t / durationMs);
        if (el >= durationMs) {
          if (!stopping) { stopping = true; setTimeout(() => rec.stop(), Math.ceil(1000 / fps) + 30); }
        } else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  g.Export = { encodeWebP, recordWebM };
})(window);
