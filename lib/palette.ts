/**
 * Paletas de cor do restaurante.
 *
 * O dono escolhe cinco cores; todo o resto (superfícies, bordas, textos secundários,
 * estados de hover, texto sobre cada cor) é calculado aqui, sempre respeitando o
 * contraste mínimo de leitura (WCAG AA: 4,5:1 para texto, 3:1 para bordas de campos).
 *
 * A paleta vale para o cardápio público e, se o dono quiser, para o painel.
 * Sem paleta salva, o sistema usa as cores do Kardap definidas em app/globals.css
 * (e o cardápio continua seguindo o modo escuro do celular do cliente).
 */

export type PaletteColors = {
  /** Fundo das páginas. */
  background: string;
  /** Texto principal. */
  text: string;
  /** Botões principais, categoria selecionada, interruptores ligados. */
  primary: string;
  /** Botão de chamar a equipe e avisos de chamado no painel. */
  signal: string;
  /** Barra lateral do painel, faixa das mesas e fundo da logo. */
  brand: string;
};

export type PaletteKey = keyof PaletteColors;

export type BrandPalette = {
  /** Id da paleta pronta ou "custom". */
  id: string;
  name: string;
  colors: PaletteColors;
  /** Paleta pronta que serviu de ponto de partida (só para paletas próprias). */
  basedOn?: string;
  /** Aplicar também ao painel interno. */
  panel: boolean;
};

export type PalettePreset = { id: string; name: string; description: string; colors: PaletteColors };

export const DEFAULT_PALETTE_ID = "default";

/** Cores atuais do Kardap (app/globals.css). */
export const KARDAP_COLORS: PaletteColors = {
  background: "#ffffff",
  text: "#111111",
  primary: "#111111",
  signal: "#111111",
  brand: "#111111",
};

export const PALETTE_PRESETS: PalettePreset[] = [
  { id: DEFAULT_PALETTE_ID, name: "Padrão", description: "Preto e branco, minimalista e profissional.", colors: KARDAP_COLORS },
  {
    id: "cantina",
    name: "Cantina",
    description: "Creme quente e vermelho tomate, para massas e pizzarias.",
    colors: { background: "#fbf5ec", text: "#2a1712", primary: "#a3281c", signal: "#f2bf3a", brand: "#3a1f17" },
  },
  {
    id: "bistro",
    name: "Bistrô noturno",
    description: "Fundo escuro com dourado, para bares e casas à noite.",
    colors: { background: "#121214", text: "#f2ede4", primary: "#d6ae66", signal: "#f5d76e", brand: "#1f1f24" },
  },
  {
    id: "brasa",
    name: "Brasa",
    description: "Carvão e laranja, para hamburguerias e churrascarias.",
    colors: { background: "#18120f", text: "#f6ece3", primary: "#e4572e", signal: "#ffc93c", brand: "#2a1e19" },
  },
  {
    id: "horta",
    name: "Horta",
    description: "Verde-folha sobre fundo claro, para cozinha natural e saladas.",
    colors: { background: "#f3f6ee", text: "#18281b", primary: "#2e6b3a", signal: "#f4c542", brand: "#1d3922" },
  },
  {
    id: "litoral",
    name: "Litoral",
    description: "Azul-petróleo e areia, para frutos do mar e quiosques.",
    colors: { background: "#f2f6f6", text: "#0f262b", primary: "#0d6b74", signal: "#ffcf4a", brand: "#0b3a40" },
  },
  {
    id: "cafe",
    name: "Café",
    description: "Tons de grão e leite, para cafeterias e padarias.",
    colors: { background: "#f6efe5", text: "#2a1c13", primary: "#6f4a32", signal: "#e8b84a", brand: "#3b2a1f" },
  },
  {
    id: "acai",
    name: "Açaí",
    description: "Roxo intenso, para açaiterias, sorveterias e docerias.",
    colors: { background: "#faf5fb", text: "#28122e", primary: "#6a2a78", signal: "#ffc24b", brand: "#3a1544" },
  },
  {
    id: "minimal",
    name: "Preto e branco",
    description: "Neutro e direto; deixa as fotos dos pratos em evidência.",
    colors: { background: "#ffffff", text: "#111111", primary: "#111111", signal: "#ffd23f", brand: "#111111" },
  },
];

