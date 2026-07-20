// First-time player tutorial: a small checklist that advances by DOING
// each thing, not by reading about it. Client-side only -- GameScene and
// NetworkSystem call notify() from the same code paths the real actions
// go through, so a step completes exactly when the mechanic worked.
//
// Only shown to genuinely new players: it starts on character creation
// and tracks progress in localStorage, so a refresh mid-tutorial resumes
// where you left off and veterans (no flag) never see it. Skippable.

const STORAGE_KEY = 'bolo-tutorial';

const STEPS = [
  { id: 'move', text: 'Move around with WASD' },
  { id: 'shoot', text: 'Fire your pistol with Left Click (click once first to capture the mouse)' },
  { id: 'camera', text: 'Press V to toggle the top-down tactical view (and back)' },
  { id: 'mission', text: 'Walk up to your faction CONTACT and press F to get a job' },
  { id: 'accept', text: 'Accept the job with M (the beacon marks your objective)' },
  { id: 'store', text: 'Visit the STORE building and press E to browse weapons and cosmetics' }
];

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch (e) {
    return null;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { /* private browsing -- tutorial just won't persist */ }
}

export class Tutorial {
  constructor() {
    this.active = false;
    this.done = new Set();
  }

  // Call on character creation (fresh start) or on init when a previous
  // session left the tutorial unfinished.
  start() {
    const state = loadState();
    if (state && state.finished) return;
    this.done = new Set((state && state.done) || []);
    this.active = true;
    saveState({ finished: false, done: [...this.done] });
    this.render();
  }

  // True if a previous session started the tutorial but never finished it.
  shouldResume() {
    const state = loadState();
    return !!state && !state.finished;
  }

  notify(stepId) {
    if (!this.active || this.done.has(stepId)) return;
    this.done.add(stepId);
    saveState({ finished: false, done: [...this.done] });
    if (STEPS.every((step) => this.done.has(step.id))) {
      this.finish();
    } else {
      this.render();
    }
  }

  currentStep() {
    return STEPS.find((step) => !this.done.has(step.id));
  }

  ensurePanel() {
    let panel = document.getElementById('tutorial-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'tutorial-panel';
      panel.style.cssText = `
        position: fixed;
        right: 10px;
        bottom: 150px;
        width: 250px;
        background-color: rgba(0, 0, 0, 0.75);
        border-left: 3px solid #ffd54f;
        color: white;
        padding: 12px 14px;
        border-radius: 5px;
        font-family: Arial, sans-serif;
        font-size: 13px;
        z-index: 100;
      `;
      document.body.appendChild(panel);
    }
    return panel;
  }

  render() {
    const step = this.currentStep();
    if (!step) return;
    const stepNumber = STEPS.indexOf(step) + 1;
    const panel = this.ensurePanel();
    panel.innerHTML = `
      <div style="color: #ffd54f; font-weight: bold; font-size: 11px; letter-spacing: 1px; margin-bottom: 5px;">
        TUTORIAL ${stepNumber}/${STEPS.length}
      </div>
      <div>${step.text}</div>
      <div id="tutorial-skip" style="opacity: 0.55; font-size: 11px; margin-top: 8px; cursor: pointer; text-decoration: underline;">
        Skip tutorial
      </div>
    `;
    panel.querySelector('#tutorial-skip').onclick = () => this.skip();
  }

  finish() {
    this.active = false;
    saveState({ finished: true });
    const panel = this.ensurePanel();
    panel.innerHTML = `
      <div style="color: #81c784; font-weight: bold; margin-bottom: 5px;">TUTORIAL COMPLETE</div>
      <div>You know the basics. Press <b>H</b> anytime for the full controls, and <b>Enter</b> to chat.</div>
    `;
    setTimeout(() => this.removePanel(), 7000);
  }

  skip() {
    this.active = false;
    saveState({ finished: true });
    this.removePanel();
  }

  removePanel() {
    const panel = document.getElementById('tutorial-panel');
    if (panel) panel.remove();
  }
}
