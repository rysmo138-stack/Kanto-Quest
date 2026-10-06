// Game flow: starters, routes, wild battles, catching, trainers, gyms, evolution.
const app = document.getElementById("app");
const freshState = () => ({ party: [], box: [], badges: [], difficulty: 0, manual: false, caught: false, balls: 5, routeIndex: 0, nodeIndex: 0, message: "" });
let state = freshState();

// ---------- Saving ----------
const SAVE_KEY = "kq:save";
function saveGame() {
  try {
    const { party, box, badges, difficulty, manual, caught, balls, routeIndex, nodeIndex } = state;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, party, box, badges, difficulty, manual, caught, balls, routeIndex, nodeIndex }));
  } catch (e) { /* storage unavailable: the game still works, it just won't save */ }
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.v === 1 && Array.isArray(s.party) && s.party.length && ROUTES[s.routeIndex]) return s;
  } catch (e) {}
  return null;
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

// Hard and Expert raise the level of every wild Pokémon, trainer, and gym leader.
const DIFFICULTIES = [["Normal", 0], ["Hard", 4], ["Expert", 8]];
const levelBonus = () => DIFFICULTIES[state.difficulty || 0][1];
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const typesText = m => m.types.map(cap).join(" / ");
const lead = () => state.party.find(m => m.curHp > 0);
const boost = () => 1 + 0.1 * state.badges.length;

function hpBar(cur, max) {
  const pct = Math.max(0, Math.round((cur / max) * 100));
  const color = pct > 50 ? "#4a7c2a" : pct > 20 ? "#c9a227" : "#c2412d";
  return `<div class="bar" role="img" aria-label="HP ${cur} of ${max}"><div style="width:${pct}%;background:${color}"></div></div>`;
}
function monCard(m) {
  return `<div class="mon ${m.curHp <= 0 ? "fainted" : ""}"><img src="${m.sprite}" alt="${cap(m.name)}">
    <div>${cap(m.name)} Lv${m.level}</div>${hpBar(m.curHp, m.maxHp)}<div>${m.curHp}/${m.maxHp}</div></div>`;
}
async function newBattler(name, level) {
  const b = makeBattler(await getPokemon(name), level);
  await refreshMoves(b);
  return b;
}
const makeFoes = team => Promise.all(team.map(([n, l]) => newBattler(n, l + levelBonus())));

// ---------- XP and evolution ----------
async function evolveIfReady(m) {
  let msg = "";
  for (let i = 0; i < 2; i++) {
    const e = EVOLUTIONS[m.name];
    if (!e || m.level < e[0]) break;
    try {
      const base = await getPokemon(e[1]);
      const old = m.name, oldMax = m.maxHp;
      Object.assign(m, base, calcStats(base, m.level));
      m.curHp = Math.min(m.maxHp, m.curHp + (m.maxHp - oldMax));
      msg += ` ${cap(old)} evolved into ${cap(m.name)}!`;
    } catch (err) { break; }
  }
  return msg;
}
// The Pokémon that fought gets full XP; the rest of the healthy party gets half.
async function rewardXp(me, foe, mult = 1) {
  const base = Math.round(foe.level * 6 * mult);
  const out = [];
  for (const m of state.party) {
    if (m.curHp <= 0) continue;
    const msgs = gainXp(m, m === me ? base : Math.round(base / 2));
    const extra = await evolveIfReady(m);
    const learned = await refreshMoves(m);
    const moveMsg = learned.length ? ` ${cap(m.name)} learned ${learned.join(" and ")}!` : "";
    out.push((m === me ? msgs : msgs.slice(1)).join(" ") + extra + moveMsg);
  }
  return out.filter(Boolean).join(" ");
}

// ---------- Screens ----------
function showGameOver(msg) {
  clearSave();
  app.innerHTML = `<h2>Out of Pokémon</h2><div class="panel"><p>${msg}</p>
    <button class="primary" id="again">Start over</button></div>`;
  document.getElementById("again").addEventListener("click", showStarters);
}

