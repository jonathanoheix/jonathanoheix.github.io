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

  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    btnPlay.innerText = "Chargement du son...";
    piano = await Soundfont.instrument(audioCtx, 'acoustic_grand_piano');
  }

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
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

function playNextStep() {
  if (!isPlaying || osmd.cursor.iterator.EndReached) {
    stopPlayback();
    return;
  }

  const iterator = osmd.cursor.iterator;
  const currentVoiceEntries = iterator.CurrentVoiceEntries;
  const bpm = osmd.sheet.SourceMeasures[iterator.CurrentMeasureIndex]?.TempoInBPM || 120;

  if (currentVoiceEntries) {
    for (const voiceEntry of currentVoiceEntries) {
      for (const note of voiceEntry.Notes) {
        if (!note.isRest && note.Pitch) {
          piano.play(note.Pitch.ToString());
        }
      }
    }
  }

  osmd.cursor.next();

  const durationInRealSeconds = (4 * 60 / bpm) * (iterator.CurrentVoiceEntries?.[0]?.Notes?.[0]?.Length?.RealValue || (1/4));
  currentTimeout = setTimeout(playNextStep, durationInRealSeconds * 1000);
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
