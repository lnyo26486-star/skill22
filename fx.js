/* 이펙트 엔진: 레이어의 시간별 상태를 계산하고 캔버스에 그립니다.
 * 편집기 미리보기와 내보내기가 똑같은 함수를 쓰기 때문에, 보이는 그대로 저장돼요.
 */
(function (g) {
  'use strict';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const FONTS = {
    'Pretendard': 'Pretendard, "Noto Sans KR", "Malgun Gothic", sans-serif',
    'Black Han Sans': '"Black Han Sans", "Noto Sans KR", sans-serif',
    'Do Hyeon': '"Do Hyeon", "Noto Sans KR", sans-serif',
    'Jua': '"Jua", "Noto Sans KR", sans-serif',
    'Gugi': '"Gugi", "Noto Sans KR", sans-serif',
    'Noto Serif KR': '"Noto Serif KR", serif'
  };

  const IN_TYPES = [
    ['none', '없음'], ['fade', '페이드'], ['pop', '팝 (튀어나옴)'], ['grow', '커지며 등장'], ['zoom', '줌인'],
    ['slideUp', '아래에서 위로'], ['slideDown', '위에서 아래로'], ['slideLeft', '왼쪽에서'], ['slideRight', '오른쪽에서'],
    ['spin', '회전하며'], ['drop', '떨어져 튕김']
  ];
  const OUT_TYPES = [
    ['none', '없음'], ['fade', '페이드'], ['shrink', '작아지며'], ['zoom', '커지며 사라짐'],
    ['float', '위로 떠오름'], ['sink', '아래로 가라앉음'], ['spin', '회전하며']
  ];
  const LOOP_TYPES = [
    ['none', '없음'], ['pulse', '맥동'], ['float', '둥실둥실'], ['shake', '떨림'],
    ['spin', '계속 회전'], ['flicker', '깜빡임'], ['wobble', '좌우 흔들림']
  ];
  const EASES = [['out', '부드럽게 멈춤'], ['inout', '느리게-빠르게-느리게'], ['linear', '일정하게'], ['back', '살짝 넘쳤다 돌아옴'], ['bounce', '통통 튕김']];
  const BLENDS = [
    ['normal', '일반'], ['add', '빛처럼 더하기'], ['multiply', '곱하기'], ['screen', '스크린'], ['overlay', '오버레이'],
    ['soft-light', '소프트 라이트'], ['hard-light', '하드 라이트'], ['color-dodge', '색상 닷지'], ['color-burn', '색상 번'],
    ['darken', '어둡게'], ['lighten', '밝게'], ['difference', '차이'], ['exclusion', '제외'],
    ['hue', '색조'], ['saturation', '채도'], ['color', '색상'], ['luminosity', '광도']
  ];
  const BLEND_OPS = {
    normal: 'source-over', add: 'lighter', multiply: 'multiply', screen: 'screen', overlay: 'overlay',
    'soft-light': 'soft-light', 'hard-light': 'hard-light', 'color-dodge': 'color-dodge', 'color-burn': 'color-burn',
    darken: 'darken', lighten: 'lighten', difference: 'difference', exclusion: 'exclusion',
    hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity'
  };
  const SHAPES = [['orb', '빛 덩어리'], ['circle', '원'], ['ring', '링'], ['rect', '사각형'], ['star', '별'], ['slash', '베기 자국']];

  function bounceOut(t) {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  }
  const EASE = {
    linear: (t) => t,
    out: (t) => 1 - Math.pow(1 - t, 3),
    inout: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    bounce: bounceOut
  };

  function applyIn(type, p, e, st) {
    switch (type) {
      case 'fade': st.a *= e; break;
      case 'pop': st.s *= EASE.back(p); st.a *= Math.min(1, p * 4); break;
      case 'grow': st.s *= 0.1 + 0.9 * e; st.a *= Math.min(1, p * 3); break;
      case 'zoom': st.s *= 2 - e; st.a *= e; break;
      case 'slideUp': st.dy += (1 - e) * 80; st.a *= e; break;
      case 'slideDown': st.dy -= (1 - e) * 80; st.a *= e; break;
      case 'slideLeft': st.dx -= (1 - e) * 120; st.a *= e; break;
      case 'slideRight': st.dx += (1 - e) * 120; st.a *= e; break;
      case 'spin': st.rot -= (1 - e) * 270; st.s *= e; st.a *= e; break;
      case 'drop': st.dy -= (1 - bounceOut(p)) * 220; st.a *= Math.min(1, p * 5); break;
    }
  }
  function applyOut(type, e, st) {
    switch (type) {
      case 'fade': st.a *= 1 - e; break;
      case 'shrink': st.s *= 1 - e * 0.9; st.a *= 1 - e; break;
      case 'zoom': st.s *= 1 + e * 0.8; st.a *= 1 - e; break;
      case 'float': st.dy -= e * 80; st.a *= 1 - e; break;
      case 'sink': st.dy += e * 80; st.a *= 1 - e; break;
      case 'spin': st.rot += e * 270; st.s *= 1 - e; st.a *= 1 - e; break;
    }
  }
  function applyLoop(L, lt, st) {
    const f = L.loopSpeed, amp = L.loopAmp, ph = 2 * Math.PI * f * lt;
    switch (L.loopType) {
      case 'pulse': st.s *= 1 + 0.08 * amp * Math.sin(ph); break;
      case 'float': st.dy += 12 * amp * Math.sin(ph); break;
      case 'shake':
        st.dx += 6 * amp * Math.sin(ph * 9.1);
        st.dy += 6 * amp * Math.sin(ph * 11.3 + 1.7);
        break;
      case 'spin': st.rot += 360 * f * lt; break;
      case 'flicker': st.a *= clamp(1 - 0.35 * amp * (0.5 + 0.5 * Math.sin(ph * 6)), 0, 1); break;
      case 'wobble': st.rot += 8 * amp * Math.sin(ph); break;
    }
  }

  /** 시간(초)에서 레이어의 변형값. 보이지 않는 구간이면 null */
  function evalLayer(L, time) {
    const lt = time - L.start;
    if (lt < 0 || lt > L.dur) return null;
    const st = { dx: 0, dy: 0, s: 1, rot: 0, a: 1 };
    const ease = EASE[L.ease] || EASE.out;
    if (L.inType !== 'none' && L.inDur > 0 && lt < L.inDur) {
      const p = clamp(lt / L.inDur, 0, 1);
      applyIn(L.inType, p, ease(p), st);
    }
    const outStart = L.dur - L.outDur;
    if (L.outType !== 'none' && L.outDur > 0 && lt > outStart) {
      applyOut(L.outType, ease(clamp((lt - outStart) / L.outDur, 0, 1)), st);
    }
    applyLoop(L, lt, st);
    return st;
  }

  /* ---------- 이미지·글꼴 준비 ---------- */
  const imgs = new Map();
  let onImageLoad = () => {};
  function getImage(src) {
    let e = imgs.get(src);
    if (!e) {
      const im = new Image();
      e = { im, ok: false };
      im.onload = () => { e.ok = true; onImageLoad(); };
      im.onerror = () => { e.err = true; };
      im.src = src;
      imgs.set(src, e);
    }
    return e.ok ? e.im : null;
  }
  function loadImage(src) {
    return new Promise((res, rej) => {
      const e = imgs.get(src);
      if (e && e.ok) return res(e.im);
      const im = new Image();
      im.onload = () => { imgs.set(src, { im, ok: true }); res(im); };
      im.onerror = () => rej(new Error('이미지를 불러오지 못했어요.'));
      im.src = src;
    });
  }
  function fontString(L) { return `${L.weight} ${L.size}px ${FONTS[L.font] || FONTS.Pretendard}`; }
  async function ensureFont(L) {
    if (!document.fonts) return;
    try { await document.fonts.load(fontString(L), L.text || '가'); } catch (e) { /* 폴백 글꼴 사용 */ }
  }
  async function preload(p) {
    for (const L of p.layers) {
      if (L.type === 'image' && L.src) await loadImage(L.src);
      if (L.type === 'text') await ensureFont(L);
    }
  }

  /* ---------- 그리기 ---------- */
  const scratch = document.createElement('canvas').getContext('2d');

  function hexToRgba(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return `rgba(255,255,255,${a})`;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function layerBox(L) {
    if (L.type === 'text') {
      scratch.font = fontString(L);
      const lines = String(L.text || '').split('\n');
      const w = Math.max(10, ...lines.map((t) => scratch.measureText(t).width)) + L.strokeW * 2;
      return { w, h: lines.length * L.size * 1.2 + L.strokeW * 2 };
    }
    if (L.type === 'image') {
      const e = imgs.get(L.src);
      const r = e && e.ok ? e.im.naturalHeight / e.im.naturalWidth : 1;
      return { w: L.w, h: L.w * r };
    }
    if (L.shape === 'slash') return { w: L.size, h: Math.max(20, L.size * L.ratio * 0.3) };
    return { w: L.size, h: L.size * L.ratio };
  }

  function starPath(ctx, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 ? r * 0.45 : r;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
  }

  function drawShape(ctx, L, glowPasses) {
    const r = L.size / 2;
    ctx.save();
    if (L.shape !== 'slash' && L.shape !== 'rect') ctx.scale(1, L.ratio);
    ctx.fillStyle = L.color;
    ctx.strokeStyle = L.color;
    for (let i = 0; i < glowPasses; i++) {
      switch (L.shape) {
        case 'orb': {
          const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
          gr.addColorStop(0, hexToRgba(L.color, 1));
          gr.addColorStop(0.35, hexToRgba(L.color, 0.55));
          gr.addColorStop(1, hexToRgba(L.color, 0));
          ctx.fillStyle = gr;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'circle':
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
          break;
        case 'ring':
          ctx.lineWidth = L.strokeW;
          ctx.beginPath(); ctx.arc(0, 0, Math.max(1, r - L.strokeW / 2), 0, Math.PI * 2); ctx.stroke();
          break;
        case 'rect':
          ctx.fillRect(-r, -(r * L.ratio), L.size, L.size * L.ratio);
          break;
        case 'star':
          starPath(ctx, r); ctx.fill();
          break;
        case 'slash': {
          const h = Math.max(10, L.size * L.ratio * 0.15);
          ctx.beginPath();
          ctx.moveTo(-r, 0);
          ctx.quadraticCurveTo(0, -h, r, 0);
          ctx.quadraticCurveTo(0, h * 0.18, -r, 0);
          ctx.closePath(); ctx.fill();
          break;
        }
      }
    }
    ctx.restore();
  }

  function drawLayer(ctx, L, st) {
    ctx.save();
    ctx.globalAlpha = clamp(L.opacity * st.a, 0, 1);
    ctx.globalCompositeOperation = BLEND_OPS[L.blend] || 'source-over';
    ctx.translate(L.x + st.dx, L.y + st.dy);
    ctx.rotate(((L.rot + st.rot) * Math.PI) / 180);
    const s = (L.scale / 100) * st.s;
    ctx.scale(s, s);

    const glow = L.glowBlur > 0;
    if (glow) { ctx.shadowColor = L.glowColor; ctx.shadowBlur = L.glowBlur; }
    const passes = glow ? 2 : 1;

    if (L.type === 'text') {
      ctx.font = fontString(L);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      const lines = String(L.text || '').split('\n');
      const lh = L.size * 1.2;
      const y0 = -((lines.length - 1) * lh) / 2;
      lines.forEach((t, i) => {
        const y = y0 + i * lh;
        if (L.strokeW > 0) {
          ctx.lineWidth = L.strokeW * 2;
          ctx.strokeStyle = L.stroke;
          ctx.strokeText(t, 0, y);
        }
        ctx.fillStyle = L.color;
        for (let k = 0; k < passes; k++) ctx.fillText(t, 0, y);
      });
    } else if (L.type === 'image') {
      const im = getImage(L.src);
      if (im) {
        const h = L.w * (im.naturalHeight / im.naturalWidth);
        for (let k = 0; k < passes; k++) ctx.drawImage(im, -L.w / 2, -h / 2, L.w, h);
      }
    } else if (L.type === 'shape') {
      drawShape(ctx, L, passes);
    }
    ctx.restore();
  }

  function renderFrame(ctx, p, time) {
    ctx.clearRect(0, 0, p.w, p.h);
    for (const L of p.layers) {
      if (L.visible === false) continue;
      const st = evalLayer(L, time);
      if (st) drawLayer(ctx, L, st);
    }
  }

  g.FX = {
    FONTS, IN_TYPES, OUT_TYPES, LOOP_TYPES, EASES, SHAPES, BLENDS,
    evalLayer, renderFrame, layerBox, preload, ensureFont, loadImage,
    setImageLoadHandler: (fn) => { onImageLoad = fn; }
  };
})(window);
