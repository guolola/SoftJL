// Adapts shadcn-studio code-block-01 to shared Base UI primitives and the application copy workflow.
'use client'

import * as React from 'react'

import { codeToHtml } from 'shiki'
import type { BundledLanguage } from 'shiki'

import { Check, Copy } from 'lucide-react'
import { Button } from './button'
import { cn } from './utils'
import { ScrollArea } from './scroll-area'
import { Tabs, TabsList, TabsTrigger } from './tabs'

// ─── Types ───────────────────────────────────────────────────────────────────

export type CodeBlockFile = {
  filename: string
  code: string
  language?: BundledLanguage | 'text'
  panelClassName?: string
  paneStyle?: React.CSSProperties
  highlightLines?: number[]
  highlightClassName?: string
  showLineNumbers?: boolean
}

export type CodeBlockProps = Omit<React.ComponentProps<'div'>, 'onCopy'> & {
  showCopy?: boolean
  onCopy?: (code: string) => Promise<void | boolean>
  copyLabel?: string
  copiedLabel?: string
  code?: string
  language?: BundledLanguage | 'text'
  filename?: string
  files?: CodeBlockFile[]
  panelClassName?: string
  paneStyle?: React.CSSProperties
  highlightLines?: number[]
  highlightClassName?: string
  showLineNumbers?: boolean
}

// Internal Helpers
function splitShikiLines(html: string): string[] {
  const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/)

  if (!match) return [html]

  // Split on newlines; last element after trailing newline may be empty
  const lines = match[1].split('\n')

  if (lines[lines.length - 1] === '') lines.pop()

  return lines
}

async function highlight(code: string, lang: BundledLanguage | 'text' = 'tsx'): Promise<string> {
  try {
    return await codeToHtml(code, {
      lang,
      themes: { light: 'github-light', dark: 'github-dark' }
    })
  } catch {
    // Fallback: wrap in plain-text pre/code so the UI never breaks
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    return `<pre><code>${escaped}</code></pre>`
  }
}

// Copy Button

function CodeBlockCopyButton({ code, onCopy, copyLabel = 'Copy code', copiedLabel = 'Copied', className, ...props }: Omit<React.ComponentProps<typeof Button>, 'onCopy'> & { code: string; onCopy?: (code: string) => Promise<void | boolean>; copyLabel?: string; copiedLabel?: string }) {
  const [copied, setCopied] = React.useState(false)
  const timeout = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => {
    setCopied(false)
    return () => { if (timeout.current) clearTimeout(timeout.current) }
  }, [code])
  const handleCopy = async () => {
    try {
      // The page supplies its existing clipboard feedback; mark success only after copying resolves.
      const result = await (onCopy ? onCopy(code) : navigator.clipboard.writeText(code))
      if (result === false) { setCopied(false); return }
      setCopied(true)
      if (timeout.current) clearTimeout(timeout.current)
      timeout.current = setTimeout(() => setCopied(false), 1500)
    } catch { setCopied(false) }
  }
  return <Button variant='ghost' size='icon-sm' data-slot='code-block-copy' aria-label={copied ? copiedLabel : copyLabel} title={copied ? copiedLabel : copyLabel} onClick={() => void handleCopy()} className={cn('cn-code-block-copy text-muted-foreground hover:text-foreground shrink-0', className)} {...props}>
    {copied ? <Check className='size-3.5' /> : <Copy className='size-3.5' />}
  </Button>
}

// Single

type CodeBlockPaneProps = {
  code: string
  language?: BundledLanguage | 'text'
  showCopy?: boolean
  className?: string
  style?: React.CSSProperties
  highlightLines?: number[]
  highlightClassName?: string
  showLineNumbers?: boolean
}

