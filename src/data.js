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

// Level-based evolutions: name -> [level, evolves into]
const EVOLUTIONS = {
  bulbasaur: [16, "ivysaur"], ivysaur: [32, "venusaur"],
  charmander: [16, "charmeleon"], charmeleon: [36, "charizard"],
  squirtle: [16, "wartortle"], wartortle: [36, "blastoise"],
  caterpie: [7, "metapod"], metapod: [10, "butterfree"],
  weedle: [7, "kakuna"], kakuna: [10, "beedrill"],
  pidgey: [18, "pidgeotto"], pidgeotto: [36, "pidgeot"],
  rattata: [20, "raticate"], geodude: [25, "graveler"]
};

const BADGE_PERK = "Your Pokémon deal 10% more damage.";

// Node types: wild, trainer, item, heal, gym, end.
const ROUTES = [
  {
    id: "route-1", name: "Route 1",
    blurb: "The grassy road between Pallet Town and Viridian City.",
    wild: ["pidgey", "rattata"],
    nodes: [
      { type: "wild", label: "Wild encounter" },
      { type: "wild", label: "Wild encounter" },
      { type: "item", item: "potion", label: "Found a Potion" },
      { type: "wild", label: "Wild encounter" },
      { type: "item", item: "ball", amount: 3, label: "Found Poké Balls" },
      { type: "wild", label: "Wild encounter" },
      { type: "heal", label: "Rest by the road" },
      { type: "end", label: "Viridian City" }
    ]
  },
  {
    id: "route-2", name: "Route 2",
    blurb: "A path north of Viridian City, with tall grass on both sides.",
    wild: ["pidgey", "rattata", "caterpie", "weedle"],
    levels: [4, 7],
    nodes: [
      { type: "wild", label: "Wild encounter" },
      { type: "wild", label: "Wild encounter" },
      { type: "item", item: "ball", amount: 3, label: "Found Poké Balls" },
      { type: "wild", label: "Wild encounter" },
      { type: "wild", label: "Wild encounter" },
      { type: "end", label: "Viridian Forest entrance" }
    ]
  },
  {
    id: "viridian-forest", name: "Viridian Forest",
    blurb: "A dense forest full of bug Pokémon and bug catchers.",
    wild: ["caterpie", "caterpie", "weedle", "weedle", "pidgey", "pikachu"],
    levels: [5, 8],
    nodes: [
      { type: "wild", label: "Wild encounter" },
      { type: "trainer", name: "Bug Catcher Rick", label: "Trainer: Bug Catcher Rick",
        team: [["weedle", 6], ["caterpie", 6]] },
      { type: "wild", label: "Wild encounter" },
      { type: "gift", mon: "oddish", level: 9, label: "A hiker offers you a Pokémon" },
      { type: "item", item: "potion", label: "Found a Potion" },
      { type: "trainer", name: "Bug Catcher Doug", label: "Trainer: Bug Catcher Doug",
        team: [["weedle", 7], ["weedle", 7], ["kakuna", 7]] },
      { type: "wild", label: "Wild encounter" },
      { type: "heal", label: "Rest under the trees" },
      { type: "trainer", name: "Bug Catcher Sammy", label: "Trainer: Bug Catcher Sammy",
        team: [["weedle", 9]] },
      { type: "end", label: "Pewter City" }
    ]
  },
  {
    id: "pewter-city", name: "Pewter City",
    blurb: "A grey stone city. Its gym leader uses Rock-type Pokémon.",
    wild: [],
    nodes: [
      { type: "heal", label: "Pokémon Center" },
      { type: "gym", leader: "Brock", badge: "Boulder Badge", label: "Gym: Brock",
        team: [["geodude", 11], ["onix", 13]] },
      { type: "end", label: "Cerulean City is next" }
    ]
  }
];

const NODE_ICONS = { wild: "🌿", trainer: "⚔️", item: "🎒", heal: "💊", gym: "🏅", gift: "🎁", end: "🏁" };
