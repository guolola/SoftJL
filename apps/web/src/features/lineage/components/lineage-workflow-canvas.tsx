// Direct adaptation of the user-supplied workflow-builder-03 template: keeps its node, canvas, toolbar, minimap and panel layout.
'use client'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Background, BackgroundVariant, BaseEdge, getSmoothStepPath, Handle, MarkerType, MiniMap, NodeToolbar, Panel, Position, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow, useViewport, type Edge, type EdgeProps, type EdgeTypes, type Node, type NodeProps, type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Avatar, AvatarFallback } from '../../../shared/ui/avatar'
import { Badge } from '../../../shared/ui/badge'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '../../../shared/ui/breadcrumb'
import { Button } from '../../../shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../shared/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../shared/ui/tooltip'
import { cn } from '../../../shared/ui/utils'
import { ClockIcon, CircleCheckIcon, CircleXIcon, CircleMinusIcon, PlusIcon, EyeIcon, XIcon, GitBranchIcon, TriangleAlertIcon, ZapIcon, CheckIcon, MoreHorizontalIcon, CircleHelpIcon, MousePointerIcon, HandIcon, MinusIcon, UndoIcon, RedoIcon, LockIcon, RotateCcwIcon, ScanIcon } from 'lucide-react'
import { lineageIcon } from '../lib/lineage-icons'
import type { NodeGenerationInfo } from '../lib/lineage-generation'
import { GenerationStamp, GenerationDetails } from './lineage-generation-info'
import { type LineageGraph, type LineageNode, type LineageNodeStatus } from '../lib/lineage-graph-model'
import { layoutLineageNodes, lineageFilterIds, type CanvasPositions, type LineageFilter } from '../lib/lineage-canvas-layout'

type NodeActions = { onInspect: () => void; onOpenPage: () => void; onGenerate: () => void; onImpact: () => void }
type WorkflowNodeData = { kind: 'trigger' | 'branch' | 'action'; title: string; icon: ReactNode; meta: { detail: string; category: string; status: LineageNodeStatus }; lineage: LineageNode; generation?: NodeGenerationInfo; actions?: NodeActions }
type WorkflowEdgeData = Record<string, unknown>
type CanvasNode = Node<WorkflowNodeData>
type CanvasProps = { graph: LineageGraph; generation?: Record<string, NodeGenerationInfo>; onPrimaryAction: (node: LineageNode) => void; onViewArtifact: (node: LineageNode) => void }
const handleClassName = '!size-1 !rounded-full !border-2 !border-foreground/50 !bg-foreground/50 transition-colors'
const STATUS_META = {
  'not-generated': { className: 'bg-muted text-muted-foreground', icon: ClockIcon },
  current: { className: 'bg-emerald-600/15 text-emerald-600 dark:text-emerald-400', icon: CircleCheckIcon },
  error: { className: 'bg-destructive/15 text-destructive', icon: CircleXIcon },
  stale: { className: 'bg-amber-600/15 text-amber-600 dark:text-amber-400', icon: ClockIcon },
  interrupted: { className: 'bg-muted text-muted-foreground', icon: CircleMinusIcon },
  running: { className: 'bg-primary/15 text-primary', icon: ClockIcon }
}
const StatusBadge = ({ status }: { status: LineageNodeStatus }) => {
  const { t } = useTranslation()
  const Icon = STATUS_META[status].icon
  return <Badge className={cn('gap-1 pl-1.5', STATUS_META[status].className)}><Icon className='size-3' />{t('lineage.statuses.' + status.replace('-', '_'))}</Badge>
}
function nodeData(lineage: LineageNode): WorkflowNodeData {
  const Icon = lineageIcon(lineage)
  return { kind: lineage.kind === 'rule' ? 'trigger' : lineage.kind === 'requirement-model' ? 'branch' : 'action', title: lineage.label, icon: <Icon className='size-5' />, meta: { detail: lineage.description, category: lineage.stageLabel, status: lineage.status }, lineage }
}

const KIND_TILE_CLASSNAME: Record<WorkflowNodeData['kind'], string> = {
  trigger: 'bg-primary/10',
  branch: 'bg-violet-600/10 dark:bg-violet-400/10',
  action: 'bg-muted'
}

