<p align="center"><img src="docs/images/hero.jpg" alt="phosphene" width="100%"></p>

# phosphene

A psychedelic audio visualizer that runs in your browser. Twenty-three GPU shader worlds (fractals, a wormhole, liquid light, dripping goop, an all-seeing eye, oil-slick rainbows, a terrain built from your spectrogram, a heart monitor, a spinning record and more) that melt and pulse with whatever you are listening to: Spotify in a browser tab, YouTube, your microphone or a local file.

It listens like a musician: it finds the tempo and locks onto the beat, counts bars so scene changes land on the downbeat, tells kicks from snares from hats, notices drops after a build-up, works out the musical key and tints the palette to match. And it can name the song that is playing, Shazam-style, from the mic or a shared tab, then pull the album's colours into the picture.

<p align="center"><b>Open it: <a href="https://phosphene-viz.vercel.app">phosphene-viz.vercel.app</a></b><br>Desktop Chrome, Edge or Arc for tab audio. Phones work with the mic.</p>

No install, no account, no build step. The visuals and all the analysis run on your device. Song ID sends only a sound fingerprint (a few hundred spectral peaks, never audio), and you can turn it off.

<table>
  <tr>
    <td width="50%"><img src="docs/images/scene-goop.jpg" alt="14 Goop"></td>
    <td width="50%"><img src="docs/images/scene-oracle.jpg" alt="15 Oracle"></td>
  </tr>
  <tr>
    <td><img src="docs/images/scene-oil.jpg" alt="17 Oil Slick"></td>
    <td><img src="docs/images/scene-canyon.jpg" alt="19 Canyon"></td>
  </tr>
  <tr>
    <td><img src="docs/images/scene-fractal.jpg" alt="01 Fractal Bloom"></td>
    <td><img src="docs/images/scene-wormhole.jpg" alt="02 Wormhole"></td>
  </tr>
  <tr>
    <td><img src="docs/images/scene-liquid.jpg" alt="03 Liquid Dream"></td>
    <td><img src="docs/images/scene-mandala.jpg" alt="04 Spectral Mandala"></td>
  </tr>
  <tr>
    <td><img src="docs/images/scene-gyroid.jpg" alt="05 Gyroid Flight"></td>
    <td><img src="docs/images/scene-julia.jpg" alt="06 Julia Bloom"></td>
  </tr>
  <tr>
    <td><img src="docs/images/scene-hyperspace.jpg" alt="07 Hyperspace"></td>
    <td><img src="docs/images/scene-moire.jpg" alt="08 Moire"></td>
  </tr>
  <tr>
    <td><img src="docs/images/scene-horizon.jpg" alt="09 Neon Horizon"></td>
    <td><img src="docs/images/scene-pulsar.jpg" alt="10 Pulsar"></td>
  </tr>
  <tr>
    <td><img src="docs/images/scene-vitals.jpg" alt="11 Vitals"></td>
    <td><img src="docs/images/scene-vinyl.jpg" alt="12 Vinyl"></td>
  </tr>
  <tr>
    <td><img src="docs/images/scene-aurora.jpg" alt="13 Aurora"></td>
    <td><img src="docs/images/scene-sigil.jpg" alt="16 Sigil"></td>
  </tr>
  <tr>
    <td><img src="docs/images/scene-chladni.jpg" alt="18 Chladni"></td>
    <td><img src="docs/images/scene-sonar.jpg" alt="20 Sonar"></td>
  </tr>
  <tr>
    <td><img src="docs/images/scene-scope.jpg" alt="21 Scope"></td>
    <td><img src="docs/images/scene-swarm.jpg" alt="22 Swarm"></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/images/scene-crystal.jpg" alt="23 Crystal"></td>
  </tr>
</table>

## The scenes

