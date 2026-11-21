// One screen's worth of wallpaper: a borderless, click-through window at desktop
// level (behind the icons) holding a transparent web view that runs the same
// engine as the website. The engine's files are served from the app bundle
// under a private URL scheme; Song ID and album art are relayed to the website,
// and lyrics are looked up here directly.

import AppKit
import WebKit

/// Serves phosphene://app/... : the engine's files, wallpaper copies, and the API relay.
final class EngineScheme: NSObject, WKURLSchemeHandler {
    static let scheme = "phosphene"
    static let apiBase = URL(string: "https://phosphene-viz.vercel.app")!
    private let root: URL
    private var live = Set<ObjectIdentifier>()
    var backdrops: [String: Data] = [:]              // "backdrop/<display id>.jpg" -> JPEG

    init(root: URL) { self.root = root }

    private static let types: [String: String] = [
        "html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "mjs": "text/javascript; charset=utf-8",
        "css": "text/css; charset=utf-8", "svg": "image/svg+xml", "png": "image/png", "jpg": "image/jpeg", "json": "application/json",
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        let id = ObjectIdentifier(task); live.insert(id)
        var path = url.path
        if path.hasPrefix("/") { path.removeFirst() }
        if path.isEmpty { path = "index.html" }

        if path == "api/lyrics" { lyrics(task, id: id, query: url.query); return }
        if path.hasPrefix("api/") { relay(task, id: id, path: path, query: url.query); return }
        if let data = backdrops[path] { respond(task, id: id, status: 200, type: "image/jpeg", data: data); return }

        let file = root.appendingPathComponent(path).standardizedFileURL
        guard file.path.hasPrefix(root.standardizedFileURL.path), let data = try? Data(contentsOf: file) else {
            respond(task, id: id, status: 404, type: "text/plain", data: Data("not found".utf8)); return
        }
        respond(task, id: id, status: 200, type: Self.types[file.pathExtension.lowercased()] ?? "application/octet-stream", data: data)
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) { live.remove(ObjectIdentifier(task)) }

    private func respond(_ task: WKURLSchemeTask, id: ObjectIdentifier, status: Int, type: String, data: Data) {
        guard live.contains(id), let url = task.request.url else { return }
        live.remove(id)
        let headers = ["Content-Type": type, "Content-Length": String(data.count), "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"]
        guard let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers) else { return }
        task.didReceive(response); task.didReceive(data); task.didFinish()
    }

    /// Song ID and album art go through the website's functions, server to server.
    private func relay(_ task: WKURLSchemeTask, id: ObjectIdentifier, path: String, query: String?) {
        var comps = URLComponents(url: Self.apiBase.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        comps.percentEncodedQuery = query
        var req = URLRequest(url: comps.url!, timeoutInterval: 20)
        req.httpMethod = task.request.httpMethod ?? "GET"
        if let body = task.request.httpBody { req.httpBody = body }
        else if let stream = task.request.httpBodyStream {
            stream.open(); var data = Data(); var buf = [UInt8](repeating: 0, count: 16384)
            while stream.hasBytesAvailable { let n = stream.read(&buf, maxLength: buf.count); if n <= 0 { break }; data.append(buf, count: n) }
            stream.close(); req.httpBody = data
        }
        if let type = task.request.value(forHTTPHeaderField: "Content-Type") { req.setValue(type, forHTTPHeaderField: "Content-Type") }
        URLSession.shared.dataTask(with: req) { [weak self] data, response, _ in
            let http = response as? HTTPURLResponse
            DispatchQueue.main.async {
                self?.respond(task, id: id, status: http?.statusCode ?? 502, type: http?.value(forHTTPHeaderField: "Content-Type") ?? "application/json", data: data ?? Data("{\"error\":\"offline\"}".utf8))
            }
        }.resume()
    }

    /// Lyrics are answered here, not relayed: LRCLIB is asked directly and the reply has the shape api/lyrics.js gives.
    private func lyrics(_ task: WKURLSchemeTask, id: ObjectIdentifier, query: String?) {
        var params: [String: String] = [:]                 // the page sends form encoding: + is a space
        for pair in (query ?? "").split(separator: "&") {
            let kv = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false).map { String($0).replacingOccurrences(of: "+", with: " ").removingPercentEncoding ?? "" }
            if kv.count == 2 { params[kv[0]] = kv[1].trimmingCharacters(in: .whitespacesAndNewlines) }
        }
        let finish: (Int, Any) -> Void = { [weak self] status, object in
            let data = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8)
            DispatchQueue.main.async { self?.respond(task, id: id, status: status, type: "application/json", data: data) }
        }
        let title = params["title"] ?? "", artist = params["artist"] ?? "", duration = (Double(params["duration"] ?? "") ?? 0).rounded()
        guard !title.isEmpty, title.count <= 200, artist.count <= 200, duration >= 0, duration <= 7200 else { finish(400, ["error": "bad song"]); return }
        LyricLookup.find(title: title, artist: artist, duration: duration) { found in
            if let found { finish(200, found) } else { finish(502, ["error": "offline"]) }
        }
    }
}

