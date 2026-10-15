// Renders DOCX style controls for generated requirement/design instruction documents.
import type {
  DocumentLineSpacing,
  DocumentParagraphStyle,
  DocumentStyleSettings,
} from "@uml-platform/contracts";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../shared/ui/select";
import { Switch } from "../../../shared/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../shared/ui/collapsible";
import { cn } from "../../../shared/ui/utils";
import { cloneDefaultDocumentStyle } from "../lib/document-style";

type StyleKey = "heading1" | "heading2" | "heading3" | "body" | "table" | "caption";

type DocumentStyleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: DocumentStyleSettings;
  onChange: (value: DocumentStyleSettings) => void;
};

const STYLE_SECTIONS: StyleKey[] = ["heading1", "heading2", "heading3", "body", "table", "caption"];

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function numericValue(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? String(value) : String(fallback);
}

export function DocumentStyleDialog({
  open,
  onOpenChange,
  value,
  onChange,
}: DocumentStyleDialogProps) {
  const { t } = useTranslation();
  const [openSection, setOpenSection] = useState<StyleKey | null>("body");
  const updateStyle = (patch: Partial<DocumentStyleSettings>) => {
    onChange({ ...value, ...patch });
  };

  const updateParagraphStyle = (
    key: StyleKey,
    patch: Partial<DocumentParagraphStyle> & { headerBold?: boolean },
  ) => {
    onChange({
      ...value,
      [key]: {
        ...(value[key] ?? {}),
        ...patch,
      },
    });
  };

  const updateLineSpacing = (key: StyleKey, patch: Partial<DocumentLineSpacing>) => {
    const current = value[key]?.lineSpacing ?? { type: "single" as const, value: 1 };
    updateParagraphStyle(key, {
      lineSpacing: {
        ...current,
        ...patch,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-form-layout="6" className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("documentsPage.styleDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("documentsPage.styleDialog.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="w-full min-w-0">
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="doc-style-toc">{t("documentsPage.styleDialog.toc")}</Label>
              <Switch
                id="doc-style-toc"
                checked={value.includeTableOfContents}
                onCheckedChange={(checked) =>
                  updateStyle({ includeTableOfContents: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="doc-style-numbering">{t("documentsPage.styleDialog.numbering")}</Label>
              <Switch
                id="doc-style-numbering"
                checked={value.autoNumberHeadings}
                onCheckedChange={(checked) => updateStyle({ autoNumberHeadings: checked })}
              />
            </div>
          </div>

          {STYLE_SECTIONS.map((key) => {
            const section = value[key] ?? {};
            const spacing = section.lineSpacing ?? { type: "single" as const, value: 1 };
            return (
              <Collapsible
                key={key}
                open={openSection === key}
                onOpenChange={(open) => setOpenSection(open ? key : null)}
                className="rounded-xl border border-border bg-muted/10"
              >
                <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold">
                  <span>{t(`documentsPage.styleDialog.sections.${key}`)}</span>
                  <ChevronDown className={cn("size-4 transition-transform", openSection === key && "rotate-180")} />
                </CollapsibleTrigger>
                <CollapsibleContent className="grid gap-3 border-t border-border p-4">
                  <div className="flex items-center justify-end gap-2">
                    <Label htmlFor={`doc-style-bold-${key}`} className="text-xs">
                      {t("documentsPage.styleDialog.bold")}
                    </Label>
                    <Switch
                      id={`doc-style-bold-${key}`}
                      checked={Boolean(section.bold)}
                      onCheckedChange={(checked) =>
                        updateParagraphStyle(key, { bold: checked })
                      }
                    />
                  </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`doc-style-eastasia-${key}`}>{t("documentsPage.styleDialog.eastAsiaFont")}</Label>
                    <Input
                      id={`doc-style-eastasia-${key}`}
                      value={section.eastAsiaFont ?? ""}
                      onChange={(event) =>
                        updateParagraphStyle(key, {
                          eastAsiaFont: event.currentTarget.value || undefined,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`doc-style-ascii-${key}`}>{t("documentsPage.styleDialog.asciiFont")}</Label>
                    <Input
                      id={`doc-style-ascii-${key}`}
                      value={section.asciiFont ?? ""}
                      onChange={(event) =>
                        updateParagraphStyle(key, {
                          asciiFont: event.currentTarget.value || undefined,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`doc-style-size-${key}`}>{t("documentsPage.styleDialog.fontSize")}</Label>
                    <Input
                      id={`doc-style-size-${key}`}
                      type="number"
                      min={6}
                      max={72}
                      step={0.5}
                      value={numericValue(section.sizePt, key === "heading3" ? 14 : 10.5)}
                      onChange={(event) =>
                        updateParagraphStyle(key, {
                          sizePt: clampNumber(Number(event.currentTarget.value), 6, 72),
                        })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <div className="grid gap-1.5">
                    <Label>{t("documentsPage.styleDialog.lineSpacingType")}</Label>
                    <Select
                      value={spacing.type}
                      onValueChange={(next) =>
                        updateLineSpacing(key, {
                          type: next === "multiple" ? "multiple" : "single",
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">{t("documentsPage.styleDialog.single")}</SelectItem>
                        <SelectItem value="multiple">{t("documentsPage.styleDialog.multiple")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`doc-style-line-${key}`}>{t("documentsPage.styleDialog.lineSpacing")}</Label>
                    <Input
                      id={`doc-style-line-${key}`}
                      type="number"
                      min={1}
                      max={3}
                      step={0.01}
                      value={numericValue(spacing.value, 1)}
                      onChange={(event) =>
                        updateLineSpacing(key, {
                          value: clampNumber(Number(event.currentTarget.value), 1, 3),
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`doc-style-before-${key}`}>{t("documentsPage.styleDialog.before")}</Label>
                    <Input
                      id={`doc-style-before-${key}`}
                      type="number"
                      min={0}
                      max={72}
                      step={0.5}
                      value={numericValue(section.spacingBeforePt, 0)}
                      onChange={(event) =>
                        updateParagraphStyle(key, {
                          spacingBeforePt: clampNumber(Number(event.currentTarget.value), 0, 72),
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`doc-style-after-${key}`}>{t("documentsPage.styleDialog.after")}</Label>
                    <Input
                      id={`doc-style-after-${key}`}
                      type="number"
                      min={0}
                      max={72}
                      step={0.5}
                      value={numericValue(section.spacingAfterPt, 0)}
                      onChange={(event) =>
                        updateParagraphStyle(key, {
                          spacingAfterPt: clampNumber(Number(event.currentTarget.value), 0, 72),
                        })
                      }
                    />
                  </div>
                </div>

                {key === "body" && (
                  <div className="grid w-48 gap-1.5">
                    <Label htmlFor="doc-style-body-indent">{t("documentsPage.styleDialog.indent")}</Label>
                    <Input
                      id="doc-style-body-indent"
                      type="number"
                      min={0}
                      max={4}
                      step={0.5}
                      value={numericValue(section.firstLineIndentChars, 2)}
                      onChange={(event) =>
                        updateParagraphStyle("body", {
                          firstLineIndentChars: clampNumber(
                            Number(event.currentTarget.value),
                            0,
                            4,
                          ),
                        })
                      }
                    />
                  </div>
                )}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange(cloneDefaultDocumentStyle())}
          >
            {t("documentsPage.styleDialog.restore")}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("documentsPage.styleDialog.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
