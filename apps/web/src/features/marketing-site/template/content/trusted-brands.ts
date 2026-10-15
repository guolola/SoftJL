// Defines Coding Agent marks for the homepage orbit and software brands for the marquee/footer.
import antGroupUrl from '@lobehub/icons-static-svg/icons/antgroup-color.svg?url'
import claudeCodeUrl from '@lobehub/icons-static-svg/icons/claudecode-color.svg?url'
import clineUrl from '@lobehub/icons-static-svg/icons/cline.svg?url'
import cloudflareUrl from '@lobehub/icons-static-svg/icons/cloudflare-color.svg?url'
import codexUrl from '@lobehub/icons-static-svg/icons/codex-color.svg?url'
import cursorUrl from '@lobehub/icons-static-svg/icons/cursor.svg?url'
import githubCopilotUrl from '@lobehub/icons-static-svg/icons/githubcopilot.svg?url'
import googleCloudUrl from '@lobehub/icons-static-svg/icons/googlecloud-color.svg?url'
import iflytekCloudUrl from '@lobehub/icons-static-svg/icons/iflytekcloud-color.svg?url'
import microsoftUrl from '@lobehub/icons-static-svg/icons/microsoft-color.svg?url'
import miniMaxUrl from '@lobehub/icons-static-svg/icons/minimax-color.svg?url'
import openCodeUrl from '@lobehub/icons-static-svg/icons/opencode.svg?url'
import qoderUrl from '@lobehub/icons-static-svg/icons/qoder-color.svg?url'
import rooCodeUrl from '@lobehub/icons-static-svg/icons/roocode.svg?url'
import traeUrl from '@lobehub/icons-static-svg/icons/trae-color.svg?url'
import volcengineUrl from '@lobehub/icons-static-svg/icons/volcengine-color.svg?url'
import windsurfUrl from '@lobehub/icons-static-svg/icons/windsurf.svg?url'

export type BrandLogo = {
  image: string
  name: string
}

export type OrbitBrandLogo = BrandLogo & {
  pathId: string
  delay: number
  monochrome?: boolean
  lightBackground?: boolean
}

// pathId selects an existing animation curve; it is independent of the brand identity.
export const orbitLogos: OrbitBrandLogo[] = [
  { pathId: 'next', image: codexUrl, name: 'Codex', delay: 8.39 },
  { pathId: 'figma', image: claudeCodeUrl, name: 'Claude Code', delay: 6.77 },
  { pathId: 'react', image: cursorUrl, monochrome: true, name: 'Cursor', delay: 3.47 },
  { pathId: 'github', image: '/mcp/clients/workbuddy.svg', name: 'WorkBuddy', delay: 1.66 },
  { pathId: 'icon1', image: qoderUrl, lightBackground: true, name: 'Qoder', delay: 0 },
  { pathId: 'icon2', image: traeUrl, name: 'TRAE', delay: 5.13 },
  { pathId: 'laravel', image: githubCopilotUrl, monochrome: true, name: 'GitHub Copilot', delay: 8.39 },
  { pathId: 'vue', image: clineUrl, monochrome: true, name: 'Cline', delay: 6.77 },
  { pathId: 'claude', image: windsurfUrl, monochrome: true, name: 'Windsurf', delay: 3.47 },
  { pathId: 'x', image: rooCodeUrl, monochrome: true, name: 'Roo Code', delay: 1.66 },
  { pathId: 'icon3', image: openCodeUrl, monochrome: true, name: 'OpenCode', delay: 0 },
  { pathId: 'instagram', image: '/mcp/clients/vscode.svg', name: 'VS Code', delay: 5.13 }
]

export const logos: BrandLogo[] = [
  { image: volcengineUrl, name: 'Volcengine' },
  { image: antGroupUrl, name: 'Ant Group' },
  { image: iflytekCloudUrl, name: 'iFLYTEK Cloud' },
  { image: miniMaxUrl, name: 'MiniMax' },
  { image: microsoftUrl, name: 'Microsoft' },
  { image: googleCloudUrl, name: 'Google Cloud' },
  { image: cloudflareUrl, name: 'Cloudflare' }
]
