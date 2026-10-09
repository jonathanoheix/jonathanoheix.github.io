// 1. Liste des partitions disponibles dans votre dossier 'scores/'
const SCORES = [
  { title: "Ma Composition", file: "scores/ma-composition.mxl" },
  { title: "Autre Morceau", file: "scores/autre-morceau.musicxml" }
];

// Initialisation OSMD
const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay("osmd-container", {
  autoResize: true,
  drawTitle: true,
  drawSubtitle: true,
  drawComposer: true
});

let audioCtx = null;
let piano = null;
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
    if (statusDiv) statusDiv.textContent = "Erreur : impossible de charger la partition (" + filePath + ")";
  }
}

// Initialisation au démarrage
populateSelect();
if (SCORES.length > 0) {
  loadScore(SCORES[0].file);
}

// Changement de partition par l'utilisateur
scoreSelect.addEventListener("change", (e) => {
  loadScore(e.target.value);
});

// 4. Gestion du bouton Jouer
btnPlay.addEventListener("click", async () => {
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

  // Chargement de l'instrument SoundFont avec URL explicite MP3
  if (!piano) {
    btnPlay.innerText = "Chargement du son...";
    try {
      piano = await Soundfont.instrument(audioCtx, 'acoustic_grand_piano', {
        soundfont: 'MusyngKite',
        nameToUrl: (name, sf) => {
          return `https://gleitz.github.io/midi-js-soundfonts/${sf}/${name}-mp3.js`;
        }
      });
    } catch (err) {
      console.error("Erreur de chargement du piano :", err);
      alert("Impossible de charger le son du piano.");
      btnPlay.innerText = "▶ Jouer";
      return;
    }
  }

  isPlaying = true;
  btnPlay.disabled = true;
  btnStop.disabled = false;
  btnPlay.innerText = "▶ Jouer";

  // Positionner et afficher le curseur
  osmd.cursor.show();
  if (osmd.cursor.iterator.EndReached) {
    osmd.cursor.reset();
    osmd.cursor.show();
  }

  playNextStep();
});

btnStop.addEventListener("click", stopPlayback);

// 5. Boucle de lecture et synchronisation
function playNextStep() {
  if (!isPlaying || osmd.cursor.iterator.EndReached) {
    stopPlayback();
    return;
  }

  // Récupérer les notes graphiques situées directement sous le curseur
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

        if (piano) {
          piano.play(midiNote);
        }
      }
    }
  }

  // Calcul du tempo et du délai avant la note suivante
  const iterator = osmd.cursor.iterator;
  const bpm = osmd.sheet.SourceMeasures[iterator.CurrentMeasureIndex]?.TempoInBPM || 120;
  
  let durationInSeconds = 0.5;
  if (gNotes && gNotes[0] && gNotes[0].sourceNote && gNotes[0].sourceNote.Length) {
    const realValue = gNotes[0].sourceNote.Length.RealValue;
    if (realValue > 0) {
      durationInSeconds = (4 * 60 / bpm) * realValue;
    }
  }

  // Avancer le curseur visuel
  osmd.cursor.next();

  // Programment du pas suivant
  currentTimeout = setTimeout(playNextStep, Math.max(durationInSeconds * 1000, 100));
}

// 6. Arrêt de la lecture
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
