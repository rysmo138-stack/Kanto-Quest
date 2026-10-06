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
  const details = (await Promise.all(learnable.slice(-12).map(n => getMove(n))))
    .filter(x => x && !MOVE_BLACKLIST.includes(x.name));
  const attacks = details.filter(x => x.power);
  const statusMoves = details.filter(x => !x.power && x.ailment).slice(-1);
  let set = attacks.slice(-(4 - statusMoves.length)).concat(statusMoves).map(x => ({ ...x, curPp: x.pp }));
  if (!set.some(x => x.power && m.types.includes(x.type))) {
    set = set.filter(x => !x.power).concat(set.filter(x => x.power).slice(-2)).concat(signatureMove(m.types[0]));
  }
  for (const mv of set) {
    const old = (m.moves || []).find(x => x.name === mv.name);
    if (old) mv.curPp = Math.min(old.curPp == null ? mv.pp : old.curPp, mv.pp);
  }
  m.moves = set;
  return had.size ? set.filter(x => !had.has(x.name)).map(x => x.label) : [];
}
const restorePP = m => (m.moves || []).forEach(x => { x.curPp = x.pp; });
const restoreAll = m => { m.status = null; m.sleep = 0; restorePP(m); };

// ---------- Status effects ----------
const STATUS_TEXT = {
  poison: "was poisoned!", burn: "was burned!", sleep: "fell asleep!",
  paralysis: "is paralyzed! It may be unable to move.", freeze: "was frozen solid!"
};
const STATUS_VALUE = { sleep: 70, paralysis: 45, poison: 40, burn: 40, freeze: 50 };
const effSpeed = m => m.spe * (m.status === "paralysis" ? 0.5 : 1);

function immuneToStatus(def, ailment) {
  const t = def.types;
  return (ailment === "burn" && t.includes("fire")) || (ailment === "freeze" && t.includes("ice"))
    || (ailment === "poison" && (t.includes("poison") || t.includes("steel")))
    || (ailment === "paralysis" && t.includes("electric"));
}
// Thunder Wave style moves can't hit Ground types.
const statusBlocked = (mv, def) =>
  !mv.ailment || immuneToStatus(def, mv.ailment) || (mv.type === "electric" && effectiveness("electric", def.types) === 0);

