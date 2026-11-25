import { useNavigate } from 'react-router'
import { Art } from '../../components/Art'
import { Icon } from '../../components/Icon'
import { updateSettings } from '../../db/db'
import { useRoutines } from '../../hooks/data'

export function Plan() {
  const navigate = useNavigate()
  const routines = useRoutines()
  if (!routines) return <main className="page loading" />

  const hasAm = routines.some(r => r.tod === 'am')
  const hasPm = routines.some(r => r.tod === 'pm')
  const next = !hasAm ? 'am' : !hasPm ? 'pm' : 'done'

  const finish = async () => {
    if (routines.length) return navigate('/reminders')
    await updateSettings({ onboarded: true, onboardedAt: Date.now() })
    navigate('/', { replace: true })
  }

  return (
    <main className="page">
      <section className="onboard" aria-labelledby="plan-title">
        <div className="ob-inner">
          <div className="ob-cluster" aria-hidden="true">
            <Art shape="pump" color="sky" className="a1" />
            <Art shape="dropper" color="butter" className="a2" />
            <Art shape="jar" color="blush" className="a3" />
          </div>
          <h1 className="ob-title" id="plan-title">Plan your skincare routine by adding your <em>morning</em> and <em>night</em> routines.</h1>
          <p className="ob-times">Add the products you use, take a photo of each one, and give it the name on the bottle.</p>
          {routines.length > 0 && (
            <div className="plan-list">
              {routines.map(r => (
                <p className="plan-row" key={r.id}>
                  <Icon name={r.tod === 'am' ? 'sun' : 'moon'} />
                  <span>{r.name}, {r.productIds.length} product{r.productIds.length === 1 ? '' : 's'}</span>
                  <Icon name="check" className="ok" />
                </p>
              ))}
            </div>
          )}
          <div className="ob-actions">
            <button className={next === 'am' ? 'btn btn-primary' : 'btn btn-ghost'} type="button" onClick={() => navigate('/routine/new?tod=am&from=plan')}>
              {hasAm ? 'Add another morning routine' : 'Add a morning routine'}
            </button>
            <button className={next === 'pm' ? 'btn btn-primary' : 'btn btn-ghost'} type="button" onClick={() => navigate('/routine/new?tod=pm&from=plan')}>
              {hasPm ? 'Add another night routine' : 'Add a night routine'}
            </button>
            <button className={next === 'done' ? 'btn btn-primary' : 'btn btn-quiet'} type="button" onClick={finish}>
              {routines.length ? 'I’m done adding routines' : 'Skip for now'}
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
