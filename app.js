const $ = (id) => document.getElementById(id);
const canvas = $("preview");
const ctx = canvas.getContext("2d");

let timer = null;
let currentFrames = null;
let currentLeds = 0;
let currentFrameCount = 0;
let currentIndex = 0;
let currentLayout = "LINE";
let currentCols = 1;
let currentRows = 1;

const LAYOUT_IDS = {
  LINE: 0,
  ZIGZAG_Z: 1,
  SNAKE_S: 2,
  GRID: 3
};

const MAX_PROGRAM_BYTES = 64 * 1024 * 1024;
const PREVIEW_FRAMES = 120;
const PREVIEW_LEDS = 1200;

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CUSTOM_PRESETS = [
  "palette([a,b,c,d,e,f,g,h], x + y*0.35 - t*0.12)",
  "mix(b, f, 0.5+0.5*sin(t*3 + x*4))",
  "random() < 0.08 ? h : mix(e, g, 0.25)",
  "[255*abs(sin(t*2)), 255*abs(cos(x*6)), 255*abs(sin(y*5+t))]"
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampByte(value) {
  return clamp(Math.round(value), 0, 255);
}

function parseHex(value) {
  const raw = String(value).trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
    throw new Error("Color must be in #RRGGBB format");
  }
  return [
    parseInt(raw.slice(0, 2), 16),
    parseInt(raw.slice(2, 4), 16),
    parseInt(raw.slice(4, 6), 16)
  ];
}

function mix(from, to, amount) {
  const a = clamp(amount, 0, 1);
  return from * (1 - a) + to * a;
}

function hsvToRgb(hue, saturation, value) {
  const h = ((hue % 1) + 1) % 1;
  const scaled = h * 6;
  const sector = Math.floor(scaled) % 6;
  const f = scaled - Math.floor(scaled);
  const p = value * (1 - saturation);
  const q = value * (1 - f * saturation);
  const t = value * (1 - (1 - f) * saturation);
  let rgb;
  if (sector === 0) rgb = [value, t, p];
  else if (sector === 1) rgb = [q, value, p];
  else if (sector === 2) rgb = [p, value, t];
  else if (sector === 3) rgb = [p, q, value];
  else if (sector === 4) rgb = [t, p, value];
  else rgb = [value, p, q];
  return rgb.map((part) => part * 255);
}

function palette(colors, position) {
  const scaled = (((position % 1) + 1) % 1) * colors.length;
  const index = Math.floor(scaled);
  const fraction = scaled - index;
  const from = colors[index % colors.length];
  const to = colors[(index + 1) % colors.length];
  return from.map((part, i) => mix(part, to[i], fraction));
}

function mixAny(from, to, amount) {
  if (Array.isArray(from) && Array.isArray(to)) {
    return from.map((part, index) => mix(part, to[index], amount));
  }
  return mix(from, to, amount);
}

function fract(value) {
  return value - Math.floor(value);
}

function noise(a, b) {
  return fract(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453);
}

const FONT_5X7 = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  6: ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"]
};

function glyphPixel(text, gx, gy) {
  if (gx < 0 || gy < 0 || gy > 6) {
    return false;
  }
  const index = Math.floor(gx / 6);
  if (index >= text.length) {
    return false;
  }
  const column = gx % 6;
  if (column === 5) {
    return false;
  }
  const rows = FONT_5X7[text[index]];
  return Boolean(rows && rows[gy][column] === "1");
}

function glyphColumn(text, gx) {
  for (let row = 0; row < 7; row++) {
    if (glyphPixel(text, gx, row)) {
      return true;
    }
  }
  return false;
}

