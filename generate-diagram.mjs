import puppeteer from 'puppeteer-core'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #f8fafc;
    padding: 40px;
    color: #1e293b;
    width: 1100px;
  }
  h1 {
    font-size: 22px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 4px;
  }
  .subtitle {
    font-size: 12px;
    color: #64748b;
    margin-bottom: 32px;
  }

  /* Legend */
  .legend {
    display: flex;
    gap: 20px;
    margin-bottom: 28px;
    font-size: 11px;
    color: #475569;
  }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-dot { width: 12px; height: 12px; border-radius: 3px; }
  .leg-core   { background: #e0e7ff; border: 2px solid #4f46e5; }
  .leg-leaf   { background: #f1f5f9; border: 2px solid #94a3b8; }
  .leg-ext    { background: #fef9c3; border: 2px dashed #ca8a04; }
  .leg-data   { background: #d1fae5; border: 2px solid #059669; }

  /* Layer labels */
  .diagram {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .layer {
    display: flex;
    align-items: stretch;
    margin-bottom: 0;
  }
  .layer-label {
    width: 130px;
    min-width: 130px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #94a3b8;
    display: flex;
    align-items: center;
    padding-right: 12px;
    border-right: 2px solid #e2e8f0;
    margin-right: 24px;
  }
  .layer-content {
    flex: 1;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 16px 0;
    border-bottom: 1px dashed #e2e8f0;
  }
  .layer:last-child .layer-content { border-bottom: none; }

  /* Nodes */
  .node {
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 12px;
    line-height: 1.4;
    position: relative;
  }
  .node-title { font-weight: 700; font-size: 13px; }
  .node-sub   { font-size: 10px; color: #64748b; margin-top: 2px; }
  .node-list  { font-size: 10px; color: #475569; margin-top: 4px; padding-left: 12px; }
  .node-list li { margin-bottom: 1px; }

  /* Core nodes */
  .node-core {
    background: #e0e7ff;
    border: 2.5px solid #4f46e5;
    min-width: 200px;
  }
  .node-core .node-title { color: #3730a3; }

  /* Leaf / screen components */
  .node-leaf {
    background: #f8fafc;
    border: 2px solid #94a3b8;
    min-width: 140px;
  }
  .node-leaf .node-title { color: #334155; }

  /* External */
  .node-ext {
    background: #fef9c3;
    border: 2px dashed #ca8a04;
    min-width: 140px;
  }
  .node-ext .node-title { color: #854d0e; }

  /* Data */
  .node-data {
    background: #d1fae5;
    border: 2.5px solid #059669;
    min-width: 200px;
  }
  .node-data .node-title { color: #065f46; }

  /* Arrow connector column */
  .arrows {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 130px;
    min-width: 130px;
    padding-right: 12px;
    padding-left: 0;
    border-right: 2px solid #e2e8f0;
    margin-right: 24px;
  }
  .arrow-line {
    width: 2px;
    background: #cbd5e1;
    flex: 1;
    min-height: 20px;
  }
  .arrow-label {
    font-size: 9px;
    color: #94a3b8;
    text-align: center;
    padding: 2px 0;
    font-style: italic;
  }

  /* Dependency arrows (SVG overlay) */
  .deps {
    margin-top: 12px;
    padding: 16px 0 8px;
    border-top: 1px solid #e2e8f0;
  }
  .deps-title {
    font-size: 11px;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 10px;
    padding-left: 154px;
  }

  table.dep-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }
  table.dep-table th {
    background: #f1f5f9;
    padding: 6px 10px;
    text-align: left;
    color: #475569;
    font-weight: 600;
    border-bottom: 2px solid #e2e8f0;
  }
  table.dep-table td {
    padding: 5px 10px;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: top;
  }
  table.dep-table tr:hover td { background: #f8fafc; }
  .badge {
    display: inline-block;
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 10px;
    font-weight: 600;
    margin-right: 4px;
  }
  .badge-core   { background: #e0e7ff; color: #3730a3; }
  .badge-leaf   { background: #f1f5f9; color: #334155; border: 1px solid #94a3b8; }
  .badge-ext    { background: #fef9c3; color: #854d0e; }
  .badge-data   { background: #d1fae5; color: #065f46; }
  .badge-entry  { background: #fce7f3; color: #9d174d; border: 1px solid #f9a8d4; }

  .arrow-sym { color: #94a3b8; margin: 0 4px; }
</style>
</head>
<body>

<h1>Does AI Cheapen Talk? — Architecture Diagram</h1>
<p class="subtitle">Core nodes shown with coloured borders · Leaf nodes depend on core but nothing depends on them · Arrows show data/call flow</p>

<div class="legend">
  <div class="legend-item"><div class="legend-dot leg-core"></div> Core module</div>
  <div class="legend-item"><div class="legend-dot leg-data"></div> Data layer</div>
  <div class="legend-item"><div class="legend-dot leg-leaf"></div> Leaf component (UI)</div>
  <div class="legend-item"><div class="legend-dot leg-ext"></div> External / config</div>
</div>

<div class="diagram">

  <!-- Row 1: External / config -->
  <div class="layer">
    <div class="layer-label">External &amp; Config</div>
    <div class="layer-content">
      <div class="node node-ext">
        <div class="node-title">OpenAI API</div>
        <div class="node-sub">gpt-4o-mini · REST over HTTPS</div>
      </div>
      <div class="node node-ext">
        <div class="node-title">.env.local</div>
        <div class="node-sub">VITE_OPENAI_API_KEY</div>
        <div class="node-sub" style="margin-top:3px">Injected at build time by Vite</div>
      </div>
      <div class="node node-ext">
        <div class="node-title">vite.config.js</div>
        <div class="node-sub">Build tool · Tailwind CSS v4</div>
        <div class="node-sub">OXC transform · React plugin</div>
      </div>
    </div>
  </div>

  <!-- Row 2: API Bridge -->
  <div class="layer">
    <div class="layer-label">API Bridge</div>
    <div class="layer-content">
      <div class="node node-core" style="min-width:340px">
        <div class="node-title">openaiSender.js  <span style="font-weight:400;font-size:11px;color:#6366f1">← CORE</span></div>
        <div class="node-sub">Owns all OpenAI calls · exports 4 async functions</div>
        <ul class="node-list">
          <li><b>generateSenderPitch()</b> — AI writes a pitch (expert or bluff)</li>
          <li><b>generateReceiverDecision()</b> — AI evaluates a pitch as receiver</li>
          <li><b>improvePitch()</b> — rewrites user pitch more convincingly</li>
          <li><b>improveGrammar()</b> — grammar-only fix, no content change</li>
        </ul>
      </div>
    </div>
  </div>

  <!-- Row 3: Data Layer -->
  <div class="layer">
    <div class="layer-label">Data Layer</div>
    <div class="layer-content">
      <div class="node node-data" style="min-width:340px">
        <div class="node-title">questions.js  <span style="font-weight:400;font-size:11px;color:#059669">← CORE DATA</span></div>
        <div class="node-sub">Static question bank · no external dependencies</div>
        <ul class="node-list">
          <li><b>FIELDS[]</b> — 8 business functions (strategy, HR, finance…)</li>
          <li><b>QUESTIONS[]</b> — 160 MCQ questions (20 per field, A–D options)</li>
          <li><b>getRandomQuestions(field, n)</b> — filters &amp; shuffles pool</li>
        </ul>
      </div>
    </div>
  </div>

  <!-- Row 4: Core App -->
  <div class="layer">
    <div class="layer-label">Core App</div>
    <div class="layer-content">
      <div class="node node-core" style="min-width:620px">
        <div class="node-title">App.jsx — State Machine  <span style="font-weight:400;font-size:11px;color:#6366f1">← CORE ORCHESTRATOR</span></div>
        <div class="node-sub">All game state lives here · imports openaiSender + questions · renders screen components</div>
        <ul class="node-list" style="columns:2; column-gap:24px; margin-top:6px">
          <li><b>phase</b>: role_select | sender_answering | sender_pitching</li>
          <li><b>phase</b>: ai_evaluating | round_start | thinking | evaluate</li>
          <li><b>phase</b>: reveal | gameover</li>
          <li><b>scores</b> { sender, receiver }</li>
          <li><b>round</b>, <b>history[]</b>, <b>currentField</b></li>
          <li><b>questions[]</b>, <b>userAnswers[]</b>, <b>userPitch</b></li>
          <li><b>senderType</b>: expert | non-expert</li>
          <li><b>payoffs</b>: { +4/+2/0 based on outcome }</li>
        </ul>
      </div>
    </div>
  </div>

  <!-- Row 5: Shared UI -->
  <div class="layer">
    <div class="layer-label">Shared UI</div>
    <div class="layer-content">
      <div class="node node-leaf">
        <div class="node-title">Header</div>
        <div class="node-sub">Round counter · scores</div>
        <div class="node-sub">You vs AI label</div>
      </div>
      <div class="node node-leaf">
        <div class="node-title">FieldBadge</div>
        <div class="node-sub">Coloured pill per field</div>
        <div class="node-sub">Used in every screen</div>
      </div>
      <div class="node node-leaf">
        <div class="node-title">LoadingScreen</div>
        <div class="node-sub">Spinner during all</div>
        <div class="node-sub">async API calls</div>
      </div>
    </div>
  </div>

  <!-- Row 6: Screen Components (Leaf nodes) -->
  <div class="layer">
    <div class="layer-label">Screen Components (Leaf nodes)</div>
    <div class="layer-content">
      <div class="node node-leaf">
        <div class="node-title">RoleSelectScreen</div>
        <div class="node-sub">Hire vs Apply</div>
        <div class="node-sub">Field picker (shown after role)</div>
      </div>
      <div class="node node-leaf">
        <div class="node-title">RoundStart</div>
        <div class="node-sub">Receiver only</div>
        <div class="node-sub">Triggers AI pitch gen</div>
      </div>
      <div class="node node-leaf">
        <div class="node-title">SenderAnsweringScreen</div>
        <div class="node-sub">Radio-button MCQ</div>
        <div class="node-sub">Local grading (no API)</div>
      </div>
      <div class="node node-leaf">
        <div class="node-title">EvaluateScreen</div>
        <div class="node-sub">Shows AI pitch + questions</div>
        <div class="node-sub">Hire / Not Hire buttons</div>
      </div>
      <div class="node node-leaf">
        <div class="node-title">SenderPitchingScreen</div>
        <div class="node-sub">Pitch textarea</div>
        <div class="node-sub">Improve AI · Fix Grammar</div>
      </div>
      <div class="node node-leaf">
        <div class="node-title">RevealScreen</div>
        <div class="node-sub">Outcome + payoffs</div>
        <div class="node-sub">Correct answers shown</div>
      </div>
    </div>
  </div>

  <!-- Row 7: Entry point -->
  <div class="layer">
    <div class="layer-label">Entry Point</div>
    <div class="layer-content">
      <div class="node node-leaf" style="background:#fce7f3;border-color:#f9a8d4">
        <div class="node-title" style="color:#9d174d">index.html</div>
        <div class="node-sub">Single-page app shell</div>
      </div>
      <div class="node node-leaf" style="background:#fce7f3;border-color:#f9a8d4">
        <div class="node-title" style="color:#9d174d">main.jsx</div>
        <div class="node-sub">ReactDOM.createRoot</div>
        <div class="node-sub">Mounts &lt;App /&gt;</div>
      </div>
    </div>
  </div>

</div>

<!-- Dependency table -->
<div class="deps">
  <div class="deps-title">Dependency &amp; Data-Flow Summary</div>
  <table class="dep-table">
    <thead>
      <tr>
        <th style="width:200px">Module</th>
        <th style="width:110px">Type</th>
        <th style="width:250px">Depends on</th>
        <th>What flows through it</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><b>openaiSender.js</b></td>
        <td><span class="badge badge-core">Core</span></td>
        <td>OpenAI SDK · .env.local key</td>
        <td>Prompts out, structured text/JSON back; <code>STRIP_QUOTES</code> regex sanitises output</td>
      </tr>
      <tr>
        <td><b>questions.js</b></td>
        <td><span class="badge badge-data">Core Data</span></td>
        <td>None (pure static data)</td>
        <td>Fields array + 160-question bank; <code>getRandomQuestions</code> returns shuffled subset</td>
      </tr>
      <tr>
        <td><b>App.jsx</b></td>
        <td><span class="badge badge-core">Core</span></td>
        <td>openaiSender · questions · all screen components</td>
        <td>Entire game state (phase, scores, round, answers, pitch, payoffs); dispatches handlers down as props</td>
      </tr>
      <tr>
        <td><b>SenderAnsweringScreen</b></td>
        <td><span class="badge badge-leaf">Leaf UI</span></td>
        <td>App.jsx (props only)</td>
        <td>Renders MCQ radio buttons; calls <code>setUserAnswers</code> + <code>onSubmit</code> — grading is local (no API)</td>
      </tr>
      <tr>
        <td><b>SenderPitchingScreen</b></td>
        <td><span class="badge badge-leaf">Leaf UI</span></td>
        <td>App.jsx (props only)</td>
        <td>Pitch textarea; triggers <code>improvePitch</code> or <code>improveGrammar</code> via App handlers; submits to AI receiver</td>
      </tr>
      <tr>
        <td><b>EvaluateScreen</b></td>
        <td><span class="badge badge-leaf">Leaf UI</span></td>
        <td>App.jsx (props only)</td>
        <td>Receives AI-generated pitch string; fires <code>onDecide('expert'|'non-expert')</code></td>
      </tr>
      <tr>
        <td><b>RevealScreen</b></td>
        <td><span class="badge badge-leaf">Leaf UI</span></td>
        <td>App.jsx (props only)</td>
        <td>Reads senderType, decision, payoffs, questions+answers; purely presentational</td>
      </tr>
      <tr>
        <td><b>Header / FieldBadge / LoadingScreen</b></td>
        <td><span class="badge badge-leaf">Leaf UI</span></td>
        <td>App.jsx (props only)</td>
        <td>Presentational helpers; no state, no API calls</td>
      </tr>
      <tr>
        <td><b>main.jsx / index.html</b></td>
        <td><span class="badge badge-entry">Entry</span></td>
        <td>App.jsx · vite.config.js</td>
        <td>Bootstraps React into DOM; Vite injects env vars and bundles everything</td>
      </tr>
    </tbody>
  </table>
</div>

</body>
</html>`

const htmlPath = join(__dirname, 'architecture-diagram.html')
writeFileSync(htmlPath, html, 'utf8')

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})

const page = await browser.newPage()
await page.setViewport({ width: 1100, height: 800 })
await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' })

const pdfPath = join(__dirname, 'architecture-diagram.pdf')
await page.pdf({
  path: pdfPath,
  format: 'A3',
  landscape: true,
  printBackground: true,
  margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
})

await browser.close()
console.log('PDF saved to:', pdfPath)