function showTitle() {
  const s = loadSave();
  if (!s) return showStarters();
  const route = ROUTES[s.routeIndex];
  const first = s.party.find(p => p.curHp > 0) || s.party[0];
  app.innerHTML = `
    <h1>Kanto Quest</h1>
    <div class="panel">
      <p>Saved run: ${route.name}, ${s.badges.length} badge${s.badges.length === 1 ? "" : "s"},
      ${DIFFICULTIES[s.difficulty || 0][0]} difficulty, ${s.party.length} in your party, led by ${cap(first.name)} Lv${first.level}.</p>
      <div class="row"><button class="primary" id="cont">Continue</button>
      <button id="new">New game</button></div>
    </div>`;
  document.getElementById("cont").addEventListener("click", async () => {
    state = Object.assign(freshState(), s, { message: "" });
    app.innerHTML = `<p>Loading...</p>`;
    try {
      for (const p of [...state.party, ...state.box]) {
        if (p.moves && p.moves.length) continue;
        p.learnset = (await getPokemon(p.name)).learnset;
        await refreshMoves(p);
      }
    } catch (err) { /* battles fall back to a basic move if this fails */ }
    showRoute();
  });
  const newBtn = document.getElementById("new");
  newBtn.addEventListener("click", () => {
    if (newBtn.dataset.sure) { clearSave(); return showStarters(); }
    newBtn.dataset.sure = "1";
    newBtn.textContent = "Really delete the saved run?";
  });
}

async function showStarters() {
  state = freshState();
  app.innerHTML = `<h1>Kanto Quest</h1><p>Loading starters...</p>`;
  try {
    const mons = await Promise.all(STARTERS.map(getPokemon));
    app.innerHTML = `
      <h1>Kanto Quest</h1>
      <p>Your journey from Pallet Town to the Pokémon League starts here.</p>
      <p>Difficulty (Hard and Expert raise every enemy's level):</p>
      <div class="row" id="diff">${DIFFICULTIES.map(([n, b], i) =>
        `<button data-d="${i}" aria-pressed="${i === 0}">${n}${b ? ` (+${b})` : ""}</button>`).join("")}</div>
      <p>Now choose your first partner.</p>
      <div class="row">
        ${mons.map(m => `
          <button class="starter" data-name="${m.name}">
            <img src="${m.sprite}" alt="">
            <div><strong>${cap(m.name)}</strong></div>
            <div>${typesText(m)}</div>
          </button>`).join("")}
      </div>`;
    app.querySelectorAll("#diff button").forEach(btn => btn.addEventListener("click", () => {
      state.difficulty = Number(btn.dataset.d);
      app.querySelectorAll("#diff button").forEach(b => b.setAttribute("aria-pressed", String(b === btn)));
    }));
    app.querySelectorAll(".starter").forEach(btn =>
      btn.addEventListener("click", async () => {
        app.innerHTML = `<p>Loading...</p>`;
        const starter = makeBattler(mons.find(m => m.name === btn.dataset.name), 5);
        await refreshMoves(starter);
        state.party = [starter];
        showRoute();
      }));
  } catch (err) {
    app.innerHTML = `<h1>Kanto Quest</h1><p class="error">${err.message}. Check your connection and reload.</p>
      <button id="retry">Try again</button>`;
    document.getElementById("retry").addEventListener("click", showStarters);
  }
}

function showRoute() {
  saveGame();
  const route = ROUTES[state.routeIndex];
  const finished = state.nodeIndex >= route.nodes.length;
  const next = ROUTES[state.routeIndex + 1];
  const nodes = route.nodes.map((n, i) => {
    const done = i < state.nodeIndex, current = i === state.nodeIndex;
    const cls = done ? "done" : current ? "" : "locked";
    return `<li><button class="node ${cls}" data-i="${i}" ${current ? "" : "disabled"}>
      <span class="icon">${NODE_ICONS[n.type]}</span><span>${n.label}</span></button></li>`;
  }).join("");

  app.innerHTML = `
    <h2>${route.name}</h2>
    <p>${route.blurb}</p>
    <p class="stats">${DIFFICULTIES[state.difficulty || 0][0]} &nbsp; Poké Balls: ${state.balls} &nbsp; Catch this route: ${state.caught ? "used" : "available"} &nbsp; Box: ${state.box.length} &nbsp; Badges: ${state.badges.join(", ") || "none"}</p>
    <div class="party">${state.party.map(monCard).join("")}</div>
    <p class="row"><button id="manage">Manage party (${state.party.length}/6, box ${state.box.length})</button>
    <button id="mode">Battles: ${state.manual ? "Manual" : "Auto"} (tap to switch)</button></p>
    <ul class="path">${nodes}</ul>
    ${state.message ? `<div class="panel">${state.message}</div>` : ""}
    ${finished ? (next
      ? `<p></p><button class="primary" id="travel">Travel to ${next.name}</button>`
      : `<p></p><div class="panel"><p>That's everything built so far. Routes 16 to 18, Cycling Road, and Koga in Fuchsia City come next!</p></div>`) : ""}`;

  app.querySelectorAll(".node:not([disabled])").forEach(btn =>
    btn.addEventListener("click", () => playNode(Number(btn.dataset.i))));
  document.getElementById("manage").addEventListener("click", showParty);
  document.getElementById("mode").addEventListener("click", () => { state.manual = !state.manual; showRoute(); });
  const travel = document.getElementById("travel");
  if (travel) travel.addEventListener("click", () => {
    state.routeIndex++; state.nodeIndex = 0; state.caught = false; state.message = ""; showRoute();
  });
}

