/* 이펙트 편집기: 레이어, 타임라인, 인스펙터, 내보내기 */
(function () {
  'use strict';
  const { $, $$, clamp, toast, uid } = U;
  const LS = 'fxs_project';
  const NAMES = { text: '텍스트', image: '이미지', shape: '도형' };
  const TYPE_DEFAULTS = {
    text: { text: '스킬 발동!', font: 'Black Han Sans', size: 72, weight: 400, color: '#ffffff', stroke: '#000000', strokeW: 6, inType: 'pop', outType: 'fade' },
    image: { src: '', w: 200, inType: 'pop', outType: 'fade' },
    shape: { shape: 'orb', size: 300, ratio: 1, color: '#ff8a3d', strokeW: 10, blend: 'add', inType: 'grow', outType: 'fade' }
  };

  const newProject = () => ({ w: 512, h: 512, fps: 30, dur: 1.5, layers: [] });
  function makeLayer(type, proj, extra = {}) {
    return Object.assign({
      id: uid(), type, name: NAMES[type], x: proj.w / 2, y: proj.h / 2, scale: 100, rot: 0, opacity: 1,
      blend: 'normal', visible: true, start: 0, dur: proj.dur,
      inType: 'none', inDur: 0.3, loopType: 'none', loopSpeed: 1, loopAmp: 1, outType: 'none', outDur: 0.3, ease: 'out',
      glowColor: '#ffffff', glowBlur: 0
    }, TYPE_DEFAULTS[type], extra);
  }
  function normalize(j) {
    const q = Object.assign(newProject(), j);
    q.layers = q.layers.map((L) => Object.assign(makeLayer(L.type || 'text', q), L));
    return q;
  }
  function loadSaved() {
    try {
      const j = JSON.parse(localStorage.getItem(LS));
      return j && Array.isArray(j.layers) ? normalize(j) : null;
    } catch (e) { return null; }
  }

  let p = loadSaved() || newProject();
  const S = { sel: null, time: 0, playing: false };
  const stage = $('#stage');
  const sctx = stage.getContext('2d');
  const cur = () => p.layers.find((l) => l.id === S.sel) || null;
  const round = (v) => Math.round(v * 100) / 100;

  /* ---------- 저장 ---------- */
  let saveT = null, saveWarned = false;
  function saveSoon() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try { localStorage.setItem(LS, JSON.stringify(p)); }
      catch (e) {
        if (!saveWarned) {
          saveWarned = true;
          toast('작업이 커서 자동 저장을 못 해요. "프로젝트 저장" 버튼으로 파일에 저장해 두세요.', 'error');
        }
      }
    }, 600);
  }

  /* ---------- 작은 DOM 도우미 ---------- */
  function h(tag, props = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') e.className = v;
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
      else if (k in e) e[k] = v;
      else e.setAttribute(k, v);
    }
    kids.flat().forEach((c) => e.append(c));
    return e;
  }

  /* ---------- 그리기 ---------- */
  function render() {
    sctx.clearRect(0, 0, p.w, p.h);
    FX.renderFrame(sctx, p, S.time);
    const L = cur();
    if (L && !S.playing && L.visible !== false) drawSelection(L);
  }
  function drawSelection(L) {
    const b = FX.layerBox(L);
    const s = L.scale / 100;
    sctx.save();
    sctx.translate(L.x, L.y);
    sctx.rotate((L.rot * Math.PI) / 180);
    sctx.scale(s, s);
    sctx.strokeStyle = '#ff6b9a';
    sctx.lineWidth = 2 / s;
    sctx.setLineDash([6 / s, 4 / s]);
    sctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
    sctx.restore();
  }
  FX.setImageLoadHandler(render);

  function fitStage() {
    const wrap = $('.stage-wrap');
    const cw = wrap.clientWidth - 24;
    const ch = Math.max(240, window.innerHeight * 0.5);
    const sc = Math.min(cw / p.w, ch / p.h, 2);
    stage.style.width = Math.max(40, p.w * sc) + 'px';
    stage.style.height = Math.max(40, p.h * sc) + 'px';
  }
  function applySize() {
    stage.width = p.w; stage.height = p.h;
    fitStage();
    render();
  }
  window.addEventListener('resize', fitStage);

  function setTime(t) {
    S.time = clamp(t, 0, p.dur);
    $('#scrub').value = S.time;
    $('#timeLabel').textContent = `${S.time.toFixed(2)} / ${p.dur.toFixed(2)}초`;
    $('#timeline').style.setProperty('--ph', p.dur ? S.time / p.dur : 0);
    render();
  }

  /* ---------- 재생 ---------- */
  function play() {
    if (S.playing) return;
    if (S.time >= p.dur) S.time = 0;
    S.playing = true;
    $('#btnPlay').textContent = '일시정지';
    let last = performance.now();
    const loop = (now) => {
      if (!S.playing) return;
      let t = S.time + (now - last) / 1000;
      last = now;
      if (t >= p.dur) {
        if ($('#loopPlay').checked) t %= p.dur;
        else { setTime(p.dur); pause(); return; }
      }
      setTime(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  function pause() {
    S.playing = false;
    $('#btnPlay').textContent = '재생';
    render();
  }
  $('#btnPlay').addEventListener('click', () => (S.playing ? pause() : play()));
  $('#scrub').addEventListener('input', (e) => { if (S.playing) pause(); setTime(parseFloat(e.target.value)); });
  $('#bgPrev').addEventListener('change', (e) => { $('.stage-wrap').dataset.bg = e.target.value; });

  /* ---------- 프로젝트 설정 ---------- */
  function syncProjectInputs() {
    $('#pW').value = p.w; $('#pH').value = p.h; $('#pFps').value = p.fps; $('#pDur').value = p.dur;
    $('#scrub').max = p.dur;
  }
  function onProjectChange() {
    const nw = clamp(parseInt($('#pW').value) || p.w, 16, 4096);
    const nh = clamp(parseInt($('#pH').value) || p.h, 16, 4096);
    const nf = clamp(parseInt($('#pFps').value) || p.fps, 5, 60);
    const nd = clamp(parseFloat($('#pDur').value) || p.dur, 0.2, 30);
    const dx = (nw - p.w) / 2, dy = (nh - p.h) / 2, od = p.dur;
    p.layers.forEach((L) => {
      L.x += dx; L.y += dy;
      if (Math.abs(L.start + L.dur - od) < 0.001) L.dur = Math.max(0.05, nd - L.start); // 끝까지 가던 레이어는 끝까지 유지
      else L.dur = Math.max(0.05, Math.min(L.dur, nd - L.start));
      L.start = Math.min(L.start, Math.max(0, nd - 0.05));
    });
    p.w = nw; p.h = nh; p.fps = nf; p.dur = nd;
    syncProjectInputs();
    applySize();
    setTime(Math.min(S.time, p.dur));
    buildTimeline(); buildInspector(); saveSoon();
  }
  ['pW', 'pH', 'pFps', 'pDur'].forEach((id) => $('#' + id).addEventListener('change', onProjectChange));

  /* ---------- 레이어 목록 ---------- */
  function selectLayer(id) {
    if (S.sel === id) return;
    S.sel = id;
    renderList(); buildInspector(); buildTimeline(); render();
  }
  function renderList() {
    const ul = $('#layerList');
    ul.innerHTML = '';
    if (!p.layers.length) {
      ul.append(h('li', { class: 'empty' }, '아직 레이어가 없어요. 위에서 텍스트·이미지·도형을 추가하거나 템플릿으로 시작해 보세요.'));
      return;
    }
    [...p.layers].reverse().forEach((L) => {
      const idx = p.layers.indexOf(L);
      ul.append(h('li', { class: L.id === S.sel ? 'sel' : '' },
        h('input', { type: 'checkbox', checked: L.visible !== false, title: '표시', 'aria-label': `${L.name} 표시`, on: { change: (e) => { L.visible = e.target.checked; render(); saveSoon(); } } }),
        h('button', { class: 'nm', on: { click: () => selectLayer(L.id) } }, L.name || NAMES[L.type]),
        h('span', { class: 'ops' },
          h('button', { title: '앞으로', 'aria-label': '앞으로', disabled: idx === p.layers.length - 1, on: { click: () => moveLayer(L, 1) } }, '↑'),
          h('button', { title: '뒤로', 'aria-label': '뒤로', disabled: idx === 0, on: { click: () => moveLayer(L, -1) } }, '↓'),
          h('button', { on: { click: () => dupLayer(L) } }, '복제'),
          h('button', { class: 'danger', on: { click: () => delLayer(L) } }, '삭제'))));
    });
  }
  function moveLayer(L, d) {
    const i = p.layers.indexOf(L), j = i + d;
    if (j < 0 || j >= p.layers.length) return;
    p.layers.splice(i, 1); p.layers.splice(j, 0, L);
    renderList(); buildTimeline(); render(); saveSoon();
  }
  function dupLayer(L) {
    const c = Object.assign({}, L, { id: uid(), name: L.name + ' 복사', x: L.x + 20, y: L.y + 20 });
    p.layers.splice(p.layers.indexOf(L) + 1, 0, c);
    S.sel = c.id;
    renderList(); buildInspector(); buildTimeline(); render(); saveSoon();
  }
  function delLayer(L) {
    p.layers.splice(p.layers.indexOf(L), 1);
    if (S.sel === L.id) S.sel = null;
    renderList(); buildInspector(); buildTimeline(); render(); saveSoon();
  }
  function addLayer(L) {
    p.layers.push(L);
    S.sel = L.id;
    renderList(); buildInspector(); buildTimeline();
    FX.ensureFont(L).then(render);
    render(); saveSoon();
  }

  /* ---------- 추가 버튼 ---------- */
  $('#addText').addEventListener('click', () => addLayer(makeLayer('text', p)));
  $('#addShape').addEventListener('click', () => addLayer(makeLayer('shape', p)));
  $('#addImage').addEventListener('click', () => $('#fileImg').click());
  $('#fileImg').addEventListener('change', async (e) => {
    for (const f of e.target.files) await addImageFromBlob(f, f.name);
    e.target.value = '';
  });
  async function addImageFromBlob(blob, name) {
    try {
      const src = await U.readAsDataURL(blob);
      const im = await FX.loadImage(src);
      addLayer(makeLayer('image', p, { src, w: Math.round(Math.min(im.naturalWidth, p.w * 0.6)), name: (name || '이미지').replace(/\.[^.]+$/, '') }));
    } catch (err) { toast(err.message, 'error'); }
  }
  $('#addImgUrl').addEventListener('click', async () => {
    const url = $('#imgUrl').value.trim();
    if (!url) return toast('이미지 주소를 입력해 주세요.', 'error');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('이미지를 가져오지 못했어요 (' + res.status + ')');
      await addImageFromBlob(await res.blob(), url.split('/').pop().split('?')[0]);
      $('#imgUrl').value = '';
    } catch (err) {
      toast('주소에서 가져오지 못했어요. 이미지 서버가 다른 사이트의 접근(CORS)을 허용해야 해요. 파일로 추가하거나 GitHub 링크를 써 보세요.', 'error');
    }
  });

  /* ---------- 템플릿 ---------- */
  const TEMPLATES = {
    skill: { label: '스킬 이름 팝업', build: (q) => [
      makeLayer('shape', q, { name: '불꽃빛', shape: 'orb', size: 420, color: '#ff7a2e', opacity: 0.85, inType: 'grow', inDur: 0.35, outType: 'fade', outDur: 0.4, loopType: 'pulse', loopSpeed: 2, loopAmp: 1.5 }),
      makeLayer('shape', q, { name: '충격파', shape: 'ring', size: 340, strokeW: 12, color: '#ffd27a', inType: 'grow', inDur: 0.4, outType: 'zoom', outDur: 0.4 }),
      makeLayer('text', q, { name: '스킬명', text: '화염 폭풍!', size: 84, color: '#fff3d6', stroke: '#b02a00', strokeW: 8, glowColor: '#ff7a2e', glowBlur: 24, inType: 'pop', inDur: 0.3, loopType: 'shake', loopSpeed: 1, loopAmp: 0.5, outType: 'fade' })
    ] },
    damage: { label: '데미지 숫자', build: (q) => [
      makeLayer('text', q, { name: '데미지', text: '1,234', size: 96, color: '#ff4d4d', stroke: '#3a0000', strokeW: 8, inType: 'pop', inDur: 0.18, outType: 'float', outDur: 0.5 })
    ] },
    crit: { label: '크리티컬', build: (q) => [
      makeLayer('shape', q, { name: '베기 1', shape: 'slash', size: 440, ratio: 1, rot: -35, color: '#ffffff', inType: 'slideRight', inDur: 0.18, outType: 'fade', outDur: 0.35, glowColor: '#ffae00', glowBlur: 18 }),
      makeLayer('shape', q, { name: '베기 2', shape: 'slash', size: 400, ratio: 1, rot: 28, color: '#ffe14d', start: 0.1, dur: Math.max(0.2, q.dur - 0.1), inType: 'slideLeft', inDur: 0.18, outType: 'fade', outDur: 0.35 }),
      makeLayer('text', q, { name: '크리티컬', text: 'CRITICAL!', font: 'Do Hyeon', size: 92, color: '#ffe14d', stroke: '#7a1b00', strokeW: 8, glowColor: '#ffae00', glowBlur: 22, inType: 'zoom', inDur: 0.2, loopType: 'shake', loopSpeed: 1, loopAmp: 1.2, outType: 'fade' })
    ] },
    heal: { label: '회복', build: (q) => [
      makeLayer('shape', q, { name: '회복빛', shape: 'orb', size: 380, color: '#5dffa0', opacity: 0.8, inType: 'fade', inDur: 0.4, outType: 'fade', outDur: 0.4, loopType: 'pulse', loopSpeed: 1.5, loopAmp: 1.5 }),
      makeLayer('text', q, { name: '회복량', text: '+320', size: 88, color: '#c9ffe0', stroke: '#0b5a35', strokeW: 7, glowColor: '#5dffa0', glowBlur: 20, inType: 'slideUp', inDur: 0.35, loopType: 'float', loopSpeed: 1, loopAmp: 0.8, outType: 'fade' })
    ] }
  };
  const tplSel = $('#tplSel');
  Object.entries(TEMPLATES).forEach(([k, t]) => tplSel.append(h('option', { value: k }, t.label)));
  tplSel.addEventListener('change', () => {
    const t = TEMPLATES[tplSel.value];
    if (!t) return;
    const layers = t.build(p);
    p.layers.push(...layers);
    S.sel = layers[layers.length - 1].id;
    renderList(); buildInspector(); buildTimeline();
    Promise.all(layers.map(FX.ensureFont)).then(render);
    render(); saveSoon();
    tplSel.value = '';
  });

  /* ---------- 인스펙터 ---------- */
  function changed(k) {
    render();
    if (k === 'name') { renderList(); buildTimeline(); }
    if (k === 'start' || k === 'dur') buildTimeline();
    if (['font', 'weight', 'size', 'text'].includes(k)) { const L = cur(); if (L && L.type === 'text') FX.ensureFont(L).then(render); }
    saveSoon();
  }

  function buildInspector() {
    const box = $('#inspector');
    box.innerHTML = '';
    const L = cur();
    if (!L) {
      box.append(h('p', { class: 'empty' }, '레이어를 선택하면 여기서 다듬을 수 있어요. 화면에서 직접 끌어 옮길 수도 있어요.'));
      return;
    }
    const set = (k, v) => { L[k] = v; changed(k); };
    const field = (label, input, wide) => h('label', { class: 'f' + (wide ? ' wide' : '') }, h('span', {}, label), input);
    const num = (label, k, o = {}) => {
      const i = h('input', { type: 'number', step: o.step != null ? o.step : 1 });
      if (o.min != null) i.min = o.min;
      if (o.max != null) i.max = o.max;
      i.value = round(L[k]);
      i.dataset.k = k;
      i.addEventListener('input', () => { const v = parseFloat(i.value); if (!isNaN(v)) set(k, v); });
      return field(label, i);
    };
    const color = (label, k) => field(label, h('input', { type: 'color', value: L[k], on: { input: (e) => set(k, e.target.value) } }));
    const select = (label, k, opts) => {
      const s = h('select', { on: { change: (e) => set(k, e.target.value) } },
        opts.map(([v, t]) => h('option', { value: v }, t)));
      s.value = L[k];
      return field(label, s);
    };
    const sec = (t) => h('h4', {}, t);

    box.append(sec('기본'),
      field('이름', h('input', { type: 'text', value: L.name, on: { input: (e) => set('name', e.target.value) } }), true));

    if (L.type === 'text') {
      box.append(sec('글자'),
        field('내용', h('textarea', { rows: 2, value: L.text, on: { input: (e) => set('text', e.target.value) } }), true),
        select('글꼴', 'font', Object.keys(FX.FONTS).map((f) => [f, f])),
        h('label', { class: 'f' }, h('span', {}, '굵기'), (() => {
          const s = h('select', { on: { change: (e) => set('weight', parseInt(e.target.value)) } }, [400, 500, 700, 900].map((w) => h('option', { value: w }, w)));
          s.value = L.weight; return s;
        })()),
        num('크기(px)', 'size', { min: 8, max: 600 }),
        color('글자색', 'color'), color('외곽선색', 'stroke'),
        num('외곽선 두께', 'strokeW', { min: 0, max: 60 }));
    } else if (L.type === 'image') {
      box.append(sec('이미지'),
        num('너비(px)', 'w', { min: 4, max: 4000 }),
        h('button', { class: 'wide-btn', on: { click: () => { const f = $('#fileReplace'); f.onchange = async () => { if (f.files[0]) { L.src = await U.readAsDataURL(f.files[0]); await FX.loadImage(L.src); render(); saveSoon(); } f.value = ''; }; f.click(); } } }, '다른 이미지로 교체'));
    } else {
      box.append(sec('도형'),
        select('모양', 'shape', FX.SHAPES),
        num('크기(px)', 'size', { min: 4, max: 2000 }),
        num('세로 비율', 'ratio', { min: 0.05, max: 4, step: 0.05 }),
        color('색', 'color'),
        num('링 두께', 'strokeW', { min: 1, max: 200 }));
    }

    box.append(sec('위치와 모양'),
      num('X', 'x'), num('Y', 'y'),
      num('크기(%)', 'scale', { min: 1, max: 1000 }), num('회전(도)', 'rot'),
      num('투명도', 'opacity', { min: 0, max: 1, step: 0.05 }),
      sec('시간'),
      num('시작(초)', 'start', { min: 0, step: 0.05 }), num('길이(초)', 'dur', { min: 0.05, step: 0.05 }),
      sec('모션'),
      select('등장', 'inType', FX.IN_TYPES), num('등장 시간', 'inDur', { min: 0, step: 0.05 }),
      select('반복', 'loopType', FX.LOOP_TYPES), num('반복 속도', 'loopSpeed', { min: 0.1, step: 0.1 }),
      num('반복 세기', 'loopAmp', { min: 0, step: 0.1 }), h('span'),
      select('퇴장', 'outType', FX.OUT_TYPES), num('퇴장 시간', 'outDur', { min: 0, step: 0.05 }),
      select('움직임 곡선', 'ease', FX.EASES), h('span'),
      sec('빛과 겹침'),
      select('겹침', 'blend', FX.BLENDS),
      color('빛 색', 'glowColor'), num('빛 번짐', 'glowBlur', { min: 0, max: 200 }));
  }
  function syncXY() {
    const L = cur();
    if (!L) return;
    ['x', 'y'].forEach((k) => { const i = $(`#inspector [data-k="${k}"]`); if (i) i.value = round(L[k]); });
  }

  /* ---------- 타임라인 ---------- */
  function buildTimeline() {
    const tl = $('#timeline');
    tl.innerHTML = '';
    const ruler = h('div', { class: 'tl-row ruler' }, h('div', { class: 'tl-name' }, '시간'), h('div', { class: 'tl-track' }));
    const ticks = Math.max(1, Math.floor(p.dur / 0.5));
    for (let i = 0; i <= ticks; i++) {
      const t = i * 0.5;
      if (t > p.dur) break;
      ruler.lastChild.append(h('span', { class: 'tick', style: `left:${(t / p.dur) * 100}%` }, Number.isInteger(t) ? t + 's' : ''));
    }
    tl.append(ruler);
    const scrubFromEvent = (e) => {
      const r = ruler.lastChild.getBoundingClientRect();
      if (S.playing) pause();
      setTime(((e.clientX - r.left) / r.width) * p.dur);
    };
    ruler.lastChild.addEventListener('pointerdown', (e) => {
      scrubFromEvent(e);
      ruler.lastChild.setPointerCapture(e.pointerId);
      const mv = (ev) => scrubFromEvent(ev);
      const up = () => { ruler.lastChild.removeEventListener('pointermove', mv); ruler.lastChild.removeEventListener('pointerup', up); };
      ruler.lastChild.addEventListener('pointermove', mv);
      ruler.lastChild.addEventListener('pointerup', up);
    });

    [...p.layers].reverse().forEach((L) => {
      const bar = h('div', { class: 'bar t-' + L.type });
      const place = () => { bar.style.left = (L.start / p.dur) * 100 + '%'; bar.style.width = (L.dur / p.dur) * 100 + '%'; };
      place();
      const track = h('div', { class: 'tl-track' }, bar);
      bar.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        selectLayer(L.id);
        const r = bar.getBoundingClientRect();
        const off = e.clientX - r.left;
        const mode = off < 8 ? 'left' : off > r.width - 8 ? 'right' : 'move';
        const tw = track.getBoundingClientRect().width;
        const o = { x: e.clientX, start: L.start, dur: L.dur };
        const snap = (v) => Math.round(v / 0.05) * 0.05;
        bar.setPointerCapture(e.pointerId);
        const mv = (ev) => {
          const dt = ((ev.clientX - o.x) / tw) * p.dur;
          const end = o.start + o.dur;
          if (mode === 'move') L.start = clamp(snap(o.start + dt), 0, Math.max(0, p.dur - 0.05));
          else if (mode === 'left') { L.start = clamp(snap(o.start + dt), 0, end - 0.05); L.dur = end - L.start; }
          else L.dur = clamp(snap(o.dur + dt), 0.05, p.dur - L.start);
          L.start = round(L.start); L.dur = round(L.dur);
          place(); render();
        };
        const up = () => {
          bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up);
          buildInspector(); saveSoon();
        };
        bar.addEventListener('pointermove', mv);
        bar.addEventListener('pointerup', up);
      });
      tl.append(h('div', { class: 'tl-row' + (L.id === S.sel ? ' sel' : '') },
        h('button', { class: 'tl-name', on: { click: () => selectLayer(L.id) } }, L.name || NAMES[L.type]), track));
    });
    tl.append(h('div', { class: 'playhead' }));
    tl.style.setProperty('--ph', p.dur ? S.time / p.dur : 0);
  }

  /* ---------- 화면에서 직접 끌기 ---------- */
  let drag = null;
  const toStage = (e) => {
    const r = stage.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * p.w) / r.width, y: ((e.clientY - r.top) * p.h) / r.height };
  };
  function hit(pt) {
    for (let i = p.layers.length - 1; i >= 0; i--) {
      const L = p.layers[i];
      if (L.visible === false || S.time < L.start || S.time > L.start + L.dur) continue;
      const a = (-L.rot * Math.PI) / 180, s = L.scale / 100;
      const dx = pt.x - L.x, dy = pt.y - L.y;
      const lx = (dx * Math.cos(a) - dy * Math.sin(a)) / s, ly = (dx * Math.sin(a) + dy * Math.cos(a)) / s;
      const b = FX.layerBox(L);
      if (Math.abs(lx) <= b.w / 2 + 8 && Math.abs(ly) <= b.h / 2 + 8) return L;
    }
    return null;
  }
  stage.addEventListener('pointerdown', (e) => {
    const pt = toStage(e);
    const L = hit(pt);
    const id = L ? L.id : null;
    if (id !== S.sel) { S.sel = id; renderList(); buildInspector(); buildTimeline(); }
    render();
    if (L) { drag = { L, x: pt.x, y: pt.y }; stage.setPointerCapture(e.pointerId); }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const pt = toStage(e);
    drag.L.x = round(drag.L.x + pt.x - drag.x);
    drag.L.y = round(drag.L.y + pt.y - drag.y);
    drag.x = pt.x; drag.y = pt.y;
    syncXY(); render();
  });
  const endDrag = () => { if (drag) { drag = null; saveSoon(); } };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  document.addEventListener('keydown', (e) => {
    if ($('#tab-editor').hidden) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    const L = cur();
    if (!L) return;
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'Delete' || e.key === 'Backspace') { delLayer(L); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { L.x -= step; syncXY(); render(); saveSoon(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { L.x += step; syncXY(); render(); saveSoon(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { L.y -= step; syncXY(); render(); saveSoon(); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { L.y += step; syncXY(); render(); saveSoon(); e.preventDefault(); }
  });

  /* ---------- 프로젝트 파일 ---------- */
  $('#btnNew').addEventListener('click', () => {
    if (p.layers.length && !confirm('지금 작업을 지우고 새로 시작할까요? (저장하지 않은 내용은 사라져요)')) return;
    p = newProject(); S.sel = null;
    syncProjectInputs(); applySize(); setTime(0); renderList(); buildInspector(); buildTimeline(); saveSoon();
  });
  $('#btnSave').addEventListener('click', () => {
    U.download(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), 'effect-project.json');
  });
  $('#btnLoad').addEventListener('click', () => $('#fileProj').click());
  $('#fileProj').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      p = normalize(JSON.parse(await f.text()));
      S.sel = null;
      syncProjectInputs(); applySize(); setTime(0); renderList(); buildInspector(); buildTimeline();
      await FX.preload(p); render(); saveSoon();
      toast('프로젝트를 불러왔어요');
    } catch (err) { toast('프로젝트 파일을 읽지 못했어요.', 'error'); }
  });

  /* ---------- 내보내기 ---------- */
  const prog = $('#progress');
  prog.addEventListener('cancel', (e) => e.preventDefault());
  function showProgress(msg) { $('#progMsg').textContent = msg; $('#progBar').value = 0; prog.showModal(); }
  const setProgress = (v) => { $('#progBar').value = v; };

  async function doExport(kind) {
    if (!p.layers.length) return toast('내보낼 레이어가 없어요.', 'error');
    if (S.playing) pause();
    const base = U.slug($('#expName').value || 'effect');
    try {
      if (kind === 'png') {
        const c = document.createElement('canvas');
        c.width = p.w; c.height = p.h;
        await FX.preload(p);
        FX.renderFrame(c.getContext('2d'), p, S.time);
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        return U.showResult(blob, base + '.png');
      }
      showProgress(kind === 'webp' ? '프레임을 만드는 중…' : '녹화 중… 이 탭을 그대로 보고 있어 주세요');
      await FX.preload(p);
      let blob;
      if (kind === 'webp') {
        blob = await Export.encodeWebP({
          width: p.w, height: p.h, count: Math.max(1, Math.round(p.dur * p.fps)),
          quality: parseFloat($('#webpQ').value), onProgress: setProgress,
          getFrame: (i, ctx) => { FX.renderFrame(ctx, p, i / p.fps); return 1000 / p.fps; }
        });
      } else {
        blob = await Export.recordWebM({
          width: p.w, height: p.h, durationMs: p.dur * 1000, fps: p.fps, codec: $('#webmCodec').value,
          onProgress: setProgress, draw: (t, ctx) => FX.renderFrame(ctx, p, t / 1000)
        });
      }
      prog.close();
      U.showResult(blob, `${base}.${kind}`);
    } catch (err) {
      if (prog.open) prog.close();
      toast(err.message || '내보내기에 실패했어요.', 'error');
    }
  }
  $('#expWebp').addEventListener('click', () => doExport('webp'));
  $('#expWebm').addEventListener('click', () => doExport('webm'));
  $('#expPng').addEventListener('click', () => doExport('png'));

  /* ---------- PSD 가져오기 ---------- */
  const psdDlg = $('#psdDlg');
  let psdState = null;
  const nextPaint = () => new Promise((r) => setTimeout(r, 40));

  $('#addPsd').addEventListener('click', () => $('#filePsd').click());
  $('#filePsd').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    showProgress('PSD를 읽는 중…');
    $('#progBar').removeAttribute('value');
    await nextPaint();
    try {
      psdState = await PSDImport.parse(f);
      psdState.fileName = f.name;
      prog.close();
      openPsdDialog();
    } catch (err) {
      if (prog.open) prog.close();
      toast(err.message, 'error');
    }
  });

  function openPsdDialog() {
    const { width, height, entries } = psdState;
    const fitOk = width <= 4096 && height <= 4096;
    $('#psdInfo').textContent = `${psdState.fileName} · ${width}×${height}px · 레이어 ${entries.filter((x) => x.kind === 'layer').length}개`;
    $('#psdFit').checked = fitOk;
    $('#psdFit').disabled = !fitOk;
    $('#psdReplace').checked = false;
    const ul = $('#psdList');
    ul.innerHTML = '';
    PSDImport.displayOrder(entries).forEach((en) => {
      const pad = `padding-left:${en.depth * 18}px`;
      if (en.kind === 'group') {
        ul.append(h('li', { class: 'grp', style: pad }, `그룹 · ${en.name}${en.hidden ? ' (숨김)' : ''}`));
        return;
      }
      const cb = h('input', { type: 'checkbox', checked: !en.hidden && !en.empty, disabled: en.empty, 'aria-label': `${en.name} 가져오기` });
      en.cb = cb;
      const th = h('canvas', { width: 48, height: 48, class: 'checker' });
      if (!en.empty && en.src && en.src.getContext) {
        const s = Math.min(48 / en.w, 48 / en.h);
        const tw = Math.max(1, en.w * s), tt = Math.max(1, en.h * s);
        th.getContext('2d').drawImage(en.src, (48 - tw) / 2, (48 - tt) / 2, tw, tt);
      }
      const tags = [];
      if (en.isText) tags.push('텍스트(이미지로 가져옴)');
      if (en.hidden) tags.push('숨김');
      if (en.blend !== 'normal') tags.push('겹침: ' + (FX.BLENDS.find((b) => b[0] === en.blend) || [0, en.blend])[1]);
      if (en.blendLost) tags.push(`겹침 "${en.blendLost}"은 지원 안 해 일반으로`);
      if (en.glow) tags.push('외부 광선 → 빛 번짐으로 근사');
      if (en.fxLost.length) tags.push('효과 무시: ' + en.fxLost.join(', '));
      if (en.hasMask) tags.push('마스크 무시');
      if (en.clipped) tags.push('클리핑 무시');
      if (en.empty) tags.push('이미지 없음');
      ul.append(h('li', { style: pad },
        h('label', { class: 'psd-row' }, cb, th,
          h('span', { class: 'psd-meta' },
            h('strong', {}, en.name),
            h('small', {}, [en.empty ? '' : `${en.w}×${en.h}`, ...tags].filter(Boolean).join(' · '))))));
    });
    psdDlg.showModal();
  }
  const psdChecks = () => psdState.entries.filter((e) => e.kind === 'layer' && e.cb && !e.cb.disabled);
  $('#psdAll').addEventListener('click', () => psdChecks().forEach((e) => { e.cb.checked = true; }));
  $('#psdNone').addEventListener('click', () => psdChecks().forEach((e) => { e.cb.checked = false; }));

  /* 레이어 하나를 PNG 데이터로. 캔버스 밖을 자르고, 완전히 투명하면 null */
  function layerImage(en, crop, W, H) {
    let r = { sx: 0, sy: 0, sw: en.w, sh: en.h, left: en.left, top: en.top };
    if (crop) { r = PSDImport.cropRect(en.left, en.top, en.w, en.h, W, H); if (!r) return null; }
    const c = document.createElement('canvas');
    c.width = r.sw; c.height = r.sh;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(en.src, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
    const d = cx.getImageData(0, 0, r.sw, r.sh).data;
    let any = false;
    for (let i = 3; i < d.length; i += 4) if (d[i]) { any = true; break; }
    if (!any) return null;
    return { src: c.toDataURL('image/png'), w: r.sw, h: r.sh, left: r.left, top: r.top };
  }

  $('#psdGo').addEventListener('click', async () => {
    const picks = psdState.entries.filter((e) => e.kind === 'layer' && e.cb && e.cb.checked);
    if (!picks.length) return toast('가져올 레이어를 선택해 주세요.', 'error');
    const { width: W, height: H } = psdState;
    const fit = $('#psdFit').checked, crop = $('#psdCrop').checked, replace = $('#psdReplace').checked;
    psdDlg.close();
    if (S.playing) pause();
    showProgress('레이어를 가져오는 중…');
    await nextPaint();
    try {
      if (replace) { p.layers = []; S.sel = null; }
      let ox = 0, oy = 0;
      if (fit) {
        const dx = (W - p.w) / 2, dy = (H - p.h) / 2;
        p.layers.forEach((L) => { L.x += dx; L.y += dy; });
        p.w = W; p.h = H;
        syncProjectInputs();
        applySize();
      } else { ox = (p.w - W) / 2; oy = (p.h - H) / 2; }

      const made = [];
      let blank = 0;
      for (let i = 0; i < picks.length; i++) {
        const en = picks[i];
        const img = layerImage(en, crop, W, H);
        if (!img) blank++;
        else {
          made.push(makeLayer('image', p, {
            name: en.name, src: img.src, w: img.w,
            x: img.left + img.w / 2 + ox, y: img.top + img.h / 2 + oy,
            opacity: round(en.opacity), blend: en.blend, inType: 'none', outType: 'none',
            glowColor: en.glow ? en.glow.color : '#ffffff', glowBlur: en.glow ? en.glow.blur : 0
          }));
        }
        $('#progBar').value = (i + 1) / picks.length;
        await new Promise((r) => setTimeout(r));
      }
      p.layers.push(...made);
      await Promise.all(made.map((L) => FX.loadImage(L.src)));
      S.sel = made.length ? made[made.length - 1].id : null;
      prog.close();
      renderList(); buildInspector(); buildTimeline(); setTime(S.time);
      saveSoon();
      const lost = picks.filter((e) => e.blendLost).length;
      toast(`${made.length}개 레이어를 가져왔어요` + (blank ? ` (빈 레이어 ${blank}개 제외)` : '') + (lost ? ` · 지원 안 하는 겹침 ${lost}개는 일반으로` : ''));
    } catch (err) {
      if (prog.open) prog.close();
      toast('가져오지 못했어요: ' + (err.message || err), 'error');
    }
    psdState = null;
  });

  /* ---------- 시작 ---------- */
  window.Editor = { pause, refresh: () => { fitStage(); render(); } };
  syncProjectInputs();
  applySize();
  renderList(); buildInspector(); buildTimeline(); setTime(0);
  FX.preload(p).then(render);
  if (document.fonts) document.fonts.ready.then(render);
})();
