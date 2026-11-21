// Oyun listesi — yeni oyun eklemek için dosyayı import edip diziye ekle.
import blocks from './blocks.js';
import capsule from './capsule.js';
import connect4 from './connect4.js';
import bomber from './bomber.js';
import snake from './snake.js';
import sumo from './sumo.js';
import spaceduel from './spaceduel.js';
import artillery from './artillery.js';
import crossing from './crossing.js';
import tug from './tug.js';
import tanks from './tanks.js';
import shooter from './shooter.js';
import breakout from './breakout.js';
import maze from './maze.js';
import headball from './headball.js';
import volley from './volley.js';
import penalty from './penalty.js';
import hockey from './hockey.js';
import racer from './racer.js';

// Lobideki filtreler. Takım (coop) oyunları otomatik olarak "takim"da da görünür.
export const CATEGORIES = [
  { id: 'all', name: 'Tümü' },
  { id: 'takim', name: 'Takım' },
  { id: 'spor', name: 'Spor & Yarış' },
  { id: 'aksiyon', name: 'Aksiyon' },
  { id: 'bulmaca', name: 'Bulmaca & Masa' },
];

export default [
  // takım
  tanks, shooter, breakout, maze,
  // spor & yarış
  headball, volley, penalty, hockey, racer,
  // aksiyon
  bomber, snake, sumo, spaceduel, artillery, crossing, tug,
  // bulmaca & masa
  blocks, capsule, connect4,
];