async function playNode(i) {
  const route = ROUTES[state.routeIndex];
  const node = route.nodes[i];
  state.message = "";
  app.innerHTML = `<p>Loading...</p>`;
  try {
    if (node.type === "wild") {
      const [lo, hi] = route.levels || [3, 5];
      const enemy = await newBattler(pick(route.wild), randInt(lo, hi) + levelBonus());
      return showEncounter(enemy, i);
    }
    if (node.type === "gift") {
      const g = await newBattler(node.mon, node.level);
      const full = state.party.length >= 6;
      (full ? state.box : state.party).push(g);
      state.message = `<p>The hiker gave you ${cap(g.name)} (Lv${g.level})! It's a Grass type, which is strong against Rock Pokémon. ${full ? "Your party was full, so it went to your box." : ""}</p>`;
      state.nodeIndex = i + 1;
      return showRoute();
    }
    if (node.type === "trainer") return runTrainer(node, await makeFoes(node.team), i, "");
    if (node.type === "gym") return showGymIntro(node, await makeFoes(node.team), i);
  } catch (err) {
    state.message = `<span class="error">${err.message}</span>`;
    return showRoute();
  }
  if (node.type === "item" && node.item === "ball") {
    state.balls += node.amount;
    state.message = `<p>You found ${node.amount} Poké Balls! You now have ${state.balls}.</p>`;
  } else if (node.type === "item") {
    state.party.forEach(m => { if (m.curHp > 0) m.curHp = Math.min(m.maxHp, m.curHp + 20); });
    state.message = `<p>You found a Potion and used it. Your healthy Pokémon restored 20 HP.</p>`;
  } else if (node.type === "heal") {
    state.party.forEach(m => { m.curHp = m.maxHp; restorePP(m); });
    state.message = `<p>Your whole party is back to full health, and their moves are restored.</p>`;
  } else if (node.type === "end") {
    state.message = `<p>You arrived at: ${node.label}.</p>`;
  }
  state.nodeIndex = i + 1;
  showRoute();
}

// ---------- Party management ----------
function showParty() {
  const p = state.party, b = state.box;
  const movesLine = m => `<small class="moves">${(m.moves || []).map(x => `${x.label} (${x.type}, ${x.power}, PP ${x.curPp}/${x.pp})`).join("<br>")}</small>`;
  const partyRows = p.map((m, i) => `<div class="partyrow">${monCard(m)}${movesLine(m)}<div class="row">
      <button data-a="up" data-i="${i}" ${i === 0 ? "disabled" : ""}>Up</button>
      <button data-a="down" data-i="${i}" ${i === p.length - 1 ? "disabled" : ""}>Down</button>
      <button data-a="tobox" data-i="${i}" ${p.length <= 1 ? "disabled" : ""}>To box</button></div></div>`).join("");
  const boxRows = b.length ? b.map((m, i) => `<div class="partyrow">${monCard(m)}${movesLine(m)}<div class="row">
      <button data-a="toparty" data-i="${i}" ${p.length >= 6 ? "disabled" : ""}>Add to party</button></div></div>`).join("")
    : `<p>Your box is empty.</p>`;
  app.innerHTML = `
    <h2>Your party</h2>
    <p>The first healthy Pokémon in this list fights first. You can carry up to 6.</p>
    ${partyRows}
    <h2>Box</h2>
    ${boxRows}
    <p></p><button class="primary" id="back">Back to the route</button>`;
  app.querySelectorAll("button[data-a]").forEach(btn => btn.addEventListener("click", () => {
    const i = Number(btn.dataset.i), a = btn.dataset.a;
    if (a === "up") [p[i - 1], p[i]] = [p[i], p[i - 1]];
    if (a === "down") [p[i + 1], p[i]] = [p[i], p[i + 1]];
    if (a === "tobox") b.push(p.splice(i, 1)[0]);
    if (a === "toparty") p.push(b.splice(i, 1)[0]);
    saveGame();
    showParty();
  }));
  document.getElementById("back").addEventListener("click", showRoute);
}

