// 1. Liste des partitions
const SCORES = [
  { title: "Ma Composition", file: "scores/ma-composition.mxl" }
];

// Initialisation OSMD
const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay("osmd-container", {
  autoResize: true,
  drawTitle: true,
  drawSubtitle: true,
  drawComposer: true
});

let audioCtx = null;
let isPlaying = false;
let currentTimeout = null;

const scoreSelect = document.getElementById("score-select");
const btnPlay = document.getElementById("btn-play");
const btnStop = document.getElementById("btn-stop");
const statusDiv = document.getElementById("status");

// 2. Remplir le select
function populateSelect() {
  if (!scoreSelect) return;
  scoreSelect.innerHTML = "";
  SCORES.forEach((score) => {
    const opt = document.createElement("option");
    opt.value = score.file;
    opt.textContent = score.title;
    scoreSelect.appendChild(opt);
  });
}

// 3. Charger la partition
async function loadScore(filePath) {
  stopPlayback();
  if (statusDiv) statusDiv.textContent = "Chargement de la partition...";
  try {
    await osmd.load(filePath);
    osmd.render();
    osmd.cursor.hide();
    if (statusDiv) statusDiv.textContent = "";
  } catch (err) {
    console.error("Erreur de chargement :", err);
    if (statusDiv) statusDiv.textContent = "Erreur de chargement : " + filePath;
  }
}

// Initialisation
populateSelect();
if (SCORES.length > 0) {
  loadScore(SCORES[0].file);
}

if (scoreSelect) {
  scoreSelect.addEventListener("change", (e) => {
    loadScore(e.target.value);
  });
}

// 4. Synthétiseur Piano Web Audio (Natif)
function playNote(midiNote, duration = 0.8) {
  if (!audioCtx || !midiNote) return;

  const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + duration);
}

// Convertir un Pitch OSMD en note MIDI
function getMidiFromPitch(pitch) {
  if (!pitch) return null;
  const noteOffsets = [0, 2, 4, 5, 7, 9, 11]; // C, D, E, F, G, A, B
  const base = noteOffsets[pitch.fundamentalNote] || 0;
  const accidental = pitch.AccidentalHalfTones || 0;
  const octave = pitch.Octave + 1;
  return (octave * 12) + base + accidental;
}

// 5. Lecture
btnPlay.addEventListener("click", async () => {
  if (isPlaying) return;

  if (!osmd.sheet) {
    alert("Aucune partition chargée.");
    return;
  }

  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  isPlaying = true;
  btnPlay.disabled = true;
  btnStop.disabled = false;

  osmd.cursor.show();
  if (osmd.cursor.iterator.EndReached) {
    osmd.cursor.reset();
    osmd.cursor.show();
  }

  playNextStep();
});

btnStop.addEventListener("click", stopPlayback);

function playNextStep() {
  if (!isPlaying || osmd.cursor.iterator.EndReached) {
    stopPlayback();
    return;
  }
  console.log("Notes détectées :", osmd.cursor.GNotesUnderCursor());

  const iterator = osmd.cursor.iterator;
  let notesToPlay = [];

  // Stratégie 1 : Récupérer via les éléments sous le curseur
  const gNotes = osmd.cursor.GNotesUnderCursor();
  if (gNotes && gNotes.length > 0) {
    for (const gn of gNotes) {
      if (gn.sourceNote && !gn.sourceNote.isRest && gn.sourceNote.Pitch) {
        notesToPlay.push(gn.sourceNote);
      }
    }
  }

  // Stratégie 2 (secours) : Récupérer via les VoiceEntries
  if (notesToPlay.length === 0 && iterator.CurrentVoiceEntries) {
    for (const ve of iterator.CurrentVoiceEntries) {
      if (ve.Notes) {
        for (const n of ve.Notes) {
          if (!n.isRest && n.Pitch) notesToPlay.push(n);
        }
      }
    }
  }

  // Jouer les notes identifiées
  for (const note of notesToPlay) {
    const midi = getMidiFromPitch(note.Pitch);
    if (midi) playNote(midi, 1.0);
  }

  // Calcul du tempo
  const bpm = osmd.sheet.SourceMeasures[iterator.CurrentMeasureIndex]?.TempoInBPM || 120;
  let durationInSeconds = 0.5;

  if (notesToPlay.length > 0 && notesToPlay[0].Length) {
    const realVal = notesToPlay[0].Length.RealValue;
    if (realVal > 0) {
      durationInSeconds = (4 * 60 / bpm) * realVal;
    }
  }

  // Avancer
  osmd.cursor.next();

  currentTimeout = setTimeout(playNextStep, Math.max(durationInSeconds * 1000, 150));
}

function stopPlayback() {
  isPlaying = false;
  if (currentTimeout) clearTimeout(currentTimeout);

  if (osmd && osmd.cursor) {
    osmd.cursor.reset();
    osmd.cursor.hide();
  }

  btnPlay.disabled = false;
  btnStop.disabled = true;
}
