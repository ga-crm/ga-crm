export interface HexCell {
  x: number
  y: number
}

/**
 * Centres of a pointy-top hexagon grid that covers `width` × `height`, running one cell past the
 * right and bottom edges so the pattern never ends short. `radius` is centre to corner.
 */
export function hexCenters(width: number, height: number, radius: number): HexCell[] {
  if (!(width > 0) || !(height > 0) || !(radius > 0)) return []
  const stepX = Math.sqrt(3) * radius
  const stepY = 1.5 * radius
  const cells: HexCell[] = []
  for (let row = 0; row * stepY <= height + radius; row++) {
    // Every other row sits half a cell to the right, which is what makes the honeycomb
    for (let x = row % 2 ? stepX / 2 : 0; x <= width + stepX / 2; x += stepX) {
      cells.push({ x, y: row * stepY })
    }
  }
  return cells
}

/** How strongly a point `distance` away from a light of the given `reach` glows, 0 to 1, falling off smoothly. */
export function glowAt(distance: number, reach: number): number {
  if (!(reach > 0) || distance >= reach) return 0
  return (1 - Math.max(0, distance) / reach) ** 2
}