| | Scene | What it is | What the music drives |
|---|---|---|---|
| 01 | Fractal Bloom | Kaleidoscopic iterated function system, folded into N-way symmetry | Ring radius per frequency band, zoom on the kick, white lines flash on the snare, the fold breathes with the bar |
| 02 | Wormhole | Polar tunnel with noise-warped tiles | Flight speed on the bass, a glowing ring rides down the tunnel every beat, hats sparkle the tiles |
| 03 | Liquid Dream | Three layers of domain-warped fractal noise | Flow speed on the energy, kicks send ripples out from the centre, snares put an oily sheen on the crests |
| 04 | Spectral Mandala | Fourteen rings, one per frequency band, alternating direction at the tempo | Each ring's wobble is its band's energy; snares light the petals, kicks open the centre |
| 05 | Gyroid Flight | Raymarched gyroid lattice with a carved flight path | Wall thickness on the kick, camera roll on the bar, drops flip the palette |
| 06 | Julia Bloom | Julia set whose parameter traces the edge of the Mandelbrot cardioid | The mids push the shape, kicks punch the zoom, contour bands run outward on snares |
| 07 | Hyperspace | Three layers of star streaks in polar space | Streak length on the kick, a shock ring on every beat, drops jump to warp |
| 08 | Moiré | Two drifting ring fields multiplied into op-art interference | Ring density on the mids and the bar, snares invert the print |
| 09 | Neon Horizon | Perspective grid flyover, striped sun, stars, three ridges of mountains | One grid line scrolls past per beat; the mountains are the last seconds of the spectrogram; the sun pulses on the kick, the stars twinkle on hats |
| 10 | Pulsar | 40 ridgelines with hidden-line removal, after the plot of pulsar CP 1919 made famous by *Unknown Pleasures* | Every kick is drawn as a heartbeat; each line is 0.15 s further in the past, so the rhythm cascades back |
| 11 | Vitals | A bedside monitor: green ECG sweep, a cyan pleth trace of the bass, grid, erase gap and a live BPM readout | Each kick fires a PQRST complex; the BPM is the tracked tempo |
| 12 | Vinyl | A record spinning at 33 1/3 with a tonearm that slowly tracks inward | Grooves light up by frequency, kicks nudge the platter. The label is the album cover once the song is named, and the tonearm lifts whenever phosphene is unsure what is playing |
| 13 | Aurora | Eighteen curtains of light with streaks, stars and a dark rippled lake | Curtain height on the mids, brightness per band, hats twinkle the stars, kicks flare the streaks |
| 14 | Goop | Eight gooey blobs that drip down the screen and merge | Blob size per band, kicks swell them, snares flash the rims. Turn Goo up. |
| 15 | Oracle | An all-seeing eye, ringed by a kaleidoscope of smaller eyes | The iris is the spectrum, the pupil dilates with the energy and the kick, drops blink; the cover shows in the iris while the song is known |
| 16 | Sigil | Rune rings turning at different speeds around nested polygons | Ring radius per band, polygons flash on kicks and snares, the centre pulses on the beat |
| 17 | Oil Slick | Thin-film interference rainbows on black oil | Film thickness on the mids, kicks ripple it, snares shimmer it, highs catch the light |
| 18 | Chladni | Sand gathering at the nodes of a vibrating plate | The mode numbers come from the dominant pitch and the mids, so chords reshape the pattern; grains jump on kicks |
| 19 | Canyon | Raymarched flight over a terrain whose height is the spectrogram | The ground is the last eight seconds of sound; wires glow on kicks, the sun blinks on the beat |
| 20 | Sonar | A radar sweep over a polar spectrogram | Radius is frequency, angle is time; the sweep keeps pace with the spectrogram so blips stay put |
| 21 | Scope | An oscilloscope: the waveform wrapped around a ring, and a phosphor Lissajous of the waveform against a delayed copy of itself | The actual waveform, so pure tones draw circles and chords draw knots |
| 22 | Swarm | Sixty thousand particles on a Clifford strange attractor, drawn as additive points into the feedback buffer | The attractor's parameters breathe with the mids and bass; kicks fatten the particles |
| 23 | Crystal | Voronoi cells, each lit by its own frequency band | Cells pulse on their band, seams glow on snares, cores flash on kicks |

Every scene draws into a feedback buffer. Each frame the previous image is melted along a slowly turning curl-noise flow, dripped, zoomed, swirled and hue-shifted a little before the new one is laid on top. That is where the trails and the oozing come from; the **Goo** setting is how much. Kicks punch the zoom and split the colour channels, drops crank everything.

## Song ID

