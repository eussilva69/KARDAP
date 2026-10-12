"use client";

import { useEffect, useId, useState } from "react";
import { AlertCircle, AlertTriangle, Check, Paintbrush, Pencil, Trash2, Wand2 } from "lucide-react";
import { Button, Card, CardHead, Switch, TextField } from "@/components/ui/primitives";
import {
  DEFAULT_PALETTE_ID,
  PALETTE_FIELDS,
  PALETTE_PRESETS,
  checkPalette,
  normalizeHex,
  paletteFromPreset,
  presetById,
  type BrandPalette,
  type PaletteColors,
  type PaletteKey,
} from "@/lib/palette";
import type { Brand, Notify } from "./types";

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;
type Draft = { name: string; colors: PaletteColors; basedOn?: string };

const CUSTOM_ID = "custom";

/** Ponto de partida de "Começar do zero": neutro, para a pessoa definir tudo. */
const BLANK: PaletteColors = { background: "#ffffff", text: "#111111", primary: "#111111", signal: "#ffd23f", brand: "#111111" };

const ratio = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ":1";

/** Miniatura da paleta: fundo, barra da marca, linhas de texto, botão de destaque e o sinal de chamar. */
function PaletteArt({ colors }: { colors: PaletteColors }) {
  return (
    <span
      className="kd-pal-art"
      aria-hidden
      style={
        {
          "--pal-bg": colors.background,
          "--pal-text": colors.text,
          "--pal-primary": colors.primary,
          "--pal-signal": colors.signal,
          "--pal-brand": colors.brand,
        } as React.CSSProperties
      }
    >
      <i className="kd-pal-side" />
      <span className="kd-pal-body">
        <i className="kd-pal-line" />
        <i className="kd-pal-line is-short" />
        <span className="kd-pal-actions">
          <i className="kd-pal-btn" />
          <i className="kd-pal-dot" />
        </span>
      </span>
    </span>
  );
}