/// The same lookup as api/lyrics.js, for the Mac app: one search on LRCLIB (free, no key), the version whose length
/// is nearest the song's, and synced versions of other lengths beside it. Keep the two in step.
enum LyricLookup {
    private static let agent = "Phosphene visualizer"
    private typealias Row = [String: Any]

    static func find(title: String, artist: String, duration: Double, done: @escaping ([String: Any]?) -> Void) {
        search(title, artist) { rows in
            guard let rows else { done(nil); return }
            let first = pick(rows, title: title, duration: duration)
            let t2 = clean(title), a2 = firstArtist(artist)
            guard first["lyrics"] is NSNull, !t2.isEmpty, t2 != title || a2 != artist else { done(first); return }
            search(t2, a2) { again in done(again.map { pick($0, title: title, duration: duration) } ?? first) }   // once more, without "(feat. …)" and the rest
        }
    }

    private static func search(_ title: String, _ artist: String, done: @escaping ([Row]?) -> Void) {
        var comps = URLComponents(string: "https://lrclib.net/api/search")!
        var safe = CharacterSet.alphanumerics; safe.insert(charactersIn: "-._~")
        let enc: (String) -> String = { $0.addingPercentEncoding(withAllowedCharacters: safe) ?? "" }
        comps.percentEncodedQuery = "track_name=\(enc(title))&artist_name=\(enc(artist))"
        var req = URLRequest(url: comps.url!, timeoutInterval: 8)
        req.setValue(agent, forHTTPHeaderField: "User-Agent"); req.setValue("application/json", forHTTPHeaderField: "Accept")
        URLSession.shared.dataTask(with: req) { data, response, _ in
            guard (response as? HTTPURLResponse)?.statusCode == 200, let data, let rows = try? JSONSerialization.jsonObject(with: data) as? [Row] else { done(nil); return }
            done(rows)
        }.resume()
    }

    private static func swap(_ s: String, _ pattern: String, _ with: String) -> String { s.replacingOccurrences(of: pattern, with: with, options: [.regularExpression, .caseInsensitive]) }
    /// "Song (feat. X) - Remastered 2011" -> "Song"
    private static func clean(_ s: String) -> String { swap(swap(s, "\\s*[(\\[][^)\\]]*[)\\]]", ""), "\\s+-\\s+.*$", "").trimmingCharacters(in: .whitespaces) }
    private static func firstArtist(_ s: String) -> String {
        (swap(s, ",|&|;|\\s+(?:feat\\.?|ft\\.?|featuring|with|x)\\s+", "\u{1}").split(separator: "\u{1}", omittingEmptySubsequences: false).first.map(String.init) ?? "").trimmingCharacters(in: .whitespaces)
    }
    private static func norm(_ s: String) -> String {
        swap(s.folding(options: [.diacriticInsensitive, .caseInsensitive, .widthInsensitive], locale: nil), "[^\\p{L}\\p{N}]+", " ").trimmingCharacters(in: .whitespaces)
    }
    private static func key(_ s: String) -> String { let k = norm(clean(s)); return k.isEmpty ? norm(s) : k }