With the microphone or a shared tab, phosphene names what is playing. After four seconds of music it fingerprints the audio and asks; if there is no match it tries again with eight and then twelve seconds, then backs off. When a song is named:

- a now-playing card slides in at the top right with the cover, title, artist, tempo and key, for a few seconds every thirty seconds (while it is still working out the song it reads "Searching…"); the dock only ever shows the source
- the palette eases toward the cover's two most vivid colours
- the Vinyl label and the Oracle's iris show the artwork

It does not poll, and it is honest about what it knows. The card has states:

- **Searching…** while it listens (it says how many seconds it still needs) and while a fingerprint is on its way
- **the song**, with cover, artist, tempo and key, when named
- **the song, dimmed, "might have changed · checking"** when clues say the song may have changed and a check is owed
- **Unknown song** when a check comes back empty; it keeps listening and retries with a back-off

The match says how far into the song the excerpt was, and a free lookup says how long the song is, so phosphene knows roughly when it ends and checks again just after that. Before then only clues trigger a check, each with a weight: a skip gap (the audio drops to the noise floor for a fraction of a second, then music again: the signature of pressing Next, and the strongest clue), a long silence, the tempo tracker switching to a new tempo, a sustained shift in timbre (the last five seconds of the spectrum against the fifteen before them), or a new key. Enough weight within twelve seconds owes a check; after a skip it waits for five seconds of the new song and sends only those. If the check comes back as the same song, the bar is raised for a minute and a half. Quiet is judged relative to the running music level, not an absolute number, so a faint microphone works the same as a loud tab.

Why not media keys: the browser cannot see Next or Previous. The system routes them to whichever app is playing, which is Spotify, not phosphene; if phosphene claimed them it would steal your skip. The gap a skip leaves in the audio is the next best thing.

Scenes that show the cover (Vinyl, Oracle) share one confidence value: the art is full while the song is known, greys out while a change is suspected, and clears when it is not. On Vinyl the tonearm lifts off the record whenever phosphene is not sure what is playing.

Press `I` to identify right now. The switch in Settings turns it off entirely (remembered).

How it works: the fingerprint is the same compact format the Shazam app sends, generated in a Web Worker from the last few seconds of audio (16 kHz mono, sliding 2048-point spectra, peaks picked against their neighbours in time and frequency, packed into about four kilobytes). A tiny serverless function on Vercel forwards it to the recognition service and returns the title, artist, artwork and genre. The implementation in `src/shazam.js` was written from the public description of the format and checks byte-for-byte against the SongRec reference; it is also about forty times faster than the JavaScript ports it was checked against. The service is free but unofficial, so it may stop working one day without notice.

## The ears

`src/features.js` turns a 4096-point spectrum, sixty times a second, into musical facts. None of it leaves the device.

- **Onsets.** Spectral flux (positive change in log magnitude) in three bands, each against an adaptive threshold (running mean plus two standard deviations). Kick, snare and hat envelopes drive the scenes separately.
- **Tempo.** The full-band onset envelope is resampled to 50 Hz and kept for ten seconds. Every half second its autocorrelation is scored over 60 to 200 BPM with harmonic support (lag, double lag, triple lag) and a soft prior around 122 BPM, refined with a parabola. A new tempo has to win three runs in a row before the visualizer switches, and octave errors are resolved toward the current tempo.
- **Beat phase.** Every quarter second the last eight beats of the envelope are scored against every phase offset within one period; the beat anchor eases toward the winner. From that: a phase ramp (0 at the beat), a pulse on every predicted beat, and a continuous beat count that scenes use to scroll grids and ride rings exactly one step per beat.
- **Bars.** The beat index (mod 4) where kicks land hardest is the downbeat. Auto-cycle waits for a downbeat after eight bars, so scene changes feel like edits.
- **Drops.** Energy over the last eight seconds is tracked; a sudden lift of 1.9x on a kick after a build triggers a drop: colour shift, a new scene, extra bloom and chromatic smear.
- **Key.** A chroma vector (pitch class energy, weighted toward bins near note centres) is averaged over a few seconds and correlated against Krumhansl-Schmuckler major and minor profiles. The winning key is mapped around the colour wheel by the circle of fifths, and with **Key colors** on, the palette drifts toward it.
- **Pitch.** The strongest bin, used by Chladni for its mode numbers.

