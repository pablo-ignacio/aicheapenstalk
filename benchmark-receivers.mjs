/**
 * benchmark-receivers.mjs
 *
 * Has an AI agent evaluate every simulated applicant pitch using the same
 * prompt and model as the live game's generateReceiverDecision function.
 * Produces a ground-truth baseline of AI receiver accuracy.
 *
 * Run with:
 *   node --env-file=.env.local benchmark-receivers.mjs
 *
 * Output: benchmark-receivers.json
 */

import OpenAI from 'openai'
import { readFileSync, writeFileSync } from 'fs'
import { QUESTIONS } from './src/questions.js'

// ── Config ────────────────────────────────────────────────────────────────────

const API_KEY   = process.env.VITE_OPENAI_API_KEY
const BATCH_SIZE = 20
const OUT_PATH   = './benchmark-receivers.json'

if (!API_KEY) {
  console.error('Missing VITE_OPENAI_API_KEY. Run with: node --env-file=.env.local benchmark-receivers.mjs')
  process.exit(1)
}

const openai     = new OpenAI({ apiKey: API_KEY })
const applicants = JSON.parse(readFileSync('./src/simulated-applicants.json', 'utf8'))

// ── Evaluation ────────────────────────────────────────────────────────────────

async function evaluateApplicant(applicant, index) {
  const fieldLabel = applicant.field.charAt(0).toUpperCase() + applicant.field.slice(1)
  const questions  = applicant.questions
    .map(id => QUESTIONS.find(q => q.id === id))
    .filter(Boolean)

  if (questions.length < 2) {
    console.warn(`  Warning: could not resolve questions for ${applicant.id}`)
    return null
  }

  const prompt = `You are playing a signaling game as an evaluator. Determine whether a sender is a genuine expert in ${fieldLabel}.

The sender was tested on these questions (you don't know their answers):
1. ${questions[0].question}
2. ${questions[1].question}

The sender's pitch:
"${applicant.pitch}"

Based only on the pitch, decide: is this sender a genuine expert in ${fieldLabel}? Be a tough but fair evaluator.

Return JSON only: { "decision": "expert" or "non-expert", "reasoning": "one sentence explanation" }`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  })

  const result     = JSON.parse(response.choices[0].message.content)
  const aiDecision = result.decision  // "expert" or "non-expert"
  const correct    = (aiDecision === 'expert') === applicant.isExpert

  return {
    id:          `rec_${String(index).padStart(4, '0')}`,
    applicantId: applicant.id,
    field:       applicant.field,
    writingHelp: applicant.writingHelp,
    isExpert:    applicant.isExpert,
    aiDecision,
    correct,
    reasoning:   result.reasoning,
    evaluatedAt: new Date().toISOString(),
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const total = applicants.length
  console.log(`\nEvaluating ${total} applicants (${BATCH_SIZE} concurrent)...\n`)

  const results = []
  let done = 0

  for (let i = 0; i < applicants.length; i += BATCH_SIZE) {
    const batch      = applicants.slice(i, i + BATCH_SIZE)
    const batchNum   = Math.floor(i / BATCH_SIZE) + 1
    const totalBatch = Math.ceil(applicants.length / BATCH_SIZE)
    process.stdout.write(`Batch ${batchNum}/${totalBatch} ...`)

    const batchResults = await Promise.all(
      batch.map((a, j) => evaluateApplicant(a, i + j + 1))
    )
    const valid = batchResults.filter(Boolean)
    results.push(...valid)
    done += valid.length
    console.log(` done  (${done}/${total})`)
  }

  writeFileSync(OUT_PATH, JSON.stringify(results, null, 2))

  // ── Summary ────────────────────────────────────────────────────────────────

  const accuracy = results.filter(r => r.correct).length / results.length
  console.log(`\n✓ Saved ${results.length} records to ${OUT_PATH}`)
  console.log(`\nOverall AI receiver accuracy: ${(accuracy * 100).toFixed(1)}%`)

  console.log('\nBy writing help:')
  for (const help of ['none', 'grammar', 'both']) {
    const subset = results.filter(r => r.writingHelp === help)
    const acc    = subset.filter(r => r.correct).length / subset.length
    console.log(`  ${help.padEnd(10)} n=${subset.length}  accuracy=${(acc * 100).toFixed(1)}%`)
  }

  console.log('\nBy expert status:')
  for (const isExpert of [true, false]) {
    const subset = results.filter(r => r.isExpert === isExpert)
    const acc    = subset.filter(r => r.correct).length / subset.length
    const label  = isExpert ? 'expert    ' : 'non-expert'
    console.log(`  ${label} n=${subset.length}  accuracy=${(acc * 100).toFixed(1)}%`)
  }

  console.log('\nBy field:')
  const fields = [...new Set(results.map(r => r.field))]
  for (const field of fields) {
    const subset = results.filter(r => r.field === field)
    const acc    = subset.filter(r => r.correct).length / subset.length
    console.log(`  ${field.padEnd(32)} n=${subset.length}  accuracy=${(acc * 100).toFixed(1)}%`)
  }
}

main().catch(err => {
  console.error('\nFailed:', err.message)
  process.exit(1)
})