// ---------- Gym and trainers ----------
function showGymIntro(node, foes, nodeI) {
  app.innerHTML = `
    <h2>${node.leader}'s Gym</h2>
    <p>Here is ${node.leader}'s team. Win to earn the ${node.badge}. Perk: ${BADGE_PERK}</p>
    <div class="party">${foes.map(monCard).join("")}</div>
    <p>Your party:</p>
    <div class="party">${state.party.map(monCard).join("")}</div>
    <div class="row"><button class="primary" id="go">Challenge ${node.leader}</button>
    <button id="back">Not yet</button></div>`;
  document.getElementById("go").addEventListener("click", () => runTrainer(node, foes, nodeI, ""));
  document.getElementById("back").addEventListener("click", showRoute);
}

function runTrainer(node, foes, nodeI, log) {
  const me = lead();
  if (!me) return showGameOver(`You lost to ${node.name || node.leader}...`);
  const foe = foes.find(f => f.curHp > 0);
  const who = node.name || node.leader;
  if (!foe) {
    state.nodeIndex = nodeI + 1;
    let msg = `<p>You defeated ${who}!</p>`;
    if (node.badge) {
      state.badges.push(node.badge);
      state.party.forEach(p => { p.curHp = p.maxHp; restorePP(p); });
      msg = `<p>You defeated ${who} and earned the ${node.badge}! ${BADGE_PERK} Your whole party was healed to full health.</p>`;
    }
    state.message = msg + (log ? `<p>${log}</p>` : "");
    return showRoute();
  }
  playFight(me, foe, `${who} sends out ${cap(foe.name)}`, false, 1.5, r => {
    const more = r.extra ? log + " " + r.extra : log;
    if (!lead()) return showGameOver(`You lost to ${who}...`);
    runTrainer(node, foes, nodeI, more);
  });
}

// ---------- Wild encounters ----------
function showEncounter(enemy, nodeI, note = "") {
  const me = lead();
  const chance = Math.round(catchChance(enemy) * 100);
  const weak = enemy.curHp <= enemy.maxHp * 0.3;
  app.innerHTML = `
    <h2>Wild ${cap(enemy.name)} appeared!</h2>
    <div class="panel battle">
      <div class="side"><img src="${enemy.sprite}" alt="${cap(enemy.name)}">
        <div>${cap(enemy.name)} Lv${enemy.level} <small>${typesText(enemy)}</small></div>
        ${hpBar(enemy.curHp, enemy.maxHp)}<small>${enemy.curHp}/${enemy.maxHp}</small></div>
      <div class="side"><img src="${me.sprite}" alt="${cap(me.name)}">
        <div>${cap(me.name)} Lv${me.level} <small>${typesText(me)}</small></div>
        ${hpBar(me.curHp, me.maxHp)}<small>${me.curHp}/${me.maxHp}</small></div>
      <p class="line">${note || "What will you do?"} ${state.caught ? "You already caught a Pokémon on this route." : `Catch chance: about ${chance}%.`}</p>
      <div class="row">
        <button class="primary" id="fight">Fight</button>
        <button id="weaken" ${weak ? "disabled" : ""}>Weaken</button>
        <button id="ball" ${state.balls && !state.caught ? "" : "disabled"}>${state.caught ? "Already caught one here" : `Throw Poké Ball (${state.balls})`}</button>
        <button id="run">Run</button>
      </div>
    </div>`;
  const wildFight = weaken => playFight(me, enemy, `${weaken ? "Weakening" : "Fighting"} the wild ${cap(enemy.name)}`, weaken, 1, r => {
    if (r.foeDown) {
      state.nodeIndex = nodeI + 1;
      state.message = `<p>You defeated the wild ${cap(enemy.name)}! ${r.extra}</p>`;
      return showRoute();
    }
    if (!lead()) return showGameOver(`${cap(me.name)} fainted. You have no Pokémon left...`);
    showEncounter(enemy, nodeI, r.meDown
      ? `${cap(me.name)} fainted! ${cap(lead().name)} steps up.`
      : `The wild ${cap(enemy.name)} is weak enough to catch!`);
  });
  document.getElementById("fight").addEventListener("click", () => wildFight(false));
  document.getElementById("weaken").addEventListener("click", () => wildFight(true));
  document.getElementById("ball").addEventListener("click", () => throwBall(enemy, nodeI));
  document.getElementById("run").addEventListener("click", () => {
    state.nodeIndex = nodeI + 1;
    state.message = `<p>You got away from the wild ${cap(enemy.name)}.</p>`;
    showRoute();
  });
}

