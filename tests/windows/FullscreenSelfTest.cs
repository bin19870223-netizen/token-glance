using System;
internal static class FullscreenSelfTest {
    private static void Main() {
        int passed = 0;
        for (int state = 1; state <= 7; state++) {
            string expected = state == 3 ? "exclusive" : "desktop";
            if (FullscreenState.Classify(0, state) != expected) throw new Exception("Wrong classification for state " + state);
            passed++;
        }
        if (FullscreenState.Classify(unchecked((int)0x80004005), 3) != "unknown") throw new Exception("Failed queries must remain unknown");
        passed++;
        Console.WriteLine(passed + " native fullscreen classifier checks passed");
    }
}
