import { useId } from "react";

type Mode = "chart" | "yoke" | "knit";
type Shortcut = [keys: string, action: string];
type ShortcutGroup = { title: string; shortcuts: Shortcut[] };

const groups: Record<Mode, ShortcutGroup[]> = {
  chart: [
    {
      title: "Draw",
      shortcuts: [
        ["D / F / E / S", "Draw / Fill / Erase / Select"],
        ["I", "Pick yarn colour from the chart"],
        ["[ / ]", "Previous / next yarn colour"],
        ["+ / − / 0", "Zoom in / out / reset"],
      ],
    },
    {
      title: "Edit",
      shortcuts: [
        ["Ctrl or ⌘ + C / X / V", "Copy / Cut / Paste"],
        ["Ctrl or ⌘ + A", "Select all"],
        ["Arrow keys", "Move selection one cell"],
        ["Shift + arrows", "Move selection up to five cells"],
        [
          "Delete / Backspace",
          "Erase selected yarn colours, keep stitch symbols",
        ],
        ["Esc", "Cancel colour picking or deselect"],
        ["Ctrl or ⌘ + Z", "Undo"],
        ["Ctrl or ⌘ + Shift + Z", "Redo (Ctrl + Y also works)"],
      ],
    },
  ],
  yoke: [
    {
      title: "Navigate",
      shortcuts: [["Space + drag", "Pan the shaped chart"]],
    },
  ],
  knit: [
    {
      title: "Follow the chart",
      shortcuts: [
        ["Space / →", "Next step"],
        ["←", "Previous step"],
        ["↑ / ↓", "Next / previous row, round, or section"],
        ["Esc", "Exit Knit Mode (closes this guide first)"],
      ],
    },
  ],
};

const modeLabel: Record<Mode, string> = {
  chart: "Chart Maker",
  yoke: "Circular Yoke",
  knit: "Knit Mode",
};

export function ChartShortcutsDialog({
  mode,
  onClose,
}: {
  mode: Mode;
  onClose: () => void;
}) {
  const titleId = useId();
  return (
    <dialog
      aria-labelledby={titleId}
      className="share-preview-dialog chart-shortcuts"
      ref={(node) => {
        if (node && !node.open) node.showModal();
      }}
      onClose={onClose}
    >
      <div className="share-preview-heading">
        <div>
          <span className="eyebrow">{modeLabel[mode]}</span>
          <h2 id={titleId}>Keyboard shortcuts</h2>
        </div>
        <form method="dialog">
          <button
            className="close-dialog"
            aria-label="Close keyboard shortcuts"
          >
            ×
          </button>
        </form>
      </div>
      {groups[mode].map(({ title, shortcuts }) => (
        <section className="chart-shortcut-group" key={title}>
          <h3>{title}</h3>
          <dl>
            {shortcuts.map(([keys, action]) => (
              <div key={keys}>
                <dt>{action}</dt>
                <dd>
                  <kbd>{keys}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <p className="chart-shortcuts-hint">
        Press <kbd>?</kbd> to open this guide.
      </p>
    </dialog>
  );
}
