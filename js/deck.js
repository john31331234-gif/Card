/* 덱 데이터와 규칙 */
const DeckRules = {
  MAIN_SIZE: 50,
  EGG_MAX: 5,
  COPY_MAX: 4,
};

class Deck {
  constructor(name = '') {
    this.name = name;
    this.main = new Map(); // id -> { card, count }
    this.egg = new Map();
  }

  static zoneFor(card) {
    return card.type === 'Digi-Egg' ? 'egg' : 'main';
  }

  zone(z) { return z === 'egg' ? this.egg : this.main; }

  countOf(id) {
    return (this.main.get(id)?.count || 0) + (this.egg.get(id)?.count || 0);
  }

  total(z) {
    let n = 0;
    for (const { count } of this.zone(z).values()) n += count;
    return n;
  }

  /** 카드 추가. 성공하면 null, 실패하면 사유 문자열 반환 */
  add(card, n = 1) {
    const z = Deck.zoneFor(card);
    const map = this.zone(z);
    const current = this.countOf(card.id);
    if (current + n > DeckRules.COPY_MAX) return `같은 카드 번호는 최대 ${DeckRules.COPY_MAX}장까지 넣을 수 있습니다.`;
    if (z === 'egg' && this.total('egg') + n > DeckRules.EGG_MAX) return `디지타마 덱은 최대 ${DeckRules.EGG_MAX}장입니다.`;
    const entry = map.get(card.id) || { card, count: 0 };
    entry.count += n;
    map.set(card.id, entry);
    return null;
  }

  remove(id, n = 1) {
    for (const map of [this.main, this.egg]) {
      const e = map.get(id);
      if (!e) continue;
      e.count -= n;
      if (e.count <= 0) map.delete(id);
      return;
    }
  }

  clear() { this.main.clear(); this.egg.clear(); }

  sorted(z) {
    const order = { 'Digi-Egg': 0, Digimon: 1, Tamer: 2, Option: 3 };
    return [...this.zone(z).values()].sort((a, b) =>
      (order[a.card.type] ?? 9) - (order[b.card.type] ?? 9) ||
      (a.card.level ?? 0) - (b.card.level ?? 0) ||
      (a.card.playCost ?? 0) - (b.card.playCost ?? 0) ||
      a.card.id.localeCompare(b.card.id));
  }

  problems() {
    const out = [];
    const m = this.total('main');
    if (m !== DeckRules.MAIN_SIZE) out.push(`메인 덱은 정확히 ${DeckRules.MAIN_SIZE}장이어야 합니다 (현재 ${m}장).`);
    return out;
  }

  /** 펼친 카드 목록 (테스트 드로우용) */
  expand(z) {
    const out = [];
    for (const { card, count } of this.zone(z).values()) for (let i = 0; i < count; i++) out.push(card);
    return out;
  }

  toText() {
    const lines = [`// ${this.name || '이름 없는 덱'}`];
    const section = (title, z) => {
      const list = this.sorted(z);
      if (!list.length) return;
      lines.push(`// ${title} (${this.total(z)})`);
      for (const { card, count } of list) lines.push(`${count} ${card.name} ${card.id}`);
    };
    section('Digi-Egg', 'egg');
    section('Main Deck', 'main');
    return lines.join('\n');
  }

  /** 텍스트에서 [{id, count}] 추출. "4 Agumon BT1-010", "BT1-010 x4", "4x BT1-010" 등 지원 */
  static parseText(text) {
    const re = /\b((?:[A-Z]{1,4}\d{0,2}|P)-\d{2,3})\b/i;
    const result = new Map();
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('#')) continue;
      const m = line.match(re);
      if (!m) continue;
      const id = m[1].toUpperCase();
      const rest = line.replace(m[0], ' ');
      const cnt = rest.match(/(?:^|\s)x?(\d{1,2})x?(?=\s|$)/i);
      const count = cnt ? parseInt(cnt[1], 10) : 1;
      result.set(id, (result.get(id) || 0) + count);
    }
    return [...result].map(([id, count]) => ({ id, count }));
  }

  toJSON() {
    const pack = map => [...map.values()].map(({ card, count }) => ({ card, count }));
    return { name: this.name, main: pack(this.main), egg: pack(this.egg) };
  }

  static fromJSON(obj) {
    const d = new Deck(obj.name || '');
    for (const z of ['main', 'egg'])
      for (const { card, count } of obj[z] || []) d.zone(z).set(card.id, { card, count });
    return d;
  }

  /** 공유 링크용 짧은 코드: "BT1-010:4,ST1-01:2" */
  toCode() {
    return [...this.egg.values(), ...this.main.values()].map(({ card, count }) => `${card.id}:${count}`).join(',');
  }

  static parseCode(code) {
    return code.split(',').map(p => {
      const [id, c] = p.split(':');
      return { id: (id || '').toUpperCase(), count: parseInt(c, 10) || 1 };
    }).filter(e => e.id);
  }
}
