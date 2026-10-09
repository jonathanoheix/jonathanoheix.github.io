// 1. Liste des partitions disponibles dans le dossier 'scores/'
const SCORES = [
  { title: "Ma Composition", file: "scores/ma-composition.mxl" }
];

// Initialisation d'OSMD
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

// 2. Remplir le menu déroulant
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

// 3. Charger une partition dans OSMD
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

// Initialisation au démarrage
populateSelect();
if (SCORES.length > 0) {
  loadScore(SCORES[0].file);
}

if (scoreSelect) {
  scoreSelect.addEventListener("change", (e) => {
    loadScore(e.target.value);
  });
}

// 4. Synthétiseur Piano Web Audio natif
function playNote(midiNote, duration = 0.8) {
  if (!audioCtx || !midiNote) return;

  // Calcul de la fréquence (A4 = 440Hz = MIDI 69)
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

// Conversion pitch OSMD -> code MIDI robuste
function getMidiFromPitch(pitch) {
  if (!pitch) return null;

  // Récupérer la note fondamentale (0 = C, 1 = D, 2 = E, 3 = F, 4 = G, 5 = A, 6 = B)
  const fund = pitch.fundamentalNote !== undefined ? pitch.fundamentalNote : pitch.FundamentalNote;
  if (fund === undefined) return null;

  const noteOffsets = [0, 2, 4, 5, 7, 9, 11];
  const base = noteOffsets[fund] || 0;

  // Récupérer l'altération (# / b)
  const accidental = pitch.accidentalHalfTones !== undefined ? pitch.accidentalHalfTones : (pitch.AccidentalHalfTones || 0);

  // Récupérer l'octave
  const oct = pitch.octave !== undefined ? pitch.octave : pitch.Octave;
  if (oct === undefined) return null;

  const octave = oct + 1; // Transposition OSMD -> MIDI

  return (octave * 12) + base + accidental;
}

// 5. Gestion de la lecture
btnPlay.addEventListener("click", async () => {
  console.log("--> Clic sur Jouer détecté !");

  if (isPlaying) return;

  if (!osmd.sheet) {
    alert("Aucune partition chargée.");
    return;
  }

  // Initialisation de l'AudioContext
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  isPlaying = true;
  btnPlay.disabled = true;
  btnStop.disabled = false;

  // Afficher et positionner le curseur
  osmd.cursor.show();
  if (osmd.cursor.iterator.EndReached) {
    osmd.cursor.reset();
    osmd.cursor.show();
  }

  playNextStep();
});

btnStop.addEventListener("click", stopPlayback);

// 6. Boucle de lecture et synchronisation
function playNextStep() {
  if (!isPlaying || osmd.cursor.iterator.EndReached) {
    stopPlayback();
    return;
  }

  const gNotes = osmd.cursor.GNotesUnderCursor();

  if (gNotes && gNotes.length > 0) {
    for (let i = 0; i < gNotes.length; i++) {
      const gNote = gNotes[i];
      const note = gNote.sourceNote;

      if (note && !note.isRest) {
        // OSMD stocke parfois 'pitch' ou 'Pitch'
        const pitch = note.pitch || note.Pitch;
        const midi = getMidiFromPitch(pitch);

        if (midi) {
          console.log("Note jouée -> MIDI:", midi);
          playNote(midi, 1.0);
        }
      }
    }
  }

  // Calcul du tempo et du délai
  const iterator = osmd.cursor.iterator;
  const bpm = osmd.sheet.SourceMeasures[iterator.CurrentMeasureIndex]?.TempoInBPM || 120;

  let durationInSeconds = 0.5;
  if (gNotes && gNotes[0] && gNotes[0].sourceNote && gNotes[0].sourceNote.Length) {
    const realVal = gNotes[0].sourceNote.Length.RealValue;
    if (realVal > 0) {
      durationInSeconds = (4 * 60 / bpm) * realVal;
    }
  }

  // Avancer le curseur
  osmd.cursor.next();

  currentTimeout = setTimeout(playNextStep, Math.max(durationInSeconds * 1000, 150));
}

// 7. Arrêt de la lecture
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
