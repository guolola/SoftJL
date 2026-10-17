// Supplies the source's group names explicitly for the installed runtime's narrower TypeScript inference.
export * from "@assistant-ui/react";
import { Children, cloneElement, createElement, forwardRef, isValidElement, type ComponentPropsWithoutRef, type ComponentRef, type ReactNode } from "react";
import { MessagePrimitive as OriginalMessage } from "@assistant-ui/react";
import { ConversationQuestions } from "./conversation-questions";
import { groupPartByType as group } from "@assistant-ui/react";
export const groupPartByType = group<"group-chainOfThought" | "group-reasoning" | "group-source" | "group-tool">;

// Keep upstream message/footer markup intact and mount the question controls inside its text region.
const Root = forwardRef<ComponentRef<typeof OriginalMessage.Root>, ComponentPropsWithoutRef<typeof OriginalMessage.Root> & { "data-role"?: string }>(function Root({ children, ...props }, ref) {
  const content = props["data-role"] === "assistant" ? Children.map(children, (child, index) => index === 0 && isValidElement<{ children?: ReactNode }>(child)
    ? cloneElement(child, {}, child.props.children, createElement(ConversationQuestions)) : child) : children;
  return createElement(OriginalMessage.Root, { ...props, ref }, content);
});
export const MessagePrimitive = { ...OriginalMessage, Root };
