/* 화면 로직 */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  const COLOR_KO = { Red: '빨강', Blue: '파랑', Yellow: '노랑', Green: '초록', Black: '검정', Purple: '보라', White: '흰색' };
  const TYPE_KO = { Digimon: '디지몬', 'Digi-Egg': '디지타마', Tamer: '테이머', Option: '옵션' };
  const KEY_CURRENT = 'dcm.current';
  const KEY_SAVED = 'dcm.saved';

  const store = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
  };

  let deck = new Deck();
  let view = 'list';
  let lastResults = [];
  let drawState = null;

  /* ---------- 공통 ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  const colorClass = c => `c-${(c || 'none').toLowerCase()}`;
  const colorDots = card => `<span class="dots">${[card.color, card.color2].filter(Boolean)
    .map(c => `<span class="dot ${colorClass(c)}" title="${esc(COLOR_KO[c] || c)}"></span>`).join('')}</span>`;

  // 이미지가 없을 때 보여줄 자리표시 (카드 번호 표시)
  window.cardImgFallback = el => {
    el.onerror = null;
    const id = esc(el.dataset.id || '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 430 600"><rect width="430" height="600" fill="#1d2438"/>` +
      `<text x="215" y="300" fill="#8f9bb8" font-size="40" font-family="sans-serif" text-anchor="middle">${id}</text>` +
      `<text x="215" y="350" fill="#5b6683" font-size="24" font-family="sans-serif" text-anchor="middle">이미지 없음</text></svg>`;
    el.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  };

  function img(card, cls = '') {
    return `<img class="${cls}" loading="lazy" src="${CardAPI.image(card.id)}" alt="${esc(card.name)} (${esc(card.id)})"
      data-id="${esc(card.id)}" onerror="cardImgFallback(this)">`;
  }

  function addCard(card, n = 1) {
    const err = deck.add(card, n);
    if (err) { toast(err); return; }
    changed();
  }

  function changed() {
    store.set(KEY_CURRENT, deck.toJSON());
    renderDeck();
    renderResultCounts();
  }

  /* ---------- 검색 ---------- */
  $('#searchForm').addEventListener('submit', async e => {
    e.preventDefault();
    const params = {
      n: $('#qName').value.trim(),
      card: $('#qNumber').value.trim(),
      desc: $('#qText').value.trim(),
      color: $('#qColor').value,
      type: $('#qType').value,
      pack: $('#qPack').value.trim(),
    };
    const level = $('#qLevel').value;
    if (!Object.values(params).some(Boolean) && !level) {
      $('#searchStatus').textContent = '검색 조건을 하나 이상 입력하세요.';
      return;
    }
    $('#searchStatus').textContent = '검색 중…';
    $('#results').innerHTML = '';
    try {
      let list = await CardAPI.search(params);
      if (level) list = list.filter(c => String(c.level) === level);
      lastResults = list;
      $('#searchStatus').textContent = (list.length ? `${list.length}장 찾음 · 클릭하면 상세 정보, ＋ 버튼으로 덱에 추가` : '검색 결과가 없습니다.')
        + (CardAPI.lastOffline ? ' (오프라인: 저장된 검색 결과)' : '');
      renderResults();
    } catch (err) {
      console.error(err);
      $('#searchStatus').textContent = `카드 데이터를 불러오지 못했습니다: ${err.message}. 인터넷 연결을 확인하고 다시 시도하세요.`;
    }
  });

  function renderResults() {
    $('#results').innerHTML = lastResults.map(c => `
      <div class="card-tile" data-id="${esc(c.id)}">
        <button class="tile-img" data-act="detail" title="상세 보기">${img(c)}</button>
        <div class="tile-info">
          <div class="tile-name">${colorDots(c)} ${esc(c.name)}</div>
          <div class="tile-meta">${esc(c.id)} · ${esc(TYPE_KO[c.type] || c.type)}${c.level ? ` · Lv.${c.level}` : ''}</div>
        </div>
        <div class="tile-actions">
          <button class="btn sm" data-act="minus" aria-label="빼기">−</button>
          <span class="tile-count" data-count></span>
          <button class="btn sm primary" data-act="plus" aria-label="추가">＋</button>
        </div>
      </div>`).join('');
    renderResultCounts();
  }

  function renderResultCounts() {
    document.querySelectorAll('#results .card-tile').forEach(el => {
      const n = deck.countOf(el.dataset.id);
      el.querySelector('[data-count]').textContent = n ? `${n}장` : '';
      el.classList.toggle('in-deck', n > 0);
    });
  }

  $('#results').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('.card-tile').dataset.id;
    const card = lastResults.find(c => c.id === id);
    if (!card) return;
    if (btn.dataset.act === 'plus') addCard(card);
    else if (btn.dataset.act === 'minus') { deck.remove(id); changed(); }
    else showDetail(card);
  });

  /* ---------- 카드 상세 ---------- */
  function showDetail(card) {
    const row = (k, v) => (v || v === 0) ? `<tr><th>${k}</th><td>${esc(v)}</td></tr>` : '';
    const evo = card.evoCost != null ? `${card.evoColor ? (COLOR_KO[card.evoColor] || card.evoColor) + ' ' : ''}${card.evoLevel ? 'Lv.' + card.evoLevel + ' 에서 ' : ''}${card.evoCost}` : '';
    const n = deck.countOf(card.id);
    $('#cardDetail').innerHTML = `
      <div class="detail">
        <div class="detail-img">${img(card)}</div>
        <div class="detail-body">
          <h2>${colorDots(card)} ${esc(card.name)}</h2>
          <p class="muted">${esc(card.id)}${card.rarity ? ' · ' + esc(card.rarity) : ''}${card.set ? ' · ' + esc(card.set) : ''}</p>
          <table class="stats-table">
            ${row('종류', TYPE_KO[card.type] || card.type)}
            ${row('색', [card.color, card.color2].filter(Boolean).map(c => COLOR_KO[c] || c).join(' / '))}
            ${row('레벨', card.level ? 'Lv.' + card.level : '')}
            ${row('등장 코스트', card.playCost)}
            ${row('진화 코스트', evo)}
            ${row('DP', card.dp)}
            ${row('형태', card.form || card.stage)}
            ${row('속성', card.attribute)}
            ${row('유형', card.digiType)}
          </table>
          ${card.main ? `<h3>효과</h3><p class="effect">${esc(card.main)}</p>` : ''}
          ${card.source ? `<h3>진화원 효과</h3><p class="effect">${esc(card.source)}</p>` : ''}
          ${card.alt ? `<h3>시큐리티 / 기타 효과</h3><p class="effect">${esc(card.alt)}</p>` : ''}
          <div class="dialog-actions">
            <span class="muted">덱에 ${n}장</span>
            <button class="btn" data-detail="minus">− 빼기</button>
            <button class="btn primary" data-detail="plus">＋ 추가</button>
          </div>
        </div>
      </div>`;
    $('#cardDetail').onclick = e => {
      const a = e.target.closest('[data-detail]')?.dataset.detail;
      if (!a) return;
      if (a === 'plus') addCard(card); else { deck.remove(card.id); changed(); }
      showDetail(card);
    };
    if (!$('#cardDialog').open) $('#cardDialog').showModal();
  }

  /* ---------- 덱 렌더링 ---------- */
  document.querySelectorAll('.deck-tabs .tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.deck-tabs .tab').forEach(x => x.classList.toggle('active', x === t));
    view = t.dataset.view;
    renderDeck();
  }));

  function renderDeck() {
    const m = deck.total('main'), g = deck.total('egg');
    $('#mainCounter').innerHTML = `메인 덱 <b>${m}</b>/${DeckRules.MAIN_SIZE}`;
    $('#mainCounter').className = 'counter ' + (m === DeckRules.MAIN_SIZE ? 'ok' : m > DeckRules.MAIN_SIZE ? 'bad' : '');
    $('#eggCounter').innerHTML = `디지타마 덱 <b>${g}</b>/${DeckRules.EGG_MAX}`;
    $('#eggCounter').className = 'counter ' + (g > 0 ? 'ok' : '');
    const probs = deck.problems();
    $('#deckWarnings').innerHTML = probs.length ? probs.map(esc).join('<br>') : '✔ 대회 규정에 맞는 덱입니다.';
    $('#deckWarnings').className = 'warnings ' + (probs.length ? '' : 'ok');
    if (document.activeElement !== $('#deckName')) $('#deckName').value = deck.name;

    const v = $('#deckView');
    if (!m && !g) {
      v.innerHTML = '<p class="empty">왼쪽에서 카드를 검색해 덱에 추가하세요.</p>';
      return;
    }
    if (view === 'list') v.innerHTML = listView();
    else if (view === 'grid') v.innerHTML = gridView();
    else if (view === 'stats') v.innerHTML = statsView();
    else v.innerHTML = drawView();
  }

  function listView() {
    const section = (title, z) => {
      const list = deck.sorted(z);
      if (!list.length) return '';
      return `<h3 class="zone-title">${title} <span class="muted">${deck.total(z)}장</span></h3>
        <ul class="deck-list">${list.map(({ card, count }) => `
          <li data-id="${esc(card.id)}">
            <span class="qty">${count}</span>
            ${colorDots(card)}
            <button class="link" data-act="detail">${esc(card.name)}</button>
            <span class="muted id">${esc(card.id)}</span>
            <span class="muted lv">${card.level ? 'Lv.' + card.level : esc(TYPE_KO[card.type] || '')}</span>
            <span class="row-actions">
              <button class="btn sm" data-act="minus" aria-label="빼기">−</button>
              <button class="btn sm" data-act="plus" aria-label="추가">＋</button>
            </span>
          </li>`).join('')}</ul>`;
    };
    return section('디지타마 덱', 'egg') + section('메인 덱', 'main') +
      '<button class="btn danger clear" data-act="clear">덱 비우기</button>';
  }

  function gridView() {
    const section = (title, z) => {
      const list = deck.sorted(z);
      if (!list.length) return '';
      return `<h3 class="zone-title">${title} <span class="muted">${deck.total(z)}장</span></h3>
        <div class="deck-grid">${list.map(({ card, count }) => `
          <div class="deck-card" data-id="${esc(card.id)}">
            <button class="tile-img" data-act="detail">${img(card)}</button>
            <span class="badge">×${count}</span>
            <div class="deck-card-actions">
              <button class="btn sm" data-act="minus">−</button>
              <button class="btn sm" data-act="plus">＋</button>
            </div>
          </div>`).join('')}</div>`;
    };
    return section('디지타마 덱', 'egg') + section('메인 덱', 'main');
  }

  function bars(rows) {
    const max = Math.max(1, ...rows.map(r => r.value));
    return `<div class="bars">${rows.map(r => `
      <div class="bar-row">
        <span class="bar-label">${esc(r.label)}</span>
        <span class="bar-track"><span class="bar-fill ${r.cls || ''}" style="width:${(r.value / max) * 100}%"></span></span>
        <span class="bar-value">${r.value}</span>
      </div>`).join('')}</div>`;
  }

  function statsView() {
    const main = deck.expand('main');
    const levels = [3, 4, 5, 6, 7].map(l => ({ label: `Lv.${l}`, value: main.filter(c => c.type === 'Digimon' && c.level === l).length }));
    const other = main.filter(c => c.type === 'Digimon' && ![3, 4, 5, 6, 7].includes(c.level)).length;
    if (other) levels.push({ label: '기타', value: other });
    levels.push({ label: '테이머', value: main.filter(c => c.type === 'Tamer').length, cls: 'alt' });
    levels.push({ label: '옵션', value: main.filter(c => c.type === 'Option').length, cls: 'alt' });

    const colorCount = {};
    for (const c of main) for (const col of [c.color, c.color2].filter(Boolean)) colorCount[col] = (colorCount[col] || 0) + 1;
    const colors = Object.entries(colorCount).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ label: COLOR_KO[k] || k, value: v, cls: colorClass(k) }));

    const costs = {};
    for (const c of main) if (c.playCost != null) costs[c.playCost] = (costs[c.playCost] || 0) + 1;
    const costRows = Object.keys(costs).map(Number).sort((a, b) => a - b).map(k => ({ label: `${k}`, value: costs[k] }));
    const withCost = main.filter(c => c.playCost != null);
    const avg = withCost.length ? (withCost.reduce((s, c) => s + c.playCost, 0) / withCost.length).toFixed(2) : '-';

    return `
      <div class="stat-grid">
        <div class="stat"><b>${main.length}</b><span>메인 덱</span></div>
        <div class="stat"><b>${deck.total('egg')}</b><span>디지타마</span></div>
        <div class="stat"><b>${deck.main.size + deck.egg.size}</b><span>카드 종류</span></div>
        <div class="stat"><b>${avg}</b><span>평균 등장 코스트</span></div>
      </div>
      <h3 class="zone-title">레벨 / 종류 분포</h3>${bars(levels)}
      <h3 class="zone-title">색 분포 <span class="muted">(2색 카드는 양쪽에 집계)</span></h3>${colors.length ? bars(colors) : '<p class="muted">-</p>'}
      <h3 class="zone-title">등장 코스트 분포</h3>${costRows.length ? bars(costRows) : '<p class="muted">-</p>'}`;
  }

  /* ---------- 테스트 드로우 ---------- */
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function newDraw() {
    const pile = shuffle(deck.expand('main'));
    // 시작 패 5장, 그 다음 5장을 시큐리티로
    drawState = { hand: pile.splice(0, 5), security: pile.splice(0, 5), pile };
  }

  function drawView() {
    if (!drawState) newDraw();
    const row = list => list.length
      ? `<div class="draw-row">${list.map(c => `<div class="draw-card" data-id="${esc(c.id)}"><button class="tile-img" data-act="detail">${img(c)}</button></div>`).join('')}</div>`
      : '<p class="muted">없음</p>';
    return `
      <div class="draw-actions">
        <button class="btn primary" data-act="reshuffle">다시 섞기 (멀리건)</button>
        <button class="btn" data-act="drawone" ${drawState.pile.length ? '' : 'disabled'}>1장 드로우</button>
        <span class="muted">남은 덱 ${drawState.pile.length}장</span>
      </div>
      <h3 class="zone-title">패 <span class="muted">${drawState.hand.length}장</span></h3>${row(drawState.hand)}
      <h3 class="zone-title">시큐리티 <span class="muted">(실제 게임에서는 비공개)</span></h3>${row(drawState.security)}`;
  }

  /* 덱 패널 클릭 처리 */
  $('#deckView').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'clear') {
      if (confirm('덱의 모든 카드를 지울까요?')) { deck.clear(); drawState = null; changed(); }
      return;
    }
    if (act === 'reshuffle') { newDraw(); renderDeck(); return; }
    if (act === 'drawone') { if (drawState.pile.length) drawState.hand.push(drawState.pile.shift()); renderDeck(); return; }
    const id = btn.closest('[data-id]')?.dataset.id;
    const entry = deck.main.get(id) || deck.egg.get(id);
    const card = entry?.card || drawState?.hand.concat(drawState.security).find(c => c.id === id);
    if (!card) return;
    if (act === 'detail') showDetail(card);
    else if (act === 'plus') addCard(card);
    else if (act === 'minus') { deck.remove(id); drawState = null; changed(); }
  });

  /* ---------- 덱 이름 / 저장 / 불러오기 ---------- */
  $('#deckName').addEventListener('input', e => { deck.name = e.target.value; store.set(KEY_CURRENT, deck.toJSON()); });

  $('#btnNew').addEventListener('click', () => {
    if ((deck.total('main') || deck.total('egg')) && !confirm('현재 덱을 비우고 새 덱을 만들까요? (저장하지 않은 내용은 사라집니다)')) return;
    deck = new Deck(); drawState = null; history.replaceState(null, '', location.pathname); changed();
  });

  $('#btnSave').addEventListener('click', () => {
    let name = deck.name.trim();
    if (!name) {
      name = prompt('덱 이름을 입력하세요', '내 덱');
      if (!name) return;
      deck.name = name.trim();
    }
    const saved = store.get(KEY_SAVED, {});
    saved[deck.name] = { ...deck.toJSON(), savedAt: Date.now() };
    store.set(KEY_SAVED, saved);
    changed();
    toast(`"${deck.name}" 저장 완료`);
  });

  function renderSaved() {
    const saved = store.get(KEY_SAVED, {});
    const names = Object.keys(saved).sort((a, b) => (saved[b].savedAt || 0) - (saved[a].savedAt || 0));
    $('#savedList').innerHTML = names.length ? names.map(n => {
      const d = Deck.fromJSON(saved[n]);
      const date = saved[n].savedAt ? new Date(saved[n].savedAt).toLocaleString('ko-KR') : '';
      return `<li data-name="${esc(n)}">
        <button class="link" data-act="open"><b>${esc(n)}</b></button>
        <span class="muted">메인 ${d.total('main')} · 타마 ${d.total('egg')} · ${esc(date)}</span>
        <button class="btn sm danger" data-act="del">삭제</button>
      </li>`;
    }).join('') : '<li class="muted">저장된 덱이 없습니다.</li>';
  }

  $('#btnLoad').addEventListener('click', () => { renderSaved(); $('#loadDialog').showModal(); });
  $('#savedList').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const name = btn.closest('li').dataset.name;
    const saved = store.get(KEY_SAVED, {});
    if (btn.dataset.act === 'open') {
      deck = Deck.fromJSON(saved[name]); drawState = null;
      $('#loadDialog').close(); changed(); toast(`"${name}" 불러옴`);
    } else if (confirm(`"${name}" 덱을 삭제할까요?`)) {
      delete saved[name]; store.set(KEY_SAVED, saved); renderSaved();
    }
  });

  /* ---------- 내보내기 / 가져오기 ---------- */
  let textMode = 'export';
  function openText(mode) {
    textMode = mode;
    const exp = mode === 'export';
    $('#textTitle').textContent = exp ? '덱 내보내기' : '덱 가져오기';
    $('#textHelp').textContent = exp
      ? '아래 텍스트를 복사해 다른 사람과 공유하거나 다른 덱 빌더에 붙여넣으세요.'
      : '한 줄에 한 카드씩 "4 Agumon BT1-010", "BT1-010 x4", "4x BT1-010" 같은 형식으로 붙여넣으세요. 현재 덱은 교체됩니다.';
    $('#textArea').value = exp ? deck.toText() : '';
    $('#textArea').readOnly = exp;
    $('#textCopy').hidden = !exp;
    $('#textConfirm').hidden = exp;
    $('#textDialog').showModal();
  }
  $('#btnExport').addEventListener('click', () => openText('export'));
  $('#btnImport').addEventListener('click', () => openText('import'));

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch { return false; }
  }
  $('#textCopy').addEventListener('click', async () => {
    if (await copy($('#textArea').value)) toast('클립보드에 복사했습니다');
    else { $('#textArea').select(); toast('Ctrl+C 로 복사하세요'); }
  });

  /** [{id,count}] 목록을 API로 조회해 새 덱으로 구성 */
  async function buildDeck(entries, name = '') {
    const d = new Deck(name);
    const missing = [], rejected = [];
    for (let i = 0; i < entries.length; i++) {
      const { id, count } = entries[i];
      toast(`카드 정보 불러오는 중… (${i + 1}/${entries.length})`);
      let card = null;
      try { card = await CardAPI.getByNumber(id); } catch (e) { console.error(e); }
      if (!card) { missing.push(id); continue; }
      const err = d.add(card, count);
      if (err) rejected.push(`${id}: ${err}`);
    }
    return { d, missing, rejected };
  }

  $('#textConfirm').addEventListener('click', async e => {
    e.preventDefault();
    const text = $('#textArea').value;
    const entries = Deck.parseText(text);
    if (!entries.length) { toast('카드 번호를 찾지 못했습니다'); return; }
    const title = text.match(/^\s*\/\/\s*(.+)$/m)?.[1];
    $('#textConfirm').disabled = true;
    const { d, missing, rejected } = await buildDeck(entries, title && !/^(Digi-Egg|Main Deck)/.test(title) ? title.trim() : '');
    $('#textConfirm').disabled = false;
    deck = d; drawState = null; changed();
    $('#textDialog').close();
    const msgs = [];
    if (missing.length) msgs.push(`찾지 못한 카드: ${missing.join(', ')}`);
    if (rejected.length) msgs.push(...rejected);
    if (msgs.length) alert(msgs.join('\n')); else toast('가져오기 완료');
  });

  /* ---------- 공유 링크 ---------- */
  $('#btnShare').addEventListener('click', async () => {
    if (!deck.total('main') && !deck.total('egg')) { toast('덱이 비어 있습니다'); return; }
    const hash = `#deck=${encodeURIComponent(deck.toCode())}&name=${encodeURIComponent(deck.name)}`;
    const url = location.href.split('#')[0] + hash;
    history.replaceState(null, '', hash);
    if (await copy(url)) toast('공유 링크를 복사했습니다');
    else prompt('아래 링크를 복사하세요', url);
  });

  async function loadFromHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const code = p.get('deck');
    if (!code) return false;
    const { d, missing } = await buildDeck(Deck.parseCode(code), p.get('name') || '');
    deck = d; changed();
    toast(missing.length ? `일부 카드를 찾지 못했습니다: ${missing.join(', ')}` : '공유된 덱을 불러왔습니다');
    return true;
  }

  /* ---------- PC 프로그램 설정 ---------- */
  const desktop = CardAPI.desktop;
  const fmtBytes = b => b > 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`;
  async function renderSettings() {
    const [st, info] = await Promise.all([desktop.getSettings(), desktop.cacheInfo()]);
    $('#imgSource').value = st.imageSource;
    $('#cacheInfo').textContent = `저장된 카드 이미지 ${info.images.count}장 (${fmtBytes(info.images.bytes)}) · 저장된 검색 결과 ${info.api.count}개`;
  }
  if (desktop) {
    document.body.classList.add('is-desktop');
    $('#btnSettings').hidden = false;
    $('#btnShare').hidden = true; // PC 프로그램에서는 링크 대신 "내보내기" 텍스트로 공유
    $('#btnSettings').addEventListener('click', async () => { await renderSettings(); $('#settingsDialog').showModal(); });
    $('#imgSource').addEventListener('change', async e => {
      await desktop.setSettings({ imageSource: e.target.value });
      toast('이미지 출처를 바꿨습니다. 새로 보는 카드부터 적용됩니다.');
    });
    $('#btnClearCache').addEventListener('click', async () => {
      if (!confirm('PC에 저장된 카드 이미지와 검색 결과를 모두 지울까요? (덱은 지워지지 않습니다)')) return;
      await desktop.clearCache(); await renderSettings(); toast('저장된 데이터를 지웠습니다');
    });
    $('#btnOpenFolder').addEventListener('click', () => desktop.openDataFolder());
  }

  /* ---------- 시작 ---------- */
  const cur = store.get(KEY_CURRENT, null);
  if (cur) deck = Deck.fromJSON(cur);
  for (const z of [deck.main, deck.egg]) for (const { card } of z.values()) CardAPI.remember(card);
  renderDeck();
  loadFromHash();
  window.addEventListener('hashchange', loadFromHash);
})();
