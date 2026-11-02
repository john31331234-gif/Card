/* digimoncard.io 공개 API 래퍼 */
const CardAPI = (() => {
  const BASE = 'https://digimoncard.io/api-public';
  const IMG = 'https://images.digimoncard.io/images/cards/';
  const cache = new Map(); // 카드 번호 -> 카드

  // API는 10초당 15회 제한이 있으므로 요청 간격을 둔다
  let last = 0;
  const MIN_GAP = 700;
  async function throttle() {
    const wait = last + MIN_GAP - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    last = Date.now();
  }

  const num = v => (v === null || v === undefined || v === '' ? null : Number(v));

  function normalize(c) {
    const card = {
      id: String(c.id || c.cardnumber || '').trim(),
      name: c.name || '',
      type: c.type || '',
      color: c.color || '',
      color2: c.color2 || '',
      level: num(c.level),
      playCost: num(c.play_cost),
      evoCost: num(c.evolution_cost),
      evoColor: c.evolution_color || '',
      evoLevel: num(c.evolution_level),
      dp: num(c.dp),
      stage: c.stage || '',
      attribute: c.attribute || '',
      digiType: [c.digi_type, c.digi_type2].filter(Boolean).join(' / '),
      form: c.form || '',
      rarity: c.rarity || c.cardrarity || '',
      main: c.main_effect || c.maineffect || '',
      source: c.source_effect || c.soureeffect || '',
      alt: c.alt_effect || '',
      set: c.set_name || (Array.isArray(c.card_sets) ? c.card_sets.join(', ') : ''),
    };
    return card;
  }

  async function search(params) {
    const q = new URLSearchParams({ series: 'Digimon Card Game', sort: 'card_number', sortdirection: 'asc' });
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    await throttle();
    const res = await fetch(`${BASE}/search?${q}`);
    if (!res.ok) {
      if (res.status === 400 || res.status === 404) return [];
      throw new Error(`API 오류 (${res.status})`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    // 같은 번호의 중복(패럴렐 등)은 하나로 합친다
    const seen = new Map();
    for (const raw of data) {
      const card = normalize(raw);
      if (!card.id || seen.has(card.id)) continue;
      seen.set(card.id, card);
      cache.set(card.id, card);
    }
    return [...seen.values()];
  }

  async function getByNumber(id) {
    id = id.toUpperCase();
    if (cache.has(id)) return cache.get(id);
    const list = await search({ card: id });
    return list.find(c => c.id.toUpperCase() === id) || null;
  }

  const image = id => `${IMG}${encodeURIComponent(id)}.jpg`;

  return { search, getByNumber, image, remember: c => cache.set(c.id, c) };
})();
