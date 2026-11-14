"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Button, Sheet } from "@/components/kit";
import type { AskPassword } from "@/lib/workbench/upload-client";

/**
 * The archive password prompt, shared by every place that uploads to the workbench.
 * `ask(name, wrong)` resolves with the password, or null when the person cancels.
 * The password is never stored: it is sent once with the archive.
 */
export function usePasswordAsk(): [AskPassword, ReactNode] {
  const [state, setState] = useState<{ name: string; wrong: boolean } | null>(null);
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const resolver = useRef<((v: string | null) => void) | null>(null);

  const ask = useCallback<AskPassword>(
    (name, wrong) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setValue("");
        setShow(false);
        setState({ name, wrong });
      }),
    [],
  );
  const done = (v: string | null) => {
    resolver.current?.(v);
    resolver.current = null;
    setState(null);
    setValue("");
  };

  const node = (
    <Sheet
      open={Boolean(state)}
      onClose={() => done(null)}
      size="sm"
      title="This archive has a password"
      description={state ? `Enter the password for ${state.name}. It is used once to open the files and is not kept.` : undefined}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => done(null)}>Cancel</Button>
          <Button disabled={!value} onClick={() => done(value)}>Open the archive</Button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value) done(value);
        }}
      >
        <label htmlFor="archive-password" className="text-[13px] font-medium text-ink">Password</label>
        <div className="mt-1.5 flex items-center gap-2 rounded-ctl border border-hairline bg-cloud px-3 focus-within:border-accent">
          <Lock className="size-4 shrink-0 text-muted" aria-hidden />
          <input
            id="archive-password"
            type={show ? "text" : "password"}
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="min-h-11 min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none"
          />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide the password" : "Show the password"} className="grid size-8 place-items-center rounded-md text-muted hover:text-ink">
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {state?.wrong ? <p className="mt-2 text-[13px] text-bad" role="alert">That password did not open the archive. Try again.</p> : null}
      </form>
    </Sheet>
  );
  return [ask, node];
}
