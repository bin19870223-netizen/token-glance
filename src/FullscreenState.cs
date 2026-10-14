using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

// Query Windows' exclusive Direct3D state, without inspecting game processes
// or treating maximized/borderless windows as exclusive fullscreen.
internal static class FullscreenState {
    [DllImport("shell32.dll")] private static extern int SHQueryUserNotificationState(out int state);
    [DllImport("user32.dll")] private static extern IntPtr GetTopWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out int value, int size);
    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    private static volatile bool stopped;
    private static long[] handles = new long[0];
    internal static string Classify(int result, int state) { return result < 0 ? "unknown" : state == 3 ? "exclusive" : "desktop"; }
    private static bool Covered(long[] windows) {
        foreach (long handle in windows) {
            IntPtr target = new IntPtr(handle); Rect area; uint owner;
            if (!IsWindowVisible(target) || IsIconic(target) || !GetWindowRect(target, out area)) continue;
            GetWindowThreadProcessId(target, out owner);
            var seen = new HashSet<long>();
            for (IntPtr other = GetTopWindow(IntPtr.Zero); other != IntPtr.Zero && other != target; other = GetWindow(other, 2)) {
                if (!seen.Add(other.ToInt64())) break;
                uint pid; GetWindowThreadProcessId(other, out pid);
                if (pid == owner || !IsWindowVisible(other) || IsIconic(other)) continue;
                int cloaked;
                if (DwmGetWindowAttribute(other, 14, out cloaked, sizeof(int)) >= 0 && cloaked != 0) continue;
                Rect rect;
                if (GetWindowRect(other, out rect) && rect.Left < area.Right && rect.Right > area.Left && rect.Top < area.Bottom && rect.Bottom > area.Top) return true;
            }
        }
        return false;
    }
    private static void Main() {
        var input = new Thread(delegate() {
            string line;
            while ((line = Console.In.ReadLine()) != null) {
                if (!line.StartsWith("windows:")) continue;
                var next = new List<long>();
                foreach (string value in line.Substring(8).Split(',')) { long handle; if (long.TryParse(value, out handle) && handle > 0 && next.Count < 2) next.Add(handle); }
                Interlocked.Exchange(ref handles, next.ToArray());
            }
            stopped = true;
        });
        input.IsBackground = true; input.Start();
        string previous = null;
        while (!stopped) {
            int state;
            int result = SHQueryUserNotificationState(out state);
            string current = Classify(result, state);
            if (current != previous) { Console.WriteLine(current); Console.Out.Flush(); previous = current; }
            if (current == "desktop" && Covered(Interlocked.CompareExchange(ref handles, null, null))) { Console.WriteLine("restore"); Console.Out.Flush(); }
            Thread.Sleep(250);
        }
    }
}
