import { useEffect, useMemo, useState } from "react";
import { createTranslator, getMonthNames, type Language } from "./i18n";
import type { Currency } from "./types";
import { supabase, supabaseConfigured } from "./lib/supabaseClient";

type View =
  | "login" | "register" | "forgot"
  | "home" | "debts" | "categories" | "history" | "budget" | "settings" | "payment"
  | "simulation" | "goals" | "catEditor" | "notifications";

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

const card = "rounded-3xl border border-white/10 bg-[#294a60]/75 p-5 shadow-xl";
const btnPrimary = "flex w-full items-center justify-center rounded-2xl bg-white py-3.5 text-sm font-semibold text-[#1d2d36] transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent active:scale-[.98] disabled:opacity-40";
const btnAccent = "flex w-full items-center justify-center rounded-2xl bg-[#c8e5dd] py-3.5 text-sm font-bold text-[#1d2d36] transition hover:bg-[#b8d8ce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e5dd] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent active:scale-[.98]";
const btnGhost = "flex w-full items-center justify-center rounded-2xl border border-white/20 py-3.5 text-sm font-semibold text-white/80 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 active:scale-[.98]";
const inputWhite = "w-full rounded-2xl bg-white px-4 py-3 text-sm text-[#1d2d36] placeholder:text-[#1d2d36]/40 outline-none focus-visible:ring-2 focus-visible:ring-[#2e5f7e] transition";
const sectionLabel = "text-xs font-semibold uppercase tracking-widest text-white/55";
const rowBtn = "flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/10 p-4 text-left transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40";
const iconBtn = "grid size-11 place-items-center rounded-2xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50";

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
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? ""} />
    </svg>
  );
};

const BG_LIGHT = "bg-[linear-gradient(160deg,#6d8f9e_0%,#2e5f7e_72%)]";
const BG_DARK = "bg-[linear-gradient(160deg,#0f1c24_0%,#172533_72%)]";

