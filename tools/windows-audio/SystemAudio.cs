using System.Diagnostics;
using System.Runtime.InteropServices;
using ApplicationLoopback.NET;
using NAudio.CoreAudioApi;

internal static class ProcessMap
{
    internal sealed record Entry(int Id, int Parent, string Name);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct ProcessEntry
    {
        public uint Size, Usage, Id; public IntPtr Heap; public uint Module, Threads, Parent; public int Priority; public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string Name;
    }
    [DllImport("kernel32.dll")] private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern bool Process32FirstW(IntPtr snapshot, ref ProcessEntry entry);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern bool Process32NextW(IntPtr snapshot, ref ProcessEntry entry);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
    internal static Dictionary<int, Entry> Read()
    {
        var result = new Dictionary<int, Entry>();
        var handle = CreateToolhelp32Snapshot(2, 0);
        if (handle == new IntPtr(-1)) throw new InvalidOperationException("Process discovery unavailable");
        try
        {
            var entry = new ProcessEntry { Size = (uint)Marshal.SizeOf<ProcessEntry>() };
            if (!Process32FirstW(handle, ref entry)) throw new InvalidOperationException("Process discovery unavailable");
            do { result[(int)entry.Id] = new((int)entry.Id, (int)entry.Parent, entry.Name); } while (Process32NextW(handle, ref entry));
        }
        finally { CloseHandle(handle); }
        return result;
    }
    internal static bool Descendant(int pid, int ancestor, Dictionary<int, Entry> map)
    {
        var visited = new HashSet<int>();
        while (pid > 0 && visited.Add(pid)) { if (pid == ancestor) return true; if (!map.TryGetValue(pid, out var p)) break; pid = p.Parent; }
        return false;
    }
    internal static HashSet<int> Allowed(IEnumerable<int> sessions, Dictionary<int, Entry> map, int own, bool excludeBrowsers=false)
    {
        var excluded = map.Values.Where(p => p.Id == own || p.Name.StartsWith("discord", StringComparison.OrdinalIgnoreCase) || (excludeBrowsers && new[]{"chrome.exe","msedge.exe","firefox.exe","brave.exe","opera.exe","vivaldi.exe"}.Contains(p.Name.ToLowerInvariant()))).Select(p => p.Id).ToHashSet();
        // Both descendants and ancestors are excluded: capture includes the selected process tree.
        var safe = sessions.Where(pid => pid > 0 && map.ContainsKey(pid) && !excluded.Any(e => Descendant(pid,e,map) || Descendant(e,pid,map))).ToHashSet();
        return safe.Where(pid => !safe.Any(parent => parent != pid && Descendant(pid,parent,map))).ToHashSet();
    }
}

internal sealed class AudioInput : IAsyncDisposable
{
    private readonly ApplicationLoopbackCapture capture = new(2, 48000);
    private readonly float[] ring = new float[38400];
    private int read, count;
    private bool disposed;
    internal long Started { get; }
    internal AudioInput(int pid)
    {
        using var process = Process.GetProcessById(pid);
        Started = process.StartTime.ToUniversalTime().Ticks;
        capture.NewDataAvailable += samples => { lock(ring) { if(disposed)return; foreach(var sample in samples) { if(count==ring.Length){read=(read+2)%ring.Length;count-=2;} ring[(read+count)%ring.Length]=sample;count++; } } };
        try { capture.StartCapture((uint)pid, CaptureMode.IncludeProcessTree); }
        catch { capture.Dispose();throw; }
    }
    internal void Mix(float[] output)
    {
        lock(ring) { for(var i=0;i<output.Length && count>0;i++){output[i]+=ring[read];read=(read+1)%ring.Length;count--;} }
    }
    public async ValueTask DisposeAsync()
    {
        lock(ring){if(disposed)return;disposed=true;count=0;}
        try { await capture.StopCapture().WaitAsync(TimeSpan.FromSeconds(3)); } catch { }
        capture.Dispose();
    }
}

internal static class SystemAudio
{
    internal static HashSet<int> Sessions()
    {
        var ids = new HashSet<int>();
        using var enumerator = new MMDeviceEnumerator();
        foreach (var device in enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
        using (device)
        {
            var sessions = device.AudioSessionManager.Sessions;
            for(var i=0;i<sessions.Count;i++) using(var session=sessions[i]) { var pid=(int)session.GetProcessID; if(pid>0)ids.Add(pid); }
        }
        return ids;
    }
    internal static async Task<int> Run(int own, bool excludeBrowsers=false)
    {
        var inputs = new Dictionary<int, AudioInput>();
        using var cancellation = new CancellationTokenSource();
        var output=Console.OpenStandardOutput();
        async Task Discover()
        {
            while(!cancellation.IsCancellationRequested)
            {
                try
                {
                    var allowed=ProcessMap.Allowed(Sessions(),ProcessMap.Read(),own,excludeBrowsers);
                    List<AudioInput> removed=[];
                    lock(inputs) foreach(var pid in inputs.Keys.ToArray())
                    {
                        var same=false;
                        try { using var p=Process.GetProcessById(pid);same=p.StartTime.ToUniversalTime().Ticks==inputs[pid].Started; } catch(ArgumentException) { }
                        if(!allowed.Contains(pid)||!same){removed.Add(inputs[pid]);inputs.Remove(pid);}
                    }
                    foreach(var input in removed)await input.DisposeAsync();
                    foreach(var pid in allowed)
                    {
                        lock(inputs) if(inputs.ContainsKey(pid))continue;
                        try { var input=new AudioInput(pid);lock(inputs)inputs[pid]=input; }
                        catch(Exception) { Console.Error.WriteLine("SOURCE_UNAVAILABLE"); }
                    }
                }
                catch(Exception)
                {
                    // Discovery failure must never turn into unfiltered system loopback.
                    List<AudioInput> removed;lock(inputs){removed=inputs.Values.ToList();inputs.Clear();}
                    foreach(var input in removed)await input.DisposeAsync();
                    Console.Error.WriteLine("DISCOVERY_UNAVAILABLE");
                }
                try { await Task.Delay(750,cancellation.Token); } catch(OperationCanceledException){break;}
            }
        }
        // Discovery runs separately so COM enumeration cannot interrupt the PCM clock.
        var discovery=Task.Run(Discover);
        _=Task.Run(async()=>{await Console.In.ReadLineAsync();cancellation.Cancel();});
        Console.Error.WriteLine("READY");
        try
        {
            using var timer=new PeriodicTimer(TimeSpan.FromMilliseconds(20));
            var mix=new float[1920];
            while(await timer.WaitForNextTickAsync(cancellation.Token))
            {
                Array.Clear(mix);
                lock(inputs)foreach(var input in inputs.Values)input.Mix(mix);
                for(var i=0;i<mix.Length;i++)mix[i]=Math.Clamp(mix[i],-1,1);
                output.Write(MemoryMarshal.AsBytes(mix.AsSpan()));
            }
        }
        catch(OperationCanceledException){ }
        catch(IOException){cancellation.Cancel();}
        finally
        {
            cancellation.Cancel();await discovery;
            foreach(var input in inputs.Values)await input.DisposeAsync();
        }
        return 0;
    }
}
