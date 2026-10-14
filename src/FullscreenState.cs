using System;
using System.Runtime.InteropServices;
using System.Threading;

// Query Windows' exclusive Direct3D state, without inspecting game processes
// or treating maximized/borderless windows as exclusive fullscreen.
internal static class FullscreenState {
    [DllImport("shell32.dll")] private static extern int SHQueryUserNotificationState(out int state);
    private static volatile bool stopped;
    internal static string Classify(int result, int state) { return result < 0 ? "unknown" : state == 3 ? "exclusive" : "desktop"; }
    private static void Main() {
        var input = new Thread(delegate() { Console.In.ReadToEnd(); stopped = true; });
        input.IsBackground = true; input.Start();
        string previous = null;
        while (!stopped) {
            int state;
            int result = SHQueryUserNotificationState(out state);
            string current = Classify(result, state);
            if (current != previous) { Console.WriteLine(current); Console.Out.Flush(); previous = current; }
            Thread.Sleep(250);
        }
    }
}