const FieldIcon = ({ icon, children }: { icon: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-3 rounded-2xl bg-white px-4 text-[#36515e] focus-within:ring-2 focus-within:ring-[#2e5f7e] transition">
    <Icon name={icon} size={16} />
    {children}
  </div>
);

const SupabaseConfigMessage = () => (
  <main className="min-h-screen bg-[#1d2d36] p-6 text-white">
    <div className="mx-auto mt-16 max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl">
      <h1 className="text-2xl font-bold">Supabase não configurado</h1>
      <p className="mt-3 text-white/70">Crie um arquivo <code>.env.local</code> na raiz do projeto com:</p>
      <pre className="mt-5 overflow-auto rounded-2xl bg-black/30 p-4 text-sm">{`VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICA`}</pre>
      <p className="mt-4 text-sm text-white/60">Depois reinicie o Vite com <code>npm run dev</code>.</p>
    </div>
  </main>
);

const AppContent = () => {
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
  const [darkMode, setDarkMode] = useState(false);
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

  const notify = (msg: string, err = false) => {
    setToast(t(msg)); setToastError(err);
    window.setTimeout(() => setToast(""), 2800);
  };
  const open = (next: View) => { setView(next); setQuery(""); };
  useEffect(() => { localStorage.setItem("aoshiro_language", language); }, [language]);

  const totalPaid = debts.filter(d => d.paid).reduce((s, d) => s + d.value, 0);
  const totalOpen = debts.filter(d => !d.paid).reduce((s, d) => s + d.value, 0);
  const goalReserves = goals.reduce((s, g) => s + (goalDeposits[g.id]?.[monthKey] ?? 0), 0);
  const available = budget - totalPaid - goalReserves;

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

  const bgClass = `min-h-screen text-white transition-colors duration-500 ${darkMode ? BG_DARK : BG_LIGHT}`;

  const Toast = () => toast ? (
    <div role="alert" aria-live="polite" className={`fixed bottom-24 left-1/2 z-50 max-w-xs -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-semibold shadow-2xl md:bottom-6 ${toastError ? "bg-[#7b2d2d]" : "bg-[#183746]"}`}>
      {toast}
    </div>
  ) : null;

  const BackBtn = ({ to }: { to: View }) => (
    <button onClick={() => open(to)} className="mb-4 flex items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-white/60 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">
      <Icon name="back" size={16} />{t("Voltar")}</button>
  );

  const pageTitle: Record<View, string> = {
    login: "", register: "", forgot: "",
    home: "Visão geral", debts: "Dívidas", categories: "Categorias",
    history: "Histórico", budget: "Nova dívida", settings: "Ajustes", notifications: "Notificações",
    payment: "Registrar pagamento", simulation: "Simulação", goals: "Metas", catEditor: "Categorias",
  };

  const authInput = "w-full bg-transparent py-3.5 text-sm text-[#1d2d36] placeholder:text-[#1d2d36]/40 outline-none";

  if (view === "login") return (
    <main className={`${bgClass} flex min-h-screen items-center justify-center p-5`}>
      <Toast />
      <section className="w-full max-w-sm" aria-label={t("Entrar na conta")}>
        <div className="mb-10 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-white/15 text-xl font-bold" aria-hidden="true">A</div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Aoshiro</p>
            <h1 className="text-xl font-semibold">{t("Suas finanças, claras.")}</h1>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#36556a]/65 p-8 shadow-2xl backdrop-blur-sm">
          <p className="mb-7 text-sm leading-relaxed text-white/70">{t("Entre para acompanhar seu dinheiro com calma e intenção.")}</p>
          {blocked && (
            <div role="alert" className="mb-5 rounded-2xl border border-[#f3c982]/30 bg-[#f3c982]/10 px-4 py-3 text-sm text-[#f3c982]">{t("Conta bloqueada. Redefina sua senha para continuar.")}</div>
          )}
          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-white/70">{t("E-mail")}</span>
              <input name="email" required type="email" placeholder="voce@email.com" defaultValue=""
                className="w-full rounded-2xl border border-transparent bg-white px-4 py-3.5 text-sm text-[#1d2d36] placeholder:text-[#1d2d36]/40 outline-none transition focus-visible:ring-2 focus-visible:ring-[#2e5f7e]" />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-white/70">{t("Senha")}</span>
              <div className="flex gap-2">
                <input name="password" required type={showPassword ? "text" : "password"} placeholder="••••••••" defaultValue=""
                  className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3.5 text-sm text-[#1d2d36] outline-none transition focus-visible:ring-2 focus-visible:ring-[#2e5f7e]" />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className={`${iconBtn} bg-white text-[#20313a] hover:bg-white/90`}>
                  <Icon name={showPassword ? "eyeOff" : "eye"} />
                </button>
              </div>
            </label>
            <button type="submit" disabled={blocked} className={`mt-2 ${btnPrimary}`}>{t("Entrar na minha conta")}</button>
          </form>
          <button onClick={() => { setForgotStep("email"); setForgotEmail(""); setForgotCode(""); setForgotNewPass(""); open("forgot"); }}
            className="mt-5 w-full rounded-lg text-center text-sm font-semibold text-white/75 underline underline-offset-4 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">{t("Esqueci minha senha")}</button>
        </div>
        <p className="mt-6 text-center text-sm text-white/70">
          {t("Ainda não tem conta?")} {" "}
          <button onClick={() => open("register")} className="rounded font-semibold text-white underline underline-offset-4 transition hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">{t("Criar agora")}</button>
        </p>
      </section>
    </main>
  );

  if (view === "register") return (
    <main className={`${bgClass} flex min-h-screen items-center justify-center p-5`}>
      <Toast />
      <section className="w-full max-w-sm" aria-label={t("Criar conta")}>
        <BackBtn to="login" />
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-white/15 text-xl font-bold" aria-hidden="true">A</div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Aoshiro</p>
            <h1 className="text-xl font-semibold">{t("Criar conta")}</h1>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#36556a]/65 p-8 shadow-2xl backdrop-blur-sm">
          <form onSubmit={handleRegister} className="space-y-4" noValidate>
            {([
              { name: "name", label: "Nome completo", icon: "user", type: "text", ph: "Seu nome", required: true },
              { name: "email", label: "E-mail", icon: "mail", type: "email", ph: "voce@email.com", required: true },
              { name: "phone", label: "Celular (opcional)", icon: "bell", type: "tel", ph: "(99) 99999-9999", required: false },
              { name: "password", label: "Senha", icon: "lock", type: "password", ph: "Mínimo 6 caracteres", required: true },
              { name: "confirm", label: "Confirmar senha", icon: "lock", type: "password", ph: "Repita a senha", required: true },
            ] as const).map(f => (
              <label key={f.name} className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-white/70">{t(f.label)}</span>
                <FieldIcon icon={f.icon}>
                  <input name={f.name} required={f.required} type={f.type} placeholder={t(f.ph)} className={authInput} />
                </FieldIcon>
              </label>
            ))}
            <button type="submit" className={`mt-2 ${btnPrimary}`}>{t("Criar minha conta")}</button>
          </form>
        </div>
        <p className="mt-6 text-center text-sm text-white/70">
          {t("Já tem conta?")} {" "}
          <button onClick={() => open("login")} className="rounded font-semibold text-white underline underline-offset-4 transition hover:text-white/80 focus-visible:outline-none">{t("Entrar")}</button>
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
          <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Aoshiro</p>
          <h1 className="mt-1 text-2xl font-semibold">{t("Redefinir senha")}</h1>
        </div>
        <div className="mb-8 flex items-center gap-2" aria-label={t("Etapas")}>
          {(["email", "code", "newpass"] as const).map((s, i) => {
            const idx = ["email", "code", "newpass"].indexOf(forgotStep);
            const done = idx > i; const active = forgotStep === s;
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`grid size-8 place-items-center rounded-full text-xs font-bold transition-colors ${active ? "bg-white text-[#203d4f]" : done ? "bg-[#c8e5dd] text-[#203d4f]" : "bg-white/20 text-white/50"}`}
                  aria-current={active ? "step" : undefined}>
                  {done ? <Icon name="check" size={14} /> : i + 1}
                </div>
                {i < 2 && <div className={`h-px w-10 transition-colors ${done ? "bg-[#c8e5dd]" : "bg-white/20"}`} />}
              </div>
            );
          })}
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#36556a]/65 p-8 shadow-2xl backdrop-blur-sm">
          <form onSubmit={handleForgot} className="space-y-5" noValidate>
            {forgotStep === "email" && <>
              <p className="text-sm leading-relaxed text-white/70">{t("Informe seu e-mail. Enviaremos um código de verificação.")}</p>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-white/70">{t("E-mail")}</span>
                <FieldIcon icon="mail">
                  <input required type="email" placeholder="voce@email.com" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} className={authInput} />
                </FieldIcon>
              </label>
              <button type="submit" className={btnPrimary}>{t("Enviar link")}</button>
            </>}
            {forgotStep === "code" && <>
              <p className="text-sm leading-relaxed text-white/70">{t("Enviamos um link de recuperação para")} <strong>{forgotEmail}</strong>.</p>
              <p className="rounded-xl bg-[#c8e5dd]/10 px-3 py-2 text-xs leading-relaxed text-[#c8e5dd]">{t("Abra o link no e-mail. Depois desta confirmação, a tela para criar sua nova senha será liberada automaticamente.")}</p>
              <button type="submit" className={btnPrimary}>{t("Verificar recuperação")}</button>
              <button type="button" onClick={async () => { const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), { redirectTo: window.location.origin }); if (error) notify(error.message, true); else notify("Link de recuperação reenviado."); }}
                className="w-full rounded text-center text-sm text-white/60 underline underline-offset-4 transition hover:text-white focus-visible:outline-none">{t("Reenviar link")}</button>
            </>}
            {forgotStep === "newpass" && <>
              <p className="text-sm leading-relaxed text-white/70">{t("Escolha uma nova senha segura.")}</p>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-white/70">{t("Nova senha")}</span>
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
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[460px] px-2 pt-2 pb-[max(10px,env(safe-area-inset-bottom))] md:static md:mx-0 md:max-w-none md:rounded-3xl md:border md:border-white/10 md:bg-[#294a60]/75 md:p-2"
    >
      <div className="flex items-stretch gap-1 rounded-[26px] border border-white/10 bg-[#294a60]/95 p-1.5 shadow-xl backdrop-blur-2xl md:flex-col md:gap-1 md:rounded-2xl md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
        {navItems.map(([id, ic, lb]) => {
          const isActive = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => open(id)}
              aria-current={isActive ? "page" : undefined}
              aria-label={lb}
              title={lb}
              className={`flex min-h-[58px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[19px] px-0.5 py-1.5 text-[8.5px] font-medium leading-none transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e5dd] focus-visible:ring-offset-2 focus-visible:ring-offset-[#294a60] active:scale-[.97] min-[390px]:text-[9.5px] md:min-h-12 md:w-full md:flex-row md:flex-none md:justify-start md:gap-3 md:rounded-xl md:px-3 md:py-2.5 md:text-sm ${isActive ? "font-semibold text-[#c8e5dd] md:bg-[#c8e5dd] md:font-bold md:text-[#203d4f] md:shadow-sm" : "text-white/65 hover:bg-white/10 hover:text-white"}`}
            >
              <span className={`grid size-7 shrink-0 place-items-center rounded-full transition md:size-9 md:rounded-xl ${isActive ? "bg-white text-[#203d4f] md:bg-[#203d4f]/[0.08]" : "bg-white/[0.06] md:bg-transparent"}`}>
                <Icon name={ic} size={19} />
              </span>
              <span className={`whitespace-nowrap text-center md:text-left ${isActive ? "text-white md:text-[#203d4f]" : ""}`}>{lb}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );

  const MonthNav = () => (
    <div className="flex items-center gap-0.5 rounded-2xl bg-white/10 p-1" aria-label={t("Navegar entre meses")}>
      <button onClick={goToPrev} aria-label={t("Mês anterior")}
        className="grid size-8 place-items-center rounded-xl transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">
        <Icon name="back" size={15} />
      </button>
      <span className="min-w-[118px] px-1 text-center text-xs font-semibold">
        {MONTHS[activeMonth.month]} {activeMonth.year}
      </span>
      <button onClick={goToNext} aria-label={t("Próximo mês")}
        className="grid size-8 place-items-center rounded-xl transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">
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
      <div className="mb-6 rounded-3xl border border-[#c8e5dd]/20 bg-[#c8e5dd]/10 p-5">
        <p className="text-sm font-semibold text-[#c8e5dd]">{t("Novo mês")}</p>
        <p className="mt-1 text-xs leading-relaxed text-white/70">
          {prevUnpaid.length > 0
            ? `${prevUnpaid.length} ${t(prevUnpaid.length !== 1 ? "dívidas" : "dívida")} ${t("em aberto em")} ${prevName}. ${t("Deseja copiá-las para este mês?")}`
            : t("Nenhuma dívida pendente no mês anterior. Comece adicionando.")}
        </p>
        {prevUnpaid.length > 0 && (
          <div className="mt-4 flex gap-3">
            <button onClick={copyDebts}
              className="flex-1 rounded-2xl bg-[#c8e5dd] py-2.5 text-xs font-bold text-[#1d2d36] transition hover:bg-[#b8d8ce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e5dd]">{t("Copiar dívidas")}</button>
            <button onClick={() => setShowCopyPrompt(false)}
              className="flex-1 rounded-2xl border border-white/20 py-2.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30">{t("Começar do zero")}</button>
          </div>
        )}
        {prevUnpaid.length === 0 && (
          <button onClick={() => setShowCopyPrompt(false)}
            className="mt-3 text-xs text-white/50 underline underline-offset-4 transition hover:text-white/70">{t("Fechar")}</button>
        )}
      </div>
    );
  };

  const Header = ({ action, backTo = "home" as View }: { action?: React.ReactNode; backTo?: View }) => (
    <header className="mb-8">
      {!isMainNav && <BackBtn to={backTo} />}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={sectionLabel}>Aoshiro</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{pageTitle[view] ? t(pageTitle[view]) : ""}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-1">
          {view === "home" && <MonthNav />}
          {action}
        </div>
      </div>
    </header>
  );

  const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
    <section className={`${card} ${className}`}>{children}</section>
  );

  const SegControl = ({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) => {
    const labels: Record<string, string> = { all: t("Todos"), open: t("Em aberto"), paid: t("Pagas"), today: t("Hoje"), week: t("Esta semana") };
    return (
      <div role="group" className="flex gap-1 rounded-2xl bg-white/10 p-1">
        {options.map(o => (
          <button key={o} type="button" onClick={() => onChange(o)} aria-pressed={value === o}
            className={`flex-1 rounded-xl py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${value === o ? "bg-white text-[#203d4f]" : "text-white/65 hover:text-white"}`}>
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
        <button onClick={() => open("settings")} aria-label={t("Abrir ajustes")}
          className={`${iconBtn} border border-white/15 bg-white/10 hover:bg-white/20`}>
          <Icon name="gear" />
        </button>
      } />
      <CopyPrompt />


      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-10 -top-12 size-44 rounded-full bg-[#a6c6ca]/20 blur-2xl" />
        <div className="relative flex items-center justify-between">
          <p className={sectionLabel}>{t("Disponível neste mês")}</p>
          <button type="button" onClick={async () => { const next = !hideBalance; setHideBalance(next); if (currentUser) { const { error } = await supabase.from("profiles").update({ hide_balance: next }).eq("id", currentUser.id); if (error) notify(error.message, true); } }}
            aria-label={hideBalance ? "Mostrar saldo" : "Ocultar saldo"}
            className="grid size-9 place-items-center rounded-xl text-white/50 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">
            <Icon name={hideBalance ? "eyeOff" : "eye"} size={18} />
          </button>
        </div>
        <p className="mt-2 text-4xl font-semibold tracking-tight">
          {hideBalance ? <span aria-label={t("Saldo oculto")}>•••••</span> : fmt(available)}
        </p>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-[#c8e5dd] transition-all duration-500"
            style={{ width: `${Math.min(100, budget > 0 ? (totalOpen / budget) * 100 : 0)}%` }}
            role="progressbar" aria-valuenow={Math.round(budget > 0 ? (totalOpen / budget) * 100 : 0)} aria-valuemin={0} aria-valuemax={100} />
        </div>
        <div className="mt-2 space-y-0.5 text-xs text-white/60">
          <div className="flex justify-between">
            <span>{hideBalance ? "•••••" : fmt(totalOpen)} {t("em aberto")}</span>
            {!hideBalance && <span>{Math.round(budget > 0 ? (totalOpen / budget) * 100 : 0)}% {t("do orçamento")}</span>}
          </div>
          {goalReserves > 0 && (
            <div className="flex justify-between">
              <span>{hideBalance ? "•••••" : fmt(goalReserves)} {t("em metas")}</span>
              {!hideBalance && <span>{Math.round(budget > 0 ? (goalReserves / budget) * 100 : 0)}% {t("do orçamento")}</span>}
            </div>
          )}
        </div>
      </Card>


      <div className="mt-4 grid grid-cols-2 gap-4">
        <Card>
          <p className="text-xs text-white/60">{t("Em aberto")}</p>
          <p className="mt-1.5 text-xl font-semibold">{hideBalance ? "•••••" : fmt(totalOpen)}</p>
          <button onClick={() => open("debts")} className="mt-3 flex items-center gap-1 rounded text-xs font-semibold text-[#c8e5dd] transition hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8e5dd]">{t("Ver dívidas")}<Icon name="arrow" size={14} />
          </button>
        </Card>
        <Card>
          <p className="text-xs text-white/60">{t("Reserva em metas")}</p>
          <p className="mt-1.5 text-xl font-semibold">{hideBalance ? "•••" : fmt(goalReserves)}</p>
          <button onClick={() => open("goals")} className="mt-3 flex items-center gap-1 rounded text-xs font-semibold text-[#c8e5dd] transition hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8e5dd]">
            {goals.length} {t(goals.length === 1 ? "meta" : "metas")} <Icon name="arrow" size={14} />
          </button>
        </Card>
      </div>


      <button
        onClick={() => open("budget")}
        className="mt-4 flex w-full items-center justify-between rounded-3xl border border-[#c8e5dd]/40 bg-[#c8e5dd] p-5 text-left text-[#1d2d36] shadow-lg shadow-black/10 transition hover:bg-[#b8d8ce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        aria-label={t("Adicionar dívida")}
      >
        <div className="flex items-center gap-4">
          <span className="grid size-11 place-items-center rounded-2xl bg-[#203d4f] text-white" aria-hidden="true">
            <Icon name="plus" size={22} />
          </span>
          <span>
            <span className="block text-sm font-bold">{t("Adicionar dívida")}</span>
            <span className="mt-0.5 block text-xs text-[#203d4f]/70">{t("Cadastre um novo compromisso")}</span>
          </span>
        </div>
        <Icon name="arrow" size={19} />
      </button>


      <button
        onClick={() => open("simulation")}
        className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-4 text-left transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <Icon name="sim" size={19} />
        <span>
          <span className="block text-sm font-semibold">{t("Simulação")}</span>
          <span className="block text-xs text-white/55">{t("Calcule juros e montante")}</span>
        </span>
      </button>


      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("Próximos compromissos")}</h2>
        <button onClick={() => open("debts")} className="rounded text-xs font-semibold text-white/55 transition hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/50">{t("Ver todos")}</button>
      </div>
      <ul className="mt-3 space-y-3" aria-label={t("Dívidas em aberto")}>
        {debts.filter(d => !d.paid).slice(0, 3).map(d => (
          <li key={d.id}>
            <button onClick={() => { setSelectedDebt(d); open("payment"); }}
              className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/10 p-4 text-left transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
              <div>
                <p className="text-sm font-semibold">{d.title}</p>
                <p className="mt-0.5 text-xs text-white/55">{t("Vence")} {fmtDate(d.due)} · {catName(d.category)}{d.reminder ? ` · 🔔 ${fmtDate(d.reminder)}` : ""}</p>
              </div>
              <span className="ml-4 shrink-0 text-sm font-semibold">{hideBalance ? "•••" : fmt(d.value)}</span>
            </button>
          </li>
        ))}
        {debts.filter(d => !d.paid).length === 0 && (
          <li className="rounded-2xl border border-white/10 bg-white/10 p-6 text-center text-sm text-white/50">
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
          onClick={() => open("budget")}
          aria-label={t("Nova dívida")}
          className="flex items-center gap-2 rounded-2xl bg-[#c8e5dd] px-4 py-2.5 text-xs font-bold text-[#203d4f] shadow-sm transition hover:bg-[#b8d8ce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <Icon name="plus" size={16} />
          {t("Adicionar")}
        </button>
      } />
      <CopyPrompt />
      <div className="mb-3 flex items-center gap-3 rounded-2xl bg-white px-4 text-[#36515e] transition focus-within:ring-2 focus-within:ring-[#2e5f7e]">
        <Icon name="search" size={17} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Buscar dívidas")}
          aria-label={t("Buscar dívidas")}
          className="w-full bg-transparent py-3.5 text-sm text-[#1d2d36] placeholder:text-[#1d2d36]/40 outline-none" />
      </div>
      <div className="mb-3">
        <SegControl options={["all", "open", "paid"]} value={debtFilter} onChange={setDebtFilter} />
      </div>
      <div className="mb-4">
        <SegControl options={["all", "today", "week"]} value={periodFilter} onChange={setPeriodFilter} />
      </div>
      <p className={`mb-3 ${sectionLabel}`}>{filteredDebts.length} {t(filteredDebts.length === 1 ? "registro" : "registros")}</p>
      <ul className="space-y-3" aria-label={t("Lista de dívidas")}>
        {filteredDebts.map(d => (
          <li key={d.id}>
            <Card className="flex items-center gap-3 py-4">
              <span className={`size-2.5 shrink-0 rounded-full ${d.paid ? "bg-[#c8e5dd]" : "bg-[#f3c982]"}`} aria-label={d.paid ? "Paga" : "Em aberto"} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{d.title}</p>
                <p className="mt-0.5 text-xs text-white/55">{catName(d.category)} · {fmtDate(d.due)}{d.reminder ? ` · 🔔 ${fmtDate(d.reminder)}` : ""}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold">{hideBalance ? "•••" : fmt(d.value)}</p>
                {d.paid
                  ? <div className="mt-1 text-right">
                    <span className="block text-xs font-bold text-[#c8e5dd]">{t("PAGO")}</span>
                    {d.paymentMethod && <span className="block text-xs text-white/40">{d.paymentMethod === "Pix" ? "⚡" : d.paymentMethod === "Cartão" ? "💳" : "💵"} {d.paymentMethod === "Pix" ? "Pix" : d.paymentMethod === "Cartão" ? t("Cartão") : t("Dinheiro")}</span>}
                  </div>
                  : <button onClick={() => { setSelectedDebt(d); open("payment"); }}
                    className="mt-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-[#203d4f] transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">{t("PAGAR")}</button>}
              </div>
            </Card>
          </li>
        ))}
        {filteredDebts.length === 0 && (
          <li className="rounded-2xl border border-white/10 bg-white/10 p-8 text-center text-sm text-white/50">{t("Nenhuma dívida encontrada.")}</li>
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
            className="flex items-center gap-2 rounded-2xl bg-[#c8e5dd] px-4 py-2.5 text-xs font-bold text-[#203d4f] shadow-sm transition hover:bg-[#b8d8ce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Icon name="plus" size={16} />
            {t("Adicionar")}
          </button>
        } />
        <CopyPrompt />
        <button
          onClick={() => open("catEditor")}
          className="mb-4 flex w-full items-center justify-between rounded-3xl border border-[#c8e5dd]/35 bg-[#c8e5dd]/15 p-4 text-left transition hover:bg-[#c8e5dd]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e5dd]"
          aria-label={t("Adicionar categoria")}
        >
          <span className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-[#c8e5dd] text-[#203d4f]">
              <Icon name="plus" size={19} />
            </span>
            <span>
              <span className="block text-sm font-bold">{t("Adicionar categoria")}</span>
              <span className="block text-xs text-white/55">{t("Crie uma nova categoria ou configure uma existente")}</span>
            </span>
          </span>
          <Icon name="arrow" size={18} />
        </button>
        <div className="mb-4">
          <SegControl options={["all", "today", "week"]} value={catPeriodFilter} onChange={setCatPeriodFilter} />
        </div>
        <p className={`mb-3 ${sectionLabel}`}>{t("Gastos por categoria")} · {periodLabel[catPeriodFilter]}</p>
        <ul className="space-y-3">
          {[...categories, { id: -1, name: "Outros", color: "#d4b8f0", budget: 0 }].map(c => {
            const shown = spent(c.name) + open2(c.name);
            const paidAmt = spent(c.name);
            const openAmt = open2(c.name);
            const isSystem = c.id === -1;
            if (isSystem && shown === 0) return null;
            const pct = c.budget > 0 ? Math.min(100, Math.round((shown / c.budget) * 100)) : 0;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => !isSystem && startEditingCategory(c)}
                  disabled={isSystem}
                  className={`block w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e5dd] ${isSystem ? "cursor-default" : "cursor-pointer"}`}
                  aria-label={isSystem ? catName(c.name) : `${t("Editar categoria")} ${catName(c.name)}`}
                >
                  <Card className={!isSystem ? "transition hover:bg-white/15" : ""}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="size-3 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden="true" />
                        <p className="text-sm font-semibold">{catName(c.name)}</p>
                        {isSystem && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/40">{t("sistema")}</span>}
                      </div>
                      <p className="text-sm font-semibold">{hideBalance ? "•••••" : fmt(shown)}</p>
                    </div>
                    {!hideBalance && openAmt > 0 && paidAmt > 0 && (
                      <div className="mt-2 flex gap-3 text-xs text-white/50">
                        <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-[#c8e5dd] inline-block" />{t("Pago:")} {fmt(paidAmt)}</span>
                        <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-[#f3c982] inline-block" />{t("Em aberto:")} {fmt(openAmt)}</span>
                      </div>
                    )}
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: c.color }}
                        role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${catName(c.name)}: ${pct}% utilizado`} />
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-white/55">
                      {!isSystem
                        ? <><span>{t("Limite:")} {hideBalance ? "•••••" : fmt(c.budget)}</span><span>{hideBalance ? "—" : `${pct}% ${t("utilizado")}`}</span></>
                        : <span className="text-white/35">{t("Sem limite definido · categoria padrão do sistema")}</span>
                      }
                    </div>
                    {!isSystem && (
                      <p className="mt-3 text-[11px] font-semibold text-[#c8e5dd]/70">{t("Clique para configurar ou editar")}</p>
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
                <form onSubmit={saveEdit} className="rounded-2xl border border-[#c8e5dd]/30 bg-[#c8e5dd]/10 p-4 space-y-3" aria-label={`Editar categoria ${catName(c.name)}`}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-[#c8e5dd]">{t("Editando")} · {catName(c.name)}</p>
                  <input value={editCatName} onChange={e => setEditCatName(e.target.value)} placeholder={t("Nome")} aria-label={t("Nome da categoria")} className={inputWhite} />
                  <input value={editCatBudget} onChange={e => setEditCatBudget(e.target.value)} type="number" min="1" step="0.01" placeholder={t("Limite (R$)")} aria-label={t("Limite mensal")} className={inputWhite} />
                  <div className="flex items-center gap-3" role="group" aria-label={t("Cor")}>
                    <span className="text-xs text-white/60">{t("Cor:")}</span>
                    {["#c8e5dd", "#bdd7f0", "#f3c982", "#f0bdd7", "#d7bdf0"].map(cor => (
                      <button type="button" key={cor} onClick={() => setEditCatColor(cor)}
                        aria-label={`Cor ${cor}`} aria-pressed={editCatColor === cor}
                        className={`size-8 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${editCatColor === cor ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-transparent" : ""}`}
                        style={{ background: cor }} />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 rounded-2xl bg-[#c8e5dd] py-2.5 text-xs font-bold text-[#1d2d36] transition hover:bg-[#b8d8ce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8e5dd]">{t("Salvar")}</button>
                    <button type="button" onClick={() => setEditingCat(null)} className="flex-1 rounded-2xl border border-white/20 py-2.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30">{t("Cancelar")}</button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 p-4">
                  <div className="flex items-center gap-3">
                    <span className="size-4 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold">{catName(c.name)}</p>
                      <p className="text-xs text-white/55">{t("Limite:")} {fmt(c.budget)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEditingCategory(c)}
                      aria-label={`Editar categoria ${catName(c.name)}`}
                      className="grid size-9 place-items-center rounded-xl text-white/40 transition hover:bg-white/10 hover:text-[#bdd7f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                      </svg>
                    </button>
                    <button onClick={async () => { if (!currentUser) return; const { error } = await supabase.from("categories").delete().eq("id", c.id).eq("user_id", currentUser.id); if (error) { notify(error.message, true); return; } setCategories(p => p.filter(x => x.id !== c.id)); notify("Categoria removida."); }}
                      aria-label={`Remover categoria ${catName(c.name)}`}
                      className="grid size-9 place-items-center rounded-xl text-white/40 transition hover:bg-white/10 hover:text-[#f3c982] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
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
          <div className="flex items-center gap-3" role="group" aria-label={t("Cor da categoria")}>
            <span className="text-xs text-white/60">{t("Cor:")}</span>
            {["#c8e5dd", "#bdd7f0", "#f3c982", "#f0bdd7", "#d7bdf0"].map(cor => (
              <button type="button" key={cor} onClick={() => setNewCatColor(cor)}
                aria-label={`Cor ${cor}`} aria-pressed={newCatColor === cor}
                className={`size-8 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${newCatColor === cor ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-transparent" : ""}`}
                style={{ background: cor }} />
            ))}
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
          <div className="mt-4 flex justify-between text-xs text-white/60">
            <span>{t("Orçamento:")} {hideBalance ? "•••••" : fmt(budget)}</span>
            <span>{t("Restante:")} {hideBalance ? "•••••" : fmt(available)}</span>
          </div>
        </Card>
        {paid.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/10 p-10 text-center">
            <p className="text-sm text-white/55">{t("Nenhum pagamento em")} {MONTHS[activeMonth.month]}.</p>
            <p className="mt-1 text-xs text-white/35">{t("Pagamentos aparecerão aqui após registrados.")}</p>
          </div>
        ) : (
          <Card>
            {dates.map((date, i) => (
              <div key={date} className={i > 0 ? "mt-6 border-t border-white/15 pt-5" : ""}>
                <p className={sectionLabel}>{date}</p>
                {grouped[date].map(d => (
                  <div key={d.id} className="mt-4 flex items-start justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium">{d.title}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-white/45">{catName(d.category)}</span>
                        {d.paymentMethod && (
                          <span className="rounded-lg bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/60">
                            {d.paymentMethod === "Pix" ? "⚡" : d.paymentMethod === "Cartão" ? "💳" : "💵"} {d.paymentMethod === "Pix" ? "Pix" : d.paymentMethod === "Cartão" ? t("Cartão") : t("Dinheiro")}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 font-semibold text-[#f3c982]">− {hideBalance ? "•••••" : fmt(d.value)}</span>
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
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/60">{t("Título")}</span>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={t("Nome da dívida")} aria-required="true" className={inputWhite} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/60">{t("Valor (R$)")}</span>
          <input value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} type="number" min="0.01" step="0.01" placeholder={language === "en-US" ? "0.00" : "0,00"} aria-required="true" className={inputWhite} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/60">{t("Vencimento")}</span>
          <input value={form.due} onChange={e => setForm({ ...form, due: maskDateInput(e.target.value, language) })} type="text" inputMode="numeric" placeholder={language === "en-US" ? "MM/DD/YYYY" : "DD/MM/AAAA"} maxLength={10} aria-required="true" className={inputWhite} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/60">{t("Categoria")}</span>
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inputWhite}>
            <option value="">{t("Selecionar categoria")}</option>
            {categories.map(c => <option key={c.id} value={c.name}>{catName(c.name)}</option>)}
            <option value="Outros">{t("Outros")}</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-white/60">
            <Icon name="bell" size={12} />{t("Lembrete (opcional)")}</span>
          <input value={form.reminder} onChange={e => setForm({ ...form, reminder: maskDateInput(e.target.value, language) })} type="text" inputMode="numeric" placeholder={language === "en-US" ? "MM/DD/YYYY" : "DD/MM/AAAA"} maxLength={10} className={inputWhite} />
          {form.due && <p className="mt-1 text-xs text-white/40">{t("Lembrete deve ser antes ou na data de vencimento.")}</p>}
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
                  className={`rounded-2xl border py-2.5 text-xs font-semibold transition ${depositMode === "add" ? "border-[#c8e5dd] bg-[#c8e5dd]/20 text-[#c8e5dd]" : "border-white/20 text-white/60 hover:bg-white/10"}`}>{t("+ Depositar")}</button>
                <button type="button" onClick={() => setDepositMode("rescue")}
                  className={`rounded-2xl border py-2.5 text-xs font-semibold transition ${depositMode === "rescue" ? "border-[#f3c982] bg-[#f3c982]/20 text-[#f3c982]" : "border-white/20 text-white/60 hover:bg-white/10"}`}>{t("− Resgatar")}</button>
              </div>
              <div className="rounded-2xl bg-white/8 px-4 py-3 text-xs text-white/60 space-y-0.5">
                {depositMode === "add"
                  ? <><span>{t("Disponível neste mês:")}</span><span className="font-semibold text-white/80">{fmt(available)}</span></>
                  : <><span>{t("Reservado neste mês:")}</span><span className="font-semibold text-white/80">{fmt(monthReserved)}</span></>
                }
              </div>
              <input value={depositAmount} onChange={e => setDepositAmount(e.target.value)}
                type="number" min="0.01" step="0.01" placeholder={t("Valor (R$)")} aria-label={t("Valor da movimentação")}
                className={inputWhite} autoFocus />
              <div className="flex gap-2">
                <button type="button" onClick={() => { setDepositGoalId(null); setDepositAmount(""); }}
                  className={btnGhost}>{t("Cancelar")}</button>
                <button type="submit" className={depositMode === "add" ? btnAccent : "flex w-full items-center justify-center rounded-2xl bg-[#f3c982] py-3.5 text-sm font-bold text-[#1d2d36] transition hover:bg-[#e8b96a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f3c982] active:scale-[.98]"}>
                  {depositMode === "add" ? t("Reservar") : t("Resgatar")}
                </button>
              </div>
            </form>
          </div>
        );
      })()}

      <ul className="mb-4 space-y-3" aria-label={t("Lista de metas")}>
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
                    <p className="mt-0.5 text-xs text-white/55">{fmt(accumulated)} {t("de")} {fmt(g.target)}</p>
                    {monthReserved > 0 && (
                      <p className="mt-0.5 text-xs text-[#c8e5dd]/70">{fmt(monthReserved)} {t("reservado neste mês")}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {done
                      ? <span className="rounded-full bg-[#c8e5dd]/20 px-2 py-0.5 text-[10px] font-bold text-[#c8e5dd]">{t("Concluída")}</span>
                      : <span className="text-xs font-bold text-[#c8e5dd]">{pct}%</span>
                    }
                    <button onClick={async () => { if (!currentUser) return; const { error } = await supabase.from("goals").delete().eq("id", g.id).eq("user_id", currentUser.id); if (error) { notify(error.message, true); return; } setGoals(p => p.filter(x => x.id !== g.id)); setGoalDeposits(p => { const n = { ...p }; delete n[g.id]; return n; }); notify("Meta removida."); }}
                      aria-label={`Remover meta ${g.label}`}
                      className="grid size-8 place-items-center rounded-xl text-white/40 transition hover:bg-white/10 hover:text-[#f3c982] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-[#c8e5dd] transition-all duration-500" style={{ width: `${pct}%` }}
                    role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} />
                </div>
                {!done && (
                  <button onClick={() => { setDepositGoalId(g.id); setDepositAmount(""); setDepositMode("add"); }}
                    className="mt-3 flex items-center gap-1.5 rounded text-xs font-semibold text-[#c8e5dd] transition hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8e5dd]">{t("Depositar / Resgatar")}<Icon name="arrow" size={13} />
                  </button>
                )}
              </Card>
            </li>
          );
        })}
        {goals.length === 0 && (
          <li className="rounded-2xl border border-white/10 bg-white/10 p-8 text-center text-sm text-white/50">{t("Nenhuma meta criada ainda.")}</li>
        )}
      </ul>


      {goals.length > 0 && goalReserves > 0 && (
        <Card className="mb-4">
          <p className="text-xs font-semibold text-white/60">{t("Total reservado neste mês")}</p>
          <p className="mt-1 text-lg font-semibold">{fmt(goalReserves)}</p>
          <p className="mt-0.5 text-xs text-white/50">{t("Deduzido do seu saldo disponível de")} {fmt(budget)}</p>
        </Card>
      )}

      <form onSubmit={addGoal} className={`${card} space-y-3`} aria-label={t("Criar nova meta")}>
        <p className="text-sm font-semibold">{t("Nova meta")}</p>
        <input value={newGoalLabel} onChange={e => setNewGoalLabel(e.target.value)} placeholder={t("Descrição")} aria-label={t("Descrição da meta")} className={inputWhite} />
        <input value={newGoalTarget} onChange={e => setNewGoalTarget(e.target.value)} type="number" min="1" step="0.01" placeholder={t("Valor alvo (R$)")} aria-label={t("Valor alvo")} className={inputWhite} />
        <button type="submit" className={btnAccent}>{t("Criar meta")}</button>
      </form>
    </>
  );

  else if (view === "simulation") content = (
    <>
      <Header />
      <Card className="mb-4">
        <p className={`${sectionLabel} mb-1`}>{t("Como funciona")}</p>
        <p className="text-sm leading-relaxed text-white/75">{t("Calcule o montante final de um valor aplicado com juros compostos mensais.")}</p>
      </Card>
      <form onSubmit={runSim} className={`${card} space-y-4`} aria-label={t("Parâmetros da simulação")}>
        <p className="text-sm font-semibold">{t("Parâmetros")}</p>
        {[
          { label: t("Valor inicial (R$)"), val: simPrincipal, set: setSimPrincipal, ph: t("Ex.: 1000"), min: "0.01", step: "0.01" },
          { label: t("Taxa de juros mensal (%)"), val: simRate, set: setSimRate, ph: t("Ex.: 1.2"), min: "0", step: "0.01" },
          { label: t("Prazo (meses)"), val: simMonths, set: setSimMonths, ph: t("Ex.: 12"), min: "1", step: "1" },
        ].map(f => (
          <label key={f.label} className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/60">{f.label}</span>
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
              <dt className="text-white/70">{t("Valor inicial")}</dt>
              <dd className="font-semibold">{fmt(Number(simPrincipal))}</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-white/70">{t("Juros acumulados")}</dt>
              <dd className="font-semibold text-[#f3c982]">{fmt(simResult.juros)}</dd>
            </div>
            <div className="flex justify-between border-t border-white/15 pt-3">
              <dt className="font-semibold">{t("Montante final")}</dt>
              <dd className="text-xl font-semibold text-[#c8e5dd]">{fmt(simResult.montante)}</dd>
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
          <div className={`grid size-12 shrink-0 place-items-center rounded-2xl ${notificationsEnabled ? "bg-[#c8e5dd]/15 text-[#c8e5dd]" : "bg-white/10 text-white/50"}`}>
            <Icon name="bell" size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t("Lembretes de vencimento")}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/55">{t("Os lembretes cadastrados nas dívidas ficam ativos automaticamente enquanto a dívida estiver em aberto.")}</p>
          </div>
          <button type="button" onClick={async () => { const next = !notificationsEnabled; setNotificationsEnabled(next); if (currentUser) { const { error } = await supabase.from("profiles").update({ notifications_enabled: next }).eq("id", currentUser.id); if (error) notify(error.message, true); } }} aria-pressed={notificationsEnabled}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${notificationsEnabled ? "bg-[#c8e5dd]" : "bg-white/25"}`}>
            <span className={`absolute top-1 size-4 rounded-full bg-white shadow transition-all ${notificationsEnabled ? "left-6" : "left-1"}`} />
          </button>
        </div>
        <div className="mt-4 rounded-2xl bg-white/10 p-3 text-xs text-white/60">
          <strong className="text-white/80">{activeReminderCount}</strong>{t("lembrete(s) ativo(s) para datas futuras ou de hoje.")}</div>
      </Card>

      {typeof window !== "undefined" && "Notification" in window && (
        <Card className="mb-4">
          <div className="flex items-center gap-3">
            <Icon name="bell" size={18} />
            <div className="flex-1">
              <p className="text-sm font-semibold">{t("Notificações do dispositivo")}</p>
              <p className="text-xs text-white/55">{notificationPermission === "granted" ? t("Ativadas neste navegador") : notificationPermission === "denied" ? t("Bloqueadas pelo navegador") : t("Permita alertas para receber os lembretes")}</p>
            </div>
            {notificationPermission !== "granted" && notificationPermission !== "denied" && (
              <button type="button" onClick={async () => {
                const permission = await Notification.requestPermission();
                setNotificationPermission(permission);
                if (permission === "granted") notify("Notificações ativadas.");
              }} className="rounded-xl bg-[#c8e5dd] px-3 py-2 text-xs font-bold text-[#1d2d36]">{t("Ativar")}</button>
            )}
          </div>
        </Card>
      )}

      <p className={`${sectionLabel} mb-3`}>{t("Lembretes cadastrados")}</p>
      <div className="space-y-2">
        {reminderItems.length === 0 && (
          <Card><p className="text-center text-sm text-white/55">{t("Nenhum lembrete ativo. Adicione um lembrete ao cadastrar uma dívida.")}</p></Card>
        )}
        {reminderItems.map(item => (
          <button key={`${item.monthKey}-${item.debt.id}-${item.kind}`} onClick={() => { setActiveMonth({ month: Number(item.monthKey.slice(5, 7)) - 1, year: Number(item.monthKey.slice(0, 4)) }); setSelectedDebt(item.debt); open("debts"); }} className={rowBtn}>
            <div className="flex min-w-0 items-center gap-3">
              <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${item.status === "hoje" ? "bg-[#f3c982]/15 text-[#f3c982]" : item.status === "atrasado" ? "bg-red-400/10 text-red-200" : "bg-white/10 text-white/70"}`}>
                <Icon name="bell" size={17} />
              </div>
              <div className="min-w-0 text-left">
                <p className="truncate text-sm font-semibold">{item.debt.title}</p>
                <p className="text-xs text-white/50">{item.kind === "lembrete" ? t("Lembrete") : t("Vencimento")} · {fmtDate(item.date)} · {fmt(item.debt.value)}</p>
              </div>
            </div>
            <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${item.status === "hoje" ? "bg-[#f3c982]/15 text-[#f3c982]" : item.status === "atrasado" ? "bg-red-400/10 text-red-200" : "bg-white/10 text-white/55"}`}>
              {item.status === "hoje" ? t("Hoje") : item.status === "atrasado" ? t("Atrasado") : t("Ativo")}
            </span>
          </button>
        ))}
      </div>
    </>
  );

  else if (view === "settings") content = (
    <>
      <Header />
      {currentUser && (
        <Card className="mb-4 flex items-center gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15 text-lg font-bold" aria-hidden="true">
            {currentUser.name[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{currentUser.name}</p>
            <p className="truncate text-xs text-white/55">{currentUser.email}</p>
          </div>
        </Card>
      )}
      <div className="space-y-3">
        <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
          <p className="mb-2 text-sm font-semibold">{t("Orçamento mensal")}</p>
          <input type="number" min="1" defaultValue={budget} key={budget}
            aria-label={t("Orçamento mensal")}
            onBlur={async e => { const v = Number(e.target.value); if (v > 0) { try { await persistBudget(v); notify("Orçamento atualizado."); } catch (error) { notify(error instanceof Error ? error.message : "Erro ao atualizar orçamento.", true); } } else { e.target.value = String(budget); } }}
            className={`${inputWhite} text-lg font-semibold`} />
        </div>
        <button onClick={async () => { const next = !darkMode; setDarkMode(next); if (currentUser) { const { error } = await supabase.from("profiles").update({ dark_mode: next }).eq("id", currentUser.id); if (error) notify(error.message, true); } }} className={rowBtn} aria-pressed={darkMode}>
          <div className="flex items-center gap-3">
            <Icon name={darkMode ? "sun" : "moon"} size={18} />
            <div>
              <p className="text-sm font-semibold">{t("Modo escuro")}</p>
              <p className="text-xs text-white/55">{darkMode ? t("Ativado") : t("Desativado")}</p>
            </div>
          </div>
          <div className={`relative h-6 w-11 rounded-full transition-colors duration-300 ${darkMode ? "bg-[#c8e5dd]" : "bg-white/25"}`} aria-hidden="true">
            <span className={`absolute top-1 size-4 rounded-full bg-white shadow transition-all duration-300 ${darkMode ? "left-6" : "left-1"}`} />
          </div>
        </button>
        <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
          <div className="mb-3 flex items-center gap-3">
            <Icon name="card" size={18} />
            <p className="text-sm font-semibold">{t("Moeda padrão")}</p>
          </div>
          <div className="flex gap-2" role="group" aria-label={t("Selecionar moeda")}>
            {(Object.entries(CURRENCIES) as [Currency, (typeof CURRENCIES)[Currency]][]).map(([k, v]) => (
              <button key={k} onClick={async () => { setCurrency(k); if (currentUser) { const { error } = await supabase.from("profiles").update({ currency: k }).eq("id", currentUser.id); if (error) { notify(error.message, true); return; } } notify(`Moeda: ${k}`); }}
                aria-pressed={currency === k}
                className={`flex-1 rounded-xl py-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${currency === k ? "bg-white text-[#203d4f]" : "bg-white/10 text-white/65 hover:bg-white/20"}`}>
                {v.symbol} {k}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
          <div className="mb-3 flex items-center gap-3">
            <Icon name="globe" size={18} />
            <p className="text-sm font-semibold">{t("Idioma")}</p>
          </div>
          <div className="space-y-2" role="group" aria-label={t("Selecionar idioma")}>
            {(["pt-BR", "en-US", "es-ES"] as Language[]).map(k => (
              <button key={k} onClick={async () => { setLanguage(k); localStorage.setItem("aoshiro_language", k); if (currentUser) { const { error } = await supabase.from("profiles").update({ language: k }).eq("id", currentUser.id); if (error) notify(error.message, true); } }}
                aria-pressed={language === k}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${language === k ? "bg-white text-[#203d4f]" : "bg-white/10 text-white/65 hover:bg-white/20"}`}>
                {t(k === "pt-BR" ? "Português (Brasil)" : k === "en-US" ? "English (US)" : "Español")}
                {language === k && <Icon name="check" size={15} />}
              </button>
            ))}
          </div>
        </div>
        {([["bell", "Notificações", "Lembretes de vencimento"], ["user", "Suporte", "Falar com a equipe"]] as const).map(([ic, a, b]) => (
          <button key={a} onClick={() => a === "Notificações" ? open("notifications") : notify(`${t(a)}: ${t("em breve.")}`)} className={rowBtn}>
            <div className="flex items-center gap-3">
              <Icon name={ic} size={18} />
              <div>
                <p className="text-sm font-semibold">{t(a)}</p>
                <p className="text-xs text-white/55">{t(b)}</p>
              </div>
            </div>
            <Icon name="arrow" size={16} />
          </button>
        ))}
      </div>
      <button onClick={async () => { await supabase.auth.signOut(); setCurrentUser(null); open("login"); }} className={`mt-6 ${btnGhost}`}>{t("Sair da conta")}</button>
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
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#f3c982]/25 bg-[#f3c982]/10 px-4 py-3">
          <span className="mt-0.5 text-base" aria-hidden="true">ℹ️</span>
          <p className="text-xs leading-relaxed text-[#f3c982]/90">{t("Esta tela é apenas para")}<strong>{t("registrar")}</strong> {t("como o pagamento foi feito. Nenhuma cobrança ou transferência é realizada aqui.")}
          </p>
        </div>

        <Card className="mb-4">
          <p className={sectionLabel}>{t("Dívida selecionada")}</p>
          <h2 className="mt-2 text-xl font-semibold">{selectedDebt?.title}</h2>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-[#c8e5dd]">{selectedDebt && fmt(selectedDebt.value)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-xl bg-white/10 px-3 py-1 text-xs text-white/55">{selectedDebt?.category}</span>
            <span className="rounded-xl bg-white/10 px-3 py-1 text-xs text-white/55">{t("Vence")} {fmtDate(selectedDebt?.due ?? "")}</span>
            {selectedDebt?.reminder && <span className="rounded-xl bg-white/10 px-3 py-1 text-xs text-white/55">🔔 {fmtDate(selectedDebt.reminder)}</span>}
          </div>
        </Card>

        <p className={`mb-3 ${sectionLabel}`}>{t("Como foi pago")}</p>
        <div className="mb-4 space-y-2" role="radiogroup" aria-label={t("Selecionar forma de pagamento")}>
          {methods.map(m => {
            const active = payMethod === m.id;
            return (
              <button key={m.id} type="button" onClick={() => setPayMethod(m.id)}
                role="radio" aria-checked={active}
                className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${active ? "border-[#c8e5dd]/40 bg-[#c8e5dd]/10" : "border-white/10 bg-white/10 hover:bg-white/15"}`}>
                <span className="text-2xl" aria-hidden="true">{m.emoji}</span>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${active ? "text-[#c8e5dd]" : "text-white"}`}>{t(m.label)}</p>
                  <p className="text-xs text-white/50">{t(m.sub)}</p>
                </div>
                <div className={`grid size-5 place-items-center rounded-full border-2 transition ${active ? "border-[#c8e5dd] bg-[#c8e5dd]" : "border-white/30"}`} aria-hidden="true">
                  {active && <div className="size-2 rounded-full bg-[#1d2d36]" />}
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
          <form onSubmit={saveInitialBudget} className="w-full max-w-sm rounded-3xl border border-white/15 bg-[#294a60] p-6 shadow-2xl">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#c8e5dd]/15 text-[#c8e5dd]">
              <Icon name="chart" size={24} />
            </div>
            <h2 id="budget-prompt-title" className="mt-4 text-center text-xl font-semibold">{t("Defina seu orçamento mensal")}</h2>
            <p className="mt-2 text-center text-sm leading-relaxed text-white/60">{t("Para começar a organizar suas finanças, informe quanto você pretende gastar por mês.")}</p>
            <label className="mt-5 block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-white/60">{t("Orçamento mensal (R$)")}</span>
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
    </main>
  );
}

export default function App() {
  return supabaseConfigured ? <AppContent /> : <SupabaseConfigMessage />;
}
