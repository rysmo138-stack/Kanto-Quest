// Game flow: starters, routes, wild battles, catching, trainers, gyms, evolution.
const app = document.getElementById("app");
const freshState = () => ({ party: [], box: [], badges: [], difficulty: 0, manual: false, money: 500, items: { potion: 3 }, dex: {}, starterName: null, caught: false, balls: 5, routeIndex: 0, nodeIndex: 0, message: "" });
let state = freshState();

// ---------- Saving ----------
const SAVE_KEY = "kq:save";
function saveGame() {
  try {
    const { party, box, badges, difficulty, manual, money, items, dex, starterName, caught, balls, routeIndex, nodeIndex } = state;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, party, box, badges, difficulty, manual, money, items, dex, starterName, caught, balls, routeIndex, nodeIndex }));
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
const typeBadge = t => `<span class="type t-${t}">${cap(t)}</span>`;
const typesText = m => m.types.map(typeBadge).join(" ");
const lead = () => state.party.find(m => m.curHp > 0);
const boost = () => 1 + 0.1 * state.badges.length;

function hpBar(cur, max) {
  const pct = Math.max(0, Math.round((cur / max) * 100));
  const color = pct > 50 ? "#4a7c2a" : pct > 20 ? "#c9a227" : "#c2412d";
  return `<div class="bar" role="img" aria-label="HP ${cur} of ${max}"><div style="width:${pct}%;background:${color}"></div></div>`;
}
const STATUS_TAGS = { poison: "PSN", burn: "BRN", paralysis: "PAR", sleep: "SLP", freeze: "FRZ" };
const stTag = s => (s ? `<span class="st st-${s}">${STATUS_TAGS[s]}</span>` : "");

function monCard(m) {
  return `<div class="mon ${m.curHp <= 0 ? "fainted" : ""}"><img src="${m.sprite}" alt="${cap(m.name)}">
    <div>${cap(m.name)} Lv${m.level} ${stTag(m.status)}</div>${hpBar(m.curHp, m.maxHp)}<div>${m.curHp}/${m.maxHp}</div></div>`;
}
// ---------- Pokédex ----------
function dexSee(p) {
  if (!state.dex[p.name]) state.dex[p.name] = { id: p.id, name: p.name, types: p.types, sprite: p.sprite, caught: false };
}
function dexCatch(p) { dexSee(p); state.dex[p.name].caught = true; }

async function newBattler(name, level) {
  const b = makeBattler(await getPokemon(name), level);
  await refreshMoves(b);
  dexSee(b);
  return b;
}
// "$rival" in a team means: whichever starter beats yours, evolved to match the level.
function rivalSpecies(level) {
  let n = RIVAL_STARTER[state.starterName] || "charmander";
  while (EVOLUTIONS[n] && level >= EVOLUTIONS[n][0]) n = EVOLUTIONS[n][1];
  return n;
}
// A fuller party card: sprite, types, HP, and XP, with a stripe in the Pokémon's main type color.
function partyCard(m) {
  const xp = Math.min(100, Math.round((100 * (m.xp || 0)) / (m.level * m.level)));
  return `<div class="pcard bt-${m.types[0]} ${m.curHp <= 0 ? "fainted" : ""}">
    <img src="${m.sprite}" alt="${cap(m.name)}">
    <div class="pname">${cap(m.name)} <small>Lv${m.level}</small> ${stTag(m.status)}</div>
    <div>${typesText(m)}</div>
    ${hpBar(m.curHp, m.maxHp)}<small>${m.curHp}/${m.maxHp} HP</small>
    <div class="xpbar" title="XP"><div style="width:${xp}%"></div></div>
  </div>`;
}

