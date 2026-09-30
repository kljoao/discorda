using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using ApplicationLoopback.NET;

// Stdout for capture commands is exclusively float32 stereo PCM at 48 kHz.
if (args.Length == 1 && args[0] == "status") { Console.Write(JsonSerializer.Serialize(new AudioStatus(OperatingSystem.IsWindowsVersionAtLeast(10,0,20348), Environment.OSVersion.Version.ToString()), AudioJson.Default.AudioStatus)); return 0; }
if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 20348)) { Console.Error.WriteLine("UNSUPPORTED_WINDOWS"); return 2; }
if ((args.Length == 2 || (args.Length == 3 && args[2] == "no-browsers")) && args[0] == "system" && int.TryParse(args[1],out var owner) && owner > 0) return await SystemAudio.Run(owner, args.Length==3);
static bool Blocked(string name) => name.StartsWith("discord", StringComparison.OrdinalIgnoreCase) ||
    new[] { "electron", "explorer", "cmd", "powershell", "pwsh", "windowsterminal", "conhost", "node", "dotnet" }.Contains(name.ToLowerInvariant());
static AudioApplication? Describe(Process process)
{
    try
    {
        if (process.MainWindowHandle == IntPtr.Zero || string.IsNullOrWhiteSpace(process.MainWindowTitle) || Blocked(process.ProcessName)) return null;
        return new AudioApplication($"{process.Id}:{process.StartTime.ToUniversalTime().Ticks}", process.ProcessName, process.MainWindowTitle,
            process.MainWindowHandle.ToInt64().ToString());
    }
    catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException or NotSupportedException) { return null; }
}
if (args.Length == 1 && args[0] == "list")
{
    var list = new List<AudioApplication>();
    foreach (var process in Process.GetProcesses()) using (process) { var entry = Describe(process); if (entry is not null) list.Add(entry); }
    Console.Write(JsonSerializer.Serialize(list, AudioJson.Default.ListAudioApplication)); return 0;
}
if (args.Length != 2 || args[0] != "capture") return 2;
var identity = args[1].Split(':');
if (identity.Length != 2 || !int.TryParse(identity[0], out var pid) || !long.TryParse(identity[1], out var startTime)) return 2;
try
{
    using var process = Process.GetProcessById(pid);
    if (Describe(process) is null || process.StartTime.ToUniversalTime().Ticks != startTime || Blocked(process.ProcessName)) return 3;
    var output = Console.OpenStandardOutput();
    var stopped = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var capture = new ApplicationLoopbackCapture(2, 48000);
    capture.NewDataAvailable += data => { try { lock (output) output.Write(MemoryMarshal.AsBytes(data)); } catch (IOException) { stopped.TrySetResult(); } };
    capture.StartCapture((uint)pid, CaptureMode.IncludeProcessTree);
    Console.Error.WriteLine("READY");
    _ = Task.Run(async () => { await Console.In.ReadLineAsync(); stopped.TrySetResult(); });
    while (!stopped.Task.IsCompleted && !process.HasExited) await Task.WhenAny(stopped.Task, Task.Delay(250));
    await capture.StopCapture().WaitAsync(TimeSpan.FromSeconds(3));
    capture.Dispose();
    return 0;
}
catch (Exception) { Console.Error.WriteLine("CAPTURE_FAILED"); return 1; }

internal sealed record AudioStatus(bool supported, string os);
internal sealed record AudioApplication(string id, string name, string title, string windowId);
[System.Text.Json.Serialization.JsonSerializable(typeof(AudioStatus))]
[System.Text.Json.Serialization.JsonSerializable(typeof(List<AudioApplication>))]
internal partial class AudioJson : System.Text.Json.Serialization.JsonSerializerContext;
