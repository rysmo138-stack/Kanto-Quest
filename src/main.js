// Game flow: pick a starter, then walk routes. Wild encounters are auto-battles.
const app = document.getElementById("app");
const freshState = () => ({ party: [], routeIndex: 0, nodeIndex: 0, message: "" });
let state = freshState();

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const typesText = m => m.types.map(cap).join(" / ");

function hpBar(cur, max) {
  const pct = Math.max(0, Math.round((cur / max) * 100));
  const color = pct > 50 ? "#4a7c2a" : pct > 20 ? "#c9a227" : "#c2412d";
  return `<div class="bar" role="img" aria-label="HP ${cur} of ${max}"><div style="width:${pct}%;background:${color}"></div></div>`;
}

function monCard(m) {
  return `<div class="mon"><img src="${m.sprite}" alt="${cap(m.name)}">
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
      const base = await getPokemon(pick(route.wild));
      const enemy = makeBattler(base, randInt(3, 5));
      return showBattle(state.party[0], enemy, i);
    } catch (err) {
      state.message = `<span class="error">${err.message}</span>`;
      return showRoute();
    }
  }
  if (node.type === "item") {
    const lead = state.party[0];
    const healed = Math.min(20, lead.maxHp - lead.curHp);
    lead.curHp += healed;
    state.message = `<p>You found a Potion and used it. ${cap(lead.name)} restored ${healed} HP.</p>`;
  } else if (node.type === "end") {
    state.message = `<p>You made it to ${node.label}! Brock and Pewter City come next.</p>`;
  }
  state.nodeIndex = i + 1;
  showRoute();
}

function showBattle(player, enemy, nodeI) {
  const result = simulate(player, enemy);
  let step = -1, timer = null;

  app.innerHTML = `
    <h2>Wild ${cap(enemy.name)} appeared!</h2>
    <div class="panel battle">
      <div class="side"><img src="${enemy.sprite}" alt="${cap(enemy.name)}">
        <div>${cap(enemy.name)} Lv${enemy.level} <small>${typesText(enemy)}</small></div><div id="bar-e"></div></div>
      <div class="side"><img src="${player.sprite}" alt="${cap(player.name)}">
        <div>${cap(player.name)} Lv${player.level} <small>${typesText(player)}</small></div><div id="bar-p"></div></div>
      <p id="line" class="line">What will happen?</p>
      <div id="actions"><button id="skip">Skip</button></div>
    </div>`;

  const barE = document.getElementById("bar-e"), barP = document.getElementById("bar-p");
  const line = document.getElementById("line"), actions = document.getElementById("actions");
  const draw = hp => {
    barE.innerHTML = hpBar(hp.e, enemy.maxHp) + `<small>${hp.e}/${enemy.maxHp}</small>`;
    barP.innerHTML = hpBar(hp.p, player.maxHp) + `<small>${hp.p}/${player.maxHp}</small>`;
  };
  draw({ p: player.curHp, e: enemy.curHp });

  const finish = () => {
    clearTimeout(timer);
    const last = result.log[result.log.length - 1];
    draw(last ? last.hp : { p: player.curHp, e: enemy.curHp });
    player.curHp = result.hp.p;
    const won = result.winner === "p";
    let msg = won ? `You defeated the wild ${cap(enemy.name)}!` : `${cap(player.name)} fainted...`;
    if (won) {
      state.nodeIndex = nodeI + 1;
      msg += " " + gainXp(player, enemy.level * 6).join(" ");
    }
    line.textContent = msg;
    actions.innerHTML = won
      ? `<button class="primary" id="go">Continue</button>`
      : `<button class="primary" id="go">Start over</button>`;
    document.getElementById("go").addEventListener("click", () => {
      if (won) { state.message = `<p>${msg}</p>`; showRoute(); } else showStarters();
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
