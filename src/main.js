// Game flow. Stage 1: pick a starter, then walk Route 1 node by node.
const app = document.getElementById("app");
const state = { party: [], routeIndex: 0, nodeIndex: 0, items: { potion: 0 }, message: "" };

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function monCard(m) {
  return `<div class="mon"><img src="${m.sprite}" alt="${cap(m.name)}"><div>${cap(m.name)}</div></div>`;
}

async function showStarters() {
  app.innerHTML = `<h1>Kanto Quest</h1><p>Your journey from Pallet Town to the Pokémon League starts here. Choose your first partner.</p><p>Loading starters...</p>`;
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
            <div>${m.types.map(cap).join(" / ")}</div>
          </button>`).join("")}
      </div>`;
    app.querySelectorAll(".starter").forEach(btn =>
      btn.addEventListener("click", () => {
        state.party = [mons.find(m => m.name === btn.dataset.name)];
        showRoute();
      }));
  } catch (err) {
    app.innerHTML = `<h1>Kanto Quest</h1><p class="error">${err.message}. Check your connection and reload.</p>
      <button onclick="showStarters()">Try again</button>`;
  }
}

function showRoute() {
  const route = ROUTES[state.routeIndex];
  const nodes = route.nodes.map((n, i) => {
    const done = i < state.nodeIndex;
    const current = i === state.nodeIndex;
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
      const wild = await getPokemon(pick(route.wild));
      state.message = `<div class="row"><div class="mon"><img src="${wild.sprite}" alt=""></div>
        <div><p>A wild <strong>${cap(wild.name)}</strong> appeared! (${wild.types.map(cap).join(" / ")})</p>
        <p>Battles arrive in the next stage. For now you scare it off.</p></div></div>`;
    } catch (err) {
      state.message = `<span class="error">${err.message}</span>`;
      return showRoute();
    }
  } else if (node.type === "item") {
    state.items.potion++;
    state.message = `<p>You found a Potion! You now have ${state.items.potion}.</p>`;
  } else if (node.type === "end") {
    state.message = `<p>You made it to ${node.label}! Brock and Pewter City come next.</p>`;
  }

  state.nodeIndex = i + 1;
  showRoute();
}

showStarters();
