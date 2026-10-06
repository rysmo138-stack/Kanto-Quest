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
  const b = { ...m, level, xp: 0, moves: [] };
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

// ---------- Moves ----------
const SPECIAL_TYPES = ["fire", "water", "grass", "electric", "psychic", "ice", "dragon", "dark", "fairy"];
const SIGNATURE = {
  normal: "Tackle", fire: "Ember", water: "Water Gun", electric: "Thunder Shock", grass: "Vine Whip",
  ice: "Powder Snow", fighting: "Karate Chop", poison: "Acid", ground: "Mud Shot", flying: "Peck",
  psychic: "Confusion", bug: "Leech Life", rock: "Rock Throw", ghost: "Lick", dragon: "Twister",
  dark: "Bite", steel: "Metal Claw", fairy: "Fairy Wind"
};
// A basic move of the Pokémon's own type, so nobody is stuck with no attack that fits it.
function signatureMove(type) {
  const label = SIGNATURE[type] || "Tackle";
  return { name: label.toLowerCase().replace(/ /g, "-"), label, type, power: 40, accuracy: 100,
    pp: 25, curPp: 25, cls: SPECIAL_TYPES.includes(type) ? "special" : "physical" };
}

// Gives a Pokémon the last 4 attacking moves it has learned at its level.
// Returns the labels of any newly learned moves.
async function refreshMoves(m) {
  const had = new Set((m.moves || []).map(x => x.name));
  const learnable = [];
  for (const e of (m.learnset || [])) {
    if (e.level > m.level) continue;
    const i = learnable.indexOf(e.name);
    if (i >= 0) learnable.splice(i, 1);
    learnable.push(e.name);
  }
  const details = (await Promise.all(learnable.slice(-8).map(n => getMove(n))))
    .filter(x => x && x.power && !MOVE_BLACKLIST.includes(x.name));
  let set = details.slice(-4).map(x => ({ ...x, curPp: x.pp }));
  if (!set.some(x => m.types.includes(x.type))) set = set.slice(-3).concat(signatureMove(m.types[0]));
  for (const mv of set) {
    const old = (m.moves || []).find(x => x.name === mv.name);
    if (old) mv.curPp = Math.min(old.curPp == null ? mv.pp : old.curPp, mv.pp);
  }
  m.moves = set;
  return had.size ? set.filter(x => !had.has(x.name)).map(x => x.label) : [];
}
const restorePP = m => (m.moves || []).forEach(x => { x.curPp = x.pp; });

// Auto-battle picks whichever move it expects to do the most damage.
function pickMove(att, def, pp) {
  let best = -1, bestScore = -1;
  att.moves.forEach((mv, i) => {
    if (pp[i] <= 0) return;
    const phys = mv.cls === "physical";
    const ratio = (phys ? att.atk : att.spa) / (phys ? def.def : def.spd);
    const score = mv.power * (mv.accuracy / 100) * effectiveness(mv.type, def.types)
      * (att.types.includes(mv.type) ? 1.5 : 1) * ratio;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

function attackRoll(att, def, pp, forced = null) {
  if (!att.moves || !att.moves.length) att.moves = [signatureMove(att.types[0])];
  const i = (forced != null && pp[forced] > 0) ? forced : pickMove(att, def, pp);
  const mv = i >= 0 ? att.moves[i]
    : { label: "Struggle", type: "normal", power: 50, accuracy: 100, cls: "physical" };
  if (i >= 0) pp[i]--;
  if (Math.random() * 100 >= mv.accuracy) return { dmg: 0, mv, eff: 1, crit: false, miss: true };
  const eff = effectiveness(mv.type, def.types);
  const phys = mv.cls === "physical";
  const A = phys ? att.atk : att.spa;
  const D = phys ? def.def : def.spd;
  const base = Math.floor(Math.floor(((2 * att.level) / 5 + 2) * mv.power * A / D) / 50) + 2;
  const stab = att.types.includes(mv.type) ? 1.5 : 1;
  const crit = Math.random() < 1 / 16;
  const dmg = eff === 0 ? 0 :
    Math.max(1, Math.floor(base * stab * eff * (crit ? 1.5 : 1) * (0.85 + Math.random() * 0.15)));
  return { dmg, mv, eff, crit, miss: false };
}

// One fight, played round by round. Auto mode and manual mode both use this.
// weaken = true stops once the wild Pokémon is low (never knocks it out), so it can be caught.
function newBattleCtx(player, enemy, weaken = false, boost = 1) {
  for (const m of [player, enemy]) if (!m.moves || !m.moves.length) m.moves = [signatureMove(m.types[0])];
  return {
    mons: { p: player, e: enemy },
    hp: { p: player.curHp, e: enemy.curHp },
    pp: {
      p: player.moves.map(x => (x.curPp == null ? x.pp : x.curPp)),
      e: enemy.moves.map(x => (x.curPp == null ? x.pp : x.curPp))
    },
    order: (player.spe > enemy.spe || (player.spe === enemy.spe && Math.random() < 0.5)) ? ["p", "e"] : ["e", "p"],
    weaken, boost, log: [], over: false, rounds: 0
  };
}

// Plays one round. playerMove is a move index, or null to let the auto-battler choose.
// Returns just the new log entries from this round.
function playRound(ctx, playerMove = null) {
  const start = ctx.log.length;
  for (const s of ctx.order) {
    const o = s === "p" ? "e" : "p";
    if (ctx.hp.p <= 0 || ctx.hp.e <= 0) break;
    const r = attackRoll(ctx.mons[s], ctx.mons[o], ctx.pp[s], s === "p" ? playerMove : null);
    if (s === "p" && r.dmg) r.dmg = Math.max(1, Math.round(r.dmg * ctx.boost));
    ctx.hp[o] = Math.max(ctx.weaken && o === "e" ? 1 : 0, ctx.hp[o] - r.dmg);
    let text = `${cap(ctx.mons[s].name)} used ${r.mv.label}!`;
    if (r.miss) text += " But it missed!";
    else if (r.eff === 0) text += " It had no effect.";
    else if (r.eff > 1) text += " It's super effective!";
    else if (r.eff < 1) text += " It's not very effective.";
    if (r.crit && r.dmg) text += " A critical hit!";
    ctx.log.push({ text, hp: { ...ctx.hp } });
    if (ctx.hp[o] <= 0) ctx.log.push({ text: `${cap(ctx.mons[o].name)} fainted!`, hp: { ...ctx.hp } });
    if (ctx.weaken && ctx.hp.e <= ctx.mons.e.maxHp * 0.3) { ctx.over = true; break; }
  }
  if (ctx.hp.p <= 0 || ctx.hp.e <= 0 || ++ctx.rounds >= 80) ctx.over = true;
  return ctx.log.slice(start);
}

// Plays a whole fight automatically (used by the tests and by auto mode).
function simulate(player, enemy, weaken = false, boost = 1) {
  const ctx = newBattleCtx(player, enemy, weaken, boost);
  while (!ctx.over) playRound(ctx);
  return { log: ctx.log, winner: ctx.hp.p > 0 ? "p" : "e", hp: ctx.hp, pp: ctx.pp };
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
