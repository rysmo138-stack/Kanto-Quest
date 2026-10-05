// Game flow: pick a starter, walk routes, fight or catch wild Pokémon.
const app = document.getElementById("app");
const freshState = () => ({ party: [], box: [], balls: 5, routeIndex: 0, nodeIndex: 0, message: "" });
let state = freshState();

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const typesText = m => m.types.map(cap).join(" / ");
const lead = () => state.party.find(m => m.curHp > 0);

function hpBar(cur, max) {
  const pct = Math.max(0, Math.round((cur / max) * 100));
  const color = pct > 50 ? "#4a7c2a" : pct > 20 ? "#c9a227" : "#c2412d";
  return `<div class="bar" role="img" aria-label="HP ${cur} of ${max}"><div style="width:${pct}%;background:${color}"></div></div>`;
}

function monCard(m) {
  return `<div class="mon ${m.curHp <= 0 ? "fainted" : ""}"><img src="${m.sprite}" alt="${cap(m.name)}">
    <div>${cap(m.name)} Lv${m.level}</div>${hpBar(m.curHp, m.maxHp)}<div>${m.curHp}/${m.maxHp}</div></div>`;
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
  const nodes = route.nodes.map((n, i) => {
    const done = i < state.nodeIndex, current = i === state.nodeIndex;
    const cls = done ? "done" : current ? "" : "locked";
    return `<li><button class="node ${cls}" data-i="${i}" ${current ? "" : "disabled"}>
      <span class="icon">${NODE_ICONS[n.type]}</span><span>${n.label}</span></button></li>`;
  }).join("");

  app.innerHTML = `
    <h2>${route.name}</h2>
    <p>${route.blurb}</p>
    <p class="stats">Poké Balls: ${state.balls} &nbsp; Caught in box: ${state.box.length}</p>
    <div class="party">${state.party.map(monCard).join("")}</div>
    <ul class="path">${nodes}</ul>
    ${state.message ? `<div class="panel">${state.message}</div>` : ""}`;

  app.querySelectorAll(".node:not([disabled])").forEach(btn =>
    btn.addEventListener("click", () => playNode(Number(btn.dataset.i))));
}

async function playNode(i) {
  const route = ROUTES[state.routeIndex];
  const node = route.nodes[i];
  state.message = "";

  if (node.type === "wild") {
    try {
      const enemy = makeBattler(await getPokemon(pick(route.wild)), randInt(3, 5));
      return showEncounter(enemy, i);
    } catch (err) {
      state.message = `<span class="error">${err.message}</span>`;
      return showRoute();
    }
  }
  if (node.type === "item" && node.item === "ball") {
    state.balls += node.amount;
    state.message = `<p>You found ${node.amount} Poké Balls! You now have ${state.balls}.</p>`;
  } else if (node.type === "item") {
    state.party.forEach(m => { if (m.curHp > 0) m.curHp = Math.min(m.maxHp, m.curHp + 20); });
    state.message = `<p>You found a Potion and used it. Your healthy Pokémon restored 20 HP.</p>`;
  } else if (node.type === "heal") {
    state.party.forEach(m => { m.curHp = m.maxHp; });
    state.message = `<p>You rested. Your whole party is back to full health.</p>`;
  } else if (node.type === "end") {
    state.message = `<p>You made it to ${node.label}! Brock and Pewter City come next.</p>`;
  }
  state.nodeIndex = i + 1;
  showRoute();
}

function sideHtml(m, id) {
  return `<div class="side"><img src="${m.sprite}" alt="${cap(m.name)}">
    <div>${cap(m.name)} Lv${m.level} <small>${typesText(m)}</small></div><div id="${id}"></div></div>`;
}

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
      <p class="line">${note || "What will you do?"} Catch chance: about ${chance}%.</p>
      <div class="row">
        <button class="primary" id="fight">Fight</button>
        <button id="weaken" ${weak ? "disabled" : ""}>Weaken</button>
        <button id="ball" ${state.balls ? "" : "disabled"}>Throw Poké Ball (${state.balls})</button>
        <button id="run">Run</button>
      </div>
    </div>`;
  document.getElementById("fight").addEventListener("click", () => showBattle(me, enemy, nodeI, false));
  document.getElementById("weaken").addEventListener("click", () => showBattle(me, enemy, nodeI, true));
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
    let where = "added to your party";
    if (state.party.length < 6) state.party.push(enemy);
    else { state.box.push(enemy); where = "sent to your box (party is full)"; }
    state.nodeIndex = nodeI + 1;
    state.message = `<p>Gotcha! ${cap(enemy.name)} was caught and ${where}.</p>`;
    return showRoute();
  }
  showEncounter(enemy, nodeI, "Oh no, it broke free!");
}

function showBattle(me, enemy, nodeI, weaken) {
  const result = simulate(me, enemy, weaken);
  let step = -1, timer = null;

  app.innerHTML = `
    <h2>${weaken ? "Weakening" : "Fighting"} the wild ${cap(enemy.name)}</h2>
    <div class="panel battle">
      ${sideHtml(enemy, "bar-e")}${sideHtml(me, "bar-p")}
      <p id="line" class="line">Battle start!</p>
      <div id="actions"><button id="skip">Skip</button></div>
    </div>`;

  const barE = document.getElementById("bar-e"), barP = document.getElementById("bar-p");
  const line = document.getElementById("line"), actions = document.getElementById("actions");
  const draw = hp => {
    barE.innerHTML = hpBar(hp.e, enemy.maxHp) + `<small>${hp.e}/${enemy.maxHp}</small>`;
    barP.innerHTML = hpBar(hp.p, me.maxHp) + `<small>${hp.p}/${me.maxHp}</small>`;
  };
  draw({ p: me.curHp, e: enemy.curHp });

  const finish = () => {
    clearTimeout(timer);
    draw(result.hp);
    me.curHp = result.hp.p;
    enemy.curHp = result.hp.e;
    let msg, onGo, label = "Continue";

    if (enemy.curHp <= 0) {
      state.nodeIndex = nodeI + 1;
      msg = `You defeated the wild ${cap(enemy.name)}! ` + gainXp(me, enemy.level * 6).join(" ");
      onGo = () => { state.message = `<p>${msg}</p>`; showRoute(); };
    } else if (me.curHp <= 0) {
      if (!lead()) {
        msg = `${cap(me.name)} fainted. You have no Pokémon left...`;
        label = "Start over";
        onGo = showStarters;
      } else {
        msg = `${cap(me.name)} fainted! ${cap(lead().name)} steps up.`;
        onGo = () => showEncounter(enemy, nodeI, msg);
      }
    } else {
      msg = `The wild ${cap(enemy.name)} is weak enough to catch!`;
      onGo = () => showEncounter(enemy, nodeI, msg);
    }
    line.textContent = msg;
    actions.innerHTML = `<button class="primary" id="go">${label}</button>`;
    document.getElementById("go").addEventListener("click", onGo);
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
