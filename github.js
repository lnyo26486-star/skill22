/* GitHub 저장소에 파일을 올리고 링크를 돌려줍니다. (서버 없이 브라우저에서 GitHub API 직접 호출)
 * 토큰은 이 브라우저의 localStorage에만 저장되고, api.github.com 외에는 어디로도 보내지 않아요.
 */
(function (g) {
  'use strict';
  const KEY = 'fxs_gh';

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = (c) => localStorage.setItem(KEY, JSON.stringify(c));
  const ready = (c = load()) => !!(c.token && /^[^/\s]+\/[^/\s]+$/.test(c.repo || ''));

  const headers = (token) => ({
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json'
  });

  async function explain(res) {
    let msg = '';
    try { msg = (await res.json()).message || ''; } catch (e) { /* 본문 없음 */ }
    if (res.status === 401) return '토큰이 올바르지 않거나 만료됐어요.';
    if (res.status === 403) return `권한이 없어요. 토큰에 이 저장소의 Contents 쓰기 권한이 있는지 확인해 주세요. (${msg})`;
    if (res.status === 404) return '저장소를 찾지 못했어요. 이름(사용자/저장소)과 토큰의 저장소 접근 범위를 확인해 주세요.';
    if (res.status === 409 || res.status === 422) return `올리지 못했어요: ${msg}`;
    return `GitHub 오류 ${res.status}: ${msg}`;
  }

  async function upload(blob, filename) {
    const c = load();
    if (!ready(c)) throw new Error('먼저 "이미지 링크" 탭에서 GitHub 연결을 설정해 주세요.');
    const [owner, repo] = c.repo.split('/');
    const branch = (c.branch || 'main').trim();
    const dir = (c.dir || 'assets').replace(/^\/+|\/+$/g, '');
    const name = `${Date.now().toString(36)}-${U.slug(filename)}${U.ext(filename)}`;
    const path = dir ? `${dir}/${name}` : name;
    const content = (await U.readAsDataURL(blob)).split(',')[1];

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...headers(c.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Add ${name}`, content, branch })
    });
    if (!res.ok) throw new Error(await explain(res));
    const j = await res.json();
    return {
      name,
      path,
      raw: j.content.download_url,
      cdn: `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`
    };
  }

  async function test() {
    const c = load();
    if (!ready(c)) throw new Error('토큰과 저장소(사용자/저장소)를 먼저 입력해 주세요.');
    const res = await fetch(`https://api.github.com/repos/${c.repo}`, { headers: headers(c.token) });
    if (!res.ok) throw new Error(await explain(res));
    const j = await res.json();
    return { private: j.private, push: !!(j.permissions && j.permissions.push), branch: j.default_branch };
  }

  g.GH = { load, save, ready, upload, test };
})(window);
