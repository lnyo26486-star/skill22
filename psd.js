/* PSD 가져오기: 레이어 구조를 읽어 편집기용 목록으로 펼칩니다.
 * ag-psd(MIT) 라이브러리가 PSD 파일을 해석하고, 여기서는 그 결과를 이펙트 편집기에 맞게 정리해요.
 * 순수 함수(flatten, cropRect 등)는 Node에서도 테스트할 수 있어요.
 */
(function (root) {
  'use strict';

  /* PSD 혼합 모드 → 편집기 겹침 모드. 목록에 없는 모드는 일반으로 가져오고 표시해 둬요. */
  const BLEND_MAP = {
    'normal': 'normal', 'pass through': 'normal',
    'darken': 'darken', 'multiply': 'multiply', 'color burn': 'color-burn',
    'lighten': 'lighten', 'screen': 'screen', 'color dodge': 'color-dodge', 'linear dodge': 'add',
    'overlay': 'overlay', 'soft light': 'soft-light', 'hard light': 'hard-light',
    'difference': 'difference', 'exclusion': 'exclusion',
    'hue': 'hue', 'saturation': 'saturation', 'color': 'color', 'luminosity': 'luminosity'
  };

  /** 레이어 사각형을 캔버스 영역(W×H)으로 자를 때의 좌표. 겹치는 부분이 없으면 null */
  function cropRect(left, top, w, h, W, H) {
    const x0 = Math.max(left, 0), y0 = Math.max(top, 0);
    const x1 = Math.min(left + w, W), y1 = Math.min(top + h, H);
    if (x1 <= x0 || y1 <= y0) return null;
    return { sx: x0 - left, sy: y0 - top, sw: x1 - x0, sh: y1 - y0, left: x0, top: y0 };
  }

  const FX_NAMES = {
    dropShadow: '그림자', innerShadow: '안쪽 그림자', innerGlow: '안쪽 광선', bevel: '경사와 엠보스',
    solidFill: '색상 오버레이', gradientOverlay: '그라디언트 오버레이', patternOverlay: '패턴 오버레이',
    stroke: '획(외곽선)', satin: '새틴', outerGlow: '외부 광선'
  };

  /** 켜져 있는 레이어 효과의 키 목록. 꺼진 기본값은 세지 않아요. */
  function enabledEffects(effects) {
    if (!effects) return [];
    return Object.keys(effects).filter((k) => {
      if (k === 'scale') return false;
      const v = effects[k];
      return (Array.isArray(v) ? v : [v]).some((x) => x && typeof x === 'object' && x.enabled);
    });
  }

  const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

  /** 외부 광선을 편집기의 '빛 번짐'으로 근사합니다. 없으면 null */
  function glowFrom(effects) {
    const g = effects && effects.outerGlow;
    const e = Array.isArray(g) ? g.find((x) => x && x.enabled) : g && g.enabled ? g : null;
    if (!e || !e.color) return null;
    const c = e.color;
    if (c.r == null) return null; // 그라디언트 광선 등은 건너뜀
    const size = e.size && e.size.value != null ? e.size.value : 6;
    return { color: '#' + hex2(c.r) + hex2(c.g) + hex2(c.b), blur: Math.max(4, Math.round(size * 2)) };
  }

  /**
   * 레이어 트리를 아래→위 순서의 평평한 목록으로 펼칩니다. (PSD의 children은 맨 아래 레이어부터예요)
   * 그룹의 숨김과 투명도는 안쪽 레이어에 반영해요.
   */
  function flatten(psd) {
    const out = [];
    (function walk(children, anc, depth) {
      for (const l of children || []) {
        const hidden = anc.hidden || !!l.hidden;
        const opacity = anc.opacity * (l.opacity != null ? l.opacity : 1);
        if (l.children) {
          out.push({ kind: 'group', name: l.name || '그룹', depth, hidden });
          walk(l.children, { hidden, opacity }, depth + 1);
          continue;
        }
        const src = l.canvas || l.imageData || null;
        const w = src ? src.width : 0, h = src ? src.height : 0;
        const bm = l.blendMode || 'normal';
        const mapped = BLEND_MAP[bm];
        out.push({
          kind: 'layer',
          name: l.name || '레이어',
          depth,
          hidden,
          opacity,
          blend: mapped || 'normal',
          blendLost: mapped ? '' : bm,
          src, w, h,
          left: l.left || 0,
          top: l.top || 0,
          isText: !!l.text,
          glow: glowFrom(l.effects),
          fxLost: enabledEffects(l.effects).filter((k) => k !== 'outerGlow').map((k) => FX_NAMES[k] || k),
          hasMask: !!(l.mask && (l.mask.canvas || l.mask.imageData)),
          clipped: !!l.clipping,
          empty: !src || !w || !h
        });
      }
    })(psd.children, { hidden: false, opacity: 1 }, 0);
    return out;
  }

  /** 포토샵 레이어 패널처럼 위에서 아래로, 그룹 머리글을 안쪽 레이어보다 앞에 두는 표시 순서 */
  function displayOrder(entries) {
    function build(i, depth) {
      const nodes = [];
      while (i < entries.length && entries[i].depth >= depth) {
        const node = { e: entries[i], children: [] };
        i++;
        if (node.e.kind === 'group') { const r = build(i, depth + 1); node.children = r[0]; i = r[1]; }
        nodes.push(node);
      }
      return [nodes, i];
    }
    const out = [];
    (function emit(nodes) {
      for (let k = nodes.length - 1; k >= 0; k--) { out.push(nodes[k].e); emit(nodes[k].children); }
    })(build(0, 0)[0]);
    return out;
  }

  /** 브라우저용: 파일을 읽어 { width, height, entries } 로 돌려줍니다. */
  async function parse(file) {
    if (typeof agPsd === 'undefined') throw new Error('PSD 해석 라이브러리(ag-psd.js)를 불러오지 못했어요.');
    const buf = await file.arrayBuffer();
    let psd;
    try {
      psd = agPsd.readPsd(buf, { skipCompositeImageData: true, skipThumbnail: true });
    } catch (e) {
      throw new Error('PSD를 읽지 못했어요. (PSB 같은 초대형 형식이나 손상된 파일은 지원하지 않아요)');
    }
    return { width: psd.width, height: psd.height, entries: flatten(psd) };
  }

  const API = { BLEND_MAP, cropRect, enabledEffects, glowFrom, flatten, displayOrder, parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.PSDImport = API;
})(typeof window !== 'undefined' ? window : globalThis);
