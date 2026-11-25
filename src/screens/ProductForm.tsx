import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Icon } from '../components/Icon'
import { ProductPic } from '../components/ProductPic'
import { useToast } from '../components/Toast'
import { addProduct, deleteProduct, updateProduct } from '../domain/actions'
import type { Product } from '../domain/types'
import { useProducts } from '../hooks/data'
import { processPhoto } from '../lib/photo'

const CATEGORIES = ['Cleanser', 'Moisturizer', 'Treatment', 'Sunscreen', 'Other']

export function ProductForm() {
  const { id } = useParams()
  const products = useProducts()
  if (!products) return <main className="page loading" />
  const product = id ? products.find(p => p.id === id) : undefined
  if (id && !product) {
    return (
      <main className="page"><div className="form">
        <h1>That product isn’t here anymore</h1>
        <Link className="btn btn-ghost" to="/shelf">Back to your shelf</Link>
      </div></main>
    )
  }
  return <ProductFormInner key={id ?? 'new'} product={product} />
}

function ProductFormInner({ product }: { product?: Product }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState(product?.name ?? '')
  const [category, setCategory] = useState(product?.category ?? '')
  const [note, setNote] = useState(product?.note ?? '')
  const [photo, setPhoto] = useState<{ blob: Blob; cutout: boolean } | undefined>(product?.photo ? { blob: product.photo, cutout: !!product.cutout } : undefined)
  const [err, setErr] = useState<string>()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setPhoto(await processPhoto(file))
    } catch {
      toast('That photo couldn’t be opened. Try another one.')
    }
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return setErr('Add a name to save this product.')
    const data = { name: n, category: category || undefined, note: note.trim() || undefined, photo: photo?.blob, cutout: photo?.cutout }
    if (product) await updateProduct(product.id, data)
    else await addProduct(data)
    toast(`${n} is on your shelf.`)
    navigate('/shelf', { replace: true })
  }

  const remove = async () => {
    if (!product) return
    await deleteProduct(product.id)
    toast(`${product.name} is deleted. Your history keeps its name.`)
    navigate('/shelf', { replace: true })
  }

  const draft = { id: product?.id ?? 'draft', photo: photo?.blob, cutout: photo?.cutout, category }

  return (
    <main className="page">
      <form className="form" onSubmit={save} noValidate aria-labelledby="product-title">
        <div className="form-top">
          <h1 id="product-title">{product ? 'Edit product' : 'Add a product'}</h1>
          <button type="button" className="linkbtn" onClick={() => navigate('/shelf')}>Cancel</button>
        </div>
        <div className="tile" style={{ width: 190, alignSelf: 'center', cursor: 'default' }}>
          <div className="tile-art"><ProductPic product={draft} size={110} /></div>
          <h3 className="tile-name">{name.trim() || 'Your product'}</h3>
          <p className="tile-cat">{category || 'No category'}</p>
        </div>
        <label className="field">
          <span>Name</span>
          <input type="text" autoComplete="off" placeholder="As it’s written on the bottle" value={name} onChange={e => { setName(e.target.value); setErr(undefined) }} />
        </label>
        <div className="field">
          <span>Photo <em>(optional)</em></span>
          <div className="row2">
            <label className="btn btn-ghost" htmlFor="pf-camera"><Icon name="camera" />Take a photo</label>
            <label className="btn btn-ghost" htmlFor="pf-library">Choose from photos</label>
          </div>
          <input type="file" id="pf-camera" accept="image/*" capture="environment" className="sr" onChange={onPhoto} />
          <input type="file" id="pf-library" accept="image/*" className="sr" onChange={onPhoto} />
          {photo && <button type="button" className="linkbtn np-lib" onClick={() => setPhoto(undefined)}>Remove the photo</button>}
          <p className="hint">{photo?.cutout ? 'Cut-out found. It shows as a die-cut sticker.' : 'Photos stay on your phone.'}</p>
        </div>
        <fieldset className="field">
          <legend>Category <em>(optional)</em></legend>
          <div className="chips">
            {CATEGORIES.map(c => (
              <label key={c}>
                <input type="radio" name="category" checked={category === c} onChange={() => setCategory(c)} onClick={() => { if (category === c) setCategory('') }} />
                <span>{c}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span>Note <em>(optional)</em></span>
          <input type="text" autoComplete="off" placeholder="For example, the tube with the green cap" value={note} onChange={e => setNote(e.target.value)} />
        </label>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-quiet" onClick={() => navigate('/shelf')}>Cancel</button>
          <button type="submit" className="btn btn-primary">{product ? 'Save changes' : 'Add to shelf'}</button>
        </div>
        {product && (
          <div className="card">
            {confirmDelete ? (
              <>
                <p>Delete {product.name}? It comes out of your routines. Your history keeps its name.</p>
                <div className="row2">
                  <button type="button" className="btn btn-danger" onClick={remove}>Delete it</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
                </div>
              </>
            ) : (
              <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>Delete this product</button>
            )}
          </div>
        )}
      </form>
    </main>
  )
}
