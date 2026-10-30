package dev.hy300.helper;

import android.content.ClipData;
import android.os.IBinder;
import android.os.SystemClock;
import android.util.Base64;
import android.view.InputDevice;
import android.view.InputEvent;
import android.view.KeyEvent;
import java.lang.reflect.Method;

/**
 * Types text into the focused field by pasting it, then clears the clipboard. Used instead of `input text`
 * because the HY300 firmware turns KEYCODE_A into its "voice remote" pop-up, and `input text` can't send accents.
 * Arg: the text, base64 (UTF-8).
 */
public class Paste {
  public static void main(String[] args) throws Exception {
    String text = new String(Base64.decode(args[0], Base64.DEFAULT), "UTF-8");
    IBinder binder = (IBinder) Class.forName("android.os.ServiceManager").getMethod("getService", String.class).invoke(null, "clipboard");
    Object clipboard = Class.forName("android.content.IClipboard$Stub").getMethod("asInterface", IBinder.class).invoke(null, binder);
    Method setClip = clipboard.getClass().getMethod("setPrimaryClip", ClipData.class, String.class); // Android 11 signature
    Object im = Class.forName("android.hardware.input.InputManager").getMethod("getInstance").invoke(null);
    Method inject = im.getClass().getMethod("injectInputEvent", InputEvent.class, int.class);

    setClip.invoke(clipboard, ClipData.newPlainText("", text), "com.android.shell");
    boolean ok = true;
    long t = SystemClock.uptimeMillis();
    for (int action : new int[] {KeyEvent.ACTION_DOWN, KeyEvent.ACTION_UP}) {
      KeyEvent e = new KeyEvent(t, t, action, KeyEvent.KEYCODE_PASTE, 0, 0, -1, 0, 0, InputDevice.SOURCE_KEYBOARD);
      ok &= (Boolean) inject.invoke(im, e, 2); // 2 = wait until the app handled it
    }
    Thread.sleep(500); // WebViews read the clipboard asynchronously
    setClip.invoke(clipboard, ClipData.newPlainText("", ""), "com.android.shell"); // don't leave passwords behind
    System.exit(ok ? 0 : 1);
  }
}
