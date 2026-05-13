import { useState, useEffect, useMemo } from 'react'
import { generateReceiverDecision, improvePitch, improveGrammar } from './openaiSender'
import { getRandomQuestions, FIELDS, QUESTIONS } from './questions'
import simulatedApplicants from './simulated-applicants.json'
import { supabase } from './supabase'
import { DashboardGate } from './Dashboard'

const MAX_PITCH_CHARS = 400
const GAME_PASSWORD = import.meta.env.VITE_GAME_PASSWORD || 'play2026'

const FIELD_STYLES = {
  'strategy':                  { badge: 'bg-indigo-100 text-indigo-800 border-indigo-300',   dot: 'bg-indigo-500' },
  'human resources':           { badge: 'bg-emerald-100 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500' },
  'finance':                   { badge: 'bg-teal-100 text-teal-800 border-teal-300',          dot: 'bg-teal-500' },
  'accounting':                { badge: 'bg-blue-100 text-blue-800 border-blue-300',          dot: 'bg-blue-500' },
  'operations':                { badge: 'bg-orange-100 text-orange-800 border-orange-300',    dot: 'bg-orange-500' },
  'marketing':                 { badge: 'bg-rose-100 text-rose-800 border-rose-300',          dot: 'bg-rose-500' },
  'sales':                     { badge: 'bg-amber-100 text-amber-800 border-amber-300',       dot: 'bg-amber-500' },
  'ai and information systems':{ badge: 'bg-violet-100 text-violet-800 border-violet-300',    dot: 'bg-violet-500' },
}

function FieldBadge({ field }) {
  const s = FIELD_STYLES[field]
  if (!s) return null
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {field.charAt(0).toUpperCase() + field.slice(1)}
    </span>
  )
}

function Header({ scores, round, totalRounds, role }) {
  const youScore  = role === 'sender' ? scores.sender   : scores.receiver
  const theyScore = role === 'sender' ? scores.receiver : scores.sender
  const theyLabel = role === 'sender' ? 'AI Evaluator'  : 'AI Applicant'
  return (
    <div className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700">
      <span className="text-white font-semibold text-sm tracking-tight">Does AI Cheapen Talk?</span>
      <div className="flex items-center gap-5 text-sm">
        <span className="text-slate-400">Round <strong className="text-white">{round}</strong>/{totalRounds}</span>
        <span className="text-slate-400">You: <strong className="text-sky-400">{youScore}</strong></span>
        <span className="text-slate-400">{theyLabel}: <strong className="text-rose-400">{theyScore}</strong></span>
      </div>
    </div>
  )
}