function CodeBlockPane({
  code,
  language = 'tsx',
  showCopy = true,
  className,
  style,
  highlightLines,
  highlightClassName = 'bg-amber-600/40 dark:bg-amber-400/40',
  showLineNumbers = false
}: CodeBlockPaneProps) {
  const [highlighted, setHighlighted] = React.useState<{ code: string; language: string; html: string } | null>(null)
  // Render plaintext immediately and keep old asynchronous highlights out of a newly selected client.
  const html = highlighted?.code === code && highlighted.language === language ? highlighted.html : ''

  React.useEffect(() => {
    let cancelled = false

    highlight(code, language).then(result => {
      if (!cancelled) setHighlighted({ code, language, html: result })
    })

    return () => {
      cancelled = true
    }
  }, [code, language])

  const hasHighlights = highlightLines && highlightLines.length > 0
  const useLineView = hasHighlights || showLineNumbers

  // Pre-compute Shiki's background so we can match the container
  const lines = React.useMemo(() => (html ? splitShikiLines(html) : []), [html])

  return (
    <div data-slot='code-block-pane' className={cn('cn-code-block-pane', className)} style={style}>
      {/* Auto-height panes must not inherit the scroll area's full-height content minimum. */}
      <ScrollArea showHorizontalScrollbar contentClassName='min-h-0' viewportClassName='h-auto max-h-72' className='max-h-72'>
        {showCopy && <CodeBlockCopyButton code={code} className='absolute top-2 right-2 z-10' />}
        {html ? (
          useLineView ? (
            <>
              <pre className='shiki bg-transparent! p-0 font-mono text-sm leading-relaxed'>
                <code className='block w-max min-w-full'>
                  {lines.map((line, i) => {
                    const lineNumber = i + 1
                    const isHighlighted = highlightLines?.includes(lineNumber) ?? false

                    return (
                      <div
                        key={i}
                        className={cn('flex items-stretch px-4 py-[0.5px]', isHighlighted && highlightClassName)}
                      >
                        {showLineNumbers && (
                          <span className='text-muted-foreground/50 mr-4 w-4 shrink-0 text-right font-mono text-xs leading-relaxed select-none'>
                            {lineNumber}
                          </span>
                        )}
                        {/* Line tokens are trusted Shiki HTML output */}
                        <span className='flex-1' dangerouslySetInnerHTML={{ __html: line || '&nbsp;' }} />
                      </div>
                    )
                  })}
                </code>
              </pre>
            </>
          ) : (
            <>
              <div
                className={cn(
                  'cn-code-block-highlight [&>pre]:p-4 [&>pre]:text-sm [&>pre]:leading-relaxed',
                  '[&>pre]:bg-transparent! [&>pre]:font-mono [&>pre]:whitespace-pre'
                )}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </>
          )
        ) : (
          <pre className='p-4 font-mono text-sm leading-relaxed'><code>{code}</code></pre>
        )}
      </ScrollArea>
    </div>
  )
}

function CodeBlock({
  showCopy = true,
  onCopy,
  copyLabel,
  copiedLabel,
  code,
  language = 'tsx',
  filename,
  files,
  className,
  panelClassName,
  paneStyle,
  highlightLines,
  highlightClassName,
  showLineNumbers,
  ...props
}: CodeBlockProps) {
  // Normalise to a files array so the rest of the component is uniform
  const normalizedFiles: CodeBlockFile[] = React.useMemo(() => {
    if (files && files.length > 0) return files

    if (code !== undefined) {
      return [
        {
          filename: filename ?? `index.${language}`,
          code,
          language,
          panelClassName,
          paneStyle,
          highlightLines,
          highlightClassName,
          showLineNumbers
        }
      ]
    }

    return []
  }, [files, code, language, filename, panelClassName, paneStyle, highlightLines, highlightClassName, showLineNumbers])

  const isMulti = normalizedFiles.length > 1
  const [activeTab, setActiveTab] = React.useState(normalizedFiles[0]?.filename ?? '')

  // Keep activeTab in sync if files list changes
  React.useEffect(() => {
    if (normalizedFiles.length > 0 && !normalizedFiles.some(f => f.filename === activeTab)) {
      setActiveTab(normalizedFiles[0].filename)
    }
  }, [normalizedFiles, activeTab])

  const activeFile = normalizedFiles.find(f => f.filename === activeTab) ?? normalizedFiles[0]

  if (normalizedFiles.length === 0) return null

  return (
    <div
      data-slot='code-block'
      className={cn('cn-code-block bg-muted/50 border-border overflow-hidden rounded-xl border text-sm', className)}
      {...props}
    >
      {/* Header */}
      <div
        data-slot='code-block-header'
        className='cn-code-block-header border-border flex min-w-0 items-center justify-between gap-2 border-b'
      >
        {isMulti ? (
          <Tabs value={activeTab} onValueChange={value => setActiveTab(String(value))} className='cn-code-block-tabs flex-1'>
            <TabsList variant='line' className='cn-code-block-tabs-list group-data-horizontal/tabs:h-auto'>
              {normalizedFiles.map(file => (
                <TabsTrigger
                  key={file.filename}
                  value={file.filename}
                  className='cn-code-block-tab h-auto px-3 py-2 text-xs font-medium'
                >
                  {file.filename}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : (
          <span
            data-slot='code-block-filename'
            className='cn-code-block-filename text-muted-foreground px-3 py-2 text-xs font-medium'
          >
            {normalizedFiles[0].filename}
          </span>
        )}

        {activeFile && showCopy && <CodeBlockCopyButton code={activeFile.code} onCopy={onCopy} copyLabel={copyLabel} copiedLabel={copiedLabel} className='mr-1 shrink-0' />}
      </div>

      {/* Code pane – no copy button inside since header already has one */}
      {activeFile && (
        <CodeBlockPane
          key={activeFile.filename}
          code={activeFile.code}
          language={activeFile.language}
          showCopy={false}
          className={activeFile.panelClassName}
          style={activeFile.paneStyle}
          highlightLines={activeFile.highlightLines}
          highlightClassName={activeFile.highlightClassName}
          showLineNumbers={activeFile.showLineNumbers}
        />
      )}
    </div>
  )
}

export { CodeBlock, CodeBlockPane, CodeBlockCopyButton }
