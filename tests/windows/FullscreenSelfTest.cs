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
        for (int state = 1; state <= 7; state++) {
            if (FullscreenState.DeferNotifications(0, state, false, false) != (state != 5)) throw new Exception("Wrong notification policy"); passed++;
        }
        if (!FullscreenState.DeferNotifications(0, 5, true, false) || !FullscreenState.DeferNotifications(0, 5, false, true) || !FullscreenState.DeferNotifications(-1, 5, false, false)) throw new Exception("Games, fullscreen and unknown must remain quiet");
        passed += 3;
        Console.WriteLine(passed + " native fullscreen classifier checks passed");
    }
}