// The route as a winding path: rows of 4 stops that snake back and forth, joined by a line.
function mapHtml(route) {
  const PER = 4;
  const rows = [];
  for (let r = 0; r * PER < route.nodes.length; r++) {
    const slice = route.nodes.slice(r * PER, r * PER + PER);
    const more = (r + 1) * PER < route.nodes.length;
    const nodes = slice.map((n, k) => {
      const i = r * PER + k;
      const done = i < state.nodeIndex, current = i === state.nodeIndex;
      const short = n.label.replace(/^(Trainer|Gym): /, "");
      const lead0 = state.party.find(p => p.curHp > 0) || state.party[0];
      return `<button class="mapnode n-${n.type} ${done ? "done" : current ? "current" : "locked"}" data-i="${i}"
        title="${n.label}" ${current ? "" : "disabled"}>
        ${current && lead0 ? `<img class="marker" src="${lead0.sprite}" alt="">` : ""}
        <span class="icon">${NODE_ICONS[n.type]}</span><span class="lbl">${short}</span></button>`;
    }).join("");
    rows.push(`<div class="maprow ${r % 2 ? "rev" : ""} ${more ? "more" : ""}" style="--n:${slice.length}">${nodes}</div>`);
  }
  return `<div class="map">${rows.join("")}</div>`;
}

// The battle picture: foe top right, your Pokémon bottom left, an info box for each.
function sceneHtml(me, foe) {
  const t = state.terrain || "grass";
  const youImg = me.aBack || me.back || me.sprite;
  const noBack = !(me.aBack || me.back);
  const xpPct = Math.min(100, Math.round((100 * (me.xp || 0)) / (me.level * me.level)));
  return `<div class="scene ${t}">
    <div class="plat foe-plat"></div><div class="plat you-plat"></div>
    <img id="spr-e" class="spr foe" src="${foe.aFront || foe.sprite}" alt="${cap(foe.name)}">
    <img id="spr-p" class="spr you ${noBack ? "noback" : ""}" src="${youImg}" alt="${cap(me.name)}">
    <div class="infobox foe-box"><div>${cap(foe.name)} Lv${foe.level} <span id="st-bar-e">${stTag(foe.status)}</span></div>
      <div>${typesText(foe)}</div>
      <div id="bar-e">${hpBar(foe.curHp, foe.maxHp)}<small>${foe.curHp}/${foe.maxHp}</small></div></div>
    <div class="infobox you-box"><div>${cap(me.name)} Lv${me.level} <span id="st-bar-p">${stTag(me.status)}</span></div>
      <div>${typesText(me)}</div>
      <div id="bar-p">${hpBar(me.curHp, me.maxHp)}<small>${me.curHp}/${me.maxHp}</small></div>
      <div class="xpbar" title="XP"><div style="width:${xpPct}%"></div></div></div>
  </div>`;
}