/** Campo de cor: seletor nativo e código hexadecimal, sincronizados. */
function ColorField({ field, value, onChange }: { field: (typeof PALETTE_FIELDS)[number]; value: string; onChange: (hex: string) => void }) {
  const id = useId();
  const [text, setText] = useState(value);
  const [error, setError] = useState("");
  useEffect(() => {
    setText(value);
    setError("");
  }, [value]);
  const commit = () => {
    const hex = normalizeHex(text);
    if (!hex) {
      setError("Use o formato #RRGGBB, por exemplo #A3281C.");
      return;
    }
    setError("");
    if (hex !== value) onChange(hex);
    else setText(hex);
  };
  return (
    <div className="kd-field kd-color-field">
      <div className="kd-label">
        <label htmlFor={id}>{field.label}</label>
      </div>
      <div className="kd-color-inputs">
        <input type="color" className="kd-color-swatch" value={value} aria-label={`${field.label}: abrir seletor de cor`} onChange={(e) => onChange(e.target.value)} />
        <input
          id={id}
          className="kd-input kd-color-hex"
          value={text}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-msg`}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        />
      </div>
      {error ? (
        <p id={`${id}-msg`} className="kd-error">
          <AlertCircle size={14} aria-hidden />
          {error}
        </p>
      ) : (
        <p id={`${id}-msg`} className="kd-hint">
          {field.hint}
        </p>
      )}
    </div>
  );
}

export function PalettePicker({
  brand,
  setBrand,
  notify,
  onPreview,
}: {
  brand: Brand;
  setBrand: Setter<Brand>;
  notify: Notify;
  /** Cores em edição, para a prévia do celular (null: mostra a paleta salva). */
  onPreview: (colors: PaletteColors | null) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const selectedId = brand.palette?.id ?? DEFAULT_PALETTE_ID;
  const panel = brand.palette?.panel ?? true;
  const custom = brand.customPalette;

  useEffect(() => onPreview(draft ? draft.colors : null), [draft, onPreview]);
  useEffect(() => () => onPreview(null), [onPreview]);

  const options: { id: string; name: string; description: string; colors: PaletteColors }[] = [
    ...PALETTE_PRESETS,
    ...(custom ? [{ id: CUSTOM_ID, name: custom.name, description: describeCustom(custom), colors: custom.colors }] : []),
  ];
  const selected = options.find((o) => o.id === selectedId) ?? options[0];

  /** Troca a paleta em uso, com desfazer (a escolha é salva na hora, como logo e capa). */
  const apply = (next: BrandPalette | null, message: string) => {
    const previous = brand.palette;
    setBrand((current) => ({ ...current, palette: next }));
    notify(message, "success", { label: "Desfazer", onAction: () => setBrand((current) => ({ ...current, palette: previous })) });
  };

  const choose = (id: string) => {
    if (id === selectedId) return;
    if (id === CUSTOM_ID && custom) return apply({ ...custom, panel }, `Paleta “${custom.name}” aplicada`);
    const preset = presetById(id);
    if (!preset) return;
    apply(preset.id === DEFAULT_PALETTE_ID ? null : paletteFromPreset(preset, panel), `Paleta “${preset.name}” aplicada`);
  };

  const startFrom = (base: "selected" | "blank") => {
    if (base === "blank") return setDraft({ name: custom?.name ?? "Minha paleta", colors: { ...BLANK } });
    const isCustom = selected.id === CUSTOM_ID;
    setDraft({
      name: isCustom ? selected.name : custom?.name ?? "Minha paleta",
      colors: { ...selected.colors },
      basedOn: isCustom ? custom?.basedOn : selected.id,
    });
  };

  const save = () => {
    if (!draft) return;
    const palette: BrandPalette = {
      id: CUSTOM_ID,
      name: draft.name.trim().slice(0, 40) || "Minha paleta",
      colors: draft.colors,
      ...(draft.basedOn ? { basedOn: draft.basedOn } : {}),
      panel,
    };
    const previous = { palette: brand.palette, customPalette: brand.customPalette };
    setBrand((current) => ({ ...current, palette, customPalette: palette }));
    setDraft(null);
    notify(`Paleta “${palette.name}” salva e aplicada`, "success", { label: "Desfazer", onAction: () => setBrand((current) => ({ ...current, ...previous })) });
  };

  const removeCustom = () => {
    const previous = { palette: brand.palette, customPalette: brand.customPalette };
    setBrand((current) => ({ ...current, customPalette: null, palette: current.palette?.id === CUSTOM_ID ? null : current.palette }));
    setDraft(null);
    notify("Paleta própria excluída", "success", { label: "Desfazer", onAction: () => setBrand((current) => ({ ...current, ...previous })) });
  };

  const setColor = (key: PaletteKey, value: string) => setDraft((d) => (d ? { ...d, colors: { ...d.colors, [key]: value } } : d));
  const checks = draft ? checkPalette(draft.colors) : [];
  const unreadable = checks[0] && !checks[0].ok;

  return (
    <Card>
      <CardHead kicker="Cores" title="Paleta de cores" id="kd-palette-title" />
      <p className="kd-pal-intro">Vale para o cardápio que o cliente vê e, se você quiser, para este painel. A escolha é salva na hora.</p>

      <fieldset className="kd-pal-grid" aria-labelledby="kd-palette-title" disabled={Boolean(draft)}>
        {options.map((o) => (
          <label key={o.id} className={`kd-pal ${o.id === selected.id ? "is-selected" : ""}`}>
            <input type="radio" name="kd-palette" className="kd-sr" value={o.id} checked={o.id === selected.id} onChange={() => choose(o.id)} />
            <PaletteArt colors={o.colors} />
            <span className="kd-pal-name">
              {o.id === selected.id && <Check size={14} aria-hidden />}
              {o.name}
              {o.id === CUSTOM_ID && <span className="kd-pal-tag">Sua</span>}
            </span>
          </label>
        ))}
      </fieldset>

      {!draft && (
        <>
          <p className="kd-pal-desc" aria-live="polite">
            <b>{selected.name}.</b> {selected.description}
          </p>
          <div className="kd-pal-actions-row">
            <Button variant="secondary" icon={selected.id === CUSTOM_ID ? <Pencil size={16} /> : <Paintbrush size={16} />} onClick={() => startFrom("selected")}>
              {selected.id === CUSTOM_ID ? "Editar minha paleta" : "Criar a partir desta"}
            </Button>
            <Button variant="ghost" onClick={() => startFrom("blank")}>
              Começar do zero
            </Button>
          </div>
          {selected.id !== DEFAULT_PALETTE_ID && (
            <div className="kd-pal-panel">
              <Switch
                label="Usar também no painel"
                description="Desligado, o painel de gestão fica com as cores do Kardap e só o cardápio usa a paleta."
                checked={panel}
                onChange={(checked) => {
                  setBrand((current) => (current.palette ? { ...current, palette: { ...current.palette, panel: checked } } : current));
                  notify(checked ? "Paleta aplicada também ao painel" : "Painel voltou às cores do Kardap");
                }}
              />
            </div>
          )}
        </>
      )}

      {draft && (
        <section className="kd-pal-editor" aria-labelledby="kd-pal-editor-title">
          <div className="kd-pal-editor-head">
            <PaletteArt colors={draft.colors} />
            <h3 className="kd-h3" id="kd-pal-editor-title">
              {custom && selected.id === CUSTOM_ID ? "Editar paleta" : "Montar paleta"}
            </h3>
            <p>
              {draft.basedOn ? <>Partindo de “{presetById(draft.basedOn)?.name ?? "outra paleta"}”. </> : null}A prévia ao lado mostra como fica no celular do cliente.
            </p>
          </div>

          <TextField label="Nome da paleta" value={draft.name} maxLength={40} onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))} />

          <div className="kd-color-fields">
            {PALETTE_FIELDS.map((field) => (
              <ColorField key={field.key} field={field} value={draft.colors[field.key]} onChange={(hex) => setColor(field.key, hex)} />
            ))}
          </div>

          <div className="kd-pal-checks">
            <p className="kd-overline">Leitura</p>
            <ul>
              {checks.map((c) => (
                <li key={c.label} className={c.ok ? "is-ok" : "is-bad"}>
                  {c.ok ? <Check size={16} aria-hidden /> : <AlertTriangle size={16} aria-hidden />}
                  <span>
                    {c.label}: <b>{ratio(c.ratio)}</b> <small>(mínimo {ratio(c.min)})</small>
                    {!c.ok && <span className="kd-sr"> abaixo do mínimo</span>}
                  </span>
                  {c.fix && (
                    <Button size="sm" variant="secondary" icon={<Wand2 size={14} />} onClick={() => setColor(c.fix!.key, c.fix!.value)}>
                      Ajustar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <p className="kd-pal-checks-note">Textos secundários, bordas e a cor do texto sobre cada botão são calculados para manter a leitura.</p>
          </div>

          <div className="kd-pal-editor-foot">
            {custom && selected.id === CUSTOM_ID ? (
              <Button variant="ghost" className="is-destructive" icon={<Trash2 size={16} />} onClick={removeCustom}>
                Excluir minha paleta
              </Button>
            ) : (
              <span />
            )}
            <div className="kd-pal-editor-main">
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={unreadable}>
                Salvar e aplicar
              </Button>
            </div>
          </div>
          {unreadable && <p className="kd-pal-block">Ajuste o texto sobre o fundo para salvar: com esse contraste, o cardápio fica difícil de ler.</p>}
        </section>
      )}
    </Card>
  );
}

function describeCustom(p: BrandPalette) {
  const base = presetById(p.basedOn);
  return base ? `Montada por você a partir de “${base.name}”.` : "Montada por você.";
}
