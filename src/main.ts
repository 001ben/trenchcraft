import "./style.css";
import { Simulation, parseSave, CAPACITY, tooth } from "./simulation";
import { Input } from "./controls";
import { View } from "./view";
const KEY = "trenchcraft-save-v1";
let stored: string | null = null;
try {
  stored = localStorage.getItem(KEY);
} catch {}
let sim = new Simulation(parseSave(stored)),
  running = false,
  travelling = false;
// Every visit starts with the standard lesson controls; saved earthwork is retained.
sim.pattern = "ISO";
let resumeOnFocus = false;
const app = document.querySelector<HTMLElement>("#app")!;
const stick = (id: string, title: string, keys: string) =>
  `<section class="hand"><div class="hand-title"><span class="hand-name">${title}</span><small>${keys}</small></div><div id="${id}" class="joystick" aria-label="${title} virtual joystick"><span class="north"></span><span class="west"></span><span class="east"></span><span class="south"></span><i class="cross horizontal"></i><i class="cross vertical"></i><b class="knob"></b></div></section>`;
const track = (id: string, label: string, keys: string) =>
  `<div class="track-column"><div id="${id}" class="track-control" role="slider" tabindex="0" aria-label="${label.toLowerCase()} track: up forward, down reverse" aria-orientation="vertical" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0" aria-valuetext="Stopped"><span class="track-forward">↑</span><b class="track-knob"></b><span class="track-reverse">↓</span></div><span class="track-name">${label} TRACK</span><kbd>${keys}</kbd></div>`;
