// Phosphene Wallpaper: a menu bar app that turns the desktop into the
// visualizer while music plays and hands it back to your own wallpaper when
// it stops. It lives in the menu bar (no Dock icon, no windows of its own).

import AppKit
import WebKit
import CoreAudio
import AVFoundation
import ServiceManagement

private let defaults = UserDefaults.standard

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private var status: NSStatusItem!
    private let menu = NSMenu()
    private var scheme: EngineScheme!
    private var views: [WallpaperView] = []
    private let tap = AudioTap()
    private let audioQueue = DispatchQueue(label: "phosphene.audio-setup")   // starting a tap can wait on the permission prompt
    private var timers: [Timer] = []

    private var sceneNames: [String] = [], paletteNames: [String] = []
    private var scene = 0
    private var skipItem: NSStatusItem?                  // the quick next-scene button beside the icon
    private weak var stepLabel: NSTextField?             // the scene name in the menu's stepper row
    private weak var paletteLabel: NSTextField?          // and the palette's
    private var paletteNow = 0                           // the palette on screen, as the leading engine reports it
    private var testPaletteEvery = 0.0                   // self-test: shorten the timed palette change to this many seconds
    private var testPaletteMode: Int?                    // self-test: use this palette mode without touching the saved one
    /// The palette setting: a pinned palette's index, -1 to change with the scenes, -2 to change every so often.
    private var paletteMode: Int { testPaletteMode ?? defaults.integer(forKey: "palette") }
    private var menuShot: String?, menuShotAfter = 10.0   // self-test: open the menu and save pictures of the app's own windows into this folder
    private var testScene: Int?                          // self-test: start on this scene instead of a random one
    private var testSkips = 0                            // self-test: press the skip button this many times
    private var pendingRandom = false                    // music just started: pick a fresh scene and palette once the engine is up

    // Asleep: your wallpaper, engine paused. Awake: the visualizer. Falling: melting back.
    private enum Mode: String { case asleep, awake, falling }
    private var mode: Mode = .asleep
    private var loudRun = 0.0, lastLoud = 0.0, lastTick = CACurrentMediaTime(), fallingSince = 0.0
    private var level: Float = 0, everLoud = false
    private var engineErrors: [String] = []
    private var tapped: [AudioObjectID]? = nil, tapWanted = false
    private var screensAsleep = false

    // Self-test hooks: --status-file <path>, --grab <path> [--grab-after <s>], --test-wake,
    // --test-audio <file> [--test-seconds <s>] (feeds a file through the audio path in place of the tap)
    private var statusFile: String?, grabFile: String?, grabAfter = 8.0, testWake = false
    private var testAudio: [Float] = [], testAt = 0, testEnd = 0, testRate = 48000.0, ignoreCover = false

    // MARK: Preferences

    private var enabled: Bool { defaults.bool(forKey: "enabled") }
    private var source: String { defaults.string(forKey: "source") ?? "system" }       // "system", "off" or a bundle id
    private var stayOn: Bool { defaults.bool(forKey: "stayOn") || testWake }
    private var lyricsWanted: Bool { defaults.bool(forKey: "lyrics") && defaults.bool(forKey: "songId") }   // lyrics need the song's name

    // MARK: Launch

    func applicationDidFinishLaunching(_ note: Notification) {
        defaults.register(defaults: [
            "enabled": true, "source": "system", "sourceName": "", "auto": true, "scene": 0, "palette": -1,
            "opacity": 1.0, "goo": 0.5, "melody": 1.0, "fps": 60, "allDisplays": true, "songId": true, "lyrics": true, "card": false, "stayOn": false, "randomStart": true, "skipButton": true,
        ])
        var args = Array(CommandLine.arguments.dropFirst())
        while !args.isEmpty {
            let a = args.removeFirst()
            if a == "--status-file", !args.isEmpty { statusFile = args.removeFirst() }
            else if a == "--grab", !args.isEmpty { grabFile = args.removeFirst() }
            else if a == "--grab-after", !args.isEmpty { grabAfter = Double(args.removeFirst()) ?? 8 }
            else if a == "--test-wake" { testWake = true }
            else if a == "--test-ignore-cover" { ignoreCover = true }
            else if a == "--test-skips", !args.isEmpty { testSkips = Int(args.removeFirst()) ?? 0 }
            else if a == "--test-palette-mode", !args.isEmpty { testPaletteMode = Int(args.removeFirst()) }
            else if a == "--menu-shot", !args.isEmpty { menuShot = args.removeFirst() }
            else if a == "--menu-shot-after", !args.isEmpty { menuShotAfter = Double(args.removeFirst()) ?? 10 }
            else if a == "--test-scene", !args.isEmpty { testScene = Int(args.removeFirst()) }
            else if a == "--test-palette-every", !args.isEmpty { testPaletteEvery = Double(args.removeFirst()) ?? 0 }
            else if a == "--test-audio", !args.isEmpty { testAudio = Self.decode(args.removeFirst(), rate: &testRate); testEnd = testAudio.count }
            else if a == "--test-seconds", !args.isEmpty { testEnd = min(testAudio.count, Int((Double(args.removeFirst()) ?? 10) * testRate)) }
        }
        // one copy at a time
        let me = NSRunningApplication.current
        if NSWorkspace.shared.runningApplications.contains(where: { $0.bundleIdentifier == me.bundleIdentifier && $0.processIdentifier != me.processIdentifier }) { NSApp.terminate(nil); return }

        let web = Bundle.main.resourceURL!.appendingPathComponent("web")
        scheme = EngineScheme(root: web)

        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        let icon = NSImage(systemSymbolName: "waveform", accessibilityDescription: "Phosphene Wallpaper")
        icon?.isTemplate = true
        status.button?.image = icon
        menu.delegate = self
        menu.autoenablesItems = false
        status.menu = menu
        updateSkipItem()

        buildViews()
        startAudio()

        every(1.0 / 60) { [weak self] in self?.pump() }
        every(3) { [weak self] in self?.followApp() }
        every(1) { [weak self] in self?.checkCover() }
        if testSkips > 0 { every(2) { [weak self] in guard let self, self.mode == .awake, self.testSkips > 0, !self.sceneNames.isEmpty else { return }; self.testSkips -= 1; self.step(1); self.stepPalette(1) } }
        if menuShot != nil { DispatchQueue.main.asyncAfter(deadline: .now() + menuShotAfter) { [weak self] in self?.shootMenu() } }
        if statusFile != nil { every(1) { [weak self] in self?.writeStatus() } }
        if grabFile != nil { DispatchQueue.main.asyncAfter(deadline: .now() + grabAfter) { [weak self] in self?.grab() } }

        let nc = NotificationCenter.default, ws = NSWorkspace.shared.notificationCenter
        nc.addObserver(self, selector: #selector(screensChanged), name: NSApplication.didChangeScreenParametersNotification, object: nil)
        ws.addObserver(self, selector: #selector(displaysSlept), name: NSWorkspace.screensDidSleepNotification, object: nil)
        ws.addObserver(self, selector: #selector(displaysWoke), name: NSWorkspace.screensDidWakeNotification, object: nil)
        ws.addObserver(self, selector: #selector(displaysSlept), name: NSWorkspace.sessionDidResignActiveNotification, object: nil)
        ws.addObserver(self, selector: #selector(displaysWoke), name: NSWorkspace.sessionDidBecomeActiveNotification, object: nil)

        // a different output device (headphones in or out) needs the tap rebuilt
        var addr = CoreAudioQuery.address(kAudioHardwarePropertyDefaultOutputDevice)
        AudioObjectAddPropertyListenerBlock(CoreAudioQuery.system, &addr, .main) { [weak self] _, _ in self?.startAudio() }
    }

    func applicationWillTerminate(_ note: Notification) { audioQueue.sync { tap.stop() } }

    private func every(_ seconds: TimeInterval, _ block: @escaping () -> Void) {
        let t = Timer(timeInterval: seconds, repeats: true) { _ in block() }
        RunLoop.main.add(t, forMode: .common)               // keeps running while the menu is open
        timers.append(t)
    }

    // MARK: Windows

    private func buildViews() {
        views.forEach { $0.close() }
        let screens = defaults.bool(forKey: "allDisplays") ? NSScreen.screens : Array(NSScreen.screens.prefix(1))
        views = screens.map { screen in
            let v = WallpaperView(screen: screen, scheme: scheme)
            v.onMessage = { [weak self] view, msg in self?.handle(view, msg) }
            return v
        }
    }

    @objc private func screensChanged() { buildViews() }

    /// One display's engine leads: it names the song, changes scenes and sets the colours, and the others copy
    /// its look. It is the first display whose desktop is in view, so a full-screen app on one never freezes the rest.
    private var leader: WallpaperView? { views.first { $0.ready && $0.visible } ?? views.first }
    private weak var lastLeader: WallpaperView?
    private func updateRoles() {
        guard let now = leader, now !== lastLeader else { return }
        lastLeader = now
        views.filter { $0.ready }.forEach { applySettings($0) }
    }

    /// Is this display's desktop hidden behind one window (a full-screen app, in practice)? Window
    /// occlusion is not reported reliably for desktop-level windows, so look at the window list.
    private func covered(_ view: WallpaperView) -> Bool {
        guard !ignoreCover, let id = UInt32(view.displayID),
              let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return false }
        let display = CGDisplayBounds(id), area = display.width * display.height
        for w in list {
            guard (w[kCGWindowLayer as String] as? Int) == 0, (w[kCGWindowAlpha as String] as? Double ?? 1) > 0.05,
                  let b = w[kCGWindowBounds as String] as? [String: Any], let rect = CGRect(dictionaryRepresentation: b as CFDictionary) else { continue }
            let shown = rect.intersection(display)
            if !shown.isNull, shown.width * shown.height >= area * 0.97 { return true }
        }
        return false
    }

    /// Once a second: stop drawing on a display whose desktop cannot be seen, resume when it can.
    private func checkCover() {
        for v in views {
            let visible = !covered(v)
            guard visible != v.visible else { continue }
            v.visible = visible
            if mode != .asleep { v.js("phospheneHost.setPaused(\(!visible || screensAsleep))") }
        }
        updateRoles()
    }
    @objc private func displaysSlept() { screensAsleep = true; views.forEach { $0.js("phospheneHost.setPaused(true)") } }
    @objc private func displaysWoke() { screensAsleep = false; if mode != .asleep { views.forEach { $0.js("phospheneHost.setPaused(\(!$0.visible))") } } }

    private func handle(_ view: WallpaperView, _ msg: [String: Any]) {
        let primary = view === leader
        switch msg["type"] as? String {
        case "ready":
            if sceneNames.isEmpty { sceneNames = msg["scenes"] as? [String] ?? []; paletteNames = msg["palettes"] as? [String] ?? [] }
            randomStartIfDue()
            lastLeader = nil; updateRoles()                              // (re)assign who leads, which applies every view's settings
            if mode == .awake || (enabled && stayOn) { mode = .awake; view.show(); view.js("phospheneHost.wake(2)") }
        case "scene":
            guard primary, view.ready, let i = msg["index"] as? Int else { return }
            scene = i
            stepLabel?.stringValue = sceneTitle(i)
            if !defaults.bool(forKey: "auto") { defaults.set(i, forKey: "scene") }
        case "palette":
            guard primary, view.ready, let i = msg["index"] as? Int else { return }
            paletteNow = i
            paletteLabel?.stringValue = paletteTitle(i)
        case "look":                                                        // other displays copy the leader's look
            guard primary, let look = msg["look"], JSONSerialization.isValidJSONObject(look),
                  let data = try? JSONSerialization.data(withJSONObject: look), let json = String(data: data, encoding: .utf8) else { return }
            for v in views where v !== view { v.js("phospheneHost.follow(\(json))") }
        case "asleep":
            if mode == .falling { finishSleep() }
        case "error":
            let text = msg["message"] as? String ?? "?"
            NSLog("Phosphene engine error: %@", text)
            if !engineErrors.contains(text) { engineErrors.append(text); if engineErrors.count > 8 { engineErrors.removeFirst() } }
        default: break
        }
    }

    private static func insetsCall(_ view: WallpaperView) -> String { "phospheneHost.insets(\(view.insets.map(String.init).joined(separator: ",")));" }

    private func applySettings(_ view: WallpaperView) {
        let primary = view === leader, d = defaults
        var js = ""
        for key in ["opacity", "goo", "melody"] { js += "phospheneHost.set('\(key)', \(d.double(forKey: key)));" }
        js += "phospheneHost.set('fps', \(d.integer(forKey: "fps")));"
        js += "phospheneHost.set('follower', \(!primary));"
        js += "phospheneHost.set('songid', \(primary && d.bool(forKey: "songId")));"
        js += "phospheneHost.set('lyrics', \(lyricsWanted));"            // every display: the others show the line the leader shows
        js += "phospheneHost.set('card', \(d.bool(forKey: "card")));"
        js += "phospheneHost.set('stayOn', \(stayOn));"
        js += Self.insetsCall(view)
        js += "phospheneHost.setAuto(\(primary && d.bool(forKey: "auto")));"
        if !d.bool(forKey: "auto") { js += "phospheneHost.setScene(\(d.integer(forKey: "scene")));" } else if !primary { js += "phospheneHost.setScene(\(scene));" }
        if testPaletteEvery > 0 { js += "phospheneHost.set('paletteEvery', \(testPaletteEvery));" }
        js += "phospheneHost.setPalette(\(paletteMode));"
        view.js(js)
    }

    // MARK: Audio

    private func startAudio() {
        tapWanted = enabled && source != "off"
        let tap = self.tap
        guard tapWanted else { tapped = nil; audioQueue.async { tap.stop() }; return }
        if source == "system" { tapped = nil; audioQueue.async { tap.start(objects: nil) }; return }
        let objects = CoreAudioQuery.apps().first { $0.bundleID == source }?.objects ?? []
        tapped = objects
        audioQueue.async { if objects.isEmpty { tap.stop() } else { tap.start(objects: objects) } }   // not running yet: followApp() keeps looking
    }

    /// The chosen app may quit, relaunch or spawn a new audio helper: keep the tap pointed at it.
    private func followApp() {
        guard tapWanted, source != "system" else { return }
        let objects = CoreAudioQuery.apps().first { $0.bundleID == source }?.objects ?? []
        if Set(objects) != Set(tapped ?? []) { startAudio() }
    }

    /// Sixty times a second: take what the tap heard, decide whether music is playing, pass it to the engine.
    private func pump() {
        let now = CACurrentMediaTime(), dt = min(0.25, now - lastTick); lastTick = now
        var samples = tap.drain()
        if !testAudio.isEmpty {                                  // self-test: the file stands in for the tap, then goes silent
            let n = min(Int(dt * testRate), max(0, testEnd - testAt))
            samples = n > 0 ? Array(testAudio[testAt..<testAt + n]) : []
            testAt += n
        }
        var rms: Float = 0
        if !samples.isEmpty { var s: Float = 0; for v in samples { s += v * v }; rms = (s / Float(samples.count)).squareRoot() }
        level = max(rms, level * 0.92)
        if rms > 0.0012 { lastLoud = now; loudRun += dt; everLoud = true } else if now - lastLoud > 0.4 { loudRun = 0 }
        guard enabled else { return }

        switch mode {
        case .asleep: if loudRun >= 0.8 || stayOn { pendingRandom = true; wake() }          // most of a second of sound, so a notification ping does not count
        case .awake: if !stayOn && now - lastLoud > 4 { fall() }
        case .falling:
            if loudRun >= 0.3 { wake() } else if now - fallingSince > 6 { finishSleep() }
        }
        guard mode != .asleep, !samples.isEmpty else { return }
        var pcm = [Int16](repeating: 0, count: samples.count)
        for i in 0..<samples.count { pcm[i] = Int16(max(-32768, min(32767, samples[i] * 32767))) }
        let b64 = pcm.withUnsafeBufferPointer { Data(buffer: $0) }.base64EncodedString()
        let call = "phospheneHost.pcm('\(b64)', \(Int(testAudio.isEmpty ? tap.sampleRate : testRate)))"
        for v in views where v.ready && v.visible && !screensAsleep { v.js(call) }
    }

    /// Each time music starts, begin on a different scene and palette (unless that is switched off in the menu).
    private func randomStartIfDue() {
        guard pendingRandom, !sceneNames.isEmpty, !paletteNames.isEmpty else { return }
        pendingRandom = false
        if let s = testScene { scene = s; leader?.js("phospheneHost.setScene(\(s))"); return }
        guard defaults.bool(forKey: "randomStart") else { return }
        var s = Int.random(in: 0..<sceneNames.count), p = Int.random(in: 0..<paletteNames.count)
        if sceneNames.count > 1 { while s == scene { s = Int.random(in: 0..<sceneNames.count) } }
        if paletteNames.count > 1 { while p == paletteMode { p = Int.random(in: 0..<paletteNames.count) } }
        scene = s; defaults.set(s, forKey: "scene")
        leader?.js("phospheneHost.setScene(\(s))")
        if paletteMode < 0 { leader?.js("phospheneHost.showPreset(\(p))") }       // palettes rotate: just start somewhere new
        else { defaults.set(p, forKey: "palette"); views.forEach { $0.js("phospheneHost.setPalette(\(p))") } }
    }

    private func wake() {
        mode = .awake
        randomStartIfDue()
        for v in views {
            v.visible = !covered(v)
            v.show(); v.js(Self.insetsCall(v) + "phospheneHost.wake(3.5)")           // the Dock may have moved since last time
            if !v.visible { v.js("phospheneHost.setPaused(true)") }     // behind a full-screen app: wait until the desktop shows
        }
        updateRoles()
    }
    private func fall() {
        mode = .falling; fallingSince = CACurrentMediaTime()
        views.forEach { $0.js("phospheneHost.sleep(3)") }
    }
    private func finishSleep() {
        mode = .asleep
        for v in views { v.js("phospheneHost.setPaused(true)"); v.hide() }
    }

    // MARK: Menu

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        let d = defaults
        let apps = CoreAudioQuery.apps()

        let what = source == "system" ? "Everything this Mac plays" : source == "off" ? "Nothing" : (apps.first { $0.bundleID == source }?.name ?? d.string(forKey: "sourceName") ?? source)
        var state = !enabled ? "Off" : mode == .awake ? "Playing" : mode == .falling ? "Fading out" : "Waiting for music"
        if enabled, source != "off", source != "system", !(apps.contains { $0.bundleID == source }) { state = "Waiting for it to open" }
        if let e = tap.lastError { state = e }
        add(menu, "\(what)  ·  \(state)", enabled: false)
        add(menu, "On", #selector(toggle(_:)), on: enabled, key: "enabled")
        menu.addItem(.separator())

        let listen = submenu(menu, "Listen to")
        add(listen, "Everything this Mac plays", #selector(pickSource(_:)), on: source == "system", represented: ["system", ""])
        if !apps.isEmpty { listen.addItem(.separator()) }
        for app in apps {
            let item = add(listen, app.name + (app.playing ? "  ·  playing" : ""), #selector(pickSource(_:)), on: source == app.bundleID, represented: [app.bundleID, app.name])
            if let icon = app.icon?.copy() as? NSImage { icon.size = NSSize(width: 16, height: 16); item.image = icon }
        }
        if source != "system", source != "off", !(apps.contains { $0.bundleID == source }) {
            add(listen, (d.string(forKey: "sourceName") ?? source) + "  ·  not open", #selector(pickSource(_:)), on: true, represented: [source, d.string(forKey: "sourceName") ?? ""])
        }
        listen.addItem(.separator())
        add(listen, "Nothing", #selector(pickSource(_:)), on: source == "off", represented: ["off", ""])

        let (sceneRow, sceneLabel) = stepper(sceneTitle(scene), previous: #selector(previousScene), next: #selector(nextScene), what: "scene")
        let (paletteRow, palLabel) = stepper(paletteTitle(paletteNow), previous: #selector(previousPalette), next: #selector(nextPalette), what: "palette")
        stepLabel = sceneLabel; paletteLabel = palLabel
        menu.addItem(sceneRow); menu.addItem(paletteRow)
        let scenes = submenu(menu, "Scene")
        add(scenes, "Change with the music", #selector(toggle(_:)), on: d.bool(forKey: "auto"), key: "auto")
        scenes.addItem(.separator())
        for (i, name) in sceneNames.enumerated() { add(scenes, String(format: "%02d  %@", i + 1, name), #selector(pickScene(_:)), on: i == scene, represented: i) }

        let palettes = submenu(menu, "Palette")
        add(palettes, "Change with the scenes", #selector(pickPalette(_:)), on: paletteMode == -1, represented: -1)
        add(palettes, "Change every so often", #selector(pickPalette(_:)), on: paletteMode == -2, represented: -2)
        palettes.addItem(.separator())
        for (i, name) in paletteNames.enumerated() { add(palettes, name, #selector(pickPalette(_:)), on: paletteMode == i, represented: i) }

        menu.addItem(.separator())
        menu.addItem(slider("Opacity", key: "opacity", min: 0.25, max: 1))
        menu.addItem(slider("Goo", key: "goo", min: 0, max: 1))
        menu.addItem(slider("Melody", key: "melody", min: 0, max: 2))
        menu.addItem(.separator())

        let silence = submenu(menu, "When the music stops")
        add(silence, "Show my wallpaper", #selector(pickStay(_:)), on: !d.bool(forKey: "stayOn"), represented: false)
        add(silence, "Keep drifting slowly", #selector(pickStay(_:)), on: d.bool(forKey: "stayOn"), represented: true)
        let rate = submenu(menu, "Frame rate")
        for fps in [60, 30] { add(rate, "\(fps) frames a second", #selector(pickFps(_:)), on: d.integer(forKey: "fps") == fps, represented: fps) }
        let displays = submenu(menu, "Displays")
        add(displays, "All displays", #selector(pickDisplays(_:)), on: d.bool(forKey: "allDisplays"), represented: true)
        add(displays, "Main display only", #selector(pickDisplays(_:)), on: !d.bool(forKey: "allDisplays"), represented: false)
        add(menu, "Show the skip button in the menu bar", #selector(toggle(_:)), on: d.bool(forKey: "skipButton"), key: "skipButton")
        add(menu, "Start on a random scene and palette", #selector(toggle(_:)), on: d.bool(forKey: "randomStart"), key: "randomStart")
        add(menu, "Name the song (Song ID)", #selector(toggle(_:)), on: d.bool(forKey: "songId"), key: "songId")
        add(menu, "Show lyrics", #selector(toggle(_:)), on: lyricsWanted, enabled: d.bool(forKey: "songId"), key: "lyrics")
        add(menu, "Show the song on the desktop", #selector(toggle(_:)), on: d.bool(forKey: "card"), key: "card")
        add(menu, "Open at login", #selector(toggleLogin), on: SMAppService.mainApp.status == .enabled)
        if enabled, source != "off", !everLoud { add(menu, "Never reacts? Check audio permission…", #selector(openPermission)) }
        menu.addItem(.separator())
        add(menu, "Quit Phosphene Wallpaper", #selector(quit))
    }

    @discardableResult
    private func add(_ menu: NSMenu, _ title: String, _ action: Selector? = nil, on: Bool = false, enabled: Bool = true, key: String? = nil, represented: Any? = nil) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self; item.state = on ? .on : .off; item.isEnabled = enabled
        item.representedObject = represented ?? key
        menu.addItem(item)
        return item
    }
    private func submenu(_ menu: NSMenu, _ title: String) -> NSMenu {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: ""), sub = NSMenu()
        sub.autoenablesItems = false; item.submenu = sub; menu.addItem(item)
        return sub
    }
    private func slider(_ title: String, key: String, min: Double, max: Double) -> NSMenuItem {
        let item = NSMenuItem(), view = NSView(frame: NSRect(x: 0, y: 0, width: 250, height: 28))
        let label = NSTextField(labelWithString: title)
        label.frame = NSRect(x: 14, y: 5, width: 64, height: 18); label.font = .menuFont(ofSize: 0)
        let s = NSSlider(value: defaults.double(forKey: key), minValue: min, maxValue: max, target: self, action: #selector(sliderMoved(_:)))
        s.frame = NSRect(x: 82, y: 3, width: 154, height: 22); s.isContinuous = true; s.identifier = NSUserInterfaceItemIdentifier(key)
        view.addSubview(label); view.addSubview(s); item.view = view
        return item
    }

    // MARK: Actions

    @objc private func toggle(_ item: NSMenuItem) {
        guard let key = item.representedObject as? String else { return }
        let on = !defaults.bool(forKey: key); defaults.set(on, forKey: key)
        switch key {
        case "enabled": if on { startAudio() } else { finishSleep(); startAudio() }
        case "auto": leader?.js("phospheneHost.setAuto(\(on))"); if !on { defaults.set(scene, forKey: "scene") }
        case "songId": leader?.js("phospheneHost.set('songid', \(on))"); views.forEach { $0.js("phospheneHost.set('lyrics', \(lyricsWanted))") }
        case "lyrics": views.forEach { $0.js("phospheneHost.set('lyrics', \(lyricsWanted))") }
        case "skipButton": updateSkipItem()
        case "card": views.forEach { $0.js("phospheneHost.set('card', \(on))") }
        default: break
        }
    }
    @objc private func pickSource(_ item: NSMenuItem) {
        guard let pair = item.representedObject as? [String] else { return }
        defaults.set(pair[0], forKey: "source"); defaults.set(pair[1], forKey: "sourceName")
        loudRun = 0; everLoud = false
        startAudio()
    }
    @objc private func pickScene(_ item: NSMenuItem) {
        guard let i = item.representedObject as? Int else { return }
        defaults.set(false, forKey: "auto"); defaults.set(i, forKey: "scene"); scene = i
        leader?.js("phospheneHost.setAuto(false)")
        views.forEach { $0.js("phospheneHost.setScene(\(i))") }
        announceScene()
    }
    @objc private func nextScene() { step(1) }
    @objc private func previousScene() { step(-1) }
    /// The menu bar skip button: a click goes to the next scene, a right-click or Option-click to the previous one.
    @objc private func skipClicked() {
        let e = NSApp.currentEvent
        step(e?.type == .rightMouseUp || e?.modifierFlags.contains(.option) == true ? -1 : 1)
    }
    private func sceneTitle(_ i: Int) -> String { sceneNames.indices.contains(i) ? String(format: "%02d  %@", i + 1, sceneNames[i]) : "Scene" }
    private func step(_ dir: Int) {
        guard !sceneNames.isEmpty else { return }
        let n = sceneNames.count
        scene = ((scene + dir) % n + n) % n
        if !defaults.bool(forKey: "auto") { defaults.set(scene, forKey: "scene") }
        leader?.js("phospheneHost.go(\(scene))")
        announceScene()
    }
    /// Name the scene where it can be seen: in the open menu, and for a moment at the bottom left of every desktop.
    private func announceScene() {
        let title = sceneTitle(scene)
        stepLabel?.stringValue = title
        skipItem?.button?.toolTip = "Next scene (now \(title)). Right-click for the previous one."
        announce(title)
    }
    private func announce(_ text: String) {
        let quoted = text.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'")
        views.forEach { $0.js("phospheneHost.label('\(quoted)')") }
    }
    private func updateSkipItem() {
        if !defaults.bool(forKey: "skipButton") {
            if let item = skipItem { NSStatusBar.system.removeStatusItem(item); skipItem = nil }
            return
        }
        guard skipItem == nil else { return }
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        let image = NSImage(systemSymbolName: "forward.fill", accessibilityDescription: "Next scene")?
            .withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 11, weight: .regular))
        image?.isTemplate = true
        item.button?.image = image
        item.button?.toolTip = "Next scene. Right-click for the previous one."
        item.button?.target = self; item.button?.action = #selector(skipClicked)
        item.button?.sendAction(on: [.leftMouseUp, .rightMouseUp])
        skipItem = item
    }
    /// A row in the menu that steps through scenes or palettes without closing it.
    private func stepper(_ title: String, previous: Selector, next: Selector, what: String) -> (NSMenuItem, NSTextField) {
        let item = NSMenuItem(), view = NSView(frame: NSRect(x: 0, y: 0, width: 250, height: 30))
        func arrow(_ symbol: String, _ x: CGFloat, _ action: Selector, _ tip: String) -> NSButton {
            let b = NSButton(frame: NSRect(x: x, y: 3, width: 28, height: 24))
            b.image = NSImage(systemSymbolName: symbol, accessibilityDescription: tip); b.imagePosition = .imageOnly
            b.isBordered = false; b.target = self; b.action = action; b.toolTip = tip
            return b
        }
        let label = NSTextField(labelWithString: title)
        label.frame = NSRect(x: 44, y: 6, width: 162, height: 18); label.alignment = .center; label.font = .menuFont(ofSize: 0); label.lineBreakMode = .byTruncatingTail
        view.addSubview(arrow("chevron.left", 12, previous, "Previous \(what)"))
        view.addSubview(label)
        view.addSubview(arrow("chevron.right", 210, next, "Next \(what)"))
        item.view = view
        return (item, label)
    }
    private func paletteTitle(_ i: Int) -> String { paletteNames.indices.contains(i) ? "\(paletteNames[i]) palette" : "Palette" }
    @objc private func nextPalette() { stepPalette(1) }
    @objc private func previousPalette() { stepPalette(-1) }
    /// A pinned palette moves the pin; in the two changing modes this only shows another palette now.
    private func stepPalette(_ dir: Int) {
        guard !paletteNames.isEmpty else { return }
        let n = paletteNames.count
        paletteNow = ((paletteNow + dir) % n + n) % n
        if paletteMode >= 0 {
            defaults.set(paletteNow, forKey: "palette"); views.forEach { $0.js("phospheneHost.setPalette(\(paletteNow))") }
        } else { leader?.js("phospheneHost.showPreset(\(paletteNow))") }
        announce(paletteTitle(paletteNow)); paletteLabel?.stringValue = paletteTitle(paletteNow)
    }
    @objc private func pickPalette(_ item: NSMenuItem) {
        guard let i = item.representedObject as? Int else { return }
        defaults.set(i, forKey: "palette")
        views.forEach { $0.js("phospheneHost.setPalette(\(i))") }
        if i >= 0 { paletteNow = i; announce(paletteTitle(i)) }
    }
    @objc private func pickStay(_ item: NSMenuItem) {
        guard let on = item.representedObject as? Bool else { return }
        defaults.set(on, forKey: "stayOn")
        views.forEach { $0.js("phospheneHost.set('stayOn', \(on))") }
    }
    @objc private func pickFps(_ item: NSMenuItem) {
        guard let fps = item.representedObject as? Int else { return }
        defaults.set(fps, forKey: "fps"); views.forEach { $0.js("phospheneHost.set('fps', \(fps))") }
    }
    @objc private func pickDisplays(_ item: NSMenuItem) {
        guard let all = item.representedObject as? Bool, all != defaults.bool(forKey: "allDisplays") else { return }
        defaults.set(all, forKey: "allDisplays"); buildViews()
    }
    @objc private func sliderMoved(_ s: NSSlider) {
        guard let key = s.identifier?.rawValue else { return }
        defaults.set(s.doubleValue, forKey: key)
        views.forEach { $0.js("phospheneHost.set('\(key)', \(s.doubleValue))") }
    }
    @objc private func toggleLogin() {
        do { if SMAppService.mainApp.status == .enabled { try SMAppService.mainApp.unregister() } else { try SMAppService.mainApp.register() } }
        catch { NSSound.beep() }
    }
    @objc private func openPermission() {
        NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture")!)
    }
    @objc private func quit() { NSApp.terminate(nil) }

    // MARK: Self-test

    /// Opens the menu, saves pictures of this app's own windows (an app may always capture itself), and closes it.
    private func shootMenu() {
        guard let dir = menuShot else { return }
        let t = Timer(timeInterval: 1.5, repeats: false) { [weak self] _ in
            self?.captureOwnWindows(to: dir)
            self?.menu.cancelTracking()
        }
        RunLoop.main.add(t, forMode: .common)
        status.button?.performClick(nil)                       // blocks while the menu is open; the timer above runs meanwhile
    }
    private func captureOwnWindows(to dir: String) {
        typealias Capture = @convention(c) (CGRect, UInt32, UInt32, UInt32) -> Unmanaged<CGImage>?
        guard let sym = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGWindowListCreateImage") else { return }
        let capture = unsafeBitCast(sym, to: Capture.self)
        func save(_ image: CGImage?, _ name: String) {
            guard let image, let data = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else { return }
            try? data.write(to: URL(fileURLWithPath: dir).appendingPathComponent(name))
        }
        let pid = ProcessInfo.processInfo.processIdentifier
        let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
        var report: [String] = []
        for w in list where (w[kCGWindowLayer as String] as? Int ?? 0) >= 24 {                    // who owns the menu, if not this app
            let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
            report.append("other \(w[kCGWindowOwnerName as String] ?? "?") layer \(w[kCGWindowLayer as String] ?? 0) \(b["X"] ?? 0),\(b["Y"] ?? 0) \(b["Width"] ?? 0)x\(b["Height"] ?? 0)")
        }
        for w in list where (w[kCGWindowOwnerPID as String] as? pid_t) == pid {
            let layer = w[kCGWindowLayer as String] as? Int ?? 0, num = w[kCGWindowNumber as String] as? UInt32 ?? 0
            let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
            report.append("window \(num) layer \(layer) bounds \(b["X"] ?? 0),\(b["Y"] ?? 0) \(b["Width"] ?? 0)x\(b["Height"] ?? 0)")
            if layer > 0 { save(capture(.null, 8, num, 1 | 8)?.takeRetainedValue(), "window-\(layer)-\(num).png") }   // this window alone, at full resolution
        }
        // everything this app may see on the main display: its own windows over a blank desktop, with the system menu bar
        if let main = NSScreen.screens.first, let id = (main.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value {
            save(capture(CGDisplayBounds(id), 1, 0, 8)?.takeRetainedValue(), "display.png")
        }
        try? report.joined(separator: "\n").write(toFile: dir + "/windows.txt", atomically: true, encoding: .utf8)
    }

    private static func decode(_ path: String, rate: inout Double) -> [Float] {
        guard let file = try? AVAudioFile(forReading: URL(fileURLWithPath: path)),
              let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)),
              (try? file.read(into: buffer)) != nil, let data = buffer.floatChannelData else { return [] }
        rate = file.processingFormat.sampleRate
        let n = Int(buffer.frameLength), ch = Int(file.processingFormat.channelCount)
        var mono = [Float](repeating: 0, count: n)
        for c in 0..<ch { for i in 0..<n { mono[i] += data[c][i] / Float(ch) } }
        return mono
    }

    private func writeStatus() {
        guard let path = statusFile else { return }
        let native: [String: Any] = [
            "mode": mode.rawValue, "level": Double(level), "everLoud": everLoud, "source": source, "tapRunning": tap.running,
            "tapError": tap.lastError ?? NSNull(), "engineErrors": engineErrors, "rate": tap.sampleRate, "views": views.count, "ready": views.filter { $0.ready }.count,
            "visible": views.map { $0.visible }, "covered": views.map { covered($0) },
            "ordered": views.map { $0.window.isVisible }, "screens": views.map { $0.screen.localizedName }, "audioApps": CoreAudioQuery.apps().map { "\($0.name)\($0.playing ? "*" : "")" },
        ]
        let write: (Any?) -> Void = { engine in
            let out: [String: Any] = ["native": native, "engine": (engine as? String).flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) } ?? NSNull()]
            if let data = try? JSONSerialization.data(withJSONObject: out, options: [.prettyPrinted, .sortedKeys]) { try? data.write(to: URL(fileURLWithPath: path)) }
        }
        // every display's engine, the leader first in the "engine" slot
        var states: [String] = [], queue = views.filter { $0.ready }
        func next() {
            guard !queue.isEmpty else {
                let all = states.compactMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) }
                var out: [String: Any] = ["native": native, "engine": all.first ?? NSNull(), "engines": all]
                out["leader"] = self.leader.map { $0.screen.localizedName } ?? NSNull()
                if let data = try? JSONSerialization.data(withJSONObject: out, options: [.prettyPrinted, .sortedKeys]) { try? data.write(to: URL(fileURLWithPath: path)) }
                return
            }
            let v = queue.removeFirst()
            v.js("JSON.stringify({ screen: \"\(v.screen.localizedName)\", ...phospheneHost.state(), pixel: phospheneHost.pixel() })") { value in
                if let s = value as? String { states.append(s) }
                next()
            }
        }
        if queue.isEmpty { write(nil) } else { next() }
    }

    private func grab() {
        guard let path = grabFile, let v = views.first else { return }
        v.js("phospheneHost.grab()") { value in
            guard let url = value as? String, let comma = url.firstIndex(of: ","), let data = Data(base64Encoded: String(url[url.index(after: comma)...])) else { return }
            try? data.write(to: URL(fileURLWithPath: path))
        }
    }
}
