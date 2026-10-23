// assistant-ui homepage source; module paths and UI language adapted, layout/styles preserved. See home-demo/LICENSE.
"use client";

import { memo } from "react";
import type { TextMessagePartComponent } from "@assistant-ui/react";

import { defaultDirectiveFormatter } from "@assistant-ui/react";
import { createDirectiveText as createDirectiveTextBase } from "./directive-text";

export type {
  CreateDirectiveTextOptions,
  DirectiveTextFormatter,
  DirectiveTextSegment,
} from "./directive-text";

/** `Text` message part component that renders directive syntax as inline chips. */
export const DirectiveText: TextMessagePartComponent = memo(
  createDirectiveTextBase(defaultDirectiveFormatter),
);
