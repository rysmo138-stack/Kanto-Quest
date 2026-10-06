// Game flow: starters, routes, wild battles, catching, trainers, gyms, evolution.
const app = document.getElementById("app");
const freshState = () => ({ party: [], box: [], badges: [], caught: false, balls: 5, routeIndex: 0, nodeIndex: 0, message: "" });
let state = freshState();

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
const makeFoes = team => Promise.all(team.map(([n, l]) => getPokemon(n).then(b => makeBattler(b, l))));

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
    out.push((m === me ? msgs : msgs.slice(1)).join(" ") + extra);
  }
  return out.filter(Boolean).join(" ");
}

// ---------- Screens ----------
function showGameOver(msg) {
  app.innerHTML = `<h2>Out of Pokémon</h2><div class="panel"><p>${msg}</p>
    <button class="primary" id="again">Start over</button></div>`;
  document.getElementById("again").addEventListener("click", showStarters);
}

async function showStarters() {
  state = freshState();
  app.innerHTML = `<h1>Kanto Quest</h1><p>Loading starters...</p>`;
  try {
    const mons = await Promise.all(STARTERS.map(getPokemon));
    app.innerHTML = `
      <h1>Kanto Quest</h1>
      <p>Your journey from Pallet Town to the Pokémon League starts here. Choose your first partner.</p>
      <div class="row">
        ${mons.map(m => `
          <button class="starter" data-name="${m.name}">
            <img src="${m.sprite}" alt="">
            <div><strong>${cap(m.name)}</strong></div>
            <div>${typesText(m)}</div>
          </button>`).join("")}
      </div>`;
    app.querySelectorAll(".starter").forEach(btn =>
      btn.addEventListener("click", () => {
        state.party = [makeBattler(mons.find(m => m.name === btn.dataset.name), 5)];
        showRoute();
      }));
  } catch (err) {
    app.innerHTML = `<h1>Kanto Quest</h1><p class="error">${err.message}. Check your connection and reload.</p>
      <button id="retry">Try again</button>`;
    document.getElementById("retry").addEventListener("click", showStarters);
  }
}

function showRoute() {
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
    <p class="stats">Poké Balls: ${state.balls} &nbsp; Catch this route: ${state.caught ? "used" : "available"} &nbsp; Box: ${state.box.length} &nbsp; Badges: ${state.badges.join(", ") || "none"}</p>
    <div class="party">${state.party.map(monCard).join("")}</div>
    <ul class="path">${nodes}</ul>
    ${state.message ? `<div class="panel">${state.message}</div>` : ""}
    ${finished ? (next
      ? `<p></p><button class="primary" id="travel">Travel to ${next.name}</button>`
      : `<p></p><div class="panel"><p>That's everything built so far. Lt. Surge and Vermilion City come next!</p></div>`) : ""}`;

  app.querySelectorAll(".node:not([disabled])").forEach(btn =>
    btn.addEventListener("click", () => playNode(Number(btn.dataset.i))));
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
      const enemy = makeBattler(await getPokemon(pick(route.wild)), randInt(lo, hi));
      return showEncounter(enemy, i);
    }
    if (node.type === "gift") {
      const g = makeBattler(await getPokemon(node.mon), node.level);
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
    state.party.forEach(m => { m.curHp = m.maxHp; });
    state.message = `<p>Your whole party is back to full health.</p>`;
  } else if (node.type === "end") {
    state.message = `<p>You arrived at: ${node.label}.</p>`;
  }
  state.nodeIndex = i + 1;
  showRoute();
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
    if (node.badge) { state.badges.push(node.badge); msg = `<p>You defeated ${who} and earned the ${node.badge}! ${BADGE_PERK}</p>`; }
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
  const result = simulate(me, foe, weaken, boost());
  let step = -1, timer = null;
  const side = (m, id) => `<div class="side"><img src="${m.sprite}" alt="${cap(m.name)}">
    <div>${cap(m.name)} Lv${m.level} <small>${typesText(m)}</small></div><div id="${id}"></div></div>`;

  app.innerHTML = `
    <h2>${title}</h2>
    <div class="panel battle">
      ${side(foe, "bar-e")}${side(me, "bar-p")}
      <p id="line" class="line">Battle start!</p>
      <div id="actions"><button id="skip">Skip</button></div>
    </div>`;
  const barE = document.getElementById("bar-e"), barP = document.getElementById("bar-p");
  const line = document.getElementById("line"), actions = document.getElementById("actions");
  const draw = hp => {
    barE.innerHTML = hpBar(hp.e, foe.maxHp) + `<small>${hp.e}/${foe.maxHp}</small>`;
    barP.innerHTML = hpBar(hp.p, me.maxHp) + `<small>${hp.p}/${me.maxHp}</small>`;
  };
  draw({ p: me.curHp, e: foe.curHp });

  const finish = () => {
    clearTimeout(timer);
    draw(result.hp);
    me.curHp = result.hp.p;
    foe.curHp = result.hp.e;
    const foeDown = foe.curHp <= 0, meDown = me.curHp <= 0;
    line.textContent = foeDown ? `${cap(foe.name)} fainted!` : meDown ? `${cap(me.name)} fainted!` : "The fight paused.";
    actions.innerHTML = `<button class="primary" id="go">Continue</button>`;
    document.getElementById("go").addEventListener("click", async () => {
      const extra = foeDown ? await rewardXp(me, foe, xpMult) : "";
      onDone({ foeDown, meDown, extra });
    });
  };
  const next = () => {
    step++;
    if (step >= result.log.length) return finish();
    line.textContent = result.log[step].text;
    draw(result.log[step].hp);
    timer = setTimeout(next, 900);
  };
  document.getElementById("skip").addEventListener("click", finish);
  timer = setTimeout(next, 600);
}

showStarters();
