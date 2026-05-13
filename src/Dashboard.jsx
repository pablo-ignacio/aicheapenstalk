import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import benchmarkRaw from '../benchmark-receivers.json'

const DASHBOARD_PASSWORD = import.meta.env.VITE_DASHBOARD_PASSWORD || 'research2026'

const FIELDS = [
  'strategy', 'human resources', 'finance', 'accounting',
  'operations', 'marketing', 'sales', 'ai and information systems',
]
const HELP      = ['none', 'grammar', 'both']
const HELP_LABEL = { none: 'No AI', grammar: 'Grammar only', both: 'Full AI' }

function fieldLabel(f) { return f.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') }
function pct(c, n)     { return n === 0 ? '—' : (100 * c / n).toFixed(1) + '%' }

// Pre-compute benchmark lookup: field → writingHelp → { n, correct }
const bmLookup = {}
for (const r of benchmarkRaw) {
  bmLookup[r.field] ??= {}
  bmLookup[r.field][r.writingHelp] ??= { n: 0, correct: 0 }
  bmLookup[r.field][r.writingHelp].n++
  if (r.correct) bmLookup[r.field][r.writingHelp].correct++
}

// Pre-compute benchmark hired lookup: field → writingHelp → { nExpert, hiredExpert, nNonExpert, hiredNonExpert }
const bmHiredLookup = {}
for (const r of benchmarkRaw) {
  bmHiredLookup[r.field] ??= {}
  bmHiredLookup[r.field][r.writingHelp] ??= { nExpert: 0, hiredExpert: 0, nNonExpert: 0, hiredNonExpert: 0 }
  const hired = r.aiDecision === 'expert'
  if (r.isExpert) { bmHiredLookup[r.field][r.writingHelp].nExpert++; if (hired) bmHiredLookup[r.field][r.writingHelp].hiredExpert++ }
  else            { bmHiredLookup[r.field][r.writingHelp].nNonExpert++; if (hired) bmHiredLookup[r.field][r.writingHelp].hiredNonExpert++ }
}

// ── Field accordion ────────────────────────────────────────────────────────────

function FieldAccordion({ field, hrLookup }) {
  const [open, setOpen] = useState(false)
  const hr = hrLookup[field] ?? {}
  const bm = bmLookup[field] ?? {}
  const totalN = HELP.reduce((s, h) => s + (hr[h]?.n ?? 0), 0)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <span className="text-sm font-semibold text-slate-800">{fieldLabel(field)}</span>
        <div className="flex items-center gap-3">
          {totalN > 0 && <span className="text-xs text-slate-400">{totalN} human rounds</span>}
          <span className="text-slate-400 text-sm">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-slate-100">
          <table className="w-full text-xs mt-3">
            <thead>
              <tr className="text-slate-400 uppercase tracking-wide">
                <th className="text-left pb-2 pr-3 font-medium">Writing help</th>
                <th className="text-center pb-2 pr-3 font-medium">N</th>
                <th className="text-center pb-2 pr-3 font-medium">Human accuracy</th>
                <th className="text-center pb-2 font-medium">AI accuracy</th>
              </tr>
            </thead>
            <tbody>
              {HELP.map(h => {
                const human = hr[h] ?? { n: 0, correct: 0 }
                const ai    = bm[h] ?? { n: 0, correct: 0 }
                return (
                  <tr key={h} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 text-slate-700">{HELP_LABEL[h]}</td>
                    <td className="py-1.5 pr-3 text-center text-slate-500">{human.n || '—'}</td>
                    <td className="py-1.5 pr-3 text-center font-medium text-slate-800">{pct(human.correct, human.n)}</td>
                    <td className="py-1.5 text-center font-medium text-slate-400">{pct(ai.correct, ai.n)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FieldAccordionApplicant({ field, srLookup }) {
  const [open, setOpen] = useState(false)
  const sr    = srLookup[field] ?? {}
  const bm    = bmHiredLookup[field] ?? {}
  const totalN = HELP.reduce((s, h) => s + (sr[h]?.nExpert ?? 0) + (sr[h]?.nNonExpert ?? 0), 0)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <span className="text-sm font-semibold text-slate-800">{fieldLabel(field)}</span>
        <div className="flex items-center gap-3">
          {totalN > 0 && <span className="text-xs text-slate-400">{totalN} human rounds</span>}
          <span className="text-slate-400 text-sm">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-slate-100">
          <table className="w-full text-xs mt-3">
            <thead>
              <tr className="text-slate-400 uppercase tracking-wide">
                <th className="text-left pb-2 pr-3 font-medium">Writing help</th>
                <th className="text-center pb-2 pr-3 font-medium">N (exp/non)</th>
                <th className="text-center pb-2 pr-3 font-medium">% expert hired</th>
                <th className="text-center pb-2 pr-3 font-medium">% non-expert hired</th>
                <th className="text-center pb-2 pr-3 font-medium">AI % expert hired</th>
                <th className="text-center pb-2 font-medium">AI % non-expert hired</th>
              </tr>
            </thead>
            <tbody>
              {HELP.map(h => {
                const human = sr[h] ?? { nExpert: 0, hiredExpert: 0, nNonExpert: 0, hiredNonExpert: 0 }
                const ai    = bm[h] ?? { nExpert: 0, hiredExpert: 0, nNonExpert: 0, hiredNonExpert: 0 }
                return (
                  <tr key={h} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 text-slate-700">{HELP_LABEL[h]}</td>
                    <td className="py-1.5 pr-3 text-center text-slate-500">{human.nExpert || '—'}/{human.nNonExpert || '—'}</td>
                    <td className="py-1.5 pr-3 text-center font-medium text-slate-800">{pct(human.hiredExpert, human.nExpert)}</td>
                    <td className="py-1.5 pr-3 text-center font-medium text-slate-800">{pct(human.hiredNonExpert, human.nNonExpert)}</td>
                    <td className="py-1.5 pr-3 text-center font-medium text-slate-400">{pct(ai.hiredExpert, ai.nExpert)}</td>
                    <td className="py-1.5 text-center font-medium text-slate-400">{pct(ai.hiredNonExpert, ai.nNonExpert)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Password gate ──────────────────────────────────────────────────────────────

export function DashboardGate({ onExit, onLogout }) {
  const [input, setInput]     = useState('')
  const [unlocked, setUnlock] = useState(false)
  const [wrong, setWrong]     = useState(false)

  function attempt() {
    if (input === DASHBOARD_PASSWORD) setUnlock(true)
    else { setWrong(true); setInput('') }
  }

  if (unlocked) return <Dashboard onExit={onExit} onLogout={onLogout} />

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8">
        <h1 className="text-xl font-bold text-slate-900 mb-1">Research Dashboard</h1>
        <p className="text-slate-500 text-sm mb-6">Password required.</p>
        <input
          type="password"
          value={input}
          autoFocus
          onChange={e => { setInput(e.target.value); setWrong(false) }}
          onKeyDown={e => e.key === 'Enter' && attempt()}
          placeholder="Password"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        {wrong && <p className="text-red-500 text-xs mb-3">Incorrect password.</p>}
        {!wrong && <div className="mb-3" />}
        <div className="flex gap-2">
          <button onClick={attempt} className="flex-1 bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-slate-700 transition-colors">
            Enter
          </button>
          <button onClick={onExit} className="text-sm text-slate-500 hover:text-slate-800 px-3 transition-colors">
            ← Back
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

function localDatetime(date) {
  const p = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`
}
function todayStart() { const d = new Date(); d.setHours(0,0,0,0);   return localDatetime(d) }
function todayEnd()   { const d = new Date(); d.setHours(23,59,0,0); return localDatetime(d) }

function Dashboard({ onExit, onLogout }) {
  const [tab, setTab]           = useState('evaluator')
  const [rd, setRd]             = useState(null)
  const [sr, setSr]             = useState(null)
  const [loading, setLoad]      = useState(true)
  const [error, setError]       = useState(null)
  const [filterFrom, setFrom]   = useState(todayStart())
  const [filterTo,   setTo]     = useState(todayEnd())

  function load() {
    if (!supabase) { setError('Supabase not configured.'); setLoad(false); return }
    setLoad(true)
    Promise.all([
      supabase.from('receiver_decisions').select('*'),
      supabase.from('sender_rounds').select('*'),
    ]).then(([r1, r2]) => {
      if (r1.error) throw r1.error
      if (r2.error) throw r2.error
      setRd(r1.data); setSr(r2.data); setLoad(false)
    }).catch(e => { setError(e.message); setLoad(false) })
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <p className="text-slate-400 text-sm animate-pulse">Loading…</p>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-6 max-w-md">
        <p className="text-red-600 font-medium mb-1">Error loading data</p>
        <p className="text-slate-500 text-sm">{error}</p>
      </div>
    </div>
  )

  // Apply datetime range filter
  const fromMs = filterFrom ? new Date(filterFrom).getTime() : null
  const toMs   = filterTo   ? new Date(filterTo).getTime()   : null

  function inRange(r) {
    const t = new Date(r.created_at).getTime()
    if (fromMs && t < fromMs) return false
    if (toMs   && t > toMs)   return false
    return true
  }

  const rows   = rd.filter(inRange)
  const srRows = sr.filter(inRange)

  // Build human applicant lookup: field → writingHelp → { nExpert, hiredExpert, nNonExpert, hiredNonExpert }
  const srLookup = {}
  for (const r of srRows) {
    srLookup[r.field] ??= {}
    srLookup[r.field][r.writing_help] ??= { nExpert: 0, hiredExpert: 0, nNonExpert: 0, hiredNonExpert: 0 }
    const hired = r.ai_decision === 'expert'
    if (r.is_expert) { srLookup[r.field][r.writing_help].nExpert++;    if (hired) srLookup[r.field][r.writing_help].hiredExpert++ }
    else             { srLookup[r.field][r.writing_help].nNonExpert++;  if (hired) srLookup[r.field][r.writing_help].hiredNonExpert++ }
  }

  // Build human evaluator lookup: field → writingHelp → { n, correct }
  const hrLookup = {}
  for (const r of rows) {
    hrLookup[r.field] ??= {}
    hrLookup[r.field][r.applicant_writing_help] ??= { n: 0, correct: 0 }
    hrLookup[r.field][r.applicant_writing_help].n++
    if (r.correct) hrLookup[r.field][r.applicant_writing_help].correct++
  }

  const totalSessions = new Set(rows.map(r => r.session_id)).size
  const totalRounds   = rows.length

  // Summary: aggregate across all fields by writing help
  const summary = HELP.map(h => {
    const sub = rows.filter(r => r.applicant_writing_help === h)
    const aiAll = FIELDS.reduce((acc, f) => {
      const bm = bmLookup[f]?.[h] ?? { n: 0, correct: 0 }
      return { n: acc.n + bm.n, correct: acc.correct + bm.correct }
    }, { n: 0, correct: 0 })
    return { h, humanN: sub.length, humanCorrect: sub.filter(r => r.correct).length, aiN: aiAll.n, aiCorrect: aiAll.correct }
  })

  // Last 10 evaluator sessions
  const sessionMap = {}
  for (const r of rows) {
    sessionMap[r.session_id] ??= { field: r.field, username: r.username, rounds: [], latestAt: r.created_at }
    sessionMap[r.session_id].rounds.push(r)
    if (r.created_at > sessionMap[r.session_id].latestAt) sessionMap[r.session_id].latestAt = r.created_at
  }
  const lastSessions = Object.entries(sessionMap)
    .sort((a, b) => b[1].latestAt.localeCompare(a[1].latestAt))
    .slice(0, 10)

  // Last 10 applicant sessions
  const srSessionMap = {}
  for (const r of srRows) {
    srSessionMap[r.session_id] ??= { field: r.field, username: r.username, writingHelp: r.writing_help, rounds: [], latestAt: r.created_at }
    srSessionMap[r.session_id].rounds.push(r)
    if (r.created_at > srSessionMap[r.session_id].latestAt) srSessionMap[r.session_id].latestAt = r.created_at
  }
  const lastApplicantSessions = Object.entries(srSessionMap)
    .sort((a, b) => b[1].latestAt.localeCompare(a[1].latestAt))
    .slice(0, 10)

  return (
    <div className="min-h-screen bg-slate-900 py-10 px-4">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white">Research Dashboard</h1>
            <p className="text-slate-400 text-sm mt-0.5">Does AI Cheapen Talk?</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="datetime-local" value={filterFrom} onChange={e => setFrom(e.target.value)}
              className="bg-slate-800 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <span className="text-slate-400 text-sm">to</span>
            <input type="datetime-local" value={filterTo} onChange={e => setTo(e.target.value)}
              className="bg-slate-800 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button onClick={() => { setFrom(''); setTo('') }}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${!filterFrom && !filterTo ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-600 text-slate-400 hover:text-white hover:border-slate-400'}`}>
              All time
            </button>
            <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 transition-colors">
              ↻ Refresh
            </button>
            <button onClick={onExit} className="text-slate-400 hover:text-white text-sm transition-colors ml-2">← Back</button>
            <button onClick={onLogout} className="text-xs px-3 py-1.5 rounded-lg border border-rose-800 text-rose-400 hover:bg-rose-900 hover:text-rose-200 transition-colors">
              Log out
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-slate-800 rounded-xl p-1 w-fit">
          {['evaluator', 'applicant'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-6 py-2 rounded-lg text-sm font-semibold transition-colors capitalize ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Evaluator tab */}
        {tab === 'evaluator' && (
          <div className="space-y-6">
            <p className="text-slate-400 text-sm">{totalSessions} sessions · {totalRounds} rounds</p>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">All fields — by writing help</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 uppercase tracking-wide">
                    <th className="text-left pb-2 pr-3 font-medium">Writing help</th>
                    <th className="text-center pb-2 pr-3 font-medium">N</th>
                    <th className="text-center pb-2 pr-3 font-medium">Human accuracy</th>
                    <th className="text-center pb-2 font-medium">AI accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map(({ h, humanN, humanCorrect, aiN, aiCorrect }) => (
                    <tr key={h} className="border-t border-slate-100">
                      <td className="py-1.5 pr-3 text-slate-700 font-medium">{HELP_LABEL[h]}</td>
                      <td className="py-1.5 pr-3 text-center text-slate-500">{humanN || '—'}</td>
                      <td className="py-1.5 pr-3 text-center font-semibold text-slate-800">{pct(humanCorrect, humanN)}</td>
                      <td className="py-1.5 text-center font-medium text-slate-400">{pct(aiCorrect, aiN)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 pt-4 pb-3">Last {lastSessions.length} evaluators</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 uppercase tracking-wide bg-slate-50 border-y border-slate-100">
                    <th className="text-left px-4 py-2.5 font-medium">#</th>
                    <th className="text-left px-4 py-2.5 font-medium">Name</th>
                    <th className="text-left px-4 py-2.5 font-medium">Field</th>
                    <th className="text-center px-4 py-2.5 font-medium">Rounds</th>
                    <th className="text-center px-4 py-2.5 font-medium">Correct</th>
                    <th className="text-center px-4 py-2.5 font-medium">Accuracy</th>
                    <th className="text-right px-4 py-2.5 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {lastSessions.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No data yet.</td></tr>
                  )}
                  {lastSessions.map(([sid, s], i) => {
                    const correct = s.rounds.filter(r => r.correct).length
                    return (
                      <tr key={sid} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-slate-400">{i + 1}</td>
                        <td className="px-4 py-2.5 text-slate-800 font-medium">{s.username || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-700">{fieldLabel(s.field)}</td>
                        <td className="px-4 py-2.5 text-center text-slate-500">{s.rounds.length}</td>
                        <td className="px-4 py-2.5 text-center text-slate-500">{correct}/{s.rounds.length}</td>
                        <td className="px-4 py-2.5 text-center font-semibold text-slate-800">{pct(correct, s.rounds.length)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-400">{new Date(s.latestAt).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">By field</p>
            <div className="space-y-2">
              {FIELDS.map(field => <FieldAccordion key={field} field={field} hrLookup={hrLookup} />)}
            </div>
          </div>
        )}

        {/* Applicant tab */}
        {tab === 'applicant' && (
          <div className="space-y-6">
            <p className="text-slate-400 text-sm">{new Set(srRows.map(r => r.session_id)).size} sessions · {srRows.length} rounds</p>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">All fields — by writing help</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 uppercase tracking-wide">
                    <th className="text-left pb-2 pr-3 font-medium">Writing help</th>
                    <th className="text-center pb-2 pr-3 font-medium">N (exp/non)</th>
                    <th className="text-center pb-2 pr-3 font-medium">% expert hired</th>
                    <th className="text-center pb-2 pr-3 font-medium">% non-expert hired</th>
                    <th className="text-center pb-2 pr-3 font-medium">AI % expert hired</th>
                    <th className="text-center pb-2 font-medium">AI % non-expert hired</th>
                  </tr>
                </thead>
                <tbody>
                  {HELP.map(h => {
                    const sub        = srRows.filter(r => r.writing_help === h)
                    const experts    = sub.filter(r => r.is_expert)
                    const nonExperts = sub.filter(r => !r.is_expert)
                    const aiAll = FIELDS.reduce((acc, f) => {
                      const bm = bmHiredLookup[f]?.[h] ?? { nExpert: 0, hiredExpert: 0, nNonExpert: 0, hiredNonExpert: 0 }
                      return { nExpert: acc.nExpert + bm.nExpert, hiredExpert: acc.hiredExpert + bm.hiredExpert, nNonExpert: acc.nNonExpert + bm.nNonExpert, hiredNonExpert: acc.hiredNonExpert + bm.hiredNonExpert }
                    }, { nExpert: 0, hiredExpert: 0, nNonExpert: 0, hiredNonExpert: 0 })
                    return (
                      <tr key={h} className="border-t border-slate-100">
                        <td className="py-1.5 pr-3 text-slate-700 font-medium">{HELP_LABEL[h]}</td>
                        <td className="py-1.5 pr-3 text-center text-slate-500">{experts.length || '—'}/{nonExperts.length || '—'}</td>
                        <td className="py-1.5 pr-3 text-center font-semibold text-slate-800">{pct(experts.filter(r => r.ai_decision === 'expert').length, experts.length)}</td>
                        <td className="py-1.5 pr-3 text-center font-semibold text-slate-800">{pct(nonExperts.filter(r => r.ai_decision === 'expert').length, nonExperts.length)}</td>
                        <td className="py-1.5 pr-3 text-center font-medium text-slate-400">{pct(aiAll.hiredExpert, aiAll.nExpert)}</td>
                        <td className="py-1.5 text-center font-medium text-slate-400">{pct(aiAll.hiredNonExpert, aiAll.nNonExpert)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 pt-4 pb-3">Last {lastApplicantSessions.length} applicants</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 uppercase tracking-wide bg-slate-50 border-y border-slate-100">
                    <th className="text-left px-4 py-2.5 font-medium">#</th>
                    <th className="text-left px-4 py-2.5 font-medium">Name</th>
                    <th className="text-left px-4 py-2.5 font-medium">Field</th>
                    <th className="text-left px-4 py-2.5 font-medium">Writing help</th>
                    <th className="text-center px-4 py-2.5 font-medium">Rounds</th>
                    <th className="text-center px-4 py-2.5 font-medium">% hired</th>
                    <th className="text-right px-4 py-2.5 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {lastApplicantSessions.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No data yet.</td></tr>
                  )}
                  {lastApplicantSessions.map(([sid, s], i) => {
                    const hired = s.rounds.filter(r => r.ai_decision === 'expert').length
                    return (
                      <tr key={sid} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-slate-400">{i + 1}</td>
                        <td className="px-4 py-2.5 text-slate-800 font-medium">{s.username || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-700">{fieldLabel(s.field)}</td>
                        <td className="px-4 py-2.5 text-slate-600">{HELP_LABEL[s.writingHelp] ?? s.writingHelp}</td>
                        <td className="px-4 py-2.5 text-center text-slate-500">{s.rounds.length}</td>
                        <td className="px-4 py-2.5 text-center font-semibold text-slate-800">{pct(hired, s.rounds.length)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-400">{new Date(s.latestAt).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">By field</p>
            <div className="space-y-2">
              {FIELDS.map(field => <FieldAccordionApplicant key={field} field={field} srLookup={srLookup} />)}
            </div>
          </div>
        )}

        <p className="text-slate-600 text-xs text-center pb-4">
          AI accuracy from benchmark run 2026-05-07 · Human data live
        </p>
      </div>
    </div>
  )
}