function throwBall(enemy, nodeI) {
  state.balls--;
  if (Math.random() < catchChance(enemy)) {
    enemy.xp = 0;
    state.caught = true;
    let where = "added to your party";
    if (state.party.length < 6) state.party.push(enemy);
    else { state.box.push(enemy); where = "sent to your box (party is full)"; }
    state.nodeIndex = nodeI + 1;
    state.message = `<p>Gotcha! ${cap(enemy.name)} was caught and ${where}.</p>`;
    return showRoute();
  }
  showEncounter(enemy, nodeI, "Oh no, it broke free!");
}

// ---------- Fight playback (used by wild, trainer, and gym battles) ----------
function playFight(me, foe, title, weaken, xpMult, onDone) {
  const ctx = newBattleCtx(me, foe, weaken, boost());
  let timer = null;
  const side = (m, id) => `<div class="side"><img src="${m.sprite}" alt="${cap(m.name)}">
    <div>${cap(m.name)} Lv${m.level} <small>${typesText(m)}</small></div><div id="${id}"></div></div>`;

  app.innerHTML = `
    <h2>${title}</h2>
    <div class="panel battle">
      ${side(foe, "bar-e")}${side(me, "bar-p")}
      <p id="line" class="line">Battle start!</p>
      <div id="actions" class="row"></div>
    </div>`;
  const barE = document.getElementById("bar-e"), barP = document.getElementById("bar-p");
  const line = document.getElementById("line"), actions = document.getElementById("actions");
  const draw = hp => {
    barE.innerHTML = hpBar(hp.e, foe.maxHp) + `<small>${hp.e}/${foe.maxHp}</small>`;
    barP.innerHTML = hpBar(hp.p, me.maxHp) + `<small>${hp.p}/${me.maxHp}</small>`;
  };
  draw(ctx.hp);
  draw({ p: me.curHp, e: foe.curHp });

  const finish = () => {
    clearTimeout(timer);
    draw(ctx.hp);
    me.curHp = ctx.hp.p;
    foe.curHp = ctx.hp.e;
    me.moves.forEach((mv, i) => { mv.curPp = ctx.pp.p[i]; });
    foe.moves.forEach((mv, i) => { mv.curPp = ctx.pp.e[i]; });
    const foeDown = foe.curHp <= 0, meDown = me.curHp <= 0;
    line.textContent = foeDown ? `${cap(foe.name)} fainted!` : meDown ? `${cap(me.name)} fainted!` : "The fight paused.";
    actions.innerHTML = `<button class="primary" id="go">Continue</button>`;
    document.getElementById("go").addEventListener("click", async () => {
      const extra = foeDown ? await rewardXp(me, foe, xpMult) : "";
      onDone({ foeDown, meDown, extra });
    });
  };

  // Shows log entries one at a time, then calls done.
  const play = (entries, done) => {
    let k = 0;
    const next = () => {
      if (k >= entries.length) return done();
      line.textContent = entries[k].text;
      draw(entries[k].hp);
      k++;
      timer = setTimeout(next, 900);
    };
    next();
  };
  const autoRest = () => {
    const before = ctx.log.length;
    while (!ctx.over) playRound(ctx);
    actions.innerHTML = `<button id="skip">Skip</button>`;
    document.getElementById("skip").addEventListener("click", finish);
    play(ctx.log.slice(before), finish);
  };

  const showMoves = () => {
    line.textContent = "Choose a move!";
    const usable = me.moves.some((mv, i) => ctx.pp.p[i] > 0);
    actions.innerHTML = me.moves.map((mv, i) => `<button class="movebtn" data-m="${i}" ${ctx.pp.p[i] > 0 ? "" : "disabled"}>
        ${mv.label}<br><small>${cap(mv.type)}, power ${mv.power}, PP ${ctx.pp.p[i]}/${mv.pp}</small></button>`).join("")
      + (usable ? "" : `<button class="movebtn" data-m="-1">Struggle</button>`)
      + `<button id="auto">Auto the rest</button>`;
    actions.querySelectorAll("[data-m]").forEach(btn => btn.addEventListener("click", () => {
      actions.innerHTML = "";
      const entries = playRound(ctx, Number(btn.dataset.m) >= 0 ? Number(btn.dataset.m) : null);
      play(entries, () => (ctx.over ? finish() : showMoves()));
    }));
    document.getElementById("auto").addEventListener("click", autoRest);
  };

  if (state.manual) showMoves();
  else setTimeout(autoRest, 600);
}

showTitle();
