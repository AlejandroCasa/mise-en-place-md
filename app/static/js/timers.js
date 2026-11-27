// ============================================================================
// Mise en Place MD — Kitchen Timers & Wake Lock Mode
// ============================================================================

import { ICONS } from "./constants.js";
import { escapeHtml, state } from "./state.js";

export function createTimerEntry(label, minutes) {
  const totalSeconds = Math.round((Number(minutes) || 1) * 60);
  return {
    id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label,
    remainingSeconds: totalSeconds,
    totalSeconds,
    paused: false,
  };
}

export function tickTimers(timers) {
  let finishedNow = false;
  for (const timer of timers) {
    if (!timer.paused && timer.remainingSeconds > 0) {
      timer.remainingSeconds -= 1;
      if (timer.remainingSeconds === 0) {
        finishedNow = true;
      }
    }
  }
  return finishedNow;
}

export function startKitchenTimer(label, minutes) {
  state.activeTimers.push(createTimerEntry(label, minutes));
  ensureTimerInterval();
  renderTimersDock();
}

export function ensureTimerInterval() {
  if (state.timerInterval) return;
  state.timerInterval = setInterval(() => {
    const anyFinished = tickTimers(state.activeTimers);
    if (anyFinished) {
      playTimerBeep();
    }
    renderTimersDock();
    if (state.activeTimers.length === 0) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }, 1000);
}

export function togglePauseTimer(timerId) {
  const timer = state.activeTimers.find((x) => x.id === timerId);
  if (timer) timer.paused = !timer.paused;
  renderTimersDock();
}

export function removeTimer(timerId) {
  state.activeTimers = state.activeTimers.filter((x) => x.id !== timerId);
  renderTimersDock();
}

export function playTimerBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    [0, 0.25, 0.5].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.2;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.18);
    });
  } catch {
    // Ignore audio context restrictions
  }
}

export function renderTimersDock() {
  const dock = document.getElementById("timers-dock");
  if (!dock) return;

  dock.innerHTML = state.activeTimers
    .map((t) => {
      const m = Math.floor(t.remainingSeconds / 60);
      const s = t.remainingSeconds % 60;
      const timeStr = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      const isFinished = t.remainingSeconds === 0;
      return `
        <div class="timer-card ${isFinished ? "is-finished" : ""}">
          <div>
            <div class="timer-label">${escapeHtml(t.label)}</div>
            <div class="timer-clock">${timeStr}${isFinished ? " · Listo" : ""}</div>
          </div>
          <div class="timer-actions">
            ${
              !isFinished
                ? `<button type="button" data-action="toggle-pause-timer" data-timer-id="${escapeHtml(t.id)}" class="timer-btn" aria-label="${t.paused ? "Reanudar" : "Pausar"}">
                    ${t.paused ? ICONS.play : ICONS.pause}
                  </button>`
                : ""
            }
            <button type="button" data-action="remove-timer" data-timer-id="${escapeHtml(t.id)}" class="timer-btn" aria-label="Cerrar temporizador">
              ${ICONS.close}
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

export async function toggleKitchenMode(onChanged = null) {
  document.body.classList.toggle("kitchen-mode");
  const isActive = document.body.classList.contains("kitchen-mode");
  state.kitchenModeActive = isActive;
  if (isActive) {
    state.kitchenStepIndex = 0;
  }

  const btn = document.getElementById("btn-kitchen-mode");
  if (btn) {
    btn.classList.toggle("btn-kitchen-active", isActive);
    btn.classList.toggle("btn-ghost", !isActive);
  }
  try {
    if (isActive && "wakeLock" in navigator) {
      state.wakeLockSentinel = await navigator.wakeLock.request("screen");
      state.wakeLockActive = true;
      state.wakeLockSentinel.addEventListener("release", () => {
        state.wakeLockActive = false;
        if (typeof onChanged === "function") onChanged();
      });
    } else if (!isActive && state.wakeLockSentinel) {
      await state.wakeLockSentinel.release();
      state.wakeLockSentinel = null;
      state.wakeLockActive = false;
    } else {
      state.wakeLockActive = false;
    }
  } catch {
    state.wakeLockActive = false;
  }

  if (typeof onChanged === "function") {
    onChanged();
  }
}
