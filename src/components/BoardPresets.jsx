import { useI18n } from "../lib/i18n";

const PRESETS = [
  // ── Row 1: Project management ──
  {
    id: "kanban",
    emoji: "📋",
    columns: {
      en: [
        { title: "To Do", emoji: "📝" },
        { title: "In Progress", emoji: "🔨" },
        { title: "Done", emoji: "✅" },
      ],
      fr: [
        { title: "A faire", emoji: "📝" },
        { title: "En cours", emoji: "🔨" },
        { title: "Terminé", emoji: "✅" },
      ],
    },
  },
  {
    id: "sprint",
    emoji: "🏃",
    columns: {
      en: [
        { title: "Backlog", emoji: "📦" },
        { title: "Sprint", emoji: "🏃" },
        { title: "In Review", emoji: "🔍" },
        { title: "Done", emoji: "✅" },
      ],
      fr: [
        { title: "Backlog", emoji: "📦" },
        { title: "Sprint", emoji: "🏃" },
        { title: "En revue", emoji: "🔍" },
        { title: "Terminé", emoji: "✅" },
      ],
    },
  },
  {
    id: "okr",
    emoji: "🏆",
    columns: {
      en: [
        { title: "Objectives", emoji: "🎯" },
        { title: "Key Results", emoji: "📊" },
        { title: "In Progress", emoji: "🔨" },
        { title: "Achieved", emoji: "✅" },
      ],
      fr: [
        { title: "Objectifs", emoji: "🎯" },
        { title: "Résultats clés", emoji: "📊" },
        { title: "En cours", emoji: "🔨" },
        { title: "Atteint", emoji: "✅" },
      ],
    },
  },
  // ── Row 2: Personal organization ──
  {
    id: "today",
    emoji: "⏰",
    columns: {
      en: [
        { title: "Today", emoji: "🔥" },
        { title: "Tomorrow", emoji: "👀" },
        { title: "This Week", emoji: "📅" },
        { title: "To Do", emoji: "📝" },
        { title: "Done", emoji: "✅" },
      ],
      fr: [
        { title: "Aujourd'hui", emoji: "🔥" },
        { title: "Demain", emoji: "👀" },
        { title: "Cette semaine", emoji: "📅" },
        { title: "A faire", emoji: "📝" },
        { title: "Terminé", emoji: "✅" },
      ],
    },
  },
  {
    id: "weekly",
    emoji: "📅",
    columns: {
      en: [
        { title: "Monday", emoji: "1️⃣" },
        { title: "Tuesday", emoji: "2️⃣" },
        { title: "Wednesday", emoji: "3️⃣" },
        { title: "Thursday", emoji: "4️⃣" },
        { title: "Friday", emoji: "5️⃣" },
      ],
      fr: [
        { title: "Lundi", emoji: "1️⃣" },
        { title: "Mardi", emoji: "2️⃣" },
        { title: "Mercredi", emoji: "3️⃣" },
        { title: "Jeudi", emoji: "4️⃣" },
        { title: "Vendredi", emoji: "5️⃣" },
      ],
    },
  },
  {
    id: "ideas",
    emoji: "💡",
    columns: {
      en: [
        { title: "Ideas", emoji: "💡" },
        { title: "Exploring", emoji: "🔬" },
        { title: "Validated", emoji: "✅" },
        { title: "Dropped", emoji: "🗑️" },
      ],
      fr: [
        { title: "Idées", emoji: "💡" },
        { title: "En exploration", emoji: "🔬" },
        { title: "Validé", emoji: "✅" },
        { title: "Abandonné", emoji: "🗑️" },
      ],
    },
  },
  // ── Row 3: Thinking & decisions ──
  {
    id: "eisenhower",
    emoji: "🎯",
    columns: {
      en: [
        { title: "Urgent & Important", emoji: "🔴" },
        { title: "Important, Not Urgent", emoji: "🟡" },
        { title: "Urgent, Not Important", emoji: "🟠" },
        { title: "Neither", emoji: "⚪" },
      ],
      fr: [
        { title: "Urgent & Important", emoji: "🔴" },
        { title: "Important, Pas Urgent", emoji: "🟡" },
        { title: "Urgent, Pas Important", emoji: "🟠" },
        { title: "Ni l'un ni l'autre", emoji: "⚪" },
      ],
    },
  },
  {
    id: "pros_cons",
    emoji: "⚖️",
    columns: {
      en: [
        { title: "Pros", emoji: "👍" },
        { title: "Cons", emoji: "👎" },
        { title: "Questions", emoji: "❓" },
      ],
      fr: [
        { title: "Pour", emoji: "👍" },
        { title: "Contre", emoji: "👎" },
        { title: "Questions", emoji: "❓" },
      ],
    },
  },
  {
    id: "retro",
    emoji: "🔄",
    columns: {
      en: [
        { title: "What went well", emoji: "😊" },
        { title: "What to improve", emoji: "🤔" },
        { title: "Action items", emoji: "⚡" },
      ],
      fr: [
        { title: "Ce qui a marché", emoji: "😊" },
        { title: "A améliorer", emoji: "🤔" },
        { title: "Actions", emoji: "⚡" },
      ],
    },
  },
];

export default function BoardPresets({ onSelect, children }) {
  const { t, locale } = useI18n();
  const lang = locale === "fr" ? "fr" : "en";

  return (
    <div className="presets-overlay">
      {/* The panel, not the overlay, is the scroll container: the overlay keeps
          pointer-events: none so clicks fall through to "add a column" behind
          it, and a pointer-events: none element cannot be scrolled by touch. */}
      <div className="presets-panel">
        <div className="presets-title">{t("presets.title")}</div>
        <div className="presets-subtitle">{t("presets.subtitle")}</div>
        <div className="presets-grid">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              className="preset-card"
              onClick={() => onSelect(preset.columns[lang])}
            >
              <span className="preset-emoji">{preset.emoji}</span>
              <span className="preset-name">{t(`presets.${preset.id}`)}</span>
              <span className="preset-cols">
                {preset.columns[lang].map((c) => c.title).join(" · ")}
              </span>
            </button>
          ))}
        </div>

        {/* "Start from scratch" lives inside the panel: overlaying it behind the
            presets left it unreachable once the list filled the screen. */}
        {children && <div className="presets-scratch">{children}</div>}
      </div>
    </div>
  );
}