// Auto-battle picks whichever move it expects to do the most good.
function pickMove(att, def, pp, hpFrac = 1) {
  let best = -1, bestScore = -1;
  att.moves.forEach((mv, i) => {
    if (pp[i] <= 0) return;
    let score;
    if (!mv.power) {
      if (def.status || statusBlocked(mv, def)) return;
      score = STATUS_VALUE[mv.ailment] * (mv.accuracy / 100) * (hpFrac < 0.3 ? 0.3 : 1);
    } else {
      const phys = mv.cls === "physical";
      const ratio = (phys ? att.atk : att.spa) / (phys ? def.def : def.spd);
      score = mv.power * (mv.accuracy / 100) * effectiveness(mv.type, def.types)
        * (att.types.includes(mv.type) ? 1.5 : 1) * ratio;
    }
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

function attackRoll(att, def, pp, forced = null, hpFrac = 1) {
  if (!att.moves || !att.moves.length) att.moves = [signatureMove(att.types[0])];
  const i = (forced != null && pp[forced] > 0) ? forced : pickMove(att, def, pp, hpFrac);
  const mv = i >= 0 ? att.moves[i]
    : { label: "Struggle", type: "normal", power: 50, accuracy: 100, cls: "physical" };
  if (i >= 0) pp[i]--;
  const statusMove = !mv.power;
  if (Math.random() * 100 >= mv.accuracy) return { dmg: 0, mv, eff: 1, crit: false, miss: true, statusMove };
  if (statusMove) return { dmg: 0, mv, eff: 1, crit: false, miss: false, statusMove,
    failed: !!def.status || statusBlocked(mv, def) };
  const eff = effectiveness(mv.type, def.types);
  const phys = mv.cls === "physical";
  const A = (phys ? att.atk : att.spa) * (phys && att.status === "burn" ? 0.5 : 1);
  const D = phys ? def.def : def.spd;
  const base = Math.floor(Math.floor(((2 * att.level) / 5 + 2) * mv.power * A / D) / 50) + 2;
  const stab = att.types.includes(mv.type) ? 1.5 : 1;
  const crit = Math.random() < 1 / 16;
  const dmg = eff === 0 ? 0 :
    Math.max(1, Math.floor(base * stab * eff * (crit ? 1.5 : 1) * (0.85 + Math.random() * 0.15)));
  return { dmg, mv, eff, crit, miss: false, statusMove: false };
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
    weaken, boost, log: [], over: false, rounds: 0
  };
}

// Plays one round. playerMove is a move index, or null to let the auto-battler choose.
// Returns just the new log entries from this round.
// itemFn, if given, replaces the player's attack this round (using an item costs your turn).
function playRound(ctx, playerMove = null, itemFn = null) {
  const start = ctx.log.length;
  const { mons, hp } = ctx;
  const say = text => ctx.log.push({ text, hp: { ...hp }, st: { p: mons.p.status, e: mons.e.status } });
  const faintCheck = k => { if (hp[k] <= 0) { mons[k].status = null; say(`${cap(mons[k].name)} fainted!`); } };
  const sp = effSpeed(mons.p), se = effSpeed(mons.e);
  const order = (sp > se || (sp === se && Math.random() < 0.5)) ? ["p", "e"] : ["e", "p"];

  for (const s of order) {
    const o = s === "p" ? "e" : "p";
    const me = mons[s], foe = mons[o];
    if (hp.p <= 0 || hp.e <= 0) break;
    if (s === "p" && itemFn) { itemFn(ctx, say); continue; }

    // Status can stop a Pokémon from moving.
    if (me.status === "sleep") {
      me.sleep = (me.sleep || 1) - 1;
      if (me.sleep > 0) say(`${cap(me.name)} is fast asleep.`);
      else { me.status = null; say(`${cap(me.name)} woke up!`); }
      continue;
    }
    if (me.status === "freeze") {
      if (Math.random() < 0.2) { me.status = null; say(`${cap(me.name)} thawed out!`); }
      else say(`${cap(me.name)} is frozen solid!`);
      continue;
    }
    if (me.status === "paralysis" && Math.random() < 0.25) { say(`${cap(me.name)} is fully paralyzed!`); continue; }

    const r = attackRoll(me, foe, ctx.pp[s], s === "p" ? playerMove : null, hp[o] / foe.maxHp);
    if (s === "p" && r.dmg) r.dmg = Math.max(1, Math.round(r.dmg * ctx.boost));
    hp[o] = Math.max(ctx.weaken && o === "e" ? 1 : 0, hp[o] - r.dmg);
    let text = `${cap(me.name)} used ${r.mv.label}!`;
    if (r.miss) text += " But it missed!";
    else if (r.statusMove) { if (r.failed) text += " But it failed!"; }
    else if (r.eff === 0) text += " It had no effect.";
    else if (r.eff > 1) text += " It's super effective!";
    else if (r.eff < 1) text += " It's not very effective.";
    if (r.crit && r.dmg) text += " A critical hit!";
    say(text);
    faintCheck(o);

    // Moves can leave a status behind.
    const a = r.mv.ailment;
    if (a && !r.miss && hp[o] > 0 && !foe.status && !immuneToStatus(foe, a) && !r.failed
        && (r.statusMove || r.dmg > 0) && Math.random() * 100 < r.mv.ailmentChance) {
      foe.status = a;
      if (a === "sleep") foe.sleep = 1 + Math.floor(Math.random() * 3);
      say(`${cap(foe.name)} ${STATUS_TEXT[a]}`);
    }
    if (ctx.weaken && hp.e <= mons.e.maxHp * 0.3) { ctx.over = true; break; }
  }

  // Poison and burn hurt at the end of the round.
  for (const k of ["p", "e"]) {
    const m = mons[k];
    if (hp[k] <= 0 || (m.status !== "poison" && m.status !== "burn")) continue;
    hp[k] = Math.max(ctx.weaken && k === "e" ? 1 : 0, hp[k] - Math.max(1, Math.floor(m.maxHp / 8)));
    say(`${cap(m.name)} is hurt by its ${m.status === "poison" ? "poison" : "burn"}!`);
    faintCheck(k);
  }
  if (ctx.weaken && hp.e <= mons.e.maxHp * 0.3) ctx.over = true;
  if (hp.p <= 0 || hp.e <= 0 || ++ctx.rounds >= 80) ctx.over = true;
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
function catchChance(enemy, ballMult = 1) {
  const base = 0.6 * (3 * enemy.maxHp - 2 * enemy.curHp) / (3 * enemy.maxHp);
  const bonus = { sleep: 2, freeze: 2, paralysis: 1.5, poison: 1.5, burn: 1.5 }[enemy.status] || 1;
  return Math.min(0.95, base * bonus * ballMult);
}
