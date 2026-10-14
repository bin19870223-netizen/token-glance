using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

// Reads only handles supplied by the isolated Electron test. No titles, pixels
// or process information from other applications are returned.
class WindowOrder {
    [DllImport("user32.dll")] static extern IntPtr GetTopWindow(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
    static void Main(string[] args) {
        var requested = new HashSet<long>();
        foreach (var value in args) requested.Add(long.Parse(value));
        var order = new List<string>();
        var styles = new List<string>();
        foreach (long handle in requested) styles.Add("\"" + handle + "\":" + GetWindowLongPtr(new IntPtr(handle), -20).ToInt64());
        var seen = new HashSet<long>();
        for (var window = GetTopWindow(IntPtr.Zero); window != IntPtr.Zero; window = GetWindow(window, 2)) {
            long handle = window.ToInt64();
            if (!seen.Add(handle)) break;
            if (requested.Contains(handle)) order.Add("\"" + handle + "\"");
        }
        Console.WriteLine("{\"foreground\":\"" + GetForegroundWindow().ToInt64() + "\",\"styles\":{" + string.Join(",",styles) + "},\"order\":[" + string.Join(",", order) + "]}");
    }
}