## Using it

<table>
  <tr>
    <td width="50%"><img src="docs/images/welcome.jpg" alt="Choose an audio source"></td>
    <td width="50%"><img src="docs/images/settings.jpg" alt="Settings"></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/images/dock.jpg" alt="The player dock"></td>
  </tr>
</table>

Pick a source on the first screen:

- **Browser tab** (best). Play music in another tab (Spotify Web Player at open.spotify.com, YouTube, SoundCloud, Bandcamp), click Browser tab, choose that tab and turn on "Share tab audio". The visualizer gets the clean digital signal. Chrome, Edge and Arc on desktop. Safari cannot share tab audio.
- **Microphone**. Hears anything playing out loud, including the Spotify and Apple Music desktop apps. Works on phones.
- **Audio file**. Pick or drag in an MP3, WAV, FLAC or M4A. It plays through your speakers with a scrub bar.
- **Just watch**. A built-in silent beat, no permissions needed.

Settings: sensitivity, trails, **goo** (how much everything melts), symmetry, quality, auto-cycle, Song ID, key colors.

Keyboard: `1` to `9`, `0`, `-` and `=` jump to scenes 1 to 12, hold `Shift` for 13 to 23. `←` `→` or `Space` change scene, `A` toggles auto-cycle, `C` shifts the palette, `G` steps goo (off, medium, max), `I` names the song, `[` `]` change the symmetry, `↑` `↓` change sensitivity, `F` fullscreen, `H` hides everything, `?` lists all of this.

Touch: swipe sideways to change scenes, tap to show or hide the controls, double-tap for fullscreen where the browser allows it.

<p align="center">
  <img src="docs/images/phone-welcome.jpg" alt="Phone, source picker" width="32%">
  &nbsp;
  <img src="docs/images/phone-mandala.jpg" alt="Phone, Spectral Mandala" width="32%">
</p>

### URL options

Handy for streaming (OBS browser source), projectors and sharing a look:

| Parameter | Effect |
|---|---|
| `?scene=14` | Start on a scene (1 to 23) and skip the source picker |
| `?ui=0` | Clean output: no dock, no toasts, demo beat. Good for OBS |
| `?auto=0` | Stay on one scene |
| `?colors=0.45` | Fix the starting palette (0 to 1). Otherwise it is random each visit |
| `?goo=0.8` | Set the melt amount (0 to 1) |
| `?np=1` | Keep the now-playing card in clean mode (for a stream overlay) |
| `?debug` | Log Song ID's states and clues to the console, expose `window.phosphene` |
| `?demo` | Skip the source picker and start on the demo beat |

Example: `https://phosphene-viz.vercel.app/?scene=19&ui=0&auto=0&goo=0.7`

## How it works

<p align="center"><img src="docs/images/pipeline.svg" alt="Audio in, analyser, features, scene shader with feedback buffer, display pass" width="100%"></p>

- **Audio in.** Tab audio comes from `getDisplayMedia` (the video track is dropped right away), the mic from `getUserMedia` with echo cancellation, noise suppression and auto gain turned off so the music is not mangled. Files go through a `MediaElementSource`. Live sources are never connected to the speakers, so there is no feedback loop. An `AudioWorklet` tap keeps the last fifteen seconds of raw audio for Song ID.
- **Analysers.** Two Web Audio `AnalyserNode`s: a smoothed 1024-point FFT for the shaders (512 bins, uploaded as a 512x1 texture) and a 4096-point FFT for the feature extractor. The waveform goes up as a 1024x1 texture, and one spectrum row every 1/30 s goes into a 512x256 ring texture: 8.5 seconds of spectrogram that Canyon, Sonar, Neon Horizon and Vitals read.
- **Scene programs.** Each scene is its own GLSL ES 3.00 program (shared prelude plus one function plus the feedback pass), compiled on first use and pre-warmed for the next scene, so adding a scene never slows the others down. Feedback lives in two ping-ponged half-float render targets. Swarm adds a 60,000-vertex `gl.POINTS` pass with additive blending, positions computed from the vertex id alone.
- **Heartbeat trace.** Pulsar and Vitals share a 256x64 half-float ring buffer (about 77 seconds at 213 samples per second). Every detected beat writes a PQRST complex.
- **Display pass.** A lens that breathes with the bar, chromatic aberration that grows with the kick, eight-tap bloom, thin-film iridescence, exponential tone mapping, a saturation and contrast curve, grain and a vignette.
- **Adaptive quality.** In Auto mode the renderer watches the frame time and steps the internal resolution down or back up, so phones stay smooth and do not cook.
- **Song ID.** `src/songid.js` schedules attempts, `src/songid-worker.js` fingerprints off the main thread with `src/shazam.js`, `api/recognize.js` relays to the recognition service, `api/art.js` relays artwork with CORS headers so its pixels can be read for the palette and uploaded as a texture.

