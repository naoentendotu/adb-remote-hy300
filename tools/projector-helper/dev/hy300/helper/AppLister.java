package dev.hy300.helper;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.os.Looper;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.util.HashSet;
import java.util.Set;

/**
 * Runs on the projector via `app_process` (as the ADB shell user) and prints one line per launchable app:
 * package \t label \t base64 PNG icon. Shell has no command that exposes labels or icons, PackageManager does.
 */
public class AppLister {
  private static final int SIZE = 128;

  public static void main(String[] args) throws Exception {
    Looper.prepareMainLooper();
    Class<?> at = Class.forName("android.app.ActivityThread");
    Object thread = at.getMethod("systemMain").invoke(null);
    PackageManager pm = ((Context) at.getMethod("getSystemContext").invoke(thread)).getPackageManager();
    Set<String> seen = new HashSet<>();
    for (String cat : new String[] {Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER}) {
      for (ResolveInfo r : pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(cat), 0)) {
        ApplicationInfo ai = r.activityInfo.applicationInfo;
        if (!seen.add(ai.packageName)) continue;
        Drawable d = ai.loadIcon(pm);
        Bitmap b = Bitmap.createBitmap(SIZE, SIZE, Bitmap.Config.ARGB_8888);
        d.setBounds(0, 0, SIZE, SIZE);
        d.draw(new Canvas(b));
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.PNG, 100, png);
        String label = ai.loadLabel(pm).toString().replaceAll("\\s+", " ").trim();
        System.out.println(ai.packageName + "\t" + label + "\t" + Base64.encodeToString(png.toByteArray(), Base64.NO_WRAP));
      }
    }
    System.exit(0); // systemMain leaves non-daemon threads behind
  }
}
