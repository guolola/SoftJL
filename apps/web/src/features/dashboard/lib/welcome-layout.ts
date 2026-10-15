// Positions dashboard cards around the first-visit welcome without changing their grid destinations.
export type WelcomeRect = { x: number; y: number; width: number; height: number }
export type WelcomePose = {
  x: number; y: number; z: number; scale: number
  rotateX: number; rotateY: number; rotateZ: number; opacity: number
}
export type FloatingCard = { pose: WelcomePose; amplitude: number; period: number; phase: number; depth: number }

export const REST_POSE: WelcomePose = { x: 0, y: 0, z: 0, scale: 1, rotateX: 0, rotateY: 0, rotateZ: 0, opacity: 1 }

// Slots leave a clear central band; charts occupy the lower corners instead of crossing the heading.
const DESKTOP_SLOTS = [
  { x: .19, y: .17, w: .25, h: .27, depth: 1, tilt: -7 },
  { x: .50, y: .12, w: .16, h: .21, depth: 0, tilt: 5 },
  { x: .81, y: .17, w: .25, h: .27, depth: 1, tilt: 7 },
  { x: .11, y: .48, w: .19, h: .26, depth: 2, tilt: -6 },
  { x: .89, y: .48, w: .19, h: .26, depth: 2, tilt: 6 },
  { x: .50, y: .86, w: .17, h: .22, depth: 0, tilt: -5 },
  { x: .19, y: .81, w: .30, h: .29, depth: 2, tilt: 5 },
  { x: .81, y: .81, w: .30, h: .29, depth: 1, tilt: -5 },
]
const MOBILE_SLOTS = [
  { x: .25, y: .17, w: .38, h: .22, depth: 1, tilt: -8 },
  { x: .76, y: .16, w: .33, h: .20, depth: 0, tilt: 8 },
  { x: .23, y: .83, w: .36, h: .23, depth: 2, tilt: 6 },
  { x: .77, y: .84, w: .35, h: .21, depth: 1, tilt: -7 },
]

export function buildWelcomeLayout(stage: { width: number; height: number }, cards: WelcomeRect[]): FloatingCard[] {
  const slots = stage.width < 768 ? MOBILE_SLOTS : DESKTOP_SLOTS
  return cards.slice(0, slots.length).map((card, index) => {
    const slot = slots[index]
    const amplitude = [8, 12, 16][slot.depth]
    // Reserve the projected corners, source depth lift, and full bobbing range inside the stage.
    const angle = (Math.abs(slot.tilt) + 1.2) * Math.PI / 180
    const projectedWidth = (card.width * Math.cos(angle) + card.height * Math.sin(angle)) * 1.25
    const projectedHeight = (card.height * Math.cos(angle) + card.width * Math.sin(angle)) * 1.25
    const horizontalRoom = 2 * (stage.width * Math.min(slot.x, 1 - slot.x) - amplitude * .35 - 12)
    const verticalRoom = 2 * (stage.height * Math.min(slot.y, 1 - slot.y) - amplitude - 12)
    const fit = Math.max(.01, Math.min(
      stage.width * slot.w / Math.max(1, card.width),
      stage.height * slot.h / Math.max(1, card.height),
      horizontalRoom / Math.max(1, projectedWidth),
      verticalRoom / Math.max(1, projectedHeight),
      1,
    ))
    return {
      pose: {
        x: stage.width * slot.x - card.x - card.width / 2,
        y: stage.height * slot.y - card.y - card.height / 2,
        z: 0,
        scale: fit,
        rotateX: 0,
        rotateY: 0,
        rotateZ: slot.tilt,
        opacity: 1,
      },
      amplitude,
      period: 4.2 + (index % 4) * .85,
      phase: index * 1.37,
      depth: slot.depth,
    }
  })
}

export function floatingPose(card: FloatingCard, seconds: number): WelcomePose {
  const angle = seconds * Math.PI * 2 / card.period + card.phase
  return {
    ...card.pose,
    x: card.pose.x + Math.cos(angle * .73) * card.amplitude * .35,
    y: card.pose.y + Math.sin(angle) * card.amplitude,
    rotateZ: card.pose.rotateZ + Math.sin(angle * .67) * 1.2,
  }
}

export function poseTransform(pose: WelcomePose): string {
  // This wrapper only arranges cards; the original Aceternity children supply perspective and tilt.
  return `translate3d(${pose.x}px, ${pose.y}px, 0) rotateZ(${pose.rotateZ}deg) scale(${pose.scale})`
}

export function returningPose(from: WelcomePose, progress: number): WelcomePose {
  const p = Math.max(0, Math.min(1, progress))
  const t = p - 1
  const eased = 1 + 2.05 * t * t * t + 1.05 * t * t
  const fade = 1 - Math.pow(1 - p, 3)
  return {
    x: from.x * (1 - eased), y: from.y * (1 - eased), z: from.z * (1 - eased),
    scale: from.scale + (1 - from.scale) * eased,
    rotateX: from.rotateX * (1 - eased), rotateY: from.rotateY * (1 - eased), rotateZ: from.rotateZ * (1 - eased),
    opacity: from.opacity + (1 - from.opacity) * fade,
  }
}
