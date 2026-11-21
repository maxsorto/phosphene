import AppKit
import Sparkle

/// Software updates, through Sparkle (https://sparkle-project.org).
///
/// Once a day the app reads the appcast that comes with the newest GitHub release
/// (SUFeedURL in Info.plist). An update is a zip signed with the project's EdDSA key; Sparkle refuses
/// anything whose signature does not match SUPublicEDKey, downloads it, swaps the app in place and relaunches.
///
/// A menu bar app is never "in front", so a scheduled check does not throw a window at the user: it
/// waits quietly (a gentle reminder). The menu grows an "Update to x.y…" item and the desktop says so
/// once. Choosing the item, or "Check for Updates…", shows Sparkle's own window with the release notes.
final class Updates: NSObject, SPUUpdaterDelegate, SPUStandardUserDriverDelegate {
    private(set) var controller: SPUStandardUpdaterController!
    /// The version a scheduled check found and has not shown yet.
    private(set) var waiting: String?
    private var testFeed: String?, testInstall = false
    private var told: Set<String> = []
    var onWaiting: ((String) -> Void)?

    /// testFeed: read this appcast instead (self-test). testInstall: download at once and install without asking.
    func start(testFeed: String?, testInstall: Bool) {
        self.testFeed = testFeed; self.testInstall = testInstall
        controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: self, userDriverDelegate: self)
        controller.updater.clearFeedURLFromUserDefaults()
        if testInstall {
            controller.updater.automaticallyDownloadsUpdates = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in self?.controller.updater.checkForUpdatesInBackground() }
        }
    }

    var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?" }

    /// "Check for Updates…" and "Update to x.y…": Sparkle's window, brought to the front.
    @objc func check(_ sender: Any?) {
        NSApp.activate(ignoringOtherApps: true)
        controller.checkForUpdates(sender)
    }
    var canCheck: Bool { controller?.updater.canCheckForUpdates ?? false }

    // MARK: SPUUpdaterDelegate

    func feedURLString(for updater: SPUUpdater) -> String? { testFeed }

    /// Self-test only: install the downloaded update straight away instead of waiting for the app to quit.
    func updater(_ updater: SPUUpdater, willInstallUpdateOnQuit item: SUAppcastItem, immediateInstallationBlock immediateInstallHandler: @escaping () -> Void) -> Bool {
        guard testInstall else { return false }
        immediateInstallHandler()
        return true
    }

    // MARK: SPUStandardUserDriverDelegate (gentle reminders)

    var supportsGentleScheduledUpdateReminders: Bool { true }

    /// A scheduled check found an update: never pop a window over someone's work; the menu shows it instead.
    func standardUserDriverShouldHandleShowingScheduledUpdate(_ update: SUAppcastItem, andInImmediateFocus immediateFocus: Bool) -> Bool { false }

    func standardUserDriverWillHandleShowingUpdate(_ handleShowingUpdate: Bool, forUpdate update: SUAppcastItem, state: SPUUserUpdateState) {
        guard !state.userInitiated, !handleShowingUpdate else { return }
        waiting = update.displayVersionString
        if told.insert(update.displayVersionString).inserted { onWaiting?(update.displayVersionString) }
    }
    func standardUserDriverDidReceiveUserAttention(forUpdate update: SUAppcastItem) { waiting = nil }
    func standardUserDriverWillFinishUpdateSession() { waiting = nil }
}
