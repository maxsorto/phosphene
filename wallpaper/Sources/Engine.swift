// One screen's worth of wallpaper: a borderless, click-through window at desktop
// level (behind the icons) holding a transparent web view that runs the same
// engine as the website. The engine's files are served from the app bundle
// under a private URL scheme; its two API calls are relayed to the website.

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
}

final class WallpaperView: NSObject, WKScriptMessageHandler {
    let screen: NSScreen
    let window: NSWindow
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

        window = NSWindow(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
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

    func show() { window.setFrame(screen.frame, display: false); window.orderFrontRegardless() }
    func hide() { window.orderOut(nil) }

    func close() {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "phosphene")
        web.stopLoading(); window.orderOut(nil); window.close()
    }
}
