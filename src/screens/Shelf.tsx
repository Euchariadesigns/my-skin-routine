import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { Icon } from '../components/Icon'
import { ProductPic } from '../components/ProductPic'
import { useProducts } from '../hooks/data'

export function Shelf() {
  const products = useProducts()
  if (!products) return null
  const newestFirst = [...products].reverse()
  return (
    <div className="view">
      <header className="pagehead">
        <span className="label">Your products</span>
        <h1>Shelf</h1>
        <p>Names stay exactly as you type them. Photos stay on your phone.</p>
      </header>
      <div className="grid">
        <Link className="tile tile-add" to="/product/new"><Icon name="plus" />Add a product</Link>
        {newestFirst.map((p, i) => (
          <Link key={p.id} className="tile" to={`/product/${p.id}`}>
            <div className="tile-art" style={{ '--tilt': `${i % 2 ? 2 : -2.5}deg` } as CSSProperties}>
              <ProductPic product={p} size={110} />
            </div>
            <h3 className="tile-name">{p.name}</h3>
            <p className="tile-cat">{p.category || 'No category'}</p>
            {p.note && <p className="tile-note">{p.note}</p>}
          </Link>
        ))}
      </div>
    </div>
  )
}
