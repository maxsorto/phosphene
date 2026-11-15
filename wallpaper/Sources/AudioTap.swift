// Listens to what the Mac is playing: everything, or one app (Spotify, Music,
// a browser). Uses Core Audio process taps (macOS 14.2+), which need the
// "System Audio Recording" permission but no driver, no screen recording and no
// change of output device. Samples are mixed to mono and handed to the engine.

import AppKit
import CoreAudio
import AudioToolbox

/// One process that has registered with the audio system.
struct AudioProcess {
    let object: AudioObjectID
    let pid: pid_t
    let bundleID: String
    let playing: Bool
}

/// A running app that owns one or more audio processes (its own, or helpers).
struct AudioApp {
    let name: String
    let bundleID: String
    let icon: NSImage?
    let playing: Bool
    let objects: [AudioObjectID]
}

enum CoreAudioQuery {
    static let system = AudioObjectID(kAudioObjectSystemObject)

    static func address(_ selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
        AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    }

    static func value<T>(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector, _ initial: T) -> T? {
        var addr = address(selector), size = UInt32(MemoryLayout<T>.size), out = initial
        let err = withUnsafeMutablePointer(to: &out) { AudioObjectGetPropertyData(object, &addr, 0, nil, &size, $0) }
        return err == noErr ? out : nil
    }

    static func string(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector) -> String? {
        var addr = address(selector), size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        var ref: Unmanaged<CFString>?
        let err = withUnsafeMutablePointer(to: &ref) { AudioObjectGetPropertyData(object, &addr, 0, nil, &size, $0) }
        guard err == noErr, let r = ref else { return nil }
        return r.takeRetainedValue() as String
    }

    static func objects(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector) -> [AudioObjectID] {
        var addr = address(selector), size: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(object, &addr, 0, nil, &size) == noErr, size > 0 else { return [] }
        var ids = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
        guard AudioObjectGetPropertyData(object, &addr, 0, nil, &size, &ids) == noErr else { return [] }
        return ids
    }

    static func processes() -> [AudioProcess] {
        objects(system, kAudioHardwarePropertyProcessObjectList).compactMap { obj in
            guard let pid = value(obj, kAudioProcessPropertyPID, pid_t(0)) else { return nil }
            let playing = (value(obj, kAudioProcessPropertyIsRunningOutput, UInt32(0)) ?? 0) != 0
            return AudioProcess(object: obj, pid: pid, bundleID: string(obj, kAudioProcessPropertyBundleID) ?? "", playing: playing)
        }
    }