const EXTRA_EFFECTS = {
  BOUNCE(v) {
    const p = fract(v.t * 0.35);
    const tri = p < 0.5 ? p * 2 : 2 - p * 2;
    const glow = Math.max(0, 1 - Math.abs(v.x - tri) * 10);
    return v.colors[0].map((part, k) =>
      mix(4, part, glow) * (0.6 + 0.4 * Math.abs(Math.sin(v.t * 3 + k)))
    );
  },
  COMET(v) {
    const cx = fract(v.t * 0.25);
    const cy = fract(v.t * 0.17);
    const d = Math.sqrt(Math.pow(v.x - cx, 2) + Math.pow(v.y - cy, 2));
    const trail = Math.max(0, 1 - d * 7);
    return palette(v.colors, v.x + v.y + v.t * 0.02).map((part) => part * trail * trail);
  },
  WATER(v) {
    const a = Math.sin(v.x * 12 + v.t * 2);
    const b = Math.sin(v.y * 10 - v.t * 1.7);
    const c = Math.sin((v.x + v.y) * 15 + v.t * 3);
    const value = clamp(0.5 + 0.2 * (a + b + c), 0, 1);
    return palette(v.colors, value * 0.6 + v.t * 0.03);
  },
  SMOKE(v) {
    const n = noise(Math.floor(v.x * 7) + Math.floor(v.t * 1.2), Math.floor(v.y * 7));
    const drift = noise(Math.floor(v.x * 11) - Math.floor(v.t * 0.6), Math.floor(v.y * 11));
    const value = clamp((n + drift) * 0.45, 0, 1);
    return v.colors[6].map((part, k) => mix(part, v.colors[0][k], value) * value);
  },
  RADAR(v) {
    const angle = Math.atan2(v.y - 0.5, v.x - 0.5);
    const sweep = fract(angle / (2 * Math.PI) + 1 + v.t * 0.2);
    const beam = Math.max(0, 1 - sweep * 8);
    const ring = 0.5 + 0.5 * Math.sin(
      Math.sqrt(Math.pow(v.x - 0.5, 2) + Math.pow(v.y - 0.5, 2)) * 30 - v.t * 4
    );
    return v.colors[4].map((part) => mix(4, part, beam) * ring);
  },
  GRIDWAVE(v) {
    const gx = Math.abs(Math.sin(v.x * Math.PI * 6));
    const gy = Math.abs(Math.sin(v.y * Math.PI * 4));
    const flicker = Math.pow(Math.sin(v.t * 3 + v.i * 0.1), 2);
    const value = clamp(Math.max(gx, gy) * 0.7 + flicker * 0.3, 0, 1);
    return palette(v.colors, v.x + v.y * 0.5 + v.t * 0.05).map((part) => part * value);
  },
  LASER(v) {
    const d1 = Math.abs(v.y - (0.5 + 0.4 * Math.sin(v.t * 1.3)));
    const d2 = Math.abs(v.x - (0.5 + 0.4 * Math.cos(v.t * 1.1)));
    const beam = Math.max(0, 1 - Math.min(d1, d2) * 18);
    return palette(v.colors, v.t * 0.08).map((part) => part * beam);
  },
  CLOCK(v) {
    const angle = Math.atan2(v.y - 0.5, v.x - 0.5);
    const hour = Math.pow(Math.abs(Math.sin(angle * 6 - v.t * 0.8)), 20);
    const minute = Math.pow(Math.abs(Math.sin(angle * 12 - v.t * 2.4)), 30);
    return palette(v.colors, angle / (2 * Math.PI) + v.t * 0.02)
      .map((part) => part * Math.min(1, hour + minute));
  },
  HEARTBEAT(v) {
    const phase = fract(v.t * 1.2);
    const beat = phase < 0.08 ? 1 : phase < 0.16 ? 0.35 : phase < 0.28 ? 0.8 : 0.04;
    const pulse = beat * (0.6 + 0.4 * Math.abs(Math.sin(v.x * 8)));
    return v.colors[0].map((part) => mix(3, part, pulse));
  },
  WIND(v) {
    const streak = Math.sin(v.y * 20 + Math.sin(v.x * 6 + v.t * 2) * 3 + v.t * 5);
    const value = Math.pow(0.5 + 0.5 * streak, 4);
    return palette(v.colors, v.x * 0.6 + v.t * 0.04).map((part) => part * value);
  },
  VOLCANO(v) {
    const dy = 1 - v.y;
    const spread = 0.1 + dy * 0.45;
    const inside = Math.max(0, 1 - Math.abs(v.x - 0.5) / spread);
    const erupt = noise(Math.floor(v.x * 18), Math.floor(v.t * 8));
    const value = inside * (0.3 + erupt * 0.7) * Math.pow(dy, 1.5);
    return palette(v.colors, dy * 0.6 + erupt * 0.2).map((part) => part * value);
  },
  BUBBLES(v) {
    const column = Math.floor(v.x * 8);
    const rise = fract(v.t * (0.15 + noise(column, 5) * 0.35) + noise(column, 9));
    const delta = Math.abs(v.y - (1 - rise));
    const bubble = Math.max(0, 1 - Math.min(delta, 1 - delta) * 18);
    return v.colors[7].map((part) => part * bubble);
  },
  CHECKER(v) {
    const size = 8;
    const cell = (Math.floor(v.x * size) + Math.floor(v.y * size) + Math.floor(v.t * 3)) % 2;
    return cell === 0 ? v.colors[0] : v.colors[5].map((part) => part * 0.18);
  },
  ZOOM(v) {
    const d = Math.sqrt(Math.pow(v.x - 0.5, 2) + Math.pow(v.y - 0.5, 2));
    const ring = Math.max(0, 1 - Math.abs(fract(d * 3 - v.t * 0.5) - 0.5) * 10);
    return palette(v.colors, d + v.t * 0.04).map((part) => part * ring);
  },
  DNA(v) {
    const strand = Math.sin(v.y * 10 + v.t * 2);
    const first = Math.max(0, 1 - Math.abs(v.x - (0.5 + 0.3 * strand)) * 12);
    const second = Math.max(0, 1 - Math.abs(v.x - (0.5 - 0.3 * strand)) * 12);
    return v.colors[0].map((part, k) => Math.max(part * first, v.colors[6][k] * second));
  },
  FLAG(v) {
    const band = Math.floor(fract(v.x + v.t * 0.1) * v.colors.length);
    const shade = 0.7 + 0.3 * Math.abs(Math.sin(v.y * 8 + v.t));
    return v.colors[band].map((part) => part * shade);
  },
  GALAXY(v) {
    const dx = v.x - 0.5;
    const dy = v.y - 0.5;
    const radius = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const arms = Math.pow(0.5 + 0.5 * Math.sin(
      angle * 3 - Math.log(radius + 0.05) * 8 + v.t * 0.8
    ), 4);
    const core = Math.max(0, 1 - radius * 3);
    return palette(v.colors, radius * 0.7 + v.t * 0.03)
      .map((part) => part * Math.min(1, arms * 0.7 + core));
  },
  TRAFFIC(v) {
    const lane = Math.floor(v.y * 4);
    const pos = fract(v.t * (0.2 + lane * 0.05) + lane * 0.2);
    const delta = Math.abs(v.x - pos);
    const glow = Math.max(0, 1 - Math.min(delta, 1 - delta) * 16);
    return v.colors[4].map((part) => mix(3, part, glow) * (lane % 2 ? 0.8 : 1));
  },
  TEXT3D(v) {
    const text = v.text || "OPENLED";
    const width = text.length * 6 - 1;
    const horizontal = v.textDir === "RIGHT_LEFT" || v.textDir === "LEFT_RIGHT";
    const forward = v.textDir === "LEFT_RIGHT" || v.textDir === "TOP_BOTTOM";
    const axis = horizontal
      ? v.col - v.textOffsetX
      : v.row - v.textOffsetY;
    const depth = horizontal
      ? v.row - v.textOffsetY
      : v.col - v.textOffsetX;
    const axisCount = horizontal ? v.cols : v.rows;
    const depthCount = horizontal ? v.rows : v.cols;
    const travel = axisCount + width + 2;
    const shift = Math.floor(v.t * 6) % travel;
    const gx = forward
      ? axis + shift - axisCount - 1
      : axis - shift + width + 1;
    const gy = depth - Math.floor((depthCount - 7) / 2);
    const flat = depthCount < 7;
    const front = flat ? glyphColumn(text, gx) : glyphPixel(text, gx, gy);
    const side = flat ? false : glyphPixel(text, gx - 1, gy + 1);
    const top = flat ? false : glyphPixel(text, gx - 1, gy - 1);
    const shine = 0.7 + 0.3 * Math.sin(v.t * 4 + v.col * 0.25);
    if (front) {
      return palette(v.colors, gx / Math.max(1, width) + v.t * 0.04)
        .map((part) => part * shine);
    }
    if (side) {
      return v.colors[5].map((part) => part * 0.38);
    }
    if (top) {
      return v.colors[4].map((part) => part * 0.55);
    }
    return [2, 4, 10];
  }
};

