import { Component } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useI18n } from "../i18n";

/**
 * Catches render/lifecycle errors in a subtree so one faulty widget
 * (e.g. the 3D graph) can never blank out the whole app.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.error) {
      const msg =
        this.state.error && this.state.error.message
          ? this.state.error.message
          : String(this.state.error);
      if (this.props.fallback) return this.props.fallback(msg);
      return (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-warn/40 bg-panel p-6 text-center">
          <AlertTriangle size={22} className="text-warn" />
          <div className="text-sm font-medium text-muted">{msg}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function Spinner({ text }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
      <Loader2 size={22} className="animate-spin text-accent" />
      <span className="text-xs tracking-wide">{text || t("common.loading")}</span>
    </div>
  );
}

export function EmptyState({ title, hint, icon: Icon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      {Icon && <Icon size={26} className="text-faint" />}
      <div className="text-sm font-medium text-muted">{title}</div>
      {hint && <div className="max-w-sm text-xs text-faint">{hint}</div>}
    </div>
  );
}

export function ErrorBar({ message, onRetry }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
      <AlertTriangle size={16} />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded border border-danger/40 px-2.5 py-1 text-xs text-danger hover:bg-danger/20"
        >
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}

export function SectionHeader({ title, meta, right }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <div className="microlabel">{title}</div>
        {meta && <div className="mt-0.5 text-xs text-faint">{meta}</div>}
      </div>
      {right}
    </div>
  );
}

export function StatCard({ label, value, sub, accent }) {
  return (
    <div className="rounded-md border border-line bg-panel px-4 py-3">
      <div className="microlabel">{label}</div>
      <div className={`tnum mt-1.5 font-mono text-2xl font-semibold ${accent || "text-ink"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-faint">{sub}</div>}
    </div>
  );
}

export function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "border-line2 bg-panel2 text-muted",
    teal: "border-accent/40 bg-accent/10 text-accent",
    cyan: "border-accent2/40 bg-accent2/10 text-accent2",
    amber: "border-warn/40 bg-warn/10 text-warn",
    red: "border-danger/40 bg-danger/10 text-danger",
  };
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${tones[tone] || tones.slate}`}
    >
      {children}
    </span>
  );
}

const STATUS_STYLE = {
  ready: { color: "bg-emerald-400", cls: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10" },
  collecting: { color: "bg-warn", cls: "text-warn border-warn/40 bg-warn/10" },
  analyzing: { color: "bg-warn", cls: "text-warn border-warn/40 bg-warn/10" },
  created: { color: "bg-faint", cls: "text-muted border-line2 bg-panel2" },
  error: { color: "bg-danger", cls: "text-danger border-danger/40 bg-danger/10" },
};

export function StatusBadge({ status }) {
  const { t } = useI18n();
  const labels = {
    ready: t("status.ready"),
    collecting: t("status.collecting"),
    analyzing: t("status.analyzing"),
    created: t("status.created"),
    error: t("status.error"),
  };
  const meta = STATUS_STYLE[status] || STATUS_STYLE.created;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[10px] tracking-widest ${meta.cls}`}
    >
      <span
        className={`status-dot h-1.5 w-1.5 rounded-full ${meta.color}`}
        style={{ animation: status === "ready" ? "none" : undefined }}
      />
      {labels[status] || status}
    </span>
  );
}

export function formatCitations(n) {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return String(n ?? 0);
}
