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

    // MARK: Launch

    func applicationDidFinishLaunching(_ note: Notification) {
        defaults.register(defaults: [
            "enabled": true, "source": "system", "sourceName": "", "auto": true, "scene": 0, "palette": -1,
            "opacity": 1.0, "goo": 0.5, "melody": 1.0, "fps": 60, "allDisplays": true, "songId": true, "card": false, "stayOn": false,
        ])
        var args = Array(CommandLine.arguments.dropFirst())
        while !args.isEmpty {
            let a = args.removeFirst()
            if a == "--status-file", !args.isEmpty { statusFile = args.removeFirst() }
            else if a == "--grab", !args.isEmpty { grabFile = args.removeFirst() }
            else if a == "--grab-after", !args.isEmpty { grabAfter = Double(args.removeFirst()) ?? 8 }
            else if a == "--test-wake" { testWake = true }
            else if a == "--test-ignore-cover" { ignoreCover = true }
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

        buildViews()
        startAudio()

        every(1.0 / 60) { [weak self] in self?.pump() }
        every(3) { [weak self] in self?.followApp() }
        every(1) { [weak self] in self?.checkCover() }
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
    }
    @objc private func displaysSlept() { screensAsleep = true; views.forEach { $0.js("phospheneHost.setPaused(true)") } }
    @objc private func displaysWoke() { screensAsleep = false; if mode != .asleep { views.forEach { $0.js("phospheneHost.setPaused(\(!$0.visible))") } } }

    private func handle(_ view: WallpaperView, _ msg: [String: Any]) {
        let primary = view === views.first
        switch msg["type"] as? String {
        case "ready":
            if primary {
                sceneNames = msg["scenes"] as? [String] ?? []; paletteNames = msg["palettes"] as? [String] ?? []
            }
            applySettings(view)
            if mode == .awake || (enabled && stayOn) { mode = .awake; view.show(); view.js("phospheneHost.wake(2)") }
        case "scene":
            guard primary, let i = msg["index"] as? Int else { return }
            scene = i
            if !defaults.bool(forKey: "auto") { defaults.set(i, forKey: "scene") }
            views.dropFirst().forEach { $0.js("phospheneHost.setScene(\(i))") }      // other displays follow the first
        case "asleep":
            if mode == .falling { finishSleep() }
        case "error":
            let text = msg["message"] as? String ?? "?"
            NSLog("Phosphene engine error: %@", text)
            if !engineErrors.contains(text) { engineErrors.append(text); if engineErrors.count > 8 { engineErrors.removeFirst() } }
        default: break
        }
    }

    private func applySettings(_ view: WallpaperView) {
        let primary = view === views.first, d = defaults
        var js = ""
        for key in ["opacity", "goo", "melody"] { js += "phospheneHost.set('\(key)', \(d.double(forKey: key)));" }
        js += "phospheneHost.set('fps', \(d.integer(forKey: "fps")));"
        js += "phospheneHost.set('songid', \(primary && d.bool(forKey: "songId")));"
        js += "phospheneHost.set('card', \(d.bool(forKey: "card")));"
        js += "phospheneHost.set('stayOn', \(stayOn));"
        js += "phospheneHost.setAuto(\(primary && d.bool(forKey: "auto")));"
        if !d.bool(forKey: "auto") { js += "phospheneHost.setScene(\(d.integer(forKey: "scene")));" } else if !primary { js += "phospheneHost.setScene(\(scene));" }
        if d.integer(forKey: "palette") >= 0 { js += "phospheneHost.setPalette(\(d.integer(forKey: "palette")));" }
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
        case .asleep: if loudRun >= 0.8 || stayOn { wake() }          // most of a second of sound, so a notification ping does not count
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

    private func wake() {
        mode = .awake
        for v in views {
            v.visible = !covered(v)
            v.show(); v.js("phospheneHost.wake(3.5)")
            if !v.visible { v.js("phospheneHost.setPaused(true)") }     // behind a full-screen app: wait until the desktop shows
        }
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

        let scenes = submenu(menu, "Scene")
        add(scenes, "Change with the music", #selector(toggle(_:)), on: d.bool(forKey: "auto"), key: "auto")
        add(scenes, "Next scene", #selector(nextScene))
        scenes.addItem(.separator())
        for (i, name) in sceneNames.enumerated() { add(scenes, String(format: "%02d  %@", i + 1, name), #selector(pickScene(_:)), on: i == scene, represented: i) }

        let palettes = submenu(menu, "Palette")
        add(palettes, "Rotate with the scenes", #selector(pickPalette(_:)), on: d.integer(forKey: "palette") < 0, represented: -1)
        palettes.addItem(.separator())
        for (i, name) in paletteNames.enumerated() { add(palettes, name, #selector(pickPalette(_:)), on: d.integer(forKey: "palette") == i, represented: i) }

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
        add(menu, "Name the song (Song ID)", #selector(toggle(_:)), on: d.bool(forKey: "songId"), key: "songId")
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
        case "auto": views.first?.js("phospheneHost.setAuto(\(on))"); if !on { defaults.set(scene, forKey: "scene") }
        case "songId": views.first?.js("phospheneHost.set('songid', \(on))")
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
        views.first?.js("phospheneHost.setAuto(false)")
        views.forEach { $0.js("phospheneHost.setScene(\(i))") }
    }
    @objc private func nextScene() { views.first?.js("phospheneHost.next()") }
    @objc private func pickPalette(_ item: NSMenuItem) {
        guard let i = item.representedObject as? Int else { return }
        defaults.set(i, forKey: "palette")
        if i >= 0 { views.forEach { $0.js("phospheneHost.setPalette(\(i))") } }
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
        if let v = views.first, v.ready { v.js("JSON.stringify({ ...phospheneHost.state(), pixel: phospheneHost.pixel() })", done: write) } else { write(nil) }
    }

    private func grab() {
        guard let path = grabFile, let v = views.first else { return }
        v.js("phospheneHost.grab()") { value in
            guard let url = value as? String, let comma = url.firstIndex(of: ","), let data = Data(base64Encoded: String(url[url.index(after: comma)...])) else { return }
            try? data.write(to: URL(fileURLWithPath: path))
        }
    }
}
