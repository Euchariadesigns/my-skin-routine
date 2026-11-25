const MAX_SIDE = 900

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { source: bmp, width: bmp.width, height: bmp.height }
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return { source: img, width: img.naturalWidth, height: img.naturalHeight }
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

/**
 * Shrinks a photo before it's saved on the phone and notices cut-outs (transparent backgrounds),
 * which then show as die-cut stickers. Throws when the file isn't a readable image.
 */
export async function processPhoto(file: Blob): Promise<{ blob: Blob; cutout: boolean }> {
  if (!file.type.startsWith('image/')) throw new Error('not an image')
  const { source, width, height } = await decode(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  ctx.drawImage(source, 0, 0, w, h)

  let cutout = false
  if (!/jpe?g/i.test(file.type)) {
    const s = 48
    const probe = document.createElement('canvas')
    probe.width = probe.height = s
    const pctx = probe.getContext('2d')
    if (pctx) {
      pctx.drawImage(canvas, 0, 0, s, s)
      const data = pctx.getImageData(0, 0, s, s).data
      let clear = 0
      for (let i = 3; i < data.length; i += 4) if (data[i] < 200) clear++
      cutout = clear / (s * s) > 0.04
    }
  }

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, cutout ? 'image/png' : 'image/jpeg', 0.85))
  if (!blob) throw new Error('could not save the photo')
  return { blob, cutout }
}