app.innerHTML = `<canvas id="world" aria-label="Excavator practice plot"></canvas><header><div class="brand"><span class="brand-icon">▰</span><div>TRENCHCRAFT<small>A LITTLE EARTHWORK</small></div></div><nav><button id="camera">Cab view</button><button id="guide" aria-label="Open guide and pause">?</button></nav></header>
<section class="job"><div><span class="eyebrow">01 / WILLOW LANE</span><strong>The service trench</strong></div><span id="progress">0%</span><div class="meter"><i id="progress-fill"></i></div><small id="job-details">6 m long · 60 cm deep · follow the chalk</small></section>
<div class="hint" id="hint"></div><div class="bucket-status"><span id="load">BUCKET EMPTY</span><i><b id="load-fill"></b></i><small id="depth">Ready to dig</small></div>
<footer>${stick("left-stick", "LEFT HAND", "W A S D")}<section class="travel-console" aria-label="Track travel levers"><div class="travel-title">TRAVEL</div><div class="travel-levers">${track("left-track", "LEFT", "Q / Z")}${track("right-track", "RIGHT", "E / C")}</div></section>${stick("right-stick", "RIGHT HAND", "ARROWS")}</footer>
<dialog id="panel"><div class="sheet"><span class="eyebrow">A QUIET PLOT. A GOOD FIRST DIG.</span><h1>A little practice.<br>A straighter trench.</h1><p>Learn the rhythm of a mini excavator: reach, curl, lift, swing and empty. Two thumbs. Four movements on each stick.</p><ol id="lesson"><li><b>Reach & lower.</b> Push the left stick to reach out; push the right stick to lower the boom.</li><li><b>Take a bite.</b> With the teeth in the soil, pull the left stick back and move the right stick left to curl.</li><li><b>Lift & place.</b> Pull the right stick back to lift. Swing right with the left stick. Move the right stick right to empty over the amber strip.</li></ol><div class="quality"><span id="pattern-tag">ISO CONTROLS</span><strong id="stars">◇ ◇ ◇</strong><small id="quality">Follow the line. Take your time.</small></div><div class="settings"><label>Control pattern <select id="pattern"><option value="ISO">ISO · boom on right</option><option value="Alternate">Alternate · boom on left</option></select></label><button id="overview">Plot overview</button><button id="sound">Sound off</button></div><p class="note">The two round joysticks always control the arm. The two travel levers between them move the left and right tracks: push both up for forward, down for reverse, or opposite ways to turn. On keyboard, Q/Z controls the left track and E/C the right. Gamepad bumpers drive forward and triggers reverse. This is a simplified controls practice game; match the pattern to your actual machine.</p><p id="save-note" class="note"></p><button class="primary" id="start">${stored ? "Continue practice" : "Start digging"} <span>→</span></button><button class="quiet" id="reset">Start a fresh plot</button><div id="reset-confirm" hidden><p>Clear this practice plot and its saved progress?</p><button id="reset-yes">Yes, fresh plot</button><button id="reset-no">Keep my plot</button></div></div></dialog><div id="loading">Building your little excavator…</div>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const input = new Input(
    $("left-stick"),
    $("right-stick"),
    $("left-track"),
    $("right-track"),
  ),
  view = new View($<HTMLCanvasElement>("world"), sim),
  panel = $<HTMLDialogElement>("panel");
view.cab = true;
$("camera").textContent = "Chase view";
let audio: AudioContext | null = null,
  osc: OscillatorNode | null = null,
  gain: GainNode | null = null,
  scrape: GainNode | null = null,
  sound = false,
  lastSave = 0,
  lastHud = 0,
  last = performance.now(),
  completed = false;
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(sim.snapshot()));
    $("save-note").textContent = "Progress saved on this browser.";
  } catch {
    $("save-note").textContent =
      "Saving is unavailable in this browser. Keep this tab open to keep your plot.";
  }
}
function labels() {
  const sides =
    sim.pattern === "ISO"
      ? [
          ["Arm out", "Swing left", "Swing right", "Arm in"],
          ["Boom down", "Curl", "Empty", "Boom up"],
        ]
      : [
          ["Boom down", "Swing left", "Swing right", "Boom up"],
          ["Arm out", "Curl", "Empty", "Arm in"],
        ];
  for (const [i, id] of ["left-stick", "right-stick"].entries())
    for (const [j, dir] of ["north", "west", "east", "south"].entries())
      $(id).querySelector("." + dir)!.textContent = sides[i][j];
  const boom = sim.pattern === "ISO" ? "right" : "left",
    arm = sim.pattern === "ISO" ? "left" : "right";
  $("lesson").innerHTML =
    `<li><b>Reach & lower.</b> Push the ${arm} stick to reach out; push the ${boom} stick to lower the boom.</li><li><b>Take a bite.</b> With the teeth in the soil, pull the ${arm} stick back and move the right stick left to curl.</li><li><b>Lift & place.</b> Pull the ${boom} stick back to lift. Swing right with the left stick. Move the right stick right to empty over the amber strip.</li>`;
  $("pattern-tag").textContent = sim.pattern.toUpperCase() + " CONTROLS";
}
function pause() {
  running = false;
  resumeOnFocus = false;
  input.clear();
  save();
  $<HTMLSelectElement>("pattern").value = sim.pattern;
  $("reset-confirm").hidden = true;
  if (!panel.open) panel.showModal();
}
$("guide").onclick = pause;
$("start").onclick = () => {
  panel.close();
  running = true;
  resumeOnFocus = false;
  input.clear();
  if (!audio) {
    audio = new AudioContext();
    osc = audio.createOscillator();
    gain = audio.createGain();
    osc.type = "triangle";
    osc.frequency.value = 46;
    gain.gain.value = 0;
    osc.connect(gain).connect(audio.destination);
    osc.start();
    const noise = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++)
      samples[i] = (Math.random() * 2 - 1) * 0.5;
    const source = audio.createBufferSource(),
      filter = audio.createBiquadFilter();
    source.buffer = noise;
    source.loop = true;
    filter.type = "bandpass";
    filter.frequency.value = 520;
    filter.Q.value = 0.65;
    scrape = audio.createGain();
    scrape.gain.value = 0;
    source.connect(filter).connect(scrape).connect(audio.destination);
    source.start();
  }
  audio.resume();
};
$("sound").onclick = () => {
  sound = !sound;
  $("sound").textContent = sound ? "Sound on" : "Sound off";
};
$("camera").onclick = () => {
  view.overview = false;
  view.cab = !view.cab;
  $("camera").textContent = view.cab ? "Chase view" : "Cab view";
};
$("overview").onclick = () => {
  view.overview = !view.overview;
  $("overview").textContent = view.overview
    ? "Follow excavator"
    : "Plot overview";
};
$("pattern").onchange = () => {
  sim.pattern = $<HTMLSelectElement>("pattern").value as "ISO" | "Alternate";
  input.clear();
  labels();
  save();
};
$("reset").onclick = () => {
  $("reset-confirm").hidden = false;
};
$("reset-no").onclick = () => {
  $("reset-confirm").hidden = true;
};
$("reset-yes").onclick = () => {
  sim = new Simulation();
  view.sim = sim;
  for (let i = 0; i < sim.ground.length; i++) sim.changed.add(i);
  completed = false;
  travelling = false;
  view.cab = true;
  view.overview = false;
  $("camera").textContent = "Chase view";
  $("overview").textContent = "Plot overview";
  labels();
  save();
  pause();
};
panel.addEventListener("cancel", (e) => {
  e.preventDefault();
  $("start").click();
});
function suspend() {
  if (!running) return;
  running = false;
  resumeOnFocus = true;
  input.clear();
  save();
}
function resume() {
  if (!resumeOnFocus || document.hidden || panel.open) return;
  resumeOnFocus = false;
  running = true;
  last = performance.now();
  input.clear();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) suspend();
  else resume();
});
window.addEventListener("blur", suspend);
window.addEventListener("focus", resume);
window.addEventListener("pagehide", save);
window.addEventListener("keydown", (e) => {
  if (e.code === "Escape" && !panel.open) pause();
});
function hud() {
  const s = sim.score(),
    tip = tooth(sim.machine),
    load = Math.min(100, Math.round((sim.machine.load / CAPACITY) * 100));
  $("progress").textContent = Math.round(s.progress * 100) + "%";
  $("progress-fill").style.width = s.progress * 100 + "%";
  $("load").textContent = load ? `BUCKET ${load}%` : "BUCKET EMPTY";
  $("load-fill").style.width = load + "%";
  $("depth").textContent =
    tip.y < 0
      ? Math.round(-tip.y * 100) + " cm below grade"
      : Math.round(tip.y * 100) + " cm above grade";
  $("stars").textContent = Array.from({ length: 3 }, (_, i) =>
    i < s.stars ? "★" : "◇",
  ).join(" ");
  $("quality").textContent =
    `${Math.round(s.straightness * 100)}% on line · ${Math.round(s.tidiness * 100)}% tidy spoil`;
  $("job-details").textContent =
    s.progress > 0
      ? `60 cm target · ${Math.round(s.straightness * 100)}% on line · ${Math.round(s.tidiness * 100)}% tidy`
      : "6 m long · 60 cm deep · follow the chalk";
  $("hint").textContent = travelling
    ? "Travel levers: both ↑ to drive, both ↓ to reverse, opposite directions to turn. Release to stop."
    : sim.lastAction;
  if (s.stars === 3 && !completed) {
    completed = true;
    sim.lastAction =
      "Three stars. A straight trench and a tidy plot. Keep practising, or start fresh from the guide.";
    save();
  }
}
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const c = input.read();
  travelling = Math.abs(c.leftTrack) + Math.abs(c.rightTrack) > 0.05;
  if (running) sim.update(c, dt);
  if (gain && audio && osc) {
    const effort =
      Math.abs(c.lx) +
      Math.abs(c.ly) +
      Math.abs(c.rx) +
      Math.abs(c.ry) +
      Math.abs(c.leftTrack) +
      Math.abs(c.rightTrack);
    gain.gain.setTargetAtTime(
      sound && running ? 0.012 + effort * 0.008 : 0,
      audio.currentTime,
      0.12,
    );
    osc.frequency.setTargetAtTime(
      46 + effort * 12 - sim.resistance * 6,
      audio.currentTime,
      0.1,
    );
  }
  if (scrape && audio)
    scrape.gain.setTargetAtTime(
      sound && running ? Math.min(0.045, sim.cutRate * 0.9) : 0,
      audio.currentTime,
      0.045,
    );
  view.render(running ? dt : 0, now / 1000);
  if (now - lastHud > 120) {
    hud();
    lastHud = now;
  }
  if (running && now - lastSave > 5000) {
    save();
    lastSave = now;
  }
  requestAnimationFrame(frame);
}
labels();
view
  .load()
  .then(() => {
    $("loading").hidden = true;
    running = !document.hidden && document.hasFocus();
    resumeOnFocus = !running;
    last = performance.now();
    hud();
    requestAnimationFrame(frame);
  })
  .catch((e) => {
    $("loading").textContent =
      "Could not load the excavator. Refresh to retry.";
    console.error(e);
  });