    private static func pick(_ rows: [Row], title: String, duration: Double) -> [String: Any] {
        let want = key(title)
        let same = rows.filter { let t = key($0["trackName"] as? String ?? ""); return !t.isEmpty && (t == want || t.hasPrefix(want) || want.hasPrefix(t)) }
        func length(_ r: Row) -> Double { (r["duration"] as? NSNumber)?.doubleValue ?? 0 }
        func far(_ r: Row) -> Double { duration > 0 && length(r) > 0 ? abs(length(r) - duration) : 0 }
        func text(_ r: Row, _ field: String) -> String? {
            guard (r["instrumental"] as? Bool) != true, let s = r[field] as? String, !s.isEmpty else { return nil }
            return s
        }
        func byLength(_ field: String) -> [Row] {
            same.filter { text($0, field) != nil }.enumerated().sorted { far($0.element) != far($1.element) ? far($0.element) < far($1.element) : $0.offset < $1.offset }.map { $0.element }
        }
        func seconds(_ r: Row) -> Any { length(r) > 0 ? length(r) : NSNull() }
        let synced = byLength("syncedLyrics")
        if let best = synced.first, let words = text(best, "syncedLyrics") {
            var alts: [[String: Any]] = [], seen: Set<String> = [words]
            for r in synced {
                guard alts.count < 4, let s = text(r, "syncedLyrics"), length(r) > 0, length(best) > 0, abs(length(r) - length(best)) > 4, !seen.contains(s) else { continue }
                seen.insert(s); alts.append(["synced": s, "duration": length(r)])
            }
            return ["lyrics": ["synced": words, "plain": NSNull(), "duration": seconds(best)] as [String: Any], "alts": alts]
        }
        if let plain = byLength("plainLyrics").first, let words = text(plain, "plainLyrics") {
            return ["lyrics": ["synced": NSNull(), "plain": words, "duration": seconds(plain)] as [String: Any], "alts": [[String: Any]]()]
        }
        return ["lyrics": NSNull(), "alts": [[String: Any]]()]
    }
}

/// The desktop window. As a screen saver it rises above everything and takes the keyboard, so the key press
/// or click that dismisses it goes nowhere else.
final class WallpaperWindow: NSWindow {
    var takesKeys = false
    override var canBecomeKey: Bool { takesKeys }
    override var canBecomeMain: Bool { false }
}

final class WallpaperView: NSObject, WKScriptMessageHandler {
    let screen: NSScreen
    let window: WallpaperWindow
    let web: WKWebView
    private(set) var ready = false
    var visible = true                                   // false while a full-screen app or the lock screen covers it
    var onMessage: ((WallpaperView, [String: Any]) -> Void)?

    var displayID: String { String((screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0) }

    init(screen: NSScreen, scheme: EngineScheme) {
        self.screen = screen
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(scheme, forURLScheme: EngineScheme.scheme)
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        web = WKWebView(frame: NSRect(origin: .zero, size: screen.frame.size), configuration: config)
        web.setValue(false, forKey: "drawsBackground")              // the desktop shows through wherever the engine leaves it clear
        web.autoresizingMask = [.width, .height]
        if #available(macOS 13.3, *) { web.isInspectable = true }
        // macOS reports desktop-level windows as occluded even when the desktop is in plain view, and WebKit
        // stops animation frames for a page it believes hidden. Turn that inference off for this view; the app
        // decides for itself when the desktop is covered (see AppDelegate.covered).
        let occlusion = NSSelectorFromString("_setWindowOcclusionDetectionEnabled:")
        if web.responds(to: occlusion) {
            typealias Setter = @convention(c) (AnyObject, Selector, Bool) -> Void
            unsafeBitCast(web.method(for: occlusion), to: Setter.self)(web, occlusion, false)
        }

        window = WallpaperWindow(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
        window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopWindow)))   // above the wallpaper, below the icons
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenNone]
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.ignoresMouseEvents = true
        window.isReleasedWhenClosed = false
        window.contentView = web
        window.setFrame(screen.frame, display: false)
        super.init()
        config.userContentController.add(self, name: "phosphene")
        web.load(URLRequest(url: URL(string: "\(EngineScheme.scheme)://app/index.html?wallpaper=1")!))
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        if body["type"] as? String == "ready" { ready = true }
        onMessage?(self, body)
    }

    func js(_ script: String, done: ((Any?) -> Void)? = nil) {
        guard ready else { done?(nil); return }
        web.evaluateJavaScript(script) { value, _ in done?(value) }
    }

    /// What the menu bar and the Dock take from each edge of this screen: top, right, bottom, left.
    var insets: [Int] {
        let now = NSScreen.screens.first { ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == UInt32(displayID) } ?? screen
        let f = now.frame, v = now.visibleFrame
        return [f.maxY - v.maxY, f.maxX - v.maxX, v.minY - f.minY, v.minX - f.minX].map { max(0, Int($0.rounded())) }
    }

    /// Screen saver on: above every window, the Dock and the menu bar, on every Space. Off: back under the icons.
    func setSaver(_ on: Bool) {
        window.level = on ? .screenSaver : NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopWindow)))
        window.collectionBehavior = on ? [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]
                                       : [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenNone]
        window.ignoresMouseEvents = !on
        window.takesKeys = on
        window.backgroundColor = on ? .black : .clear
        window.isOpaque = on
    }

    func show() { window.setFrame(screen.frame, display: false); window.orderFrontRegardless() }
    func hide() { window.orderOut(nil) }

    func close() {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "phosphene")
        web.stopLoading(); window.orderOut(nil); window.close()
    }
}
