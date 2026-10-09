// 1. Liste des partitions disponibles dans le dossier 'scores/'
const SCORES = [
  { title: "Ma Composition", file: "scores/ma-composition.mxl" },
  { title: "Autre Morceau", file: "scores/autre-morceau.musicxml" }
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
  scoreSelect.innerHTML = "";
  SCORES.forEach((score) => {
    const opt = document.createElement("option");
    opt.value = score.file;
    opt.textContent = score.title;
    scoreSelect.appendChild(opt);
  });
}

// 3. Charger une partition
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
    if (statusDiv) statusDiv.textContent = "Erreur : impossible de charger la partition (" + filePath + ")";
  }
}

// Initialisation
populateSelect();
if (SCORES.length > 0) {
  loadScore(SCORES[0].file);
}

scoreSelect.addEventListener("change", (e) => {
  loadScore(e.target.value);
});

// 4. Synthétiseur Piano Web Audio natif (zéro fichier externe)
function playPianoNote(midiNote, duration = 0.8) {
  if (!audioCtx) return;

  // Calcul de la fréquence de la note (A4 = 440Hz = MIDI 69)
  const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  // Onde combinée pour imiter un son de piano doux
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

  // Enveloppe d'amplitude (Attaque rapide + Atténuation exponentielle)
  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + duration);
}

// 5. Gestion du bouton Jouer
btnPlay.addEventListener("click", async () => {
  if (isPlaying) return;

  if (!osmd.sheet) {
    alert("Aucune partition chargée.");
    return;
  }

  // Démarrer/Débloquer l'AudioContext au clic utilisateur
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  isPlaying = true;
  btnPlay.disabled = true;
  btnStop.disabled = false;
  btnPlay.innerText = "▶ Lecture...";

  // Afficher et placer le curseur
  osmd.cursor.show();
  if (osmd.cursor.iterator.EndReached) {
    osmd.cursor.reset();
    osmd.cursor.show();
  }

  playNextStep();
});

btnStop.addEventListener("click", stopPlayback);

// 6. Boucle de lecture
function playNextStep() {
  if (!isPlaying || osmd.cursor.iterator.EndReached) {
    stopPlayback();
    return;
  }

  // Récupérer les notes sous le curseur
  const gNotes = osmd.cursor.GNotesUnderCursor();

  if (gNotes && gNotes.length > 0) {
    for (let i = 0; i < gNotes.length; i++) {
      const gNote = gNotes[i];
      const note = gNote.sourceNote;

      if (note && !note.isRest && note.Pitch) {
        const pitch = note.Pitch;
        const noteOffsets = [0, 2, 4, 5, 7, 9, 11]; // C, D, E, F, G, A, B
        const baseNote = noteOffsets[pitch.fundamentalNote] || 0;
        const accidental = pitch.AccidentalHalfTones || 0;
        const octave = pitch.Octave + 1;
        const midiNote = (octave * 12) + baseNote + accidental;

        // Jouer le son avec le synthétiseur natif
        playPianoNote(midiNote, 1.2);
      }
    }
  }

  // Calcul du tempo
  const iterator = osmd.cursor.iterator;
  const bpm = osmd.sheet.SourceMeasures[iterator.CurrentMeasureIndex]?.TempoInBPM || 120;
  
  let durationInSeconds = 0.5;
  if (gNotes && gNotes[0] && gNotes[0].sourceNote && gNotes[0].sourceNote.Length) {
    const realValue = gNotes[0].sourceNote.Length.RealValue;
    if (realValue > 0) {
      durationInSeconds = (4 * 60 / bpm) * realValue;
    }
  }

  // Avancer le curseur
  osmd.cursor.next();

  // Programmer la note suivante
  currentTimeout = setTimeout(playNextStep, Math.max(durationInSeconds * 1000, 120));
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
  btnPlay.innerText = "▶ Jouer";
}
