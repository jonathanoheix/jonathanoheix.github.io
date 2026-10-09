// 1. Liste des partitions disponibles dans votre dossier 'scores/'
const SCORES = [
  { title: "Etude n°1", file: "scores/etude1.mxl" }
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

// 2. Remplir le menu déroulant avec les partitions
function populateSelect() {
  scoreSelect.innerHTML = "";
  SCORES.forEach((score, index) => {
    const opt = document.createElement("option");
    opt.value = score.file;
    opt.textContent = score.title;
    scoreSelect.appendChild(opt);
  });
}

// 3. Charger une partition dans OSMD
async function loadScore(filePath) {
  stopPlayback();
  statusDiv.textContent = "Chargement de la partition...";
  try {
    await osmd.load(filePath);
    osmd.render();
    osmd.cursor.hide();
    statusDiv.textContent = "";
  } catch (err) {
    console.error("Erreur de chargement :", err);
    statusDiv.textContent = "Erreur : impossible de charger la partition (" + filePath + ")";
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

// 4. Gestion de la lecture audio
btnPlay.addEventListener("click", async () => {
  if (isPlaying) return;

  if (!osmd.sheet) {
    alert("Aucune partition chargée.");
    return;
  }

  // 1. Initialiser l'AudioContext
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  // 2. Charger l'instrument avec une URL SoundFont valide
  if (!piano) {
    btnPlay.innerText = "Chargement du son...";
    try {
      piano = await Soundfont.instrument(audioCtx, 'acoustic_grand_piano', {
	  soundfont: 'MusyngKite',
	  format: 'mp3',
	  nameToUrl: (name, sf, format = 'mp3') => {
	    return `https://gleitz.github.io/midi-js-soundfonts/${sf}/${name}-${format}.js`;
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

  if (osmd.cursor.iterator.EndReached) {
    osmd.cursor.reset();
  } else {
    osmd.cursor.show();
  }

  playNextStep();
});

btnStop.addEventListener("click", stopPlayback);

// Helper pour convertir une note OSMD en numéro MIDI (ex: C4 -> 60)
function getMidiNumber(pitch) {
  if (!pitch) return null;
  // pitch.fundamentalNote : 0 = C, 1 = D, 2 = E, 3 = F, 4 = G, 5 = A, 6 = B
  const noteOffsets = [0, 2, 4, 5, 7, 9, 11]; // Échelle chromatique (Do, Ré, Mi...)
  const baseNote = noteOffsets[pitch.fundamentalNote] || 0;
  const accidental = pitch.AccidentalHalfTones || 0; // Altérations (#, b)
  const octave = pitch.Octave + 1; // OSMD octave standard (-1 pour MIDI)
  
  return (octave * 12) + baseNote + accidental;
}

function playNextStep() {
  if (!isPlaying || osmd.cursor.iterator.EndReached) {
    stopPlayback();
    return;
  }

  const iterator = osmd.cursor.iterator;
  const voiceEntries = iterator.CurrentVoiceEntries;

  // 1. Jouer les notes de l'étape courante
  if (voiceEntries && voiceEntries.length > 0) {
    for (let i = 0; i < voiceEntries.length; i++) {
      const entry = voiceEntries[i];
      if (!entry || !entry.Notes) continue;

      for (let j = 0; j < entry.Notes.length; j++) {
        const note = entry.Notes[j];

        // Ignorer les silences et vérifier la présence d'un Pitch
        if (note && !note.isRest && note.Pitch) {
          const midiNote = getMidiNumber(note.Pitch);
          
          if (midiNote !== null && piano) {
            piano.play(midiNote);
          }
        }
      }
    }
  }

  // 2. Avancer le curseur visuel
  osmd.cursor.next();

  // 3. Calcul du tempo et du délai
  const bpm = osmd.sheet.SourceMeasures[iterator.CurrentMeasureIndex]?.TempoInBPM || 120;
  
  let durationInSeconds = 0.5; // Valeur par défaut (noire à 120 BPM)
  
  if (voiceEntries && voiceEntries[0] && voiceEntries[0].Notes && voiceEntries[0].Notes[0]) {
    const length = voiceEntries[0].Notes[0].Length;
    if (length && length.RealValue > 0) {
      // RealValue représente la fraction de mesure (ex: 0.25 pour une noire)
      durationInSeconds = (4 * 60 / bpm) * length.RealValue;
    }
  }

  // Sécurité si la durée calculée est trop courte ou nulle
  if (durationInSeconds <= 0) durationInSeconds = 0.25;

  currentTimeout = setTimeout(playNextStep, durationInSeconds * 1000);
}

function stopPlayback() {
  isPlaying = false;
  if (currentTimeout) clearTimeout(currentTimeout);

  // Sécuriser l'accès au curseur OSMD
  if (osmd && osmd.cursor) {
    osmd.cursor.reset();
    osmd.cursor.hide();
  }

  btnPlay.disabled = false;
  btnStop.disabled = true;
  btnPlay.innerText = "▶ Jouer";
}