function compileCustom(code) {
  const source = String(code || "").trim();
  if (!source) {
    throw new Error("Custom formula is empty");
  }
  const body = source.includes("return") ? source : `return (${source});`;
  try {
    return new Function(
      "i", "x", "y", "n", "t", "frame", "fps",
      "a", "b", "c", "d", "e", "f", "g", "h",
      "sin", "cos", "abs", "min", "max", "floor", "sqrt",
      "mix", "palette", "hsv", "random", "PI",
      `"use strict"; ${body}`
    );
  } catch (error) {
    throw new Error("Custom formula syntax error: " + error.message);
  }
}

function runCustom(compiled, args) {
  let value;
  try {
    value = compiled(
      args.i, args.x, args.y, args.n, args.t, args.frame, args.fps,
      args.a, args.b, args.c, args.d, args.e, args.f, args.g, args.h,
      Math.sin, Math.cos, Math.abs, Math.min, Math.max, Math.floor, Math.sqrt,
      mixAny, palette, hsvToRgb, args.random, Math.PI
    );
  } catch (error) {
    throw new Error("Custom formula runtime error: " + error.message);
  }
  if (Array.isArray(value)) {
    return [
      clampByte(Number(value[0]) || 0),
      clampByte(Number(value[1]) || 0),
      clampByte(Number(value[2]) || 0)
    ];
  }
  const grey = clampByte(Number(value) || 0);
  return [grey, grey, grey];
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function mapIndex(index, layout, cols, rows) {
  if (layout === "LINE") {
    return { col: index, row: 0 };
  }
  const row = Math.floor(index / cols) % rows;
  const within = index % cols;
  let col = within;
  if (layout === "ZIGZAG_Z" && row % 2 === 1) {
    col = cols - 1 - within;
  } else if (layout === "SNAKE_S" && row % 2 === 0) {
    col = cols - 1 - within;
  }
  return { col, row };
}

function intFrom(id, label, min, max) {
  const raw = $(id).value.trim();
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
  return value;
}

function readText(id) {
  const raw = $(id).value
    .toUpperCase()
    .replace(/[^A-Z0-9 .!?:-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
  return raw || "OPENLED";
}

function readConfig() {
  const leds = intFrom("leds", "LED count", 1, 1024);
  const layout = $("layout").value;
  let cols = 1;
  let rows = 1;
  if (layout !== "LINE") {
    cols = intFrom("cols", "Columns", 1, 64);
    rows = intFrom("rows", "Rows", 1, 64);
    const capacity = cols * rows;
    if (!Number.isSafeInteger(capacity) || capacity < leds) {
      throw new Error("Columns × Rows must be at least the LED count");
    }
  }
  return {
    leds,
    fps: intFrom("fps", "FPS", 1, 60),
    seconds: intFrom("seconds", "Duration", 1, 120),
    effect: $("effect").value,
    layout,
    cols,
    rows,
    colorA: parseHex($("colorA").value),
    colorB: parseHex($("colorB").value),
    colorC: parseHex($("colorC").value),
    colorD: parseHex($("colorD").value),
    colorE: parseHex($("colorE").value),
    colorF: parseHex($("colorF").value),
    colorG: parseHex($("colorG").value),
    colorH: parseHex($("colorH").value),
    text: readText("effectText"),
    textDir: $("textDir").value,
    textOffsetX: Number($("textOffsetX").value),
    textOffsetY: Number($("textOffsetY").value),
    customCode: $("customCode").value,
    speed: Number($("speed").value) / 100,
    brightness: Number($("brightness").value)
  };
}

function generateFrames(config, maxFrames = Infinity) {
  const count = config.leds;
  const rate = config.fps;
  const frameTotal = Math.max(1, Math.min(rate * config.seconds, maxFrames));
  const frameBytes = frameTotal * count * 3;
  if (!Number.isSafeInteger(frameBytes) || frameBytes > MAX_PROGRAM_BYTES) {
    throw new Error(
      `Program too large (${formatBytes(Number.isSafeInteger(frameBytes) ? frameBytes : MAX_PROGRAM_BYTES)}). Reduce LEDs, FPS, or duration.`
    );
  }
  const output = new Uint8Array(frameBytes);
  const random = mulberry32(20261125);
  const a = config.colorA;
  const paletteColors = [
    a,
    config.colorB,
    config.colorC,
    config.colorD,
    config.colorE,
    config.colorF,
    config.colorG,
    config.colorH
  ];
  const level = config.brightness;
  const custom = config.effect === "CUSTOM" ? compileCustom(config.customCode) : null;

  for (let frame = 0; frame < frameTotal; frame++) {
    const t = (frame / rate) * config.speed;
    for (let i = 0; i < count; i++) {
      const point = mapIndex(i, config.layout, config.cols, config.rows);
      const x = config.layout === "LINE"
        ? i / Math.max(1, count - 1)
        : point.col / Math.max(1, config.cols - 1);
      const y = config.layout === "LINE" ? 0 : point.row / Math.max(1, config.rows - 1);
      let rgb;
      if (config.effect === "CUSTOM") {
        rgb = runCustom(custom, {
          i,
          x,
          y,
          n: count,
          t,
          frame,
          fps: rate,
          a: paletteColors[0],
          b: paletteColors[1],
          c: paletteColors[2],
          d: paletteColors[3],
          e: paletteColors[4],
          f: paletteColors[5],
          g: paletteColors[6],
          h: paletteColors[7],
          random
        });
      } else if (config.effect === "STATIC") {
        rgb = a;
      } else if (config.effect === "RAINBOW") {
        rgb = palette(paletteColors, x * 0.65 + y * 0.35 + t * 0.1);
      } else if (config.effect === "CHASE") {
        const head = Math.floor(t * 14) % count;
        const diff = Math.min(Math.abs(i - head), count - Math.abs(i - head));
        const value = Math.max(0, 1 - diff / 7);
        const base = palette(paletteColors, i / count + t * 0.08);
        rgb = base.map((part) => mix(8, part, value));
      } else if (config.effect === "BREATHE") {
        const value = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI);
        rgb = palette(paletteColors, t * 0.06).map((part) => part * value);
      } else if (config.effect === "WIPE") {
        const cycle = (t * 0.5) % 2;
        const progress = cycle < 1 ? cycle : 2 - cycle;
        const color = paletteColors[Math.floor(t * 0.5) % paletteColors.length];
        const lit = x <= progress;
        rgb = lit ? color : [0, 0, 0];
      } else if (config.effect === "SPARKLE") {
        const pulse = Math.sin(t * 3);
        const chance = 0.04 + 0.14 * pulse * pulse;
        const lit = random() < chance;
        const color = paletteColors[Math.floor(random() * paletteColors.length)];
        rgb = lit ? color : color.map((part) => part / 8);
      } else if (config.effect === "METEOR") {
        const head = (t * 18) % (count + 24) - 12;
        const diff = Math.abs(i - head);
        const glow = Math.max(0, 1 - diff / 14);
        rgb = palette(paletteColors, i / Math.max(1, count - 1) + t * 0.05)
          .map((part) => mix(4, part, glow * glow));
      } else if (config.effect === "FIRE") {
        const flicker = noise(i * 0.31, Math.floor(t * 10));
        const wave = 0.5 + 0.5 * Math.sin(t * 7 + i * 0.43);
        const heat = clamp(0.15 + flicker * 0.55 + wave * 0.3 - y * 0.25, 0, 1);
        rgb = palette(paletteColors, heat * 0.6)
          .map((part, channel) => part * heat * (channel === 0 ? 1 : 0.82));
      } else if (config.effect === "PLASMA") {
        const v = 0.5
          + 0.25 * Math.sin(x * 8 + t * 2)
          + 0.25 * Math.sin(y * 7 - t * 1.5)
          + 0.25 * Math.sin((x + y) * 6 + t);
        rgb = palette(paletteColors, clamp(v, 0, 1) * 0.7 + t * 0.04);
      } else if (config.effect === "RIPPLE") {
        const dx = x - 0.5;
        const dy = y - 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const wave = 0.5 + 0.5 * Math.sin(dist * 28 - t * 6);
        rgb = palette(paletteColors, dist * 0.9 + t * 0.04).map((part) => part * wave * wave);
      } else if (config.effect === "SCANNER") {
        const scan = fract(t * 0.35);
        let behind = scan - x;
        if (behind < 0) {
          behind += 1;
        }
        const beam = Math.max(0, 1 - behind * 9);
        rgb = palette(paletteColors, scan + t * 0.02).map((part) => mix(4, part, beam));
      } else if (config.effect === "KALEIDO") {
        const kx = Math.abs(fract(x * 2) * 2 - 1);
        const ky = Math.abs(fract(y * 2) * 2 - 1);
        const v = 0.5 + 0.5 * Math.sin((kx + ky) * 7 + t * 3);
        rgb = palette(paletteColors, kx * 0.4 + ky * 0.35 + t * 0.08).map((part) => part * v);
      } else if (config.effect === "MATRIX") {
        const drop = fract(t * 0.35 + noise(Math.floor(x * 12), 3));
        const trail = Math.max(0, 1 - Math.abs(drop - y) * 9);
        const flicker = 0.6 + noise(i, Math.floor(t * 12)) * 0.4;
        rgb = paletteColors[4].map(
          (part, channel) => part * trail * flicker * (channel === 0 ? 0.25 : 1)
        );
      } else if (config.effect === "AURORA") {
        const curtain = 0.5 + 0.5 * Math.sin(
          x * 5 + Math.sin(y * 4 + t) * 1.5 + t * 0.8
        );
        rgb = palette(paletteColors, y * 0.35 + t * 0.05)
          .map((part) => part * Math.pow(curtain, 3));
      } else if (config.effect === "LAVA") {
        const blob = noise(
          Math.floor(x * 5) + Math.floor(t * 0.7),
          Math.floor(y * 5) - Math.floor(t * 0.4)
        );
        const detail = noise(
          Math.floor(x * 9) - Math.floor(t * 0.5),
          Math.floor(y * 9)
        );
        const heat = clamp((blob + detail) * 0.65, 0, 1);
        rgb = palette(paletteColors, heat * 0.7).map((part) => part * heat);
      } else if (config.effect === "STROBE") {
        const beat = fract(t * 3);
        const flash = beat < 0.12 ? 1 : beat < 0.3 ? 0.35 : 0.06;
        const color = paletteColors[Math.floor(t * 3) % paletteColors.length];
        rgb = color.map((part) => part * flash);
      } else if (config.effect === "SPIRAL") {
        const dx = x - 0.5;
        const dy = y - 0.5;
        const radius = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const spiral = 0.5 + 0.5 * Math.sin(angle * 4 - radius * 18 + t * 3);
        rgb = palette(paletteColors, radius * 0.8 + t * 0.06)
          .map((part) => part * spiral * spiral);
      } else if (config.effect === "SNOW") {
        const column = Math.floor(x * 10);
        const speed = 0.25 + noise(column, 7) * 0.5;
        const yPos = fract(t * speed + noise(column, 2));
        const delta = Math.abs(y - yPos);
        const flake = Math.max(0, 1 - Math.min(delta, 1 - delta) * 22);
        rgb = paletteColors[7].map((part) => mix(part, 255, 0.65) * flake);
      } else if (config.effect === "CIRCUIT") {
        const row = Math.floor(y * 6);
        const track = fract(x * 6 + (row % 2 ? t * 0.35 : -t * 0.35));
        const pulse = Math.max(0, 1 - track * 10);
        rgb = paletteColors[6].map((part, channel) =>
          mix(part * 0.12, paletteColors[4][channel], pulse)
        );
      } else if (config.effect === "SUNRISE") {
        const sunX = 0.5 + 0.25 * Math.sin(t * 0.3);
        const distance = Math.sqrt(
          Math.pow(x - sunX, 2) + Math.pow(y - 0.75, 2)
        );
        const glow = Math.max(0, 1 - distance * 2.2);
        const gradient = clamp(1 - y, 0, 1);
        rgb = palette(paletteColors, gradient * 0.6)
          .map((part) => part * (0.15 + gradient * 0.5 + glow * 0.7));
      } else if (config.effect === "THUNDER") {
        const cell = Math.floor(t * 2);
        const strike = noise(cell, 11);
        const flash = strike > 0.7 ? 0.5 + 0.5 * Math.pow(fract(t * 10), 2) : 0.05;
        const color = paletteColors[Math.floor(strike * paletteColors.length) % paletteColors.length];
        rgb = color.map((part) => part * flash);
      } else if (config.effect === "NEON") {
        const line = Math.abs(Math.sin((x + y) * 6 - t * 2));
        const glow = Math.pow(line, 12) + 0.2 * Math.pow(line, 3);
        rgb = palette(paletteColors, x * 0.5 + t * 0.05).map((part) => part * glow);
      } else if (EXTRA_EFFECTS[config.effect]) {
        rgb = EXTRA_EFFECTS[config.effect]({
          i,
          x,
          y,
          t,
          frame,
          fps: rate,
          n: count,
          col: point.col,
          row: point.row,
          cols: config.layout === "LINE" ? count : config.cols,
          rows: config.layout === "LINE" ? 1 : config.rows,
          text: config.text,
          textDir: config.textDir,
          textOffsetX: config.textOffsetX,
          textOffsetY: config.textOffsetY,
          colors: paletteColors,
          random
        });
      } else {
        const wave = 0.5 + 0.5 * Math.sin(x * 6 + y * 2 - t * 4);
        rgb = palette(paletteColors, x + y * 0.3 - t * 0.15).map((part) => part * wave);
      }
      const offset = (frame * count + i) * 3;
      output[offset] = clampByte(rgb[0] * level / 255);
      output[offset + 1] = clampByte(rgb[1] * level / 255);
      output[offset + 2] = clampByte(rgb[2] * level / 255);
    }
  }
  return output;
}

function drawFrame(data) {
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#080a10";
  ctx.fillRect(0, 0, width, height);

  if (!data || currentLeds <= 0) {
    ctx.fillStyle = "#667385";
    ctx.font = "500 26px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Preview dabayein", width / 2, height / 2 + 9);
    return;
  }

  if (currentLayout === "LINE") {
    const shown = Math.min(currentLeds, 96);
    const padding = Math.max(18, width * 0.03);
    const step = (width - padding * 2) / shown;
    const radius = Math.max(3, Math.min(step * 0.36, height * 0.3));
    const centerY = height / 2;

    for (let i = 0; i < shown; i++) {
      const source = Math.floor((i * currentLeds) / shown);
      const offset = source * 3;
      const cx = padding + step * i + step / 2;
      paintLed(data[offset], data[offset + 1], data[offset + 2], cx, centerY, radius, true);
    }
    return;
  }

  const padX = Math.max(18, width * 0.05);
  const padY = Math.max(16, height * 0.09);
  const cellW = (width - padX * 2) / currentCols;
  const cellH = (height - padY * 2) / currentRows;
  const radius = Math.max(2, Math.min(cellW, cellH) * 0.34);
  const shown = Math.min(currentLeds, PREVIEW_LEDS);
  const withGlow = shown <= 400;

  for (let j = 0; j < shown; j++) {
    const i = Math.floor((j * currentLeds) / shown);
    const point = mapIndex(i, currentLayout, currentCols, currentRows);
    if (point.row >= currentRows || point.col >= currentCols) {
      continue;
    }
    const cx = padX + (point.col + 0.5) * cellW;
    const cy = padY + (point.row + 0.5) * cellH;
    const offset = i * 3;
    paintLed(data[offset], data[offset + 1], data[offset + 2], cx, cy, radius, withGlow);
  }
}

function paintLed(r, g, b, cx, cy, radius, glow) {
  if (glow) {
    ctx.beginPath();
    ctx.fillStyle = `rgba(${r},${g},${b},0.16)`;
    ctx.arc(cx, cy, radius * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

function stopPreview() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

function startPreview() {
  stopPreview();
  try {
    const config = readConfig();
    currentFrames = generateFrames(config, PREVIEW_FRAMES);
    currentLeds = config.leds;
    currentLayout = config.layout;
    currentCols = config.cols;
    currentRows = config.rows;
    canvas.height = currentLayout === "LINE" ? 260 : 360;
    currentFrameCount = currentFrames.length / (currentLeds * 3);
    currentIndex = 0;
    drawFrame(currentFrames.subarray(0, currentLeds * 3));
    $("previewInfo").textContent = `${config.effect} • ${config.layout} • ${config.leds.toLocaleString()} LED • ${config.fps} FPS • short loop`;
    $("status").textContent = "Preview is running with a short loop.";

    const interval = Math.max(16, Math.round(1000 / config.fps));
    timer = setInterval(() => {
      const start = currentIndex * currentLeds * 3;
      drawFrame(currentFrames.subarray(start, start + currentLeds * 3));
      currentIndex = (currentIndex + 1) % Math.max(1, currentFrameCount);
      $("frameInfo").textContent = `${currentIndex + 1} / ${currentFrameCount}`;
    }, interval);
  } catch (error) {
    $("status").textContent = error.message;
  }
}

function buildBinary(config, frames) {
  const nameBytes = new TextEncoder().encode(config.effect);
  const headerBytes = 5 + 2 + 5 * 4 + nameBytes.length + 3 * 4;
  const buffer = new ArrayBuffer(headerBytes + frames.length);
  const view = new DataView(buffer);
  let offset = 0;

  for (const char of "OJLED") {
    view.setUint8(offset++, char.charCodeAt(0));
  }
  view.setUint16(offset, 1, true);
  offset += 2;
  for (const value of [
    config.leds,
    config.fps,
    config.seconds,
    frames.length / 3,
    nameBytes.length
  ]) {
    view.setInt32(offset, value, true);
    offset += 4;
  }
  new Uint8Array(buffer, offset, nameBytes.length).set(nameBytes);
  offset += nameBytes.length;
  for (const value of [
    LAYOUT_IDS[config.layout] || 0,
    config.cols,
    config.rows
  ]) {
    view.setInt32(offset, value, true);
    offset += 4;
  }
  new Uint8Array(buffer, offset, frames.length).set(frames);
  return buffer;
}

function toBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function buildJson(config, frames) {
  return JSON.stringify({
    format: "openled-1",
    effect: config.effect,
    layout: config.layout,
    cols: config.cols,
    rows: config.rows,
    leds: config.leds,
    fps: config.fps,
    seconds: config.seconds,
    frameCount: frames.length / 3,
    colorA: `#${config.colorA.map((part) => part.toString(16).padStart(2, "0")).join("")}`.toUpperCase(),
    colorB: `#${config.colorB.map((part) => part.toString(16).padStart(2, "0")).join("")}`.toUpperCase(),
    colorC: `#${config.colorC.map((part) => part.toString(16).padStart(2, "0")).join("")}`.toUpperCase(),
    colorD: `#${config.colorD.map((part) => part.toString(16).padStart(2, "0")).join("")}`.toUpperCase(),
    colorE: `#${config.colorE.map((part) => part.toString(16).padStart(2, "0")).join("")}`.toUpperCase(),
    colorF: `#${config.colorF.map((part) => part.toString(16).padStart(2, "0")).join("")}`.toUpperCase(),
    colorG: `#${config.colorG.map((part) => part.toString(16).padStart(2, "0")).join("")}`.toUpperCase(),
    colorH: `#${config.colorH.map((part) => part.toString(16).padStart(2, "0")).join("")}`.toUpperCase(),
    ...(config.effect === "TEXT3D"
      ? {
          text: config.text,
          textDir: config.textDir,
          textOffsetX: config.textOffsetX,
          textOffsetY: config.textOffsetY
        }
      : {}),
    ...(config.customCode ? { customCode: config.customCode } : {}),
    frameOrder: "RGB",
    framesBase64: toBase64(frames)
  }, null, 2);
}

function download(name, data, mime) {
  const bytes = data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : data instanceof Uint8Array
      ? data
      : new TextEncoder().encode(String(data));
  if (window.Android && typeof window.Android.saveFile === "function") {
    window.Android.saveFile(name, toBase64(bytes), mime);
    return;
  }
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function exportProgram(asBinary) {
  try {
    const config = readConfig();
    stopPreview();
    const frames = generateFrames(config);
    const base = `openled_${config.leds}led_${config.fps}fps_${config.effect.toLowerCase()}_${config.layout.toLowerCase()}`;
    if (asBinary) {
      download(`${base}.bin`, buildBinary(config, frames), "application/octet-stream");
    } else {
      download(`${base}.json`, buildJson(config, frames), "application/json");
    }
    $("status").textContent = `${asBinary ? ".bin" : ".json"} exported. Check Downloads.`;
  } catch (error) {
    $("status").textContent = error.message;
  }
}

$("speed").addEventListener("input", () => {
  $("speedOut").textContent = `${(Number($("speed").value) / 100).toFixed(2)}x`;
});

$("brightness").addEventListener("input", () => {
  $("brightnessOut").textContent = $("brightness").value;
});

function updateLayoutFields() {
  const visible = $("layout").value !== "LINE";
  $("colsField").classList.toggle("hidden", !visible);
  $("rowsField").classList.toggle("hidden", !visible);
  canvas.height = visible ? 360 : 260;
  drawFrame(null);
}

function updateEffectFields() {
  const custom = $("effect").value === "CUSTOM";
  const text = $("effect").value === "TEXT3D";
  for (const id of ["customField", "customPresets", "customHint"]) {
    $(id).classList.toggle("hidden", !custom);
  }
  for (const id of [
    "textField",
    "textDirField",
    "textOffsetXField",
    "textOffsetYField",
    "textHint"
  ]) {
    $(id).classList.toggle("hidden", !text);
  }
}

const colorsToggle = $("colorsToggle");
const colorFields = $("colorFields");
function updateColorsToggle() {
  const hidden = colorFields.classList.contains("hidden");
  colorsToggle.textContent = hidden ? "Show colors" : "Hide colors";
  colorsToggle.setAttribute("aria-expanded", hidden ? "false" : "true");
}
colorsToggle.addEventListener("click", () => {
  colorFields.classList.toggle("hidden");
  updateColorsToggle();
});
updateColorsToggle();

document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    $("customCode").value = CUSTOM_PRESETS[Number(button.dataset.preset)];
    $("status").textContent = "Formula preset loaded.";
  });
});

function updateTelemetry() {
  const leds = Math.max(0, Number($("leds").value) || 0);
  const fps = Math.max(0, Number($("fps").value) || 0);
  const seconds = Math.max(0, Number($("seconds").value) || 0);
  const frames = fps * seconds;
  const bytes = frames * leds * 3;
  const select = $("effect");
  const effect = select.selectedOptions && select.selectedOptions.length
    ? select.selectedOptions[0].textContent
    : select.value;
  $("statEffect").textContent = effect;
  $("statLeds").textContent = leds.toLocaleString();
  $("statFrames").textContent = Number.isSafeInteger(frames) ? frames.toLocaleString() : "—";
  $("statMemory").textContent = Number.isSafeInteger(bytes) ? formatBytes(bytes) : "Too large";
}

function updateSizeInfo() {
  const leds = Math.max(0, Number($("leds").value) || 0);
  const fps = Math.max(0, Number($("fps").value) || 0);
  const seconds = Math.max(0, Number($("seconds").value) || 0);
  const bytes = fps * seconds * leds * 3;
  $("sizeInfo").textContent = Number.isSafeInteger(bytes)
    ? `Estimated program size: ${formatBytes(bytes)}. Maximum 1024 LEDs, with Grid up to 64 × 64.`
    : "Estimated program size: too large for this device.";
  updateTelemetry();
}

$("layout").addEventListener("change", updateLayoutFields);
$("effect").addEventListener("change", () => {
  updateEffectFields();
  updateTelemetry();
});
for (const id of ["leds", "fps", "seconds"]) {
  $(id).addEventListener("input", updateSizeInfo);
  $(id).addEventListener("change", updateSizeInfo);
}
let nameInputTimer = null;
function scheduleTextPreview() {
  if ($("effect").value !== "TEXT3D") {
    return;
  }
  clearTimeout(nameInputTimer);
  nameInputTimer = setTimeout(startPreview, 400);
}
$("effectText").addEventListener("input", scheduleTextPreview);
for (const id of ["textDir", "textOffsetX", "textOffsetY"]) {
  $(id).addEventListener("input", scheduleTextPreview);
  $(id).addEventListener("change", scheduleTextPreview);
}

$("previewBtn").addEventListener("click", startPreview);
$("binBtn").addEventListener("click", () => exportProgram(true));
$("jsonBtn").addEventListener("click", () => exportProgram(false));

updateLayoutFields();
updateEffectFields();
updateSizeInfo();

if ("serviceWorker" in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) {
      return;
    }
    refreshing = true;
    window.location.reload();
  });
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
