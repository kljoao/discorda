using System.Diagnostics;
using System.Runtime.InteropServices;

internal static class PushToTalk
{
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    // Poll only the selected function key. Never capture text or persist keyboard data.
    public static async Task<int> Run(int owner, int key)
    {
        if (key is < 112 or > 123) return 2;
        try {
            using var parent = Process.GetProcessById(owner);
            var done = Task.Run(async () => await Console.In.ReadLineAsync());
            while (!parent.HasExited && !done.IsCompleted) {
                Console.WriteLine((GetAsyncKeyState(key) & 0x8000) != 0 ? "1" : "0");
                await Task.WhenAny(done, Task.Delay(80));
            }
            return 0;
        } catch (Exception) { return 1; }
    }
}
