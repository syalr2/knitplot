"use client";

import { useEffect, useMemo, useState } from "react";
import {
  cellAspectRatio,
  ChartDocument,
  defaultInstructionSettings,
  finishedSize,
  InstructionSettings,
} from "@/lib/chart";

type Props = {
  document: ChartDocument;
  onSettingsChange: (settings: InstructionSettings) => void;
};

type ColorRun = { label: string; count: number };

type InstructionRegion = {
  document: ChartDocument;
  hasDesign: boolean;
  trimmed: boolean;
  leftOffset: number;
  bottomOffset: number;
};

function instructionRegion(document: ChartDocument, shouldTrim: boolean): InstructionRegion {
  const backgroundId = document.palette[0]?.id;
  let minimumRow = document.height;
  let maximumRow = -1;
  let minimumColumn = document.width;
  let maximumColumn = -1;

  document.cells.forEach((row, rowIndex) => {
    row.forEach((colorId, columnIndex) => {
      if (colorId === backgroundId) return;
      minimumRow = Math.min(minimumRow, rowIndex);
      maximumRow = Math.max(maximumRow, rowIndex);
      minimumColumn = Math.min(minimumColumn, columnIndex);
      maximumColumn = Math.max(maximumColumn, columnIndex);
    });
  });

  const hasDesign = maximumRow >= minimumRow && maximumColumn >= minimumColumn;
  if (!shouldTrim || !hasDesign) {
    return { document, hasDesign, trimmed: false, leftOffset: 0, bottomOffset: 0 };
  }

  const width = maximumColumn - minimumColumn + 1;
  const height = maximumRow - minimumRow + 1;
  const cells = document.cells
    .slice(minimumRow, maximumRow + 1)
    .map((row) => row.slice(minimumColumn, maximumColumn + 1));

  return {
    document: { ...document, width, height, cells },
    hasDesign,
    trimmed: width !== document.width || height !== document.height,
    leftOffset: minimumColumn,
    bottomOffset: document.height - maximumRow - 1,
  };
}

function colorLabels(document: ChartDocument) {
  return new Map(document.palette.map((color, index) => [
    color.id,
    index === 0 ? "MC" : `CC${index}`,
  ]));
}

function compressRow(row: string[], labels: Map<string, string>): ColorRun[] {
  return row.reduce<ColorRun[]>((runs, colorId) => {
    const label = labels.get(colorId) ?? "?";
    const previous = runs[runs.length - 1];
    if (previous?.label === label) previous.count += 1;
    else runs.push({ label, count: 1 });
    return runs;
  }, []);
}

function writtenRows(document: ChartDocument, settings: InstructionSettings) {
  const labels = colorLabels(document);
  if (settings.technique === "duplicate") labels.set(document.palette[0].id, "Skip");
  return Array.from({ length: document.height }, (_, index) => {
    const number = index + 1;
    const source = document.cells[document.height - number] ?? [];
    const isDuplicate = settings.technique === "duplicate";
    const isRound = !isDuplicate && settings.construction === "round";
    const rightSide = number % 2 === 1;
    const readRightToLeft = !isDuplicate && (isRound || rightSide);
    const ordered = readRightToLeft ? [...source].reverse() : source;
    const sequence = compressRow(ordered, labels)
      .map((run) => `${run.label} ${run.count}`)
      .join(", ");

    return {
      number,
      side: isDuplicate || isRound ? "" : rightSide ? "RS" : "WS",
      sequence,
    };
  });
}

function techniqueInstructions(settings: InstructionSettings) {
  if (settings.technique === "intarsia") {
    return settings.construction === "round"
      ? "Use a separate yarn supply for each distinct colour area and link the yarns at every colour change. Intarsia in the round requires a specialised method; the sequences below describe the colour order but not that construction method."
      : "Use a separate yarn supply for each distinct colour area. At every colour change, bring the new colour under the old colour to link the sections and prevent gaps.";
  }
  if (settings.technique === "duplicate") {
    return "First knit the piece in MC. After blocking, use the chart and written rows to embroider each coloured stitch over the corresponding MC stitch.";
  }
  return "Work in stockinette colourwork, carrying colours not in use across the back of the fabric. The written sequences show the order in which stitches are worked.";
}

const PRINT_SYMBOLS = ["·", "×", "○", "+", "△", "□", "◇", "●"];

