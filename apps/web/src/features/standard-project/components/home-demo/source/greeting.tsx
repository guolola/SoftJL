// assistant-ui homepage source; module paths and UI language adapted, layout/styles preserved. See home-demo/LICENSE.
"use client";
import { homeText, useHomeLocale } from "../integration/home-locale";


import type { ReactNode } from "react";
import { typeSection } from "./type";
import { useSession } from "../integration/session";

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function Greeting(): ReactNode {
  useHomeLocale();
  const session = useSession();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 mx-auto mb-8 flex w-full max-w-(--thread-max-width) flex-col items-center text-center duration-200">
      <p className={typeSection}>
        {session.status === "signed-in"
          ? homeText(`Welcome back, ${firstName(session.user.name)}.`)
          : homeText("How can I help you today?")}
      </p>
    </div>
  );
}
