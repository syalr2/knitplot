"use client";

import { useState } from "react";
import Link from "next/link";
import { responseJson } from "@/lib/http";
import type { ChartDocument } from "@/lib/chart";
import type { ClubCoverSettings } from "@/lib/club-cover";
import { yokeRepeatSides } from "@/lib/yoke-repeat-labels";
import { fitsSweaterPhoto } from "@/lib/yoke-photo-preview";
import { ClubCoverFabric } from "./club-cover-fabric";
import { ClubCopyLink } from "./club-copy-link";

export function ClubShareForm({
  sourceId,
  sourceVersion,
  title,
  description,
  document,
  initialCover,
}: {
  sourceId: string;
  sourceVersion: number;
  title: string;
  description: string;
  document: ChartDocument;
  initialCover: ClubCoverSettings;
}) {
  const [id, setId] = useState<string | null>(null);
  const [cover, setCover] = useState(initialCover);
  const sweaterUnavailable =
    cover.kind === "yoke" &&
    cover.view === "sweater" &&
    !fitsSweaterPhoto(document);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (id)
    return (
      <div className="club-share-form">
        <p role="status">Your chart is now public.</p>
        <div className="club-share-actions">
          <ClubCopyLink id={id} placement="after_publish" />
          <Link
            className="chart-club-link club-view-public"
            href={`/chart-club/${id}`}
          >
            View public chart <span aria-hidden="true">→</span>
          </Link>
          <Link className="chart-club-link" href="/my-charts?tab=published">
            Published charts
          </Link>
        </div>
      </div>
    );

  return (
    <form
      className="club-share-form"
      onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        void submit(async () => {
          const response = await fetch("/api/chart-club", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sourceId,
              sourceVersion,
              cover,
              title: fields.get("title"),
              description: fields.get("description"),
              confirmRights: fields.has("rights"),
              shareYokeMeasurements: fields.has("measurements"),
            }),
          });
          const post = await responseJson<{ id: string }>(response);
          setId(post.id);
        });
      }}
    >
      <fieldset disabled={busy}>
        <label>
          Public title
          <input name="title" required defaultValue={title} maxLength={200} />
        </label>
        <label>
          Description (optional)
          <textarea
            name="description"
            defaultValue={description}
            maxLength={1200}
            rows={4}
          />
        </label>
        <p>
          Anyone can save and edit their own copy. Your original stays private.
        </p>
        <section
          className="club-share-cover"
          aria-labelledby="club-share-cover-title"
        >
          <h2 id="club-share-cover-title">Gallery cover</h2>
          <div className="club-share-cover-controls">
            {cover.kind === "yoke" ? (
              <>
                <label>
                  View
                  <select
                    value={cover.view}
                    onChange={(e) =>
                      setCover({
                        ...cover,
                        view: e.target.value as typeof cover.view,
                      })
                    }
                  >
                    <option value="whole">Whole yoke</option>
                    <option value="front">Front half</option>
                    <option value="back">Back half</option>
                    <option value="repeat">One repeat</option>
                    <option value="sweater">Sweater</option>
                  </select>
                </label>
                {cover.view === "repeat" && document.yoke && (
                  <label>
                    Preview repeat
                    <select
                      value={cover.repeat}
                      onChange={(e) =>
                        setCover({ ...cover, repeat: Number(e.target.value) })
                      }
                    >
                      {yokeRepeatSides(document.yoke.measurements.repeats).map(
                        ({ name, repeats }) => (
                          <optgroup key={name} label={name}>
                            {repeats.map(({ number, section }) => (
                              <option key={section} value={section}>
                                {number} · {name}
                              </option>
                            ))}
                          </optgroup>
                        ),
                      )}
                    </select>
                  </label>
                )}
              </>
            ) : (
              <>
                {(["across", "down"] as const).map((dimension) => (
                  <label key={dimension}>
                    {dimension === "across" ? "Across" : "Down"}
                    <select
                      value={cover[dimension]}
                      onChange={(e) =>
                        setCover({
                          ...cover,
                          [dimension]: Number(e.target.value),
                        })
                      }
                    >
                      {[1, 2, 3].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <label>
                  Repeat style
                  <select
                    value={cover.style}
                    onChange={(e) =>
                      setCover({
                        ...cover,
                        style:
                          e.target.value === "mirrored" ? "mirrored" : "normal",
                      })
                    }
                  >
                    <option value="normal">Normal</option>
                    <option value="mirrored">Mirrored</option>
                  </select>
                </label>
              </>
            )}
          </div>
          <div className="club-share-cover-preview">
            <ClubCoverFabric document={document} cover={cover} />
          </div>
        </section>
        {document.yoke && (
          <label>
            <input type="checkbox" name="measurements" required /> I’m okay with
            sharing this yoke’s saved measurements in editable copies.
          </label>
        )}
        <label>
          <input type="checkbox" name="rights" required /> I made this chart or
          have permission to share it.
        </label>
        <div className="club-share-actions">
          <button
            className="primary-button"
            type="submit"
            disabled={sweaterUnavailable}
          >
            Share to Chart Club
          </button>
        </div>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