const WorkflowNode = ({ data, selected }: NodeProps<Node<WorkflowNodeData>>) => {
  const [isHovered, setIsHovered] = useState(false)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const { t } = useTranslation()
  useEffect(() => () => clearTimeout(hideTimeoutRef.current), [])

  const showToolbar = () => {
    clearTimeout(hideTimeoutRef.current)
    setIsHovered(true)
  }

  const hideToolbarWithDelay = () => {
    hideTimeoutRef.current = setTimeout(() => setIsHovered(false), 300)
  }

  return (
    <div data-testid={'lineage-node-' + data.lineage.id} data-lineage-kind={data.lineage.kind} data-lineage-status={data.lineage.status} data-lineage-viewable={data.lineage.hasViewableArtifact} className='relative flex w-72 flex-col' tabIndex={0} role='button' aria-label={data.title} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); data.actions?.onInspect() } }} onMouseEnter={showToolbar} onMouseLeave={hideToolbarWithDelay}>
      <NodeToolbar
        isVisible={selected || isHovered}
        position={Position.Top}
        className='mb-1'
        onMouseEnter={showToolbar}
        onMouseLeave={hideToolbarWithDelay}
      >
        <div className='bg-card flex items-center gap-0.5 rounded-lg border p-1 shadow-xs'>
          {[
            { label: t('lineage.canvas.openPage'), icon: <EyeIcon />, onClick: data.actions?.onOpenPage },
            { label: data.lineage.actionLabel, icon: <ZapIcon />, onClick: data.actions?.onGenerate, disabled: data.lineage.status === 'running' },
            { label: t('lineage.filters.impact'), icon: <GitBranchIcon />, onClick: data.actions?.onImpact }
          ].map(action => <Button key={action.label} variant='ghost' size='icon-sm' aria-label={action.label} disabled={action.disabled} onClick={event => { event.stopPropagation(); action.onClick?.() }}>{action.icon}</Button>)}
        </div>
      </NodeToolbar>

      {data.kind !== 'trigger' && <Handle type='target' position={Position.Left} className={handleClassName} />}

      <div
        className={cn(
          'bg-card flex flex-col overflow-hidden rounded-xl border shadow-sm transition-colors',
          selected && 'border-primary ring-primary/20 ring-2'
        )}
      >
        <div className='flex items-center gap-3 p-3'>
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-lg',
              KIND_TILE_CLASSNAME[data.kind]
            )}
          >
            {data.icon}
          </span>
          <div className='min-w-0 flex-1 leading-tight'>
            <p className='truncate text-sm font-medium'>{data.title}</p>
            <p className='text-muted-foreground truncate text-xs'>{data.meta.detail || data.meta.category}</p>
          </div>
        </div>

        <div className='bg-muted/40 flex items-center justify-between gap-2 border-t px-3 py-2'>
          <GenerationStamp info={data.generation?.representative ?? (data.lineage.hasViewableArtifact ? { instanceId: data.lineage.id, label: data.title, generated: true, scope: data.lineage.kind === 'rule' ? 'rules-batch' : data.lineage.kind === 'document' ? 'document' : 'instance' } : undefined)} representative={(data.generation?.instances.length ?? 0) > 1} />
          <StatusBadge status={data.meta.status} />
        </div>
      </div>

      <Handle type='source' position={Position.Right} className={handleClassName} />
    </div>
  )
}

const nodeTypes: NodeTypes = { workflowNode: WorkflowNode }
const WorkflowEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius
}: EdgeProps<Edge<WorkflowEdgeData>>) => {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerEnd={markerEnd}
        label={label}
        labelStyle={labelStyle}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
      />

    </>
  )
}

