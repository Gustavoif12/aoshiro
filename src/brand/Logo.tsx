import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  LOGO_BLADE, LOGO_DOT, LOGO_DOT_HALF_A, LOGO_DOT_HALF_B, LOGO_LETTERS, LOGO_PETAL,
  LOGO_SPLIT, LOGO_TRAIL, LOGO_VIEWBOX_COMPACT, LOGO_VIEWBOX_FULL,
} from "./logoData";

/*
 * Marca do Aoshiro: o pingo do "i" é cortado por uma lâmina e vira pétalas.
 * As cores vêm do tema (variáveis CSS), então a logo acompanha o modo claro e o escuro:
 *   --logo-ink  → letras            (padrão: --text)
 *   --logo-acc  → pétala principal  (padrão: --accent)
 *   --logo-soft → linha e pétalas distantes
 */

type LogoProps = {
  /** "full": com a trilha de pétalas (login, abertura). "compact": só nome, pétala e lâmina (cabeçalhos). */
  variant?: "full" | "compact";
  className?: string;
  /** Texto para leitores de tela. Passe "" quando houver um título visível com o nome ao lado. */
  label?: string;
};

const ink = "var(--logo-ink, var(--text))";
const acc = "var(--logo-acc, var(--accent))";
const soft = "var(--logo-soft, var(--accent))";

export function Logo({ variant = "full", className, label = "Aoshiro" }: LogoProps) {
  const full = variant === "full";
  return (
    <svg
      viewBox={full ? LOGO_VIEWBOX_FULL : LOGO_VIEWBOX_COMPACT}
      className={className}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g fill={ink}>
        {LOGO_LETTERS.map((d, i) => <path key={i} d={d} />)}
      </g>
      <line {...bladeCoords} stroke={soft} strokeWidth={10} strokeLinecap="round" opacity={0.8} />
      <path d={LOGO_PETAL} fill={acc} />
      {full && <Trail />}
    </svg>
  );
}

const bladeCoords = { x1: LOGO_BLADE.x1, y1: LOGO_BLADE.y1, x2: LOGO_BLADE.x2, y2: LOGO_BLADE.y2 };

function Trail({ animated = false }: { animated?: boolean }) {
  return (
    <g>
      {LOGO_TRAIL.map((p, k) => {
        const style = {
          "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, "--o": p.o, "--k": k,
          opacity: animated ? undefined : p.o,
        } as CSSProperties;
        const fill = p.tone === 1 ? acc : soft;
        return p.circle
          ? <circle key={k} className={animated ? "splash-trail" : undefined} style={style} cx={p.circle[0]} cy={p.circle[1]} r={p.circle[2]} fill={fill} />
          : <path key={k} className={animated ? "splash-trail" : undefined} style={style} d={p.d} fill={fill} />;
      })}
    </g>
  );
}

type SplashProps = {
  /** Fica true quando o app terminou de carregar (sessão e dados). */
  ready: boolean;
  /** Chamado quando a abertura termina de sair da tela. */
  onDone: () => void;
  tagline: string;
  skipLabel: string;
  loadingLabel: string;
  /** Tema da abertura (o último usado no Aoshiro neste aparelho, ou o do sistema na primeira vez). */
  theme?: "dark" | "light";
};

// Duração da animação completa (deve acompanhar os tempos em index.css).
const ANIMATION_MS = 3000;
const REDUCED_MS = 600;
const EXIT_MS = 450;

/**
 * Tela de abertura: as letras surgem, a lâmina corta o pingo do "i" e ele vira pétalas.
 * Some quando a animação terminou E o app está pronto — ou antes, se a pessoa tocar em "Pular".
 * Com "reduzir movimento" ativado no sistema, mostra a logo pronta e sai rápido.
 */
export function SplashScreen({ ready, onDone, tagline, skipLabel, loadingLabel, theme = "dark" }: SplashProps) {
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [animDone, setAnimDone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const skipped = useRef(false);

  useEffect(() => {
    const t = window.setTimeout(() => setAnimDone(true), reduced ? REDUCED_MS : ANIMATION_MS);
    return () => window.clearTimeout(t);
  }, [reduced]);

  useEffect(() => {
    if (!leaving && ready && (animDone || skipped.current)) setLeaving(true);
  }, [ready, animDone, leaving]);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(onDone, reduced ? 0 : EXIT_MS);
    return () => window.clearTimeout(t);
  }, [leaving, onDone, reduced]);

  const skip = () => {
    skipped.current = true;
    if (ready) setLeaving(true);
    else setAnimDone(true); // sai assim que o carregamento terminar
  };

  const splitA = { "--sx": `${LOGO_SPLIT.ax}px`, "--sy": `${LOGO_SPLIT.ay}px`, "--sr": "-20deg" } as CSSProperties;
  const splitB = { "--sx": `${LOGO_SPLIT.bx}px`, "--sy": `${LOGO_SPLIT.by}px`, "--sr": "25deg" } as CSSProperties;

  return (
    <div className={`splash theme-${theme} ${leaving ? "splash-leaving" : ""}`} role="status" aria-live="polite" aria-label={loadingLabel}>
      <svg viewBox={LOGO_VIEWBOX_FULL} className="splash-logo" role="img" aria-label="Aoshiro" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id="splash-half-a"><path d={LOGO_DOT_HALF_A} /></clipPath>
          <clipPath id="splash-half-b"><path d={LOGO_DOT_HALF_B} /></clipPath>
          <filter id="splash-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14" /></filter>
        </defs>
        <g fill={ink}>
          {LOGO_LETTERS.map((d, i) => <path key={i} className="splash-letter" style={{ "--i": i } as CSSProperties} d={d} />)}
        </g>
        <line {...bladeCoords} className="splash-blade-static" stroke={soft} strokeWidth={10} strokeLinecap="round" />
        <g className="splash-dot" fill={ink}>
          <circle className="splash-half" style={splitA} {...dotCoords} clipPath="url(#splash-half-a)" />
          <circle className="splash-half" style={splitB} {...dotCoords} clipPath="url(#splash-half-b)" />
        </g>
        <circle className="splash-ripple" {...dotCoords} fill="none" stroke={acc} strokeWidth={6} />
        <line {...bladeCoords} className="splash-blade-glow" stroke={soft} strokeWidth={36} strokeLinecap="round" filter="url(#splash-glow)" />
        <line {...bladeCoords} className="splash-blade" stroke={soft} strokeWidth={10} strokeLinecap="round"
          style={{ "--len": LOGO_BLADE.length } as CSSProperties} />
        <path className="splash-petal" d={LOGO_PETAL} fill={acc} />
        <Trail animated />
      </svg>
      <p className="splash-tagline">{tagline}</p>
      <button type="button" className="splash-skip" onClick={skip}>{skipLabel}</button>
    </div>
  );
}

const dotCoords = { cx: LOGO_DOT.cx, cy: LOGO_DOT.cy, r: LOGO_DOT.r };