    static func parent(of pid: pid_t) -> pid_t {
        var info = kinfo_proc(), size = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, pid]
        guard sysctl(&mib, 4, &info, &size, nil, 0) == 0, size > 0 else { return 0 }
        return info.kp_eproc.e_ppid
    }

    /// Does `pid` descend from `ancestor`? (Browsers and Electron apps play audio from helper processes.)
    static func descends(_ pid: pid_t, from ancestor: pid_t) -> Bool {
        var p = pid
        for _ in 0..<5 { if p == ancestor { return true }; if p <= 1 { return false }; p = parent(of: p) }
        return false
    }

    /// Apps the user would recognise, each with the audio processes that belong to it.
    static func apps() -> [AudioApp] {
        let procs = processes(), me = Bundle.main.bundleIdentifier
        var out: [AudioApp] = []
        for app in NSWorkspace.shared.runningApplications where app.activationPolicy == .regular {
            guard let bid = app.bundleIdentifier, bid != me else { continue }
            let mine = procs.filter { $0.pid == app.processIdentifier || $0.bundleID == bid || $0.bundleID.hasPrefix(bid + ".") || descends($0.pid, from: app.processIdentifier) }
            guard !mine.isEmpty else { continue }
            out.append(AudioApp(name: app.localizedName ?? bid, bundleID: bid, icon: app.icon, playing: mine.contains { $0.playing }, objects: mine.map { $0.object }))
        }
        return out.sorted { $0.playing != $1.playing ? $0.playing : $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    static func defaultOutputUID() -> String? {
        guard let dev = value(system, kAudioHardwarePropertyDefaultOutputDevice, AudioObjectID(0)), dev != 0 else { return nil }
        return string(dev, kAudioDevicePropertyDeviceUID)
    }
}

final class AudioTap {
    private var tapID = AudioObjectID(kAudioObjectUnknown)
    private var aggregateID = AudioObjectID(kAudioObjectUnknown)
    private var procID: AudioDeviceIOProcID?
    private let queue = DispatchQueue(label: "phosphene.audio-tap", qos: .userInteractive)
    private var lock = os_unfair_lock()
    private var pending: [Float] = []
    private(set) var sampleRate: Double = 48000
    private(set) var running = false
    private(set) var lastError: String?

    /// Start listening. `objects` nil means everything the Mac plays; otherwise those processes only.
    @discardableResult
    func start(objects: [AudioObjectID]?) -> Bool {
        stop()
        lastError = nil
        let desc: CATapDescription
        if let objects { desc = CATapDescription(stereoMixdownOfProcesses: objects) }
        else { desc = CATapDescription(stereoGlobalTapButExcludeProcesses: []) }
        desc.uuid = UUID()
        desc.name = "Phosphene"
        desc.isPrivate = true
        desc.muteBehavior = .unmuted

        var tap = AudioObjectID(kAudioObjectUnknown)
        var err = AudioHardwareCreateProcessTap(desc, &tap)
        guard err == noErr, tap != kAudioObjectUnknown else { return fail("could not create the audio tap (\(err))") }
        tapID = tap

        if let fmt = CoreAudioQuery.value(tapID, kAudioTapPropertyFormat, AudioStreamBasicDescription()), fmt.mSampleRate > 0 {
            sampleRate = fmt.mSampleRate
        }
        guard let outputUID = CoreAudioQuery.defaultOutputUID() else { return fail("no output device") }
        // A private aggregate device that carries the tap, clocked by the real output.
        let aggregate: [String: Any] = [
            kAudioAggregateDeviceNameKey: "Phosphene Tap",
            kAudioAggregateDeviceUIDKey: UUID().uuidString,
            kAudioAggregateDeviceMainSubDeviceKey: outputUID,
            kAudioAggregateDeviceIsPrivateKey: true,
            kAudioAggregateDeviceIsStackedKey: false,
            kAudioAggregateDeviceTapAutoStartKey: true,
            kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: outputUID]],
            kAudioAggregateDeviceTapListKey: [[kAudioSubTapDriftCompensationKey: true, kAudioSubTapUIDKey: desc.uuid.uuidString]],
        ]
        err = AudioHardwareCreateAggregateDevice(aggregate as CFDictionary, &aggregateID)
        guard err == noErr else { return fail("could not create the tap device (\(err))") }

        err = AudioDeviceCreateIOProcIDWithBlock(&procID, aggregateID, queue) { [weak self] _, input, _, _, _ in
            self?.receive(input)
        }
        guard err == noErr else { return fail("could not attach to the tap (\(err))") }
        err = AudioDeviceStart(aggregateID, procID)
        guard err == noErr else { return fail("could not start the tap (\(err))") }
        running = true
        return true
    }

    func stop() {
        if aggregateID != kAudioObjectUnknown {
            if let procID { AudioDeviceStop(aggregateID, procID); AudioDeviceDestroyIOProcID(aggregateID, procID) }
            AudioHardwareDestroyAggregateDevice(aggregateID)
        }
        if tapID != kAudioObjectUnknown { AudioHardwareDestroyProcessTap(tapID) }
        procID = nil; aggregateID = AudioObjectID(kAudioObjectUnknown); tapID = AudioObjectID(kAudioObjectUnknown)
        running = false
        os_unfair_lock_lock(&lock); pending.removeAll(keepingCapacity: true); os_unfair_lock_unlock(&lock)
    }

    private func fail(_ message: String) -> Bool { lastError = message; stop(); lastError = message; return false }

    /// Audio thread: mix every channel of every buffer to mono (the tap delivers 32-bit floats).
    private func receive(_ input: UnsafePointer<AudioBufferList>) {
        let list = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input))
        var frames = 0, channels = 0
        for b in list where b.mNumberChannels > 0 {
            frames = max(frames, Int(b.mDataByteSize) / (4 * Int(b.mNumberChannels))); channels += Int(b.mNumberChannels)
        }
        guard frames > 0, channels > 0 else { return }
        var mono = [Float](repeating: 0, count: frames)
        for b in list {
            let ch = Int(b.mNumberChannels)
            guard ch > 0, let data = b.mData?.assumingMemoryBound(to: Float32.self) else { continue }
            let n = min(frames, Int(b.mDataByteSize) / (4 * ch))
            for f in 0..<n { var s: Float = 0; for c in 0..<ch { s += data[f * ch + c] }; mono[f] += s }
        }
        let scale = 1 / Float(channels)
        for i in 0..<frames { mono[i] *= scale }
        os_unfair_lock_lock(&lock)
        pending.append(contentsOf: mono)
        if pending.count > 96000 { pending.removeFirst(pending.count - 96000) }     // nobody is draining: keep two seconds
        os_unfair_lock_unlock(&lock)
    }

    /// Main thread: everything that arrived since the last call.
    func drain() -> [Float] {
        os_unfair_lock_lock(&lock); defer { os_unfair_lock_unlock(&lock) }
        let out = pending; pending.removeAll(keepingCapacity: true); return out
    }
}
