// Uses the supplied expandable-card template directly; only project data, entry routing and accessibility are integrated.
"use client";

import { useLayoutEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useOutsideClick } from "../../../shared/hooks/use-outside-click";
import { useTranslation } from "react-i18next";
import { Archive, ArrowUpRight, Clock3, UserRound, Users } from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { HoverEffect } from "../../../shared/ui/aceternity/card-hover-effect";
import { CraftButton, CraftButtonIcon, CraftButtonLabel } from "../../../shared/ui/craft-button";
import { AnimatedTooltip } from "../../../shared/ui/motion-tooltip";
import type { StaticProject } from "../lib/project-presentation";
import { ProjectModeBadge } from "./project-mode-badge";

export function ProjectExpandableCards({ projects, onNavigate }: {
  projects: StaticProject[];
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation();
  const cards = projects.map((project) => ({
    id: project.id,
    link: `/projects/${project.id}`,
    backgroundKey: project.background?.key,
    title: project.name,
    description: project.description,
    src: project.background?.imageUrl,
    content: () => (
      <>
        <ProjectModeBadge mode={project.projectMode} />
        {project.status === "archived" && <Badge variant="outline">{project.statusLabel}</Badge>}
        <p className="flex min-w-0 items-center gap-2"><UserRound className="size-3.5 shrink-0" aria-hidden="true" /><span>{t("projects.ownerPrefix", { owner: project.owner })}</span></p>
        <p className="flex min-w-0 items-center gap-2">{project.status === "archived" ? <Archive className="size-3.5 shrink-0" aria-hidden="true" /> : <Users className="size-3.5 shrink-0" aria-hidden="true" />}<span>{t("projects.memberCount", { count: project.memberCount })}</span></p>
        <p className="flex min-w-0 items-center gap-2"><Clock3 className="size-3.5 shrink-0" aria-hidden="true" /><span>{t("projects.updatedPrefix", { date: project.updatedAtDisplay })}</span></p>
      </>
    ),
    footer: () => (
      <div className="flex w-full items-center justify-between gap-4 px-4 pb-5 pt-2">
        <div className="flex min-w-0 items-center gap-2">
          <AnimatedTooltip avatarSize="default" tooltipClassName="z-[110]" items={project.members.map((member) => ({
            id: `${project.id}:${member.id}`, image: member.avatarUrl, fallback: member.initial, name: member.label,
            designation: t(`projectShell.membersUi.roles.${member.role}`, { defaultValue: member.role }),
            ariaLabel: t("projects.memberAvatar", { name: member.label }),
          }))} />
          {project.memberCount > project.members.length && <span aria-label={t("projects.otherMembers", { count: project.memberCount - project.members.length })}>+{project.memberCount - project.members.length}</span>}
        </div>
        {/* Motion owns layout transforms; hover transitions must not delay its scale correction. */}
        <CraftButton
          render={<motion.a
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            href={`/projects/${project.id}`}
          />}
          role="link"
          aria-label={`${t("projects.openProject")} ${project.name}`}
          onClick={(event) => { event.preventDefault(); onNavigate(`/projects/${project.id}`); }}
          className="relative -top-1 h-auto shrink-0 gap-1 border-0 px-4! py-3 text-sm font-bold transition-[background-color,color,border-color,box-shadow] dark:border-0"
        >
          <CraftButtonLabel>{t("projects.openProject")}</CraftButtonLabel>
          <CraftButtonIcon className="size-3 shrink-0">
            <ArrowUpRight className="size-2.5 stroke-2 transition-transform duration-500 group-hover/button:rotate-45" />
          </CraftButtonIcon>
        </CraftButton>
      </div>
    ),
  }));
  const [active, setActive] = useState<(typeof cards)[number] | boolean | null>(
    null
  );
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Reserve an existing scrollbar before locking scroll so the shared-layout origin does not shift.
  useLayoutEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const root = document.documentElement;
    const previousScrollbarGutter = root.style.scrollbarGutter;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActive(false);
      if (event.key === "Tab" && active && typeof active === "object" && ref.current) {
        const targets = Array.from(ref.current.querySelectorAll<HTMLElement>('a[href], button, [tabindex="0"]'));
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    if (active && typeof active === "object") {
      if (window.innerWidth > root.clientWidth) root.style.scrollbarGutter = "stable";
      document.body.style.overflow = "hidden";
      ref.current?.querySelector<HTMLElement>("a[href]")?.focus({ preventScroll: true });
    } else {
      triggerRef.current?.focus({ preventScroll: true });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      root.style.scrollbarGutter = previousScrollbarGutter;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active]);

  useOutsideClick(ref, () => setActive(null));

  return (
    <>
      {/* Portal both template layers above the app header; avatar tips sit above the preview at z-110. */}
      {typeof document !== "undefined" && createPortal(<>
      <AnimatePresence>
        {active && typeof active === "object" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            data-testid="project-preview-backdrop"
            className="fixed inset-0 bg-black/20 h-full w-full z-[90]"
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {active && typeof active === "object" ? (
          <div className="fixed inset-0  grid place-items-center z-[100]">
            <motion.button
              key={`button-${active.id}-${id}`}
              layout
              initial={{
                opacity: 0,
              }}
              animate={{
                opacity: 1,
              }}
              exit={{
                opacity: 0,
                transition: {
                  duration: 0.05,
                },
              }}
              className="flex absolute top-2 right-2 lg:hidden items-center justify-center bg-white rounded-full h-6 w-6"
              type="button"
              aria-label={t("common.close")}
              onClick={() => setActive(null)}
            >
              <CloseIcon />
            </motion.button>
            <motion.div
              layoutId={`card-${active.id}-${id}`}
              ref={ref}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`project-title-${id}`}
              className="w-full max-w-[500px]  h-full md:h-fit md:max-h-[90%]  flex flex-col bg-white dark:bg-neutral-900 sm:rounded-3xl overflow-hidden"
            >
              <motion.div layoutId={`image-${active.id}-${id}`}>
                {active.src ? <img
                  width={200}
                  height={200}
                  src={active.src}
                  alt={active.title}
                  className="w-full h-80 lg:h-80 sm:rounded-tr-lg sm:rounded-tl-lg object-cover object-top"
                /> : <div className="h-80 w-full bg-neutral-50 dark:bg-neutral-800" />}
              </motion.div>

              <div>
                <div className="flex justify-between items-start p-4">
                  <div className="min-w-0 flex-1">
                    <motion.h3
                      id={`project-title-${id}`}
                      layoutId={`title-${active.id}-${id}`}
                      className="font-medium text-neutral-700 dark:text-neutral-200 text-base"
                    >
                      {active.title}
                    </motion.h3>
                    <motion.p
                      layoutId={`description-${active.id}-${id}`}
                      className="text-neutral-600 dark:text-neutral-400 text-base"
                    >
                      {active.description}
                    </motion.p>
                  </div>


                </div>
                <div className="pt-4 relative px-4">
                  <motion.div
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-neutral-600 text-xs md:text-sm lg:text-base h-40 md:h-fit pb-2 flex flex-col items-start gap-4 overflow-auto dark:text-neutral-400 [scrollbar-width:none] [-ms-overflow-style:none] [-webkit-overflow-scrolling:touch]"
                  >
                    {typeof active.content === "function"
                      ? active.content()
                      : active.content}
                  </motion.div>
                </div>
                {active.footer()}
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
      </>, document.body)}
      <HoverEffect
        key={cards.map((card) => card.id).join(",")}
        items={cards}
        data-testid="projects-card-grid"
        data-mobile-card-density="single-column"
        className="mx-auto w-full grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] items-start gap-4 py-0"
        renderItem={(card) => (
          <motion.div
            layoutId={`card-${card.id}-${id}`}
            key={card.id}
            role="button"
            tabIndex={0}
            aria-haspopup="dialog"
            aria-label={t("projects.previewProject", { name: card.title })}
            data-background-key={card.backgroundKey}
            onClick={(event) => { triggerRef.current = event.currentTarget; setActive(card); }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                triggerRef.current = event.currentTarget;
                setActive(card);
              }
            }}
            className="relative z-20 h-full p-4 flex flex-col rounded-xl cursor-pointer focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            <div className="flex gap-4 flex-col  w-full">
              <motion.div layoutId={`image-${card.id}-${id}`}>
                {card.src ? <img
                  width={100}
                  height={100}
                  src={card.src}
                  alt={card.title}
                  className="h-60 w-full  rounded-lg object-cover object-top"
                /> : <div className="h-60 w-full rounded-lg bg-neutral-50 dark:bg-neutral-800" />}
              </motion.div>
              <div className="flex justify-center items-center flex-col">
                <motion.h3
                  layoutId={`title-${card.id}-${id}`}
                  className="font-medium text-neutral-800 dark:text-neutral-200 text-center md:text-left text-base"
                >
                  {card.title}
                </motion.h3>
                <motion.p
                  layoutId={`description-${card.id}-${id}`}
                  title={card.description}
                  className="text-neutral-600 dark:text-neutral-400 text-center md:text-left text-base"
                >
                  {card.description}
                </motion.p>
              </div>
            </div>
          </motion.div>
        )}
      />
    </>
  );
}

export const CloseIcon = () => {
  return (
    <motion.svg
      initial={{
        opacity: 0,
      }}
      animate={{
        opacity: 1,
      }}
      exit={{
        opacity: 0,
        transition: {
          duration: 0.05,
        },
      }}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 text-black"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M18 6l-12 12" />
      <path d="M6 6l12 12" />
    </motion.svg>
  );
};