// Small attack, hit, and faint animations. Skipped if the player prefers reduced motion.
function fxPlay(entry) {
  if (!entry.fx || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
  const el = k => document.getElementById("spr-" + k);
  const { a, h, f } = entry.fx;
  if (a && el(a)) {
    const dir = a === "p" ? 1 : -1;
    el(a).animate([{ transform: "translateX(0)" }, { transform: `translateX(${dir * 28}px)` }, { transform: "translateX(0)" }], { duration: 260 });
  }
  if (h && el(h)) setTimeout(() => el(h) && el(h).animate([{ opacity: 1 }, { opacity: .2 }, { opacity: 1 }, { opacity: .3 }, { opacity: 1 }], { duration: 380 }), 180);
  if (f && el(f)) el(f).animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(30px)" }], { duration: 500, fill: "forwards" });
}

const makeFoes = team => Promise.all(team.map(([n, l]) => newBattler(n === "$rival" ? rivalSpecies(l + levelBonus()) : n, l + levelBonus())));

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
      dexCatch(m);
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
    for (const p of [...state.party, ...state.box]) dexCatch(p);
    if (!state.starterName) {
      const names = state.party.map(p => p.name);
      const line = STARTER_LINES.find(l => l.some(n => names.includes(n)));
      state.starterName = line ? line[0] : "squirtle";
    }
    try {
      for (const p of [...state.party, ...state.box]) {
        if (p.back === undefined) {
          const info = await getPokemon(p.name);
          p.back = info.back; p.aFront = info.aFront; p.aBack = info.aBack;
        }
        if (p.moves && p.moves.length && p.moves.every(x => x.ailment !== undefined)) continue;
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
        state.starterName = starter.name;
        dexCatch(starter);
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
  app.innerHTML = `
    <h2>${route.name} <small>Stop ${Math.min(state.nodeIndex + 1, route.nodes.length)} of ${route.nodes.length}</small></h2>
    <p>${route.blurb}</p>
    <p class="stats">${DIFFICULTIES[state.difficulty || 0][0]} &nbsp; ₽${state.money} &nbsp; Poké Balls: ${state.balls} &nbsp; Catch this route: ${state.caught ? "used" : "available"} &nbsp; Box: ${state.box.length} &nbsp; Badges: ${state.badges.join(", ") || "none"}</p>
    <div class="party">${state.party.map(partyCard).join("")}</div>
    <p class="row"><button id="manage">Manage party (${state.party.length}/6, box ${state.box.length})</button>
    <button id="bag">Bag</button>
    <button id="dex">Pokédex (${Object.keys(state.dex).length} seen)</button>
    <button id="mode">Battles: ${state.manual ? "Manual" : "Auto"} (tap to switch)</button></p>
    ${mapHtml(route)}
    ${state.message ? `<div class="panel">${state.message}</div>` : ""}
    ${finished ? (next
      ? `<p></p><button class="primary" id="travel">Travel to ${next.name}</button>`
      : `<p></p><div class="panel"><p>That's everything built so far. Routes 16 to 18, Cycling Road, and Koga in Fuchsia City come next!</p></div>`) : ""}`;

  app.querySelectorAll(".mapnode:not([disabled])").forEach(btn =>
    btn.addEventListener("click", () => playNode(Number(btn.dataset.i))));
  document.getElementById("manage").addEventListener("click", showParty);
  document.getElementById("bag").addEventListener("click", () => showBag(showRoute));
  document.getElementById("dex").addEventListener("click", () => showDex(showRoute));
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
  state.terrain = node.type === "gym" ? "gym" : (route.terrain || "grass");
  app.innerHTML = `<p>Loading...</p>`;
  try {
    if (node.type === "wild") {
      const [lo, hi] = route.levels || [3, 5];
      const enemy = await newBattler(pick(route.wild), randInt(lo, hi) + levelBonus());
      return showEncounter(enemy, i);
    }
    if (node.type === "shop") return showShop(i);
    if (node.type === "gift") {
      const g = await newBattler(node.mon, node.level);
      dexCatch(g);
      const full = state.party.length >= 6;
      (full ? state.box : state.party).push(g);
      state.message = `<p>The hiker gave you ${cap(g.name)} (Lv${g.level})! It's a Grass type, which is strong against Rock Pokémon. ${full ? "Your party was full, so it went to your box." : ""}</p>`;
      state.nodeIndex = i + 1;
      return showRoute();
    }
    if (node.type === "rival") return showRivalIntro(node, await makeFoes(node.team), i);
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
    state.items.potion = (state.items.potion || 0) + 1;
    state.message = `<p>You found a Potion and put it in your Bag. You have ${state.items.potion}.</p>`;
  } else if (node.type === "heal") {
    state.party.forEach(m => { m.curHp = m.maxHp; restoreAll(m); });
    state.message = `<p>Your whole party is back to full health, and their moves and status are restored.</p>`;
  } else if (node.type === "end") {
    state.message = `<p>You arrived at: ${node.label}.</p>`;
  }
  state.nodeIndex = i + 1;
  showRoute();
}

function showDex(back) {
  const entries = Object.values(state.dex).sort((a, b) => a.id - b.id);
  const caught = entries.filter(e => e.caught).length;
  app.innerHTML = `
    <h2>Pokédex</h2>
    <p class="stats">Seen: ${entries.length} &nbsp; Caught: ${caught} &nbsp; of 151</p>
    ${entries.length ? `<div class="dexgrid">${entries.map(e => `<div class="mon ${e.caught ? "" : "seenonly"}">
      <img src="${e.sprite}" alt="${cap(e.name)}"><div>#${String(e.id).padStart(3, "0")}</div><div>${cap(e.name)}</div>
      <small>${e.types.map(typeBadge).join(" ")}</small><small>${e.caught ? "Caught" : "Seen"}</small></div>`).join("")}</div>`
      : "<p>You haven't seen any Pokémon yet.</p>"}
    <p></p><button class="primary" id="dexback">Back</button>`;
  document.getElementById("dexback").addEventListener("click", back);
}

// ---------- Bag and shop ----------
const bagItems = () => Object.entries(state.items).filter(([k, n]) => n > 0 && ITEMS[k] && !ITEMS[k].ball);
const curesStatus = (it, status) => status && it.cure && (it.cure === "all" || it.cure.includes(status));

function itemUsable(key, mon) {
  const it = ITEMS[key];
  if (it.revive) return mon.curHp <= 0;
  if (mon.curHp <= 0) return false;
  return (it.heal && mon.curHp < mon.maxHp) || curesStatus(it, mon.status);
}
function useItem(key, mon) {
  const it = ITEMS[key];
  state.items[key]--;
  if (it.revive) {
    mon.curHp = Math.max(1, Math.floor(mon.maxHp * it.revive));
    mon.status = null;
    return `${cap(mon.name)} was revived!`;
  }
  const parts = [];
  if (it.heal && mon.curHp < mon.maxHp) {
    const h = Math.min(it.heal, mon.maxHp - mon.curHp);
    mon.curHp += h;
    parts.push(`restored ${h} HP`);
  }
  if (curesStatus(it, mon.status)) { parts.push(`was cured of ${mon.status}`); mon.status = null; }
  return `${cap(mon.name)} ${parts.join(" and ")}.`;
}

function showBag(back, note = "") {
  const list = bagItems();
  app.innerHTML = `
    <h2>Bag</h2>
    <p class="stats">Money: ₽${state.money} &nbsp; Poké Balls: ${state.balls} &nbsp; Great Balls: ${state.items.greatball || 0}</p>
    ${note ? `<div class="panel">${note}</div><p></p>` : ""}
    ${list.length ? list.map(([k, n]) => `<div class="bagrow"><strong>${ITEMS[k].name}</strong> x${n} <small>${ITEMS[k].desc}</small>
      <div class="row">${state.party.map((p, i) => `<button data-k="${k}" data-i="${i}" ${itemUsable(k, p) ? "" : "disabled"}>${cap(p.name)} ${p.curHp}/${p.maxHp}${p.status ? " " + STATUS_TAGS[p.status] : ""}</button>`).join("")}</div></div>`).join("")
      : "<p>You have no usable items.</p>"}
    <p></p><button class="primary" id="bagback">Back</button>`;
  app.querySelectorAll("button[data-k]").forEach(btn => btn.addEventListener("click", () => {
    const msg = useItem(btn.dataset.k, state.party[Number(btn.dataset.i)]);
    saveGame();
    showBag(back, msg);
  }));
  document.getElementById("bagback").addEventListener("click", back);
}

function showShop(nodeI, note = "") {
  const owned = k => (k === "pokeball" ? state.balls : state.items[k] || 0);
  app.innerHTML = `
    <h2>Poké Mart</h2>
    <p class="stats">Money: ₽${state.money}</p>
    ${note ? `<div class="panel">${note}</div><p></p>` : ""}
    ${SHOP_STOCK.map(k => `<div class="bagrow"><strong>${ITEMS[k].name}</strong> ₽${ITEMS[k].price} <small>${ITEMS[k].desc} You have ${owned(k)}.</small>
      <div><button data-buy="${k}" ${state.money >= ITEMS[k].price ? "" : "disabled"}>Buy</button></div></div>`).join("")}
    <p></p><button class="primary" id="leave">Leave</button>`;
  app.querySelectorAll("button[data-buy]").forEach(btn => btn.addEventListener("click", () => {
    const k = btn.dataset.buy;
    state.money -= ITEMS[k].price;
    if (k === "pokeball") state.balls++; else state.items[k] = (state.items[k] || 0) + 1;
    saveGame();
    showShop(nodeI, `Bought a ${ITEMS[k].name}.`);
  }));
  document.getElementById("leave").addEventListener("click", () => {
    state.nodeIndex = nodeI + 1;
    state.message = `<p>You left the Poké Mart.</p>`;
    showRoute();
  });
}

// ---------- Party management ----------
function showParty() {
  const p = state.party, b = state.box;
  const movesLine = m => `<small class="moves">${(m.moves || []).map(x => `${x.label} ${typeBadge(x.type)} ${x.power || "status"}, PP ${x.curPp}/${x.pp}`).join("<br>")}</small>`;
  const partyRows = p.map((m, i) => `<div class="partyrow">${partyCard(m)}${movesLine(m)}<div class="row">
      <button data-a="up" data-i="${i}" ${i === 0 ? "disabled" : ""}>Up</button>
      <button data-a="down" data-i="${i}" ${i === p.length - 1 ? "disabled" : ""}>Down</button>
      <button data-a="tobox" data-i="${i}" ${p.length <= 1 ? "disabled" : ""}>To box</button></div></div>`).join("");
  const boxRows = b.length ? b.map((m, i) => `<div class="partyrow">${partyCard(m)}${movesLine(m)}<div class="row">
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
function showRivalIntro(node, foes, nodeI) {
  app.innerHTML = `
    <h2>${node.name}</h2>
    <div class="panel"><p>${node.taunt}</p></div>
    <p></p><button class="primary" id="go">Fight!</button>`;
  document.getElementById("go").addEventListener("click", () => runTrainer(node, foes, nodeI, ""));
}

function showGymIntro(node, foes, nodeI) {
  app.innerHTML = `
    <h2>${node.leader}'s Gym</h2>
    <p>Here is ${node.leader}'s team. Win to earn the ${node.badge}. Perk: ${BADGE_PERK}</p>
    <div class="party">${foes.map(monCard).join("")}</div>
    <p>Your party:</p>
    <div class="party">${state.party.map(partyCard).join("")}</div>
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
    const prize = Math.max(...foes.map(f => f.level)) * (node.badge ? 60 : node.type === "rival" ? 40 : 15);
    state.money += prize;
    let msg = `<p>You defeated ${who} and won ₽${prize}!</p>`;
    if (node.badge) {
      state.badges.push(node.badge);
      state.party.forEach(p => { p.curHp = p.maxHp; restoreAll(p); });
      msg = `<p>You defeated ${who} and earned the ${node.badge} and ₽${prize}! ${BADGE_PERK} Your whole party was healed to full health.</p>`;
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
    ${sceneHtml(me, enemy)}
    <div class="panel battle">
      <p class="line">${note || "What will you do?"} ${state.caught ? "You already caught a Pokémon on this route." : `Catch chance: about ${chance}%.`}</p>
      <div class="row">
        <button class="primary" id="fight">Fight</button>
        <button id="weaken" ${weak ? "disabled" : ""}>Weaken</button>
        <button id="ball" ${state.balls && !state.caught ? "" : "disabled"}>${state.caught ? "Already caught one here" : `Throw Poké Ball (${state.balls})`}</button>
        ${state.items.greatball && !state.caught ? `<button id="great">Throw Great Ball (${state.items.greatball})</button>` : ""}
        <button id="bag">Bag</button>
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
  document.getElementById("ball").addEventListener("click", () => throwBall(enemy, nodeI, false));
  const great = document.getElementById("great");
  if (great) great.addEventListener("click", () => throwBall(enemy, nodeI, true));
  document.getElementById("bag").addEventListener("click", () => showBag(() => showEncounter(enemy, nodeI, note)));
  document.getElementById("run").addEventListener("click", () => {
    state.nodeIndex = nodeI + 1;
    state.message = `<p>You got away from the wild ${cap(enemy.name)}.</p>`;
    showRoute();
  });
}

function throwBall(enemy, nodeI, great = false) {
  if (great) state.items.greatball--; else state.balls--;
  if (Math.random() < catchChance(enemy, great ? ITEMS.greatball.ball : 1)) {
    enemy.xp = 0;
    enemy.status = null;
    dexCatch(enemy);
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
  app.innerHTML = `
    <h2>${title}</h2>
    ${sceneHtml(me, foe)}
    <div class="panel battle">
      <p id="line" class="line">Battle start!</p>
      <div id="actions" class="row"></div>
    </div>`;
  const barE = document.getElementById("bar-e"), barP = document.getElementById("bar-p");
  const line = document.getElementById("line"), actions = document.getElementById("actions");
  const draw = (hp, st) => {
    if (st) {
      document.getElementById("st-bar-e").innerHTML = stTag(st.e);
      document.getElementById("st-bar-p").innerHTML = stTag(st.p);
    }
    barE.innerHTML = hpBar(hp.e, foe.maxHp) + `<small>${hp.e}/${foe.maxHp}</small>`;
    barP.innerHTML = hpBar(hp.p, me.maxHp) + `<small>${hp.p}/${me.maxHp}</small>`;
  };
  draw({ p: me.curHp, e: foe.curHp });

  const finish = () => {
    clearTimeout(timer);
    me.curHp = ctx.hp.p;
    foe.curHp = ctx.hp.e;
    // Your Pokémon shake off sleep and ice after the fight; poison, burn and paralysis last until you heal.
    if (me.status === "sleep" || me.status === "freeze") me.status = null;
    if (me.curHp <= 0) me.status = null;
    if (foe.curHp <= 0) foe.status = null;
    draw(ctx.hp, { p: me.status, e: foe.status });
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
      draw(entries[k].hp, entries[k].st);
      fxPlay(entries[k]);
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
        ${mv.label}<br><small>${typeBadge(mv.type)} ${mv.power ? "power " + mv.power : "status"}, PP ${ctx.pp.p[i]}/${mv.pp}</small></button>`).join("")
      + (usable ? "" : `<button class="movebtn" data-m="-1">Struggle</button>`)
      + `<button id="bagb">Bag</button><button id="auto">Auto the rest</button>`;
    actions.querySelectorAll("[data-m]").forEach(btn => btn.addEventListener("click", () => {
      actions.innerHTML = "";
      const entries = playRound(ctx, Number(btn.dataset.m) >= 0 ? Number(btn.dataset.m) : null);
      play(entries, () => (ctx.over ? finish() : showMoves()));
    }));
    document.getElementById("auto").addEventListener("click", autoRest);
    document.getElementById("bagb").addEventListener("click", () => {
      const usable = bagItems().filter(([k]) => !ITEMS[k].revive
        && ((ITEMS[k].heal && ctx.hp.p < me.maxHp) || curesStatus(ITEMS[k], me.status)));
      line.textContent = usable.length ? "Use which item? It costs your turn." : "Nothing in your Bag helps right now.";
      actions.innerHTML = usable.map(([k, n]) => `<button data-item="${k}">${ITEMS[k].name} x${n}</button>`).join("")
        + `<button id="itemback">Back</button>`;
      document.getElementById("itemback").addEventListener("click", showMoves);
      actions.querySelectorAll("[data-item]").forEach(btn => btn.addEventListener("click", () => {
        const k = btn.dataset.item, it = ITEMS[k];
        actions.innerHTML = "";
        const entries = playRound(ctx, null, (c, say) => {
          state.items[k]--;
          if (it.heal) c.hp.p = Math.min(me.maxHp, c.hp.p + it.heal);
          if (curesStatus(it, me.status)) me.status = null;
          say(`You used a ${it.name} on ${cap(me.name)}.`);
        });
        play(entries, () => (ctx.over ? finish() : showMoves()));
      }));
    });
  };

  if (state.manual) showMoves();
  else setTimeout(autoRest, 600);
}

showTitle();
