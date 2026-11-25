import { useEffect, useState } from 'react'
import type { Product } from '../domain/types'
import { Icon, categoryIcon } from './Icon'

/* One object URL per product photo, reused across renders and screens. */
const cache = new Map<string, { size: number; url: string }>()

function urlFor(id: string, blob: Blob): string {
  const hit = cache.get(id)
  if (hit && hit.size === blob.size) return hit.url
  if (hit) URL.revokeObjectURL(hit.url)
  const url = URL.createObjectURL(blob)
  cache.set(id, { size: blob.size, url })
  return url
}

export function usePhotoUrl(product?: Pick<Product, 'id' | 'photo'>): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => (product?.photo ? urlFor(product.id, product.photo) : undefined))
  useEffect(() => {
    setUrl(product?.photo ? urlFor(product.id, product.photo) : undefined)
  }, [product?.id, product?.photo])
  return url
}

/** A product's photo as a sticker, or a doodle when there's no photo. */
export function ProductPic({ product, size }: { product?: Pick<Product, 'id' | 'photo' | 'cutout' | 'category'>; size: number }) {
  const url = usePhotoUrl(product)
  if (url && product?.cutout) return <img className="pic-cutout" src={url} alt="" style={{ width: size, height: size }} />
  if (url) return <img className="pic-photo" src={url} alt="" style={{ width: Math.round(size * 0.86), height: size }} />
  const d = Math.round(size * 0.82)
  return (
    <span className="pic-none" style={{ width: d, height: d }}>
      <Icon name={categoryIcon(product?.category)} />
    </span>
  )
}