export default function App() {
  const [isDashboard, setIsDashboard]      = useState(() => window.location.hash === '#dashboard')
  const [username, setUsername]            = useState(null)
  const [sessionId, setSessionId]          = useState(() => crypto.randomUUID())
  const [phase, setPhase]                 = useState('role_select')
  const [role, setRole]                   = useState(null)
  const [currentField, setCurrentField]   = useState(null)
  const [questions, setQuestions]         = useState([])
  const [usedIds, setUsedIds]             = useState([])
  const [usedApplicantIds, setUsedApplicantIds] = useState([])
  const [currentApplicantId, setCurrentApplicantId] = useState(null)
  const [applicantWritingHelp, setApplicantWritingHelp] = useState(null)
  const [aiAssist, setAiAssist]           = useState('both')
  const [senderType, setSenderType]       = useState(null)
  const [pitch, setPitch]                 = useState('')
  const [userAnswers, setUserAnswers]     = useState([null, null])
  const [answerAssessment, setAssessment] = useState(null)
  const [userPitch, setUserPitch]         = useState('')
  const [aiDecision, setAiDecision]       = useState(null)
  const [aiReasoning, setAiReasoning]     = useState('')
  const [evaluatorChoice, setEvalChoice]  = useState(null)
  const [lastPayoffs, setLastPayoffs]     = useState(null)
  const [totalRounds, setTotalRounds]     = useState(2)
  const [scores, setScores]               = useState({ sender: 0, receiver: 0 })
  const [round, setRound]                 = useState(1)
  const [history, setHistory]             = useState([])
  const [error, setError]                 = useState('')

  // ── Helpers ───────────────────────────────────────────────────────────────

  function computePayoffs(isExpert, labeledExpert) {
    let sp = 0, rp = 0
    if  (isExpert &&  labeledExpert) { sp = 4; rp = 4 }
    if  (isExpert && !labeledExpert) { sp = 0; rp = 0 }
    if (!isExpert &&  labeledExpert) { sp = 2; rp = -2 }
    if (!isExpert && !labeledExpert) { sp = 0; rp = 4 }
    return { senderPayoff: sp, receiverPayoff: rp, correct: isExpert === labeledExpert }
  }

  function drawApplicant(field, excludeIds) {
    const pool = simulatedApplicants.filter(a => a.field === field && !excludeIds.includes(a.id))
    if (!pool.length) return null
    return pool[Math.floor(Math.random() * pool.length)]
  }

  function loadNextApplicant(field, excludeIds) {
    const applicant = drawApplicant(field, excludeIds)
    if (!applicant) { setError('No more applicants available for this field.'); return }
    const qs = applicant.questions.map(id => QUESTIONS.find(q => q.id === id)).filter(Boolean)
    setSenderType(applicant.isExpert ? 'expert' : 'non-expert')
    setQuestions(qs)
    setUsedApplicantIds(prev => [...prev, applicant.id])
    setCurrentApplicantId(applicant.id)
    setApplicantWritingHelp(applicant.writingHelp)
    setPitch(applicant.pitch)
  }

  function recordRound(isExpert, labeledExpert) {
    const p = computePayoffs(isExpert, labeledExpert)
    setLastPayoffs(p)
    setScores(prev => ({ sender: prev.sender + p.senderPayoff, receiver: prev.receiver + p.receiverPayoff }))
    setHistory(prev => [...prev, {
      round, field: currentField,
      senderType: isExpert ? 'expert' : 'non-expert',
      choice: labeledExpert ? 'expert' : 'non-expert',
      correct: p.correct, senderPayoff: p.senderPayoff, receiverPayoff: p.receiverPayoff,
    }])
    return p
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleRoleSelect(selectedRole, selectedField, selectedRounds) {
    const field = selectedField === 'random'
      ? FIELDS[Math.floor(Math.random() * FIELDS.length)]
      : selectedField
    setRole(selectedRole)
    setCurrentField(field)
    setTotalRounds(selectedRounds)
    if (selectedRole === 'sender') {
      const qs = getRandomQuestions(field, 2, [])
      setQuestions(qs)
      setUsedIds(qs.map(q => q.id))
      setPhase('ai_options')
    } else {
      loadNextApplicant(field, [])
      setPhase('round_start')
    }
  }

  function handleAiOptionsChoice(choice) {
    setAiAssist(choice)
    setPhase('sender_answering')
  }

  function handleStartRound() {
    setPhase('evaluate')
  }

  function handleDecision(choice) {
    const isExpert = senderType === 'expert'
    const labeledExpert = choice === 'expert'
    const p = recordRound(isExpert, labeledExpert)
    setEvalChoice(choice)
    setPhase('reveal')
    if (supabase) {
      supabase.from('receiver_decisions').insert({
        session_id:             sessionId,
        username,
        round,
        field:                  currentField,
        applicant_id:           currentApplicantId,
        applicant_writing_help: applicantWritingHelp,
        applicant_is_expert:    isExpert,
        human_decision:         choice,
        correct:                p.correct,
        receiver_payoff:        p.receiverPayoff,
        applicant_payoff:       p.senderPayoff,
      }).then(({ error }) => { if (error) console.warn('Supabase log error:', error.message) })
    }
  }

  function handleSubmitAnswers() {
    const q1Correct = userAnswers[0] === questions[0].correct
    const q2Correct = userAnswers[1] === questions[1].correct
    const isExpert = q1Correct && q2Correct
    setAssessment({ isExpert, q1Correct, q2Correct })
    setSenderType(isExpert ? 'expert' : 'non-expert')
    setPhase('sender_pitching')
  }

  async function handleImprovePitch(currentPitch) {
    const improved = await improvePitch(currentField, currentPitch)
    setUserPitch(improved.slice(0, MAX_PITCH_CHARS))
  }

  async function handleImproveGrammar(currentPitch) {
    const fixed = await improveGrammar(currentPitch)
    setUserPitch(fixed.slice(0, MAX_PITCH_CHARS))
  }

  async function handleSubmitPitch() {
    setError('')
    setPhase('ai_evaluating')
    try {
      const result = await generateReceiverDecision(currentField, questions, userPitch)
      setAiDecision(result.decision)
      setAiReasoning(result.reasoning)
      const isExpert = senderType === 'expert'
      const labeledExpert = result.decision === 'expert'
      const p = recordRound(isExpert, labeledExpert)
      setPhase('reveal')
      if (supabase) {
        supabase.from('sender_rounds').insert({
          session_id:   sessionId,
          username,
          round,
          field:        currentField,
          writing_help: aiAssist,
          question_ids: questions.map(q => q.id),
          is_expert:    isExpert,
          pitch:        userPitch,
          ai_decision:  result.decision,
          correct:      p.correct,
          sender_payoff: p.senderPayoff,
          ai_payoff:     p.receiverPayoff,
        }).then(({ error }) => { if (error) console.warn('Supabase log error:', error.message) })
      }
    } catch (e) {
      setError('API error: ' + (e.message || 'Unknown'))
      setPhase('sender_pitching')
    }
  }

  function handleNext() {
    if (round >= totalRounds) { setPhase('gameover'); return }
    setRound(r => r + 1)
    if (role === 'sender') {
      const qs = getRandomQuestions(currentField, 2, usedIds)
      setQuestions(qs)
      setUsedIds(prev => [...prev, ...qs.map(q => q.id)])
    } else {
      loadNextApplicant(currentField, usedApplicantIds)
    }
    setUserAnswers([null, null])
    setUserPitch('')
    setAssessment(null)
    setAiDecision(null)
    setAiReasoning('')
    setEvalChoice(null)
    setSenderType(null)
    setPhase(role === 'receiver' ? 'round_start' : 'sender_answering')
  }

  function handleRestart() {
    setSessionId(crypto.randomUUID())
    setScores({ sender: 0, receiver: 0 })
    setRound(1)
    setHistory([])
    setRole(null)
    setCurrentField(null)
    setQuestions([])
    setUsedIds([])
    setUsedApplicantIds([])
    setApplicantWritingHelp(null)
    setUserAnswers([null, null])
    setUserPitch('')
    setAssessment(null)
    setAiDecision(null)
    setAiReasoning('')
    setEvalChoice(null)
    setSenderType(null)
    setPhase('role_select')
  }

  function handleLogout() {
    handleRestart()
    setUsername(null)
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const onHash = () => setIsDashboard(window.location.hash === '#dashboard')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (isDashboard) {
    return <DashboardGate onExit={() => { window.location.hash = ''; setIsDashboard(false) }} onLogout={() => { window.location.hash = ''; setIsDashboard(false); handleLogout() }} />
  }

  if (!username) {
    return <LoginScreen onLogin={setUsername} />
  }

  if (import.meta.env.DEV && !import.meta.env.VITE_OPENAI_API_KEY) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
          <h1 className="text-xl font-bold text-slate-900 mb-3">API Key Not Configured</h1>
          <p className="text-slate-600 text-sm mb-4">
            Add <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">VITE_OPENAI_API_KEY</code> to <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">.env.local</code> for local development:
          </p>
          <pre className="bg-slate-900 text-emerald-400 text-xs rounded-lg px-4 py-3 mb-4">VITE_OPENAI_API_KEY=sk-...</pre>
          <p className="text-slate-400 text-xs">Then restart the dev server (<code className="font-mono">npm run dev</code>).</p>
        </div>
      </div>
    )
  }

  if (phase === 'role_select') {
    return <RoleSelectScreen onStart={handleRoleSelect} />
  }

  if (phase === 'gameover') {
    const correct = history.filter(h => h.correct).length
    const youScore  = role === 'sender' ? scores.sender   : scores.receiver
    const theyScore = role === 'sender' ? scores.receiver : scores.sender
    const theyLabel = role === 'sender' ? 'AI Evaluator' : 'Applicant'
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-1">Game Over</h2>
          <p className="text-slate-500 text-sm mb-6">{totalRounds} rounds · {currentField}</p>
          <div className={`grid ${role === 'receiver' ? 'grid-cols-1' : 'grid-cols-2'} gap-4 mb-6`}>
            <div className="bg-sky-50 rounded-xl p-4 text-center border border-sky-100">
              <p className="text-3xl font-bold text-sky-600">{youScore}</p>
              <p className="text-xs text-slate-500 mt-1">Your score</p>
            </div>
            {role === 'sender' && (
              <div className="bg-rose-50 rounded-xl p-4 text-center border border-rose-100">
                <p className="text-3xl font-bold text-rose-500">{theyScore}</p>
                <p className="text-xs text-slate-500 mt-1">{theyLabel}</p>
              </div>
            )}
          </div>
          <div className="space-y-1.5 mb-6">
            {history.map((h, i) => {
              const yourPayoff = role === 'sender' ? h.senderPayoff : h.receiverPayoff
              let label
              if (role === 'sender') {
                const hired = h.choice === 'expert'
                if (!hired) {
                  label = `You were not hired: ${yourPayoff >= 0 ? '+' : ''}${yourPayoff}`
                } else {
                  const expertStr = h.senderType === 'expert' ? 'an expert' : 'not an expert'
                  label = `You were ${expertStr} and you were hired: ${yourPayoff >= 0 ? '+' : ''}${yourPayoff}`
                }
              } else {
                const wasExpert = h.senderType === 'expert'
                const didHire = h.choice === 'expert'
                const sign = yourPayoff >= 0 ? '+' : ''
                const appPayoff = h.senderPayoff
                const appSign = appPayoff >= 0 ? '+' : ''
                const appSuffix = ` (applicant got: ${appSign}${appPayoff})`
                if (wasExpert && didHire) {
                  label = `The applicant was an expert, so you hired them: ${sign}${yourPayoff}${appSuffix}`
                } else if (!wasExpert && !didHire) {
                  label = `The applicant was not an expert, so you did not hire them: ${sign}${yourPayoff}${appSuffix}`
                } else if (wasExpert && !didHire) {
                  label = `The applicant was an expert, but you did not hire them: ${sign}${yourPayoff}${appSuffix}`
                } else {
                  label = `The applicant was not an expert, but you hired them: ${sign}${yourPayoff}${appSuffix}`
                }
              }
              return (
                <div key={i} className={`text-xs px-3 py-2 rounded-lg ${yourPayoff > 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                  <span className="font-medium">Round {h.round}: </span>{label}
                </div>
              )
            })}
          </div>
          <p className="text-slate-400 text-xs text-center mb-3">To play again, log out and re-enter with a new name.</p>
          <button onClick={handleLogout} className="w-full bg-slate-800 text-white font-semibold py-2.5 rounded-lg hover:bg-slate-700 transition-colors">
            Log out
          </button>
        </div>
      </div>
    )
  }

  // ── Main game ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <Header scores={scores} round={round} totalRounds={totalRounds} role={role} />
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-8">

          {phase === 'round_start' && (
            <RoundStart field={currentField} round={round} totalRounds={totalRounds} questions={questions} onStart={handleStartRound} error={error} />
          )}
          {phase === 'thinking' && <LoadingScreen message="AI applicant is preparing their pitch…" />}
          {phase === 'evaluate' && (
            <EvaluateScreen pitch={pitch} field={currentField} questions={questions} writingHelp={applicantWritingHelp} onDecide={handleDecision} />
          )}
          {phase === 'ai_options' && (
            <AiOptionsScreen field={currentField} onChoose={handleAiOptionsChoice} />
          )}
          {phase === 'sender_answering' && (
            <SenderAnsweringScreen
              questions={questions} field={currentField} round={round}
              userAnswers={userAnswers} setUserAnswers={setUserAnswers}
              onSubmit={handleSubmitAnswers}
            />
          )}
          {phase === 'sender_pitching' && (
            <SenderPitchingScreen
              questions={questions} field={currentField}
              answerAssessment={answerAssessment} senderType={senderType}
              userAnswers={userAnswers}
              userPitch={userPitch} setUserPitch={setUserPitch}
              onImprove={handleImprovePitch}
              onImproveGrammar={handleImproveGrammar}
              onSubmit={handleSubmitPitch} error={error}
              aiAssist={aiAssist}
            />
          )}
          {phase === 'ai_evaluating' && <LoadingScreen message="The AI evaluator is evaluating your pitch…" />}
          {phase === 'reveal' && (
            <RevealScreen
              role={role} senderType={senderType}
              evaluatorChoice={evaluatorChoice} aiDecision={aiDecision} aiReasoning={aiReasoning}
              questions={questions} answerAssessment={answerAssessment}
              payoffs={lastPayoffs} field={currentField}
              onNext={handleNext} round={round} totalRounds={totalRounds}
            />
          )}

        </div>
      </div>
    </div>
  )
}

// ── Screen components ─────────────────────────────────────────────────────────

function LoginScreen({ onLogin }) {
  const [usernameInput, setUsernameInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [wrong, setWrong]                 = useState(false)

  function attempt() {
    if (!usernameInput.trim()) return
    if (passwordInput !== GAME_PASSWORD) { setWrong(true); setPasswordInput(''); return }
    onLogin(usernameInput.trim())
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Does AI Cheapen Talk?</h1>
        <p className="text-slate-500 text-sm mb-6">Enter your name and the session password to begin.</p>
        <div className="space-y-3 mb-4">
          <input
            type="text"
            value={usernameInput}
            autoFocus
            onChange={e => { setUsernameInput(e.target.value); setWrong(false) }}
            onKeyDown={e => e.key === 'Enter' && attempt()}
            placeholder="Your name"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <input
            type="password"
            value={passwordInput}
            onChange={e => { setPasswordInput(e.target.value); setWrong(false) }}
            onKeyDown={e => e.key === 'Enter' && attempt()}
            placeholder="Password"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        {wrong && <p className="text-red-500 text-xs mb-3">Incorrect password.</p>}
        {!wrong && <div className="mb-3" />}
        <button
          onClick={attempt}
          disabled={!usernameInput.trim()}
          className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          Start →
        </button>
        <p className="text-slate-400 text-xs mt-4 leading-relaxed">
          By participating you agree that your written pitch will be evaluated by OpenAI's API, and that your name and game outcomes will be stored for research purposes only. No other data leaves your device.
        </p>
      </div>
    </div>
  )
}

function RoleSelectScreen({ onStart }) {
  const [step, setStep] = useState('role')
  const [selectedRole, setSelectedRole] = useState(null)
  const [selectedField, setSelectedField] = useState('random')
  const [selectedRounds, setSelectedRounds] = useState(2)

  const roundOptions = [1, 2, 3, 4, 5, 6, 8, 10]

  const fieldOptions = [
    { value: 'random',                       label: 'Random' },
    { value: 'strategy',                     label: 'Strategy' },
    { value: 'human resources',              label: 'Human Resources' },
    { value: 'finance',                      label: 'Finance' },
    { value: 'accounting',                   label: 'Accounting' },
    { value: 'operations',                   label: 'Operations' },
    { value: 'marketing',                    label: 'Marketing' },
    { value: 'sales',                        label: 'Sales' },
    { value: 'ai and information systems',   label: 'AI & Information Systems' },
  ]

  if (step === 'role') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-6">Does AI Cheapen Talk?</h1>
          <p className="text-sm font-medium text-slate-700 mb-3">Select your role</p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => setSelectedRole('receiver')}
              className={`p-4 rounded-xl border-2 text-left transition-all ${selectedRole === 'receiver' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200'}`}
            >
              <p className="font-semibold text-slate-800 mb-1">Hire</p>
              <p className="text-xs text-slate-500">You get $4 if you hire an expert or pass on a non-expert.</p>
            </button>
            <button
              onClick={() => setSelectedRole('sender')}
              className={`p-4 rounded-xl border-2 text-left transition-all ${selectedRole === 'sender' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200'}`}
            >
              <p className="font-semibold text-slate-800 mb-1">Apply</p>
              <p className="text-xs text-slate-500">If hired you get $2 for sure and extra $2 if you are an expert. Not hired means $0.</p>
            </button>
          </div>
          <button
            onClick={() => setStep('field')}
            disabled={!selectedRole}
            className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            Continue →
          </button>
        </div>
      </div>
    )
  }

  if (step === 'field') return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Does AI Cheapen Talk?</h1>
        <p className="text-sm font-medium text-slate-700 mb-3">Select a field <span className="text-slate-400 font-normal">(same for all rounds)</span></p>
        <div className="grid grid-cols-3 gap-2 mb-6">
          {fieldOptions.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setSelectedField(value)}
              className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-all ${
                selectedField === value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setStep('role')}
            className="px-5 py-3 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={() => setStep('rounds')}
            className="flex-1 bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Continue →
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Does AI Cheapen Talk?</h1>
        <p className="text-sm font-medium text-slate-700 mb-3">How many rounds?</p>
        <div className="grid grid-cols-4 gap-2 mb-6">
          {roundOptions.map(n => (
            <button
              key={n}
              onClick={() => setSelectedRounds(n)}
              className={`py-2 rounded-lg text-sm font-semibold border transition-all ${
                selectedRounds === n
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setStep('field')}
            className="px-5 py-3 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={() => onStart(selectedRole, selectedField, selectedRounds)}
            className="flex-1 bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Start Game →
          </button>
        </div>
      </div>
    </div>
  )
}

function RoundStart({ field, round, totalRounds, questions, onStart, error }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Round {round} of {totalRounds}</p>
        {field && <FieldBadge field={field} />}
      </div>
      <p className="text-sm text-slate-600 mb-3">The applicant was tested on these two questions — expertise means answering both correctly. Correct answers are revealed after your hiring decision.</p>
      {questions.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {questions.map((q, i) => (
            <div key={q.id} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm text-slate-700">
              <span className="font-medium text-slate-400 mr-2">Q{i + 1}.</span>{q.question}
            </div>
          ))}
        </div>
      )}
      <p className="text-sm text-slate-600 mb-5">Their pitch responds to these questions. To assist their writing, they chose only one: full AI assistance, grammar help only, or none — shown on the next screen.</p>
      {error && <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 mb-4 text-sm text-rose-700">{error}</div>}
      <button onClick={onStart} className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 transition-colors">
        Assess Applicant →
      </button>
    </div>
  )
}

function LoadingScreen({ message }) {
  return (
    <div className="text-center py-10">
      <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-5" />
      <p className="text-slate-600 text-sm">{message}</p>
    </div>
  )
}

const WRITING_HELP_LABELS = {
  both:    { text: 'Used AI to improve pitch',       style: 'bg-amber-50 border-amber-200 text-amber-800' },
  grammar: { text: 'Used AI for grammar only',       style: 'bg-sky-50 border-sky-200 text-sky-800' },
  none:    { text: 'No AI assistance',               style: 'bg-slate-50 border-slate-200 text-slate-600' },
}

function EvaluateScreen({ pitch, field, questions, writingHelp, onDecide }) {
  const helpLabel = WRITING_HELP_LABELS[writingHelp]
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Assess the Applicant</span>
        {field && <FieldBadge field={field} />}
      </div>

      {helpLabel && (
        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold mb-3 ${helpLabel.style}`}>
          {helpLabel.text}
        </div>
      )}

      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4 mb-6">
        <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">Applicant&apos;s Pitch</p>
        <p className="text-slate-800 leading-relaxed italic">&ldquo;{pitch}&rdquo;</p>
      </div>

      <p className="text-sm text-slate-500 text-center mb-3">Do you hire this applicant for a <strong>{field}</strong> position?</p>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => onDecide('expert')} className="py-3 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all">Yes</button>
        <button onClick={() => onDecide('non-expert')} className="py-3 rounded-xl font-semibold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 transition-all">No</button>
      </div>
    </div>
  )
}

const DISPLAY_LETTERS = ['A', 'B', 'C', 'D']

function SenderAnsweringScreen({ questions, field, round, userAnswers, setUserAnswers, onSubmit }) {
  const [current, setCurrent] = useState(0)
  const q = questions[current]
  const isLast = current === questions.length - 1
  const answered = userAnswers[current] !== null

  const shuffledOptions = useMemo(
    () => Object.entries(q.options).slice().sort(() => Math.random() - 0.5),
    [q.id]
  )

  function selectAnswer(letter) {
    setUserAnswers(prev => prev.map((a, j) => j === current ? letter : a))
  }

  function handleNext() {
    if (isLast) onSubmit()
    else setCurrent(c => c + 1)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Answer the Questions</p>
        <p className="text-xs text-slate-400">{current + 1} out of {questions.length}</p>
      </div>
      <div className="flex items-center gap-2 mb-5">
        {field && <FieldBadge field={field} />}
      </div>

      <p className="text-sm font-medium text-slate-800 mb-3">{q.question}</p>

      <div className="space-y-1.5 mb-6">
        {shuffledOptions.map(([originalLetter, text], idx) => {
          const selected = userAnswers[current] === originalLetter
          return (
            <button
              key={originalLetter}
              onClick={() => selectAnswer(originalLetter)}
              className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-lg border text-sm transition-all ${
                selected
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40'
              }`}
            >
              <span className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                selected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-300 text-slate-400'
              }`}>
                {DISPLAY_LETTERS[idx]}
              </span>
              <span className="leading-snug">{text}</span>
            </button>
          )
        })}
      </div>

      <button onClick={handleNext} disabled={!answered} className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
        {isLast ? 'Submit Answers →' : 'Next →'}
      </button>
    </div>
  )
}

function AiOptionsScreen({ field, onChoose }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-slate-900 mb-1">Writing options</h2>
      <p className="text-sm text-slate-500 mb-6">
        After writing your pitch in <strong>{field}</strong>, would you like AI assistance to be available?
      </p>
      <div className="space-y-3">
        <button
          onClick={() => onChoose('both')}
          className="w-full text-left px-5 py-4 rounded-xl border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-colors"
        >
          <p className="font-semibold text-indigo-900 mb-0.5">Yes — give me AI tools</p>
          <p className="text-xs text-indigo-600">Buttons to improve your pitch with AI and fix grammar will appear on the writing screen.</p>
        </button>
        <button
          onClick={() => onChoose('grammar')}
          className="w-full text-left px-5 py-4 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors"
        >
          <p className="font-semibold text-emerald-900 mb-0.5">Only grammar help</p>
          <p className="text-xs text-emerald-600">A button to fix spelling and grammar will appear, but no AI content improvement.</p>
        </button>
        <button
          onClick={() => onChoose('none')}
          className="w-full text-left px-5 py-4 rounded-xl border-2 border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
        >
          <p className="font-semibold text-slate-800 mb-0.5">No — I&apos;ll write it myself</p>
          <p className="text-xs text-slate-500">No AI assistance. Your pitch will be entirely your own words.</p>
        </button>
      </div>
    </div>
  )
}

function SenderPitchingScreen({ questions, field, answerAssessment, senderType, userAnswers, userPitch, setUserPitch, onImprove, onImproveGrammar, onSubmit, error, aiAssist }) {
  const [improving, setImproving] = useState(false)
  const [fixingGrammar, setFixingGrammar] = useState(false)
  const isExpert = senderType === 'expert'
  const remaining = MAX_PITCH_CHARS - userPitch.length

  async function handleImprove() {
    setImproving(true)
    try { await onImprove(userPitch) } finally { setImproving(false) }
  }

  async function handleFixGrammar() {
    setFixingGrammar(true)
    try { await onImproveGrammar(userPitch) } finally { setFixingGrammar(false) }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Write Your Pitch</span>
        {field && <FieldBadge field={field} />}
      </div>

      {/* Assessment result */}
      <div className={`rounded-xl px-4 py-3 mb-4 border ${isExpert ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
        <p className={`font-bold text-sm mb-2 ${isExpert ? 'text-emerald-800' : 'text-rose-800'}`}>
          You are: {isExpert ? 'Expert' : 'Non-Expert'}
        </p>
        <p className={`text-xs ${isExpert ? 'text-emerald-700' : 'text-rose-700'}`}>
          {isExpert ? 'You answered both questions correctly.' : 'You did not answer both questions correctly.'}
        </p>
      </div>

      <p className="text-sm text-slate-500 mb-2">
        Now write a pitch convincing the AI evaluator you are an expert in <strong>{field}</strong>. The evaluator does not know your true expertise.
      </p>

      <textarea
        value={userPitch}
        onChange={e => setUserPitch(e.target.value.slice(0, MAX_PITCH_CHARS))}
        placeholder="Write your pitch…"
        rows={4}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-1"
      />
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {aiAssist === 'both' && (
            <button
              onClick={handleImprove}
              disabled={!userPitch.trim() || improving || fixingGrammar}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-40 transition-colors"
            >
              {improving ? 'Improving…' : '✦ Improve with AI'}
            </button>
          )}
          {(aiAssist === 'both' || aiAssist === 'grammar') && (
            <button
              onClick={handleFixGrammar}
              disabled={!userPitch.trim() || improving || fixingGrammar}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition-colors"
            >
              {fixingGrammar ? 'Fixing…' : '✎ Fix Grammar'}
            </button>
          )}
        </div>
        <p className={`text-xs ${remaining < 50 ? 'text-amber-600' : 'text-slate-400'}`}>
          {remaining} chars remaining
        </p>
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 mb-4 text-sm text-rose-700">{error}</div>}
      <button onClick={onSubmit} disabled={!userPitch.trim()} className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
        Submit Pitch →
      </button>
    </div>
  )
}

function RevealScreen({ role, senderType, evaluatorChoice, aiDecision, aiReasoning, questions, answerAssessment, payoffs, field, onNext, round, totalRounds }) {
  const isExpert = senderType === 'expert'
  const correct = payoffs?.correct
  const youPayoff = role === 'sender' ? payoffs?.senderPayoff : payoffs?.receiverPayoff
  const theyPayoff = role === 'sender' ? payoffs?.receiverPayoff : payoffs?.senderPayoff
  const theyLabel = role === 'sender' ? 'AI Evaluator' : 'AI Applicant'
  const hired = aiDecision === 'expert'

  return (
    <div>
      {role === 'sender' ? (
        <>
          {/* Hired / not hired */}
          <div className={`rounded-xl px-4 py-3 mb-4 border ${hired ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
            {hired ? (
              <p className="font-bold text-base text-emerald-800">You are hired.</p>
            ) : isExpert ? (
              <p className="font-bold text-base text-rose-800">You are an expert, but you failed to convince the recruiter. You get zero.</p>
            ) : (
              <p className="font-bold text-base text-rose-800">You are not hired. You get zero.</p>
            )}
          </div>

          {/* Earnings breakdown — only if hired */}
          {hired && (
            <div className="bg-sky-50 border border-sky-100 rounded-xl px-4 py-3 mb-4 text-sm text-sky-900">
              {isExpert ? (
                <p>You get a salary of <strong>$2</strong> and a bonus of <strong>$2</strong> because you are an expert. Total: <strong>$4</strong>.</p>
              ) : (
                <p>You get a salary of <strong>$2</strong>.</p>
              )}
            </div>
          )}

          {/* Payoffs */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className={`rounded-xl p-3 text-center border ${youPayoff > 0 ? 'bg-sky-50 border-sky-100' : youPayoff < 0 ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
              <p className={`text-2xl font-bold ${youPayoff > 0 ? 'text-sky-600' : youPayoff < 0 ? 'text-rose-600' : 'text-slate-400'}`}>{youPayoff >= 0 ? '+' : ''}{youPayoff}</p>
              <p className="text-xs text-slate-500 mt-0.5">Your points</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-slate-500">{theyPayoff >= 0 ? '+' : ''}{theyPayoff}</p>
              <p className="text-xs text-slate-500 mt-0.5">{theyLabel}&apos;s points</p>
            </div>
          </div>

          {/* AI reasoning */}
          {aiReasoning && (
            <p className="text-xs text-slate-500 italic mb-4">AI reasoning: &ldquo;{aiReasoning}&rdquo;</p>
          )}

          {/* Correct answers */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Correct answers</span>
              {field && <FieldBadge field={field} />}
            </div>
            <div className="space-y-3">
              {questions.map((q, i) => {
                const userCorrect = i === 0 ? answerAssessment?.q1Correct : answerAssessment?.q2Correct
                return (
                  <div key={q.id} className="bg-slate-50 rounded-lg p-3.5 text-sm border border-slate-100">
                    <div className="flex items-start gap-2 mb-1">
                      <span className={`mt-0.5 text-xs font-bold flex-shrink-0 ${userCorrect ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {userCorrect ? '✓' : '✗'}
                      </span>
                      <p className="font-medium text-slate-800">Q{i + 1}: {q.question}</p>
                    </div>
                    <p className="text-slate-600 text-xs leading-relaxed pl-4">
                      <span className="font-semibold text-emerald-700">Answer: </span>{q.answer}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Receiver outcome banner */}
          <div className={`rounded-xl px-4 py-3 mb-5 border ${correct ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
            <p className={`font-bold text-base ${correct ? 'text-emerald-800' : 'text-rose-800'}`}>
              {correct && isExpert ? 'Correct! The applicant was an expert, so you hired them.' : null}
              {correct && !isExpert ? 'Correct! The applicant was not an expert, so you did not hire them.' : null}
              {!correct && isExpert ? 'Wrong call. The applicant was an expert, but you did not hire them.' : null}
              {!correct && !isExpert ? 'Wrong call. The applicant was not an expert, but you hired them.' : null}
            </p>
          </div>

          {/* Questions + answers */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Questions &amp; correct answers</span>
              {field && <FieldBadge field={field} />}
            </div>
            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={q.id} className="bg-slate-50 rounded-lg p-3.5 text-sm border border-slate-100">
                  <p className="font-medium text-slate-800 mb-1">Q{i + 1}: {q.question}</p>
                  <p className="text-slate-600 text-xs leading-relaxed">
                    <span className="font-semibold text-emerald-700">Answer: </span>{q.answer}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {isExpert ? 'The applicant answered both questions correctly — genuine expert.' : 'The applicant failed to answer both questions correctly — non-expert.'}
            </p>
          </div>

          {/* Payoffs */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className={`rounded-xl p-3 text-center border ${youPayoff > 0 ? 'bg-sky-50 border-sky-100' : youPayoff < 0 ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
              <p className={`text-2xl font-bold ${youPayoff > 0 ? 'text-sky-600' : youPayoff < 0 ? 'text-rose-600' : 'text-slate-400'}`}>{youPayoff >= 0 ? '+' : ''}{youPayoff}</p>
              <p className="text-xs text-slate-500 mt-0.5">Your points</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-slate-500">{theyPayoff >= 0 ? '+' : ''}{theyPayoff}</p>
              <p className="text-xs text-slate-500 mt-0.5">{theyLabel}&apos;s points</p>
            </div>
          </div>
        </>
      )}

      <button onClick={onNext} className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 transition-colors">
        {round >= totalRounds ? 'See Final Results' : 'Next Round →'}
      </button>
    </div>
  )
}