const edgeTypes: EdgeTypes = { workflowEdge: WorkflowEdge }
const FlowToolbar = ({
  mode,
  setMode,
  locked,
  setLocked,
  canUndo,
  canRedo,
  undo,
  redo
}: {
  mode: 'select' | 'pan'
  setMode: (mode: 'select' | 'pan') => void
  locked: boolean
  setLocked: (updater: (locked: boolean) => boolean) => void
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
}) => {
  const { t } = useTranslation()
  const { zoomIn, zoomOut } = useReactFlow()
  const { zoom } = useViewport()

  return (
    <div className='bg-card flex items-center gap-0.5 rounded-lg border p-1 shadow-xs'>
      <Button
        variant={mode === 'select' ? 'secondary' : 'ghost'}
        size='icon-sm'
        aria-label={t('lineage.canvas.selectTool')}
        onClick={() => setMode('select')}
      >
        <MousePointerIcon />
      </Button>
      <Button
        variant={mode === 'pan' ? 'secondary' : 'ghost'}
        size='icon-sm'
        aria-label={t('lineage.canvas.handTool')}
        onClick={() => setMode('pan')}
      >
        <HandIcon />
      </Button>

      <div className='bg-border mx-1 h-5 w-px' />

      <Button variant='ghost' size='icon-sm' aria-label={t('lineage.canvas.zoomOut')} disabled={zoom <= 0.1} onClick={() => zoomOut()}>
        <MinusIcon />
      </Button>
      <span className='text-muted-foreground w-10 text-center text-xs tabular-nums'>{Math.round(zoom * 100)}%</span>
      <Button variant='ghost' size='icon-sm' aria-label={t('lineage.canvas.zoomIn')} disabled={zoom >= 2} onClick={() => zoomIn()}>
        <PlusIcon />
      </Button>

      <div className='bg-border mx-1 h-5 w-px' />

      <Button variant='ghost' size='icon-sm' aria-label={t('lineage.canvas.undo')} disabled={!canUndo} onClick={undo}>
        <UndoIcon />
      </Button>
      <Button variant='ghost' size='icon-sm' aria-label={t('lineage.canvas.redo')} disabled={!canRedo} onClick={redo}>
        <RedoIcon />
      </Button>

      <div className='bg-border mx-1 h-5 w-px' />

      <Button
        variant={locked ? 'secondary' : 'ghost'}
        size='icon-sm'
        aria-label={t(locked ? 'lineage.canvas.unlock' : 'lineage.canvas.lock')}
        onClick={() => setLocked(current => !current)}
      >
        <LockIcon />
      </Button>
    </div>
  )
}


