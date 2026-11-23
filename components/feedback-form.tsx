"use client";

import { useId, useRef, useState, type FormEvent } from "react";

type Submission = "idle" | "sending" | "sent" | "failed" | "limited" | "empty";

export function FeedbackForm({ formId }: { formId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [submission, setSubmission] = useState<Submission>("idle");
  const busy = submission === "sending";
  const endpoint = `https://formspree.io/f/${formId}`;

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const message = String(fields.get("message") ?? "").trim();
    if (!message) {
      setSubmission("empty");
      return;
    }
    fields.set("message", message);
    setSubmission("sending");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: fields,
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        setSubmission(response.status === 429 ? "limited" : "failed");
        return;
      }
      form.reset();
      setSubmission("sent");
    } catch {
      setSubmission("failed");
    }
  }

  return (
    <>
      <button
        className="feedback-trigger"
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        Request a feature or give feedback
      </button>
      <dialog
        className="share-preview-dialog feedback-dialog"
        ref={dialog}
        aria-labelledby={heading}
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
        onClose={() => {
          if (submission === "sent") setSubmission("idle");
        }}
      >
        <div className="share-preview-heading">
          <h2 id={heading}>KnitPlot feedback</h2>
          <button
            type="button"
            aria-label="Close feedback"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        <p>Tell me what you’d like to see or what isn’t working.</p>
        <form onSubmit={send} action={endpoint} method="post">
          <fieldset className="feedback-fields" disabled={busy}>
            <label>
              Topic
              <select name="topic">
                <option value="Feature request">Feature request</option>
                <option value="Bug report">Bug report</option>
                <option value="General feedback">General feedback</option>
              </select>
            </label>
            <label>
              Message
              <textarea name="message" required maxLength={3000} rows={5} />
            </label>
            <label>
              <span>
                Email{" "}
                <span className="feedback-field-hint">
                  · optional, for a reply
                </span>
              </span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
              />
            </label>
            <input
              type="text"
              name="_gotcha"
              tabIndex={-1}
              autoComplete="off"
              hidden
            />
            <button type="submit" className="primary-button">
              {busy ? "Sending…" : "Send feedback"}
            </button>
          </fieldset>
          {submission === "sent" && (
            <p role="status">Thanks for the feedback!</p>
          )}
          {submission === "failed" && (
            <p role="alert">
              Couldn’t send your feedback. Your message is still here. Please
              try again.
            </p>
          )}
          {submission === "limited" && (
            <p role="alert">
              Too many submissions right now. Please wait a moment and try
              again.
            </p>
          )}
          {submission === "empty" && (
            <p role="alert">Enter a message before sending.</p>
          )}
        </form>
      </dialog>
    </>
  );
}