export const PALETTE_FIELDS: { key: PaletteKey; label: string; hint: string }[] = [
  { key: "background", label: "Fundo", hint: "Cor de fundo do cardápio e das páginas do painel." },
  { key: "text", label: "Texto", hint: "Nomes dos pratos, preços e textos principais." },
  { key: "primary", label: "Destaque", hint: "Botões principais, categoria selecionada e interruptores ligados." },
  { key: "signal", label: "Chamar a equipe", hint: "Botão “Chamar garçom” e avisos de chamado no painel. Use uma cor que chame atenção." },
  { key: "brand", label: "Marca", hint: "Barra lateral do painel, faixa das mesas e fundo da logo." },
];

export function presetById(id: string | undefined) {
  return PALETTE_PRESETS.find((p) => p.id === id);
}

// ───────────────────────── Cor ─────────────────────────

type RGB = [number, number, number];

const HEX = /^#[0-9a-f]{6}$/i;

/** Só aceita #rrggbb: o valor vai para o estilo da página e vem de um documento editável. */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

/** Normaliza o que a pessoa digitou ("fa0", "#FFAA00", " #ffaa00 ") para #rrggbb, ou null. */
export function normalizeHex(input: string): string | null {
  let v = input.trim().toLowerCase();
  if (!v.startsWith("#")) v = "#" + v;
  if (/^#[0-9a-f]{3}$/.test(v)) v = "#" + v.slice(1).split("").map((c) => c + c).join("");
  return HEX.test(v) ? v : null;
}

const toRgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const toHex = ([r, g, b]: RGB) => "#" + [r, g, b].map((n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0")).join("");

const withAlpha = (hex: string, alpha: number) => `rgb(${toRgb(hex).join(" ")} / ${alpha})`;

/** Mistura `a` com `b` (t = 0 → a, t = 1 → b). */
export function mix(a: string, b: string, t: number) {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

function luminance(hex: string) {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG (1 a 21). */
export function contrast(a: string, b: string) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const isDark = (hex: string) => contrast(hex, "#ffffff") > contrast(hex, "#000000");

const WHITE = "#ffffff";
const NEAR_BLACK = "#111111";

/** Texto legível sobre `bg`: branco ou quase preto, o que tiver mais contraste (sempre ≥ 4,5:1). */
export function onColor(bg: string) {
  return contrast(bg, WHITE) >= contrast(bg, NEAR_BLACK) ? WHITE : NEAR_BLACK;
}

/**
 * Aproxima `color` de `toward` até atingir `min` de contraste sobre todos os fundos.
 * Mantém o tom escolhido o quanto der; só escurece/clareia o necessário.
 */
export function ensureContrast(color: string, backgrounds: string[], min: number, toward?: string) {
  const target = toward ?? (isDark(backgrounds[0]) ? WHITE : "#000000");
  const ok = (c: string) => backgrounds.every((bg) => contrast(c, bg) >= min);
  if (ok(color)) return color;
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = mix(color, target, t);
    if (ok(c)) return c;
  }
  return target;
}

// ───────────────────────── Tokens ─────────────────────────

/** Variáveis CSS (as mesmas de app/globals.css) calculadas a partir das cinco cores. */
export function paletteVars(colors: PaletteColors): Record<string, string> {
  const { background: bg, text, primary, signal, brand } = colors;
  const dark = isDark(bg);

  const surface = dark ? mix(bg, text, 0.05) : mix(bg, WHITE, 0.7);
  const sunken = mix(bg, text, dark ? 0.1 : 0.06);
  const line = mix(bg, text, dark ? 0.16 : 0.12);
  const lineStrong = mix(bg, text, dark ? 0.28 : 0.24);
  const ink = ensureContrast(text, [bg, surface, sunken], 4.5, dark ? WHITE : "#000000");
  const text2 = ensureContrast(mix(ink, bg, 0.2), [bg, surface, sunken], 4.5, ink);
  const muted = ensureContrast(mix(ink, bg, 0.4), [bg, surface, sunken], 4.5, ink);
  const placeholder = ensureContrast(mix(ink, bg, 0.5), [surface], 4.5, ink);
  const controlLine = ensureContrast(mix(bg, ink, 0.45), [surface], 3, ink);
  const onInk = contrast(surface, ink) >= 4.5 ? surface : onColor(ink);

  // O hover se afasta da cor do texto do botão: o contraste só aumenta.
  const onPrimary = onColor(primary);
  const primaryHover = mix(primary, onPrimary === WHITE ? "#000000" : WHITE, 0.12);

  const onSignal = onColor(signal);
  const signalHover = mix(signal, onSignal === WHITE ? "#000000" : WHITE, 0.1);
  const signalSoft = mix(bg, signal, dark ? 0.18 : 0.24);
  const signalInk = ensureContrast(mix(signal, ink, 0.55), [surface, signalSoft], 4.5, ink);

  const giz = onColor(brand) === WHITE ? mix(WHITE, "#fcf5e4", 0.5) : NEAR_BLACK;
  const lousa2 = mix(brand, giz, 0.06);
  const lousa3 = mix(brand, giz, 0.12);
  const gizMuted = ensureContrast(mix(giz, brand, 0.35), [brand, lousa2], 4.5, giz);
  const gizSoft = ensureContrast(mix(giz, brand, 0.15), [brand, lousa2, lousa3], 4.5, giz);
  const signalOnBrand = contrast(signal, brand) >= 3 && contrast(signal, lousa3) >= 3 ? signal : giz;

  const vars: Record<string, string> = {
    "--k-lousa": brand,
    "--k-lousa-2": lousa2,
    "--k-lousa-3": lousa3,
    "--k-giz": giz,
    "--k-giz-muted": gizMuted,
    "--k-giz-soft": gizSoft,
    "--k-signal-on-lousa": signalOnBrand,
    "--k-cloche": signal,
    "--k-cloche-hover": signalHover,
    "--k-cloche-soft": signalSoft,
    "--k-cloche-line": mix(bg, signal, 0.55),
    "--k-cloche-ink": signalInk,
    "--k-on-cloche": onSignal,
    "--k-canvas": bg,
    "--k-surface": surface,
    "--k-sunken": sunken,
    "--k-line": line,
    "--k-line-strong": lineStrong,
    "--k-control-line": controlLine,
    "--k-ink": ink,
    "--k-ink-hover": mix(ink, bg, 0.15),
    "--k-text-2": text2,
    "--k-muted": muted,
    "--k-placeholder": placeholder,
    "--k-on-ink": onInk,
    "--k-skel-hi": mix(sunken, surface, 0.5),
    "--k-primary": primary,
    "--k-primary-hover": primaryHover,
    "--k-on-primary": onPrimary,
    "--k-primary-ink": ensureContrast(primary, [bg, surface], 4.5, ink),
    "--k-logo-bg": brand,
    "--k-focus": ink,
    // Vidro sobre a superfície da paleta: explícito para valer também na prévia, que aplica as cores num contêiner.
    "--k-glass": withAlpha(surface, 0.55),
    "--k-glass-2": withAlpha(surface, 0.72),
    "--k-glass-3": withAlpha(surface, 0.88),
    "--k-select-chevron": `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23${ink.slice(1)}' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  };

  if (dark) {
    // Estados no escuro: os mesmos do tema escuro do cardápio (app/menu.css).
    Object.assign(vars, {
      "--k-success-ink": "#8fd8ae",
      "--k-success-soft": "#173326",
      "--k-danger-ink": "#ffb4a8",
      "--k-danger-soft": "#3a1d18",
      "--k-danger-line": "#6b3329",
      "--k-warning-ink": "#ffc27a",
      "--k-warning-soft": "#3a2a12",
      // O brilho branco do vidro vira uma linha clara no escuro: a borda passa a ser a linha da paleta.
      "--k-glass-rim": line,
      "--k-shadow-card": "0 20px 44px -28px rgb(0 0 0 / 0.55)",
      "--k-shadow-card-hover": "0 24px 52px -24px rgb(0 0 0 / 0.65)",
    });
  }
  return vars;
}

export type ContrastCheck = { label: string; ratio: number; min: number; ok: boolean; fix?: { key: PaletteKey; value: string } };

/**
 * O que a pessoa precisa ver ao montar a paleta. As cores sobre destaque, chamada e marca
 * são escolhidas automaticamente e sempre passam; aqui ficam as combinações que dependem dela.
 */
export function checkPalette(colors: PaletteColors): ContrastCheck[] {
  const { background: bg, text, primary } = colors;
  const textRatio = contrast(text, bg);
  const primaryRatio = contrast(primary, bg);
  // A cor de chamar a equipe não entra: o botão tem borda e o texto dele é calculado.
  return [
    {
      label: "Texto sobre o fundo",
      ratio: textRatio,
      min: 4.5,
      ok: textRatio >= 4.5,
      fix: textRatio >= 4.5 ? undefined : { key: "text", value: ensureContrast(text, [bg], 7) },
    },
    {
      label: "Destaque sobre o fundo",
      ratio: primaryRatio,
      min: 3,
      ok: primaryRatio >= 3,
      fix: primaryRatio >= 3 ? undefined : { key: "primary", value: ensureContrast(primary, [bg], 3) },
    },
    brandCheck(colors.brand),
  ];
}

/** Cor da marca em tom médio deixa os textos secundários da barra lateral sem contraste. */
function brandCheck(brand: string): ContrastCheck {
  const on = onColor(brand);
  const ratio = contrast(on, brand);
  const ok = ratio >= 5.5;
  return {
    label: "Texto sobre a cor da marca",
    ratio,
    min: 5.5,
    ok,
    fix: ok ? undefined : { key: "brand", value: ensureContrast(brand, [on], 5.5, on === WHITE ? "#000000" : WHITE) },
  };
}

/** Lê a paleta salva no documento do restaurante; qualquer valor inválido volta ao padrão. */
export function readPalette(value: unknown): BrandPalette | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<BrandPalette> & { colors?: Partial<PaletteColors> };
  const c = v.colors;
  if (!c || !PALETTE_FIELDS.every(({ key }) => isHexColor(c[key]))) return null;
  // Sem campos undefined: o Firestore recusa gravar undefined e a marca é regravada inteira.
  return {
    id: typeof v.id === "string" ? v.id.slice(0, 40) : "custom",
    name: typeof v.name === "string" && v.name.trim() ? v.name.trim().slice(0, 40) : "Minha paleta",
    colors: { background: c.background!, text: c.text!, primary: c.primary!, signal: c.signal!, brand: c.brand! },
    ...(typeof v.basedOn === "string" ? { basedOn: v.basedOn.slice(0, 40) } : {}),
    panel: v.panel === true,
  };
}

/** Paleta pronta no formato salvo. */
export function paletteFromPreset(preset: PalettePreset, panel = false): BrandPalette {
  return { id: preset.id, name: preset.name, colors: { ...preset.colors }, panel };
}

/** A paleta padrão do Kardap não sobrescreve nada (mantém o modo escuro automático do cardápio). */
export const isDefaultPalette = (palette: BrandPalette | null | undefined) =>
  !palette || palette.id === DEFAULT_PALETTE_ID || palette.id === "kardap";