No frameworks and no build. The whole app is `index.html` plus the ES modules in `src/`, and two small serverless functions in `api/`.

## Run it locally

```sh
git clone https://github.com/maxsorto/phosphene.git
cd phosphene
node serve.mjs
```

Then open http://localhost:8765. It needs to be served (not opened as a file) because browsers only allow mic and tab capture on `localhost` or HTTPS. The Node server also runs the two `/api` functions, so Song ID works locally. `python3 -m http.server 8765` still works for the visuals alone. On a Mac you can also double-click `Launch Phosphene.command`, which does the same and opens Chrome.

Deploying is just Vercel: `vercel --prod` from the repo root, no settings needed. The `api/` folder becomes serverless functions automatically.

## What's next

The native Mac app is still the plan for v3:
- **Capture the Spotify and Apple Music desktop apps directly** with ScreenCaptureKit or Core Audio process taps. No BlackHole, no changing your output device, no mic.
- **Menu bar app with a borderless fullscreen window** for a second display or a projector.
- **Syphon and NDI output** so VJ tools (Resolume, VDMX, OBS) can take the visuals as a video source.

Also planned: preset sharing by link, clip recording (canvas capture to video), MIDI and OSC control for live sets, and lyrics-aware moments once the song is named.

Pull requests are welcome. A new scene is one entry in `src/scenes.js`: a name, a blurb, a `vec3 scene(vec2 p)` function and optionally its feedback settings.

## How long it took

v1 was built in one Claude Code session on 25 Oct 2026: 44 minutes from "find or make the coolest psychedelic audio visualizer i can use for my mac" to the deployed twelve-scene app (Claude Opus 5.5; 120 assistant turns, about 152,000 output tokens).

v2 (this: eleven new scenes, the musical feature extractor, Song ID with its fingerprinter and serverless relay, the goop feedback and display passes, album palettes) was built in a second session on 5 Nov 2026 with Claude Fable 5.1 in Claude Code, from "lets take it to the next level" and "think goop wizard".

## Repository layout

- `index.html` the app shell (welcome screen, dock, settings)
- `src/scenes.js` the twenty-three scenes, GLSL plus feedback settings
- `src/shaders.js` the shared GLSL prelude, feedback, display and particle passes
- `src/renderer.js` WebGL2 setup, per-scene programs, textures, particle pass, adaptive resolution
- `src/audio.js` sources, analysers, the audio tap, levels
- `src/features.js` onsets, tempo, beat phase, bars, drops, chroma and key
- `src/shazam.js` the recognition fingerprint (also runs in Node)
- `src/songid.js` and `src/songid-worker.js` scheduling and off-thread fingerprinting
- `src/palette.js` album art to palette
- `src/ecg.js` the heartbeat waveform, its ring buffer and the BPM
- `src/main.js` UI, controls, gestures, URL options and the frame loop
- `src/styles.css` the interface
- `api/recognize.js` and `api/art.js` the Vercel functions
- `serve.mjs` local server with the API functions, no dependencies
- `docs/` README images, the diagram and the cover art source (`docs/cover/cover.html`)

## License

MIT, see [LICENSE](LICENSE). Spotify, YouTube, SoundCloud, Apple Music and Shazam are trademarks of their owners. This project is not affiliated with any of them; it only listens to audio your browser already plays, and Song ID uses a public recognition endpoint that is not an official API.
