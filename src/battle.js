// Battle engine. Battles resolve automatically from stats, types, and STAB.

// Type chart: attacker -> [super effective, not very effective, no effect]
const CHART = {
  normal:   ["", "rock steel", "ghost"],
  fire:     ["grass ice bug steel", "fire water rock dragon", ""],
  water:    ["fire ground rock", "water grass dragon", ""],
  electric: ["water flying", "electric grass dragon", "ground"],
  grass:    ["water ground rock", "fire grass poison flying bug dragon steel", ""],
  ice:      ["grass ground flying dragon", "fire water ice steel", ""],
  fighting: ["normal ice rock dark steel", "poison flying psychic bug fairy", "ghost"],
  poison:   ["grass fairy", "poison ground rock ghost", "steel"],
  ground:   ["fire electric poison rock steel", "grass bug", "flying"],
  flying:   ["grass fighting bug", "electric rock steel", ""],
  psychic:  ["fighting poison", "psychic steel", "dark"],
  bug:      ["grass psychic dark", "fire fighting poison flying ghost steel fairy", ""],
  rock:     ["fire ice flying bug", "fighting ground steel", ""],
  ghost:    ["psychic ghost", "dark", "normal"],
  dragon:   ["dragon", "steel", "fairy"],
  dark:     ["psychic ghost", "fighting dark fairy", ""],
  steel:    ["ice rock fairy", "fire water electric steel", ""],
  fairy:    ["fighting dragon dark", "fire poison steel", ""]
};

function typeMultiplier(atkType, defType) {
  const [sup, nve, none] = (CHART[atkType] || ["", "", ""]).map(s => s.split(" "));
  if (none.includes(defType)) return 0;
  if (sup.includes(defType)) return 2;
  if (nve.includes(defType)) return 0.5;
  return 1;
}
const effectiveness = (atkType, defTypes) =>
  defTypes.reduce((m, t) => m * typeMultiplier(atkType, t), 1);

function calcStats(m, L) {
  const f = b => Math.floor((2 * b * L) / 100) + 5;
  return {
    maxHp: Math.floor((2 * m.hp * L) / 100) + L + 10,
    atk: f(m.attack), def: f(m.defense),
    spa: f(m.spAttack), spd: f(m.spDefense), spe: f(m.speed)
  };
}

function makeBattler(m, level) {
  const b = { ...m, level, xp: 0 };
  Object.assign(b, calcStats(m, level));
  b.curHp = b.maxHp;
  return b;
}

// Each Pokémon attacks with whichever of its own types hits hardest (always STAB).
function attackRoll(att, def) {
  let type = att.types[0], eff = -1;
  for (const t of att.types) {
    const e = effectiveness(t, def.types);
    if (e > eff) { eff = e; type = t; }
  }
  const phys = att.atk >= att.spa;
  const A = phys ? att.atk : att.spa;
  const D = phys ? def.def : def.spd;
  const base = Math.floor(Math.floor(((2 * att.level) / 5 + 2) * 60 * A / D) / 50) + 2;
  const crit = Math.random() < 1 / 16;
  const dmg = eff === 0 ? 0 :
    Math.max(1, Math.floor(base * 1.5 * eff * (crit ? 1.5 : 1) * (0.85 + Math.random() * 0.15)));
  return { dmg, type, eff, crit };
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// Runs the whole fight and returns a log the UI can play back.
// weaken = true stops once the wild Pokémon is low (never knocks it out), so it can be caught.
function simulate(player, enemy, weaken = false) {
  const mons = { p: player, e: enemy };
  const hp = { p: player.curHp, e: enemy.curHp };
  const order = (player.spe > enemy.spe || (player.spe === enemy.spe && Math.random() < 0.5))
    ? ["p", "e"] : ["e", "p"];
  const log = [];

  outer: for (let turn = 0; turn < 60 && hp.p > 0 && hp.e > 0; turn++) {
    for (const s of order) {
      const o = s === "p" ? "e" : "p";
      if (hp.p <= 0 || hp.e <= 0) break;
      const r = attackRoll(mons[s], mons[o]);
      hp[o] = Math.max(weaken && o === "e" ? 1 : 0, hp[o] - r.dmg);
      let text = `${cap(mons[s].name)} used a ${cap(r.type)} attack!`;
      if (r.eff === 0) text += " It had no effect.";
      else if (r.eff > 1) text += " It's super effective!";
      else if (r.eff < 1) text += " It's not very effective.";
      if (r.crit && r.dmg) text += " A critical hit!";
      log.push({ text, hp: { ...hp } });
      if (hp[o] <= 0) log.push({ text: `${cap(mons[o].name)} fainted!`, hp: { ...hp } });
      if (weaken && hp.e <= enemy.maxHp * 0.3) break outer;
    }
  }
  return { log, winner: hp.p > 0 ? "p" : "e", hp };
}

// Returns messages about any level-ups.
function gainXp(b, amount) {
  const msgs = [`${cap(b.name)} gained ${amount} XP.`];
  b.xp += amount;
  while (b.xp >= b.level * b.level) {
    b.xp -= b.level * b.level;
    const oldMax = b.maxHp;
    b.level++;
    Object.assign(b, calcStats(b, b.level));
    b.curHp += b.maxHp - oldMax;
    msgs.push(`${cap(b.name)} grew to level ${b.level}!`);
  }
  return msgs;
}

// Catch odds: better when the target is hurt. Full HP is about 20%, almost no HP about 60%.
function catchChance(enemy) {
  return 0.6 * (3 * enemy.maxHp - 2 * enemy.curHp) / (3 * enemy.maxHp);
}
