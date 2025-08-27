import './index.css'
import { useEffect, useState } from 'react'
import { api } from './api'
import { login, logout, onUser } from './auth'

function App() {
  const [data, setData] = useState<{ actual: any[]; forecast: any[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [datasetId, setDatasetId] = useState<string>(localStorage.getItem('datasetId') || 'seed-dataset')
  const [orgId, setOrgId] = useState<string>(localStorage.getItem('orgId') || (import.meta.env.VITE_ORG_ID || 'seed-org'))
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    const unsub = onUser((u) => setUserEmail(u?.email ?? null))
    return () => unsub()
  }, [])

  const load = async () => {
    setError(null)
    try {
      const res = await api<{ actual: any[]; forecast: any[] }>(`/dashboard/${datasetId}`)
      setData(res)
    } catch (e: any) {
      setError(e.message || 'Error')
    }
  }

  const forecast = async () => {
    setError(null)
    try {
      await api(`/datasets/${datasetId}/forecast`, { method: 'POST', body: JSON.stringify({ horizon: 3 }) })
      await load()
    } catch (e: any) {
      setError(e.message || 'Error')
    }
  }

  useEffect(() => { load() }, [datasetId])

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">ForecastPro Dashboard</h1>

      <div className="flex items-center gap-2 mb-4">
        {userEmail ? (
          <>
            <span className="text-sm text-slate-600">{userEmail}</span>
            <button onClick={() => logout()} className="px-3 py-1 bg-slate-600 text-white rounded">Logout</button>
          </>
        ) : (
          <button onClick={() => login()} className="px-3 py-1 bg-slate-600 text-white rounded">Login</button>
        )}
        <a className="px-3 py-1 bg-slate-600 text-white rounded" href="http://localhost:3000/docs" target="_blank">API Docs</a>
      </div>

      <div className="flex gap-4 mb-4">
        <label className="text-sm">Org ID
          <input value={orgId} onChange={(e) => { setOrgId(e.target.value); localStorage.setItem('orgId', e.target.value) }} className="ml-2 border px-2 py-1 rounded" />
        </label>
        <label className="text-sm">Dataset ID
          <input value={datasetId} onChange={(e) => { setDatasetId(e.target.value); localStorage.setItem('datasetId', e.target.value) }} className="ml-2 border px-2 py-1 rounded" />
        </label>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={load} className="px-3 py-1 bg-blue-600 text-white rounded">Reload</button>
        <button onClick={forecast} className="px-3 py-1 bg-emerald-600 text-white rounded">Run Forecast</button>
        <a className="px-3 py-1 bg-slate-600 text-white rounded" href={`http://localhost:3000/datasets/${datasetId}/export.csv`}>Export CSV</a>
      </div>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h2 className="font-semibold mb-2">Actual (last 12)</h2>
          <table className="w-full text-sm border">
            <thead><tr><th className="border p-1">Date</th><th className="border p-1">Value</th></tr></thead>
            <tbody>
              {data?.actual?.map((p, i) => (
                <tr key={i}><td className="border p-1">{new Date(p.date).toISOString().slice(0,10)}</td><td className="border p-1">{p.value}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h2 className="font-semibold mb-2">Forecast (next)</h2>
          <table className="w-full text-sm border">
            <thead><tr><th className="border p-1">Date</th><th className="border p-1">Predicted</th></tr></thead>
            <tbody>
              {data?.forecast?.map((p, i) => (
                <tr key={i}><td className="border p-1">{new Date(p.date).toISOString().slice(0,10)}</td><td className="border p-1">{p.predicted}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default App
