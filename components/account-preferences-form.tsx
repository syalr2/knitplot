"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AccountAvatar } from "@/components/account-avatar";
import { ACCOUNT_COLORS, ACCOUNT_SYMBOLS, type AccountAvatar as Avatar, type AccountColor, type AccountSymbol } from "@/lib/account-preferences";

type Props = { initialAvatar: Avatar };

const SYMBOL_LABELS: Record<AccountSymbol, string> = {
  flower: "Flower",
  heart: "Heart",
  star: "Star",
  yarn: "Yarn ball",
};

export function AccountPreferencesForm({ initialAvatar }: Props) {
  const router = useRouter();
  const [avatar, setAvatar] = useState<Avatar>(initialAvatar);
  const [initials, setInitials] = useState(initialAvatar.kind === "initials" ? initialAvatar.value : "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar }),
      });
      const result = await response.json() as { error?: string; avatar?: Avatar };
      if (!response.ok || !result.avatar) throw new Error(result.error ?? "The account icon could not be saved.");
      setAvatar(result.avatar);
      setMessage("Your account icon is saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The account icon could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function chooseInitials(value: string) {
    const cleaned = value.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toLocaleUpperCase();
    setInitials(cleaned);
    if (cleaned) setAvatar({ kind: "initials", value: cleaned, color: avatar.color });
  }

  return (
    <div className="account-avatar-editor">
      <div className="account-avatar-preview"><AccountAvatar avatar={avatar} /></div>
      <div className="account-avatar-options">
        <div className="account-symbol-picker" aria-label="Account icon choices">
          {(Object.keys(ACCOUNT_SYMBOLS) as AccountSymbol[]).map((symbol) => (
            <button
              type="button"
              className={avatar.kind === "symbol" && avatar.value === symbol ? "selected" : ""}
              aria-pressed={avatar.kind === "symbol" && avatar.value === symbol}
              title={SYMBOL_LABELS[symbol]}
              key={symbol}
              onClick={() => setAvatar({ kind: "symbol", value: symbol, color: avatar.color })}
            >
              <AccountAvatar avatar={{ kind: "symbol", value: symbol, color: avatar.color }} />
              <span>{SYMBOL_LABELS[symbol]}</span>
            </button>
          ))}
        </div>
        <label className="account-initials-field">
          <span>Or use one or two letters</span>
          <input value={initials} onChange={(event) => chooseInitials(event.target.value)} maxLength={2} inputMode="text" placeholder="KP" aria-label="Account initials" />
        </label>
        <div className="account-color-field">
          <span>Choose a colour</span>
          <div className="account-color-picker" aria-label="Account icon colour choices">
            {(Object.keys(ACCOUNT_COLORS) as AccountColor[]).map((color) => (
              <button
                type="button"
                key={color}
                className={avatar.color === color ? "selected" : ""}
                aria-label={color.charAt(0).toUpperCase() + color.slice(1)}
                aria-pressed={avatar.color === color}
                onClick={() => setAvatar({ ...avatar, color })}
              ><span style={{ backgroundColor: ACCOUNT_COLORS[color] }} /></button>
            ))}
          </div>
        </div>
        <button className="primary-button account-save-avatar" type="button" onClick={save} disabled={busy || (avatar.kind === "initials" && !avatar.value)}>{busy ? "Saving…" : "Save account icon"}</button>
        {message ? <p className="account-notice" role="status">{message}</p> : null}
      </div>
    </div>
  );
}