function PrintableChart({ document, showSymbols }: { document: ChartDocument; showSymbols: boolean }) {
  const stitchWidth = cellAspectRatio(document);
  const width = document.width * stitchWidth;
  const height = document.height;
  const labelSize = Math.max(0.55, Math.min(1.1, height / 35));
  const leftMargin = labelSize * 2.3;
  const topMargin = labelSize * 1.7;
  const bottomMargin = labelSize * 1.7;
  const columnStep = document.width > 40 ? 10 : 5;
  const rowStep = document.height > 24 ? 5 : 1;
  const palette = new Map(document.palette.map((color) => [color.id, color.hex]));
  const symbols = new Map(document.palette.map((color, index) => [color.id, PRINT_SYMBOLS[index] ?? "?"]));
  const verticalLines = Array.from({ length: document.width + 1 }, (_, column) => {
    const x = column * stitchWidth;
    return <line key={`v-${column}`} x1={x} y1={0} x2={x} y2={height} className={column % 5 === 0 ? "instruction-grid-major" : "instruction-grid-line"} />;
  });
  const horizontalLines = Array.from({ length: document.height + 1 }, (_, row) => (
    <line key={`h-${row}`} x1={0} y1={row} x2={width} y2={row} className={row % 5 === 0 ? "instruction-grid-major" : "instruction-grid-line"} />
  ));

  return (
    <svg className="instructions-chart" viewBox={`${-leftMargin} ${-topMargin} ${width + leftMargin} ${height + topMargin + bottomMargin}`} role="img" aria-label={`${document.width} stitch by ${document.height} row chart`}>
      {document.cells.flatMap((row, rowIndex) => row.map((colorId, columnIndex) => (
        <rect
          key={`${rowIndex}-${columnIndex}`}
          x={columnIndex * stitchWidth}
          y={rowIndex}
          width={stitchWidth}
          height={1}
          fill={palette.get(colorId) ?? "#ffffff"}
        />
      )))}
      {showSymbols ? document.cells.flatMap((row, rowIndex) => row.map((colorId, columnIndex) => (
        <text
          className="instruction-cell-symbol"
          key={`symbol-${rowIndex}-${columnIndex}`}
          x={(columnIndex + 0.5) * stitchWidth}
          y={rowIndex + 0.69}
          textAnchor="middle"
          fontSize={Math.min(0.68, stitchWidth * 0.55)}
        >{symbols.get(colorId)}</text>
      ))) : null}
      {verticalLines}
      {horizontalLines}
      {Array.from({ length: document.width }, (_, index) => (
        (index + 1) % columnStep === 0
          ? <text key={`column-label-${index}`} x={(index + 0.5) * stitchWidth} y={-labelSize * 0.45} textAnchor="middle" fontSize={labelSize}>{index + 1}</text>
          : null
      ))}
      {Array.from({ length: document.height }, (_, index) => {
        const rowNumber = document.height - index;
        return rowNumber % rowStep === 0
          ? <text key={`row-label-${index}`} x={-labelSize * 0.45} y={index + 0.7} textAnchor="end" fontSize={labelSize}>{rowNumber}</text>
          : null;
      })}
    </svg>
  );
}

