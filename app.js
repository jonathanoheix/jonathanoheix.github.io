// Initialisation d'OSMD
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

// Remplacez par le chemin vers votre fichier MusicXML hébergé sur le dépôt
const SCORE_URL = "scores/ma-composition.musicxml";

// 1. Chargement de la partition
osmd.load(SCORE_URL).then(() => {
  osmd.render();
  osmd.cursor.hide();
}).catch(err => console.error("Erreur de chargement du fichier MusicXML :", err));

// DOM Controls
const btnPlay = document.getElementById("btn-play");
const btnStop = document.getElementById("btn-stop");

btnPlay.addEventListener("click", async () => {
  if (isPlaying) return;

  // L'AudioContext doit être initialisé suite à un geste utilisateur
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    btnPlay.innerText = "Chargement du piano...";
    piano = await Soundfont.instrument(audioCtx, 'acoustic_grand_piano');
  }

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  isPlaying = true;
  btnPlay.disabled = true;
  btnStop.disabled = false;
  btnPlay.innerText = "▶ Jouer";

  // Réinitialiser le curseur s'il est à la fin
  if (osmd.cursor.iterator.EndReached) {
    osmd.cursor.reset();
  } else {
    osmd.cursor.show();
  }

  playNextStep();
});

btnStop.addEventListener("click", stopPlayback);

// 2. Moteur de lecture et de synchronisation
function playNextStep() {
  if (!isPlaying || osmd.cursor.iterator.EndReached) {
    stopPlayback();
    return;
  }

  const iterator = osmd.cursor.iterator;
  const currentVoiceEntries = iterator.CurrentVoiceEntries;

  // Extraire le tempo dynamique de la mesure (défaut: 120 BPM)
  const bpm = osmd.sheet.SourceMeasures[iterator.CurrentMeasureIndex]?.TempoInBPM || 120;

  // Récupérer les notes à jouer à cet instant précis
  if (currentVoiceEntries) {
    for (const voiceEntry of currentVoiceEntries) {
      for (const note of voiceEntry.Notes) {
        // Ignorer les silences et les notes liées
        if (!note.isRest && note.Pitch) {
          // Convertir le pitch OSMD en notation standard (ex: "C4")
          const noteName = note.Pitch.ToString();
          piano.play(noteName);
        }
      }
    }
  }

  // Avancer visuellement le curseur
  osmd.cursor.next();

  // Calculer la durée de la figure de note courante
  // (iterator.CurrentMeasureDuration() renvoie une fraction de mesure)
  const durationInRealSeconds = (4 * 60 / bpm) * iterator.CurrentVoiceEntries[0]?.Notes[0]?.Length.RealValue || (60 / bpm);

  // Planifier le pas suivant
  currentTimeout = setTimeout(playNextStep, durationInRealSeconds * 1000);
}

// 3. Arret de la lecture
function stopPlayback() {
  isPlaying = false;
  if (currentTimeout) clearTimeout(currentTimeout);
  
  if (osmd) {
    osmd.cursor.reset();
    osmd.cursor.hide();
  }

  btnPlay.disabled = false;
  btnStop.disabled = true;
  btnPlay.innerText = "▶ Jouer";
}
