import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createTranslator, getMonthNames, type Language } from "./i18n";
import { Logo, SplashScreen } from "./brand/Logo";
import type { Currency } from "./types";
import { supabase, supabaseConfigured } from "./lib/supabaseClient";

type View =
  | "login" | "register" | "forgot"
  | "home" | "debts" | "categories" | "history" | "budget" | "settings" | "payment"
  | "simulation" | "goals" | "catEditor" | "notifications" | "help";

type Debt = {
  id: number;
  title: string;
  value: number;
  due: string;
  category: string;
  categoryId?: number;
  paid: boolean;
  reminder?: string;
  paidAt?: string;
  paymentMethod?: string;
};
type User = { id: string; name: string; email: string; phone?: string };
type Category = { id: number; name: string; color: string; budget: number };
type Goal = { id: number; label: string; target: number; current: number };
type MonthData = { debts: Debt[]; budget: number };

const mkKey = (m: number, y: number) => `${y}-${String(m + 1).padStart(2, "0")}`;

const isDateText = (value: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(value);
const brToISO = (value: string) => {
  if (!isDateText(value)) return "";
  const [day, month, year] = value.split("/");
  return `${year}-${month}-${day}`;
};
const isoToBR = (value: string) => {
  if (!value || !value.includes("-")) return value;
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
};
const maskDateInput = (value: string, language: Language) => {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (!digits) return "";
  const firstLen = 2;
  const secondLen = 2;

  if (language === "en-US") {
    if (digits.length <= firstLen) return digits;
    if (digits.length <= firstLen + secondLen) return `${digits.slice(0, firstLen)}/${digits.slice(firstLen)}`;
    return `${digits.slice(0, firstLen)}/${digits.slice(firstLen, firstLen + secondLen)}/${digits.slice(firstLen + secondLen)}`;
  }

  if (digits.length <= firstLen) return digits;
  if (digits.length <= firstLen + secondLen) return `${digits.slice(0, firstLen)}/${digits.slice(firstLen)}`;
  return `${digits.slice(0, firstLen)}/${digits.slice(firstLen, firstLen + secondLen)}/${digits.slice(firstLen + secondLen)}`;
};

const parseLocalizedDate = (value: string, language: Language) => {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  const [, first, second, year] = match;
  const day = language === "en-US" ? second : first;
  const month = language === "en-US" ? first : second;
  const normalized = `${day}/${month}/${year}`;
  const [d, m, y] = normalized.split("/").map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return "";
  return normalized;
};
const isValidDateText = (value: string) => {
  if (!isDateText(value)) return false;
  const [day, month, year] = value.split("/").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

const CURRENCIES: Record<Currency, { symbol: string; locale: string; code: Currency }> = {
  BRL: { symbol: "R$", locale: "pt-BR", code: "BRL" },
  USD: { symbol: "US$", locale: "en-US", code: "USD" },
  EUR: { symbol: "€", locale: "de-DE", code: "EUR" },
};

const initialDebts: Debt[] = [];
const initialCategories: Category[] = [
  { id: 1, name: "Alimentação", color: "#c8e5dd", budget: 0 },
  { id: 2, name: "Transporte", color: "#bdd7f0", budget: 0 },
  { id: 3, name: "Lazer e diversão", color: "#f3c982", budget: 0 },
];
const initialGoals: Goal[] = [];

// O banco guarda o tom pastel (usado no tema escuro). No tema claro o pastel some
// sobre a trilha (1,05–1,26:1), então pintamos o tom forte, que passa de 3:1.
const CATEGORY_PALETTE = [
  { pastel: "#c8e5dd", strong: "#2E7D68", name: "Verde" },
  { pastel: "#bdd7f0", strong: "#2F6EA3", name: "Azul" },
  { pastel: "#f3c982", strong: "#9A6A12", name: "Âmbar" },
  { pastel: "#f0bdd7", strong: "#B0457A", name: "Rosa" },
  { pastel: "#d7bdf0", strong: "#7457AE", name: "Lilás" },
] as const;
const STRONG_CATEGORY_COLOR: Record<string, string> = {
  ...Object.fromEntries(CATEGORY_PALETTE.map(c => [c.pastel, c.strong])),
  "#d4b8f0": "#6B6B8F", // "Outros", categoria do sistema
};

const card = "rounded-3xl border border-[color:var(--text)]/10 bg-[color:var(--surface)] p-5 shadow-xl";
const btnPrimary = "flex w-full items-center justify-center rounded-2xl bg-[color:var(--accent)] py-3.5 text-sm font-bold text-[color:var(--on-accent)] transition hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-2)] active:scale-[.98] disabled:cursor-not-allowed disabled:bg-[color:var(--text-2)] disabled:text-[color:var(--surface-2)]";
const btnAccent = "flex w-full items-center justify-center rounded-2xl bg-[color:var(--accent)] py-3.5 text-sm font-bold text-[color:var(--on-accent)] transition hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface)] active:scale-[.98]";
const btnGhost = "flex w-full items-center justify-center rounded-2xl border border-[color:var(--field-border)] py-3.5 text-sm font-semibold text-[color:var(--text)] transition hover:bg-[color:var(--text)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] active:scale-[.98]";
const inputWhite = "w-full rounded-2xl border border-[color:var(--field-border)] bg-white px-4 py-3 text-sm text-[color:var(--ink)] placeholder:text-[color:var(--placeholder)] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] transition";
const sectionLabel = "text-xs font-semibold uppercase tracking-widest text-[color:var(--text-2)]";
const rowBtn = "flex w-full items-center justify-between rounded-2xl border border-[color:var(--text)]/10 bg-[color:var(--surface)] p-4 text-left transition hover:bg-[color:var(--text)]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]";
const iconBtn = "grid size-11 place-items-center rounded-2xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]";

const Icon = ({ name, size = 19 }: { name: string; size?: number }) => {
  const paths: Record<string, string> = {
    home: "M3 10.5 12 3l9 7.5v9.1a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 19.6v-9.1ZM9 21v-6h6v6",
    card: "M3 6h18M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
    grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    chart: "M4 20V10m6 10V4m6 16v-7m6 7V7",
    gear: "M4 6h16M4 12h16M4 18h16M8 6V4m0 4V6m8 6v-2m0 4v-2M6 18v-2m0 4v-2",
    plus: "M12 5v14M5 12h14",
    arrow: "m9 18 6-6-6-6",
    back: "m15 18-6-6 6-6",
    search: "m20 20-4.2-4.2M10.8 17a6.2 6.2 0 1 0 0-12.4 6.2 6.2 0 0 0 0 12.4Z",
    eye: "M2.5 12s3.5-5.5 9.5-5.5S21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Zm9.5 2.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6Z",
    eyeOff: "M9.9 4.6A10.2 10.2 0 0 1 12 4.5c6 0 9.5 7.5 9.5 7.5a18.6 18.6 0 0 1-2.6 3.6m-3.3 2.6A3.3 3.3 0 0 1 12 15.3a3.3 3.3 0 0 1-2.6-5.1M3 3l18 18m-5.8-5.8A10.5 10.5 0 0 1 12 19.5C6 19.5 2.5 12 2.5 12a18.5 18.5 0 0 1 5.1-5.9",
    moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z",
    sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-14v2m0 14v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2 12h2m14 0h4M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
    lock: "M12 14v3m-4-7V8a4 4 0 0 1 8 0v2M5 10h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z",
    mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 0 8 9 8-9",
    user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    check: "M20 6 9 17l-5-5",
    bell: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
    sim: "M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2Zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2Z",
    trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
    globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10A15 15 0 0 1 8 12a15 15 0 0 1 4-10Z",
    target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-6a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    alert: "M12 8v5m0 3h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
    clock: "M12 7v5l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
    warn: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
    help: "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
    play: "M8 5v14l11-7L8 5Z",
    close: "M18 6 6 18M6 6l12 12",
    chev: "m6 9 6 6 6-6",
    sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? ""} />
    </svg>
  );
};

type PillTone = "danger" | "warning" | "positive";
const PILL_TONES: Record<PillTone, string> = {
  danger: "bg-[color:var(--danger)]/10 text-[color:var(--danger)]",
  warning: "bg-[color:var(--warning)]/10 text-[color:var(--warning)]",
  positive: "bg-[color:var(--positive)]/10 text-[color:var(--positive)]",
};
const StatusPill = ({ tone, icon, children }: { tone: PillTone; icon: string; children: React.ReactNode }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${PILL_TONES[tone]}`}>
    <Icon name={icon} size={12} />{children}
  </span>
);

const BG_LIGHT = "theme-light bg-[linear-gradient(160deg,var(--bg-2)_0%,var(--bg)_60%)]";
const BG_DARK = "theme-dark bg-[linear-gradient(160deg,var(--bg-2)_0%,var(--bg)_60%)]";

const FieldIcon = ({ icon, children }: { icon: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--field-border)] bg-white px-4 text-[color:var(--ink)] focus-within:ring-2 focus-within:ring-[color:var(--focus)] transition">
    <Icon name={icon} size={16} />
    {children}
  </div>
);

// ===== RF024: tutoriais interativos =====
// Cada passo aponta para um elemento marcado com data-tour="<alvo>" na tela da sua view.
// Os textos são chaves do i18n (pt-BR); a tradução acontece na hora de exibir.
type TourId = "welcome" | "debts" | "categories" | "goals" | "simulation";
type TourStep = { target: string; title: string; body: string };
const TOURS: Record<TourId, { view: View; name: string; steps: TourStep[] }> = {
  welcome: {
    view: "home", name: "Conhecendo o Aoshiro", steps: [
      { target: "balance", title: "Este é o seu saldo do mês", body: "Mostra quanto do orçamento ainda está livre: o orçamento menos as dívidas pagas e o que você reservou em metas. Toque no olho para escondê-lo." },
      { target: "month-nav", title: "Cada mês tem seu orçamento", body: "Use as setas para ver meses anteriores ou planejar os próximos. Ao abrir um mês novo, o Aoshiro oferece copiar as dívidas que ficaram em aberto." },
      { target: "add-debt", title: "Cadastre suas contas", body: "Toque aqui para adicionar uma dívida com valor, vencimento, categoria e um lembrete opcional." },
      { target: "nav", title: "Tudo a um toque", body: "Use a barra para ir até Dívidas, Categorias e Histórico." },
      { target: "settings", title: "Ajustes e ajuda", body: "Aqui você muda tema, moeda, idioma e orçamento. Os tutoriais ficam em Ajustes › Tutoriais e ajuda, para rever quando quiser." },
    ],
  },
  debts: {
    view: "debts", name: "Dívidas e pagamentos", steps: [
      { target: "debts-add", title: "Nova dívida", body: "Adicione as contas do mês selecionado na tela inicial." },
      { target: "debts-search", title: "Encontre rápido", body: "Busque uma dívida pelo nome." },
      { target: "debts-filters", title: "Filtre a lista", body: "Veja só as dívidas em aberto ou pagas, e as que vencem hoje ou nesta semana." },
      { target: "debts-list", title: "Registre pagamentos", body: "Toque em PAGAR quando quitar uma conta. O valor passa a descontar do saldo disponível e vai para o Histórico." },
    ],
  },
  categories: {
    view: "categories", name: "Categorias e limites", steps: [
      { target: "cat-add", title: "Crie categorias", body: "Organize os gastos em grupos, como Moradia ou Saúde, e defina um limite para cada um." },
      { target: "cat-period", title: "Escolha o período", body: "Veja os gastos do mês inteiro, só de hoje ou desta semana." },
      { target: "cat-list", title: "Acompanhe os limites", body: "A barra mostra quanto de cada limite já foi usado, somando dívidas pagas e em aberto. Toque numa categoria para editá-la." },
    ],
  },
  goals: {
    view: "goals", name: "Metas e reservas", steps: [
      { target: "goals-form", title: "Crie uma meta", body: "Dê um nome e um valor alvo, como uma viagem ou uma reserva de emergência." },
      { target: "goals-list", title: "Reserve dinheiro", body: "Use Depositar / Resgatar para separar parte do saldo do mês. O valor reservado sai do saldo disponível e soma ao progresso da meta." },
    ],
  },
  simulation: {
    view: "simulation", name: "Simulação de juros", steps: [
      { target: "sim-about", title: "Juros compostos", body: "Os juros de cada mês entram no cálculo do mês seguinte. O resultado mostra os juros acumulados e o montante final." },
      { target: "sim-form", title: "Informe os dados", body: "Digite o valor inicial, a taxa de juros mensal e o prazo em meses, depois toque em Calcular." },
    ],
  },
};
const TOUR_IDS = Object.keys(TOURS) as TourId[];
const DEFAULT_CATEGORY_NAMES = ["Alimentação", "Transporte", "Lazer e diversão", "Lazer & diversão"];

// Progresso salvo por usuário neste navegador (não exige mudança no banco).
type TutorialState = { seen: Partial<Record<TourId, boolean>>; tips: Partial<Record<TourId, boolean>>; checklistHidden: boolean };
const EMPTY_TUTORIALS: TutorialState = { seen: {}, tips: {}, checklistHidden: false };
const tutorialsKey = (userId: string) => `aoshiro_tutorials_${userId}`;
const loadTutorials = (userId: string): TutorialState => {
  try {
    const raw = localStorage.getItem(tutorialsKey(userId));
    if (!raw) return EMPTY_TUTORIALS;
    const parsed = JSON.parse(raw);
    return { seen: parsed.seen ?? {}, tips: parsed.tips ?? {}, checklistHidden: Boolean(parsed.checklistHidden) };
  } catch {
    return EMPTY_TUTORIALS;
  }
};

type Box = { top: number; left: number; width: number; height: number; radius: number };
const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Escurece a tela, "recorta" o elemento do passo e mostra o balão ao lado dele.
const TourOverlay = ({ step, index, total, onNext, onBack, onSkip, labels }: {
  step: { target: string; title: string; body: string };
  index: number;
  total: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  labels: { step: string; next: string; back: string; skip: string; finish: string };
}) => {
  const [target, setTarget] = useState<Box | null>(null);
  const [cardH, setCardH] = useState(0);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const isLast = index === total - 1;

  // Devolve o foco para onde estava quando o tour fechar.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    let scrolled = false;
    const measure = () => {
      setViewport(v => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el) { setTarget(null); return; }
      if (!scrolled) {
        el.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
        scrolled = true;
      }
      const r = el.getBoundingClientRect();
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 16;
      setTarget(prev => (prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height
        ? prev : { top: r.top, left: r.left, width: r.width, height: r.height, radius }));
    };
    measure();
    // As telas são re-renderizadas com frequência; medir periodicamente mantém o recorte no lugar.
    const timer = window.setInterval(measure, 200);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step.target]);

  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight ?? 0;
    if (h !== cardH) setCardH(h);
  });

  useEffect(() => { primaryRef.current?.focus(); }, [index]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onSkip(); return; }
    if (e.key !== "Tab" || !cardRef.current) return;
    const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>("button"));
    if (items.length === 0) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const margin = 16, gap = 14, pad = 6;
  const cardW = Math.min(360, viewport.w - margin * 2);
  let hole: Box | null = null;
  let cardTop = (viewport.h - cardH) / 2;
  let cardLeft = (viewport.w - cardW) / 2;
  let arrow: { side: "top" | "bottom"; x: number } | null = null;

  if (target) {
    const top = Math.max(8, target.top - pad);
    const bottom = Math.min(viewport.h - 8, target.top + target.height + pad);
    hole = { top, left: target.left - pad, width: target.width + pad * 2, height: Math.max(0, bottom - top), radius: target.radius + pad };
    const spaceBelow = viewport.h - bottom;
    const spaceAbove = top;
    const need = cardH + gap + margin;
    const centerX = target.left + target.width / 2;
    cardLeft = Math.min(Math.max(centerX - cardW / 2, margin), viewport.w - cardW - margin);
    const arrowX = Math.min(Math.max(centerX - cardLeft - 7, 20), cardW - 34);
    if (spaceBelow >= need) { cardTop = bottom + gap; arrow = { side: "top", x: arrowX }; }
    else if (spaceAbove >= need) { cardTop = top - gap - cardH; arrow = { side: "bottom", x: arrowX }; }
    else { cardTop = viewport.h - cardH - margin; }
  }

  return (
    <div className="fixed inset-0 z-[80]" onKeyDown={onKeyDown}>
      {/* Camada que bloqueia toques no app enquanto o tour está aberto */}
      <div className="absolute inset-0" aria-hidden="true" />
      {hole ? (
        <div aria-hidden="true"
          className="pointer-events-none fixed outline outline-2 outline-offset-2 outline-[#A5CFF8]/90 transition-all duration-300 motion-reduce:transition-none"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height, borderRadius: hole.radius, boxShadow: "0 0 0 9999px rgba(6, 24, 43, 0.72)" }} />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-[rgba(6,24,43,0.72)]" />
      )}
      <div ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body"
        className="fixed rounded-[22px] bg-[color:var(--surface-2)] p-5 text-[color:var(--text)] shadow-[0_20px_40px_rgba(6,24,43,0.35)] transition-[top,left] duration-300 motion-reduce:transition-none"
        style={{ top: Math.max(margin, cardTop), left: cardLeft, width: cardW }}>
        {arrow && (
          <span aria-hidden="true" className="absolute size-3.5 rotate-45 rounded-[3px] bg-[color:var(--surface-2)]"
            style={{ left: arrow.x, ...(arrow.side === "top" ? { top: -7 } : { bottom: -7 }) }} />
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-[color:var(--accent-text)]">{labels.step}</span>
          {!isLast && (
            <button type="button" onClick={onSkip}
              className="rounded-lg px-1 py-1.5 text-sm font-semibold text-[color:var(--text-2)] transition hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">{labels.skip}</button>
          )}
        </div>
        <h2 id="tour-title" className="mt-1.5 text-lg font-semibold">{step.title}</h2>
        <p id="tour-body" aria-live="polite" className="mt-1.5 text-sm leading-relaxed text-[color:var(--text-2)]">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all motion-reduce:transition-none ${i === index ? "w-[18px] bg-[color:var(--accent)]" : "w-1.5 bg-[color:var(--text)]/20"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {index > 0 && (
              <button type="button" onClick={onBack}
                className="h-11 rounded-[14px] border border-[color:var(--field-border)] px-4 text-sm font-semibold transition hover:bg-[color:var(--text)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">{labels.back}</button>
            )}
            <button ref={primaryRef} type="button" onClick={onNext}
              className="h-11 rounded-[14px] bg-[color:var(--accent)] px-5 text-sm font-bold text-[color:var(--on-accent)] transition hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-2)]">{isLast ? labels.finish : labels.next}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SupabaseConfigMessage = () => (
  <main className="theme-dark min-h-screen bg-[color:var(--bg)] p-6 text-[color:var(--text)]">
    <div className="mx-auto mt-16 max-w-xl rounded-3xl border border-[color:var(--text)]/10 bg-[color:var(--text)]/5 p-8 shadow-xl">
      <h1 className="text-2xl font-bold">Supabase não configurado</h1>
      <p className="mt-3 text-[color:var(--text-2)]">Crie um arquivo <code>.env.local</code> na raiz do projeto com:</p>
      <pre className="mt-5 overflow-auto rounded-2xl bg-black/30 p-4 text-sm">{`VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICA`}</pre>
      <p className="mt-4 text-sm text-[color:var(--text-2)]">Depois reinicie o Vite com <code>npm run dev</code>.</p>
    </div>
  </main>
);

const THEME_STORAGE_KEY = "aoshiro_theme";
/** Tema de partida (abertura e telas de login/cadastro): o último escolhido no Aoshiro neste aparelho;
 *  na primeira vez, o tema do sistema. Depois do login, o tema salvo no perfil prevalece. */
const getStartupTheme = (): "dark" | "light" => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch { /* sem storage */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const AppContent = ({ onReady }: { onReady?: () => void }) => {
  const [view, setView] = useState<View>("login");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [goals, setGoals] = useState<Goal[]>(initialGoals);
  const [query, setQuery] = useState("");
  const [debtFilter, setDebtFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [catPeriodFilter, setCatPeriodFilter] = useState("all");
  const [showPassword, setShowPassword] = useState(false);
  const [darkMode, setDarkMode] = useState(() => getStartupTheme() === "dark");
  const catColor = (hex: string) => (darkMode ? hex : STRONG_CATEGORY_COLOR[hex.toLowerCase()] ?? hex);
  const [hideBalance, setHideBalance] = useState(false);
  const [currency, setCurrency] = useState<Currency>("BRL");
  const [language, setLanguage] = useState<Language>(() => {
    const stored = localStorage.getItem("aoshiro_language");
    return stored === "en-US" || stored === "es-ES" || stored === "pt-BR" ? stored : "pt-BR";
  });
  const t = useMemo(() => createTranslator(language), [language]);
  const MONTHS = useMemo(() => getMonthNames(language), [language]);
  const catName = (name: string) => {
    const defaults: Record<string, string> = { "Alimentação": t("Alimentação"), "Transporte": t("Transporte"), "Lazer & diversão": t("Lazer e diversão"), "Lazer e diversão": t("Lazer e diversão"), "Outros": t("Outros") };
    return defaults[name] ?? name;
  };
  const [toast, setToast] = useState("");
  const [toastError, setToastError] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [form, setForm] = useState({ title: "", value: "", due: "", category: "", reminder: "" });
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [forgotStep, setForgotStep] = useState<"email" | "code" | "newpass">("email");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPass, setForgotNewPass] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [newCatBudget, setNewCatBudget] = useState("");
  const [newCatColor, setNewCatColor] = useState("#c8e5dd");
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [editCatBudget, setEditCatBudget] = useState("");
  const [editCatColor, setEditCatColor] = useState("#c8e5dd");
  const [newGoalLabel, setNewGoalLabel] = useState("");
  const [newGoalTarget, setNewGoalTarget] = useState("");
  const [goalDeposits, setGoalDeposits] = useState<Record<number, Record<string, number>>>({});
  const [depositGoalId, setDepositGoalId] = useState<number | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositMode, setDepositMode] = useState<"add" | "rescue">("add");
  const [simPrincipal, setSimPrincipal] = useState("");
  const [simRate, setSimRate] = useState("");
  const [simMonths, setSimMonths] = useState("");
  const [simResult, setSimResult] = useState<{ montante: number; juros: number } | null>(null);
  const [payMethod, setPayMethod] = useState("Pix");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );

  const [activeMonth, setActiveMonth] = useState(() => {
    const today = new Date();

    return {
      month: today.getMonth(),
      year: today.getFullYear(),
    };
  });
  const [monthData, setMonthData] = useState<Record<string, MonthData>>({});
  const [showCopyPrompt, setShowCopyPrompt] = useState(false);
  const [showBudgetPrompt, setShowBudgetPrompt] = useState(false);
  const [budgetPromptValue, setBudgetPromptValue] = useState("");
  // Rascunho do orçamento em Ajustes: null = sem edição (mostra o valor salvo).
  const [budgetDraft, setBudgetDraft] = useState<string | null>(null);
  const [budgetSaving, setBudgetSaving] = useState(false);
  // RF024: tutoriais
  const [tutorials, setTutorials] = useState<TutorialState>(EMPTY_TUTORIALS);
  const [tutorialsReady, setTutorialsReady] = useState(false);
  const [activeTour, setActiveTour] = useState<{ id: TourId; step: number } | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const monthKey = mkKey(activeMonth.month, activeMonth.year);
  const debts = monthData[monthKey]?.debts ?? [];
  const budget = monthData[monthKey]?.budget ?? 0;

  const setDebtsForMonth = (key: string, next: Debt[]) =>
    setMonthData(prev => ({
      ...prev,
      [key]: { budget: prev[key]?.budget ?? 0, debts: next },
    }));

  const setBudget = (v: number) =>
    setMonthData(prev => ({ ...prev, [monthKey]: { debts: prev[monthKey]?.debts ?? [], budget: v } }));

  const persistBudget = async (value: number, key = monthKey) => {
    if (!currentUser) return;
    const month = `${key}-01`;
    const { error } = await supabase
      .from("monthly_budgets")
      .upsert({ user_id: currentUser.id, month, amount: value }, { onConflict: "user_id,month" });
    if (error) throw error;
    setMonthData(prev => ({ ...prev, [key]: { debts: prev[key]?.debts ?? [], budget: value } }));
  };

  const prevMonthKey = () => {
    const m = activeMonth.month === 0 ? 11 : activeMonth.month - 1;
    const y = activeMonth.month === 0 ? activeMonth.year - 1 : activeMonth.year;
    return mkKey(m, y);
  };

  const goToPrev = () => {
    const m = activeMonth.month === 0 ? 11 : activeMonth.month - 1;
    const y = activeMonth.month === 0 ? activeMonth.year - 1 : activeMonth.year;
    setActiveMonth({ month: m, year: y });
    setShowCopyPrompt(false);
  };

  const goToNext = () => {
    const m = activeMonth.month === 11 ? 0 : activeMonth.month + 1;
    const y = activeMonth.month === 11 ? activeMonth.year + 1 : activeMonth.year;
    const key = mkKey(m, y);
    setActiveMonth({ month: m, year: y });
    setShowCopyPrompt(!monthData[key]);
  };

  const loadUserData = async (user: { id: string; email?: string | null }) => {
    setDataLoading(true);
    try {
      const [profileRes, categoriesRes, debtsRes, budgetsRes, goalsRes, depositsRes] = await Promise.all([
        supabase.from("profiles").select("id,name,phone,currency,language,dark_mode,hide_balance,notifications_enabled").eq("id", user.id).single(),
        supabase.from("categories").select("id,name,color,budget").eq("user_id", user.id).order("id"),
        supabase.from("debts").select("id,title,value,due_date,reminder_date,category_id,paid,paid_at,payment_method,month_key").eq("user_id", user.id).order("due_date"),
        supabase.from("monthly_budgets").select("month,amount").eq("user_id", user.id),
        supabase.from("goals").select("id,label,target").eq("user_id", user.id).order("id"),
        supabase.from("goal_deposits").select("goal_id,month,amount").eq("user_id", user.id).order("created_at"),
      ]);

      for (const result of [profileRes, categoriesRes, debtsRes, budgetsRes, goalsRes, depositsRes]) {
        if (result.error) throw result.error;
      }

      const profile = profileRes.data;
      if (!profile) throw new Error("Perfil do usuário não encontrado.");

      let dbCategories = categoriesRes.data ?? [];
      if (dbCategories.length === 0) {
        const defaults = [
          { user_id: user.id, name: "Alimentação", color: "#c8e5dd", budget: 0 },
          { user_id: user.id, name: "Transporte", color: "#bdd7f0", budget: 0 },
          { user_id: user.id, name: "Lazer e diversão", color: "#f3c982", budget: 0 },
        ];
        const seed = await supabase.from("categories").insert(defaults).select("id,name,color,budget");
        if (seed.error) throw seed.error;
        dbCategories = seed.data ?? [];
      } else {
        // Atualiza a categoria antiga dos usuários existentes sem perder vínculos com dívidas.
        const legacyCategory = dbCategories.find(c => c.name === "Lazer & diversão");
        let currentCategory = dbCategories.find(c => c.name === "Lazer e diversão");

        if (legacyCategory && !currentCategory) {
          const renamed = await supabase
            .from("categories")
            .update({ name: "Lazer e diversão" })
            .eq("user_id", user.id)
            .eq("id", legacyCategory.id)
            .select("id,name,color,budget")
            .single();
          if (renamed.error) throw renamed.error;
          dbCategories = dbCategories.map(c => Number(c.id) === Number(legacyCategory.id) ? renamed.data : c);
        } else if (legacyCategory && currentCategory) {
          // Se ambas existirem, mantém as dívidas ligadas à categoria atual e remove a duplicada antiga.
          if (Number(currentCategory.budget) === 0 && Number(legacyCategory.budget) > 0) {
            const budgetUpdate = await supabase
              .from("categories")
              .update({ budget: Number(legacyCategory.budget) })
              .eq("user_id", user.id)
              .eq("id", currentCategory.id);
            if (budgetUpdate.error) throw budgetUpdate.error;
            const updatedCurrentCategory = {
              ...currentCategory,
              budget: Number(legacyCategory.budget)
            };

            const currentCategoryId = Number(currentCategory.id);

            currentCategory = updatedCurrentCategory;

            dbCategories = dbCategories.map(c =>
              Number(c.id) === currentCategoryId
                ? updatedCurrentCategory
                : c
            );
          }
          const relinkDebts = await supabase
            .from("debts")
            .update({ category_id: currentCategory.id })
            .eq("user_id", user.id)
            .eq("category_id", legacyCategory.id);
          if (relinkDebts.error) throw relinkDebts.error;
          const removeLegacy = await supabase
            .from("categories")
            .delete()
            .eq("user_id", user.id)
            .eq("id", legacyCategory.id);
          if (removeLegacy.error) throw removeLegacy.error;
          dbCategories = dbCategories.filter(c => Number(c.id) !== Number(legacyCategory.id));
        }
      }

      const categoriesMap = new Map<number, string>((dbCategories as Array<{ id: number; name: string }>).map(c => [c.id, c.name]));
      const dbDebts = debtsRes.data ?? [];
      const nextMonthData: Record<string, MonthData> = {};
      for (const b of budgetsRes.data ?? []) {
        const key = String(b.month).slice(0, 7);
        nextMonthData[key] = { debts: nextMonthData[key]?.debts ?? [], budget: Number(b.amount) };
      }
      for (const d of dbDebts) {
        const key = String(d.month_key).slice(0, 7);
        const debt: Debt = {
          id: Number(d.id),
          title: d.title,
          value: Number(d.value),
          due: isoToBR(String(d.due_date)),
          category: d.category_id ? (categoriesMap.get(Number(d.category_id)) ?? "Outros") : "Outros",
          categoryId: d.category_id ? Number(d.category_id) : undefined,
          paid: Boolean(d.paid),
          reminder: d.reminder_date ? isoToBR(String(d.reminder_date)) : undefined,
          paidAt: d.paid_at ? new Date(d.paid_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : undefined,
          paymentMethod: d.payment_method ?? undefined,
        };
        nextMonthData[key] = {
          budget: nextMonthData[key]?.budget ?? 0,
          debts: [...(nextMonthData[key]?.debts ?? []), debt],
        };
      }

      const nextDeposits: Record<number, Record<string, number>> = {};
      for (const row of depositsRes.data ?? []) {
        const goalId = Number(row.goal_id);
        const key = String(row.month).slice(0, 7);
        nextDeposits[goalId] ??= {};
        nextDeposits[goalId][key] = (nextDeposits[goalId][key] ?? 0) + Number(row.amount);
      }

      const languageValue = profile.language === "en-US" || profile.language === "es-ES" ? profile.language : "pt-BR";
      const currencyValue = profile.currency === "USD" || profile.currency === "EUR" ? profile.currency : "BRL";
      setCurrentUser({ id: user.id, name: profile.name, email: user.email ?? "", phone: profile.phone ?? undefined });
      setCategories(dbCategories.map(c => ({ id: Number(c.id), name: c.name, color: c.color, budget: Number(c.budget) })));
      setMonthData(nextMonthData);
      setGoals((goalsRes.data ?? []).map(g => ({ id: Number(g.id), label: g.label, target: Number(g.target), current: 0 })));
      setGoalDeposits(nextDeposits);
      setCurrency(currencyValue);
      setLanguage(languageValue);
      setDarkMode(Boolean(profile.dark_mode));
      setHideBalance(Boolean(profile.hide_balance));
      setNotificationsEnabled(Boolean(profile.notifications_enabled));
      return (budgetsRes.data ?? []).length > 0;
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (mounted && data.session?.user) {
          const hasBudget = await loadUserData(data.session.user);
          if (!hasBudget) setShowBudgetPrompt(true);
          setView("home");
        } else if (mounted) {
          setDataLoading(false);
        }
      } catch (error) {
        console.error(error);
        if (mounted) { setDataLoading(false); setToast("Não foi possível carregar sua conta."); setToastError(true); }
      }
    };
    void bootstrap();
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT") {
        setCurrentUser(null);
        setMonthData({});
        setCategories([]);
        setGoals([]);
        setGoalDeposits({});
        setView("login");
        setDataLoading(false);
      } else if (event === "PASSWORD_RECOVERY") {
        setDataLoading(false);
        setForgotStep("newpass");
        setView("forgot");
      } else if (session?.user && event !== "INITIAL_SESSION") {
        void loadUserData(session.user).then(hasBudget => {
          setBudgetPromptValue("");
          setShowBudgetPrompt(!hasBudget);
        }).catch(error => { console.error(error); setToast(error.message ?? "Erro ao carregar dados."); setToastError(true); });
      }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  const fmt = (v: number) =>
    v.toLocaleString(CURRENCIES[currency].locale, { style: "currency", currency: CURRENCIES[currency].code });

  const fmtDate = (dateText: string) => {
    if (!dateText) return "";
    if (isDateText(dateText)) {
      const [day, month, year] = dateText.split("/");
      if (language === "en-US") return `${month}/${day}/${year}`;
      if (language === "es-ES") return `${day}/${month}/${year}`;
      const monthName = MONTHS[Number(month) - 1]?.slice(0, 3);
      return `${day} ${monthName ?? month}`;
    }
    return dateText;
  };

  const isOverdue = (d: Debt) => {
    if (d.paid || !isValidDateText(d.due)) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(brToISO(d.due) + "T12:00:00") < today;
  };
  const debtStatus = (d: Debt): { tone: PillTone; icon: string; label: string } =>
    d.paid ? { tone: "positive", icon: "check", label: "Paga" }
      : isOverdue(d) ? { tone: "danger", icon: "alert", label: "Atrasada" }
        : { tone: "warning", icon: "clock", label: "Em aberto" };

  const notify = (msg: string, err = false) => {
    setToast(t(msg)); setToastError(err);
    window.setTimeout(() => setToast(""), 2800);
  };
  const open = (next: View) => { setView(next); setQuery(""); setBudgetDraft(null); };
  useEffect(() => { localStorage.setItem("aoshiro_language", language); }, [language]);
  useEffect(() => { if (!dataLoading) onReady?.(); }, [dataLoading, onReady]);
  // Guarda no aparelho o tema escolhido no Aoshiro, para a próxima abertura já sair no tema certo.
  // Só grava depois que o perfil carregou (antes disso darkMode ainda é o valor padrão).
  useEffect(() => {
    if (!currentUser || dataLoading) return;
    try { localStorage.setItem(THEME_STORAGE_KEY, darkMode ? "dark" : "light"); } catch { /* sem storage */ }
  }, [darkMode, currentUser, dataLoading]);

  // ----- RF024: tutoriais interativos -----
  useEffect(() => {
    if (!currentUser) { setTutorialsReady(false); setActiveTour(null); return; }
    setTutorials(loadTutorials(currentUser.id));
    setTutorialsReady(true);
  }, [currentUser?.id]);

  const updateTutorials = (change: (prev: TutorialState) => TutorialState) => {
    setTutorials(prev => {
      const next = change(prev);
      if (currentUser) {
        try { localStorage.setItem(tutorialsKey(currentUser.id), JSON.stringify(next)); } catch { /* navegador sem storage */ }
      }
      return next;
    });
  };

  const startTour = (id: TourId) => {
    updateTutorials(p => ({ ...p, tips: { ...p.tips, [id]: true } }));
    const targetView = TOURS[id].view;
    if (view !== targetView) {
      open(targetView);
      // Espera a tela nova aparecer antes de procurar os elementos do tour.
      window.setTimeout(() => setActiveTour({ id, step: 0 }), 150);
    } else {
      setActiveTour({ id, step: 0 });
    }
  };

  const endTour = () => {
    if (activeTour) updateTutorials(p => ({ ...p, seen: { ...p.seen, [activeTour.id]: true } }));
    setActiveTour(null);
  };

  // Tour de boas-vindas: abre sozinho uma única vez, depois que o orçamento inicial foi definido.
  useEffect(() => {
    if (view !== "home" || !currentUser || dataLoading || showBudgetPrompt || !tutorialsReady || activeTour || tutorials.seen.welcome) return;
    const timer = window.setTimeout(() => setActiveTour({ id: "welcome", step: 0 }), 600);
    return () => window.clearTimeout(timer);
  }, [view, currentUser, dataLoading, showBudgetPrompt, tutorialsReady, activeTour, tutorials.seen.welcome]);

  const viewTour = TOUR_IDS.find(id => id !== "welcome" && TOURS[id].view === view);
  const showFirstVisitTip = Boolean(viewTour && tutorialsReady && !activeTour && !tutorials.tips[viewTour] && !tutorials.seen[viewTour]);
  const allDebts = Object.values(monthData).flatMap(m => m.debts);

  const totalPaid = debts.filter(d => d.paid).reduce((s, d) => s + d.value, 0);
  const totalOpen = debts.filter(d => !d.paid).reduce((s, d) => s + d.value, 0);
  const goalReserves = goals.reduce((s, g) => s + (goalDeposits[g.id]?.[monthKey] ?? 0), 0);
  const available = budget - totalPaid - goalReserves;
  const openPct = budget > 0 ? (totalOpen / budget) * 100 : 0;
  // O status também vai escrito: a cor sozinha não basta para quem tem daltonismo.
  const budgetStatus = openPct > 100
    ? { label: "Acima do orçamento", tone: "danger" as const }
    : openPct > 90
      ? { label: "Quase no limite", tone: "danger" as const }
      : openPct > 70
        ? { label: "Atenção", tone: "warning" as const }
        : null;

  const reminderItems = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayText = today.toLocaleDateString("pt-BR");
    const items: Array<{ debt: Debt; monthKey: string; kind: "lembrete" | "vencimento"; date: string; status: "hoje" | "proximo" | "atrasado" }> = [];

    Object.entries(monthData).forEach(([key, data]) => {
      data.debts.forEach(debt => {
        if (debt.paid) return;
        if (debt.reminder && isValidDateText(debt.reminder)) {
          const reminder = new Date(brToISO(debt.reminder) + "T12:00:00");
          const status = reminder < today ? "atrasado" : debt.reminder === todayText ? "hoje" : "proximo";
          items.push({ debt, monthKey: key, kind: "lembrete", date: debt.reminder, status });
        }
        if (isValidDateText(debt.due)) {
          const due = new Date(brToISO(debt.due) + "T12:00:00");
          const status = due < today ? "atrasado" : debt.due === todayText ? "hoje" : "proximo";
          items.push({ debt, monthKey: key, kind: "vencimento", date: debt.due, status });
        }
      });
    });

    return items.sort((a, b) => brToISO(a.date).localeCompare(brToISO(b.date)));
  }, [monthData]);

  const activeReminderCount = reminderItems.filter(item => item.status !== "atrasado").length;

  useEffect(() => {
    if (!notificationsEnabled || notificationPermission !== "granted" || typeof window === "undefined") return;
    const todayText = new Date().toLocaleDateString("pt-BR");
    const todays = reminderItems.filter(item => item.date === todayText && item.status === "hoje");
    todays.slice(0, 3).forEach(item => {
      const key = `aoshiro-notified-${item.debt.id}-${item.kind}-${item.date}`;
      if (localStorage.getItem(key)) return;
      new Notification(item.kind === "lembrete" ? t("Lembrete financeiro") : t("Vencimento hoje"), {
        body: `${item.debt.title} • ${fmt(item.debt.value)} • ${item.date}`,
        icon: "/favicon.ico",
      });
      localStorage.setItem(key, "1");
    });
  }, [reminderItems, notificationsEnabled, notificationPermission, language]);

  const filteredDebts = useMemo(() => {
    let list = debts.filter(d => d.title.toLowerCase().includes(query.toLowerCase()));
    if (debtFilter === "paid") list = list.filter(d => d.paid);
    if (debtFilter === "open") list = list.filter(d => !d.paid);
    if (periodFilter !== "all") {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().slice(0, 10);
      const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 6);
      const weekEndStr = weekEnd.toISOString().slice(0, 10);
      list = list.filter(d => {
        const dueISO = brToISO(d.due);
        if (!dueISO) return false;
        if (periodFilter === "today") return dueISO === todayStr;
        if (periodFilter === "week") return dueISO >= todayStr && dueISO <= weekEndStr;
        return true;
      });
    }
    return list;
  }, [debts, query, debtFilter, periodFilter]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (blocked) { notify("Conta bloqueada. Redefina sua senha.", true); return; }
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      const next = loginAttempts + 1; setLoginAttempts(next);
      if (next >= 5) { setBlocked(true); notify("Conta bloqueada após 5 tentativas.", true); }
      else notify(`${t("Credenciais incorretas. Tentativa")} ${next}/5.`, true);
      return;
    }
    const hasBudget = await loadUserData(data.user);
    setLoginAttempts(0); setBlocked(false);
    setBudgetPromptValue("");
    setShowBudgetPrompt(!hasBudget);
    open("home");
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    const phone = String(fd.get("phone") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirm") ?? "");
    if (password !== confirm) { notify("As senhas não coincidem.", true); return; }
    if (password.length < 6) { notify("Senha deve ter pelo menos 6 caracteres.", true); return; }
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name, phone: phone || null } } });
    if (error) { notify(error.message, true); return; }
    if (!data.user) { notify("Não foi possível criar a conta.", true); return; }
    if (!data.session) {
      notify("Conta criada. Confirme seu e-mail para entrar.");
      open("login");
      return;
    }
    const hasBudget = await loadUserData(data.user);
    setBudgetPromptValue("");
    setShowBudgetPrompt(!hasBudget);
    notify("Conta criada com sucesso!");
    open("home");
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotStep === "email") {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), { redirectTo: window.location.origin });
      if (error) { notify(error.message, true); return; }
      notify("Link de recuperação enviado para seu e-mail.");
      setForgotStep("code");
    } else if (forgotStep === "code") {
      notify("Abra o link de recuperação enviado para seu e-mail.");
    } else {
      if (forgotNewPass.length < 6) { notify("Senha deve ter pelo menos 6 caracteres.", true); return; }
      const { error } = await supabase.auth.updateUser({ password: forgotNewPass });
      if (error) { notify(error.message, true); return; }
      notify("Senha redefinida com sucesso!");
      setForgotStep("email"); setForgotEmail(""); setForgotCode(""); setForgotNewPass("");
      await supabase.auth.signOut();
      open("login");
    }
  };

  const addDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !form.title || !form.value) return;
    if (Number(form.value) <= 0) { notify("O valor deve ser maior que zero.", true); return; }
    const due = parseLocalizedDate(form.due, language);
    const reminder = form.reminder ? parseLocalizedDate(form.reminder, language) : "";
    const dateFormat = language === "en-US" ? "MM/DD/YYYY" : "DD/MM/AAAA";
    if (!due) { notify(`${t("Informe o vencimento no formato")} ${dateFormat}.`, true); return; }
    if (form.reminder && !reminder) { notify(`${t("Informe o lembrete no formato")} ${dateFormat}.`, true); return; }
    if (reminder && brToISO(reminder) > brToISO(due)) { notify("Lembrete não pode ser após o vencimento (RN05).", true); return; }
    const category = categories.find(c => c.name === form.category);
    const payload = {
      user_id: currentUser.id,
      title: form.title,
      value: Number(form.value),
      due_date: brToISO(due),
      reminder_date: reminder ? brToISO(reminder) : null,
      category_id: category?.id ?? null,
      month_key: `${monthKey}-01`,
    };
    const { data, error } = await supabase.from("debts").insert(payload).select("id").single();
    if (error) { notify(error.message, true); return; }
    const debt: Debt = { id: Number(data.id), title: form.title, value: Number(form.value), due, category: category?.name ?? "Outros", categoryId: category?.id, paid: false, reminder: reminder || undefined };
    setDebtsForMonth(monthKey, [debt, ...debts]);
    setForm({ title: "", value: "", due: "", category: "", reminder: "" });
    notify("Dívida adicionada.");
  };

  const payDebt = async (method: string) => {
    if (!selectedDebt || !currentUser) return;
    const userId = currentUser.id;
    const { error } = await supabase.from("debts").update({ paid: true, paid_at: new Date().toISOString(), payment_method: method }).eq("id", selectedDebt.id).eq("user_id", userId);
    if (error) { notify(error.message, true); return; }
    const paidAt = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
    setDebtsForMonth(monthKey, debts.map(d => d.id === selectedDebt.id ? { ...d, paid: true, paidAt, paymentMethod: method } : d));
    setSelectedDebt(null); open("debts");
    notify(`${t("Pagamento via")} ${method === "Pix" ? "Pix" : t(method)} ${t("registrado.")}`);
  };

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newCatName || Number(newCatBudget) <= 0) { notify("Preencha nome e limite válido.", true); return; }
    const { data, error } = await supabase.from("categories").insert({ user_id: currentUser.id, name: newCatName.trim(), color: newCatColor, budget: Number(newCatBudget) }).select("id,name,color,budget").single();
    if (error) { notify(error.message, true); return; }
    setCategories(p => [...p, { id: Number(data.id), name: data.name, color: data.color, budget: Number(data.budget) }]);
    setNewCatName(""); setNewCatBudget(""); setNewCatColor("#c8e5dd"); notify("Categoria criada.");
  };

  const startEditingCategory = (c: Category) => {
    setEditingCat(c);
    setEditCatName(c.name);
    setEditCatBudget(String(c.budget));
    setEditCatColor(c.color);
    open("catEditor");
  };

  const addGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newGoalLabel || Number(newGoalTarget) <= 0) { notify("Preencha descrição e valor alvo.", true); return; }
    const { data, error } = await supabase.from("goals").insert({ user_id: currentUser.id, label: newGoalLabel.trim(), target: Number(newGoalTarget) }).select("id,label,target").single();
    if (error) { notify(error.message, true); return; }
    setGoals(p => [...p, { id: Number(data.id), label: data.label, target: Number(data.target), current: 0 }]);
    setNewGoalLabel(""); setNewGoalTarget(""); notify("Meta criada.");
  };

  const goalTotal = (g: Goal) => Object.values(goalDeposits[g.id] ?? {}).reduce((s, v) => s + v, 0);

  const handleGoalDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(depositAmount);
    if (!currentUser || !amt || amt <= 0) { notify("Valor deve ser maior que zero.", true); return; }
    if (depositGoalId === null) return;
    const g = goals.find(x => x.id === depositGoalId);
    if (!g) return;
    const reserved = goalDeposits[depositGoalId]?.[monthKey] ?? 0;
    if (depositMode === "add" && amt > available) { notify("Saldo disponível insuficiente.", true); return; }
    if (depositMode === "rescue" && amt > reserved) { notify(`Só há ${fmt(reserved)} reservado neste mês.`, true); return; }
    const signedAmount = depositMode === "add" ? amt : -amt;
    const { error } = await supabase.from("goal_deposits").insert({ user_id: currentUser.id, goal_id: depositGoalId, month: `${monthKey}-01`, amount: signedAmount });
    if (error) { notify(error.message, true); return; }
    setGoalDeposits(prev => {
      const gMap = { ...(prev[depositGoalId] ?? {}) };
      gMap[monthKey] = (gMap[monthKey] ?? 0) + signedAmount;
      return { ...prev, [depositGoalId]: gMap };
    });
    notify(`${fmt(amt)} ${depositMode === "add" ? t("reservado para") : t("resgatado de")} "${g.label}".`);
    setDepositAmount(""); setDepositGoalId(null);
  };

  const runSim = (e: React.FormEvent) => {
    e.preventDefault();
    const p = Number(simPrincipal), r = Number(simRate) / 100, n = Number(simMonths);
    if (p <= 0) { notify("Valor inicial deve ser maior que zero.", true); return; }
    if (r < 0) { notify("Taxa não pode ser negativa.", true); return; }
    if (!Number.isInteger(n) || n <= 0) { notify("Prazo deve ser um inteiro positivo.", true); return; }
    const montante = r === 0 ? p : p * Math.pow(1 + r, n);
    setSimResult({ montante, juros: montante - p });
  };

  const bgClass = `min-h-screen text-[color:var(--text)] transition-colors duration-500 ${darkMode ? BG_DARK : BG_LIGHT}`;

  const Toast = () => toast ? (
    <div role="alert" aria-live="polite" className={`fixed bottom-24 left-1/2 z-50 max-w-xs -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-2xl md:bottom-6 ${toastError ? "bg-[color:var(--toast-error)]" : "bg-[color:var(--toast)]"}`}>
      {toast}
    </div>
  ) : null;

  const BackBtn = ({ to }: { to: View }) => (
    <button onClick={() => open(to)} className="mb-4 flex items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-[color:var(--text-2)] transition hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">
      <Icon name="back" size={16} />{t("Voltar")}</button>
  );

  const pageTitle: Record<View, string> = {
    login: "", register: "", forgot: "",
    home: "Visão geral", debts: "Dívidas", categories: "Categorias",
    history: "Histórico", budget: "Nova dívida", settings: "Ajustes", notifications: "Notificações",
    payment: "Registrar pagamento", simulation: "Simulação", goals: "Metas", catEditor: "Categorias",
    help: "Tutoriais e ajuda",
  };

  const authInput = "w-full bg-transparent py-3.5 text-sm text-[color:var(--ink)] placeholder:text-[color:var(--placeholder)] outline-none";

  if (view === "login") return (
    <main className={`${bgClass} flex min-h-screen items-center justify-center p-5`}>
      <Toast />
      <section className="w-full max-w-sm" aria-label={t("Entrar na conta")}>
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo className="h-auto w-56 max-w-[80%]" />
          <h1 className="text-lg font-semibold text-[color:var(--text-2)]">{t("Suas finanças, claras.")}</h1>
        </div>
        <div className="rounded-3xl border border-[color:var(--text)]/10 bg-[color:var(--surface-2)] p-8 shadow-2xl backdrop-blur-sm">
          <p className="mb-7 text-sm leading-relaxed text-[color:var(--text-2)]">{t("Entre para acompanhar seu dinheiro com calma e intenção.")}</p>
          {blocked && (
            <div role="alert" className="mb-5 rounded-2xl border border-[color:var(--warning)]/30 bg-[color:var(--warning)]/10 px-4 py-3 text-sm text-[color:var(--warning)]">{t("Conta bloqueada. Redefina sua senha para continuar.")}</div>
          )}
          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-[color:var(--text-2)]">{t("E-mail")}</span>
              <input name="email" required type="email" placeholder="voce@email.com" defaultValue=""
                className="w-full rounded-2xl border border-[color:var(--field-border)] bg-white px-4 py-3.5 text-sm text-[color:var(--ink)] placeholder:text-[color:var(--placeholder)] outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]" />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-[color:var(--text-2)]">{t("Senha")}</span>
              <div className="flex gap-2">
                <input name="password" required type={showPassword ? "text" : "password"} placeholder="••••••••" defaultValue=""
                  className="min-w-0 flex-1 rounded-2xl border border-[color:var(--field-border)] bg-white px-4 py-3.5 text-sm text-[color:var(--ink)] outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]" />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className={`${iconBtn} border border-[color:var(--field-border)] bg-white text-[color:var(--ink)] hover:bg-white/90`}>
                  <Icon name={showPassword ? "eyeOff" : "eye"} />
                </button>
              </div>
            </label>
            <button type="submit" disabled={blocked} className={`mt-2 ${btnPrimary}`}>{t("Entrar na minha conta")}</button>
          </form>
          <button onClick={() => { setForgotStep("email"); setForgotEmail(""); setForgotCode(""); setForgotNewPass(""); open("forgot"); }}
            className="mt-5 w-full rounded-lg text-center text-sm font-semibold text-[color:var(--text-2)] underline underline-offset-4 transition hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">{t("Esqueci minha senha")}</button>
        </div>
        <p className="mt-6 text-center text-sm text-[color:var(--text-2)]">
          {t("Ainda não tem conta?")} {" "}
          <button onClick={() => open("register")} className="rounded font-semibold text-[color:var(--text)] underline underline-offset-4 transition hover:text-[color:var(--text-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">{t("Criar agora")}</button>
        </p>
      </section>
    </main>
  );

  if (view === "register") return (
    <main className={`${bgClass} flex min-h-screen items-center justify-center p-5`}>
      <Toast />
      <section className="w-full max-w-sm" aria-label={t("Criar conta")}>
        <BackBtn to="login" />
        <div className="mb-8">
          <Logo className="h-14 w-auto" />
          <h1 className="mt-3 text-2xl font-semibold">{t("Criar conta")}</h1>
        </div>
        <div className="rounded-3xl border border-[color:var(--text)]/10 bg-[color:var(--surface-2)] p-8 shadow-2xl backdrop-blur-sm">
          <form onSubmit={handleRegister} className="space-y-4" noValidate>
            {([
              { name: "name", label: "Nome completo", icon: "user", type: "text", ph: "Seu nome", required: true },
              { name: "email", label: "E-mail", icon: "mail", type: "email", ph: "voce@email.com", required: true },
              { name: "phone", label: "Celular (opcional)", icon: "bell", type: "tel", ph: "(99) 99999-9999", required: false },
              { name: "password", label: "Senha", icon: "lock", type: "password", ph: "Mínimo 6 caracteres", required: true },
              { name: "confirm", label: "Confirmar senha", icon: "lock", type: "password", ph: "Repita a senha", required: true },
            ] as const).map(f => (
              <label key={f.name} className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-[color:var(--text-2)]">{t(f.label)}</span>
                <FieldIcon icon={f.icon}>
                  <input name={f.name} required={f.required} type={f.type} placeholder={t(f.ph)} className={authInput} />
                </FieldIcon>
              </label>
            ))}
            <button type="submit" className={`mt-2 ${btnPrimary}`}>{t("Criar minha conta")}</button>
          </form>
        </div>
        <p className="mt-6 text-center text-sm text-[color:var(--text-2)]">
          {t("Já tem conta?")} {" "}
          <button onClick={() => open("login")} className="rounded font-semibold text-[color:var(--text)] underline underline-offset-4 transition hover:text-[color:var(--text-2)] focus-visible:outline-none">{t("Entrar")}</button>
        </p>
      </section>
    </main>
  );

  if (view === "forgot") return (
    <main className={`${bgClass} flex min-h-screen items-center justify-center p-5`}>
      <Toast />
      <section className="w-full max-w-sm" aria-label={t("Redefinir senha")}>
        <BackBtn to="login" />
        <div className="mb-8">
          <Logo className="h-14 w-auto" />
          <h1 className="mt-3 text-2xl font-semibold">{t("Redefinir senha")}</h1>
        </div>
        <div className="mb-8 flex items-center gap-2" aria-label={t("Etapas")}>
          {(["email", "code", "newpass"] as const).map((s, i) => {
            const idx = ["email", "code", "newpass"].indexOf(forgotStep);
            const done = idx > i; const active = forgotStep === s;
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`grid size-8 place-items-center rounded-full text-xs font-bold transition-colors ${active ? "border-2 border-[color:var(--accent)] bg-[color:var(--surface-2)] text-[color:var(--accent-text)]" : done ? "bg-[color:var(--accent)] text-[color:var(--on-accent)]" : "border border-[color:var(--field-border)] bg-[color:var(--surface-2)] text-[color:var(--text-2)]"}`}
                  aria-current={active ? "step" : undefined}>
                  {done ? <Icon name="check" size={14} /> : i + 1}
                </div>
                {i < 2 && <div className={`h-px w-10 transition-colors ${done ? "bg-[color:var(--accent)]" : "bg-[color:var(--text)]/20"}`} />}
              </div>
            );
          })}
        </div>
        <div className="rounded-3xl border border-[color:var(--text)]/10 bg-[color:var(--surface-2)] p-8 shadow-2xl backdrop-blur-sm">
          <form onSubmit={handleForgot} className="space-y-5" noValidate>
            {forgotStep === "email" && <>
              <p className="text-sm leading-relaxed text-[color:var(--text-2)]">{t("Informe seu e-mail. Enviaremos um código de verificação.")}</p>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-[color:var(--text-2)]">{t("E-mail")}</span>
                <FieldIcon icon="mail">
                  <input required type="email" placeholder="voce@email.com" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} className={authInput} />
                </FieldIcon>
              </label>
              <button type="submit" className={btnPrimary}>{t("Enviar link")}</button>
            </>}
            {forgotStep === "code" && <>
              <p className="text-sm leading-relaxed text-[color:var(--text-2)]">{t("Enviamos um link de recuperação para")} <strong>{forgotEmail}</strong>.</p>
              <p className="rounded-xl bg-[color:var(--accent)]/10 px-3 py-2 text-xs leading-relaxed text-[color:var(--accent-text)]">{t("Abra o link no e-mail. Depois desta confirmação, a tela para criar sua nova senha será liberada automaticamente.")}</p>
              <button type="submit" className={btnPrimary}>{t("Verificar recuperação")}</button>
              <button type="button" onClick={async () => { const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), { redirectTo: window.location.origin }); if (error) notify(error.message, true); else notify("Link de recuperação reenviado."); }}
                className="w-full rounded text-center text-sm text-[color:var(--text-2)] underline underline-offset-4 transition hover:text-[color:var(--text)] focus-visible:outline-none">{t("Reenviar link")}</button>
            </>}
            {forgotStep === "newpass" && <>
              <p className="text-sm leading-relaxed text-[color:var(--text-2)]">{t("Escolha uma nova senha segura.")}</p>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-[color:var(--text-2)]">{t("Nova senha")}</span>
                <FieldIcon icon="lock">
                  <input required type="password" placeholder={t("Mínimo 6 caracteres")} value={forgotNewPass} onChange={e => setForgotNewPass(e.target.value)} className={authInput} />
                </FieldIcon>
              </label>
              <button type="submit" className={btnPrimary}>{t("Redefinir senha")}</button>
            </>}
          </form>
        </div>
      </section>
    </main>
  );

  const navItems = ([["home", "home", "Início"], ["debts", "card", "Dívidas"], ["categories", "grid", "Categorias"], ["history", "chart", "Histórico"]] as const).map(([id, icon, label]) => [id, icon, t(label)] as const);
  const isMainNav = ["home", "debts", "categories", "history"].includes(view);

  const Nav = () => (
    <nav
      aria-label={t("Navegação principal")}
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[460px] px-2 pt-2 pb-[max(10px,env(safe-area-inset-bottom))] md:static md:mx-0 md:max-w-none md:rounded-3xl md:border md:border-[color:var(--text)]/10 md:bg-[color:var(--surface)] md:p-2"
    >
      {/* Celular: grade de 4 colunas iguais. O destaque do item ativo envolve só o ícone
          (pílula de largura fixa), então o texto nunca fica maior que o destaque, em
          nenhum idioma. O peso da fonte não muda ao ativar, para o rótulo não "pular".
          Computador (md): mantém a barra lateral com o item ativo preenchido. */}
      <div data-tour="nav" className="grid grid-cols-4 gap-0.5 rounded-[26px] border border-[color:var(--text)]/10 bg-[color:var(--surface)] p-1.5 shadow-xl backdrop-blur-2xl md:flex md:flex-col md:gap-1 md:rounded-2xl md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
        {navItems.map(([id, ic, lb]) => {
          const isActive = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => open(id)}
              aria-current={isActive ? "page" : undefined}
              title={lb}
              className={`group flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-1 rounded-[19px] px-0.5 py-1.5 transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface)] active:scale-[.97] md:min-h-12 md:w-full md:flex-row md:justify-start md:gap-3 md:rounded-xl md:px-3 md:py-2.5 ${isActive ? "text-[color:var(--accent-text)] md:bg-[color:var(--accent)] md:text-[color:var(--on-accent)] md:shadow-sm" : "text-[color:var(--text-2)] hover:text-[color:var(--text)] md:hover:bg-[color:var(--text)]/10"}`}
            >
              <span className={`grid h-8 w-14 max-w-full shrink-0 place-items-center rounded-full transition-all duration-300 md:size-9 md:rounded-xl ${isActive ? "bg-[color:var(--accent)]/15 md:bg-[color:var(--on-accent)]/[0.15]" : "group-hover:bg-[color:var(--text)]/10 md:bg-transparent md:group-hover:bg-transparent"}`}>
                <Icon name={ic} size={20} />
              </span>
              <span className={`block max-w-full truncate text-center text-[13px] font-semibold leading-tight md:text-left md:text-sm ${isActive ? "md:font-bold" : "md:font-medium"}`}>{lb}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );

  const MonthNav = () => (
    <div data-tour="month-nav" className="flex w-full items-center justify-between gap-0.5 sm:w-auto sm:justify-start rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-1" aria-label={t("Navegar entre meses")}>
      <button onClick={goToPrev} aria-label={t("Mês anterior")}
        className="grid size-11 place-items-center rounded-xl transition hover:bg-[color:var(--text)]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">
        <Icon name="back" size={15} />
      </button>
      <span className="min-w-[118px] px-1 text-center text-xs font-semibold">
        {MONTHS[activeMonth.month]} {activeMonth.year}
      </span>
      <button onClick={goToNext} aria-label={t("Próximo mês")}
        className="grid size-11 place-items-center rounded-xl transition hover:bg-[color:var(--text)]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">
        <Icon name="arrow" size={15} />
      </button>
    </div>
  );

  const CopyPrompt = () => {
    if (!showCopyPrompt) return null;
    const prevKey = prevMonthKey();
    const prevUnpaid = (monthData[prevKey]?.debts ?? []).filter(d => !d.paid);
    const prevName = MONTHS[activeMonth.month === 0 ? 11 : activeMonth.month - 1];

    const advanceDue = (due: string): string => {
      const iso = brToISO(due);
      if (!iso) return due;
      try {
        const d = new Date(iso + "T12:00:00");
        d.setMonth(d.getMonth() + 1);
        return isoToBR(d.toISOString().slice(0, 10));
      } catch { return due; }
    };

    const copyDebts = async () => {
      if (!currentUser) return;
      const copiedPayload = prevUnpaid.map(d => ({
        user_id: currentUser.id, title: d.title, value: d.value, due_date: brToISO(advanceDue(d.due)),
        reminder_date: null, category_id: d.categoryId ?? null, month_key: `${monthKey}-01`,
      }));
      if (copiedPayload.length === 0) return;
      const { data, error } = await supabase.from("debts").insert(copiedPayload).select("id,title,value,due_date,category_id,paid,reminder_date,paid_at,payment_method");
      if (error) { notify(error.message, true); return; }
      const copied: Debt[] = (data ?? []).map(d => ({ id: Number(d.id), title: d.title, value: Number(d.value), due: isoToBR(String(d.due_date)), category: d.category_id ? (categories.find(c => c.id === Number(d.category_id))?.name ?? "Outros") : "Outros", categoryId: d.category_id ? Number(d.category_id) : undefined, paid: Boolean(d.paid), reminder: undefined }));
      setDebtsForMonth(monthKey, copied);
      setShowCopyPrompt(false);
      notify(`${copied.length} ${t(copied.length !== 1 ? "dívidas" : "dívida")} ${t(copied.length !== 1 ? "copiadas" : "copiada")} ${t("de")} ${prevName}.`);
    };

    return (
      <div className="mb-6 rounded-3xl border border-[color:var(--accent)]/40 bg-[color:var(--surface)] p-5">
        <p className="text-sm font-semibold text-[color:var(--accent-text)]">{t("Novo mês")}</p>
        <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-2)]">
          {prevUnpaid.length > 0
            ? `${prevUnpaid.length} ${t(prevUnpaid.length !== 1 ? "dívidas" : "dívida")} ${t("em aberto em")} ${prevName}. ${t("Deseja copiá-las para este mês?")}`
            : t("Nenhuma dívida pendente no mês anterior. Comece adicionando.")}
        </p>
        {prevUnpaid.length > 0 && (
          <div className="mt-4 flex gap-3">
            <button onClick={copyDebts}
              className="flex-1 rounded-2xl bg-[color:var(--accent)] py-2.5 text-xs font-bold text-[color:var(--on-accent)] transition hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">{t("Copiar dívidas")}</button>
            <button onClick={() => setShowCopyPrompt(false)}
              className="flex-1 rounded-2xl border border-[color:var(--text)]/20 py-2.5 text-xs font-semibold text-[color:var(--text-2)] transition hover:bg-[color:var(--text)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">{t("Começar do zero")}</button>
          </div>
        )}
        {prevUnpaid.length === 0 && (
          <button onClick={() => setShowCopyPrompt(false)}
            className="mt-3 text-xs text-[color:var(--text-3)] underline underline-offset-4 transition hover:text-[color:var(--text-2)]">{t("Fechar")}</button>
        )}
      </div>
    );
  };

  const Header = ({ action, backTo = "home" as View }: { action?: React.ReactNode; backTo?: View }) => (
    <header className="mb-8">
      {!isMainNav && <BackBtn to={backTo} />}
      <div className="flex items-center justify-between gap-3">
        <Logo className="mr-5 h-11 w-auto min-w-0 shrink" />
        <div className="relative flex shrink-0 items-center gap-2">
          {action}
          {viewTour && (
            <button type="button" onClick={() => startTour(viewTour)} aria-label={t("Como usar esta tela")} title={t("Como usar esta tela")}
              className={`${iconBtn} border border-[color:var(--text)]/15 bg-[color:var(--surface)] text-[color:var(--accent-text)] hover:bg-[color:var(--text)]/15`}>
              <Icon name="help" size={20} />
            </button>
          )}
          {viewTour && showFirstVisitTip && (
            <div role="status" className="absolute right-0 top-full z-30 mt-3 w-64 rounded-2xl bg-[color:var(--toast)] p-4 text-white shadow-2xl">
              <span aria-hidden="true" className="absolute -top-1.5 right-4 size-3 rotate-45 rounded-sm bg-[color:var(--toast)]" />
              <p className="text-sm leading-relaxed">{t("Primeira vez aqui? Toque em")} <strong>?</strong> {t("para um guia rápido desta tela.")}</p>
              <div className="mt-2 flex gap-4">
                <button type="button" onClick={() => startTour(viewTour)} className="rounded py-1 text-sm font-bold text-[#A5CFF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A5CFF8]">{t("Ver guia")}</button>
                <button type="button" onClick={() => updateTutorials(p => ({ ...p, tips: { ...p.tips, [viewTour]: true } }))} className="rounded py-1 text-sm font-semibold text-white/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A5CFF8]">{t("Agora não")}</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{pageTitle[view] ? t(pageTitle[view]) : ""}</h1>
      {view === "home" && <div className="mt-4"><MonthNav /></div>}
    </header>
  );

  const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
    <section className={`${card} ${className}`}>{children}</section>
  );

  const SegControl = ({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) => {
    const labels: Record<string, string> = { all: t("Todos"), open: t("Em aberto"), paid: t("Pagas"), today: t("Hoje"), week: t("Esta semana") };
    return (
      <div role="group" className="flex gap-1 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-1">
        {options.map(o => (
          <button key={o} type="button" onClick={() => onChange(o)} aria-pressed={value === o}
            className={`min-h-[38px] flex-1 rounded-xl py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] ${value === o ? "bg-[color:var(--accent)] font-bold text-[color:var(--on-accent)]" : "text-[color:var(--text-2)] hover:text-[color:var(--text)]"}`}>
            {labels[o] ?? o}
          </button>
        ))}
      </div>
    );
  };

  let content: React.ReactNode;

  if (view === "home") content = (
    <>
      <Header action={
        <button data-tour="settings" onClick={() => open("settings")} aria-label={t("Abrir ajustes")}
          className={`${iconBtn} border border-[color:var(--text)]/15 bg-[color:var(--surface)] hover:bg-[color:var(--text)]/20`}>
          <Icon name="gear" />
        </button>
      } />
      <CopyPrompt />


      <div data-tour="balance" className="rounded-3xl">
      <Card className="relative overflow-hidden bg-[color:var(--surface-2)]!">
        <div className="pointer-events-none absolute -right-10 -top-12 size-44 rounded-full bg-[color:var(--accent)]/20 blur-2xl" />
        <div className="relative flex items-center justify-between">
          <p className={sectionLabel}>{t("Disponível neste mês")}</p>
          <button type="button" onClick={async () => { const next = !hideBalance; setHideBalance(next); if (currentUser) { const { error } = await supabase.from("profiles").update({ hide_balance: next }).eq("id", currentUser.id); if (error) notify(error.message, true); } }}
            aria-label={hideBalance ? t("Mostrar saldo") : t("Ocultar saldo")}
            className="-m-2 grid size-11 place-items-center rounded-xl text-[color:var(--text-2)] transition hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">
            <Icon name={hideBalance ? "eyeOff" : "eye"} size={18} />
          </button>
        </div>
        <p className="mt-2 text-4xl font-semibold tracking-tight">
          {hideBalance ? <span aria-label={t("Saldo oculto")}>•••••</span> : fmt(available)}
        </p>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-[color:var(--track)]">
          <div className={`h-full rounded-full transition-all duration-500 ${openPct > 90 ? "bg-[color:var(--danger)]" : openPct > 70 ? "bg-[color:var(--warning)]" : "bg-[color:var(--positive)]"}`}
            style={{ width: `${Math.min(100, budget > 0 ? (totalOpen / budget) * 100 : 0)}%` }}
            role="progressbar" aria-valuenow={Math.round(budget > 0 ? (totalOpen / budget) * 100 : 0)} aria-valuemin={0} aria-valuemax={100} />
        </div>
        <div className="mt-2 space-y-0.5 text-xs text-[color:var(--text-2)]">
          <div className="flex items-center justify-between gap-2">
            <span>{hideBalance ? "•••••" : fmt(totalOpen)} {t("em aberto")}</span>
            {!hideBalance && (budgetStatus
              ? <StatusPill tone={budgetStatus.tone} icon="warn">{Math.round(openPct)}% · {t(budgetStatus.label)}</StatusPill>
              : <span>{Math.round(openPct)}% {t("do orçamento")}</span>)}
          </div>
          {goalReserves > 0 && (
            <div className="flex justify-between">
              <span>{hideBalance ? "•••••" : fmt(goalReserves)} {t("em metas")}</span>
              {!hideBalance && <span>{Math.round(budget > 0 ? (goalReserves / budget) * 100 : 0)}% {t("do orçamento")}</span>}
            </div>
          )}
        </div>
      </Card>
      </div>

      {tutorialsReady && !tutorials.checklistHidden && (() => {
        const items = [
          { id: "budget", label: "Definir o orçamento do mês", done: Object.values(monthData).some(m => m.budget > 0), go: () => open("settings") },
          { id: "debt", label: "Adicionar sua primeira dívida", done: allDebts.length > 0, go: () => open("budget") },
          { id: "paid", label: "Registrar um pagamento", done: allDebts.some(d => d.paid), go: () => (tutorials.seen.debts ? open("debts") : startTour("debts")) },
          { id: "category", label: "Criar uma categoria", done: categories.some(c => !DEFAULT_CATEGORY_NAMES.includes(c.name)), go: () => open("catEditor") },
          { id: "goal", label: "Criar uma meta de economia", done: goals.length > 0, go: () => open("goals") },
        ];
        const doneCount = items.filter(i => i.done).length;
        const nextId = items.find(i => !i.done)?.id;
        const hide = () => { updateTutorials(p => ({ ...p, checklistHidden: true })); notify("Você pode reexibir em Ajustes › Tutoriais e ajuda."); };
        return (
          <section aria-labelledby="checklist-title" className={`${card} mt-4`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[color:var(--accent)]/15 text-[color:var(--accent-text)]" aria-hidden="true"><Icon name="sparkle" size={20} /></span>
                <div>
                  <h2 id="checklist-title" className="text-base font-semibold">{doneCount === items.length ? t("Tudo pronto!") : t("Primeiros passos")}</h2>
                  <p className="mt-0.5 text-xs text-[color:var(--text-2)]">{doneCount === items.length ? t("Você já conhece o essencial do Aoshiro.") : `${doneCount} ${t("de")} ${items.length} ${t("concluídos")}`}</p>
                </div>
              </div>
              <button type="button" onClick={hide} aria-label={t("Ocultar primeiros passos")}
                className="-m-1 grid size-10 shrink-0 place-items-center rounded-xl text-[color:var(--text-2)] transition hover:bg-[color:var(--text)]/10 hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="mt-4 mb-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--track)]">
              <div className="h-full rounded-full bg-[color:var(--accent)] transition-all duration-500 motion-reduce:transition-none" style={{ width: `${(doneCount / items.length) * 100}%` }}
                role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={items.length} aria-label={t("Primeiros passos")} />
            </div>
            {doneCount === items.length ? (
              <button type="button" onClick={hide} className={`mt-3 ${btnAccent}`}>{t("Fechar")}</button>
            ) : (
              <ul className="space-y-0.5">
                {items.map(item => (
                  <li key={item.id}>
                    {item.done ? (
                      <div className="flex min-h-11 items-center gap-3 px-1">
                        <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-[color:var(--positive)] text-white" aria-hidden="true"><Icon name="check" size={14} /></span>
                        <span className="text-sm text-[color:var(--text-3)] line-through">{t(item.label)}</span>
                        <span className="sr-only">{t("concluído")}</span>
                      </div>
                    ) : (
                      <button type="button" onClick={item.go}
                        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] ${item.id === nextId ? "my-1 min-h-[52px] border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 px-3" : "px-1 hover:bg-[color:var(--text)]/5"}`}>
                        <span className="flex items-center gap-3">
                          <span className={`grid size-[26px] shrink-0 place-items-center`} aria-hidden="true">
                            <span className={`size-[22px] rounded-full border-2 ${item.id === nextId ? "border-[color:var(--accent)]" : "border-[color:var(--toggle-off)]"}`} />
                          </span>
                          <span className={`text-sm ${item.id === nextId ? "font-semibold" : ""}`}>{t(item.label)}</span>
                        </span>
                        {item.id === nextId
                          ? <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-[color:var(--accent-text)]">{t("Começar")}<Icon name="arrow" size={14} /></span>
                          : <span className="text-[color:var(--text-3)]"><Icon name="arrow" size={14} /></span>}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })()}


      <div className="mt-4 grid grid-cols-2 gap-4">
        <Card>
          <p className="text-xs text-[color:var(--text-2)]">{t("Em aberto")}</p>
          <p className="mt-1.5 text-xl font-semibold">{hideBalance ? "•••••" : fmt(totalOpen)}</p>
          <button onClick={() => open("debts")} className="mt-3 flex min-h-8 items-center gap-1 rounded text-xs font-semibold text-[color:var(--accent-text)] transition hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">{t("Ver dívidas")}<Icon name="arrow" size={14} />
          </button>
        </Card>
        <Card>
          <p className="text-xs text-[color:var(--text-2)]">{t("Reserva em metas")}</p>
          <p className="mt-1.5 text-xl font-semibold">{hideBalance ? "•••" : fmt(goalReserves)}</p>
          <button onClick={() => open("goals")} className="mt-3 flex min-h-8 items-center gap-1 rounded text-xs font-semibold text-[color:var(--accent-text)] transition hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">
            {goals.length} {t(goals.length === 1 ? "meta" : "metas")} <Icon name="arrow" size={14} />
          </button>
        </Card>
      </div>


      <button
        data-tour="add-debt"
        onClick={() => open("budget")}
        className="mt-4 flex w-full items-center justify-between rounded-3xl border border-[color:var(--accent)]/40 bg-[color:var(--accent)] p-5 text-left text-[color:var(--on-accent)] shadow-lg shadow-black/10 transition hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]"
        aria-label={t("Adicionar dívida")}
      >
        <div className="flex items-center gap-4">
          <span className="grid size-11 place-items-center rounded-2xl bg-[color:var(--on-accent)] text-[color:var(--accent)]" aria-hidden="true">
            <Icon name="plus" size={22} />
          </span>
          <span>
            <span className="block text-sm font-bold">{t("Adicionar dívida")}</span>
            <span className="mt-0.5 block text-xs text-[color:var(--on-accent)]">{t("Cadastre um novo compromisso")}</span>
          </span>
        </div>
        <Icon name="arrow" size={19} />
      </button>


      <button
        onClick={() => open("simulation")}
        className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-[color:var(--text)]/10 bg-[color:var(--surface)] p-4 text-left transition hover:bg-[color:var(--text)]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]"
      >
        <Icon name="sim" size={19} />
        <span>
          <span className="block text-sm font-semibold">{t("Simulação")}</span>
          <span className="block text-xs text-[color:var(--text-2)]">{t("Calcule juros e montante")}</span>
        </span>
      </button>


      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("Próximos compromissos")}</h2>
        <button onClick={() => open("debts")} className="rounded text-xs font-semibold text-[color:var(--text-2)] transition hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">{t("Ver todos")}</button>
      </div>
      <ul className="mt-3 space-y-3" aria-label={t("Dívidas em aberto")}>
        {debts.filter(d => !d.paid).slice(0, 3).map(d => (
          <li key={d.id}>
            <button onClick={() => { setSelectedDebt(d); open("payment"); }}
              className="flex w-full items-center justify-between rounded-2xl border border-[color:var(--text)]/10 bg-[color:var(--surface)] p-4 text-left transition hover:bg-[color:var(--text)]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">
              <div>
                <p className="text-sm font-semibold">{d.title}</p>
                <p className="mt-0.5 text-xs text-[color:var(--text-2)]">{t(isOverdue(d) ? "Venceu" : "Vence")} {fmtDate(d.due)} · {catName(d.category)}{d.reminder ? ` · 🔔 ${fmtDate(d.reminder)}` : ""}</p>
              </div>
              <span className="ml-4 flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-semibold">{hideBalance ? "•••" : fmt(d.value)}</span>
                {isOverdue(d) && <StatusPill tone="danger" icon="alert">{t("Atrasada")}</StatusPill>}
              </span>
            </button>
          </li>
        ))}
        {debts.filter(d => !d.paid).length === 0 && (
          <li className="rounded-2xl border border-[color:var(--text)]/10 bg-[color:var(--surface)] p-6 text-center text-sm text-[color:var(--text-3)]">
            {debts.length === 0 ? t("Nenhuma dívida neste mês.") : t("Nenhuma dívida em aberto 🎉")}
          </li>
        )}
      </ul>
    </>
  );

  else if (view === "debts") content = (
    <>
      <Header action={
        <button
          data-tour="debts-add"
          onClick={() => open("budget")}
          aria-label={t("Nova dívida")}
          className="flex items-center gap-2 rounded-2xl bg-[color:var(--accent)] px-4 py-2.5 text-xs font-bold text-[color:var(--on-accent)] shadow-sm transition hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]"
        >
          <Icon name="plus" size={16} />
          {t("Adicionar")}
        </button>
      } />
      <CopyPrompt />
      <div data-tour="debts-search" className="mb-3 flex items-center gap-3 rounded-2xl border border-[color:var(--field-border)] bg-white px-4 text-[color:var(--ink)] transition focus-within:ring-2 focus-within:ring-[color:var(--focus)]">
        <Icon name="search" size={17} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Buscar dívidas")}
          aria-label={t("Buscar dívidas")}
          className="w-full bg-transparent py-3.5 text-sm text-[color:var(--ink)] placeholder:text-[color:var(--placeholder)] outline-none" />
      </div>
      <div data-tour="debts-filters" className="mb-4 space-y-3 rounded-2xl">
        <SegControl options={["all", "open", "paid"]} value={debtFilter} onChange={setDebtFilter} />
        <SegControl options={["all", "today", "week"]} value={periodFilter} onChange={setPeriodFilter} />
      </div>
      <p className={`mb-3 ${sectionLabel}`}>{filteredDebts.length} {t(filteredDebts.length === 1 ? "registro" : "registros")}</p>
      <ul data-tour="debts-list" className="space-y-3 rounded-2xl" aria-label={t("Lista de dívidas")}>
        {filteredDebts.map(d => (
          <li key={d.id}>
            <Card className="flex items-center gap-3 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{d.title}</p>
                <p className="mt-0.5 mb-1.5 text-xs text-[color:var(--text-2)]">{catName(d.category)} · {fmtDate(d.due)}{d.reminder ? ` · 🔔 ${fmtDate(d.reminder)}` : ""}</p>
                {(() => { const st = debtStatus(d); return <StatusPill tone={st.tone} icon={st.icon}>{t(st.label)}</StatusPill>; })()}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold">{hideBalance ? "•••" : fmt(d.value)}</p>
                {d.paid
                  ? <div className="mt-1 text-right">
                    {d.paymentMethod && <span className="block text-xs text-[color:var(--text-3)]">{d.paymentMethod === "Pix" ? "⚡" : d.paymentMethod === "Cartão" ? "💳" : "💵"} {d.paymentMethod === "Pix" ? "Pix" : d.paymentMethod === "Cartão" ? t("Cartão") : t("Dinheiro")}</span>}
                  </div>
                  : <button onClick={() => { setSelectedDebt(d); open("payment"); }}
                    className="mt-2 h-9 rounded-xl border border-[color:var(--field-border)] bg-white px-3.5 text-xs font-bold tracking-wide text-[color:var(--ink)] transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">{t("PAGAR")}</button>}
              </div>
            </Card>
          </li>
        ))}
        {filteredDebts.length === 0 && debts.length === 0 && (
          <li className="flex flex-col items-center gap-3 rounded-3xl border-[1.5px] border-dashed border-[color:var(--toggle-off)] bg-[color:var(--surface)]/60 px-5 py-8 text-center">
            <span className="grid size-16 place-items-center rounded-[22px] bg-[color:var(--accent)]/15 text-[color:var(--accent-text)]" aria-hidden="true"><Icon name="card" size={28} /></span>
            <p className="mt-1 text-lg font-semibold">{t("Nenhuma dívida em")} {MONTHS[activeMonth.month]}</p>
            <p className="text-sm leading-relaxed text-[color:var(--text-2)]">{t("Cadastre contas como aluguel, internet ou cartão. Você define o vencimento e pode receber um lembrete antes do dia.")}</p>
            <button type="button" onClick={() => open("budget")}
              className="mt-2 flex min-h-12 items-center gap-2 rounded-2xl bg-[color:var(--accent)] px-5 text-sm font-bold text-[color:var(--on-accent)] transition hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">
              <Icon name="plus" size={16} />{t("Adicionar primeira dívida")}
            </button>
          </li>
        )}
        {filteredDebts.length === 0 && debts.length > 0 && (
          <li className="rounded-2xl border border-[color:var(--text)]/10 bg-[color:var(--surface)] p-8 text-center text-sm text-[color:var(--text-3)]">{t("Nenhuma dívida encontrada.")}</li>
        )}
      </ul>
    </>
  );

  else if (view === "categories") {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);
    const weekEndStr = new Date(today.getTime() + 6 * 86400000).toISOString().slice(0, 10);

    const inPeriod = (d: Debt) => {
      if (catPeriodFilter === "all") return true;
      const dateStr = d.paid ? (d.paidAt ? d.due : "") : d.due;
      if (!dateStr || !dateStr.includes("-")) return false;
      if (catPeriodFilter === "today") return dateStr === todayStr;
      if (catPeriodFilter === "week") return dateStr >= todayStr && dateStr <= weekEndStr;
      return true;
    };

    const spent = (n: string) => debts.filter(d => d.paid && d.category === n && inPeriod(d)).reduce((s, d) => s + d.value, 0);
    const open2 = (n: string) => debts.filter(d => !d.paid && d.category === n && inPeriod(d)).reduce((s, d) => s + d.value, 0);

    const periodLabel: Record<string, string> = { all: t("este mês"), today: t("hoje"), week: t("esta semana") };

    content = (
      <>
        <Header action={
          <button
            onClick={() => open("catEditor")}
            aria-label={t("Adicionar categoria")}
            className="flex items-center gap-2 rounded-2xl bg-[color:var(--accent)] px-4 py-2.5 text-xs font-bold text-[color:var(--on-accent)] shadow-sm transition hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]"
          >
            <Icon name="plus" size={16} />
            {t("Adicionar")}
          </button>
        } />
        <CopyPrompt />
        <button
          data-tour="cat-add"
          onClick={() => open("catEditor")}
          className="mb-4 flex w-full items-center justify-between rounded-3xl border border-[color:var(--accent)]/40 bg-[color:var(--surface)] p-4 text-left transition hover:bg-[color:var(--accent)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]"
          aria-label={t("Adicionar categoria")}
        >
          <span className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-[color:var(--accent)] text-[color:var(--on-accent)]">
              <Icon name="plus" size={19} />
            </span>
            <span>
              <span className="block text-sm font-bold">{t("Adicionar categoria")}</span>
              <span className="block text-xs text-[color:var(--text-2)]">{t("Crie uma nova categoria ou configure uma existente")}</span>
            </span>
          </span>
          <Icon name="arrow" size={18} />
        </button>
        <div data-tour="cat-period" className="mb-4 rounded-2xl">
          <SegControl options={["all", "today", "week"]} value={catPeriodFilter} onChange={setCatPeriodFilter} />
        </div>
        <p className={`mb-3 ${sectionLabel}`}>{t("Gastos por categoria")} · {periodLabel[catPeriodFilter]}</p>
        <ul data-tour="cat-list" className="space-y-3 rounded-3xl">
          {[...categories, { id: -1, name: "Outros", color: "#d4b8f0", budget: 0 }].map(c => {
            const shown = spent(c.name) + open2(c.name);
            const paidAmt = spent(c.name);
            const openAmt = open2(c.name);
            const isSystem = c.id === -1;
            if (isSystem && shown === 0) return null;
            const rawPct = c.budget > 0 ? Math.round((shown / c.budget) * 100) : 0;
            const pct = Math.min(100, rawPct);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => !isSystem && startEditingCategory(c)}
                  disabled={isSystem}
                  className={`block w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] ${isSystem ? "cursor-default" : "cursor-pointer"}`}
                  aria-label={isSystem ? catName(c.name) : `${t("Editar categoria")} ${catName(c.name)}`}
                >
                  <Card className={!isSystem ? "transition hover:bg-[color:var(--text)]/15" : ""}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="size-3 shrink-0 rounded-full" style={{ background: catColor(c.color) }} aria-hidden="true" />
                        <p className="text-sm font-semibold">{catName(c.name)}</p>
                        {isSystem && <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-2)] px-2 py-0.5 text-xs text-[color:var(--text-3)]">{t("sistema")}</span>}
                      </div>
                      <p className="text-sm font-semibold">{hideBalance ? "•••••" : fmt(shown)}</p>
                    </div>
                    {!hideBalance && openAmt > 0 && paidAmt > 0 && (
                      <div className="mt-2 flex gap-3 text-xs text-[color:var(--text-3)]">
                        <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-[color:var(--accent)] inline-block" />{t("Pago:")} {fmt(paidAmt)}</span>
                        <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-[color:var(--warning)] inline-block" />{t("Em aberto:")} {fmt(openAmt)}</span>
                      </div>
                    )}
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[color:var(--track)]">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: catColor(c.color) }}
                        role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${catName(c.name)}: ${rawPct}% ${t("utilizado")}`} />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[color:var(--text-2)]">
                      {!isSystem
                        ? <><span>{t("Limite:")} {hideBalance ? "•••••" : fmt(c.budget)}</span>{hideBalance ? <span>—</span> : rawPct > 100 ? <StatusPill tone="danger" icon="alert">{rawPct}% · {t("acima do limite")}</StatusPill> : <span>{rawPct}% {t("utilizado")}</span>}</>
                        : <span className="text-[color:var(--text-3)]">{t("Sem limite definido · categoria padrão do sistema")}</span>
                      }
                    </div>
                    {!isSystem && (
                      <p className="mt-3 text-xs font-semibold text-[color:var(--accent-text)]">{t("Clique para configurar ou editar")}</p>
                    )}
                  </Card>
                </button>
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  else if (view === "catEditor") {
    const saveEdit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editCatName || Number(editCatBudget) <= 0) { notify("Preencha nome e limite válido.", true); return; }
      if (!editingCat || !currentUser) return;
      const { data, error } = await supabase.from("categories").update({ name: editCatName.trim(), budget: Number(editCatBudget), color: editCatColor }).eq("id", editingCat.id).eq("user_id", currentUser.id).select("id,name,color,budget").single();
      if (error) { notify(error.message, true); return; }
      setCategories(p => p.map(x => x.id === editingCat.id ? { id: Number(data.id), name: data.name, budget: Number(data.budget), color: data.color } : x));
      setEditingCat(null); notify("Categoria atualizada.");
    };
    content = (
      <>
        <Header backTo="categories" />
        <ul className="mb-4 space-y-2" aria-label={t("Categorias existentes")}>
          {categories.map(c => (
            <li key={c.id}>
              {editingCat?.id === c.id ? (
                <form onSubmit={saveEdit} className="rounded-2xl border border-[color:var(--accent)]/40 bg-[color:var(--surface)] p-4 space-y-3" aria-label={`Editar categoria ${catName(c.name)}`}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-[color:var(--accent-text)]">{t("Editando")} · {catName(c.name)}</p>
                  <input value={editCatName} onChange={e => setEditCatName(e.target.value)} placeholder={t("Nome")} aria-label={t("Nome da categoria")} className={inputWhite} />
                  <input value={editCatBudget} onChange={e => setEditCatBudget(e.target.value)} type="number" min="1" step="0.01" placeholder={t("Limite (R$)")} aria-label={t("Limite mensal")} className={inputWhite} />
                  <div role="radiogroup" aria-label={t("Cor")}>
                    <span className="mb-2 block text-xs text-[color:var(--text-2)]">{t("Cor:")}</span>
                    <div className="grid grid-cols-5 gap-1.5">
                      {CATEGORY_PALETTE.map(({ pastel: cor, name }) => (
                        <button type="button" key={cor} onClick={() => setEditCatColor(cor)}
                          role="radio" aria-checked={editCatColor === cor}
                          className={`group flex flex-col items-center gap-1.5 rounded-xl py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] ${editCatColor === cor ? "font-bold text-[color:var(--text)]" : "font-medium text-[color:var(--text-2)]"}`}>
                          <span className={`grid size-10 place-items-center rounded-full transition ${editCatColor === cor ? "ring-2 ring-[color:var(--text)] ring-offset-2 ring-offset-[color:var(--surface)]" : ""}`}
                            style={{ background: catColor(cor), color: darkMode ? "#06182B" : "#FFFFFF" }} aria-hidden="true">
                            {editCatColor === cor && <Icon name="check" size={18} />}
                          </span>
                          {t(name)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 rounded-2xl bg-[color:var(--accent)] py-2.5 text-xs font-bold text-[color:var(--on-accent)] transition hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">{t("Salvar")}</button>
                    <button type="button" onClick={() => setEditingCat(null)} className="flex-1 rounded-2xl border border-[color:var(--text)]/20 py-2.5 text-xs font-semibold text-[color:var(--text-2)] transition hover:bg-[color:var(--text)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">{t("Cancelar")}</button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between rounded-2xl border border-[color:var(--text)]/10 bg-[color:var(--surface)] p-4">
                  <div className="flex items-center gap-3">
                    <span className="size-4 shrink-0 rounded-full" style={{ background: catColor(c.color) }} aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold">{catName(c.name)}</p>
                      <p className="text-xs text-[color:var(--text-2)]">{t("Limite:")} {fmt(c.budget)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEditingCategory(c)}
                      aria-label={`Editar categoria ${catName(c.name)}`}
                      className="grid size-9 place-items-center rounded-xl text-[color:var(--text-3)] transition hover:bg-[color:var(--text)]/10 hover:text-[color:var(--accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                      </svg>
                    </button>
                    <button onClick={async () => { if (!currentUser) return; const { error } = await supabase.from("categories").delete().eq("id", c.id).eq("user_id", currentUser.id); if (error) { notify(error.message, true); return; } setCategories(p => p.filter(x => x.id !== c.id)); notify("Categoria removida."); }}
                      aria-label={`Remover categoria ${catName(c.name)}`}
                      className="grid size-9 place-items-center rounded-xl text-[color:var(--text-3)] transition hover:bg-[color:var(--text)]/10 hover:text-[color:var(--warning)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={addCategory} className={`${card} space-y-3`} aria-label={t("Criar nova categoria")}>
          <p className="text-sm font-semibold">{t("Nova categoria")}</p>
          <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder={t("Nome da categoria")} aria-label={t("Nome")} className={inputWhite} />
          <input value={newCatBudget} onChange={e => setNewCatBudget(e.target.value)} type="number" min="1" step="0.01" placeholder={t("Limite mensal (R$)")} aria-label={t("Limite mensal")} className={inputWhite} />
          <div role="radiogroup" aria-label={t("Cor da categoria")}>
            <span className="mb-2 block text-xs text-[color:var(--text-2)]">{t("Cor:")}</span>
            <div className="grid grid-cols-5 gap-1.5">
              {CATEGORY_PALETTE.map(({ pastel: cor, name }) => (
                <button type="button" key={cor} onClick={() => setNewCatColor(cor)}
                  role="radio" aria-checked={newCatColor === cor}
                  className={`group flex flex-col items-center gap-1.5 rounded-xl py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] ${newCatColor === cor ? "font-bold text-[color:var(--text)]" : "font-medium text-[color:var(--text-2)]"}`}>
                  <span className={`grid size-10 place-items-center rounded-full transition ${newCatColor === cor ? "ring-2 ring-[color:var(--text)] ring-offset-2 ring-offset-[color:var(--surface)]" : ""}`}
                    style={{ background: catColor(cor), color: darkMode ? "#06182B" : "#FFFFFF" }} aria-hidden="true">
                    {newCatColor === cor && <Icon name="check" size={18} />}
                  </span>
                  {t(name)}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className={btnAccent}>{t("Criar categoria")}</button>
        </form>
      </>
    );
  }

  else if (view === "history") {
    const paid = debts.filter(d => d.paid && d.paidAt);
    const grouped = paid.reduce<Record<string, Debt[]>>((acc, d) => {
      acc[d.paidAt!] = acc[d.paidAt!] ? [...acc[d.paidAt!], d] : [d]; return acc;
    }, {});
    const dates = Object.keys(grouped).reverse();
    content = (
      <>
        <Header />
        <CopyPrompt />
        <Card className="mb-4">
          <p className={sectionLabel}>{t("Total pago")} · {MONTHS[activeMonth.month]}</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight">{hideBalance ? "•••••" : fmt(totalPaid)}</p>
          <div className="mt-4 flex justify-between text-xs text-[color:var(--text-2)]">
            <span>{t("Orçamento:")} {hideBalance ? "•••••" : fmt(budget)}</span>
            <span>{t("Restante:")} {hideBalance ? "•••••" : fmt(available)}</span>
          </div>
        </Card>
        {paid.length === 0 ? (
          <div className="rounded-2xl border border-[color:var(--text)]/10 bg-[color:var(--surface)] p-10 text-center">
            <p className="text-sm text-[color:var(--text-2)]">{t("Nenhum pagamento em")} {MONTHS[activeMonth.month]}.</p>
            <p className="mt-1 text-xs text-[color:var(--text-3)]">{t("Pagamentos aparecerão aqui após registrados.")}</p>
          </div>
        ) : (
          <Card>
            {dates.map((date, i) => (
              <div key={date} className={i > 0 ? "mt-6 border-t border-[color:var(--text)]/15 pt-5" : ""}>
                <p className={sectionLabel}>{date}</p>
                {grouped[date].map(d => (
                  <div key={d.id} className="mt-4 flex items-start justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium">{d.title}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-[color:var(--text-3)]">{catName(d.category)}</span>
                        {d.paymentMethod && (
                          <span className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] px-2 py-0.5 text-xs font-semibold text-[color:var(--text-2)]">
                            {d.paymentMethod === "Pix" ? "⚡" : d.paymentMethod === "Cartão" ? "💳" : "💵"} {d.paymentMethod === "Pix" ? "Pix" : d.paymentMethod === "Cartão" ? t("Cartão") : t("Dinheiro")}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 font-semibold">− {hideBalance ? "•••••" : fmt(d.value)}</span>
                  </div>
                ))}
              </div>
            ))}
          </Card>
        )}
      </>
    );
  }

  else if (view === "budget") content = (
    <>
      <Header backTo="debts" />
      <form onSubmit={addDebt} className={`${card} space-y-4`} aria-label={t("Formulário de nova dívida")}>
        <p className="text-base font-semibold">{t("Adicionar dívida")}</p>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[color:var(--text-2)]">{t("Título")}</span>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={t("Nome da dívida")} aria-required="true" className={inputWhite} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[color:var(--text-2)]">{t("Valor (R$)")}</span>
          <input value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} type="number" min="0.01" step="0.01" placeholder={language === "en-US" ? "0.00" : "0,00"} aria-required="true" className={inputWhite} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[color:var(--text-2)]">{t("Vencimento")}</span>
          <input value={form.due} onChange={e => setForm({ ...form, due: maskDateInput(e.target.value, language) })} type="text" inputMode="numeric" placeholder={language === "en-US" ? "MM/DD/YYYY" : "DD/MM/AAAA"} maxLength={10} aria-required="true" className={inputWhite} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[color:var(--text-2)]">{t("Categoria")}</span>
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inputWhite}>
            <option value="">{t("Selecionar categoria")}</option>
            {categories.map(c => <option key={c.id} value={c.name}>{catName(c.name)}</option>)}
            <option value="Outros">{t("Outros")}</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-[color:var(--text-2)]">
            <Icon name="bell" size={12} />{t("Lembrete (opcional)")}</span>
          <input value={form.reminder} onChange={e => setForm({ ...form, reminder: maskDateInput(e.target.value, language) })} type="text" inputMode="numeric" placeholder={language === "en-US" ? "MM/DD/YYYY" : "DD/MM/AAAA"} maxLength={10} className={inputWhite} />
          {form.due && <p className="mt-1 text-xs text-[color:var(--text-3)]">{t("Lembrete deve ser antes ou na data de vencimento.")}</p>}
        </label>
        <button type="submit" className={btnAccent}>{t("Salvar dívida")}</button>
      </form>
    </>
  );

  else if (view === "goals") content = (
    <>
      <Header />


      {depositGoalId !== null && (() => {
        const g = goals.find(x => x.id === depositGoalId)!;
        const monthReserved = goalDeposits[g.id]?.[monthKey] ?? 0;
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label={t("Movimentar meta")}>
            <form onSubmit={handleGoalDeposit} className={`${card} w-full max-w-md space-y-4`}>
              <p className="text-sm font-semibold">{g.label}</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setDepositMode("add")}
                  className={`rounded-2xl border py-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] ${depositMode === "add" ? "border-[color:var(--accent)] bg-[color:var(--accent)]/20 text-[color:var(--accent-text)]" : "border-[color:var(--field-border)] text-[color:var(--text-2)] hover:bg-[color:var(--text)]/10"}`}>{t("+ Depositar")}</button>
                <button type="button" onClick={() => setDepositMode("rescue")}
                  className={`rounded-2xl border py-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] ${depositMode === "rescue" ? "border-[color:var(--warning)] bg-[color:var(--warning)]/20 text-[color:var(--warning)]" : "border-[color:var(--field-border)] text-[color:var(--text-2)] hover:bg-[color:var(--text)]/10"}`}>{t("− Resgatar")}</button>
              </div>
              <div className="rounded-2xl bg-[color:var(--surface)] px-4 py-3 text-xs text-[color:var(--text-2)] space-y-0.5">
                {depositMode === "add"
                  ? <><span>{t("Disponível neste mês:")}</span><span className="font-semibold text-[color:var(--text-2)]">{fmt(available)}</span></>
                  : <><span>{t("Reservado neste mês:")}</span><span className="font-semibold text-[color:var(--text-2)]">{fmt(monthReserved)}</span></>
                }
              </div>
              <input value={depositAmount} onChange={e => setDepositAmount(e.target.value)}
                type="number" min="0.01" step="0.01" placeholder={t("Valor (R$)")} aria-label={t("Valor da movimentação")}
                className={inputWhite} autoFocus />
              <div className="flex gap-2">
                <button type="button" onClick={() => { setDepositGoalId(null); setDepositAmount(""); }}
                  className={btnGhost}>{t("Cancelar")}</button>
                <button type="submit" className={depositMode === "add" ? btnAccent : "flex w-full items-center justify-center rounded-2xl bg-[color:var(--warning)] py-3.5 text-sm font-bold text-[color:var(--on-accent)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface)] active:scale-[.98]"}>
                  {depositMode === "add" ? t("Reservar") : t("Resgatar")}
                </button>
              </div>
            </form>
          </div>
        );
      })()}

      <ul data-tour="goals-list" className="mb-4 space-y-3 rounded-3xl" aria-label={t("Lista de metas")}>
        {goals.map(g => {
          const accumulated = goalTotal(g);
          const monthReserved = goalDeposits[g.id]?.[monthKey] ?? 0;
          const pct = Math.min(100, g.target > 0 ? Math.round((accumulated / g.target) * 100) : 0);
          const done = accumulated >= g.target;
          return (
            <li key={g.id}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{g.label}</p>
                    <p className="mt-0.5 text-xs text-[color:var(--text-2)]">{fmt(accumulated)} {t("de")} {fmt(g.target)}</p>
                    {monthReserved > 0 && (
                      <p className="mt-0.5 text-xs text-[color:var(--accent-text)]">{fmt(monthReserved)} {t("reservado neste mês")}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {done
                      ? <span className="rounded-full bg-[color:var(--accent)]/20 px-2 py-0.5 text-xs font-bold text-[color:var(--accent-text)]">{t("Concluída")}</span>
                      : <span className="text-xs font-bold text-[color:var(--accent-text)]">{pct}%</span>
                    }
                    <button onClick={async () => { if (!currentUser) return; const { error } = await supabase.from("goals").delete().eq("id", g.id).eq("user_id", currentUser.id); if (error) { notify(error.message, true); return; } setGoals(p => p.filter(x => x.id !== g.id)); setGoalDeposits(p => { const n = { ...p }; delete n[g.id]; return n; }); notify("Meta removida."); }}
                      aria-label={`Remover meta ${g.label}`}
                      className="grid size-8 place-items-center rounded-xl text-[color:var(--text-3)] transition hover:bg-[color:var(--text)]/10 hover:text-[color:var(--warning)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[color:var(--track)]">
                  <div className={`h-full rounded-full transition-all duration-500 ${done ? "bg-[color:var(--positive)]" : "bg-[color:var(--accent)]"}`} style={{ width: `${pct}%` }}
                    role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.label}: ${pct}%`} />
                </div>
                {!done && (
                  <button onClick={() => { setDepositGoalId(g.id); setDepositAmount(""); setDepositMode("add"); }}
                    className="mt-3 flex items-center gap-1.5 rounded text-xs font-semibold text-[color:var(--accent-text)] transition hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">{t("Depositar / Resgatar")}<Icon name="arrow" size={13} />
                  </button>
                )}
              </Card>
            </li>
          );
        })}
        {goals.length === 0 && (
          <li className="flex flex-col items-center gap-3 rounded-3xl border-[1.5px] border-dashed border-[color:var(--toggle-off)] bg-[color:var(--surface)]/60 px-5 py-8 text-center">
            <span className="grid size-16 place-items-center rounded-[22px] bg-[color:var(--accent)]/15 text-[color:var(--accent-text)]" aria-hidden="true"><Icon name="target" size={28} /></span>
            <p className="mt-1 text-lg font-semibold">{t("Nenhuma meta criada ainda.")}</p>
            <p className="text-sm leading-relaxed text-[color:var(--text-2)]">{t("Metas ajudam a juntar dinheiro para algo importante, como uma viagem ou uma reserva de emergência.")}</p>
            <button type="button" onClick={() => { const el = document.getElementById("goal-label"); el?.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" }); el?.focus({ preventScroll: true }); }}
              className="mt-2 flex min-h-12 items-center gap-2 rounded-2xl bg-[color:var(--accent)] px-5 text-sm font-bold text-[color:var(--on-accent)] transition hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">
              <Icon name="plus" size={16} />{t("Criar primeira meta")}
            </button>
          </li>
        )}
      </ul>


      {goals.length > 0 && goalReserves > 0 && (
        <Card className="mb-4">
          <p className="text-xs font-semibold text-[color:var(--text-2)]">{t("Total reservado neste mês")}</p>
          <p className="mt-1 text-lg font-semibold">{fmt(goalReserves)}</p>
          <p className="mt-0.5 text-xs text-[color:var(--text-3)]">{t("Deduzido do seu saldo disponível de")} {fmt(budget)}</p>
        </Card>
      )}

      <form data-tour="goals-form" onSubmit={addGoal} className={`${card} space-y-3`} aria-label={t("Criar nova meta")}>
        <p className="text-sm font-semibold">{t("Nova meta")}</p>
        <input id="goal-label" value={newGoalLabel} onChange={e => setNewGoalLabel(e.target.value)} placeholder={t("Descrição")} aria-label={t("Descrição da meta")} className={inputWhite} />
        <input value={newGoalTarget} onChange={e => setNewGoalTarget(e.target.value)} type="number" min="1" step="0.01" placeholder={t("Valor alvo (R$)")} aria-label={t("Valor alvo")} className={inputWhite} />
        <button type="submit" className={btnAccent}>{t("Criar meta")}</button>
      </form>
    </>
  );

  else if (view === "simulation") content = (
    <>
      <Header />
      <div data-tour="sim-about" className="mb-4 rounded-3xl">
      <Card>
        <p className={`${sectionLabel} mb-1`}>{t("Como funciona")}</p>
        <p className="text-sm leading-relaxed text-[color:var(--text-2)]">{t("Calcule o montante final de um valor aplicado com juros compostos mensais.")}</p>
      </Card>
      </div>
      <form data-tour="sim-form" onSubmit={runSim} className={`${card} space-y-4`} aria-label={t("Parâmetros da simulação")}>
        <p className="text-sm font-semibold">{t("Parâmetros")}</p>
        {[
          { label: t("Valor inicial (R$)"), val: simPrincipal, set: setSimPrincipal, ph: t("Ex.: 1000"), min: "0.01", step: "0.01" },
          { label: t("Taxa de juros mensal (%)"), val: simRate, set: setSimRate, ph: t("Ex.: 1.2"), min: "0", step: "0.01" },
          { label: t("Prazo (meses)"), val: simMonths, set: setSimMonths, ph: t("Ex.: 12"), min: "1", step: "1" },
        ].map(f => (
          <label key={f.label} className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[color:var(--text-2)]">{f.label}</span>
            <input value={f.val} onChange={e => f.set(e.target.value)} required type="number" min={f.min} step={f.step} placeholder={f.ph} className={inputWhite} />
          </label>
        ))}
        <button type="submit" className={btnAccent}>{t("Calcular")}</button>
      </form>
      {simResult && (
        <Card className="mt-4">
          <p className={`${sectionLabel} mb-4`}>{t("Resultado")}</p>
          <dl className="space-y-3">
            <div className="flex justify-between text-sm">
              <dt className="text-[color:var(--text-2)]">{t("Valor inicial")}</dt>
              <dd className="font-semibold">{fmt(Number(simPrincipal))}</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-[color:var(--text-2)]">{t("Juros acumulados")}</dt>
              <dd className="font-semibold text-[color:var(--warning)]">{fmt(simResult.juros)}</dd>
            </div>
            <div className="flex justify-between border-t border-[color:var(--text)]/15 pt-3">
              <dt className="font-semibold">{t("Montante final")}</dt>
              <dd className="text-xl font-semibold text-[color:var(--accent-text)]">{fmt(simResult.montante)}</dd>
            </div>
          </dl>
        </Card>
      )}
    </>
  );

  else if (view === "notifications") content = (
    <>
      <Header backTo="settings" />
      <Card className="mb-4">
        <div className="flex items-start gap-4">
          <div className={`grid size-12 shrink-0 place-items-center rounded-2xl ${notificationsEnabled ? "bg-[color:var(--accent)]/15 text-[color:var(--accent-text)]" : "bg-[color:var(--surface)] text-[color:var(--text-3)]"}`}>
            <Icon name="bell" size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t("Lembretes de vencimento")}</p>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-2)]">{t("Os lembretes cadastrados nas dívidas ficam ativos automaticamente enquanto a dívida estiver em aberto.")}</p>
          </div>
          <button type="button" onClick={async () => { const next = !notificationsEnabled; setNotificationsEnabled(next); if (currentUser) { const { error } = await supabase.from("profiles").update({ notifications_enabled: next }).eq("id", currentUser.id); if (error) notify(error.message, true); } }} role="switch" aria-checked={notificationsEnabled} aria-label={t("Lembretes de vencimento")}
            className={`relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface)] ${notificationsEnabled ? "bg-[color:var(--accent)]" : "bg-[color:var(--toggle-off)]"}`}>
            <span className={`absolute top-1 size-[22px] rounded-full bg-[color:var(--knob)] shadow transition-all ${notificationsEnabled ? "left-[26px]" : "left-1"}`} />
          </button>
        </div>
        <div className="mt-4 rounded-2xl bg-[color:var(--surface)] p-3 text-xs text-[color:var(--text-2)]">
          <strong className="text-[color:var(--text-2)]">{activeReminderCount}</strong> {t("lembrete(s) ativo(s) para datas futuras ou de hoje.")}</div>
      </Card>

      {typeof window !== "undefined" && "Notification" in window && (
        <Card className="mb-4">
          <div className="flex items-center gap-3">
            <Icon name="bell" size={18} />
            <div className="flex-1">
              <p className="text-sm font-semibold">{t("Notificações do dispositivo")}</p>
              <p className="text-xs text-[color:var(--text-2)]">{notificationPermission === "granted" ? t("Ativadas neste navegador") : notificationPermission === "denied" ? t("Bloqueadas pelo navegador") : t("Permita alertas para receber os lembretes")}</p>
            </div>
            {notificationPermission !== "granted" && notificationPermission !== "denied" && (
              <button type="button" onClick={async () => {
                const permission = await Notification.requestPermission();
                setNotificationPermission(permission);
                if (permission === "granted") notify("Notificações ativadas.");
              }} className="min-h-11 rounded-xl bg-[color:var(--accent)] px-4 py-2 text-xs font-bold text-[color:var(--on-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface)]">{t("Ativar")}</button>
            )}
          </div>
        </Card>
      )}

      <p className={`${sectionLabel} mb-3`}>{t("Lembretes cadastrados")}</p>
      <div className="space-y-2">
        {reminderItems.length === 0 && (
          <Card><p className="text-center text-sm text-[color:var(--text-2)]">{t("Nenhum lembrete ativo. Adicione um lembrete ao cadastrar uma dívida.")}</p></Card>
        )}
        {reminderItems.map(item => (
          <button key={`${item.monthKey}-${item.debt.id}-${item.kind}`} onClick={() => { setActiveMonth({ month: Number(item.monthKey.slice(5, 7)) - 1, year: Number(item.monthKey.slice(0, 4)) }); setSelectedDebt(item.debt); open("debts"); }} className={rowBtn}>
            <div className="flex min-w-0 items-center gap-3">
              <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${item.status === "hoje" ? "bg-[color:var(--warning)]/15 text-[color:var(--warning)]" : item.status === "atrasado" ? "bg-[color:var(--danger)]/10 text-[color:var(--danger)]" : "bg-[color:var(--surface)] text-[color:var(--text-2)]"}`}>
                <Icon name="bell" size={17} />
              </div>
              <div className="min-w-0 text-left">
                <p className="truncate text-sm font-semibold">{item.debt.title}</p>
                <p className="text-xs text-[color:var(--text-3)]">{item.kind === "lembrete" ? t("Lembrete") : t("Vencimento")} · {fmtDate(item.date)} · {fmt(item.debt.value)}</p>
              </div>
            </div>
            <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold uppercase tracking-wide ${item.status === "hoje" ? "bg-[color:var(--warning)]/15 text-[color:var(--warning)]" : item.status === "atrasado" ? "bg-[color:var(--danger)]/10 text-[color:var(--danger)]" : "bg-[color:var(--surface)] text-[color:var(--text-2)]"}`}>
              {item.status === "hoje" ? t("Hoje") : item.status === "atrasado" ? t("Atrasado") : t("Ativo")}
            </span>
          </button>
        ))}
      </div>
    </>
  );

  else if (view === "help") {
    const faqs = [
      { q: "Como o saldo disponível é calculado?", a: "É o orçamento do mês menos as dívidas que você já pagou e o que você reservou em metas. Dívidas em aberto não descontam do saldo; elas aparecem na barra de progresso como parte do orçamento." },
      { q: "O que acontece quando reservo dinheiro numa meta?", a: "O valor sai do saldo disponível do mês em que foi reservado e soma ao progresso da meta. Se precisar, você pode resgatar o que reservou naquele mês." },
      { q: "Por que o app oferece copiar dívidas ao mudar de mês?", a: "Ao abrir um mês que ainda não tem dados, o Aoshiro mostra as dívidas que ficaram em aberto no mês anterior e oferece copiá-las, com o vencimento um mês à frente. Você também pode começar do zero." },
      { q: "Como funcionam os lembretes?", a: "Ao cadastrar uma dívida, você pode escolher uma data de lembrete até o dia do vencimento. Com as notificações ativadas em Ajustes › Notificações, o navegador avisa no dia." },
      { q: "Cada mês tem um orçamento diferente?", a: "Sim. O orçamento é salvo por mês. Em Ajustes você altera o orçamento do mês selecionado na tela inicial." },
    ];
    content = (
      <>
        <Header backTo="settings" />
        <p className={`${sectionLabel} mb-3`}>{t("Tutoriais")}</p>
        <ul className="mb-6 space-y-2">
          {TOUR_IDS.map(id => (
            <li key={id}>
              <button type="button" onClick={() => startTour(id)} className={rowBtn}>
                <span className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[color:var(--accent)]/15 text-[color:var(--accent-text)]" aria-hidden="true"><Icon name="play" size={14} /></span>
                  <span>
                    <span className="block text-sm font-semibold">{t(TOURS[id].name)}</span>
                    <span className="mt-0.5 block text-xs text-[color:var(--text-2)]">{TOURS[id].steps.length} {t("passos")}</span>
                  </span>
                </span>
                {tutorials.seen[id]
                  ? <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-[color:var(--positive)]"><Icon name="check" size={13} />{t("Visto")}</span>
                  : <Icon name="arrow" size={16} />}
              </button>
            </li>
          ))}
          {tutorials.checklistHidden && (
            <li>
              <button type="button" onClick={() => { updateTutorials(p => ({ ...p, checklistHidden: false })); open("home"); }} className={rowBtn}>
                <span className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[color:var(--accent)]/15 text-[color:var(--accent-text)]" aria-hidden="true"><Icon name="sparkle" size={16} /></span>
                  <span>
                    <span className="block text-sm font-semibold">{t("Mostrar Primeiros passos")}</span>
                    <span className="mt-0.5 block text-xs text-[color:var(--text-2)]">{t("Volta a exibir a lista na tela inicial")}</span>
                  </span>
                </span>
                <Icon name="arrow" size={16} />
              </button>
            </li>
          )}
        </ul>
        <p className={`${sectionLabel} mb-3`}>{t("Perguntas frequentes")}</p>
        <ul className="space-y-2">
          {faqs.map((f, i) => {
            const expanded = openFaq === i;
            return (
              <li key={f.q} className="rounded-2xl border border-[color:var(--text)]/10 bg-[color:var(--surface)]">
                <h3>
                  <button type="button" onClick={() => setOpenFaq(expanded ? null : i)} aria-expanded={expanded} aria-controls={`faq-${i}`} id={`faq-q-${i}`}
                    className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition hover:bg-[color:var(--text)]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">
                    {t(f.q)}
                    <span className={`shrink-0 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}><Icon name="chev" size={16} /></span>
                  </button>
                </h3>
                {expanded && (
                  <p id={`faq-${i}`} role="region" aria-labelledby={`faq-q-${i}`} className="px-4 pb-4 text-sm leading-relaxed text-[color:var(--text-2)]">{t(f.a)}</p>
                )}
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  else if (view === "settings") content = (
    <>
      <Header />
      {currentUser && (
        <Card className="mb-4 flex items-center gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[color:var(--accent)]/10 text-lg font-bold text-[color:var(--accent-text)]" aria-hidden="true">
            {currentUser.name[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{currentUser.name}</p>
            <p className="truncate text-xs text-[color:var(--text-2)]">{currentUser.email}</p>
          </div>
        </Card>
      )}
      <div className="space-y-3">
        {(() => {
          const draftValue = budgetDraft ?? (budget > 0 ? String(budget) : "");
          const draftNumber = Number(draftValue.replace(",", "."));
          const isDirty = budgetDraft !== null && draftNumber !== budget;
          const isValid = Number.isFinite(draftNumber) && draftNumber > 0;
          const saveBudget = async (e: React.FormEvent) => {
            e.preventDefault();
            if (!isDirty || budgetSaving) return;
            if (!isValid) { notify("Informe um orçamento mensal maior que zero.", true); return; }
            setBudgetSaving(true);
            try {
              await persistBudget(draftNumber);
              setBudgetDraft(null);
              notify("Orçamento atualizado.");
            } catch (error) {
              notify(error instanceof Error ? error.message : "Erro ao atualizar orçamento.", true);
            } finally {
              setBudgetSaving(false);
            }
          };
          return (
            <form onSubmit={saveBudget} noValidate className="rounded-2xl border border-[color:var(--text)]/10 bg-[color:var(--surface)] p-4">
              <label htmlFor="settings-budget" className="block text-sm font-semibold">{t("Orçamento mensal")}</label>
              <p className="mb-3 mt-0.5 text-xs text-[color:var(--text-2)]">{t("Vale para")} {MONTHS[activeMonth.month]} {activeMonth.year}</p>
              <div className="flex items-stretch gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-[color:var(--field-border)] bg-white px-4 text-[color:var(--ink)] transition focus-within:ring-2 focus-within:ring-[color:var(--focus)]">
                  <span className="shrink-0 text-sm font-semibold text-[color:var(--placeholder)]" aria-hidden="true">{CURRENCIES[currency].symbol}</span>
                  <input id="settings-budget" type="number" inputMode="decimal" min="0.01" step="0.01" enterKeyHint="done"
                    value={draftValue}
                    placeholder={language === "en-US" ? "0.00" : "0,00"}
                    onChange={e => setBudgetDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Escape") setBudgetDraft(null); }}
                    className="w-full min-w-0 bg-transparent py-3 text-lg font-semibold text-[color:var(--ink)] placeholder:text-[color:var(--placeholder)] outline-none" />
                </div>
                <button type="submit" disabled={!isDirty || budgetSaving}
                  className={`flex shrink-0 items-center justify-center gap-1.5 rounded-2xl px-5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] active:scale-[.98] ${isDirty ? "bg-[color:var(--accent)] text-[color:var(--on-accent)] hover:bg-[color:var(--accent-hover)]" : "cursor-default border border-[color:var(--border)] text-[color:var(--positive)]"}`}>
                  {budgetSaving ? t("Salvando…") : isDirty ? t("Salvar") : <><Icon name="check" size={15} />{t("Salvo")}</>}
                </button>
              </div>
              {isDirty && (
                <p className="mt-2 text-xs text-[color:var(--text-2)]">
                  {t("Alteração não salva.")}{" "}
                  <button type="button" onClick={() => setBudgetDraft(null)} className="rounded font-semibold underline underline-offset-4 hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]">{t("Desfazer")}</button>
                </p>
              )}
            </form>
          );
        })()}
        <button onClick={async () => { const next = !darkMode; setDarkMode(next); if (currentUser) { const { error } = await supabase.from("profiles").update({ dark_mode: next }).eq("id", currentUser.id); if (error) notify(error.message, true); } }} className={rowBtn} role="switch" aria-checked={darkMode}>
          <div className="flex items-center gap-3">
            <Icon name={darkMode ? "sun" : "moon"} size={18} />
            <div>
              <p className="text-sm font-semibold">{t("Modo escuro")}</p>
              <p className="text-xs text-[color:var(--text-2)]">{darkMode ? t("Ativado") : t("Desativado")}</p>
            </div>
          </div>
          <div className={`relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors duration-300 ${darkMode ? "bg-[color:var(--accent)]" : "bg-[color:var(--toggle-off)]"}`} aria-hidden="true">
            <span className={`absolute top-1 size-[22px] rounded-full bg-[color:var(--knob)] shadow transition-all duration-300 ${darkMode ? "left-[26px]" : "left-1"}`} />
          </div>
        </button>
        <div className="rounded-2xl border border-[color:var(--text)]/10 bg-[color:var(--surface)] p-4">
          <div className="mb-3 flex items-center gap-3">
            <Icon name="card" size={18} />
            <p className="text-sm font-semibold">{t("Moeda padrão")}</p>
          </div>
          <div className="flex gap-2" role="group" aria-label={t("Selecionar moeda")}>
            {(Object.entries(CURRENCIES) as [Currency, (typeof CURRENCIES)[Currency]][]).map(([k, v]) => (
              <button key={k} onClick={async () => { setCurrency(k); if (currentUser) { const { error } = await supabase.from("profiles").update({ currency: k }).eq("id", currentUser.id); if (error) { notify(error.message, true); return; } } notify(`Moeda: ${k}`); }}
                aria-pressed={currency === k}
                className={`min-h-11 flex-1 rounded-xl py-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] ${currency === k ? "bg-[color:var(--accent)] font-bold text-[color:var(--on-accent)]" : "border border-[color:var(--border)] bg-[color:var(--surface-2)] text-[color:var(--text-2)] hover:bg-[color:var(--text)]/10"}`}>
                {v.symbol} {k}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--text)]/10 bg-[color:var(--surface)] p-4">
          <div className="mb-3 flex items-center gap-3">
            <Icon name="globe" size={18} />
            <p className="text-sm font-semibold">{t("Idioma")}</p>
          </div>
          <div className="space-y-2" role="group" aria-label={t("Selecionar idioma")}>
            {(["pt-BR", "en-US", "es-ES"] as Language[]).map(k => (
              <button key={k} onClick={async () => { setLanguage(k); localStorage.setItem("aoshiro_language", k); if (currentUser) { const { error } = await supabase.from("profiles").update({ language: k }).eq("id", currentUser.id); if (error) notify(error.message, true); } }}
                aria-pressed={language === k}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] ${language === k ? "bg-[color:var(--accent)] font-semibold text-[color:var(--on-accent)]" : "border border-[color:var(--border)] bg-[color:var(--surface-2)] text-[color:var(--text-2)] hover:bg-[color:var(--text)]/10"}`}>
                {t(k === "pt-BR" ? "Português (Brasil)" : k === "en-US" ? "English (US)" : "Español")}
                {language === k && <Icon name="check" size={15} />}
              </button>
            ))}
          </div>
        </div>
        {([["help", "Tutoriais e ajuda", "Guias passo a passo e perguntas frequentes"], ["bell", "Notificações", "Lembretes de vencimento"], ["user", "Suporte", "Falar com a equipe"]] as const).map(([ic, a, b]) => (
          <button key={a} onClick={() => a === "Notificações" ? open("notifications") : a === "Tutoriais e ajuda" ? open("help") : notify(`${t(a)}: ${t("em breve.")}`)} className={rowBtn}>
            <div className="flex items-center gap-3">
              <Icon name={ic} size={18} />
              <div>
                <p className="text-sm font-semibold">{t(a)}</p>
                <p className="text-xs text-[color:var(--text-2)]">{t(b)}</p>
              </div>
            </div>
            <Icon name="arrow" size={16} />
          </button>
        ))}
      </div>
      <button onClick={async () => { await supabase.auth.signOut(); setCurrentUser(null); open("login"); }} className={`mt-6 ${btnGhost}`}>{t("Sair da conta")}</button>
      <footer className="mt-10 flex flex-col items-center gap-2 pb-2 text-center">
        <Logo className="h-auto w-32" />
        <p className="text-xs text-[color:var(--text-3)]">{t("Versão")} 1.0</p>
      </footer>
    </>
  );

  else {
    const methods = [
      { id: "Pix", label: "Pix", sub: "Transferência instantânea", emoji: "⚡" },
      { id: "Cartão", label: "Cartão", sub: "Crédito ou débito", emoji: "💳" },
      { id: "Dinheiro", label: "Dinheiro", sub: "Pagamento em espécie", emoji: "💵" },
    ];
    content = (
      <>
        <Header backTo="debts" />
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[color:var(--warning)]/50 bg-[color:var(--surface)] px-4 py-3">
          <span className="mt-0.5 text-base" aria-hidden="true">ℹ️</span>
          <p className="text-xs leading-relaxed text-[color:var(--warning)]">{t("Esta tela é apenas para")} <strong>{t("registrar")}</strong> {t("como o pagamento foi feito. Nenhuma cobrança ou transferência é realizada aqui.")}
          </p>
        </div>

        <Card className="mb-4">
          <p className={sectionLabel}>{t("Dívida selecionada")}</p>
          <h2 className="mt-2 text-xl font-semibold">{selectedDebt?.title}</h2>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-[color:var(--accent-text)]">{selectedDebt && fmt(selectedDebt.value)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-1 text-xs text-[color:var(--text-2)]">{selectedDebt?.category}</span>
            <span className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-1 text-xs text-[color:var(--text-2)]">{t("Vence")} {fmtDate(selectedDebt?.due ?? "")}</span>
            {selectedDebt?.reminder && <span className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-1 text-xs text-[color:var(--text-2)]">🔔 {fmtDate(selectedDebt.reminder)}</span>}
          </div>
        </Card>

        <p className={`mb-3 ${sectionLabel}`}>{t("Como foi pago")}</p>
        <div className="mb-4 space-y-2" role="radiogroup" aria-label={t("Selecionar forma de pagamento")}>
          {methods.map(m => {
            const active = payMethod === m.id;
            return (
              <button key={m.id} type="button" onClick={() => setPayMethod(m.id)}
                role="radio" aria-checked={active}
                className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] ${active ? "border-[color:var(--accent)] bg-[color:var(--surface-2)] ring-1 ring-[color:var(--accent)]" : "border-[color:var(--text)]/10 bg-[color:var(--surface)] hover:bg-[color:var(--text)]/15"}`}>
                <span className="text-2xl" aria-hidden="true">{m.emoji}</span>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${active ? "text-[color:var(--accent-text)]" : "text-[color:var(--text)]"}`}>{t(m.label)}</p>
                  <p className="text-xs text-[color:var(--text-3)]">{t(m.sub)}</p>
                </div>
                <div className={`grid size-5 place-items-center rounded-full border-2 transition ${active ? "border-[color:var(--accent)] bg-[color:var(--accent)]" : "border-[color:var(--field-border)]"}`} aria-hidden="true">
                  {active && <div className="size-2 rounded-full bg-[color:var(--on-accent)]" />}
                </div>
              </button>
            );
          })}
        </div>

        <button onClick={() => payDebt(payMethod)} className={btnAccent}>
          {t("Confirmar pagamento via")} {t(payMethod)}
        </button>
      </>
    );
  }

  const saveInitialBudget = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = Number(budgetPromptValue);
    if (!Number.isFinite(value) || value <= 0) {
      notify("Informe um orçamento mensal maior que zero.", true);
      return;
    }
    void persistBudget(value).then(() => {
      setShowBudgetPrompt(false);
      setBudgetPromptValue("");
    }).catch(error => notify(error instanceof Error ? error.message : "Erro ao salvar orçamento.", true));
    notify("Orçamento mensal definido.");
  };

  return (
    <main className={`${bgClass} px-3 pb-[calc(7.25rem+env(safe-area-inset-bottom))] pt-6 min-[390px]:px-5 md:px-8 md:py-8`}>
      {showBudgetPrompt && currentUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="budget-prompt-title">
          <form onSubmit={saveInitialBudget} className="w-full max-w-sm rounded-3xl border border-[color:var(--text)]/15 bg-[color:var(--surface)] p-6 shadow-2xl">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[color:var(--accent)]/15 text-[color:var(--accent-text)]">
              <Icon name="chart" size={24} />
            </div>
            <h2 id="budget-prompt-title" className="mt-4 text-center text-xl font-semibold">{t("Defina seu orçamento mensal")}</h2>
            <p className="mt-2 text-center text-sm leading-relaxed text-[color:var(--text-2)]">{t("Para começar a organizar suas finanças, informe quanto você pretende gastar por mês.")}</p>
            <label className="mt-5 block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-[color:var(--text-2)]">{t("Orçamento mensal (R$)")}</span>
              <input
                value={budgetPromptValue}
                onChange={e => setBudgetPromptValue(e.target.value)}
                type="number"
                min="0.01"
                step="0.01"
                placeholder={language === "en-US" ? "0.00" : "0,00"}
                className={`${inputWhite} text-lg font-semibold`}
                autoFocus
                required
              />
            </label>
            <button type="submit" className={`mt-4 ${btnAccent}`}>{t("Definir orçamento")}</button>
          </form>
        </div>
      )}
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[180px_minmax(0,580px)]">
        <Nav />
        <section className="min-w-0" aria-label={pageTitle[view]}>{content}</section>
      </div>
      <Toast />
      {activeTour && (() => {
        const tour = TOURS[activeTour.id];
        const current = tour.steps[activeTour.step];
        if (!current) return null;
        return (
          <TourOverlay
            key={activeTour.id}
            step={{ target: current.target, title: t(current.title), body: t(current.body) }}
            index={activeTour.step}
            total={tour.steps.length}
            onNext={() => (activeTour.step + 1 < tour.steps.length ? setActiveTour({ ...activeTour, step: activeTour.step + 1 }) : endTour())}
            onBack={() => setActiveTour({ ...activeTour, step: Math.max(0, activeTour.step - 1) })}
            onSkip={endTour}
            labels={{ step: `${t("Passo")} ${activeTour.step + 1} ${t("de")} ${tour.steps.length}`, next: t("Próximo"), back: t("Voltar"), skip: t("Pular tour"), finish: t("Concluir") }}
          />
        );
      })()}
    </main>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const markReady = useCallback(() => setReady(true), []);
  const hideSplash = useCallback(() => setShowSplash(false), []);
  const [splashTheme] = useState(getStartupTheme);
  const t = useMemo(() => {
    const stored = localStorage.getItem("aoshiro_language");
    return createTranslator(stored === "en-US" || stored === "es-ES" ? stored : "pt-BR");
  }, []);
  if (!supabaseConfigured) return <SupabaseConfigMessage />;
  return (
    <>
      <AppContent onReady={markReady} />
      {showSplash && (
        <SplashScreen ready={ready} onDone={hideSplash} theme={splashTheme}
          tagline={t("Suas finanças, claras.")} skipLabel={t("Pular")} loadingLabel={t("Carregando o Aoshiro")} />
      )}
    </>
  );
}