export function InstructionsView({ document, onSettingsChange }: Props) {
  const [open, setOpen] = useState(false);
  const settings = useMemo(
    () => ({ ...defaultInstructionSettings, ...document.instructions }),
    [document.instructions],
  );
  const region = useMemo(
    () => instructionRegion(document, settings.trimBackground),
    [document, settings.trimBackground],
  );
  const instructionDocument = region.document;
  const rows = useMemo(() => writtenRows(instructionDocument, settings), [instructionDocument, settings]);
  const size = useMemo(() => finishedSize(instructionDocument), [instructionDocument]);
  const isDuplicate = settings.technique === "duplicate";
  const unitName = isDuplicate ? "Row" : settings.construction === "round" ? "Round" : "Row";

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function updateSetting<Key extends keyof InstructionSettings>(key: Key, value: InstructionSettings[Key]) {
    onSettingsChange({ ...settings, [key]: value });
  }

  return (
    <>
      <button className="secondary-button" onClick={() => setOpen(true)}>Instructions</button>
      {open ? (
        <div className="modal-backdrop instructions-backdrop" role="presentation">
          <section className="import-dialog instructions-dialog" role="dialog" aria-modal="true" aria-labelledby="instructions-title">
            <div className="import-dialog-heading no-print">
              <div><p className="eyebrow">Pattern details</p><h1 id="instructions-title">Knitting instructions</h1></div>
              <button className="close-dialog" aria-label="Close instructions" onClick={() => setOpen(false)}>×</button>
            </div>

            <div className="instruction-settings no-print">
              <label>Technique
                <select value={settings.technique} onChange={(event) => updateSetting("technique", event.target.value as InstructionSettings["technique"])}>
                  <option value="stranded">Stranded colourwork</option>
                  <option value="intarsia">Intarsia</option>
                  <option value="duplicate">Duplicate stitch</option>
                </select>
              </label>
              {!isDuplicate ? (
                <label>Construction
                  <select value={settings.construction} onChange={(event) => updateSetting("construction", event.target.value as InstructionSettings["construction"])}>
                    <option value="flat">Worked flat</option>
                    <option value="round">In the round</option>
                  </select>
                </label>
              ) : null}
              <label>Pattern use
                <select value={settings.patternUse} onChange={(event) => updateSetting("patternUse", event.target.value as InstructionSettings["patternUse"])}>
                  <option value="single">Single motif</option>
                  <option value="repeat">Repeating pattern</option>
                </select>
              </label>
              <label className="instruction-trim-option">
                <input
                  type="checkbox"
                  checked={settings.trimBackground}
                  onChange={(event) => updateSetting("trimBackground", event.target.checked)}
                />
                <span><strong>Trim empty background</strong><small>Crop the instruction chart to the smallest rectangle containing the colourwork.</small></span>
              </label>
              <label className="instruction-trim-option">
                <input
                  type="checkbox"
                  checked={settings.showSymbols}
                  onChange={(event) => updateSetting("showSymbols", event.target.checked)}
                />
                <span><strong>Show colour symbols</strong><small>Add a distinct symbol to every chart cell and the colour key for easier grayscale printing.</small></span>
              </label>
              {settings.trimBackground && !region.hasDesign ? <p className="instruction-setting-note">Add at least one non-background stitch before trimming.</p> : null}
              {settings.trimBackground && region.hasDesign && !region.trimmed ? <p className="instruction-setting-note">The design already reaches every outer edge, so there is no empty border to trim.</p> : null}
              {settings.trimBackground && region.hasDesign && settings.patternUse === "repeat" ? <p className="instruction-setting-note">The trimmed width becomes the new repeat width, so any removed background spacing will not appear between repeats.</p> : null}
            </div>

            <article className="instruction-sheet">
              <header className="instruction-title-block">
                <p className="eyebrow">Colorwork knitting chart</p>
                <h1>{document.name || "Untitled chart"}</h1>
                <p>{instructionDocument.width} stitches × {instructionDocument.height} rows · Approximately {size.width.toFixed(1)} × {size.height.toFixed(1)} {document.gaugeUnit}</p>
                {region.trimmed ? (
                  <p className="instruction-crop-note">
                    Trimmed from the original {document.width} × {document.height} chart. The motif begins {region.leftOffset} {region.leftOffset === 1 ? "stitch" : "stitches"} from the left and {region.bottomOffset} {region.bottomOffset === 1 ? "row" : "rows"} from the bottom.
                  </p>
                ) : null}
              </header>

              <PrintableChart document={instructionDocument} showSymbols={settings.showSymbols} />

              <section className="instruction-section instruction-overview">
                <div><strong>Technique</strong><span>{settings.technique === "stranded" ? "Stranded colourwork" : settings.technique === "intarsia" ? "Intarsia" : "Duplicate stitch"}</span></div>
                {!isDuplicate ? <div><strong>Construction</strong><span>{settings.construction === "flat" ? "Worked flat" : "In the round"}</span></div> : null}
                <div><strong>Pattern</strong><span>{settings.patternUse === "single" ? "Single motif" : `${instructionDocument.width}-stitch repeat`}</span></div>
                <div><strong>Gauge</strong><span>{document.gaugeStitches} sts and {document.gaugeRows} rows over {document.gaugeMeasure} {document.gaugeUnit}</span></div>
              </section>

              <section className="instruction-section">
                <h2>Colour key</h2>
                <div className="instruction-colours">
                  {document.palette.map((color, index) => (
                    <div key={color.id}><span className="instruction-swatch" style={{ background: color.hex }} />{settings.showSymbols ? <b className="instruction-key-symbol">{PRINT_SYMBOLS[index] ?? "?"}</b> : null}<strong>{index === 0 ? "MC" : `CC${index}`}</strong><span>{index === 0 ? "Main/background colour" : `Contrast colour ${index}`}</span><code>{color.hex.toUpperCase()}</code></div>
                  ))}
                </div>
              </section>

              <section className="instruction-section">
                <h2>How to work the chart</h2>
                <p>{techniqueInstructions(settings)}</p>
                <p>
                  Begin with {unitName.toLowerCase()} 1 at the bottom of the chart. {isDuplicate
                    ? "Follow each chart row from left to right, or embroider the duplicate stitches in any order that feels comfortable."
                    : settings.construction === "round"
                      ? "Read every round from right to left."
                      : "Read right-side rows from right to left and wrong-side rows from left to right."}
                  {settings.patternUse === "repeat"
                    ? ` Repeat the full ${instructionDocument.width}-stitch chart across the work as needed.`
                    : " Work the chart once, positioning the motif as required in your project."}
                </p>
              </section>

              <section className="instruction-section written-instructions">
                <h2>Written {isDuplicate ? "rows" : settings.construction === "round" ? "rounds" : "rows"}</h2>
                <p className="instruction-note">
                  {settings.technique === "duplicate"
                    ? "Sequences are written in chart-reading order. Skip counts are base stitches left unembroidered; other counts are duplicate stitches worked in that colour."
                    : "Sequences are written in working order. Each number is the number of stitches to work in that colour."}
                </p>
                <ol className="written-row-list">
                  {rows.map((row) => (
                    <li key={row.number}>
                      <strong>{unitName} {row.number}{row.side ? ` (${row.side})` : ""}:</strong> {row.sequence}
                    </li>
                  ))}
                </ol>
              </section>
            </article>

            <div className="import-actions no-print">
              <button onClick={() => setOpen(false)}>Close</button>
              <button className="primary-button" onClick={() => window.print()}>Print instructions</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
