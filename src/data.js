// Data layer: loads Pokémon from PokéAPI and caches them in localStorage.
const API = "https://pokeapi.co/api/v2";

async function getPokemon(name) {
  const key = "kq:mon:" + name;
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch (e) { /* storage unavailable, fetch instead */ }

  const res = await fetch(`${API}/pokemon/${name}`);
  if (!res.ok) throw new Error(`Could not load ${name} (${res.status})`);
  const d = await res.json();

  // Keep only what the game needs, so the cache stays small.
  const stat = n => d.stats.find(s => s.stat.name === n).base_stat;
  const mon = {
    id: d.id,
    name: d.name,
    types: d.types.map(t => t.type.name),
    hp: stat("hp"), attack: stat("attack"), defense: stat("defense"),
    spAttack: stat("special-attack"), spDefense: stat("special-defense"),
    speed: stat("speed"),
    sprite: d.sprites.front_default
  };
  try { localStorage.setItem(key, JSON.stringify(mon)); } catch (e) {}
  return mon;
}

const STARTERS = ["bulbasaur", "charmander", "squirtle"];

// Each route is a list of nodes. More routes get added here as we build.
const ROUTES = [
  {
    id: "route-1",
    name: "Route 1",
    blurb: "The grassy road between Pallet Town and Viridian City.",
    wild: ["pidgey", "rattata"],
    nodes: [
      { type: "wild", label: "Wild encounter" },
      { type: "wild", label: "Wild encounter" },
      { type: "item", label: "Found a Potion" },
      { type: "wild", label: "Wild encounter" },
      { type: "end", label: "Viridian City" }
    ]
  }
];

const NODE_ICONS = { wild: "🌿", trainer: "⚔️", item: "🎒", heal: "💊", end: "🏁" };
