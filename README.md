<p align="center"><img src="docs/images/hero.jpg" alt="phosphene" width="100%"></p>

# phosphene

A psychedelic audio visualizer that runs in your browser, and as the living wallpaper of your Mac. Twenty-three GPU shader worlds (fractals, a wormhole, liquid light, dripping goop, an all-seeing eye, oil-slick rainbows, a terrain built from your song, a bedside monitor, a spinning record and more) that melt and pulse with whatever you are listening to: Spotify in a browser tab, YouTube, your microphone or a local file.

It listens like a musician. It finds the tempo and locks onto the beat, counts bars so scene changes land on the downbeat, tells kicks from snares from hats, notices drops, and works out the key. And it follows the **melody**: every scene gets a semitone-resolution spectrum, the twelve notes of the scale and the pitch of the tune itself, so the shapes move with the notes and not only with the drums. It can also name the song that is playing, Shazam-style, and pull the album's colours into the picture.

<p align="center"><b>Open it: <a href="https://phosphene-viz.vercel.app">phosphene-viz.vercel.app</a></b><br>Desktop Chrome, Edge or Arc for tab audio. Phones work with the mic.</p>

> **Phosphene on your Mac desktop.** The best way to live with it: a small menu bar app that turns your desktop into the visualizer. Your own wallpaper stays put until music plays, then the scene burns through it on every display and melts back when the music stops. It hears Spotify, Music or anything else the Mac plays directly, with no microphone and no tab sharing. Skip scenes with one click in the menu bar, step through palettes, or let both change by themselves. See [The desktop wallpaper (Mac)](#the-desktop-wallpaper-mac).

The website: no install, no account, no build step. The visuals and all the analysis run on your device. Song ID sends only a sound fingerprint (a few hundred spectral peaks, never audio), and you can turn it off.

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
| 01 | Fractal Bloom | Kaleidoscopic iterated function system, folded into N-way symmetry | Seven bands of notes set the ring radii; the melody bends the fold itself, so the pattern reshapes with the tune; lines flash on snares and new notes |
| 02 | Wormhole | A tunnel of panelled walls | Sound travels down it: every kick and note is a ring of light racing away, each note in its own colour; the tune twists the tunnel; the far end glows the colour of the current note |
| 03 | Liquid Dream | Marbled, domain-warped oil | Each contour of the marble listens to a note and lights when it sounds; the melody pushes the whole pool; kicks and notes send ripples |
| 04 | Spectral Mandala | Fourteen rings and a crown of twelve arcs | Each ring is a band of notes; the crown is the scale, one arc per note; the ring at the melody's pitch rings out on every note |
| 05 | Gyroid Flight | Raymarched gyroid lattice with a carved flight path | Lit by the song racing ahead (around the path is pitch, ahead is time); the melody winds the lattice tighter or looser; drops flip the palette |
| 06 | Julia Bloom | A Julia set whose parameter walks the edge of the Mandelbrot cardioid | The melody's pitch picks the point, so every note has its own shape, and each new note pushes it over the edge for a moment; escape bands light with the notes |
| 07 | Hyperspace | Star streaks, streaming gas and a twelve-note core | Every star listens to one pitch and streaks when it sounds; the core ring lights the notes of the scale; a shock ring on every beat |
| 08 | Moiré | Two drifting ring fields multiplied into op-art interference | Ring density follows the melody: higher notes, finer rings; snares invert the print |
| 09 | Neon Horizon | Synthwave: striped sun, a wet road that mirrors the sky, three ridges of mountains | The mountains are cut from the last seconds of the song; one grid row passes per beat and a bar of light runs in on each; lanes light by pitch; the sun pulses on the kick |
| 10 | Pulsar | Thirty-two ridgelines with hidden-line removal, after the plot of pulsar CP 1919 made famous by *Unknown Pleasures* | Each line is the spectrum a tenth of a second further back, bass in the middle; kicks and notes ride back through the stack; behind it a pulsar sweeps its beams a quarter turn per beat |
| 11 | Vitals | A four-lane bedside monitor with live readouts | I the pulse (a heartbeat per beat), II the melody drawn as a line, III the bass as a pleth wave, IV a scrolling spectrogram; readouts for HR, the current note and key, energy and the beat of the bar |
| 12 | Vinyl | A record on a table, seen from a drifting camera | The song ripples out through the grooves from the label (each ring keeps the colour of the note that made it) and on across the table; a holographic sheen slides as the view tilts; drops spin it back; the label is the album cover once the song is named; the tonearm lifts in silence and while a skip is checked |
| 13 | Aurora | Curtains of light sweeping over a still lake that mirrors them | Across the sky is up the scale: curtains brighten where the notes are; kicks flare their feet, hats twinkle the stars |
| 14 | Goop | Eight gooey blobs that drip down the screen and merge | One blob per octave of the song; the melody leans them; snares and notes flash the rims. Turn Goo up. |
| 15 | Oracle | An all-seeing eye, ringed by a kaleidoscope of smaller eyes | It follows the melody: it looks up as the tune climbs; the iris is the spectrum, the pupil dilates on notes and kicks, drops blink; the cover shows in the iris while the song is known |
| 16 | Sigil | Rune rings turning at different speeds around nested polygons | Inner runes each listen to a pitch; the outer ring spells the twelve notes; the polygons turn with the tune |
| 17 | Oil Slick | Thin-film interference rainbows on black oil | The film thickens and thins with the melody so the rainbows slide; each note drops a pebble at its own spot; kicks ripple it |
| 18 | Chladni | Sand gathering at the nodes of a vibrating plate | The melody picks the mode, so the pattern changes with the tune; grains jump on kicks and notes |
| 19 | Canyon | Raymarched flight through a canyon made of the song | The walls are the last eight seconds of the spectrum, low notes tallest, with strata up them; wires glow on kicks and where notes began |
| 20 | Sonar | A radar sweep over a polar spectrogram | Out from the centre is up the scale, around is time; the note just played rings at its radius |
| 21 | Scope | An oscilloscope: a phosphor beam, the waveform wrapped around a ring, twelve lamps | The actual waveform against a delayed copy of itself, auto-gained to fill the dial; the lamps light the notes of the scale |
| 22 | Swarm | Sixty thousand particles on a Clifford strange attractor | Each particle is tuned to a note and glows when it sounds; the melody leans the attractor's shape; kicks fatten the particles |
| 23 | Crystal | Voronoi cells, each lit by its own note | A cell shines when its pitch sounds; the melody's own cells flash on each note; seams glow on snares |

Every scene draws into a feedback buffer. Each frame the previous image is melted along a slowly turning flow, dripped, zoomed, swirled and hue-shifted a little before the new one is laid on top. That is where the trails and the oozing come from; the **Goo** setting is how much. Kicks punch the zoom and split the colour channels, drops crank everything, and each new note tints the trails, so a tune leaves rings of different colours behind it.

Colour comes from a cosine palette. Seven presets (Rainbow, Acid, Orchid, Ember, Candy, Lagoon, Coral) rotate with the scenes, `P` steps through them, and once a song is named the album's own colours take over.

## Song ID

With the microphone or a shared tab, phosphene names what is playing. After four seconds of music it fingerprints the audio and asks; if there is no match it tries again with eight and then twelve seconds, then backs off. When a song is named:

- a now-playing card slides in at the top right with the cover, title, artist, tempo and key, for a few seconds when a song is named or changes, never on a timer, and only once the song is certain; the dock only ever shows the source
- the palette eases toward the cover's two most vivid colours
- the Vinyl label and the Oracle's iris show the artwork

It does not poll, and it is honest about what it knows. The card only ever shows a song it is sure of:

- **the song**, with cover, artist, tempo and key, when named
- **nothing** while it listens, while a fingerprint is on its way, while a change is suspected and when a check comes back empty. The moment you skip, the old song and its cover are gone at once, and the card stays away until the new one is named
- **Searching**, then the song or **Unknown song**, only when you press the identify button yourself

The match says how far into the song the excerpt was, and a free lookup says how long the song is, so phosphene knows roughly when it ends and checks again just after that. Before then only clues trigger a check, each with a weight: a skip gap (the audio drops to the noise floor for a fraction of a second, then music again: the signature of pressing Next, and the strongest clue), a long silence, the beat grid jumping (even a crossfade breaks the grid of a stable beat lock), the tempo tracker switching to a new tempo after a stable stretch, a sustained shift in timbre or in harmonic content (the last five seconds against the fifteen before them), or a new key. A medium clue is enough to doubt, and doubt always resolves: a check runs within a few seconds, and the answer is the same song, a new song, or "Unknown song". After a skip it waits for five seconds of the new song and sends only those. If a check comes back as the same song, it takes two clues to doubt again for a minute and a half. As a backstop, if anything at all looked different and the last check was more than ninety seconds ago, it checks once. Quiet is judged relative to the running music level, not an absolute number, so a faint microphone works the same as a loud tab.

Why not media keys: the browser cannot see Next or Previous. The system routes them to whichever app is playing, which is Spotify, not phosphene; if phosphene claimed them it would steal your skip. The gap a skip leaves in the audio is the next best thing.

Scenes that show the cover (Vinyl, Oracle) share one confidence value: the art is full while the song is known, greys out while a change is suspected, and clears when it is not. On Vinyl the tonearm sits on the groove while music plays and lifts in silence and while a skip is being checked.

Press `I` to identify right now. The switch in Settings turns it off entirely (remembered).

How it works: the fingerprint is the same compact format the Shazam app sends, generated in a Web Worker from the last few seconds of audio (16 kHz mono, sliding 2048-point spectra, peaks picked against their neighbours in time and frequency, packed into about four kilobytes). A tiny serverless function on Vercel forwards it to the recognition service and returns the title, artist, artwork and genre. The implementation in `src/shazam.js` was written from the public description of the format and checks byte-for-byte against the SongRec reference; it is also about forty times faster than the JavaScript ports it was checked against. The service is free but unofficial, so it may stop working one day without notice.

### Lyrics

Once the song is named, its words can play over the picture, the same in every scene: the line being sung in near-white, the lines before and after it smaller and dimmer, sliding up as the song moves on. It is off on the website until you turn it on (the **Lyrics** switch in Settings, the `L` key, or `?lyrics=1`), and it needs Song ID.

- **Where the words come from.** [LRCLIB](https://lrclib.net), a free and open lyrics database with no key. The song's title, artist and length are sent to a small function (`api/lyrics.js`; the Mac app asks LRCLIB itself), nothing else. No lyrics are stored anywhere.
- **Keeping time.** The match says where in the song the excerpt began, so the position now is that plus the excerpt's length plus the time since. Time-synced lyrics give each line its second. When only plain lyrics exist the lines are paced evenly across the song, which is a rough guide and no more; when there are none, nothing is shown.
- **Album cut or radio edit.** The same audio often matches two recordings whose timelines differ by the length of an intro, and the service may report the position on either. When LRCLIB has the lyrics for both lengths, the pairing in which both versions show the same line is the right one, and phosphene settles on it.
- **Only when it is sure.** Lyrics follow the same rule as the card: a line is on screen only while the song is known. Listening, checking, a suspected change, a skip, silence or an unknown song fade it out.

How it is drawn: plain type over the canvas (`src/lyrics.js`), a bold grotesque (Figtree, falling back to the system font) with a soft shadow and a faint scrim for legibility. Only transforms and opacity animate, and nothing in it takes the pointer.

## The ears

Two analysers run sixty times a second on a 4096-point spectrum. None of it leaves the device.

**The melodic ear** (`src/tones.js`) is what makes the scenes follow a tune:

- **A musical spectrum.** A linear spectrum gives the whole melodic range about 8% of its width. This one is resampled to two bins per semitone over eight octaves (A1 at 55 Hz to 14 kHz), so every octave gets the same room. Each bin is then whitened: it is measured against the average of the six semitones either side, so notes stand out as peaks while drums and hiss fall away.
- **Chroma.** The same spectrum folded into the twelve pitch classes, whatever the octave.
- **The melody.** The most salient peak between A2 and A6, counting its second, third and fourth harmonics, with a preference for staying near the current note and a long hold before an octave jump is believed. A parabola through the peak gives a pitch finer than the bins. Out come the pitch height, the note's name, a pulse on every new note, a colour (pitch classes laid around the wheel by fifths) and a confidence.
- **History.** One row of the spectrum and of eight features (melody, energy, bass pulse, kicks, note-ons and more) is kept every 1/30 s for 8.5 seconds, scrolling smoothly, so scenes can draw time: ridgelines, terrain, rings travelling down a tunnel or out across a record.

The **Melody** setting scales how hard the tune moves things.

**The rhythmic ear** (`src/features.js`):

- **Onsets.** Spectral flux (positive change in log magnitude) in three bands, each against an adaptive threshold. Kick, snare and hat envelopes drive the scenes separately.
- **Levels.** Bass, mid and high come from true band power, so a kick that is 6 dB louder really is twice as big. (They used to come from the analyser's byte spectrum, which is logarithmic and clips at -30 dB: on a loud tab the bass sat pinned at full.)
- **Tempo.** The full-band onset envelope is resampled to 50 Hz and kept for ten seconds. Every half second its autocorrelation is scored over 60 to 200 BPM with harmonic support and a soft prior around 122 BPM. A new tempo has to win three runs in a row, and octave errors are resolved toward the current tempo.
- **Beat phase.** Every quarter second the last eight beats of the envelope are scored against every phase offset; the beat anchor eases toward the winner. From that: a phase ramp, a pulse on every predicted beat, and a continuous beat count that scenes use to scroll grids exactly one step per beat.
- **Bars.** The beat index (mod 4) where kicks land hardest is the downbeat. Auto-cycle waits for a downbeat after eight bars, so scene changes feel like edits.
- **Drops.** A sudden lift of 1.9x on a kick after a build triggers a drop: colour shift, a new scene, extra bloom.
- **Key.** A chroma vector is averaged over a few seconds and correlated against Krumhansl-Schmuckler major and minor profiles. With **Key colors** on, the palette drifts toward the key.

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

Settings: sensitivity, trails, **goo** (how much everything melts), **melody** (how hard the tune moves things), symmetry, quality, auto-cycle, Song ID, key colors.

Keyboard: `1` to `9`, `0`, `-` and `=` jump to scenes 1 to 12, hold `Shift` for 13 to 23. `←` `→` or `Space` change scene, `A` toggles auto-cycle, `C` shifts the colours, `P` steps the palette, `G` steps goo (off, medium, max), `I` names the song, `[` `]` change the symmetry, `↑` `↓` change sensitivity, `F` fullscreen, `H` hides everything, `?` lists all of this.

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
| `?melody=1.5` | How hard the melody moves things (0 to 2) |
| `?palette=acid` | Hold one palette: rainbow, acid, orchid, ember, candy, lagoon or coral |
| `?np=1` | Keep the now-playing card in clean mode (for a stream overlay) |
| `?debug` | Log Song ID's states and clues to the console, expose `window.phosphene` |
| `?demo` | Skip the source picker and start on the demo beat |

Example: `https://phosphene-viz.vercel.app/?scene=19&ui=0&auto=0&goo=0.7`

## How it works

<p align="center"><img src="docs/images/pipeline.svg" alt="Audio in, analyser, features, scene shader with feedback buffer, display pass" width="100%"></p>

- **Audio in.** Tab audio comes from `getDisplayMedia` (the video track is dropped right away, and the visualizer stays in front instead of Chrome jumping to the shared tab), the mic from `getUserMedia` with echo cancellation, noise suppression and auto gain turned off so the music is not mangled. Files go through a `MediaElementSource`. Live sources are never connected to the speakers, so there is no feedback loop. An `AudioWorklet` tap keeps the last fifteen seconds of raw audio for Song ID.
- **Textures.** Each frame the scenes get the log spectrum (192 x 1, mip-mapped so a scene can ask for a band's average), chroma (12 x 1, wrapping), the waveform (1024 x 1, auto-gained) and a 256 x 256 history ring: 8.5 seconds of spectrum and features. Vitals also reads a 256 x 64 heartbeat ring.
- **Scene programs.** Each scene is its own GLSL ES 3.00 program (shared prelude plus one function plus the feedback pass), compiled on first use and pre-warmed for the next scene. Feedback lives in two ping-ponged half-float render targets. A scene can lower the feedback per pixel to keep part of the picture crisp (the record, the road, the lake) and can read the previous frame, which is how the lake and the wet road get their reflections for one texture fetch.
- **Overlay passes.** Swarm draws 60,000 additive points and Scope draws its beam as a line strip, both straight into the feedback buffer with positions computed from the vertex id alone.
- **Display pass.** The frame's mip chain is generated once and read several ways: level 0 for the picture, the middle levels for clarity and bloom, the 1 x 1 top level for auto exposure. Then a lens that breathes with the bar, chromatic aberration that grows with the kick, thin-film iridescence, tone mapping, grain and a vignette.
- **Resolution.** The canvas stays at display resolution; the feedback buffers scale with the quality setting and per scene (the raymarchers render a little smaller). In Auto the renderer watches the frame time and steps the buffers down or back up. The picture is carried across a change of size, so it never flashes.
- **Song ID.** `src/songid.js` schedules attempts, `src/songid-worker.js` fingerprints off the main thread with `src/shazam.js`, `api/recognize.js` relays to the recognition service, `api/art.js` relays artwork with CORS headers so its pixels can be read for the palette and uploaded as a texture.

No frameworks and no build. The whole app is `index.html` plus the ES modules in `src/`, and two small serverless functions in `api/`.

### Performance

GPU time per frame at 1600 x 900 on an M2 Max, v2 against v3 measured back to back (`?debug`, then `phosphene.bench()` in the console):

| Scene | v2 | v3 |
|---|---|---|
| Aurora | 4.44 ms | 1.06 ms |
| Pulsar | 2.15 ms | 0.42 ms |
| Gyroid Flight | 2.11 ms | 0.80 ms |
| Canyon | 1.98 ms | 0.57 ms |
| Scope | 1.77 ms | 0.34 ms |
| Oil Slick | 1.47 ms | 0.58 ms |
| Liquid Dream | 1.35 ms | 0.81 ms |
| All 23, summed | 26.3 ms | 12.4 ms |

Where it came from: the display pass reads mips instead of 27 taps a pixel; the feedback flow uses noise with an analytic gradient instead of twelve noise lookups; Pulsar only visits the few ridgelines that can reach a pixel; Scope's beam is geometry instead of a 96-segment distance loop; Aurora and Gyroid march fewer, dithered steps into smaller buffers. Vitals and Vinyl do more than before and cost a little more.

## The desktop wallpaper (Mac)

`wallpaper/` is a small native Mac app that runs the same engine as your desktop wallpaper. It is separate from the website and is not deployed anywhere: you build it and run it on your own Mac.

- **Your wallpaper stays your wallpaper.** While nothing plays, the app is invisible and asleep, and costs nothing. When music starts, the visualizer burns through your desktop (the window is genuinely transparent, so it works over any wallpaper, even a video one) and melts back a few seconds after the music stops. Desktop icons stay on top.
- **It hears the Mac directly.** No microphone, no tab sharing: it taps what the Mac is playing, either everything or one app (Spotify, Music, a browser), chosen from the menu bar. This is the "capture the desktop apps directly" item that used to be on the roadmap.
- **Menu bar controls.** What to listen to, scene (or change with the music), palette, opacity, goo and melody, what to do when the music stops (show my wallpaper, or keep drifting slowly), frame rate, which displays, Song ID, open at login.
- **Palettes your way.** Pin one, let it change with the scenes, or have it change every so often on its own (about every 45 seconds, easing across). A second stepper row in the menu steps through palettes.
- **Skip from the menu bar.** A small skip button beside the icon goes to the next scene in one click (right-click or Option-click for the previous one), and a stepper row in the menu steps through scenes without closing it. The scene's name fades in at the bottom left of the desktop for a moment. The button can be hidden from the menu.
- **Every display matches.** One display's engine leads and the others copy its scene, palette, hue, clock and album art, so two screens never drift into different colours. A palette picked in the menu stays until you pick another, even when Song ID finds the album.
- **Lyrics on the desktop.** With Song ID on, the words of the song play over the picture on every display, clear of the Dock, the song card and the scene label ("Show lyrics" in the menu, on by default). See [Lyrics](#lyrics).
- **A fresh look each time.** When music starts it opens on a random scene and palette (a menu switch turns this off), and the song card sits bottom right, clear of the Dock.
- **It stays out of the way.** It pauses when the desktop is covered by a full-screen app, when the displays sleep and when the screen is locked, and drops to 20 frames a second in silence if you ask it to stay on.

```sh
cd wallpaper
./build.sh --run
```

That needs Xcode's command line tools and macOS 14.2 or later. The first time it listens, macOS asks to let it record system audio: that is the permission for hearing what the Mac plays. Nothing is recorded; the samples are analysed in memory, and with Song ID on, only the usual fingerprint leaves the Mac. To keep it, drag `wallpaper/build/Phosphene Wallpaper.app` to Applications and turn on "Open at login" in its menu.

Run `./setup-signing.sh` once before building if you plan to rebuild. It creates a self-signed signing identity in its own keychain, used only for this app. Without it the app is ad-hoc signed, every rebuild looks like a new app to macOS, and the audio permission is asked for again each time.

To test it without touching the audio permission, `Phosphene Wallpaper.app/Contents/MacOS/PhospheneWallpaper --test-audio song.m4a --test-seconds 10 --status-file status.json` feeds a file through the same path and writes what the app and the engine are doing once a second.

How it works: a borderless, click-through window at desktop level (above the wallpaper, below the icons) on each display holds a transparent `WKWebView`, which loads the engine from the app bundle with `?wallpaper`. WebKit draws WebGL through Metal, so the shaders run on the same GPU path a hand-written Metal port would use. Audio comes from a Core Audio process tap, is mixed to mono in Swift and pushed to the page sixty times a second, where `src/spectrum.js` (a JavaScript FFT that matches the Web Audio analyser) feeds the same ears as the website. Swift decides when music is playing (most of a second of sound to wake, four seconds of silence to sleep, so a notification ping does not count) and tells the engine to melt in or out; the engine's display pass does the dissolve and writes a transparent canvas where the desktop should show. Song ID and album art are relayed through the website's two functions.

## Run it locally

```sh
git clone https://github.com/maxsorto/phosphene.git
cd phosphene
node serve.mjs
```

Then open http://localhost:8765. It needs to be served (not opened as a file) because browsers only allow mic and tab capture on `localhost` or HTTPS. The Node server also runs the two `/api` functions, so Song ID works locally. On a Mac you can also double-click `Launch Phosphene.command`, which finds a free port, starts the server and opens Chrome.

For working on scenes with real music there is `dev.html`: it shares a tab's audio once in an outer page and runs the app in a frame, so the app can be reloaded as often as needed without picking the tab again. `?debug` logs Song ID's state machine and exposes `window.phosphene` (the audio engine, renderer, uniforms and a `bench()`).

Deploying is just Vercel: `vercel --prod` from the repo root, no settings needed. The `api/` folder becomes serverless functions automatically.

## What's next

- **Liquify.** The engine can already draw a copy of the wallpaper image and push it around as the visualizer takes over; the app does not use it yet because macOS does not reliably say which image is on the desktop.
- **Syphon and NDI output** from the Mac app, so VJ tools (Resolume, VDMX, OBS) can take the visuals as a video source.
- Preset sharing by link, clip recording (canvas capture to video), MIDI and OSC control for live sets, and lyrics-aware moments once the song is named.

Pull requests are welcome. A new scene is one entry in `src/scenes.js`: a name, a blurb, a `vec3 scene(vec2 p)` function and optionally its feedback settings.

## How long it took

v1 was built in one Claude Code session on 25 Oct 2026: 44 minutes from "find or make the coolest psychedelic audio visualizer i can use for my mac" to the deployed twelve-scene app (Claude Opus 5.5).

v2 (eleven new scenes, the rhythmic feature extractor, Song ID with its fingerprinter and serverless relay, the goop feedback, album palettes) was a second session on 5 Nov 2026 with Claude Fable 5.1, from "lets take it to the next level" and "think goop wizard".

v3 (this: the melodic ear and a melody-driven rewrite of every scene, rebuilt Aurora, Pulsar, Vitals, Vinyl, Neon Horizon and Wormhole, palettes, and a renderer about twice as fast) was done on 14 Nov 2026 with Claude Fable 5.2, tuned against a YouTube tab playing live through the dev host.

## Repository layout

- `index.html` the app shell (welcome screen, dock, settings, monitor readouts)
- `src/scenes.js` the twenty-three scenes, GLSL plus feedback settings
- `src/shaders.js` the shared GLSL prelude, feedback, display and overlay passes
- `src/renderer.js` WebGL2 setup, per-scene programs, textures and the history ring, overlays, mips, adaptive resolution, the benchmark
- `src/audio.js` sources, analysers, the audio tap, band levels, the demo groove
- `src/tones.js` the melodic ear: log spectrum, chroma, melody tracking
- `src/features.js` the rhythmic ear: onsets, tempo, beat phase, bars, drops, key
- `src/shazam.js` the recognition fingerprint (also runs in Node)
- `src/songid.js` and `src/songid-worker.js` the Song ID state machine and off-thread fingerprinting
- `src/spectrum.js` a JavaScript spectrum analyser, for audio pushed in by the Mac app
- `src/palette.js` palette presets and album art to palette
- `src/ecg.js` the heartbeat waveform and its ring buffer
- `src/main.js` UI, controls, gestures, URL options and the frame loop
- `src/styles.css` the interface
- `api/recognize.js` and `api/art.js` the Vercel functions
- `serve.mjs` local server with the API functions, no dependencies
- `dev.html` development host that keeps a shared tab's audio across reloads
- `wallpaper/` the Mac desktop wallpaper app: `Sources/App.swift` (menu bar, when to wake and sleep), `Engine.swift` (the desktop window and web view), `AudioTap.swift` (hearing the Mac), `build.sh`, `setup-signing.sh` (a one-time local signing identity)
- `docs/` README images, the diagram and the cover art source (`docs/cover/cover.html`)

## License

MIT, see [LICENSE](LICENSE). Spotify, YouTube, SoundCloud, Apple Music and Shazam are trademarks of their owners. This project is not affiliated with any of them; it only listens to audio your browser already plays, and Song ID uses a public recognition endpoint that is not an official API.