function WorkflowBuilder({ graph, generation, onPrimaryAction, onViewArtifact }: CanvasProps) {
  const { t } = useTranslation()
  const { fitView } = useReactFlow<CanvasNode>()
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [filter, setFilter] = useState<LineageFilter>('all')
  const [mode, setMode] = useState<'select' | 'pan'>('select')
  const [locked, setLocked] = useState(false)
  const [past, setPast] = useState<CanvasPositions[]>([])
  const [future, setFuture] = useState<CanvasPositions[]>([])
  const selectedNode = graph.nodes.find(node => node.id === selectedId)
  const activeData = selectedNode ? nodeData(selectedNode) : null
  const visibleIds = useMemo(() => lineageFilterIds(graph, filter, selectedId), [graph, filter, selectedId])

  // Refresh statuses and dependency contracts while retaining local node positions.
  // Positions alone are editable; canonical artifacts and their edges remain owned by the workspace.
  useEffect(() => {
    const positions = layoutLineageNodes(graph)
    setNodes(current => graph.nodes.map(lineage => ({
      id: lineage.id, type: 'workflowNode', position: current.find(node => node.id === lineage.id)?.position ?? positions[lineage.id], data: nodeData(lineage)
    })))
    if (selectedId && !graph.nodes.some(node => node.id === selectedId)) {
      setSelectedId(null)
      setDetailsOpen(false)
      setFilter(current => current === 'impact' ? 'all' : current)
    }
  }, [graph, setNodes, selectedId])

  const snapshot = (): CanvasPositions => Object.fromEntries(nodes.map(node => [node.id, { ...node.position }]))
  const recordHistory = () => { setPast(current => [...current.slice(-49), snapshot()]); setFuture([]) }
  const restore = (positions: CanvasPositions) => setNodes(current => current.map(node => ({ ...node, position: positions[node.id] ?? node.position })))
  const undo = () => {
    const previous = past.at(-1)
    if (!previous) return
    setFuture(current => [...current, snapshot()])
    setPast(current => current.slice(0, -1))
    restore(previous)
  }
  const redo = () => {
    const next = future.at(-1)
    if (!next) return
    setPast(current => [...current, snapshot()])
    setFuture(current => current.slice(0, -1))
    restore(next)
  }
  const openNode = (id: string, focus = false) => {
    setSelectedId(id)
    setDetailsOpen(true)
    if (focus) void fitView({ nodes: [{ id }], duration: 300, maxZoom: 1, padding: 1 })
  }
  const resetLayout = () => {
    recordHistory()
    restore(layoutLineageNodes(graph))
    requestAnimationFrame(() => void fitView({ duration: 300, padding: 0.3 }))
  }
  // Toolbar actions never open the inspector; only card interaction sets detailsOpen.
  const displayNodes = nodes.map(node => ({
    ...node, selected: node.id === selectedId, style: { opacity: visibleIds.has(node.id) ? 1 : 0.25 },
    data: { ...node.data, generation: generation?.[node.id], actions: {
      onInspect: () => openNode(node.id),
      onOpenPage: () => onViewArtifact(node.data.lineage),
      onGenerate: () => onPrimaryAction(node.data.lineage),
      onImpact: () => { setSelectedId(node.id); setFilter('impact') }
    } }
  }))
  const displayEdges: Edge<WorkflowEdgeData>[] = graph.edges.map(edge => {
    const color = edge.status === 'error' ? 'var(--destructive)' : edge.status === 'stale' || edge.status === 'interrupted' ? 'var(--warning)' : 'var(--muted-foreground)'
    return { id: edge.id, source: edge.source, target: edge.target, type: 'workflowEdge', selectable: false,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color },
      style: { stroke: color, strokeWidth: 2, opacity: visibleIds.has(edge.source) && visibleIds.has(edge.target) ? 1 : 0.15 },
      animated: graph.nodes.some(node => node.id === edge.target && node.status === 'running') }
  })
  const closePanel = () => setDetailsOpen(false)
  const relatedNodes = (label: string, ids: string[]) => <div className='space-y-3'>
    <p className='text-sm font-semibold'>{label}</p>
    {ids.length ? ids.map(id => <Button key={id} variant='outline' size='sm' className='w-full justify-start' onClick={() => openNode(id, true)}>{graph.nodes.find(node => node.id === id)?.label ?? id}</Button>) : <p className='text-muted-foreground text-xs'>{t('lineage.noRelated')}</p>}
  </div>
  const adviceKey = selectedNode?.status === 'running' ? (selectedNode.hasViewableArtifact ? 'runningOldAdvice' : 'runningAdvice') : selectedNode?.status === 'not-generated' ? 'notGeneratedAdvice' : selectedNode?.status === 'error' ? 'errorAdvice' : selectedNode?.status === 'stale' ? 'staleAdvice' : selectedNode?.status === 'interrupted' ? 'interruptedAdvice' : 'currentAdvice'

  return (
    <div className='bg-card flex h-full w-full flex-col overflow-hidden rounded-xl border' data-template='workflow-builder-03'>
      <div className='flex shrink-0 flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center'>
        <div className='min-w-0 flex-1'>
          <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbPage>{t('projectShell.management')}</BreadcrumbPage></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{t('status.lineage')}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
          <p className='text-muted-foreground mt-1 text-xs'>{t('lineage.canvas.summary', { nodes: graph.nodes.length, edges: graph.edges.length })} · {t('lineage.filters.' + filter)}</p>
        </div>
        <div className='flex shrink-0 flex-wrap items-center gap-2'>
          <Avatar><AvatarFallback><GitBranchIcon className='size-4' /></AvatarFallback></Avatar>
          <Button size='icon-sm' className='sm:hidden' aria-label={t('lineage.canvas.resetLayout')} onClick={resetLayout}><RotateCcwIcon /></Button>
          <Button size='sm' className='hidden sm:inline-flex' onClick={resetLayout}><RotateCcwIcon />{t('lineage.canvas.resetLayout')}</Button>
          <Button variant='outline' size='sm' onClick={() => void fitView({ duration: 300, padding: 0.3 })}><ScanIcon />{t('lineage.canvas.fitView')}</Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant='outline' size='icon-sm' aria-label={t('lineage.canvas.filters')} />}><MoreHorizontalIcon /></DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-40'>
              {(['all', 'stale', 'error', 'impact'] as const).map(value => <DropdownMenuItem key={value} disabled={value === 'impact' && !selectedId} onClick={() => setFilter(value)}>{filter === value && <CheckIcon className='size-4' />}{t('lineage.filters.' + value)}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
          <TooltipProvider delay={0}><Tooltip><TooltipTrigger render={<Button variant='outline' size='icon-sm' aria-label={t('lineage.canvas.help')} />}><CircleHelpIcon /></TooltipTrigger><TooltipContent>{t('lineage.canvas.helpText')}</TooltipContent></Tooltip></TooltipProvider>
        </div>
      </div>
      <div className='relative min-h-0 w-full flex-1 [--xy-attribution-background-color:transparent] [--xy-controls-button-background-color-hover:var(--accent)] [--xy-controls-button-background-color:var(--card)] [--xy-controls-button-border-color:var(--border)] [--xy-controls-button-color-hover:var(--foreground)] [--xy-controls-button-color:var(--muted-foreground)]'>
        <ReactFlow nodes={displayNodes} edges={displayEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange}
          connectionLineStyle={{ stroke: 'var(--primary)', strokeWidth: 2 }} defaultEdgeOptions={{ type: 'workflowEdge' }}
          onNodeClick={(_, node) => openNode(node.id)} onNodeDragStart={recordHistory}
          onPaneClick={() => { closePanel(); setSelectedId(null); if (filter === 'impact') setFilter('all') }}
          nodesDraggable={!locked && mode === 'select'} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null}
          nodesFocusable={false} elementsSelectable={!locked} panOnDrag={mode === 'pan'} selectionOnDrag={mode === 'select'} selectNodesOnDrag={false}
          minZoom={0.1} maxZoom={2} fitView fitViewOptions={{ padding: 0.3 }} proOptions={{ hideAttribution: true }}>
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Panel position='bottom-left' className='max-sm:left-1/2! max-sm:[transform:translateX(-15px)_translateX(-50%)]!'>
            <FlowToolbar mode={mode} setMode={setMode} locked={locked} setLocked={setLocked} canUndo={past.length > 0} canRedo={future.length > 0} undo={undo} redo={redo} />
          </Panel>
          <MiniMap position='bottom-right' pannable zoomable className='bg-card! border-border! hidden border sm:block' nodeColor={() => 'var(--muted)'} maskColor='color-mix(in srgb, var(--primary) 10%, transparent)' />
        </ReactFlow>
        {detailsOpen && <>
          <div className='absolute inset-0 z-10 bg-black/50 lg:hidden' onClick={closePanel} aria-hidden='true' />
          <aside aria-label={t('lineage.detail')} className='bg-card absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l shadow-lg sm:w-[min(24rem,90vw)]'>
            <div className='flex shrink-0 items-center gap-3 border-b px-4 py-3.5'>
              <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', activeData ? KIND_TILE_CLASSNAME[activeData.kind] : 'bg-muted')}>{activeData?.icon ?? <GitBranchIcon />}</span>
              <div className='min-w-0 flex-1'><p className='truncate text-sm font-medium'>{selectedNode?.label ?? t('lineage.detail')}</p><p className='text-muted-foreground mt-0.5 truncate text-xs'>{selectedNode ? selectedNode.stageLabel + ' · ' + selectedNode.id : t('lineage.detailHint')}</p></div>
              <Button variant='ghost' size='icon-sm' aria-label={t('lineage.hideDetails')} onClick={closePanel}><XIcon /></Button>
            </div>
            <div data-testid='lineage-detail-scroll-area' className='min-h-0 flex-1 space-y-4 overflow-y-auto p-4'>
              {selectedNode ? <>
                {selectedNode.status !== 'current' && <div className='rounded-lg border border-amber-600/30 bg-amber-600/10 p-3'><p className='flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400'><TriangleAlertIcon className='size-4' />{t('lineage.statusReason')}</p><p className='text-muted-foreground mt-1 text-xs leading-relaxed'>{selectedNode.reason}</p></div>}
                <div className='space-y-3'><p className='text-sm font-semibold'>{t('lineage.detail')}</p><p className='text-muted-foreground text-xs'>{selectedNode.description}</p><StatusBadge status={selectedNode.status} /></div>
                <GenerationDetails info={generation?.[selectedNode.id]} />
                {relatedNodes(t('lineage.upstream'), selectedNode.upstreamIds)}
                {relatedNodes(t('lineage.downstream'), selectedNode.downstreamIds)}
                <div className='space-y-3'><p className='text-sm font-semibold'>{t('lineage.recommendation')}</p><p className='text-muted-foreground text-xs leading-relaxed'>{t('lineage.' + adviceKey)}</p></div>
                <div className='space-y-3'><p className='text-sm font-semibold'>{t('lineage.recent')}</p>{selectedNode.recentEvents.length ? selectedNode.recentEvents.map((event, index) => <div key={index}><p className='text-sm'>{event.label}</p><p className='text-muted-foreground text-xs'>{event.description}</p></div>) : <p className='text-muted-foreground text-xs'>{t('lineage.noRecent')}</p>}</div>
              </> : <p className='text-muted-foreground text-xs'>{t('lineage.detailHint')}</p>}
            </div>
            {selectedNode && <div className='flex shrink-0 items-center gap-2 border-t p-3'>
              <Button size='sm' disabled={selectedNode.status === 'running'} onClick={() => onPrimaryAction(selectedNode)}><ZapIcon />{selectedNode.actionLabel}</Button>
              <Button variant='outline' size='sm' disabled={!selectedNode.hasViewableArtifact} onClick={() => onViewArtifact(selectedNode)}><EyeIcon />{t(selectedNode.status === 'running' ? 'lineage.viewOld' : 'lineage.viewArtifact')}</Button>
            </div>}
          </aside>
        </>}
      </div>
    </div>
  )
}

export function LineageWorkflowCanvas(props: CanvasProps) {
  return <ReactFlowProvider><WorkflowBuilder {...props} /></ReactFlowProvider>
}
