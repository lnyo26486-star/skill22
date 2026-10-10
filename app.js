/* 앱 공통: 탭, 결과 창, GitHub 연결, 이미지 링크, APNG 변환 */
(function () {
  'use strict';
  const { $, $$, toast, fmtBytes } = U;

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

  /* ---------- 탭 ---------- */
  function showTab(name) {
    $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    $$('.tab').forEach((s) => { s.hidden = s.id !== 'tab-' + name; });
    if (name !== 'editor' && window.Editor) Editor.pause();
    if (name === 'editor' && window.Editor) Editor.refresh();
    history.replaceState(null, '', '#' + name);
  }
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  /* ---------- 링크 목록 (복사 줄) ---------- */
  function linkRows(r, type) {
    const isVideo = (type || '').startsWith('video');
    const rows = [
      ['주소 (jsDelivr, 권장)', r.cdn],
      ['주소 (GitHub raw)', r.raw],
      [isVideo ? 'video 태그' : 'img 태그', isVideo
        ? `<video src="${r.cdn}" autoplay loop muted playsinline></video>`
        : `<img src="${r.cdn}" alt="">`]
    ];
    if (!isVideo) rows.push(['마크다운', `![](${r.cdn})`]);
    return h('div', { class: 'links' }, rows.map(([label, val]) =>
      h('div', { class: 'link-row' },
        h('span', {}, label),
        h('input', { type: 'text', readOnly: true, value: val, on: { focus: (e) => e.target.select() } }),
        h('button', { on: { click: () => U.copyText(val) } }, '복사'))));
  }

  /* ---------- 결과 창 ---------- */
  const resDlg = $('#result');
  let resUrl = null, resState = null;
  U.showResult = function (blob, name) {
    resState = { blob, name };
    if (resUrl) URL.revokeObjectURL(resUrl);
    resUrl = URL.createObjectURL(blob);
    const isVideo = blob.type.startsWith('video');
    const prev = $('#resPreview');
    prev.innerHTML = '';
    prev.append(isVideo
      ? h('video', { src: resUrl, autoplay: true, loop: true, muted: true, playsInline: true, controls: true })
      : h('img', { src: resUrl, alt: '결과 미리보기' }));
    $('#resInfo').textContent = `${name} · ${fmtBytes(blob.size)}`;
    $('#resLinks').innerHTML = '';
    $('#resNote').hidden = !isVideo;
    resDlg.showModal();
  };
  resDlg.addEventListener('close', () => { if (resUrl) { URL.revokeObjectURL(resUrl); resUrl = null; } });
  $('#resDownload').addEventListener('click', () => U.download(resState.blob, resState.name));
  $('#resUpload').addEventListener('click', async (e) => {
    if (!GH.ready()) {
      resDlg.close();
      showTab('links');
      return toast('먼저 GitHub 연결을 설정해 주세요.', 'error');
    }
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = '올리는 중…';
    try {
      const r = await GH.upload(resState.blob, resState.name);
      $('#resLinks').innerHTML = '';
      $('#resLinks').append(linkRows(r, resState.blob.type));
      toast('올렸어요');
    } catch (err) { toast(err.message, 'error'); }
    btn.disabled = false; btn.textContent = 'GitHub에 올리고 링크 받기';
  });

  /* ---------- GitHub 설정 ---------- */
  function loadGhForm() {
    const c = GH.load();
    $('#ghToken').value = c.token || '';
    $('#ghRepo').value = c.repo || '';
    $('#ghBranch').value = c.branch || 'main';
    $('#ghDir').value = c.dir != null ? c.dir : 'assets';
  }
  function readGhForm() {
    return {
      token: $('#ghToken').value.trim(),
      repo: $('#ghRepo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, ''),
      branch: $('#ghBranch').value.trim() || 'main',
      dir: $('#ghDir').value.trim()
    };
  }
  $('#ghSave').addEventListener('click', () => {
    const c = readGhForm();
    GH.save(c);
    $('#ghRepo').value = c.repo;
    toast(GH.ready(c) ? '저장했어요' : '토큰과 저장소(사용자/저장소)를 모두 입력해 주세요', GH.ready(c) ? 'info' : 'error');
  });
  $('#ghTest').addEventListener('click', async () => {
    GH.save(readGhForm());
    const btn = $('#ghTest');
    btn.disabled = true;
    try {
      const r = await GH.test();
      if (!r.push) toast('저장소는 찾았지만 쓰기 권한이 없어요. 토큰의 Contents 권한을 Read and write로 해 주세요.', 'error');
      else if (r.private) toast('연결됐어요. 다만 비공개 저장소라 외부(게임)에서는 링크가 열리지 않아요. 공개 저장소를 쓰세요.', 'error');
      else toast('연결 성공! 올릴 준비가 됐어요');
    } catch (err) { toast(err.message, 'error'); }
    btn.disabled = false;
  });
  $('#ghClear').addEventListener('click', () => {
    GH.save({});
    loadGhForm();
    toast('저장된 토큰과 설정을 지웠어요');
  });
  loadGhForm();

  /* ---------- 이미지 링크 탭 ---------- */
  const items = [];
  const list = $('#linkItems');

  function addFiles(files) {
    for (const f of files) {
      if (!/^(image|video\/webm)/.test(f.type)) { toast(`${f.name}: 이미지(또는 WebM)만 올릴 수 있어요`, 'error'); continue; }
      items.push({ file: f, url: URL.createObjectURL(f), busy: false, res: null });
    }
    renderItems();
  }
  function renderItems() {
    list.innerHTML = '';
    $('#upAll').hidden = !items.length;
    items.forEach((it, idx) => {
      const isVideo = it.file.type.startsWith('video');
      const thumb = isVideo ? h('video', { src: it.url, muted: true, loop: true, autoplay: true, playsInline: true }) : h('img', { src: it.url, alt: '' });
      list.append(h('li', {},
        h('div', { class: 'thumb checker' }, thumb),
        h('div', { class: 'meta' },
          h('strong', {}, it.file.name),
          h('small', {}, fmtBytes(it.file.size)),
          h('div', { class: 'row-btns' },
            h('button', { class: 'primary', disabled: it.busy, on: { click: () => uploadItem(it) } }, it.busy ? '올리는 중…' : it.res ? '다시 올리기' : 'GitHub에 올리기'),
            h('button', { on: { click: async () => { U.copyText(await U.readAsDataURL(it.file)); } } }, 'Data URL 복사'),
            h('button', { class: 'danger', on: { click: () => { URL.revokeObjectURL(it.url); items.splice(idx, 1); renderItems(); } } }, '빼기')),
          it.res ? linkRows(it.res, it.file.type) : '')));
    });
  }
  async function uploadItem(it) {
    if (!GH.ready()) { $('#ghSettings').open = true; return toast('위에서 GitHub 연결을 먼저 설정해 주세요.', 'error'); }
    it.busy = true; renderItems();
    try { it.res = await GH.upload(it.file, it.file.name); }
    catch (err) { toast(err.message, 'error'); }
    it.busy = false; renderItems();
  }
  $('#upAll').addEventListener('click', async () => { for (const it of items) if (!it.res) await uploadItem(it); });

  const dz = $('#dropzone'), fileIn = $('#fileLinks');
  dz.addEventListener('click', () => fileIn.click());
  dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
  fileIn.addEventListener('change', () => { addFiles(fileIn.files); fileIn.value = ''; });
  const dropable = (el, onFiles) => {
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); onFiles(e.dataTransfer.files); });
  };
  dropable(dz, addFiles);
  document.addEventListener('paste', (e) => {
    if ($('#tab-links').hidden) return;
    const files = [...(e.clipboardData ? e.clipboardData.files : [])];
    if (files.length) { addFiles(files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `paste-${Date.now().toString(36)}${i}.png`, { type: f.type })))); }
  });

  /* ---------- APNG 변환 탭 ---------- */
  const cv = { decoded: null, name: 'converted', url: null };
  const cvDrop = $('#cvDrop'), cvFile = $('#cvFile');
  cvDrop.addEventListener('click', () => cvFile.click());
  cvDrop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cvFile.click(); } });
  cvFile.addEventListener('change', () => { if (cvFile.files[0]) loadForConvert(cvFile.files[0]); cvFile.value = ''; });
  dropable(cvDrop, (fs) => { if (fs[0]) loadForConvert(fs[0]); });

  async function loadForConvert(file) {
    try {
      $('#cvInfo').textContent = '읽는 중…';
      $('#cvBody').hidden = false;
      const d = await APNG.decodeAnimated(file);
      cv.decoded = d; cv.name = U.slug(file.name);
      if (cv.url) URL.revokeObjectURL(cv.url);
      cv.url = URL.createObjectURL(file);
      $('#cvOrig').src = cv.url;
      const total = d.frames.reduce((s, f) => s + f.delay, 0);
      $('#cvInfo').innerHTML = '';
      [['종류', d.kind], ['크기', `${d.width} × ${d.height}`], ['프레임', `${d.frames.length}장`],
        ['길이', `${(total / 1000).toFixed(2)}초`], ['용량', fmtBytes(file.size)]].forEach(([k, v]) => {
        $('#cvInfo').append(h('dt', {}, k), h('dd', {}, v));
      });
      if (d.frames.length < 2) toast('움직이는 이미지가 아니라 1프레임만 변환돼요.', 'info');
    } catch (err) {
      cv.decoded = null;
      $('#cvBody').hidden = true;
      toast('이미지를 읽지 못했어요: ' + err.message, 'error');
    }
  }

  const cvProg = $('#progress');
  async function convert() {
    const d = cv.decoded;
    if (!d) return;
    const fmt = document.querySelector('input[name="cvFmt"]:checked').value;
    const sc = Math.max(1, parseInt($('#cvScale').value) || 100) / 100;
    const W = Math.max(1, Math.round(d.width * sc)), H = Math.max(1, Math.round(d.height * sc));
    $('#progMsg').textContent = fmt === 'webp' ? '변환하는 중…' : '녹화 중… 이 탭을 그대로 보고 있어 주세요';
    $('#progBar').value = 0;
    cvProg.showModal();
    try {
      let blob;
      const setP = (v) => { $('#progBar').value = v; };
      if (fmt === 'webp') {
        blob = await Export.encodeWebP({
          width: W, height: H, count: d.frames.length, quality: parseFloat($('#cvQ').value), onProgress: setP,
          getFrame: (i, ctx) => { ctx.imageSmoothingQuality = 'high'; ctx.drawImage(d.frames[i].canvas, 0, 0, W, H); return d.frames[i].delay; }
        });
      } else {
        const ends = []; let acc = 0;
        d.frames.forEach((f) => { acc += f.delay; ends.push(acc); });
        blob = await Export.recordWebM({
          width: W, height: H, durationMs: acc, fps: 30, codec: $('#cvCodec').value, onProgress: setP,
          draw: (t, ctx) => {
            let i = ends.findIndex((e) => t < e);
            if (i < 0) i = d.frames.length - 1;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(d.frames[i].canvas, 0, 0, W, H);
          }
        });
      }
      cvProg.close();
      U.showResult(blob, `${cv.name}.${fmt}`);
    } catch (err) {
      if (cvProg.open) cvProg.close();
      toast(err.message || '변환에 실패했어요.', 'error');
    }
  }
  $('#cvGo').addEventListener('click', convert);
  const syncFmt = () => {
    const webp = document.querySelector('input[name="cvFmt"]:checked').value === 'webp';
    $('#cvWebpOpt').hidden = !webp;
    $('#cvWebmOpt').hidden = webp;
  };
  $$('input[name="cvFmt"]').forEach((r) => r.addEventListener('change', syncFmt));
  syncFmt();

  /* ---------- 시작 ---------- */
  const start = (location.hash || '#editor').slice(1);
  showTab(['editor', 'convert', 'links'].includes(start) ? start : 'editor');
})();
