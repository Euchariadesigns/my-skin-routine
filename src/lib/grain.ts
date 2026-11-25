/** A faint paper grain over the whole app, generated once on start. */
export function applyPaperGrain(): void {
  try {
    const size = 150
    const c = document.createElement('canvas')
    c.width = c.height = size
    const ctx = c.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(size, size)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() * 255) | 0
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = (Math.random() * 28) | 0
    }
    ctx.putImageData(img, 0, 0)
    document.documentElement.style.setProperty('--grain', `url(${c.toDataURL()})`)
  } catch {
    /* purely decorative */
  }
}
