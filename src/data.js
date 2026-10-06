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
  rattata: [20, "raticate"], geodude: [25, "graveler"],
  oddish: [21, "gloom"], zubat: [22, "golbat"], paras: [24, "parasect"],
  spearow: [20, "fearow"], ekans: [22, "arbok"], sandshrew: [22, "sandslash"],
  bellsprout: [21, "weepinbell"], abra: [16, "kadabra"], mankey: [28, "primeape"],
  meowth: [28, "persian"], diglett: [26, "dugtrio"], machop: [28, "machoke"],
  venonat: [31, "venomoth"]
};

const BADGE_PERK = "Your Pokémon deal 10% more damage (stacks with each badge).";

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
      { type: "end", label: "Route 3 is next" }
    ]
  },
  {
    id: "route-3", name: "Route 3",
    blurb: "A rocky trail east of Pewter City, full of trainers heading to Mt. Moon.",
    wild: ["pidgey", "spearow", "rattata", "ekans", "jigglypuff"],
    levels: [7, 10],
    nodes: [
      { type: "wild", label: "Wild encounter" },
      { type: "trainer", name: "Youngster Ben", label: "Trainer: Youngster Ben",
        team: [["rattata", 9], ["ekans", 9]] },
      { type: "wild", label: "Wild encounter" },
      { type: "item", item: "ball", amount: 3, label: "Found Poké Balls" },
      { type: "trainer", name: "Lass Janice", label: "Trainer: Lass Janice",
        team: [["pidgey", 9], ["pidgey", 10]] },
      { type: "wild", label: "Wild encounter" },
      { type: "heal", label: "Pokémon Center at Mt. Moon" },
      { type: "end", label: "Mt. Moon entrance" }
    ]
  },
  {
    id: "mt-moon", name: "Mt. Moon",
    blurb: "A dark cave. Zubat swarm the tunnels, and strange Pokémon hide in the shadows.",
    wild: ["zubat", "zubat", "zubat", "geodude", "paras", "clefairy"],
    levels: [8, 12],
    nodes: [
      { type: "wild", label: "Wild encounter" },
      { type: "wild", label: "Wild encounter" },
      { type: "trainer", name: "Hiker Marcos", label: "Trainer: Hiker Marcos",
        team: [["geodude", 10], ["geodude", 11]] },
      { type: "item", item: "potion", label: "Found a Potion" },
      { type: "wild", label: "Wild encounter" },
      { type: "trainer", name: "Super Nerd Miguel", label: "Trainer: Super Nerd Miguel",
        team: [["rattata", 12], ["zubat", 12]] },
      { type: "item", item: "ball", amount: 2, label: "Found Poké Balls" },
      { type: "wild", label: "Wild encounter" },
      { type: "heal", label: "Rest in the cave" },
      { type: "end", label: "Route 4" }
    ]
  },
  {
    id: "route-4", name: "Route 4",
    blurb: "The ledge-lined road out of Mt. Moon, leading down to Cerulean City.",
    wild: ["rattata", "spearow", "ekans", "sandshrew"],
    levels: [10, 13],
    nodes: [
      { type: "wild", label: "Wild encounter" },
      { type: "wild", label: "Wild encounter" },
      { type: "item", item: "ball", amount: 3, label: "Found Poké Balls" },
      { type: "trainer", name: "Lass Crissy", label: "Trainer: Lass Crissy",
        team: [["rattata", 12], ["sandshrew", 12]] },
      { type: "wild", label: "Wild encounter" },
      { type: "end", label: "Cerulean City" }
    ]
  },
  {
    id: "cerulean-city", name: "Cerulean City",
    blurb: "A seaside city. Its gym leader specializes in Water Pokémon, which are weak to Grass and Electric.",
    wild: [],
    nodes: [
      { type: "heal", label: "Pokémon Center" },
      { type: "gym", leader: "Misty", badge: "Cascade Badge", label: "Gym: Misty",
        team: [["staryu", 11], ["starmie", 13]] },
      { type: "end", label: "Route 24 is next" }
    ]
  },
  {
    id: "route-24", name: "Route 24",
    blurb: "Nugget Bridge, north of Cerulean City, where trainers challenge you one after another.",
    wild: ["caterpie", "weedle", "pidgey", "oddish", "bellsprout", "abra"],
    levels: [11, 14],
    nodes: [
      { type: "wild", label: "Wild encounter" },
      { type: "trainer", name: "Camper Liam", label: "Trainer: Camper Liam",
        team: [["weedle", 13], ["kakuna", 13]] },
      { type: "wild", label: "Wild encounter" },
      { type: "trainer", name: "Lass Reli", label: "Trainer: Lass Reli",
        team: [["oddish", 14], ["bellsprout", 14]] },
      { type: "item", item: "ball", amount: 3, label: "Found Poké Balls" },
      { type: "wild", label: "Wild encounter" },
      { type: "heal", label: "Rest on the bridge" },
      { type: "end", label: "Route 25" }
    ]
  },
  {
    id: "route-25", name: "Route 25",
    blurb: "A winding seaside path that leads to Bill's cottage.",
    wild: ["pidgey", "oddish", "bellsprout", "abra", "venonat"],
    levels: [12, 15],
    nodes: [
      { type: "wild", label: "Wild encounter" },
      { type: "trainer", name: "Hiker Franklin", label: "Trainer: Hiker Franklin",
        team: [["geodude", 14], ["machop", 14]] },
      { type: "item", item: "potion", label: "Found a Potion" },
      { type: "wild", label: "Wild encounter" },
      { type: "item", item: "ball", amount: 4, label: "Bill gives you Poké Balls" },
      { type: "wild", label: "Wild encounter" },
      { type: "heal", label: "Rest at Bill's cottage" },
      { type: "end", label: "Routes 5 and 6" }
    ]
  },
  {
    id: "route-5-6", name: "Routes 5 and 6",
    blurb: "The long road south from Cerulean City, past the daycare and down to Vermilion.",
    wild: ["pidgey", "oddish", "bellsprout", "meowth", "mankey"],
    levels: [13, 16],
    nodes: [
      { type: "wild", label: "Wild encounter" },
      { type: "wild", label: "Wild encounter" },
      { type: "trainer", name: "Lass Dana", label: "Trainer: Lass Dana",
        team: [["oddish", 15], ["bellsprout", 15]] },
      { type: "gift", mon: "diglett", level: 15, label: "A kid offers you a Pokémon" },
      { type: "item", item: "potion", label: "Found a Potion" },
      { type: "wild", label: "Wild encounter" },
      { type: "trainer", name: "Bug Catcher Elijah", label: "Trainer: Bug Catcher Elijah",
        team: [["kakuna", 15], ["venonat", 15]] },
      { type: "heal", label: "Rest by the road" },
      { type: "end", label: "Vermilion City port" }
    ]
  },
  {
    id: "ss-anne", name: "S.S. Anne",
    blurb: "A luxury cruise ship docked at Vermilion City, packed with trainers.",
    wild: [],
    nodes: [
      { type: "trainer", name: "Sailor Dylan", label: "Trainer: Sailor Dylan",
        team: [["machop", 16], ["shellder", 16]] },
      { type: "trainer", name: "Gentleman Thomas", label: "Trainer: Gentleman Thomas",
        team: [["growlithe", 17]] },
      { type: "item", item: "potion", label: "Found a Potion" },
      { type: "trainer", name: "Fisherman Barney", label: "Trainer: Fisherman Barney",
        team: [["goldeen", 16], ["tentacool", 16]] },
      { type: "heal", label: "Ship's cabin" },
      { type: "trainer", name: "Sailor Edmond", label: "Trainer: Sailor Edmond",
        team: [["shellder", 17], ["machop", 17]] },
      { type: "end", label: "Vermilion City" }
    ]
  },
  {
    id: "vermilion-city", name: "Vermilion City",
    blurb: "A busy port town. Its gym leader uses Electric Pokémon, which Ground types can't be hurt by.",
    wild: [],
    nodes: [
      { type: "heal", label: "Pokémon Center" },
      { type: "gym", leader: "Lt. Surge", badge: "Thunder Badge", label: "Gym: Lt. Surge",
        team: [["voltorb", 14], ["pikachu", 15], ["raichu", 17]] },
      { type: "end", label: "Route 9 is next" }
    ]
  }
];

const NODE_ICONS = { wild: "🌿", trainer: "⚔️", item: "🎒", heal: "💊", gym: "🏅", gift: "🎁", end: "🏁" };
